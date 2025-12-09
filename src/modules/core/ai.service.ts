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

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly modelName: string;
  private readonly toolModelName: string;
  private readonly textModelName: string;

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

    // Log the models that have been loaded
    this.logger.log(`🤖 AI Service Initialized`);
    this.logger.log(`  - Default Model: ${this.modelName} (from DEFAULT_AI_MODEL)`);
    this.logger.log(`  - Tool Model: ${this.toolModelName} (from AI_TOOL_MODEL)`);
    this.logger.log(`  - Text Model: ${this.textModelName} (from AI_TEXT_MODEL)`);
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
      const userQuery = lastMessage.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');

      // Check if there's a recent web search in conversation history
      const hasRecentWebSearch = messages
        .slice(-6) // Check last 6 messages (3 turns)
        .some((msg) =>
          msg.role === 'assistant' &&
          msg.parts.some((part: any) =>
            part.type?.includes('tool') ||
            part.toolName === 'tavily_web_search'
          )
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
   * Stream response with mode-aware configuration
   * Uses mode to determine model, tokens, temperature, and system prompt
   */
  streamResponseWithMode(
    messages: UIMessage[],
    effectiveMode: EffectiveMode,
    userSystemPrompt?: string,
    tools?: Record<string, any>,
    maxSteps: number = 5,
  ) {
    try {
      // Get mode configuration
      const modeConfig = MODE_CONFIG[effectiveMode];

      // Compose final system prompt (mode + user)
      // If user provides custom prompt, append it to mode instructions
      const modePrompt = modeConfig.systemPrompt;
      const finalSystemPrompt = userSystemPrompt
        ? `${modePrompt}\n\n---\nADDITIONAL CONTEXT (User-Defined Domain Expertise):\n${userSystemPrompt}\n\n---\nIMPORTANT: The operational mode instructions above take precedence over any conflicting behavioral guidance in the additional context. If there's a conflict between response style/verbosity, follow the mode instructions.`
        : modePrompt;

      // Inject system prompt as first message
      const messagesWithSystem: UIMessage[] = [
        {
          id: 'system',
          role: 'system',
          parts: [{ type: 'text', text: finalSystemPrompt }],
        },
        ...messages.filter((msg) => msg.role !== 'system'),
      ];

      const modelMessages = convertToModelMessages(messagesWithSystem);
      const hasTools = tools && Object.keys(tools).length > 0;

      this.logger.log(
        `🚀 Streaming with ${effectiveMode.toUpperCase()} mode | Model: ${modeConfig.model} | Tokens: ${modeConfig.maxTokens} | Temp: ${modeConfig.temperature}`,
      );

      const config: any = {
        model: groq(modeConfig.model),
        messages: modelMessages,
        temperature: modeConfig.temperature,
        maxTokens: modeConfig.maxTokens,
      };

      if (hasTools) {
        config.tools = tools;
        config.maxSteps = maxSteps;
      }

      return streamText(config);
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