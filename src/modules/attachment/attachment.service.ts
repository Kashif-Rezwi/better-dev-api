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
import { StorageService } from './services/storage.service';
import { FileProcessorService } from './services/file-processor.service';
import * as mime from 'mime-types';

@Injectable()
export class AttachmentService {
    private readonly logger = new Logger(AttachmentService.name);

    constructor(
        @InjectRepository(Attachment)
        private attachmentRepository: Repository<Attachment>,
        private storageService: StorageService,
        private fileProcessorService: FileProcessorService,
    ) { }

    async upload(
        file: Express.Multer.File,
        conversationId: string,
        messageId: string | undefined,
        userId: string,
    ): Promise<Attachment> {
        this.logger.log(
            `Uploading file: ${file.originalname} (${file.size} bytes) for conversation ${conversationId}`,
        );

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

    async getById(id: string): Promise<Attachment | null> {
        return this.attachmentRepository.findOne({ where: { id } });
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
