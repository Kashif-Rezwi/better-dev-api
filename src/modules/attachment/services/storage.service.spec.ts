import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

const S3_CONFIG: Record<string, string> = {
  USE_S3_STORAGE: 'true',
  S3_BUCKET_NAME: 'better-dev-attachments',
  S3_REGION: 'ap-south-1',
  S3_ENDPOINT: 'https://ref.storage.supabase.co/storage/v1/s3',
  S3_CDN_URL: 'https://ref.storage.supabase.co/storage/v1/object/public/better-dev-attachments',
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
  S3_PUBLIC_READ: 'false',
  S3_FORCE_PATH_STYLE: 'true',
};

const LOCAL_CONFIG: Record<string, string> = {
  USE_S3_STORAGE: 'false',
  LOCAL_STORAGE_PATH: './uploads',
};

/**
 * Construct directly (no Nest lifecycle) so tests stay hermetic – no onModuleInit
 * probe runs, therefore no network I/O can leak into unit tests.
 */
function createService(config: Record<string, string> = LOCAL_CONFIG): StorageService {
  const mockConfigService = {
    get: jest.fn((key: string) => config[key]),
  };
  return new StorageService(mockConfigService as unknown as ConfigService);
}

/** Private-method accessors (mapS3Error / extractS3Key are deliberately private). */
function mapError(service: StorageService, error: any, context: string) {
  return (service as any).mapS3Error(error, context);
}
function extractKey(service: StorageService, keyOrUrl: string) {
  return (service as any).extractS3Key(keyOrUrl);
}

describe('StorageService', () => {
  it('should initialize correctly in local storage mode', () => {
    const storageService = createService();
    const health = storageService.getHealth();
    expect(storageService).toBeDefined();
    expect(health.provider).toBe('local');
    expect(health.status).toBe('ok');
  });

  it('reports S3 health as not_configured when the bucket name is missing', () => {
    const storageService = createService({ ...S3_CONFIG, S3_BUCKET_NAME: '' });
    expect(storageService.getHealth().status).toBe('not_configured');
  });
  describe('extractS3Key', () => {
    const service = createService(S3_CONFIG);

    it('keeps plain keys as-is', () => {
      expect(extractKey(service, 'conversations/abc/123.jpg')).toBe('conversations/abc/123.jpg');
    });

    it('strips the Supabase public CDN prefix', () => {
      const key = extractKey(
        service,
        'https://x.storage.supabase.co/storage/v1/object/public/better-dev-attachments/conversations/abc/123.jpg',
      );
      expect(key).toBe('conversations/abc/123.jpg');
    });

    it('strips a path-style bucket prefix (endpoint/bucket/key)', () => {
      const key = extractKey(service, 'https://s3.example.com/better-dev-attachments/conversations/abc/123.jpg');
      expect(key).toBe('conversations/abc/123.jpg');
    });

    it('strips the storage/v1/s3 path-style prefix', () => {
      const key = extractKey(
        service,
        'https://x.storage.supabase.co/storage/v1/s3/better-dev-attachments/conversations/abc/123.jpg',
      );
      expect(key).toBe('conversations/abc/123.jpg');
    });

    it('strips /uploads/ prefixes and query/hash suffixes', () => {
      expect(extractKey(service, '/uploads/conversations/abc/123.jpg?x=1#frag')).toBe('conversations/abc/123.jpg');
    });
  });
  describe('mapS3Error', () => {
    const service = createService(S3_CONFIG);

    it('detects Supabase paused via 540 plain-text body', () => {
      const mapped = mapError(
        service,
        {
          message: "char 'P' is not expected.:1:1 Deserialization error",
          $response: {
            statusCode: 540,
            headers: { 'sb-request-id': 'abc' },
            body: 'Project paused. Please unpause the project before proceeding.',
          },
        },
        'PutObject conversations/abc/123.jpg',
      );
      expect(mapped.isPaused).toBe(true);
      expect(mapped.statusCode).toBe(503);
      expect(mapped.userMessage).toContain('temporarily paused');
    });

    it('detects Supabase paused via statusCode alone (IncomingMessage body)', () => {
      const mapped = mapError(
        service,
        { message: "char 'P' is not expected.:1:1 Deserialization error", $response: { statusCode: 540 } },
        'HeadBucket',
      );
      expect(mapped.isPaused).toBe(true);
      expect(mapped.statusCode).toBe(503);
    });

    it('does NOT mislabel unrelated deserialization errors as paused', () => {
      const mapped = mapError(
        service,
        {
          message: 'char < is not expected.:1:1 Deserialization error',
          $response: { statusCode: 502, body: '<html><body>Bad Gateway</body></html>' },
        },
        'PutObject conversations/abc/123.jpg',
      );
      expect(mapped.isPaused).toBe(false);
      expect(mapped.statusCode).toBe(503);
      expect(mapped.userMessage).toContain('unexpected response');
    });

    it('maps 403 AccessDenied', () => {
      const mapped = mapError(
        service,
        { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
        'PutObject conversations/abc/123.jpg',
      );
      expect(mapped.isPaused).toBe(false);
      expect(mapped.userMessage).toContain('access denied');
    });

    it('maps 404 NoSuchKey distinctly from a missing bucket', () => {
      const missingKey = mapError(
        service,
        { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } },
        'GetObject conversations/abc/123.jpg',
      );
      expect(missingKey.userMessage).toContain('no longer exists');
      expect(missingKey.userMessage).not.toContain('S3_BUCKET_NAME');

      const missingBucket = mapError(
        service,
        { name: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } },
        'HeadBucket',
      );
      expect(missingBucket.userMessage).toContain('S3_BUCKET_NAME');
    });

    it('maps 413 EntityTooLarge', () => {
      const mapped = mapError(
        service,
        { message: 'EntityTooLarge: request too large', $metadata: { httpStatusCode: 413 } },
        'PutObject conversations/abc/123.jpg',
      );
      expect(mapped.userMessage).toContain('too large');
    });

    it('maps generic failures to temporarily unavailable', () => {
      const mapped = mapError(
        service,
        { message: 'boom', $response: { statusCode: 500, body: 'boom' } },
        'PutObject conversations/abc/123.jpg',
      );
      expect(mapped.statusCode).toBe(500);
      expect(mapped.userMessage).toContain('temporarily unavailable');
    });
  });
});
