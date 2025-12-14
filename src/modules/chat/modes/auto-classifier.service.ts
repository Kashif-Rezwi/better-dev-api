import { Injectable, Logger } from '@nestjs/common';
import type { UIMessage } from 'ai';
import { AIService } from '../../core/ai.service';
import type { EffectiveMode } from './mode.config';
import { ClassificationCacheService } from './classification-cache.service';
import { MessageUtils } from '../utils/message.utils';

/**
 * Auto Classifier Service
 * 
 * Analyzes query complexity to automatically determine
 * whether to use Fast or Thinking mode.
 * 
 * Uses AI-based classification for intelligent routing.
 */
@Injectable()
export class AutoClassifierService {
    private readonly logger = new Logger(AutoClassifierService.name);

    // Configuration constants
    private readonly SHORT_QUERY_THRESHOLD = 15; // characters
    private readonly CLASSIFICATION_TIMEOUT_MS = 5000; // 5 seconds

    constructor(
        private aiService: AIService,
        private cache: ClassificationCacheService,
    ) { }

    /**
     * Classifies query as 'fast' or 'thinking' based on complexity.
     * 
     * Uses AI-based classification for intelligent routing with
     * fallback heuristics for edge cases.
     * 
     * @param messages - Conversation messages
     * @returns Effective mode (fast or thinking)
     */
    async classify(messages: UIMessage[]): Promise<EffectiveMode> {
        const startTime = Date.now();

        try {
            const lastMessage = messages.filter((msg) => msg.role === 'user').pop();

            if (!lastMessage) {
                this.logger.debug('No user message found, defaulting to fast mode');
                return 'fast';
            }

            // Extract query text
            const query = MessageUtils.extractText(lastMessage);

            // Quick heuristic pre-filter for very short queries
            if (query.trim().length < this.SHORT_QUERY_THRESHOLD) {
                this.logger.log(`Auto-classified as FAST (very short query: ${query.length} chars, threshold: ${this.SHORT_QUERY_THRESHOLD})`);
                return 'fast';
            }

            // Check cache first
            const cacheKey = this.cache.getCacheKey(messages);
            const cached = this.cache.get(cacheKey);
            if (cached) {
                this.logger.log(`Auto-classified as ${cached.toUpperCase()} (cached)`);
                return cached;
            }

            // AI-based classification
            const classificationPrompt: UIMessage[] = [
                {
                    id: 'system',
                    role: 'system',
                    parts: [
                        {
                            type: 'text',
                            text: `You are a query complexity classifier. Classify as SIMPLE or COMPLEX.

SIMPLE queries (use Fast mode):
- Short, direct questions (e.g., "What is X?", "Define Y")
- Factual lookups (e.g., "Who invented Z?")
- Basic clarifications (e.g., "Can you explain that?")
- Greetings and small talk
- Yes/no questions
- Simple how-to questions (e.g., "How do I install X?")

COMPLEX queries (use Thinking mode):
- Multi-part questions requiring synthesis
- Code implementation requests (e.g., "Build a function that...")
- Requests for deep explanations (e.g., "Explain the internals of...")
- Comparative analysis (e.g., "Compare X and Y in detail")
- Creative/open-ended tasks (e.g., "Design a system for...")
- Debugging or troubleshooting problems
- Architectural or design decisions
- Requests for step-by-step reasoning
- Questions with "why" or "how does it work internally"

Reply with ONLY "SIMPLE" or "COMPLEX". No explanation needed.`,
                        },
                    ],
                },
                {
                    id: 'user',
                    role: 'user',
                    parts: [
                        {
                            type: 'text',
                            text: `Query: "${query}"`,
                        },
                    ],
                },
            ];

            // Call AI with timeout
            const response = await this.classifyWithTimeout(classificationPrompt, this.CLASSIFICATION_TIMEOUT_MS);
            const isComplex = response.trim().toUpperCase().includes('COMPLEX');

            const result: EffectiveMode = isComplex ? 'thinking' : 'fast';
            const duration = Date.now() - startTime;

            // Cache the result
            this.cache.set(cacheKey, result);

            this.logger.log(
                `🔍 Auto-classified: "${query.substring(0, 60)}${query.length > 60 ? '...' : ''}" → ${result.toUpperCase()} mode (${duration}ms)`,
            );

            return result;
        } catch (error: any) {
            // Check if it's a timeout
            if (error.message === 'Classification timeout') {
                this.logger.warn('Classification timeout, falling back to FAST mode');
                return 'fast';
            }

            this.logger.error(`Auto classification failed: ${error.message}`);
            this.logger.warn('Falling back to FAST mode due to classification error');
            // Default to fast mode on error (fail safely)
            return 'fast';
        }
    }

    /**
     * Classify with timeout wrapper
     * @param messages - Classification prompt messages
     * @param timeoutMs - Timeout in milliseconds
     * @returns AI response
     */
    private async classifyWithTimeout(
        messages: UIMessage[],
        timeoutMs: number,
    ): Promise<string> {
        return Promise.race([
            this.aiService.generateResponse(messages),
            new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error('Classification timeout')), timeoutMs)
            ),
        ]);
    }

}
