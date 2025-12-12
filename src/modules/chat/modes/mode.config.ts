/**
 * Operational Mode Types
 */
export type OperationalMode = 'fast' | 'thinking' | 'auto';
export type EffectiveMode = 'fast' | 'thinking';

/**
 * Mode Configuration
 */
export interface ModeConfig {
    model: string;
    maxTokens: number;
    temperature: number;
    systemPrompt: string;
}

/**
 * Mode Configurations
 * 
 * Simple const object containing all mode settings.
 * No service needed - just import and use directly.
 */
export const MODE_CONFIG: Record<EffectiveMode, ModeConfig> = {
    fast: {
        model: process.env.AI_TEXT_MODEL || 'llama-3.1-8b-instant',
        maxTokens: 500,
        temperature: 0.5,
        systemPrompt: `You are operating in FAST MODE.

CRITICAL INSTRUCTIONS:
- Be extremely concise and direct
- Maximum 1-3 sentences per response
- Prioritize speed over depth
- Get straight to the point
- No elaborate explanations unless explicitly requested

Your goal is to provide quick, accurate answers with minimal verbosity.`,
    },

    thinking: {
        model: process.env.AI_TOOL_MODEL || 'llama-3.3-70b-versatile',
        maxTokens: 4000,
        temperature: 0.7,
        systemPrompt: `You are operating in THINKING MODE.

CRITICAL INSTRUCTIONS:
- Provide thorough, comprehensive responses
- Show your reasoning step-by-step
- Explain nuances and edge cases
- Be detailed and complete
- Prioritize accuracy and depth over brevity

Your goal is to demonstrate deep understanding and provide complete, well-reasoned answers.`,
    },
} as const;
