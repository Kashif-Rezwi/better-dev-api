import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  Put,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ChatRequestDto } from './dto/chat-request.dto';
import { GenerateTitleDto } from './dto/generate-title.dto';
import type { UIMessage } from 'ai';
import { UpdateSystemPromptDto } from './dto/update-system-prompt.dto';
import { CreateConversationWithMessageDto } from './dto/create-conversation-with-message.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) { }

  @Post('conversations/with-message')
  async createConversationWithMessage(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateConversationWithMessageDto,
  ) {
    return this.chatService.createConversationWithFirstMessage(
      user.userId,
      dto,
    );
  }

  @Get('conversations')
  async getConversations(@CurrentUser() user: AuthUser) {
    return this.chatService.getUserConversations(user.userId);
  }

  @Get('conversations/:id')
  async getConversation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chatService.getConversation(id, user.userId);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConversation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.chatService.deleteConversation(id, user.userId);
  }

  // AI SDK v5 Compatible Endpoint
  // Accepts UIMessages and returns SSE stream
  @Post('conversations/:id/messages')
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() chatRequest: ChatRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Get the AI SDK v5 Response object from service
    const streamResponse = await this.chatService.handleStreamingResponse(
      conversationId,
      user.userId,
      chatRequest.messages as unknown as UIMessage[],
      chatRequest.modeOverride,
    );

    // Copy headers from AI SDK response to Express response
    streamResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    // Set status code
    res.status(streamResponse.status);

    // Stream the body with client disconnect listener
    if (streamResponse.body) {
      const reader = streamResponse.body.getReader();

      req.on('close', () => {
        reader.cancel().catch(() => {});
      });

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
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() dto: GenerateTitleDto,
  ) {
    const title = await this.chatService.generateTitle(
      conversationId,
      user.userId,
      dto.message,
    );

    return { title };
  }

  @Put('conversations/:id/system-prompt')
  async updateSystemPrompt(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() body: UpdateSystemPromptDto,
  ) {
    return this.chatService.updateSystemPrompt(
      conversationId,
      user.userId,
      body.systemPrompt,
    );
  }
}