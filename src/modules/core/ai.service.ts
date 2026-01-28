import {
  Injectable,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  streamText,
  generateText,
  convertToModelMessages,
  type UIMessage,
} from 'ai';
import { groq } from '@ai-sdk/groq';
import { MODE_CONFIG, type EffectiveMode } from '../chat/modes/mode.config';
import { MessageUtils } from '../chat/utils/message.utils';
import { WEB_SEARCH_HISTORY_DEPTH } from '../chat/constants/chat.constants';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly modelName: string;
  private readonly toolModelName: string;
  private readonly textModelName: string;
  private readonly visionModelName: string;

  constructor(
    private configService: ConfigService,
  ) {
    this.modelName =
      this.configService.get<string>('DEFAULT_AI_MODEL') ||
      'openai/gpt-oss-120b';

    this.toolModelName =
      this.configService.get<string>('AI_TOOL_MODEL') ||
      'llama-3.3-70b-versatile';

    this.textModelName =
      this.configService.get<string>('AI_TEXT_MODEL') ||
      'llama-3.1-8b-instant';

    this.visionModelName =
      this.configService.get<string>('AI_VISION_MODEL') ||
      'meta-llama/llama-4-scout-17b-16e-instruct'; // Llama 4 Scout vision model

    // Log the models that have been loaded
    this.logger.log(`🤖 AI Service Initialized`);
    this.logger.log(`  - Default Model: ${this.modelName} (from DEFAULT_AI_MODEL)`);
    this.logger.log(`  - Tool Model: ${this.toolModelName} (from AI_TOOL_MODEL)`);
    this.logger.log(`  - Text Model: ${this.textModelName} (from AI_TEXT_MODEL)`);
    this.logger.log(`  - Vision Model: ${this.visionModelName} (from AI_VISION_MODEL)`);
  }

  // Analyze if the query needs web search tools
  async analyzeQueryIntent(
    messages: UIMessage[],
  ): Promise<boolean> {
    try {
      // Get the last user message
      const lastMessage = messages
        .filter((msg) => msg.role === 'user')
        .pop();

      if (!lastMessage) {
        return false;
      }

      // Extract text from the last message
      const userQuery = MessageUtils.extractText(lastMessage);

      // Check if there's a recent web search in conversation history
      const hasRecentWebSearch = messages
        .slice(-WEB_SEARCH_HISTORY_DEPTH)
        .some((msg) =>
          msg.role === 'assistant' && MessageUtils.hasToolContent(msg, 'tavily_web_search')
        );

      // Create analysis prompt
      const analysisMessages: UIMessage[] = [
        {
          id: 'system',
          role: 'system',
          parts: [{
            type: 'text',
            text: `You are a query intent analyzer. Determine if a user query needs real-time web search.

Answer "YES" if the query:
- Asks for current/recent events, news, or statistics (e.g., "latest AI trends 2025", "today's weather")
- Requests real-time information (e.g., "current stock price", "recent developments")
- Needs up-to-date data that changes frequently

Answer "NO" if the query:
- Can be answered from general knowledge (e.g., "What is JavaScript?", "Explain OOP")
- Is a follow-up question to a previous search (context is already available)
- Asks about your capabilities (e.g., "How can you help me?")
- Is a general conversation or clarification

${hasRecentWebSearch ? '\nIMPORTANT: The conversation already has recent web search results. Unless the new query is asking for completely different real-time information, answer NO.' : ''}

Reply with ONLY "YES" or "NO".`
          }]
        },
        {
          id: 'user',
          role: 'user',
          parts: [{
            type: 'text',
            text: `Query: "${userQuery}"`
          }]
        }
      ];

      // Use fast text model for quick analysis
      const response = await this.generateResponse(analysisMessages);
      const needsWebSearch = response.trim().toUpperCase().includes('YES');

      this.logger.log(
        `🔍 Query intent analysis: "${userQuery.substring(0, 50)}..." → ${needsWebSearch ? 'NEEDS WEB SEARCH' : 'GENERAL KNOWLEDGE'}`
      );

      return needsWebSearch;
    } catch (error: any) {
      this.logger.error(`Query intent analysis failed: ${error.message}`);
      // On error, default to NOT using web search to avoid unnecessary calls
      return false;
    }
  }

  /**
   * Detect if messages contain images
   */
  private hasImageContent(messages: UIMessage[]): boolean {
    return messages.some(msg => {
      // Check parts (UI format)
      if (msg.parts?.some(part => (part as any).type === 'image' || !!(part as any).image)) {
        return true;
      }

      // Check content (AI SDK format)
      if ((msg as any).content && Array.isArray((msg as any).content)) {
        return (msg as any).content.some((part: any) =>
          part.type === 'image' || part.type === 'image_url' || !!part.image || !!part.image_url
        );
      }

      return false;
    });
  }

  /**
   * Stream response with mode-aware configuration
   * Uses mode to determine model, tokens, temperature, and system prompt
   */
  streamResponseWithMode(
    messages: UIMessage[],
    initialMode: EffectiveMode,
    userSystemPrompt?: string,
    tools?: Record<string, any>,
    maxSteps: number = 5,
  ): { stream: ReturnType<typeof streamText>, modelUsed: string, effectiveMode: EffectiveMode } {
    try {
      // 1. Detect if messages contain images & determine EFFECTIVE mode
      const hasImages = this.hasImageContent(messages);

      // Determine the ACTUAL effective mode
      // If images are present, force 'vision' mode to ensure correct model and prompting
      // Otherwise, keep the requested mode
      const effectiveMode: EffectiveMode = hasImages ? 'vision' : initialMode;

      if (hasImages) {
        this.logger.log(`🖼️  Images detected! Switching effective mode to: ${effectiveMode}`);
      }

      // 2. Get mode configuration
      const modeConfig = MODE_CONFIG[effectiveMode];

      // Use the model defined in the mode config
      // (Vision mode config will inherently point to the vision model)
      const modelToUse = modeConfig.model;

      // 3. Compose final system prompt
      const finalSystemPrompt = userSystemPrompt
        ? `${modeConfig.systemPrompt}\n\n---\nADDITIONAL CONTEXT (User-Defined Domain Expertise):\n${userSystemPrompt}\n\n---\nIMPORTANT: The operational mode instructions above take precedence over any conflicting behavioral guidance in the additional context. If there's a conflict between response style/verbosity, follow the mode instructions.`
        : modeConfig.systemPrompt;

      // 4. Transform messages for the AI Provider
      const messagesWithSystem: UIMessage[] = [
        {
          id: 'system-prompt',
          role: 'system',
          parts: [{ type: 'text', text: finalSystemPrompt }],
        },
        ...messages,
      ];

      // LIMIT IMAGES: Groq/Llama models typically support max 5 images.
      // We keep images only for the last 3 user messages to stay within limits.
      let imagesFound = 0;
      const MAX_IMAGES = 5;

      const formattedMessages = MessageUtils.toAISDKFormatAll(
        [...messagesWithSystem].reverse().map(msg => {
          if (msg.role !== 'user' || !msg.parts?.some((p: any) => p.type === 'image')) return msg;
          imagesFound++;
          if (imagesFound <= MAX_IMAGES) return msg;
          // Convert older images to text to save model context
          return { ...msg, parts: msg.parts.map((p: any) => p.type === 'image' ? { type: 'text', text: '[Previous Image Omitted]' } : p) };
        }).reverse()
      );

      // Convert to strict ModelMessage format (required by AI SDK)
      let modelMessages = convertToModelMessages(formattedMessages);

      // FIX: Restore image data for User messages (SDK's convertToModelMessages strips them)
      const originalUserMsgs = formattedMessages.filter(m => m.role === 'user');
      let userIdx = 0;
      
      modelMessages = modelMessages.map(msg => {
        if (msg.role !== 'user') return msg;
        const original = originalUserMsgs[userIdx++];
        if (!original?.parts?.some((p: any) => p.type === 'image')) return msg;

        return {
          ...msg,
          content: original.parts.map((p: any) => {
            if (p.type === 'image') return { type: 'image', image: p.image };
            if (p.type === 'text') return { type: 'text', text: p.text || '' };
            // Pass through other types (tool-call, tool-result, etc.)
            return p;
          }) as any
        };
      });

      // 5. Final AI Execution
      this.logger.log(`🚀 Streaming with ${effectiveMode.toUpperCase()} mode | Model: ${modelToUse}`);

      const config: any = {
        model: groq(modelToUse),
        messages: modelMessages,
        temperature: modeConfig.temperature,
        maxTokens: modeConfig.maxTokens,
      };

      if (tools && Object.keys(tools).length > 0) {
        config.tools = tools;
        config.maxSteps = maxSteps;
      }

      return {
        stream: streamText(config),
        modelUsed: modelToUse,
        effectiveMode,
      };
    } catch (error: any) {
      throw new InternalServerErrorException(
        `AI streaming with mode error: ${error.message}`,
        { cause: error },
      );
    }
  }

  // Stream response with tool support
  streamResponse(
    messages: UIMessage[],
    tools?: Record<string, any>,
    maxSteps: number = 5,
  ) {
    try {
      const modelMessages = convertToModelMessages(messages);

      // Check if tools are provided
      const hasTools = tools && Object.keys(tools).length > 0;

      // If we have tools, use the tool-calling model, If not, use the fast text model.
      const modelToUse = hasTools ? this.toolModelName : this.textModelName;

      this.logger.log(`Streaming with model: ${modelToUse}`);

      const config: any = {
        model: groq(modelToUse),
        messages: modelMessages,
        temperature: 0.7,
        maxTokens: 2000,
      };

      // Add tools if provided
      if (hasTools) {
        config.tools = tools;
        config.maxSteps = maxSteps;
      }

      return streamText(config);
    } catch (error: any) {
      throw new InternalServerErrorException(
        `AI streaming error: ${error.message}`,
        { cause: error },
      );
    }
  }

  // Generate non-streaming response
  async generateResponse(messages: UIMessage[]) {
    try {
      const modelMessages = convertToModelMessages(messages);

      // Use the fast, cheap text model for non-streaming tasks
      this.logger.log(`Generating response with model: ${this.textModelName}`);

      const result = await generateText({
        model: groq(this.textModelName),
        messages: modelMessages,
        temperature: 0.7,
        maxOutputTokens: 2000,
      });

      return result.text;
    } catch (error: any) {
      throw new InternalServerErrorException(
        `AI generation error: ${error.message}`,
        { cause: error },
      );
    }
  }
}