import { groq } from '@ai-sdk/groq';

export type ProviderName = 'groq' | 'openai' | 'anthropic' | 'google';

// Provider factory function type
export type ProviderFactory = (modelName: string) => any;

export const PROVIDERS: Record<ProviderName, ProviderFactory> = {
    groq: (modelName: string) => groq(modelName),
    openai: (modelName: string) => {
        throw new Error(`OpenAI provider for model "${modelName}" is not installed. Install @ai-sdk/openai to enable.`);
    },
    anthropic: (modelName: string) => {
        throw new Error(`Anthropic provider for model "${modelName}" is not installed. Install @ai-sdk/anthropic to enable.`);
    },
    google: (modelName: string) => {
        throw new Error(`Google provider for model "${modelName}" is not installed. Install @ai-sdk/google to enable.`);
    },
} as const;

// Default provider (used if not specified)
export const DEFAULT_PROVIDER: ProviderName = 'groq';
