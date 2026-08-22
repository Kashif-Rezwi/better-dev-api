import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttachmentController } from './attachment.controller';
import { AttachmentService } from './attachment.service';
import { StorageService } from './services/storage.service';
import { FileProcessorService } from './services/file-processor.service';
import { Attachment } from './entities/attachment.entity';
import { Conversation } from '../chat/entities/conversation.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Attachment, Conversation])],
    controllers: [AttachmentController],
    providers: [AttachmentService, StorageService, FileProcessorService],
    exports: [AttachmentService], // Export for use in ChatModule
})
export class AttachmentModule { }
