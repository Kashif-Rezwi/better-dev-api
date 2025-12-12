import { Module } from '@nestjs/common';
import { AutoClassifierService } from './auto-classifier.service';
import { ModeResolverService } from './mode-resolver.service';
import { ClassificationCacheService } from './classification-cache.service';

/**
 * Modes Module
 * 
 * Provides operational mode services:
 * - Auto classification (with caching)
 * - Mode resolution
 * 
 * Note: AIService is available via @Global CoreModule
 */
@Module({
    providers: [
        AutoClassifierService,
        ModeResolverService,
        ClassificationCacheService,
    ],
    exports: [
        AutoClassifierService,
        ModeResolverService,
        ClassificationCacheService,
    ],
})
export class ModesModule { }
