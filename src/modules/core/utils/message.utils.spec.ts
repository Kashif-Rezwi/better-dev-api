import { MessageUtils } from './message.utils';
import type { UIMessage } from 'ai';

describe('MessageUtils', () => {
  describe('extractText', () => {
    it('should extract text from parts array', () => {
      const msg = {
        role: 'user' as const,
        parts: [
          { type: 'text', text: 'Hello, ' },
          { type: 'text', text: 'world!' },
        ],
      };
      expect(MessageUtils.extractText(msg)).toBe('Hello, world!');
    });

    it('should extract text from legacy content field', () => {
      const msg = {
        role: 'user' as const,
        content: 'Legacy message text',
      };
      expect(MessageUtils.extractText(msg)).toBe('Legacy message text');
    });

    it('should return empty string for empty message', () => {
      const msg = {
        role: 'user' as const,
        parts: [],
      };
      expect(MessageUtils.extractText(msg)).toBe('');
    });
  });

  describe('normalize', () => {
    it('should return message with parts as-is', () => {
      const msg: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Test' }],
      };
      const normalized = MessageUtils.normalize(msg);
      expect(normalized.parts).toHaveLength(1);
      expect(normalized.parts[0]).toEqual({ type: 'text', text: 'Test' });
    });

    it('should convert legacy content to parts format', () => {
      const legacyMsg = {
        role: 'assistant' as const,
        content: 'Hello assistant',
      };
      const normalized = MessageUtils.normalize(legacyMsg);
      expect(normalized.parts).toBeDefined();
      expect(normalized.parts).toHaveLength(1);
      expect(normalized.parts[0]).toEqual({ type: 'text', text: 'Hello assistant' });
    });
  });

  describe('hasToolContent', () => {
    it('should detect tool parts', () => {
      const msg: UIMessage = {
        id: 'msg-tool',
        role: 'assistant',
        parts: [
          { type: 'tool-call', toolName: 'tavily_web_search' } as any,
        ],
      };
      expect(MessageUtils.hasToolContent(msg, 'tavily_web_search')).toBe(true);
    });

    it('should return false when tool is absent', () => {
      const msg: UIMessage = {
        id: 'msg-text',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Just plain text' }],
      };
      expect(MessageUtils.hasToolContent(msg, 'tavily_web_search')).toBe(false);
    });
  });
});
