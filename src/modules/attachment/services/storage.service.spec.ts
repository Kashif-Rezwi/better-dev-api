import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  let storageService: StorageService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          USE_S3_STORAGE: 'false',
          LOCAL_STORAGE_PATH: './uploads',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    storageService = module.get<StorageService>(StorageService);
  });

  it('should initialize correctly in local storage mode', () => {
    expect(storageService).toBeDefined();
  });
});
