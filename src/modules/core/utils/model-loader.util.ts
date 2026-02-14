import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MODEL_CONFIGS, type ModelConfig } from '../config/model.config';
import { type ProviderName } from '../config/provider.config';

export interface ModelInfo {
    name: string;
    provider: ProviderName;
}

export interface LoadedModels {
    default: ModelInfo;
    tool: ModelInfo;
    text: ModelInfo;
    vision: ModelInfo;
}

// Loads a single model from config with fallback to default
function loadModel(configService: ConfigService, config: ModelConfig): ModelInfo {
    return {
        name: configService.get<string>(config.envKey) || config.defaultValue,
        provider: config.provider,
    };
}

// Loads all AI models from environment or defaults
export function loadAllModels(configService: ConfigService): LoadedModels {
    return {
        default: loadModel(configService, MODEL_CONFIGS.default),
        tool: loadModel(configService, MODEL_CONFIGS.tool),
        text: loadModel(configService, MODEL_CONFIGS.text),
        vision: loadModel(configService, MODEL_CONFIGS.vision),
    };
}

// Logs all loaded models
export function logLoadedModels(logger: Logger, models: LoadedModels): void {
    logger.log(`🤖 AI Service Initialized`);
    logger.log(`  - ${MODEL_CONFIGS.default.description}: ${models.default.name} [${models.default.provider}] (from ${MODEL_CONFIGS.default.envKey})`);
    logger.log(`  - ${MODEL_CONFIGS.tool.description}: ${models.tool.name} [${models.tool.provider}] (from ${MODEL_CONFIGS.tool.envKey})`);
    logger.log(`  - ${MODEL_CONFIGS.text.description}: ${models.text.name} [${models.text.provider}] (from ${MODEL_CONFIGS.text.envKey})`);
    logger.log(`  - ${MODEL_CONFIGS.vision.description}: ${models.vision.name} [${models.vision.provider}] (from ${MODEL_CONFIGS.vision.envKey})`);
}
