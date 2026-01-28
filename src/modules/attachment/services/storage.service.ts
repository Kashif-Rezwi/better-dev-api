import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface UploadResult {
    url: string;
    key: string;
    size: number;
}

@Injectable()
export class StorageService {
    private readonly logger = new Logger(StorageService.name);
    private s3Client?: S3Client;
    private readonly useS3: boolean;
    private readonly localStoragePath: string;
    private readonly bucketName: string;
    private readonly region: string;
    private readonly endpoint: string;
    private readonly cdnUrl: string;

    constructor(private configService: ConfigService) {
        this.useS3 = this.configService.get('USE_S3_STORAGE') === 'true';
        this.localStoragePath =
            this.configService.get('LOCAL_STORAGE_PATH') || './uploads';
        this.bucketName = this.configService.get('S3_BUCKET_NAME') || '';
        this.region = this.configService.get('S3_REGION') || 'us-east-1';
        this.endpoint = this.configService.get('S3_ENDPOINT') || '';
        this.cdnUrl = this.configService.get('S3_CDN_URL') || '';

        if (this.useS3) {
            // DigitalOcean Spaces configuration
            this.s3Client = new S3Client({
                region: this.region,
                endpoint: this.endpoint, // e.g., https://nyc3.digitaloceanspaces.com
                credentials: {
                    accessKeyId: this.configService.get('S3_ACCESS_KEY_ID') || '',
                    secretAccessKey:
                        this.configService.get('S3_SECRET_ACCESS_KEY') || '',
                },
                forcePathStyle: false, // Use virtual-hosted-style URLs
            });
            this.logger.log('✅ DigitalOcean Spaces storage initialized');
            this.logger.log(`   Endpoint: ${this.endpoint}`);
            this.logger.log(`   Bucket: ${this.bucketName}`);
            this.logger.log(`   Region: ${this.region}`);
        } else {
            this.ensureLocalStorageDir();
            this.logger.log('✅ Local storage initialized');
        }
    }

    async upload(
        file: Express.Multer.File,
        conversationId: string,
    ): Promise<UploadResult> {
        const fileKey = this.generateFileKey(conversationId, file.originalname);

        if (this.useS3) {
            return this.uploadToS3(file, fileKey);
        } else {
            return this.uploadLocally(file, fileKey);
        }
    }

    private async uploadToS3(
        file: Express.Multer.File,
        key: string,
    ): Promise<UploadResult> {
        const command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
            ACL: 'public-read', // DigitalOcean Spaces: public for CDN access
        });

        await this.s3Client!.send(command);

        // Use CDN URL if configured, otherwise use direct Spaces URL
        let url: string;
        if (this.cdnUrl) {
            url = `${this.cdnUrl}/${key}`;
        } else {
            // DigitalOcean Spaces URL format: https://{bucket}.{region}.digitaloceanspaces.com/{key}
            url = `https://${this.bucketName}.${this.region}.digitaloceanspaces.com/${key}`;
        }

        this.logger.log(`Uploaded to DigitalOcean Spaces: ${key}`);
        return { url, key, size: file.size };
    }

    private async uploadLocally(
        file: Express.Multer.File,
        key: string,
    ): Promise<UploadResult> {
        const filePath = path.join(this.localStoragePath, key);
        const dir = path.dirname(filePath);

        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, file.buffer);

        const url = `/uploads/${key}`; // Served by Express static
        this.logger.log(`Uploaded locally: ${filePath}`);
        return { url, key, size: file.size };
    }

    async delete(key: string): Promise<void> {
        if (this.useS3) {
            const command = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });
            await this.s3Client!.send(command);
            this.logger.log(`Deleted from S3: ${key}`);
        } else {
            const filePath = path.join(this.localStoragePath, key);
            await fs.unlink(filePath).catch((error) => {
                this.logger.warn(`Failed to delete file: ${error.message}`);
            });
            this.logger.log(`Deleted locally: ${filePath}`);
        }
    }

    private generateFileKey(conversationId: string, originalName: string): string {
        const ext = path.extname(originalName);
        const timestamp = Date.now();
        const uuid = uuidv4().split('-')[0];
        return `conversations/${conversationId}/${timestamp}-${uuid}${ext}`;
    }

    private async ensureLocalStorageDir(): Promise<void> {
        await fs.mkdir(this.localStoragePath, { recursive: true });
    }
}
