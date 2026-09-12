import { Controller, Get } from '@nestjs/common';
import { StorageService } from './modules/attachment/services/storage.service';

@Controller()
export class HealthController {
  constructor(private readonly storageService: StorageService) {}

  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'better-dev-ai-chat',
    };
  }

  @Get('health/storage')
  storageHealth() {
    const storage = this.storageService.getHealth();
    // paused / unreachable / not_configured are operationally actionable → degraded.
    // "unknown" (boot probe pending, or a non-authoritative HeadBucket 403/404) is non-alarming.
    const httpStatus =
      storage.status === 'paused' ||
      storage.status === 'unreachable' ||
      storage.status === 'not_configured'
        ? 'degraded'
        : 'ok';
    return {
      status: httpStatus,
      timestamp: new Date().toISOString(),
      storage,
    };
  }
}
