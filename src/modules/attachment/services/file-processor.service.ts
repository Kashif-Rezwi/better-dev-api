import { Injectable, Logger } from '@nestjs/common';
import { createWorker } from 'tesseract.js';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import sharp from 'sharp';
import { FileType } from '../entities/attachment.entity';

export interface ProcessedFile {
    extractedText: string;
    metadata: any;
    thumbnailBuffer?: Buffer;
}

@Injectable()
export class FileProcessorService {
    private readonly logger = new Logger(FileProcessorService.name);
    private worker: any = null;

    private async getWorker() {
        if (!this.worker) {
            this.worker = await createWorker('eng');
            this.logger.log('Tesseract Worker initialized');
        }
        return this.worker;
    }

    async process(
        buffer: Buffer,
        fileType: FileType,
        mimeType: string,
    ): Promise<ProcessedFile> {
        this.logger.log(`Processing ${fileType} file (${mimeType})`);

        try {
            switch (fileType) {
                case FileType.IMAGE:
                    return await this.processImage(buffer);
                case FileType.PDF:
                    return await this.processPDF(buffer);
                case FileType.DOCUMENT:
                    return await this.processDocument(buffer, mimeType);
                default:
                    return { extractedText: '', metadata: {} };
            }
        } catch (error: any) {
            this.logger.error(`File processing failed: ${error.message}`);
            return {
                extractedText: '',
                metadata: { error: error.message },
            };
        }
    }

    private async processImage(buffer: Buffer): Promise<ProcessedFile> {
        // Generate thumbnail
        const thumbnailBuffer = await sharp(buffer)
            .resize(300, 300, { fit: 'inside' })
            .jpeg({ quality: 80 })
            .toBuffer();

        this.logger.log('Thumbnail generated');

        // OCR with Tesseract
        let extractedText = '';
        let ocrMetadata: any = {};

        try {
            const worker = await this.getWorker();
            const { data } = await worker.recognize(buffer);

            extractedText = data.text;
            ocrMetadata = {
                confidence: data.confidence,
            };

            this.logger.log(`OCR completed with ${data.confidence.toFixed(2)}% confidence`);
        } catch (error: any) {
            this.logger.warn(`OCR failed: ${error.message}`);
            ocrMetadata = { error: error.message };
        }

        return {
            extractedText,
            metadata: ocrMetadata,
            thumbnailBuffer,
        };
    }

    private async processPDF(buffer: Buffer): Promise<ProcessedFile> {
        // @ts-ignore - pdf-parse doesn't have proper ES6 module types
        const pdfParseModule = require('pdf-parse');
        const data = await pdfParseModule(buffer);

        this.logger.log(`PDF processed: ${data.numpages} pages, ${data.text.length} characters`);

        return {
            extractedText: data.text,
            metadata: {
                pages: data.numpages,
                info: data.info,
            },
        };
    }

    private async processDocument(
        buffer: Buffer,
        mimeType: string,
    ): Promise<ProcessedFile> {
        if (
            mimeType.includes('word') ||
            mimeType.includes('document') ||
            mimeType.includes('officedocument')
        ) {
            const result = await mammoth.extractRawText({ buffer });

            this.logger.log(`Word document processed: ${result.value.length} characters`);

            return {
                extractedText: result.value,
                metadata: {
                    messages: result.messages,
                },
            };
        }

        return { extractedText: '', metadata: {} };
    }
}
