import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class UploadAttachmentDto {
  @IsUUID('4', { message: 'conversationId must be a valid UUID' })
  @IsNotEmpty({ message: 'conversationId is required' })
  conversationId: string;

  @IsOptional()
  @IsUUID('4', { message: 'messageId must be a valid UUID' })
  messageId?: string;
}
