import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

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
    private readonly publicReadAcl: boolean;
    private readonly forcePathStyle: boolean;

    constructor(private configService: ConfigService) {
        this.useS3 = this.configService.get('USE_S3_STORAGE') === 'true';
        this.localStoragePath =
            this.configService.get('LOCAL_STORAGE_PATH') || './uploads';
        this.bucketName = this.configService.get('S3_BUCKET_NAME') || '';
        this.region = this.configService.get('S3_REGION') || 'us-east-1';
        this.endpoint = this.configService.get('S3_ENDPOINT') || '';
        this.cdnUrl = this.configService.get('S3_CDN_URL') || '';
        // Opt-in: only providers that support object ACLs (e.g. DigitalOcean
        // Spaces) should enable this. Cloudflare R2 and ACL-disabled AWS S3
        // buckets REJECT PutObject requests that include an ACL.
        this.publicReadAcl =
            this.configService.get('S3_PUBLIC_READ') === 'true';
        // Path-style URLs (endpoint/bucket/key) are required by providers
        // like Supabase Storage whose S3 endpoint does not support
        // virtual-hosted-style (bucket.endpoint/key) addressing.
        this.forcePathStyle =
            this.configService.get('S3_FORCE_PATH_STYLE') === 'true';

        if (this.useS3) {
            // S3-compatible configuration (AWS S3, Cloudflare R2, DigitalOcean Spaces, ...)
            this.s3Client = new S3Client({
                region: this.region,
                // e.g. https://nyc3.digitaloceanspaces.com or https://<account>.r2.cloudflarestorage.com
                // Leave empty for AWS S3 (endpoint is derived from region).
                endpoint: this.endpoint || undefined,
                credentials: {
                    accessKeyId: this.configService.get('S3_ACCESS_KEY_ID') || '',
                    secretAccessKey:
                        this.configService.get('S3_SECRET_ACCESS_KEY') || '',
                },
                forcePathStyle: this.forcePathStyle,
            });
            this.logger.log('✅ S3-compatible storage initialized');
            this.logger.log(`   Endpoint: ${this.endpoint || '(AWS default)'}`);
            this.logger.log(`   Bucket: ${this.bucketName}`);
            this.logger.log(`   Region: ${this.region}`);
            this.logger.log(`   Public-read ACL: ${this.publicReadAcl}`);
            this.logger.log(`   Path-style URLs: ${this.forcePathStyle}`);
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
            // Only send an ACL when the provider supports it (opt-in via
            // S3_PUBLIC_READ=true). Cloudflare R2 / ACL-disabled AWS buckets
            // reject requests containing an ACL.
            ...(this.publicReadAcl ? { ACL: 'public-read' as const } : {}),
        });

        await this.s3Client!.send(command);

        const url = this.buildPublicUrl(key);

        this.logger.log(`Uploaded to object storage: ${key}`);
        return { url, key, size: file.size };
    }

    /**
     * Build the public URL for an uploaded object, provider-agnostically:
     * 1. S3_CDN_URL (custom CDN / R2 public domain / CloudFront) if configured.
     * 2. Virtual-hosted-style URL derived from S3_ENDPOINT
     *    (e.g. https://{bucket}.nyc3.digitaloceanspaces.com/{key}).
     * 3. Standard AWS S3 URL when no custom endpoint is configured
     *    (https://{bucket}.s3.{region}.amazonaws.com/{key}).
     *
     * Note: for Cloudflare R2, the S3 API endpoint does not serve public
     * objects — set S3_CDN_URL to the bucket's public r2.dev URL or custom domain.
     */
    private buildPublicUrl(key: string): string {
        if (this.cdnUrl) {
            return `${this.cdnUrl.replace(/\/+$/, '')}/${key}`;
        }
        if (this.endpoint) {
            const endpointHost = this.endpoint
                .replace(/^https?:\/\//, '')
                .replace(/\/+$/, '');
            return `https://${this.bucketName}.${endpointHost}/${key}`;
        }
        return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
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

    async getBuffer(keyOrUrl: string): Promise<Buffer> {
        if (this.useS3) {
            // Strip leading slash or baseUrl if a full URL was passed
            const key = keyOrUrl.startsWith('http')
                ? keyOrUrl.replace(/^https?:\/\/[^/]+\//, '')
                : keyOrUrl.replace(/^\//, '');

            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });

            const response = await this.s3Client!.send(command);
            const byteArray = await response.Body?.transformToByteArray();
            return Buffer.from(byteArray || []);
        } else {
            const relativePath = keyOrUrl.replace('/uploads/', '').replace(/^\//, '');
            const filePath = path.join(process.cwd(), this.localStoragePath, relativePath);
            return fs.readFile(filePath);
        }
    }

    async delete(key: string): Promise<void> {
        if (this.useS3) {
            try {
                const command = new DeleteObjectCommand({
                    Bucket: this.bucketName,
                    Key: key,
                });
                await this.s3Client!.send(command);
                this.logger.log(`Deleted from S3: ${key}`);
            } catch (error: any) {
                this.logger.warn(`Failed to delete S3 file ${key}: ${error.message}`);
            }
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
        const uuid = randomUUID().split('-')[0];
        return `conversations/${conversationId}/${timestamp}-${uuid}${ext}`;
    }

    private async ensureLocalStorageDir(): Promise<void> {
        await fs.mkdir(this.localStoragePath, { recursive: true });
    }
}
