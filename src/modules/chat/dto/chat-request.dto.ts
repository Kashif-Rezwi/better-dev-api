import { IsArray, IsOptional, IsEnum, ArrayNotEmpty } from 'class-validator';
import type { OperationalMode } from '../modes/mode.config';

export class ChatRequestDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'messages must contain at least one message' })
  messages: any[];

  @IsOptional()
  @IsEnum(['fast', 'thinking', 'auto'], {
    message: 'modeOverride must be one of: fast, thinking, auto',
  })
  modeOverride?: OperationalMode;
}