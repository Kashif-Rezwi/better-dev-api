import {
  IsArray,
  IsOptional,
  IsEnum,
  ArrayNotEmpty,
  ValidateNested,
  IsString,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { OperationalMode } from '../../core/config/mode.config';

export class UIMessageInputDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsIn(['user', 'assistant', 'system'])
  role: 'user' | 'assistant' | 'system';

  @IsOptional()
  @IsArray()
  parts?: Array<Record<string, any>>;

  @IsOptional()
  @IsString()
  content?: string;
}

export class ChatRequestDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'messages must contain at least one message' })
  @ValidateNested({ each: true })
  @Type(() => UIMessageInputDto)
  messages: UIMessageInputDto[];

  @IsOptional()
  @IsEnum(['fast', 'thinking', 'auto'], {
    message: 'modeOverride must be one of: fast, thinking, auto',
  })
  modeOverride?: OperationalMode;
}