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
import type { ModeMetadata } from './types/operational-mode.type';

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
      let contentText = msg.content;

      // Append tool results to the text content if they exist
      if (msg.metadata && msg.metadata.toolCalls && Array.isArray(msg.metadata.toolCalls)) {
        // Debug logging
        this.logger.debug('[DEBUG] Found metadata.toolCalls: ' + JSON.stringify(msg.metadata.toolCalls, null, 2));

        const toolResults = msg.metadata.toolCalls
          .filter((toolCall: any) => toolCall.output)
          .map((toolCall: any) => {
            this.logger.debug(`[DEBUG] Processing toolCall: ${toolCall.toolName} has output: ${!!toolCall.output}`);
            if (toolCall.toolName === 'tavily_web_search' && toolCall.output) {
              const output = toolCall.output;
              this.logger.debug('[DEBUG] Output structure: ' + Object.keys(output).join(', '));
              // Include the summary and results in the text content
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
            }
            return '';
          })
          .filter(Boolean)
          .join('\n');

        if (toolResults) {
          this.logger.debug(`[DEBUG] Adding tool results to content, length: ${toolResults.length}`);
          contentText += toolResults;
        } else {
          this.logger.debug('[DEBUG] No tool results to add');
        }
      }

      uiMessages.push({
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        parts: [{ type: 'text', text: contentText }],
      });
    });

    return uiMessages;
  }

  // Extract text content from UIMessage parts
  private extractTextFromUIMessage(message: UIMessage): string {
    return message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
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
    });

    return this.messageRepository.save(dbMessage);
  }

  // Save the assistant's response after streaming completes
  async saveAssistantResponse(
    conversationId: string,
    responseMessage: UIMessage,
  ): Promise<void> {
    const content = this.extractTextFromUIMessage(responseMessage);

    // EXTRACT TOOL CALL DATA FROM MESSAGE PARTS
    const toolCalls: any[] = [];

    responseMessage.parts.forEach((part) => {
      // Check for tool call parts
      if (part.type?.startsWith('tool-') || part.type === 'dynamic-tool') {
        toolCalls.push({
          type: part.type,
          toolName: (part as any).toolName || part.type.replace('tool-', ''),
          state: (part as any).state,
          output: (part as any).output,
          errorText: (part as any).errorText,
        });
      }
    });

    // Create message with metadata
    const dbMessage = this.messageRepository.create({
      conversationId,
      role: responseMessage.role as MessageRole,
      content,
      metadata: toolCalls.length > 0 ? { toolCalls } : undefined,
    });

    await this.messageRepository.save(dbMessage);

    // Update conversation timestamp
    await this.conversationRepository.update(conversationId, {
      updatedAt: new Date(),
    });
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
      const user = conversation.user;

      if (!user) {
        throw new InternalServerErrorException('User not found');
      }

      // Get the last user message
      const lastUserMessage = messages[messages.length - 1];
      if (!lastUserMessage) {
        throw new InternalServerErrorException('No user message provided');
      }

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
        conversation,
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

      // Get StreamText result with MODE-AWARE streaming
      const result = this.aiService.streamResponseWithMode(
        historyMessages,
        effective,
        conversation.systemPrompt,
        tools,
        5 // Max 5 tool call iterations
      );

      // Return streaming response with tool support
      return result.toUIMessageStreamResponse({
        originalMessages: messages,
        generateMessageId: () => this.generateMessageId(),

        // Save assistant's response with mode metadata
        onFinish: async ({ responseMessage }) => {
          await this.saveAssistantResponseWithMode(
            conversationId,
            responseMessage,
            {
              requested,
              effective,
              modelUsed: modeConfig.model,
              tokensUsed: undefined, // Token usage tracking not available yet
              temperature: modeConfig.temperature,
            },
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
      operationalMode: updated.operationalMode,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  }

  // Update conversation operational mode
  async updateConversationMode(
    conversationId: string,
    userId: string,
    mode: OperationalMode,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.verifyOwnership(conversationId, userId);

    conversation.operationalMode = mode;
    const updated = await this.conversationRepository.save(conversation);

    return new ConversationResponseDto({
      id: updated.id,
      title: updated.title,
      systemPrompt: updated.systemPrompt,
      operationalMode: updated.operationalMode,
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
            content: lastMessage.content.substring(0, 100),
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
      operationalMode: conversation.operationalMode,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map(
        (msg) =>
          new MessageResponseDto({
            id: msg.id,
            role: msg.role,
            content: msg.content,
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
    modeMetadata: ModeMetadata,
  ): Promise<void> {
    const content = this.extractTextFromUIMessage(responseMessage);

    // EXTRACT TOOL CALL DATA FROM MESSAGE PARTS
    const toolCalls: any[] = [];

    responseMessage.parts.forEach((part) => {
      // Check for tool call parts
      if (part.type?.startsWith('tool-') || part.type === 'dynamic-tool') {
        toolCalls.push({
          type: part.type,
          toolName: (part as any).toolName || part.type.replace('tool-', ''),
          state: (part as any).state,
          output: (part as any).output,
          errorText: (part as any).errorText,
        });
      }
    });

    // Create message with mode metadata
    const dbMessage = this.messageRepository.create({
      conversationId,
      role: responseMessage.role as MessageRole,
      content,
      metadata: {
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        mode: modeMetadata,  // Add mode metadata
      },
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
        operationalMode: dto.operationalMode,
      });

      const savedConversation = await this.conversationRepository.save(conversation);

      // 2. Create and save user message
      const userMessage = this.messageRepository.create({
        conversationId: savedConversation.id,
        role: MessageRole.USER,
        content: dto.firstMessage,
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
        operationalMode: savedConversation.operationalMode,
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