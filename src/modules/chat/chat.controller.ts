import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChatRequestDto } from './dto/chat-request.dto';
import type { UIMessage } from 'ai';
import { UpdateSystemPromptDto } from './dto/update-system-prompt.dto';
import { CreateConversationWithMessageDto } from './dto/create-conversation-with-message.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) { }

  @Post('conversations/with-message')
  async createConversationWithMessage(
    @Req() req,
    @Body() dto: CreateConversationWithMessageDto,
  ) {
    // Create conversation with the first message saved
    const result = await this.chatService.createConversationWithFirstMessage(
      req.user.userId,
      dto,
    );

    // Return conversation data as JSON (no streaming)
    return result;
  }

  @Get('conversations')
  async getConversations(@Req() req) {
    return this.chatService.getUserConversations(req.user.userId);
  }

  @Get('conversations/:id')
  async getConversation(@Req() req, @Param('id') id: string) {
    return this.chatService.getConversation(id, req.user.userId);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConversation(@Req() req, @Param('id') id: string) {
    await this.chatService.deleteConversation(id, req.user.userId);
  }

  // AI SDK v5 Compatible Endpoint
  // Accepts UIMessages and returns SSE stream
  @Post('conversations/:id/messages')
  async sendMessage(
    @Req() req,
    @Param('id') conversationId: string,
    @Body() chatRequest: ChatRequestDto,
    @Res() res: Response,
  ) {
    // Get the AI SDK v5 Response object from service
    const streamResponse = await this.chatService.handleStreamingResponse(
      conversationId,
      req.user.userId,
      chatRequest.messages as UIMessage[],
      chatRequest.modeOverride,  // Pass mode override
    );

    // Copy headers from AI SDK response to Express response
    streamResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    // Set status code
    res.status(streamResponse.status);

    // Stream the body
    if (streamResponse.body) {
      const reader = streamResponse.body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } finally {
        reader.releaseLock();
      }
    }

    res.end();
  }

  // Generate title endpoint
  @Post('conversations/:id/generate-title')
  async generateTitle(
    @Req() req,
    @Param('id') conversationId: string,
    @Body() body: { message: string },
  ) {
    const title = await this.chatService.generateTitle(
      conversationId,
      req.user.userId,
      body.message,
    );

    return { title };
  }

  @Put('conversations/:id/system-prompt')
  async updateSystemPrompt(
    @Req() req,
    @Param('id') conversationId: string,
    @Body() body: UpdateSystemPromptDto,
  ) {
    return this.chatService.updateSystemPrompt(
      conversationId,
      req.user.userId,
      body.systemPrompt,
    );
  }
}