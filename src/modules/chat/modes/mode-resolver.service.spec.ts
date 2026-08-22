import { Test, TestingModule } from '@nestjs/testing';
import { ModeResolverService } from './mode-resolver.service';
import { AutoClassifierService } from './auto-classifier.service';
import type { UIMessage } from 'ai';

describe('ModeResolverService', () => {
  let modeResolver: ModeResolverService;
  let autoClassifier: jest.Mocked<AutoClassifierService>;

  beforeEach(async () => {
    const mockAutoClassifier = {
      classify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModeResolverService,
        { provide: AutoClassifierService, useValue: mockAutoClassifier },
      ],
    }).compile();

    modeResolver = module.get<ModeResolverService>(ModeResolverService);
    autoClassifier = module.get(AutoClassifierService);
  });

  it('should return concrete fast mode when fast override is requested', async () => {
    const messages: UIMessage[] = [
      { id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
    ];

    const result = await modeResolver.resolveMode(messages, 'fast');

    expect(result).toEqual({
      requested: 'fast',
      effective: 'fast',
    });
    expect(autoClassifier.classify).not.toHaveBeenCalled();
  });

  it('should return concrete thinking mode when thinking override is requested', async () => {
    const messages: UIMessage[] = [
      { id: '1', role: 'user', parts: [{ type: 'text', text: 'Analyze this code' }] },
    ];

    const result = await modeResolver.resolveMode(messages, 'thinking');

    expect(result).toEqual({
      requested: 'thinking',
      effective: 'thinking',
    });
    expect(autoClassifier.classify).not.toHaveBeenCalled();
  });

  it('should delegate to autoClassifier when mode is auto', async () => {
    const messages: UIMessage[] = [
      { id: '1', role: 'user', parts: [{ type: 'text', text: 'Build a distributed system' }] },
    ];

    autoClassifier.classify.mockResolvedValue('thinking');

    const result = await modeResolver.resolveMode(messages, 'auto');

    expect(result).toEqual({
      requested: 'auto',
      effective: 'thinking',
    });
    expect(autoClassifier.classify).toHaveBeenCalledWith(messages);
  });
});
