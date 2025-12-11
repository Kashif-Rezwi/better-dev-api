import { UIMessage } from 'ai';

/**
 * Represents different message formats we might receive
 */
export interface LegacyMessage {
    role: 'user' | 'assistant';
    content: string;
    parts?: never;
}

export interface StandardMessage {
    role: 'user' | 'assistant';
    parts: Array<{ type: string; text?: string;[key: string]: any }>;
    content?: never;
}

export type FlexibleMessage = UIMessage | LegacyMessage | StandardMessage;

/**
 * Centralized utility class for handling message parsing and normalization
 */
export class MessageUtils {
    /**
     * Extract text content from any message format
     * @param message - Message in any supported format
     * @returns Extracted text content
     */
    static extractText(message: FlexibleMessage): string {
        // Handle legacy format with content string
        if ('content' in message && typeof message.content === 'string') {
            return message.content;
        }

        // Handle standard format with parts array
        if ('parts' in message && Array.isArray(message.parts)) {
            return message.parts
                .filter((part): part is { type: string; text: string } =>
                    part.type === 'text' && 'text' in part && typeof part.text === 'string'
                )
                .map((part) => part.text)
                .join('');
        }

        return '';
    }

    /**
     * Normalize a message to the standard UIMessage format with parts
     * @param message - Message in any supported format
     * @returns Normalized UIMessage with parts array
     */
    static normalize(message: FlexibleMessage): UIMessage {
        // If already in standard format with parts, return as-is
        if ('parts' in message && Array.isArray(message.parts) && message.parts.length > 0) {
            return message as UIMessage;
        }

        // Convert legacy format to standard format
        if ('content' in message && typeof message.content === 'string') {
            return {
                role: message.role,
                parts: [{ type: 'text', text: message.content }],
            } as UIMessage;
        }

        // Fallback: create empty message
        return {
            role: message.role,
            parts: [{ type: 'text', text: '' }],
        } as UIMessage;
    }

    /**
     * Normalize an array of messages
     * @param messages - Array of messages in any format
     * @returns Array of normalized UIMessages
     */
    static normalizeAll(messages: FlexibleMessage[]): UIMessage[] {
        return messages.map((msg) => this.normalize(msg));
    }

    /**
     * Check if a message contains tool-related content
     * @param message - Message to check
     * @returns True if message contains tool content
     */
    static hasToolContent(message: FlexibleMessage, toolName?: string): boolean {
        // Check in parts array
        if ('parts' in message && Array.isArray(message.parts)) {
            return message.parts.some((part: any) => {
                const hasToolType = part.type?.includes('tool');
                const hasToolName = toolName ? part.toolName === toolName : part.toolName;
                return hasToolType || hasToolName;
            });
        }

        // Check in content string (legacy format)
        if ('content' in message && typeof message.content === 'string') {
            return toolName
                ? message.content.includes(toolName)
                : message.content.includes('tool');
        }

        return false;
    }

    /**
     * Validate that a message has extractable content
     * @param message - Message to validate
     * @returns True if message has valid content
     */
    static hasContent(message: FlexibleMessage): boolean {
        return this.extractText(message).trim().length > 0;
    }

    /**
     * Get the last user message from a conversation
     * @param messages - Array of messages
     * @returns Last user message or undefined
     */
    static getLastUserMessage(messages: FlexibleMessage[]): FlexibleMessage | undefined {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                return messages[i];
            }
        }
        return undefined;
    }
}
