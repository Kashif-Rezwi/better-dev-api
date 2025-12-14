import type { OperationalMode, EffectiveMode } from '../modes/mode.config';

/**
 * Tool call metadata
 * Represents a single tool invocation during message generation
 * Based on actual AI SDK response format
 */
export interface ToolCallMetadata {
    /** 
     * Type identifier from AI SDK
     * Format: 'tool-{toolName}' (e.g., 'tool-tavily_web_search')
     * Note: AI SDK uses hyphen after 'tool'
     */
    type: string;

    /** Name of the tool that was called */
    toolName: string;

    /**
     * State of the tool execution
     * Common values: 'output-available', 'call-start', 'error'
     */
    state: string;

    /** Tool execution result/output (available when state is 'output-available') */
    output?: any;

    /** Tool call input/arguments (available during execution) */
    input?: any;

    /** Unique ID for this specific tool call (from streaming events) */
    toolCallId?: string;
}

/**
 * Complete message metadata structure
 * Stores all information about how a message was generated
 */
export interface MessageMetadata {
    /** Tool calls made during message generation */
    toolCalls?: ToolCallMetadata[];

    /** What operational mode was requested */
    operationalMode: OperationalMode;

    /** What mode was actually used (after auto-classification) */
    effectiveMode: EffectiveMode;

    /** Actual AI model name used */
    modelUsed: string;

    /** Number of tokens used in response */
    tokensUsed?: number;

    /** Temperature setting used for generation */
    temperature: number;
}
