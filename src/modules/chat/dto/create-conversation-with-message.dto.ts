import {
  IsString,
  IsOptional,
  MaxLength,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsIn,
  IsObject
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for individual message parts in multi-modal messages
 */
export class MessagePartDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['text', 'image', 'file', 'tool-call', 'tool-result', 'reasoning'])
  type: 'text' | 'image' | 'file' | 'tool-call' | 'tool-result' | 'reasoning';

  @IsString()
  @IsOptional()
  @MaxLength(50000) // Limit text content to 50k characters
  text?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000000) // Allow large base64 images (up to ~5MB base64)
  image?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  file?: string;

  @IsString()
  @IsOptional()
  attachmentId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  url?: string;

  @IsString()
  @IsOptional()
  extractedText?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class CreateConversationWithMessageDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  systemPrompt?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  firstMessage: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessagePartDto)
  parts?: MessagePartDto[];
}