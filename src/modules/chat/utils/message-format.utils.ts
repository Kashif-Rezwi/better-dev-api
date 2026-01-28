import type { UIMessage } from 'ai';

export class MessageFormatUtils {
    /**
     * Ensure messages are in the correct format for AI SDK
     * Converts 'parts' to 'content' if needed
     */
    static ensureAISDKFormat(messages: UIMessage[]): any[] {
        return messages.map(msg => {
            // If message has parts, convert to content format
            if (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0) {
                const content = msg.parts.map((part: any) => {
                    // Text parts
                    if (part.type === 'text') {
                        return { type: 'text', text: part.text || '' };
                    }
                    // Image parts  
                    if (part.type === 'image') {
                        return {
                            type: 'image',
                            image: part.image || part.url
                        };
                    }
                    // File parts
                    if (part.type === 'file') {
                        return {
                            type: 'file',
                            data: part.data,
                            mimeType: part.mimeType
                        };
                    }
                    // Pass through other types as-is
                    return part;
                });

                return {
                    role: msg.role,
                    content,
                    ...(msg.id && { id: msg.id })
                };
            }

            // If message has content already, use it
            if ((msg as any).content) {
                return msg;
            }

            // Fallback: return as-is
            return msg;
        });
    }
}
