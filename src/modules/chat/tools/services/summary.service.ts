import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../../../core/ai.service';
import type { UIMessage } from 'ai';
import type { WebSearchResult } from './tavily.service';

interface SummaryWithCitations {
    summary: string;
    citations: Array<{
        text: string;
        sourceIndex: number;
        url: string;
    }>;
}

@Injectable()
export class SummaryService {
    private readonly logger = new Logger(SummaryService.name);

    constructor(private readonly aiService: AIService) { }

    async generateSearchSummary(
        query: string,
        results: WebSearchResult[],
    ): Promise<SummaryWithCitations> {
        this.logger.log(`🤖 Generating summary for: "${query}"`);

        // Build context from search results
        const context = results
            .map((result, index) => {
                return `[${index + 1}] ${result.title}\nURL: ${result.url}\nContent: ${result.snippet}`;
            })
            .join('\n\n');

        // Create system prompt following Claude's best practices
        const messages: UIMessage[] = [
            {
                id: 'system',
                role: 'system',
                parts: [
                    {
                        type: 'text',
                        text: `You are a research assistant that synthesizes web search results into clear, accurate summaries.

CRITICAL RULES:
1. Write a concise summary (2-4 paragraphs) that synthesizes the key information
2. Use inline citations like "[1]", "[2]" to reference sources
3. Place citations immediately after the relevant claim
4. Focus on answering the user's query directly
5. Highlight the most important or consensus information
6. If sources conflict, mention different perspectives with citations
7. Keep the summary factual and objective
8. Do NOT quote sources directly - paraphrase in your own words

Example format:
Recent studies show that AI adoption is accelerating [1]. Companies are particularly focused on automation [2][3]. However, some experts warn about implementation challenges [4].`,
                    },
                ],
            },
            {
                id: 'user',
                role: 'user',
                parts: [
                    {
                        type: 'text',
                        text: `Query: "${query}"\n\nSearch Results:\n${context}\n\nGenerate a comprehensive summary with inline citations.`,
                    },
                ],
            },
        ];

        // Generate summary using text model (fast and cost-effective)
        const summaryText = await this.aiService.generateResponse(messages);

        // Extract citations from the summary
        const citations = this.extractCitations(summaryText, results);

        this.logger.log(`✅ Summary generated with ${citations.length} citations`);

        return {
            summary: summaryText,
            citations,
        };
    }

    private extractCitations(
        summaryText: string,
        results: WebSearchResult[],
    ): Array<{ text: string; sourceIndex: number; url: string }> {
        const citations: Array<{ text: string; sourceIndex: number; url: string }> = [];

        // Find all citation markers like [1], [2], [1][2], etc.
        const citationRegex = /\[(\d+)\]/g;
        let match;

        while ((match = citationRegex.exec(summaryText)) !== null) {
            const sourceIndex = parseInt(match[1]) - 1; // Convert to 0-based index

            if (sourceIndex >= 0 && sourceIndex < results.length) {
                citations.push({
                    text: match[0],
                    sourceIndex,
                    url: results[sourceIndex].url,
                });
            }
        }

        return citations;
    }
}