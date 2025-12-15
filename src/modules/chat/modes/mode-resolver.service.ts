import { Injectable, Logger } from '@nestjs/common';
import type { OperationalMode, EffectiveMode } from './mode.config';
import { AutoClassifierService } from './auto-classifier.service';
import type { UIMessage } from 'ai';

/**
 * Mode Resolver Service
 * 
 * Resolves the effective operational mode using simplified hierarchy:
 * 1. Message-level override (if provided in request)
 * 2. Default mode ("auto")
 * 
 * If mode is 'auto', delegates to AutoClassifierService.
 */
@Injectable()
export class ModeResolverService {
    private readonly logger = new Logger(ModeResolverService.name);

    constructor(private autoClassifier: AutoClassifierService) { }

    /**
     * Resolves the effective operational mode for a conversation
     *
     * @param messages - The conversation message history
     * @param modeOverride - Optional per-message mode override
     * @returns Object containing both requested and effective modes
     */
    async resolveMode(
        messages: UIMessage[],
        modeOverride?: OperationalMode,
    ): Promise<{ requested: OperationalMode; effective: EffectiveMode }> {
        // Validate modeOverride if provided
        if (modeOverride && !['fast', 'thinking', 'auto'].includes(modeOverride)) {
            this.logger.warn(`Invalid mode override received: "${modeOverride}". Defaulting to auto mode.`);
            modeOverride = 'auto';
        }

        // Simple 2-level hierarchy: override OR auto
        const requestedMode = modeOverride || 'auto';

        this.logger.log(`Mode requested: ${requestedMode}`);

        // Resolve effective mode (handle 'auto')
        const effectiveMode = await this.resolveEffectiveMode(
            requestedMode,
            messages,
        );

        return {
            requested: requestedMode,
            effective: effectiveMode,
        };
    }

    /**
     * Resolves auto mode to concrete mode (fast or thinking).
     * If mode is already concrete (fast/thinking), returns as-is.
     * 
     * @param requestedMode - The requested operational mode
     * @param messages - Conversation messages for auto-classification
     * @returns The effective mode (fast or thinking)
     */
    private async resolveEffectiveMode(
        requestedMode: OperationalMode,
        messages: UIMessage[],
    ): Promise<EffectiveMode> {
        // If mode is already concrete, return it
        if (requestedMode === 'fast' || requestedMode === 'thinking') {
            this.logger.debug(`Mode is already concrete: ${requestedMode}`);
            return requestedMode;
        }

        // Auto mode - use classifier
        if (requestedMode === 'auto') {
            this.logger.debug('Mode is auto, using classifier...');
            const effectiveMode = await this.autoClassifier.classify(messages);
            this.logger.log(
                `Auto mode resolved to: ${effectiveMode.toUpperCase()}`,
            );
            return effectiveMode;
        }

        // Should never reach here, but TypeScript needs this
        this.logger.warn(`Unknown mode: ${requestedMode}, defaulting to fast`);
        return 'fast';
    }

}
