import { Injectable, Logger, ServiceUnavailableException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface UploadResult {
    url: string;
    key: string;
    size: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
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
    private s3Health: { status: 'ok' | 'paused' | 'unreachable' | 'not_configured' | 'unknown'; message?: string; checkedAt?: string } = { status: 'unknown' };
    private s3ProbeInFlight = false;
    private readonly s3HealthTtlMs = 60_000;

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

            if (!this.bucketName) {
                this.logger.warn('⚠️  S3_BUCKET_NAME is empty – uploads will fail');
                this.s3Health = { status: 'not_configured', message: 'S3_BUCKET_NAME missing' };
            } else {
                this.s3Health = { status: 'unknown', message: 'health probe pending' };
            }
        } else {
            this.ensureLocalStorageDir();
            this.logger.log('✅ Local storage initialized');
            this.s3Health = { status: 'ok', message: 'local storage' };
        }
    }

    async onModuleInit() {
        if (!this.useS3 || !this.bucketName || !this.s3Client) return;
        // Fire-and-forget probe: never let a network call delay app readiness.
        void this.probeS3Health();
    }

    private async probeS3Health(): Promise<void> {
        if (!this.s3Client || !this.bucketName || this.s3ProbeInFlight) return;
        this.s3ProbeInFlight = true;
        try {
            await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
            this.s3Health = { status: 'ok', checkedAt: new Date().toISOString() };
            this.logger.log(`✅ S3 bucket reachable: ${this.bucketName}`);
        } catch (error: any) {
            const mapped = this.mapS3Error(error, 'HeadBucket');
            if (mapped.isPaused) {
                this.s3Health = { status: 'paused', message: mapped.message, checkedAt: new Date().toISOString() };
                this.logger.warn(`⚠️  S3 storage paused: ${mapped.message} (Supabase free tier auto-pauses after inactivity – unpause at supabase.com/dashboard)`);
            } else if (mapped.statusCode === 403 || mapped.statusCode === 404) {
                // HeadBucket denials are common on Supabase even when PutObject works – not authoritative.
                this.s3Health = { status: 'unknown', message: `HeadBucket ${mapped.statusCode} – not authoritative (PutObject may still work)`, checkedAt: new Date().toISOString() };
                this.logger.warn(`⚠️  S3 HeadBucket probe returned ${mapped.statusCode} (non-authoritative): ${mapped.message}`);
            } else {
                this.s3Health = { status: 'unreachable', message: mapped.message, checkedAt: new Date().toISOString() };
                this.logger.warn(`⚠️  S3 bucket probe failed (${mapped.statusCode}): ${mapped.message}`);
            }
        } finally {
            this.s3ProbeInFlight = false;
        }
    }

    getHealth() {
        if (!this.useS3) return { provider: 'local', ...this.s3Health, localPath: this.localStoragePath };
        // Lazily re-probe on read (TTL) so /health/storage reflects current state and doubles as a keepalive.
        this.maybeRefreshHealth();
        return { provider: 's3', endpoint: this.endpoint, bucket: this.bucketName, region: this.region, ...this.s3Health };
    }

    private maybeRefreshHealth(): void {
        if (this.s3ProbeInFlight || !this.useS3) return;
        if (!this.s3Health.checkedAt || Date.now() - Date.parse(this.s3Health.checkedAt) > this.s3HealthTtlMs) {
            void this.probeS3Health();
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

        try {
            await this.s3Client!.send(command);
        } catch (error: any) {
            const mapped = this.mapS3Error(error, `PutObject ${key}`);
            // Surface as 503 so GlobalExceptionFilter returns {"statusCode":503} and frontend can show retryable message
            // Log full context for ops (requestId, cf-ray, status)
            this.logger.error(`S3 PutObject failed for ${key}: ${mapped.message}`, error.stack);
            throw new ServiceUnavailableException(mapped.userMessage);
        }

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
            // Strip CDN prefix if a full URL was passed; keep bucket-prefixed key for cross-provider compatibility
            const key = this.extractS3Key(keyOrUrl);

            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });

            try {
                const response = await this.s3Client!.send(command);
                const byteArray = await response.Body?.transformToByteArray();
                return Buffer.from(byteArray || []);
            } catch (error: any) {
                const mapped = this.mapS3Error(error, `GetObject ${key}`);
                this.logger.warn(`S3 GetObject failed for ${key}: ${mapped.message}`);
                // Bubble as 503 so chat image resolve can decide to skip image; callers like resolveImageBase64 handle null
                throw new ServiceUnavailableException(mapped.userMessage);
            }
        } else {
            const relativePath = keyOrUrl.replace('/uploads/', '').replace(/^\//, '');
            const filePath = path.join(process.cwd(), this.localStoragePath, relativePath);
            return fs.readFile(filePath);
        }
    }

    async delete(keyOrUrl: string): Promise<void> {
        // Accepts a plain key, an /uploads/ path, or a full CDN/storage URL – normalized via extractS3Key.
        if (this.useS3) {
            const key = this.extractS3Key(keyOrUrl);
            try {
                const command = new DeleteObjectCommand({
                    Bucket: this.bucketName,
                    Key: key,
                });
                await this.s3Client!.send(command);
                this.logger.log(`Deleted from S3: ${key}`);
            } catch (error: any) {
                const mapped = this.mapS3Error(error, `DeleteObject ${key}`);
                // Deletes are best-effort – log as warn but don't throw to avoid blocking conversation deletion
                this.logger.warn(`Failed to delete S3 file ${key} (${mapped.statusCode}): ${mapped.message}`);
            }
        } else {
            const relativePath = keyOrUrl.replace('/uploads/', '').replace(/^\//, '');
            const filePath = path.join(process.cwd(), this.localStoragePath, relativePath);
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

    // Extract the S3 key from a CDN/full URL or a plain key. Handles:
    // - https://<cdn>/conversations/...  → conversations/...
    // - https://<endpoint>/bucket/conversations/... → conversations/...
    // - conversations/... → conversations/...
    // - /uploads/conversations/... → conversations/...
    private extractS3Key(keyOrUrl: string): string {
        let key = keyOrUrl.trim();

        // Strip query/hash
        key = key.split('?')[0].split('#')[0];

        if (key.startsWith('http')) {
            try {
                const url = new URL(key);
                // Remove leading slash
                key = url.pathname.replace(/^\//, '');
                // If CDN URL includes bucket as first segment and path-style, keep as is for Supabase public URL
                // Supabase CDN: /storage/v1/object/public/<bucket>/conversations/... – strip prefix to get key
                // Check for supabase public path pattern
                const publicPrefix = `storage/v1/object/public/${this.bucketName}/`;
                if (key.startsWith(publicPrefix)) {
                    key = key.substring(publicPrefix.length);
                } else if (key.startsWith(`${this.bucketName}/`)) {
                    // S3 endpoint path-style: /<bucket>/key
                    key = key.substring(this.bucketName.length + 1);
                } else if (key.startsWith('storage/v1/s3/')) {
                    key = key.replace(/^storage\/v1\/s3\//, '');
                    if (key.startsWith(`${this.bucketName}/`)) key = key.substring(this.bucketName.length + 1);
                }
            } catch {
                // Fallback to simple strip
                key = key.replace(/^https?:\/\/[^/]+\//, '').replace(/^\//, '');
            }
        }

        // Local served URL prefix – handle both /uploads/... and uploads/...
        key = key.replace(/^\//, '');
        if (key.startsWith('uploads/')) key = key.replace(/^uploads\//, '');

        return key;
    }

    // Map raw S3/Smithy errors (including non-XML 540 Project paused) to actionable messages
    private mapS3Error(error: any, context: string): { statusCode: number; message: string; userMessage: string; isPaused: boolean; rawBody?: string } {
        // Smithy stores raw HTTP response on error.$response (may be IncomingMessage for some ops)
        const rawResponse: any = error?.$response;
        const statusCode: number = rawResponse?.statusCode ?? rawResponse?.httpStatusCode ?? error?.$metadata?.httpStatusCode ?? 500;

        // Body may be string (text/plain 540 PutObject) or IncomingMessage (HeadBucket) or undefined
        let rawBody: string | undefined;
        const bodyCandidates: any[] = [rawResponse?.body, error?.message, error?.Message, String(error)];
        for (const candidate of bodyCandidates) {
            if (typeof candidate === 'string' && candidate.length > 0 && candidate.length < 5000) {
                rawBody = candidate;
                break;
            }
            // IncomingMessage body (HeadBucket) – not string but status 540 already hints paused
        }

        // Detect Supabase paused (540) – Supabase returns 540 text/plain "Project paused..." for ALL S3 ops when paused.
        // PutObject $response.body is string, HeadBucket body is IncomingMessage, so also check statusCode === 540.
        const bodyHasPaused = typeof rawBody === 'string' && /Project paused/i.test(rawBody);
        const messageHasPaused = typeof error?.message === 'string' && /Project paused/i.test(error.message);
        const isDeserialization = typeof error?.message === 'string' && error.message.includes('is not expected');
        // Supabase free tier pauses projects after ~7 days inactivity and answers EVERY S3 op with
        // HTTP 540 text/plain "Project paused…". Gate the "paused" remediation STRICTLY on 540 /
        // the explicit body text – a deserialization error from an unrelated HTML/proxy 403/502 must
        // NOT be mislabeled as "go unpause Supabase".
        const isPaused = bodyHasPaused || messageHasPaused || statusCode === 540;

        let message: string;
        let userMessage: string;

        if (isPaused) {
            message = 'Project paused. Please unpause the project before proceeding. (Supabase free tier auto-pauses after ~7 days inactivity)';
            userMessage = 'File storage is temporarily paused – the Supabase project is paused due to inactivity. Please unpause it at supabase.com/dashboard or set USE_S3_STORAGE=false to use local storage.';
            return { statusCode: 503, message, userMessage, isPaused: true, rawBody };
        }

        // Non-XML/unparseable body that is NOT a pause (e.g. reverse-proxy HTML on 502/403): still a
        // transient 503, but with accurate guidance instead of a false "paused" hint.
        if (isDeserialization) {
            const detail = rawBody ? ` Body starts: ${rawBody.substring(0, 120)}` : '';
            message = `${context}: Unparseable response from storage (${statusCode}).${detail}`;
            userMessage = `File storage returned an unexpected response (${statusCode}). Please retry in a moment – if this persists, check S3_ENDPOINT and provider status.`;
            return { statusCode: 503, message, userMessage, isPaused: false, rawBody };
        }

        // Common S3 errors with XML body already parsed: extract code/message if available
        const s3Code = error?.Code ?? error?.name ?? error?.code;
        const s3Message = error?.message ?? rawBody ?? 'Unknown storage error';

        if (statusCode === 403 || /AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch/i.test(s3Code + s3Message)) {
            message = `S3 access denied (${s3Code}): ${s3Message}`;
            userMessage = 'File storage access denied – check S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY and bucket policy.';
        } else if (/NoSuchKey/i.test(s3Code)) {
            // Object-level miss (row still exists but object was deleted) – distinct from bucket missing.
            message = `S3 object not found (${s3Code}): ${s3Message}`;
            userMessage = 'This file no longer exists in storage – it may have been removed. Please re-upload the file and try again.';
        } else if (statusCode === 404 || /NoSuchBucket/i.test(s3Code)) {
            message = `S3 bucket/key not found (${s3Code}): ${s3Message}`;
            userMessage = `Storage bucket "${this.bucketName}" not found – verify S3_BUCKET_NAME and that the bucket exists.`;
        } else if (statusCode === 413 || /EntityTooLarge|PayloadTooLarge/i.test(s3Message)) {
            message = `File too large for storage: ${s3Message}`;
            userMessage = 'File too large for object storage – try a smaller file.';
        } else {
            message = rawBody || s3Message || error?.message || 'Unknown S3 error';
            // Truncate to avoid leaking huge bodies
            if (message.length > 500) message = message.substring(0, 500) + '…';
            userMessage = `File storage temporarily unavailable (${statusCode}). Please retry in a moment – if this persists, check S3_ENDPOINT / bucket config. Detail: ${message.substring(0,120)}`;
        }

        // Enrich log context
        const requestId = rawResponse?.headers?.['sb-request-id'] ?? rawResponse?.headers?.['x-amz-request-id'] ?? rawResponse?.headers?.['cf-ray'];
        if (requestId) message += ` [requestId=${requestId}]`;

        return { statusCode, message: `${context}: ${message}`, userMessage, isPaused: false, rawBody };
    }
}
