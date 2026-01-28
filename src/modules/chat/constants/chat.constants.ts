/**
 * Configuration constants for the chat service
 */

/**
 * Maximum number of tool call iterations allowed in a single AI response
 * This prevents infinite loops in tool calling scenarios
 */
export const MAX_TOOL_ITERATIONS = 5;

/**
 * Maximum length of content preview for conversation list
 */
export const CONTENT_PREVIEW_LENGTH = 100;

/**
 * Number of recent messages to check for web search history
 * Used to avoid redundant web searches
 */
export const WEB_SEARCH_HISTORY_DEPTH = 6; // 3 turns (user + assistant)
