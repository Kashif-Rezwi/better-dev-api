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
        defaultValue: 'openai/gpt-oss-120b',
        description: 'Tool Model',
        provider: 'groq' as ProviderName,
    },
    text: {
        envKey: 'AI_TEXT_MODEL',
        defaultValue: 'openai/gpt-oss-20b',
        description: 'Text Model',
        provider: 'groq' as ProviderName,
    },
    // No vision-capable model is currently available on Groq's free tier
    // (all Llama 4 vision models were retired). Images are still handled via
    // server-side OCR (tesseract.js) whose extracted text is injected into
    // the context, so gpt-oss-120b can answer from the OCR text.
    vision: {
        envKey: 'AI_VISION_MODEL',
        defaultValue: 'openai/gpt-oss-120b',
        description: 'Vision Model',
        provider: 'groq' as ProviderName,
    },
} as const;
