import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { Tool } from '../interfaces/tool.interface';
import { TavilyService, WebSearchResult } from '../services/tavily.service';
import { SummaryService } from '../services/summary.service';

// Tool result for web search
export interface WebSearchToolResult {
  query: string;
  results: WebSearchResult[];
  resultsCount: number;
  searchedAt: string;
  summary?: string;
  citations?: Citation[];
}

interface Citation {
  text: string;
  sourceIndex: number;
  url: string;
}

// Web Search Tool - Searches the internet for current information
@Injectable()
export class WebSearchTool implements Tool<any, WebSearchToolResult> {
  readonly name = 'tavily_web_search';

  readonly description =
    'Search the web for current information, news, and real-time data. ' +
    'Use this tool when you need up-to-date information that may not be in your training data, ' +
    'such as recent events, current statistics, latest news, or real-time information. ' +
    'Returns relevant web pages with titles, URLs, and content snippets from authoritative sources.';

  readonly parameters = z.object({
    query: z
      .string()
      .min(1, 'Search query cannot be empty')
      .max(500, 'Search query too long (max 500 characters)')
      .describe(
        'The search query. Be specific and clear. ' +
        'Examples: "latest AI trends 2025", "current weather in Tokyo", "recent tech news"'
      ),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe('Maximum number of search results to return (1-10, default: 5)'),
  });

  private readonly logger = new Logger(WebSearchTool.name);

  constructor(
    private readonly tavilyService: TavilyService,
    private readonly summaryService: SummaryService,
  ) { }

  async execute(params: z.infer<typeof this.parameters>): Promise<WebSearchToolResult> {
    const { query, maxResults = 5 } = params;

    this.logger.log(`🌐 Executing web search: "${query}" (max: ${maxResults})`);

    try {
      // Perform search with retry logic
      const results = await this.tavilyService.searchWithRetry(query, maxResults, 2);

      // Generate summary from results
      const { summary, citations } = await this.summaryService.generateSearchSummary(
        query,
        results,
      );

      const toolResult: WebSearchToolResult = {
        query,
        results,
        resultsCount: results.length,
        searchedAt: new Date().toISOString(),
        summary,
        citations,
      };

      this.logger.log(
        `✅ Web search completed: ${results.length} results for "${query}"`
      );

      return toolResult;
    } catch (error) {
      this.logger.error(`❌ Web search failed for "${query}": ${error.message}`);

      // Return error in a structured way
      throw new Error(
        `Failed to search the web for "${query}". ` +
        `This might be due to API issues or network problems. ` +
        `Error: ${error.message}`
      );
    }
  }
}