import { registerAs } from '@nestjs/config';

export default registerAs('tokenLimits', () => ({
  /**
   * Maximum tokens to extract from a single document.
   * Groq models (Llama 3.1/3.3) support up to 128k context,
   * but we cap it lower for performance and cost.
   * Roughly 32,000 tokens ≈ 128,000 characters.
   */
  maxDocumentTokens: parseInt(process.env.MAX_DOCUMENT_TOKENS || '32000', 10),

  /**
   * Maximum total tokens to include in the conversation context.
   * Includes history + system prompt + document text.
   * Roughly 64,000 tokens ≈ 256,000 characters.
   */
  maxTotalContextTokens: parseInt(process.env.MAX_TOTAL_CONTEXT_TOKENS || '64000', 10),

  /**
   * Estimation ratio: Characters per token.
   * Standard heuristic for English is ~4 characters per token.
   */
  charsPerToken: 4,

  /**
   * Maximum file size for uploads (in bytes).
   * Default: 10MB
   */
  maxUploadSizeBytes: parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || '10485760', 10),
}));
