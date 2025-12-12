/**
 * Operational mode types for AI responses
 * 
 * - fast: Optimized for speed and conciseness
 * - thinking: Optimized for depth and reasoning
 * - auto: Dynamically routes based on query complexity
 */
export type OperationalMode = 'fast' | 'thinking' | 'auto';

/**
 * Effective mode after auto-classification
 * (Auto mode resolves to either fast or thinking)
 */
export type EffectiveMode = 'fast' | 'thinking';

/**
 * Mode metadata stored in message for transparency
 */
export interface ModeMetadata {
    /** What mode was requested (by user/conversation/default) */
    requested: OperationalMode;

    /** What mode was actually used (after auto-classification) */
    effective: EffectiveMode;

    /** Actual model name used */
    modelUsed: string;

    /** Number of tokens used in response */
    tokensUsed?: number;

    /** Temperature setting used */
    temperature: number;
}
