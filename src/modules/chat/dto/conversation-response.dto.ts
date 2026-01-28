import type { MessageMetadata } from '../types/message-metadata.type';

export class MessageResponseDto {
  id: string;
  role: string;
  content: string;
  parts?: Array<any>;
  createdAt: Date;
  metadata?: MessageMetadata;

  constructor(partial: Partial<MessageResponseDto>) {
    Object.assign(this, partial);
  }
}

export class ConversationResponseDto {
  id: string;
  title: string;
  systemPrompt?: string;
  createdAt: Date;
  updatedAt: Date;
  messages?: MessageResponseDto[];
  lastMessage?: MessageResponseDto;


  constructor(partial: Partial<ConversationResponseDto>) {
    Object.assign(this, partial);
  }
}