import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Tool } from './interfaces/tool.interface';
import { z } from 'zod';

// Central registry for all available tools, Acts as a service locator pattern for tools
@Injectable()
export class ToolRegistry implements OnModuleInit {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly tools = new Map<string, Tool>();

  // Lifecycle hook - runs when module initializes
  onModuleInit() {
    this.logger.log(`Tool Registry initialized with ${this.tools.size} tools`);

    if (this.tools.size > 0) {
      this.logger.log('Available tools:');
      this.tools.forEach((tool) => {
        this.logger.log(`  - ${tool.name}: ${tool.description}`);
      });
    } else {
      this.logger.warn('No tools registered yet!');
    }
  }

  // Register a new tool
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(
        `Tool with name '${tool.name}' is already registered. ` +
        `Tool names must be unique.`,
      );
    }

    // Validate tool structure
    this.validateTool(tool);

    const wrappedTool = this.wrapToolWithLogging(tool);
    this.tools.set(tool.name, wrappedTool);

    this.logger.log(`✅ Registered tool: ${tool.name}`);
  }

  // Get a tool by name
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  // Get all registered tools
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  // Check if a tool exists
  has(name: string): boolean {
    return this.tools.has(name);
  }

  // Get tool names as array
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  // Get tool count
  getCount(): number {
    return this.tools.size;
  }

  // Convert tools to AI SDK format
  toAISDKFormat(): Record<string, any> {
    const aiTools: Record<string, any> = {};

    this.tools.forEach((tool) => {
      aiTools[tool.name] = {
        description: tool.description,
        inputSchema: tool.parameters,
        execute: tool.execute.bind(tool),
      };
    });

    this.logger.debug(`Converted ${this.tools.size} tools to AI SDK format`);
    return aiTools;
  }

  // Validate tool structure before registration
  private validateTool(tool: Tool): void {
    if (!tool.name) {
      throw new Error('Tool must have a name');
    }

    if (typeof tool.name !== 'string') {
      throw new Error('Tool name must be a string');
    }

    // Validate name format (lowercase, underscores only)
    if (!/^[a-z_]+$/.test(tool.name)) {
      throw new Error(
        `Tool name '${tool.name}' is invalid. ` +
        `Use lowercase letters and underscores only (e.g., 'web_search')`,
      );
    }

    if (!tool.description) {
      throw new Error(`Tool '${tool.name}' must have a description`);
    }

    if (!tool.parameters) {
      throw new Error(`Tool '${tool.name}' must have parameters schema`);
    }

    // Validation check: runs at startup.
    try {
      z.toJSONSchema(tool.parameters, { target: 'openapi-3.0' });
    } catch (error: any) {
      throw new Error(
        `Tool '${tool.name}' has invalid parameters schema: ${error.message}`,
      );
    }

    if (typeof tool.execute !== 'function') {
      throw new Error(`Tool '${tool.name}' must have an execute method`);
    }
  }

  private wrapToolWithLogging(tool: Tool): Tool {
    const originalExecute = tool.execute.bind(tool);

    return {
      ...tool,
      execute: async (params: any) => {
        const startTime = Date.now();

        // 📥 Log tool start
        this.logger.log({
          event: 'tool_execution_start',
          tool: tool.name,
          params: params,
          timestamp: new Date().toISOString(),
        });

        try {
          // Execute the actual tool
          const result = await originalExecute(params);
          const duration = Date.now() - startTime;

          // ✅ Log tool success
          this.logger.log({
            event: 'tool_execution_success',
            tool: tool.name,
            duration: duration,
            resultSize: JSON.stringify(result).length,
            timestamp: new Date().toISOString(),
          });

          return result;
        } catch (error: any) {
          const duration = Date.now() - startTime;

          // ❌ Log tool error
          this.logger.error({
            event: 'tool_execution_error',
            tool: tool.name,
            duration: duration,
            error: error.message,
            timestamp: new Date().toISOString(),
          });

          throw error;
        }
      }
    };
  }

  // Clear all tools (useful for testing)
  clear(): void {
    this.tools.clear();
    this.logger.warn('All tools cleared from registry');
  }
}