import { Module, Global } from '@nestjs/common';
import { AIService } from './ai.service';

/**
 * Core Module
 * 
 * Provides fundamental services used across multiple modules.
 * Marked as @Global so exports are available everywhere without explicit imports.
 * 
 * Services:
 * - AIService: Low-level AI model interactions
 */
@Global()
@Module({
    providers: [AIService],
    exports: [AIService],
})
export class CoreModule { }
