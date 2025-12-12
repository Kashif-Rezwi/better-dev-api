import { IsArray, IsOptional, IsEnum } from 'class-validator';
import type { OperationalMode } from '../modes/mode.config';

export class ChatRequestDto {
  @IsArray()
  messages: any[];

  @IsOptional()
  @IsEnum(['fast', 'thinking', 'auto'], {
    message: 'modeOverride must be one of: fast, thinking, auto',
  })
  modeOverride?: OperationalMode;
}