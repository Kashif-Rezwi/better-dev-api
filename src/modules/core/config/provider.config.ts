import { groq } from '@ai-sdk/groq';

export type ProviderName = 'groq' | 'openai' | 'anthropic' | 'google';

// Provider factory function type
export type ProviderFactory = (modelName: string) => any;

export const PROVIDERS: Record<ProviderName, ProviderFactory> = {
    groq: (modelName: string) => groq(modelName),
    openai: (modelName: string) => { }, // openai(modelName),
    anthropic: (modelName: string) => { }, // anthropic(modelName),
    google: (modelName: string) => { }, // google(modelName),
} as const;

// Default provider (used if not specified)
export const DEFAULT_PROVIDER: ProviderName = 'groq';
