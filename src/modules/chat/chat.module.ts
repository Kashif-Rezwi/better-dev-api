import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';

// Tool system
import { ToolRegistry } from './tools/tool.registry';
import { ToolsConfig } from './tools/tools.config';

// Tool implementations
import { WebSearchTool } from './tools/implementations/web-search.tool';

// External services
import { TavilyService } from './tools/services/tavily.service';
import { SummaryService } from './tools/services/summary.service';

// Modes system
import { ModesModule } from './modes/modes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message]),
    ModesModule, // Import mode services
  ],
  controllers: [ChatController],
  providers: [
    // Core services
    ChatService,

    // Tool system
    ToolRegistry,
    ToolsConfig, // ← This auto-registers tools on startup

    // Tool implementations
    WebSearchTool,

    // External services
    TavilyService,
    SummaryService,
  ],
  exports: [ChatService],
})
export class ChatModule { }