import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import type { MessageMetadata } from '../types/message-metadata.type';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

/**
 * Represents a single part of a multi-modal message.
 * Messages can contain multiple parts of different types (text, images, files, etc.)
 */
export interface MessagePart {
  /** The type of content this part represents */
  type: 'text' | 'image' | 'file' | 'tool-call' | 'tool-result' | 'reasoning';

  /** Text content (for text parts) */
  text?: string;

  /** Image data - can be URL or base64 data URI (for image parts) */
  image?: string;

  /** File URL or identifier (for file parts) */
  file?: string;

  /** Reference to attachment in database */
  attachmentId?: string;

  /** Public URL to the resource */
  url?: string;

  /** Text extracted from images or documents via OCR/parsing */
  extractedText?: string;

  /** Additional metadata specific to the part type */
  metadata?: Record<string, any>;

  /** Tool-specific fields (only for tool-call and tool-result parts) */
  toolName?: string;
  toolCallId?: string;
  input?: any;
  output?: any;
  state?: string;
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversationId: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({
    type: 'enum',
    enum: MessageRole,
  })
  role: MessageRole;

  @Column('text', { nullable: true })
  content?: string;

  @Column('jsonb', { nullable: true })
  metadata?: MessageMetadata;

  @Column('jsonb', { nullable: true })
  parts?: MessagePart[];

  @OneToMany('Attachment', 'message')
  attachments?: any[];

  @CreateDateColumn()
  createdAt: Date;
}