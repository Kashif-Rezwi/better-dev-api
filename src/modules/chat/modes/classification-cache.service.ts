import { Injectable, Logger } from '@nestjs/common';
import type { EffectiveMode } from './mode.config';
import type { UIMessage } from 'ai';
import { createHash } from 'crypto';
import { MessageUtils } from '../utils/message.utils';

/**
 * Cache entry with expiration
 */
interface CacheEntry {
    mode: EffectiveMode;
    expiresAt: number;
}

/**
 * Classification Cache Service
 * 
 * Provides in-memory caching for query classifications to improve
 * performance and reduce AI API calls.
 * 
 * Cache TTL: 5 minutes
 * Cleanup: Every minute
 */
@Injectable()
export class ClassificationCacheService {
    private readonly logger = new Logger(ClassificationCacheService.name);
    private cache = new Map<string, CacheEntry>();
    private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes
    private readonly MAX_CACHE_SIZE = 1000; // Maximum cache entries
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        // Start cleanup interval
        this.cleanupInterval = setInterval(() => this.cleanExpired(), 60000);
        this.logger.log('Classification cache initialized (TTL: 5 minutes, Max size: 1000)');
    }

    /**
     * Generate cache key from messages
     * Uses MD5 hash of last user message text
     */
    getCacheKey(messages: UIMessage[]): string {
        const lastUserMsg = messages
            .filter((m) => m.role === 'user')
            .pop();

        if (!lastUserMsg) {
            return 'empty';
        }

        const text = MessageUtils.extractText(lastUserMsg);

        // Create deterministic hash
        return createHash('md5').update(text.trim()).digest('hex');
    }

    /**
     * Get cached classification (respects TTL)
     */
    get(key: string): EffectiveMode | null {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        this.logger.debug(`Cache hit: ${key}`);
        return entry.mode;
    }

    /**
     * Set classification in cache with TTL
     * Implements FIFO eviction when cache is full
     */
    set(key: string, mode: EffectiveMode): void {
        // Evict oldest entry if cache is full (FIFO)
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
                this.logger.debug(`Cache full, evicted oldest entry: ${firstKey}`);
            }
        }

        const expiresAt = Date.now() + this.TTL_MS;
        this.cache.set(key, { mode, expiresAt });
        this.logger.debug(`Cache set: ${key} → ${mode} (expires: ${new Date(expiresAt).toISOString()})`);
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
        this.logger.log('Cache cleared');
    }

    /**
     * Get cache statistics
     */
    getStats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
        };
    }

    /**
     * Clean expired entries
     */
    private cleanExpired(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.debug(`Cleaned ${cleaned} expired cache entries`);
        }
    }

    /**
     * Cleanup on destroy
     */
    onModuleDestroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}
