import { Injectable, Logger } from '@nestjs/common';
import type { Conversation } from '../entities/conversation.entity';
import type { OperationalMode, EffectiveMode } from './mode.config';
import { AutoClassifierService } from './auto-classifier.service';
import type { UIMessage } from 'ai';

/**
 * Mode Resolver Service
 * 
 * Resolves the effective operational mode using a hierarchy:
 * 1. Message-level override (if provided in request)
 * 2. Conversation-level setting
 * 3. User-level default
 * 
 * If mode is 'auto', delegates to AutoClassifierService.
 */
@Injectable()
export class ModeResolverService {
    private readonly logger = new Logger(ModeResolverService.name);

    constructor(private autoClassifier: AutoClassifierService) { }

    /**
     * Resolves the requested operational mode using hierarchy:
     * Get the requested mode based on hierarchy
     * Priority: Message Override > Conversation Mode > Default ('auto')
     */
    private getRequestedMode(
        conversation: Conversation,
        modeOverride?: OperationalMode,
    ): OperationalMode {
        // 1. Message-level override (highest priority)
        if (modeOverride) {
            this.logger.debug(
                `Using message-level override: ${modeOverride} (conversation: ${conversation.id})`,
            );
            return modeOverride;
        }

        // 2. Conversation-level mode
        if (conversation.operationalMode) {
            this.logger.debug(
                `Using conversation-level mode: ${conversation.operationalMode} (conversation: ${conversation.id})`,
            );
            return conversation.operationalMode;
        }

        // 3. Default fallback
        this.logger.debug(
            `Using default mode: auto (conversation: ${conversation.id})`,
        );
        return 'auto';
    }

    /**
     * Resolves auto mode to concrete mode (fast or thinking).
     * If mode is already concrete (fast/thinking), returns as-is.
     * 
     * @param requestedMode - The requested operational mode
     * @param messages - Conversation messages for auto-classification
     * @returns The effective mode (fast or thinking)
     */
    async resolveEffectiveMode(
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

    /**
     * Main entry point for mode resolution
     * Resolves the effective operational mode for a conversation
     *
     * @param conversation - The conversation entity
     * @param messages - The conversation message history
     * @param modeOverride - Optional per-message mode override
     * @returns Object containing both requested and effective modes
     */
    async resolveMode(
        conversation: Conversation,
        messages: UIMessage[],
        modeOverride?: OperationalMode,
    ): Promise<{ requested: OperationalMode; effective: EffectiveMode }> {
        // Step 1: Determine requested mode using hierarchy
        const requestedMode = this.getRequestedMode(
            conversation,
            modeOverride,
        );

        this.logger.log(
            `Mode resolution for conversation ${conversation.id}: requested=${requestedMode}`,
        );

        // Step 2: Resolve effective mode (handle 'auto')
        const effectiveMode = await this.resolveEffectiveMode(
            requestedMode,
            messages,
        );

        return {
            requested: requestedMode,
            effective: effectiveMode,
        };
    }

}
