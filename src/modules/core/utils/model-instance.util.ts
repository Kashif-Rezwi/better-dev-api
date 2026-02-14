import { PROVIDERS, DEFAULT_PROVIDER, type ProviderName } from '../config/provider.config';

// Get a model instance from the appropriate provider
export function getModelInstance(modelName: string, provider: ProviderName = DEFAULT_PROVIDER) {
    const providerFactory = PROVIDERS[provider];

    if (!providerFactory) {
        throw new Error(`Provider "${provider}" is not configured. Available providers: ${Object.keys(PROVIDERS).join(', ')}`);
    }

    return providerFactory(modelName);
}
