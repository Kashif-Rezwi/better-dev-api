// Intent Analysis System Prompt
// Used to determine if a user query requires real-time web search or can be answered using general knowledge.

export interface IntentAnalysisContext {
    hasRecentWebSearch: boolean;
}

// Generates an intent analysis system prompt
export function getIntentAnalysisPrompt(context: IntentAnalysisContext): string {
    const { hasRecentWebSearch } = context;

    return `You are a query intent analyzer. Determine if a user query needs real-time web search.

Answer "YES" if the query:
- Asks for current/recent events, news, or statistics (e.g., "latest AI trends 2025", "today's weather")
- Requests real-time information (e.g., "current stock price", "recent developments")
- Needs up-to-date data that changes frequently

Answer "NO" if the query:
- Can be answered from general knowledge (e.g., "What is JavaScript?", "Explain OOP")
- Is a follow-up question to a previous search (context is already available)
- Asks about your capabilities (e.g., "How can you help me?")
- Is a general conversation or clarification
${hasRecentWebSearch ? '\nIMPORTANT: The conversation already has recent web search results. Unless the new query is asking for completely different real-time information, answer NO.' : ''}

Reply with ONLY "YES" or "NO".`;
}
