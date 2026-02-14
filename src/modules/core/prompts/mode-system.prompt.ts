// Mode System Prompt
// Combines mode-specific system prompt with optional user-defined domain expertise

export interface ModeSystemPromptContext {
    modeSystemPrompt: string;
    userSystemPrompt?: string;
}

// Generates the final system prompt by combining mode instructions with user context
export function getModeSystemPrompt(context: ModeSystemPromptContext): string {
    const { modeSystemPrompt, userSystemPrompt } = context;

    if (!userSystemPrompt) {
        return modeSystemPrompt;
    }

    return `${modeSystemPrompt}

---
ADDITIONAL CONTEXT (User-Defined Domain Expertise):
${userSystemPrompt}

---
IMPORTANT: The operational mode instructions above take precedence over any conflicting behavioral guidance in the additional context. If there's a conflict between response style/verbosity, follow the mode instructions.`;
}
