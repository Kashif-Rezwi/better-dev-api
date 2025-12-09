import type { OperationalMode } from '../modes/mode.config';

export class MessageResponseDto {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  metadata?: Record<string, any>;

  constructor(partial: Partial<MessageResponseDto>) {
    Object.assign(this, partial);
  }
}

export class ConversationResponseDto {
  id: string;
  title: string;
  systemPrompt?: string;
  operationalMode?: OperationalMode;
  createdAt: Date;
  updatedAt: Date;
  messages?: MessageResponseDto[];
  lastMessage?: MessageResponseDto;


  constructor(partial: Partial<ConversationResponseDto>) {
    Object.assign(this, partial);
  }
}