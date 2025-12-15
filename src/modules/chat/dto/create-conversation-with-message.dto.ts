import { IsString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';

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
}