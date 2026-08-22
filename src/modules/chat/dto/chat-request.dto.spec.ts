import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ChatRequestDto } from './chat-request.dto';

describe('ChatRequestDto Validation', () => {
  it('should validate valid chat request with standard text messages', async () => {
    const payload = {
      messages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'Hello AI' }],
        },
      ],
      modeOverride: 'thinking',
    };

    const dto = plainToInstance(ChatRequestDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
  });

  it('should validate messages with AI SDK tool parts and assistant artifacts', async () => {
    const payload = {
      messages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'What is the weather today?' }],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool-tavily_web_search',
              state: 'output-available',
              toolCallId: 'call_123',
              output: { results: ['Sunny 25C'] },
            },
            {
              type: 'step-start',
            },
            {
              type: 'reasoning',
              text: 'Looking up the current weather...',
            },
            {
              type: 'text',
              text: 'The weather today is sunny and 25C.',
            },
          ],
        },
        {
          role: 'user',
          parts: [
            { type: 'file', attachmentId: 'f5d18d45-98f9-4b68-842a-eef13a69dcbc' },
            { type: 'image', attachmentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
            { type: 'text', text: 'Summarize this file and image' },
          ],
        },
      ],
      modeOverride: 'auto',
    };

    const dto = plainToInstance(ChatRequestDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
  });

  it('should reject empty messages array', async () => {
    const payload = {
      messages: [],
    };

    const dto = plainToInstance(ChatRequestDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject invalid role in message', async () => {
    const payload = {
      messages: [
        {
          role: 'invalid-role',
          parts: [{ type: 'text', text: 'Hi' }],
        },
      ],
    };

    const dto = plainToInstance(ChatRequestDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
