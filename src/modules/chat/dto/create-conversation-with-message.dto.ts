import { IsString, IsOptional, MaxLength, IsNotEmpty, IsEnum } from 'class-validator';
import type { OperationalMode } from '../modes/mode.config';

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
  @IsEnum(['fast', 'thinking', 'auto'], {
    message: 'operationalMode must be one of: fast, thinking, auto',
  })
  operationalMode?: OperationalMode;
}