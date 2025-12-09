import { IsEnum } from 'class-validator';
import type { OperationalMode } from '../modes/mode.config';

/**
 * DTO for updating a conversation's operational mode
 */
export class UpdateOperationalModeDto {
    @IsEnum(['fast', 'thinking', 'auto'], {
        message: 'mode must be one of: fast, thinking, auto',
    })
    mode: OperationalMode;
}
