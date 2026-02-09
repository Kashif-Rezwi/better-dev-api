// AI Model Configuration
// Central configuration for all AI models used in the application

import { type ProviderName } from './provider.config';

export type ModelType = 'default' | 'tool' | 'text' | 'vision';

export interface ModelConfig {
    envKey: string;           // Environment variable key
    defaultValue: string;     // Fallback default model
    description: string;      // Human-readable description
    provider: ProviderName;   // AI provider to use
}

export const MODEL_CONFIGS: Record<ModelType, ModelConfig> = {
    default: {
        envKey: 'DEFAULT_AI_MODEL',
        defaultValue: 'openai/gpt-oss-120b',
        description: 'Default Model',
        provider: 'groq' as ProviderName,
    },
    tool: {
        envKey: 'AI_TOOL_MODEL',
        defaultValue: 'llama-3.3-70b-versatile',
        description: 'Tool Model',
        provider: 'groq' as ProviderName,
    },
    text: {
        envKey: 'AI_TEXT_MODEL',
        defaultValue: 'llama-3.1-8b-instant',
        description: 'Text Model',
        provider: 'groq' as ProviderName,
    },
    vision: {
        envKey: 'AI_VISION_MODEL',
        defaultValue: 'meta-llama/llama-4-scout-17b-16e-instruct',
        description: 'Vision Model',
        provider: 'groq' as ProviderName,
    },
} as const;
