import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message, MessageRole } from './entities/message.entity';
import {
  ConversationResponseDto,
  MessageResponseDto,
} from './dto/conversation-response.dto';
import { AIService } from '../core/ai.service';
import { UIMessage } from 'ai';
import { CreateConversationWithMessageDto } from './dto/create-conversation-with-message.dto';
import { ToolRegistry } from './tools/tool.registry';
import { ModeResolverService } from './modes/mode-resolver.service';
import { MODE_CONFIG } from './modes/mode.config';
import type { OperationalMode } from './modes/mode.config';
import type { MessageMetadata, ToolCallMetadata } from './types/message-metadata.type';
import { MessageUtils } from './utils/message.utils';
import { MAX_TOOL_ITERATIONS, CONTENT_PREVIEW_LENGTH } from './constants/chat.constants';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    private aiService: AIService,
    private toolRegistry: ToolRegistry,
    private modeResolver: ModeResolverService,
  ) { }

  // Convert database messages to UIMessage format for AI SDK
  private async getUIMessages(conversationId: string): Promise<UIMessage[]> {
    // Single query with relation and ordering
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ['messages'],
      order: {
        messages: {
          createdAt: 'ASC',
        },
      },
    });

    const uiMessages: UIMessage[] = [];

    // Return empty if conversation not found
    if (!conversation) {
      return uiMessages;
    }

    // Prepend system prompt if exists
    if (conversation.systemPrompt) {
      uiMessages.push({
        id: 'system',
        role: 'system',
        parts: [{ type: 'text', text: conversation.systemPrompt }],
      });
    }

    // Add messages with tool results included in text
    conversation.messages.forEach((msg) => {
      // 1. Prefer the native 'parts' array if it exists (Multi-modal support)
      if (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0) {
        uiMessages.push({
          id: msg.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          parts: msg.parts as any, // Cast for UI compatibility
        });
        return;
      }

      // 2. Fallback to legacy content processing (Text-only)
      let contentText = msg.content;

      // Append tool results to the text content if they exist
      if (msg.metadata && msg.metadata.toolCalls && Array.isArray(msg.metadata.toolCalls)) {
        // Debug logging
        this.logger.debug('[DEBUG] Found metadata.toolCalls: ' + JSON.stringify(msg.metadata.toolCalls, null, 2));

        const toolResults = msg.metadata.toolCalls
          // Filter for web search tools that have output
          .filter((toolCall: ToolCallMetadata) =>
            toolCall.toolName === 'tavily_web_search' && toolCall.output
          )
          .map((toolCall: ToolCallMetadata) => {
            // TypeScript knows output exists due to filter above
            const output = toolCall.output!;

            this.logger.debug('[DEBUG] Processing web search output');
            this.logger.debug('[DEBUG] Output structure: ' + Object.keys(output).join(', '));

            // Format web search results as text
            let toolText = '\n\n[Web Search Results]:\n';

            if (output.summary) {
              toolText += `Summary: ${output.summary}\n\n`;
            }

            if (output.results && Array.isArray(output.results)) {
              toolText += `Sources:\n`;
              output.results.forEach((result: any, index: number) => {
                toolText += `${index + 1}. ${result.title}\n   ${result.url}\n   ${result.content}\n\n`;
              });
            }

            this.logger.debug(`[DEBUG] Generated toolText length: ${toolText.length}`);
            return toolText;
          })
          .join('\n');

        if (toolResults) {
          this.logger.debug(`[DEBUG] Adding tool results to content, length: ${toolResults.length}`);
          contentText += toolResults;
        } else {
          this.logger.debug('[DEBUG] No web search results to add');
        }
      }

      uiMessages.push({
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        parts: [{ type: 'text', text: contentText || '' }],
      });
    });

    return uiMessages;
  }

  // Extract text content from UIMessage parts
  private extractTextFromUIMessage(message: UIMessage): string {
    return MessageUtils.extractText(message);
  }

  // Save UIMessage to database
  private async saveUIMessage(
    conversationId: string,
    message: UIMessage,
  ): Promise<Message> {
    const content = this.extractTextFromUIMessage(message);

    const dbMessage = this.messageRepository.create({
      conversationId,
      role: message.role as MessageRole,
      content,
      parts: message.parts as any, // Cast for compatibility between UIMessagePart and MessagePart
    });

    return this.messageRepository.save(dbMessage);
  }



  // Complete streaming flow with proper error handling and transaction safety
  async handleStreamingResponse(
    conversationId: string,
    userId: string,
    messages: UIMessage[],
    modeOverride?: OperationalMode,
  ) {
    try {
      // Verify ownership and load user for mode resolution
      const conversation = await this.verifyOwnershipWithOrderedMessages(conversationId, userId);

      // Get the last user message
      const inputMessage = messages[messages.length - 1];
      if (!inputMessage) {
        throw new InternalServerErrorException('No user message provided');
      }

      // Normalize message to ensure it complies with AI SDK (requires parts)
      const lastUserMessage = MessageUtils.normalize(inputMessage);

      // Get conversation history
      const historyMessages = await this.getUIMessages(conversationId);

      // Check for duplicate message
      const lastUserMessageText = this.extractTextFromUIMessage(lastUserMessage);
      const lastHistoryMessage = historyMessages[historyMessages.length - 1];
      const isDuplicate =
        lastHistoryMessage &&
        lastHistoryMessage.role === 'user' &&
        this.extractTextFromUIMessage(lastHistoryMessage) === lastUserMessageText;

      // Save user message if not duplicate
      if (!isDuplicate) {
        await this.saveUIMessage(conversationId, lastUserMessage);
        historyMessages.push(lastUserMessage);
      }

      // === MODE RESOLUTION ===
      const { requested, effective } = await this.modeResolver.resolveMode(
        historyMessages,
        modeOverride,
      );

      this.logger.log(
        `🎯 Mode resolved: ${requested}${requested === 'auto' ? ` → ${effective}` : ''} (conversation: ${conversationId})`,
      );

      // Analyze query intent to determine if tools are needed
      const needsTools = await this.aiService.analyzeQueryIntent(historyMessages);

      // Only get and pass tools if the query intent requires them
      const tools = needsTools ? this.toolRegistry.toAISDKFormat() : undefined;

      // Get mode configuration for metadata
      const modeConfig = MODE_CONFIG[effective];

      // Convert messages to AI SDK format (parts → content) using centralized utility
      const formattedMessages = MessageUtils.toAISDKFormatAll(historyMessages);

      // Get StreamText result with MODE-AWARE streaming
      const { stream: result, modelUsed: actualModel, effectiveMode: actualEffectiveMode } = this.aiService.streamResponseWithMode(
        formattedMessages,
        effective,
        conversation.systemPrompt,
        tools,
        MAX_TOOL_ITERATIONS
      );

      // Re-fetch mode config based on the ACTUAL effective mode used (in case it switched to vision)
      const finalModeConfig = MODE_CONFIG[actualEffectiveMode];

      // Prepare metadata structure for streaming and database save
      const baseMetadata = {
        operationalMode: requested,
        effectiveMode: actualEffectiveMode,
        modelUsed: actualModel, // Use the actual model (Vision model if images present)
        temperature: finalModeConfig.temperature,
        tokensUsed: undefined, // Future: Extract from AI response
      };

      // Return streaming response with tool support
      return result.toUIMessageStreamResponse({
        originalMessages: messages,
        generateMessageId: () => this.generateMessageId(),

        // Stream metadata to frontend (enables immediate mode indicator & timestamp)
        messageMetadata: ({ part }) =>
          part.type === 'finish'
            ? {
              createdAt: new Date().toISOString(),
              ...baseMetadata,
              tokensUsed: part.totalUsage?.totalTokens,
              finishReason: part.finishReason,
            }
            : undefined,

        // Save assistant's response with complete metadata to database
        onFinish: async ({ responseMessage }) => {
          await this.saveAssistantResponseWithMode(
            conversationId,
            responseMessage,
            baseMetadata,
          );
        },
      });
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Chat streaming failed: ${error.message}`,
        { cause: error }
      );
    }
  }

  // Generate unique message ID
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Update system prompt
  async updateSystemPrompt(
    conversationId: string,
    userId: string,
    systemPrompt: string,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.verifyOwnership(conversationId, userId);

    conversation.systemPrompt = systemPrompt;
    const updated = await this.conversationRepository.save(conversation);

    return new ConversationResponseDto({
      id: updated.id,
      title: updated.title,
      systemPrompt: updated.systemPrompt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  }

  // Get all conversations for a user
  async getUserConversations(
    userId: string,
  ): Promise<ConversationResponseDto[]> {
    const conversations = await this.conversationRepository.find({
      where: { userId },
      order: {
        updatedAt: 'DESC',
      },
      relations: {
        messages: true,
      },
      // Order messages within each conversation
      relationLoadStrategy: 'query',  // Use separate query for better control
    });

    // Manually sort messages and get the actual last one
    return conversations.map((conv) => {
      // Sort messages by createdAt to ensure correct order
      const sortedMessages = [...conv.messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const lastMessage = sortedMessages.length > 0
        ? sortedMessages[sortedMessages.length - 1]
        : null;

      return new ConversationResponseDto({
        id: conv.id,
        title: conv.title,
        systemPrompt: conv.systemPrompt,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        lastMessage: lastMessage
          ? new MessageResponseDto({
            id: lastMessage.id,
            role: lastMessage.role,
            content: (lastMessage.content || '').substring(0, CONTENT_PREVIEW_LENGTH),
            createdAt: lastMessage.createdAt,
          })
          : undefined,
      });
    });
  }

  // Get single conversation with properly ordered messages
  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<ConversationResponseDto> {
    // Use the new method that includes ordering
    const conversation = await this.verifyOwnershipWithOrderedMessages(
      conversationId,
      userId
    );

    return new ConversationResponseDto({
      id: conversation.id,
      title: conversation.title,
      systemPrompt: conversation.systemPrompt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map(
        (msg) =>
          new MessageResponseDto({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            parts: msg.parts,
            createdAt: msg.createdAt,
            metadata: msg.metadata,
          }),
      ),
    });
  }

  // Delete conversation
  async deleteConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conversation = await this.verifyOwnership(conversationId, userId);
    await this.conversationRepository.remove(conversation);
  }

  // Verify conversation ownership (without messages)
  private async verifyOwnership(
    conversationId: string,
    userId: string
  ): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return conversation;
  }

  // Verify conversation ownership and load messages WITH ORDERING
  private async verifyOwnershipWithOrderedMessages(
    conversationId: string,
    userId: string,
  ): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ['messages'],
      order: {
        messages: {
          createdAt: 'ASC',
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied to this conversation');
    }

    return conversation;
  }

  // Save the assistant's response after streaming completes WITH MODE METADATA
  private async saveAssistantResponseWithMode(
    conversationId: string,
    responseMessage: UIMessage,
    messageMetadata: Pick<MessageMetadata, 'operationalMode' | 'effectiveMode' | 'modelUsed' | 'temperature' | 'tokensUsed'>,
  ): Promise<void> {
    const content = this.extractTextFromUIMessage(responseMessage);

    // EXTRACT TOOL CALL DATA FROM MESSAGE PARTS
    const toolCalls: ToolCallMetadata[] = [];

    responseMessage.parts.forEach((part) => {
      // Check for tool call parts
      if (part.type?.startsWith('tool-') || part.type === 'dynamic-tool') {
        toolCalls.push({
          type: part.type,
          toolName: (part as any).toolName || part.type.replace('tool-', ''),
          state: (part as any).state,
          output: (part as any).output,
          input: (part as any).input,
          toolCallId: (part as any).toolCallId,
        });
      }
    });

    // Create message with complete metadata (flat structure)
    const metadata: MessageMetadata = {
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      ...messageMetadata,
    };

    const dbMessage = this.messageRepository.create({
      conversationId,
      role: responseMessage.role as MessageRole,
      content,
      parts: responseMessage.parts as any, // Cast for compatibility between UIMessagePart and MessagePart
      metadata,
    });

    await this.messageRepository.save(dbMessage);

    // Update conversation timestamp
    await this.conversationRepository.update(conversationId, {
      updatedAt: new Date(),
    });
  }

  // Generate title for a conversation
  async generateTitle(
    conversationId: string,
    userId: string,
    userMessage: string,
  ): Promise<string> {
    // Verify ownership
    await this.verifyOwnership(conversationId, userId);

    // Generate title using AI (uses text model, not tool model)
    const messages: UIMessage[] = [
      {
        id: 'system',
        role: 'system',
        parts: [{
          type: 'text',
          text: 'Generate a short, concise title (max 6 words) for a conversation that starts with the following user message. Return ONLY the title, nothing else.'
        }]
      },
      {
        id: 'user',
        role: 'user',
        parts: [{
          type: 'text',
          text: userMessage
        }]
      }
    ];

    const title = await this.aiService.generateResponse(messages);
    const cleanTitle = title.trim().replace(/^["']|["']$/g, '');

    // Update conversation with the title
    await this.conversationRepository.update(conversationId, {
      title: cleanTitle,
    });

    return cleanTitle;
  }

  // Create conversation with first message (no streaming)
  async createConversationWithFirstMessage(
    userId: string,
    dto: CreateConversationWithMessageDto,
  ) {
    try {
      // 1. Create conversation
      const conversation = this.conversationRepository.create({
        userId,
        title: dto.title || 'Untitled',
        systemPrompt: dto.systemPrompt,
      });

      const savedConversation = await this.conversationRepository.save(conversation);

      // 2. Create and save user message
      // Construct parts: use provided parts or fallback to text part from firstMessage
      const parts = dto.parts || [{ type: 'text', text: dto.firstMessage }];

      const userMessage = this.messageRepository.create({
        conversationId: savedConversation.id,
        role: MessageRole.USER,
        content: dto.firstMessage,
        parts: parts as any, // Cast for compatibility
      });

      await this.messageRepository.save(userMessage);

      // 3. Update conversation timestamp
      await this.conversationRepository.update(savedConversation.id, {
        updatedAt: new Date(),
      });

      // 4. Return conversation data (the frontend will handle streaming on navigation)
      return {
        id: savedConversation.id,
        title: savedConversation.title,
        systemPrompt: savedConversation.systemPrompt,
        createdAt: savedConversation.createdAt,
        updatedAt: savedConversation.updatedAt,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to create conversation with message: ${error.message}`,
        { cause: error }
      );
    }
  }
}