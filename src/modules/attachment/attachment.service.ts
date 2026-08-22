import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attachment, FileType, ExtractionStatus } from './entities/attachment.entity';
import { Conversation } from '../chat/entities/conversation.entity';
import { StorageService } from './services/storage.service';
import { FileProcessorService } from './services/file-processor.service';
import { ConfigService } from '@nestjs/config';
import * as mime from 'mime-types';

@Injectable()
export class AttachmentService {
    private readonly logger = new Logger(AttachmentService.name);

    constructor(
        @InjectRepository(Attachment)
        private attachmentRepository: Repository<Attachment>,
        @InjectRepository(Conversation)
        private conversationRepository: Repository<Conversation>,
        private storageService: StorageService,
        private fileProcessorService: FileProcessorService,
        private configService: ConfigService,
    ) { }

    async upload(
        file: Express.Multer.File,
        conversationId: string,
        messageId: string | undefined,
        userId: string,
    ): Promise<Attachment> {
        // 1. Verify that conversation exists and belongs to the user
        const conversation = await this.conversationRepository.findOne({
            where: { id: conversationId },
            select: ['id', 'userId'],
        });

        if (!conversation) {
            throw new NotFoundException(`Conversation ${conversationId} not found`);
        }

        if (conversation.userId !== userId) {
            throw new ForbiddenException('Access denied to this conversation');
        }

        this.logger.log(
            `Uploading file: ${file.originalname} (${file.size} bytes) for conversation ${conversationId}`,
        );

        // Check file size limit
        const maxSize = this.configService.get<number>('tokenLimits.maxUploadSizeBytes') || 10485760;
        if (file.size > maxSize) {
            throw new BadRequestException(
                `File size exceeds the limit of ${Math.round(maxSize / 1024 / 1024)}MB`,
            );
        }

        // Determine file type
        const fileType = this.determineFileType(file.mimetype);

        // Upload to storage
        const { url, key, size } = await this.storageService.upload(
            file,
            conversationId,
        );

        // Create attachment record
        const attachment = this.attachmentRepository.create({
            messageId,
            conversationId,
            fileName: file.originalname,
            fileType,
            mimeType: file.mimetype,
            fileSize: size,
            storageUrl: url,
            storageKey: key,
            extractionStatus: ExtractionStatus.PENDING,
        });

        await this.attachmentRepository.save(attachment);

        // Process file asynchronously (OCR, text extraction)
        this.processFileAsync(attachment.id, file.buffer, fileType, file.mimetype);

        return attachment;
    }

    private async processFileAsync(
        attachmentId: string,
        buffer: Buffer,
        fileType: FileType,
        mimeType: string,
    ): Promise<void> {
        try {
            // Update status to processing
            await this.attachmentRepository.update(attachmentId, {
                extractionStatus: ExtractionStatus.PROCESSING,
            });

            // Process the file
            const processed = await this.fileProcessorService.process(
                buffer,
                fileType,
                mimeType,
            );

            // Save thumbnail if generated
            let thumbnailUrl: string | undefined;
            if (processed.thumbnailBuffer) {
                const attachment = await this.attachmentRepository.findOne({
                    where: { id: attachmentId },
                });

                if (attachment) {
                    const thumbnailFile: Express.Multer.File = {
                        originalname: `thumb_${attachment.fileName}`,
                        buffer: processed.thumbnailBuffer,
                        mimetype: 'image/jpeg',
                        size: processed.thumbnailBuffer.length,
                    } as Express.Multer.File;

                    const { url } = await this.storageService.upload(
                        thumbnailFile,
                        attachment.conversationId,
                    );
                    thumbnailUrl = url;
                }
            }

            // Update attachment with processed data
            await this.attachmentRepository.update(attachmentId, {
                extractedText: processed.extractedText,
                extractionMetadata: processed.metadata,
                extractionStatus: ExtractionStatus.SUCCESS,
                thumbnailUrl,
            });

            this.logger.log(`File processing completed for attachment ${attachmentId}`);
        } catch (error: any) {
            this.logger.error(
                `File processing failed for attachment ${attachmentId}: ${error.message}`,
            );

            await this.attachmentRepository.update(attachmentId, {
                extractionStatus: ExtractionStatus.FAILED,
                extractionMetadata: { error: error.message },
            });
        }
    }

    async getAttachmentsForConversation(conversationId: string): Promise<Attachment[]> {
        return this.attachmentRepository.find({
            where: { conversationId },
        });
    }

    async linkAttachmentsToMessage(messageId: string, attachmentIds: string[]): Promise<void> {
        if (!attachmentIds || attachmentIds.length === 0) return;
        await this.attachmentRepository
            .createQueryBuilder()
            .update(Attachment)
            .set({ messageId })
            .where('id IN (:...ids)', { ids: attachmentIds })
            .execute();
        this.logger.debug(`Linked ${attachmentIds.length} attachments to message ${messageId}`);
    }

    async resolveImageBase64(urlOrPath: string, mimeType: string = 'image/jpeg'): Promise<string | null> {
        try {
            const buffer = await this.storageService.getBuffer(urlOrPath);
            const base64 = buffer.toString('base64');
            return `data:${mimeType};base64,${base64}`;
        } catch (error: any) {
            this.logger.error(`Failed to resolve image to base64 for ${urlOrPath}: ${error.message}`);
            return null;
        }
    }

    async getAttachment(id: string, userId: string): Promise<Attachment> {
        const attachment = await this.attachmentRepository.findOne({
            where: { id },
            relations: ['conversation'],
        });

        if (!attachment) {
            throw new NotFoundException('Attachment not found');
        }

        // Verify user owns the conversation
        if (attachment.conversation.userId !== userId) {
            throw new ForbiddenException('Access denied');
        }

        return attachment;
    }

    async deleteAttachment(id: string, userId: string): Promise<void> {
        const attachment = await this.getAttachment(id, userId);

        // Delete from storage
        await this.storageService.delete(attachment.storageKey);

        // Delete thumbnail if exists
        if (attachment.thumbnailUrl) {
            const thumbnailKey = attachment.thumbnailUrl.replace('/uploads/', '');
            await this.storageService.delete(thumbnailKey);
        }

        // Delete from database
        await this.attachmentRepository.delete(id);

        this.logger.log(`Deleted attachment ${id}`);
    }

    private determineFileType(mimeType: string): FileType {
        if (mimeType.startsWith('image/')) {
            return FileType.IMAGE;
        } else if (mimeType === 'application/pdf') {
            return FileType.PDF;
        } else if (
            mimeType.includes('word') ||
            mimeType.includes('document') ||
            mimeType.includes('officedocument')
        ) {
            return FileType.DOCUMENT;
        } else if (mimeType.startsWith('video/')) {
            return FileType.VIDEO;
        } else if (mimeType.startsWith('audio/')) {
            return FileType.AUDIO;
        }

        throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }
}
