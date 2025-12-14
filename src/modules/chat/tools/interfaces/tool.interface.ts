import { z } from 'zod';

/**
 * Base interface that all tools must implement
 * Ensures consistency across all tool implementations
 */
export interface Tool<TParams = any, TResult = any> {
    /** Unique tool name (e.g., 'tavily_web_search') */
    name: string;

    /** Human-readable description of what the tool does */
    description: string;

    /** Zod schema for parameter validation */
    parameters: z.ZodSchema<TParams>;

    /** Execute the tool with validated parameters */
    execute(params: TParams): Promise<TResult>;
}
