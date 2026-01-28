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
import { ConfigService } from '@nestjs/config';
import { MODE_CONFIG } from './modes/mode.config';
import * as fs from 'fs/promises';
import * as path from 'path';
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
    private configService: ConfigService,
  ) { }

  // Convert database messages to UIMessage format for AI SDK
  private async getUIMessages(conversationId: string, conversation?: Conversation): Promise<UIMessage[]> {
    // 1. Fetch messages
    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    // 2. Fetch all attachments for this conversation
    // Use the metadata to find the entity name to avoid circular dependency issues
    const rawAttachments = await this.messageRepository.manager.createQueryBuilder()
      .select('a')
      .from('attachments', 'a')
      .where('a.conversationId = :conversationId', { conversationId })
      .getRawMany();

    // Convert to a Map for O(1) lookup
    const attachmentMap = new Map<string, any>();
    rawAttachments.forEach(a => {
      // Handle potential prefixing from raw query result if using getRawMany
      const id = (a.id || a.a_id || '').toString();
      if (id) attachmentMap.set(id, a);
    });

    this.logger.debug(`[DEBUG] Pre-fetched ${attachmentMap.size} attachments for conversation ${conversationId}`);

    // 3. Prepend system prompt if exists
    const targetConversation = conversation || await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    const uiMessages: UIMessage[] = [];

    if (targetConversation?.systemPrompt) {
      uiMessages.push({
        id: 'system',
        role: 'system',
        parts: [{ type: 'text', text: targetConversation.systemPrompt }],
      });
    }

    // 4. Map messages to UIMessage format
    messages.forEach((msg) => {
      if (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0) {
        const processedParts = msg.parts.map((part: any) => {
          if (part.type === 'file' && part.attachmentId) {
            // O(1) Lookup using Map instead of O(N) .find()
            const attachment = attachmentMap.get(part.attachmentId.toString());
            
            // Map raw database columns (a_column_name) to attachment object properties if needed
            const normalizedAttachment = attachment ? {
              extractionStatus: attachment.extractionStatus || attachment.a_extractionStatus,
              extractedText: attachment.extractedText || attachment.a_extractedText,
              fileName: attachment.fileName || attachment.a_fileName,
            } : null;

            if (normalizedAttachment) {
              if (normalizedAttachment.extractionStatus === 'success' || normalizedAttachment.extractionStatus === 'SUCCESS') {
                const maxDocTokens = this.configService.get<number>('tokenLimits.maxDocumentTokens') || 32000;
                const charsPerToken = this.configService.get<number>('tokenLimits.charsPerToken') || 4;
                const maxDocChars = maxDocTokens * charsPerToken;
                
                const text = normalizedAttachment.extractedText || '';
                const truncatedText = text.length > maxDocChars 
                  ? text.substring(0, maxDocChars) + `... [Text Truncated at ${maxDocTokens} tokens.]` 
                  : text;
                
                return {
                  ...part,
                  text: `\n\n[File Content: ${normalizedAttachment.fileName}]:\n${truncatedText}`
                };
              } else if (normalizedAttachment.extractionStatus === 'processing' || normalizedAttachment.extractionStatus === 'PROCESSING') {
                return {
                  ...part,
                  text: `\n\n[System: I am currently reading the file "${normalizedAttachment.fileName}". Please wait a moment.]`
                };
              }
            }
          }
          return part;
        });

        uiMessages.push({
          id: msg.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          parts: processedParts as any,
        });
        return;
      }

      // Legacy fallback
      uiMessages.push({
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        parts: [{ type: 'text', text: msg.content || '' }],
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

    const savedMessage = await this.messageRepository.save(dbMessage);

    // Link any attachments referenced in parts to this message
    if (message.parts && Array.isArray(message.parts)) {
      const attachmentIds = message.parts
        .filter((part: any) => (part.type === 'file' || part.type === 'image') && part.attachmentId)
        .map((part: any) => part.attachmentId);

      if (attachmentIds.length > 0) {
        // We need to import the repository here or use query builder
        // For simplicity, let's use the connection/dataSource to update
        await this.messageRepository.manager
          .createQueryBuilder()
          .update('attachments')
          .set({ messageId: savedMessage.id })
          .where('id IN (:...ids)', { ids: attachmentIds })
          .execute();
        
        this.logger.debug(`Linked ${attachmentIds.length} attachments to message ${savedMessage.id}`);
      }
    }

    return savedMessage;
  }



  // Complete streaming flow with proper error handling and transaction safety
  async handleStreamingResponse(
    conversationId: string,
    userId: string,
    messages: UIMessage[],
    modeOverride?: OperationalMode,
  ) {
    try {
      // Verify ownership (lighter query than loading all messages)
      const conversation = await this.verifyOwnership(conversationId, userId);

      // Get the last user message
      const inputMessage = messages[messages.length - 1];
      if (!inputMessage) {
        throw new InternalServerErrorException('No user message provided');
      }

      // Normalize message to ensure it complies with AI SDK (requires parts)
      const lastUserMessage = MessageUtils.normalize(inputMessage);

      // Check for duplicate message (check only last message in DB)
      const lastUserMessageText = this.extractTextFromUIMessage(lastUserMessage);
      
      const lastDbMessage = await this.messageRepository.findOne({
        where: { conversationId, role: MessageRole.USER },
        order: { createdAt: 'DESC' },
      });

      const isDuplicate = lastDbMessage && lastDbMessage.content === lastUserMessageText;

      // Save user message if not duplicate
      if (!isDuplicate) {
        await this.saveUIMessage(conversationId, lastUserMessage);
      }

      // Get complete conversation history (now with the last user message and attachments)
      // Pass conversation object to avoid re-fetching
      const historyMessages = await this.getUIMessages(conversationId, conversation);

      // Check for total context size
      const totalChars = historyMessages.reduce((sum, msg) => sum + MessageUtils.extractText(msg).length, 0);
      const maxTotalTokens = this.configService.get<number>('tokenLimits.maxTotalContextTokens') || 64000;
      const charsPerToken = this.configService.get<number>('tokenLimits.charsPerToken') || 4;
      const maxTotalChars = maxTotalTokens * charsPerToken;
      
      if (totalChars > maxTotalChars) {
        this.logger.warn(`Conversation ${conversationId} context size (~${Math.round(totalChars / charsPerToken)} tokens) exceeds safe limit (${maxTotalTokens} tokens). Accuracy may decrease.`);
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

      // Resolve local image URLs to Base64 for the AI provider
      const resolvedHistory = await this.resolveImageParts(historyMessages);

      // Get StreamText result with MODE-AWARE streaming
      const { stream: result, modelUsed: actualModel, effectiveMode: actualEffectiveMode } = this.aiService.streamResponseWithMode(
        resolvedHistory,
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

  // Resolve local image URLs to Base64 for the AI provider
  private async resolveImageParts(messages: UIMessage[]): Promise<UIMessage[]> {
    this.logger.log(`[DEBUG] resolveImageParts starting for ${messages.length} messages`);
    
    // Efficiently map messages without a full deep clone of heavy Base64 data
    const resolvedMessages = await Promise.all(messages.map(async (msg) => {
      if (!msg.parts || !Array.isArray(msg.parts)) {
        return msg;
      }

      const hasImagesToResolve = msg.parts.some((part: any) => 
        part.type === 'image' && (part.url || part.image) && 
        (part.url?.startsWith('/uploads/') || part.image?.startsWith('/uploads/'))
      );

      if (!hasImagesToResolve) {
        return msg; // Return original message if no relative image paths
      }

      // Create a shallow copy of the message and deep copy parts
      const updatedParts = await Promise.all(msg.parts.map(async (part: any) => {
        if (part.type === 'image' && (part.url || part.image) && (part.url?.startsWith('/uploads/') || part.image?.startsWith('/uploads/'))) {
          try {
            const url = part.url || part.image;
            const relativePath = url.replace('/uploads/', '');
            const uploadsPath = this.configService.get<string>('LOCAL_STORAGE_PATH') || './uploads';
            const filePath = path.join(process.cwd(), uploadsPath, relativePath);
            
            this.logger.log(`[DEBUG] Attempting to read file: ${filePath}`);
            const buffer = await fs.readFile(filePath);
            const mimeType = part.mimeType || 'image/jpeg';
            const base64 = buffer.toString('base64');
            
            this.logger.log(`[DEBUG] Successfully resolved local image to base64: ${filePath.substring(0, 50)}...`);
            return {
              ...part,
              image: `data:${mimeType};base64,${base64}`,
            };
          } catch (error) {
            this.logger.error(`[DEBUG] Failed to resolve local image: ${error.message}`);
            return part;
          }
        }
        return part;
      }));

      return {
        ...msg,
        parts: updatedParts,
      };
    }));

    return resolvedMessages;
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
    // 1. Fetch conversations with basic metadata
    const conversations = await this.conversationRepository.find({
      where: { userId },
      select: ['id', 'title', 'systemPrompt', 'createdAt', 'updatedAt'],
      order: { updatedAt: 'DESC' },
    });

    if (conversations.length === 0) return [];

    // 2. Fetch only the LATEST message for each conversation in one batch
    const conversationIds = conversations.map(c => c.id);
    const lastMessages = await this.messageRepository.manager.createQueryBuilder()
      .select('m')
      .from('messages', 'm')
      .where('m.conversationId IN (:...ids)', { ids: conversationIds })
      .distinctOn(['m.conversationId'])
      .orderBy('m.conversationId')
      .addOrderBy('m.createdAt', 'DESC')
      .getRawMany();

    // Map for O(1) lookup
    const lastMessageMap = new Map();
    lastMessages.forEach(m => {
      // Handle raw column prefixing
      const convId = m.conversationId || m.m_conversationId;
      lastMessageMap.set(convId, m);
    });

    return conversations.map((conv) => {
      const lastMsg = lastMessageMap.get(conv.id);
      
      return new ConversationResponseDto({
        id: conv.id,
        title: conv.title,
        systemPrompt: conv.systemPrompt,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        lastMessage: lastMsg
          ? new MessageResponseDto({
            id: lastMsg.id || lastMsg.m_id,
            role: lastMsg.role || lastMsg.m_role,
            content: (lastMsg.content || lastMsg.m_content || '').substring(0, CONTENT_PREVIEW_LENGTH),
            createdAt: lastMsg.createdAt || lastMsg.m_createdAt,
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
      select: ['id', 'userId', 'systemPrompt'],
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