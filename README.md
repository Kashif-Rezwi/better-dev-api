# Better DEV AI Backend

> Core server and API for Better DEV, an intelligent AI chat platform with tool-calling capabilities and streaming responses. 

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [API Documentation](#-api-documentation)
- [Tool System](#-tool-system)
- [Deployment](#-deployment)
- [Development](#-development)
- [Environment Variables](#-environment-variables)
- [Contributing](#-contributing)

---

## 🌟 Overview

Better DEV AI Backend is a production-ready NestJS application that powers an intelligent conversational AI platform. It provides:

- **Real-time AI Conversations** with streaming responses using AI SDK v5
- **Intelligent Tool Calling** system with web search capabilities
- **Conversation Management** with persistent storage
- **User Authentication** with JWT-based security
- **Multi-Model AI Support** using Groq (Llama models)
- **Extensible Tool Architecture** for adding custom capabilities

---

## 🏗️ Architecture

### High-Level Design (HLD)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│  (React/Next.js Frontend, Mobile Apps, API Clients)             │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS/REST
                     │ Server-Sent Events (SSE)
┌────────────────────┴────────────────────────────────────────────┐
│                      API Gateway (Nginx)                        │
│  - Load Balancing                                               │
│  - SSL Termination                                              │
│  - Request Routing                                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────────┐
│                   NestJS Application Layer                      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Controllers (REST Endpoints)               │    │
│  │  - AuthController: /auth/*                              │    │
│  │  - ChatController: /chat/*                              │    │
│  │  - HealthController: /health                            │    │
│  └──────────────┬──────────────────────────────────────────┘    │
│                 │                                               │
│  ┌──────────────┴──────────────────────────────────────────┐    │
│  │                  Service Layer                          │    │
│  │                                                         │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐   │    │
│  │  │ AuthService │  │ ChatService  │  │  UserService  │   │    │
│  │  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘   │    │
│  │         │                │                   │          │    │
│  │         │    ┌───────────┴──────────┐       │           │    │
│  │         │    │    AIService         │       │           │    │
│  │         │    │  - streamResponse()  │       │           │    │
│  │         │    │  - generateResponse()│       │           │    │
│  │         │    └───────────┬──────────┘       │           │    │
│  │         │                │                   │          │    │
│  └─────────┼────────────────┼───────────────────┼──────────┘    │
│            │                │                   │               │
│  ┌─────────┴────────────────┴───────────────────┴───────────┐   │
│  │              Tool System (Extensible)                    │   │
│  │                                                          │   │
│  │  ┌──────────────────────────────────────────────────┐    │   │
│  │  │         ToolRegistry (Service Locator)           │    │   │
│  │  │  - register()  - get()  - toAISDKFormat()        │    │   │
│  │  └────────────────────┬─────────────────────────────┘    │   │
│  │                       │                                  │   │
│  │         ┌─────────────┴─────────────┐                    │   │
│  │         │                           │                    │   │
│  │  ┌──────┴────────┐      ┌───────────┴──────┐             │   │
│  │  │ WebSearchTool │      │  Future Tools    │             │   │
│  │  │ - execute()   │      │  - Calculator    │             │   │
│  │  └───────┬───────┘      │  - Weather       │             │   │
│  │          │              │  - ImageGen      │             │   │
│  │  ┌───────┴──────────┐   └──────────────────┘             │   │
│  │  │ TavilyService    │                                    │   │
│  │  │ SummaryService   │                                    │   │
│  │  └──────────────────┘                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │            Data Access Layer (TypeORM)                  │    │
│  │  - Repositories: User, Conversation, Message            │    │
│  │  - Entity Models with Relations                         │    │
│  └──────────────┬──────────────────────────────────────────┘    │
└─────────────────┼───────────────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────────────┐
│                  PostgreSQL Database                            │
│                                                                 │
│  Tables:                                                        │
│  - users (id, email, password, credits, isActive)               │
│  - conversations (id, userId, title, systemPrompt)              │
│  - messages (id, conversationId, role, content, metadata)       │
│                                                                 │
│  Relationships:                                                 │
│  - User 1:N Conversations                                       │
│  - Conversation 1:N Messages                                    │
└─────────────────────────────────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────────────┐
│                   External Services                             │
│  - Groq API (AI Models: Llama 3.1, Llama 3.3)                   │
│  - Tavily API (Web Search)                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Component Interactions

```
User Request Flow:
1. Client → Nginx → NestJS Controller
2. Controller validates JWT via JwtAuthGuard
3. Controller → Service Layer
4. Service Layer → AI Service (with Tool Registry)
5. AI Service → Groq API (streaming)
6. If tool needed → Tool Registry → Specific Tool → External API
7. Stream results back through SSE → Client

Database Transaction Flow:
1. Service Layer → TypeORM Repository
2. Repository → PostgreSQL
3. Response → Service → Controller → Client
```

---

## ✨ Features

### Core Capabilities

- **🤖 Multi-Model AI Support**
  - Fast text generation with Llama 3.1 8B
  - Advanced tool calling with Llama 3.3 70B
  - Automatic model selection based on task

- **🔧 Extensible Tool System**
  - Plugin-based architecture
  - Type-safe tool definitions with Zod
  - Automatic tool registration
  - Built-in web search with Tavily

- **💬 Conversation Management**
  - Persistent conversation history
  - Custom system prompts per conversation
  - Automatic title generation
  - Message metadata (tool calls, citations)

- **🔐 Security**
  - JWT-based authentication
  - Password hashing with bcrypt
  - Request validation with class-validator
  - CORS configuration

- **📡 Real-time Streaming**
  - Server-Sent Events (SSE)
  - AI SDK v5 compatible
  - Tool execution visibility
  - Progress tracking

---

## 🛠️ Tech Stack

### Backend Framework
- **NestJS** - Progressive Node.js framework
- **TypeScript** - Type-safe development
- **Express** - HTTP server

### Database
- **PostgreSQL** - Relational database
- **TypeORM** - ORM with entity management

### AI & Tools
- **AI SDK v5** (Vercel) - Unified AI interface
- **Groq** - Fast AI inference
- **Tavily** - Web search API

### Authentication
- **Passport JWT** - Token-based auth
- **bcrypt** - Password hashing

### Validation
- **class-validator** - DTO validation
- **class-transformer** - Object transformation
- **Zod** - Schema validation for tools

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Nginx** - Reverse proxy & load balancing

---

## 📦 Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** or **yarn**
- **PostgreSQL** 15+
- **Docker** & **Docker Compose** (for containerized setup)
- **Groq API Key** ([Get one here](https://console.groq.com))
- **Tavily API Key** ([Get one here](https://tavily.com))

---

## 🚀 Getting Started

### Option 1: Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/Kashif-Rezwi/better-dev-api.git
   cd better-dev-api
   ```

2. **Create environment file**
   ```bash
   cp .env.docker .env
   ```

3. **Configure environment variables**
   ```bash
   # Edit .env file
   JWT_SECRET=your-super-secret-jwt-key-change-this
   GROQ_API_KEY=gsk_your_groq_api_key
   TAVILY_API_KEY=tvly-your-tavily-api-key
   DEFAULT_AI_MODEL=openai/gpt-oss-120b
   AI_TEXT_MODEL=llama-3.1-8b-instant
   AI_TOOL_MODEL=llama-3.3-70b-versatile
   ```

4. **Start the application**
   ```bash
   npm run docker:up
   ```

5. **Check health**
   ```bash
   curl http://localhost:3001/health
   ```

6. **View logs**
   ```bash
   npm run docker:logs
   ```

### Option 2: Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/Kashif-Rezwi/better-dev-api.git
   cd better-dev-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup PostgreSQL**
   ```bash
   # Install PostgreSQL locally or use Docker
   docker run --name nebula-postgres \
     -e POSTGRES_USER=nebula_ai \
     -e POSTGRES_PASSWORD=nebula_ai \
     -e POSTGRES_DB=nebula_db \
     -p 5432:5432 \
     -d postgres:15-alpine
   ```

4. **Create .env file**
   ```bash
   # Database
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_USER=nebula_ai
   DATABASE_PASSWORD=nebula_ai
   DATABASE_NAME=nebula_db

   # JWT
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRATION=7d

   # App
   PORT=3001
   NODE_ENV=development

   # AI
   GROQ_API_KEY=gsk_your_groq_api_key
   DEFAULT_AI_MODEL=openai/gpt-oss-120b
   AI_TEXT_MODEL=llama-3.1-8b-instant
   AI_TOOL_MODEL=llama-3.3-70b-versatile

   # Tools
   TAVILY_API_KEY=tvly-your-tavily-api-key
   ```

5. **Start development server**
   ```bash
   npm run start:dev
   ```

6. **Access the API**
   - API: http://localhost:3001
   - Health: http://localhost:3001/health

---

## 📁 Project Structure

```
better-dev-api/
├── src/
│   ├── config/                      # Configuration files
│   │   ├── database.config.ts       # Database connection config
│   │   └── jwt.config.ts            # JWT authentication config
│   │
│   ├── common/                      # Shared resources
│   │   └── guards/
│   │       └── jwt-auth.guard.ts    # JWT authentication guard
│   │
│   ├── modules/                     # Feature modules
│   │   ├── auth/                    # Authentication module
│   │   │   ├── dto/                 # Data Transfer Objects
│   │   │   ├── strategies/          # Passport strategies
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.module.ts
│   │   │
│   │   ├── user/                    # User management module
│   │   │   ├── entities/            # Database entities
│   │   │   ├── dto/
│   │   │   ├── user.service.ts
│   │   │   └── user.module.ts
│   │   │
│   │   └── chat/                    # Chat & AI module
│   │       ├── entities/            # Conversation, Message
│   │       ├── dto/
│   │       ├── tools/               # Tool system
│   │       │   ├── implementations/ # Tool implementations
│   │       │   │   └── web-search.tool.ts
│   │       │   ├── interfaces/      # Tool interfaces
│   │       │   ├── services/        # Tool services
│   │       │   │   ├── tavily.service.ts
│   │       │   │   └── summary.service.ts
│   │       │   ├── tool.registry.ts # Tool registry
│   │       │   └── tools.config.ts  # Tool configuration
│   │       ├── chat.controller.ts
│   │       ├── chat.service.ts
│   │       ├── ai.service.ts
│   │       └── chat.module.ts
│   │
│   ├── app.module.ts                # Root module
│   ├── main.ts                      # Application entry point
│   └── health.controller.ts         # Health check endpoint
│
├── nginx/
│   └── nginx.conf                   # Nginx configuration
│
├── docker-compose.yml               # Docker services
├── Dockerfile                       # Production Docker image
├── package.json
├── tsconfig.json
└── README.md
```

---

## 📡 API Documentation

### Base URL
- Development: `http://localhost:3001`
- Production: Configure via Nginx

### Authentication

#### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}

Response: 201 Created
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "credits": 1000
  }
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}

Response: 200 OK
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "credits": 1000
  }
}
```

#### Get Profile
```http
GET /auth/profile
Authorization: Bearer {token}

Response: 200 OK
{
  "userId": "uuid",
  "email": "user@example.com"
}
```

### Conversations

#### Create Conversation with First Message
```http
POST /chat/conversations/with-message
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "New Conversation",
  "systemPrompt": "You are a helpful assistant.",
  "firstMessage": "Hello, how are you?"
}

Response: 201 Created
{
  "id": "conv-uuid",
  "title": "New Conversation",
  "systemPrompt": "You are a helpful assistant.",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

#### List Conversations
```http
GET /chat/conversations
Authorization: Bearer {token}

Response: 200 OK
[
  {
    "id": "uuid",
    "title": "Conversation Title",
    "systemPrompt": "Custom prompt",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z",
    "lastMessage": {
      "id": "msg-uuid",
      "role": "assistant",
      "content": "Last message preview...",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  }
]
```

#### Get Conversation
```http
GET /chat/conversations/{id}
Authorization: Bearer {token}

Response: 200 OK
{
  "id": "uuid",
  "title": "Conversation Title",
  "systemPrompt": "Custom prompt",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "messages": [
    {
      "id": "msg-uuid",
      "role": "user",
      "content": "Hello",
      "createdAt": "2025-01-01T00:00:00.000Z"
    },
    {
      "id": "msg-uuid-2",
      "role": "assistant",
      "content": "Hi there!",
      "createdAt": "2025-01-01T00:00:01.000Z",
      "metadata": {
        "toolCalls": []
      }
    }
  ]
}
```

#### Send Message (Streaming)
```http
POST /chat/conversations/{id}/messages
Authorization: Bearer {token}
Content-Type: application/json

{
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "parts": [
        {
          "type": "text",
          "text": "What's the latest news about AI?"
        }
      ]
    }
  ]
}

Response: 200 OK (Server-Sent Events)
Content-Type: text/event-stream

data: {"type":"text-delta","textDelta":"The latest"}
data: {"type":"text-delta","textDelta":" news..."}
data: {"type":"tool-call-start","toolName":"tavily_web_search"}
data: {"type":"tool-result","result":{...}}
data: {"type":"finish","usage":{...}}
```

#### Update System Prompt
```http
PUT /chat/conversations/{id}/system-prompt
Authorization: Bearer {token}
Content-Type: application/json

{
  "systemPrompt": "You are an expert in AI and machine learning."
}

Response: 200 OK
{
  "id": "uuid",
  "title": "Conversation Title",
  "systemPrompt": "You are an expert in AI and machine learning.",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

#### Generate Title
```http
POST /chat/conversations/{id}/generate-title
Authorization: Bearer {token}
Content-Type: application/json

{
  "message": "What's the weather like today?"
}

Response: 200 OK
{
  "title": "Weather Inquiry"
}
```

#### Delete Conversation
```http
DELETE /chat/conversations/{id}
Authorization: Bearer {token}

Response: 204 No Content
```

### Health Check

```http
GET /health

Response: 200 OK
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "service": "better-dev-ai-chat"
}
```

---

## 🔧 Tool System

### Architecture

The tool system is designed to be extensible and type-safe:

1. **Tool Interface** - Base contract for all tools
2. **Tool Registry** - Central registry for managing tools
3. **Tool Config** - Auto-registers tools on startup
4. **Tool Implementations** - Specific tool logic

### Creating a New Tool

```typescript
// 1. Create tool implementation
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Tool } from '../interfaces/tool.interface';

@Injectable()
export class CalculatorTool implements Tool {
  readonly name = 'calculator';
  
  readonly description = 'Performs basic arithmetic operations';
  
  readonly parameters = z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  });

  async execute(params: z.infer<typeof this.parameters>) {
    const { operation, a, b } = params;
    
    switch (operation) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return a / b;
    }
  }
}

// 2. Register in chat.module.ts
providers: [
  // ... existing providers
  CalculatorTool,
]

// 3. Register in tools.config.ts
onModuleInit() {
  this.toolRegistry.register(this.calculatorTool);
}
```

### Available Tools

#### Web Search Tool (`tavily_web_search`)

Searches the web for current information using Tavily API.

**Parameters:**
- `query` (string): Search query
- `maxResults` (number, optional): Max results (1-10, default: 5)

**Returns:**
```typescript
{
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    favicon: string;
    publishedDate?: string;
    relevanceScore: number;
  }>;
  resultsCount: number;
  searchedAt: string;
  summary: string;
  citations: Array<{
    text: string;
    sourceIndex: number;
    url: string;
  }>;
}
```

---

## 🚢 Deployment

### Docker Compose (Recommended)

```bash
# Build and start all services
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down

# Restart app only
npm run docker:restart
```

### Render.com

1. **Connect Repository** to Render 
2. **Configure Blueprint** using `render.yaml`
3. **Set Environment Variables**:
   - `GROQ_API_KEY`
   - `TAVILY_API_KEY`
   - `JWT_SECRET` (auto-generated)
4. **Deploy** - Render handles the rest

### Manual Deployment

```bash
# Build production image
docker build -t better-dev-api .

# Run production container
docker run -p 3001:3001 \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=... \
  -e GROQ_API_KEY=... \
  -e TAVILY_API_KEY=... \
  better-dev-api
```

---

## 💻 Development

### Available Scripts

```bash
# Development
npm run start:dev        # Start with hot-reload
npm run start:debug      # Start with debugger

# Production
npm run build            # Build for production
npm run start:prod       # Run production build

# Docker
npm run docker:build     # Build Docker images
npm run docker:up        # Start Docker containers
npm run docker:down      # Stop Docker containers
npm run docker:logs      # View logs
npm run docker:restart   # Restart app container

# Testing
npm run test             # Run tests
npm run test:watch       # Run tests in watch mode
npm run test:cov         # Generate coverage report
```

### Code Quality

```bash
# Linting
npx eslint .

# Format code
npx prettier --write "src/**/*.ts"
```

### Database Migrations

```bash
# Generate migration
npx typeorm migration:generate -n MigrationName

# Run migrations
npx typeorm migration:run

# Revert migration
npx typeorm migration:revert
```

---

## 🔐 Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_HOST` | PostgreSQL host | `localhost` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_USER` | Database user | `nebula_ai` |
| `DATABASE_PASSWORD` | Database password | `securepassword` |
| `DATABASE_NAME` | Database name | `nebula_db` |
| `JWT_SECRET` | JWT signing secret | `your-secret-key` |
| `JWT_EXPIRATION` | Token expiration | `7d` |
| `GROQ_API_KEY` | Groq API key | `gsk_...` |
| `TAVILY_API_KEY` | Tavily API key | `tvly-...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `DEFAULT_AI_MODEL` | Default AI model | `openai/gpt-oss-120b` |
| `AI_TEXT_MODEL` | Fast text model | `llama-3.1-8b-instant` |
| `AI_TOOL_MODEL` | Tool calling model | `llama-3.3-70b-versatile` |

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Coding Standards

- Follow TypeScript best practices
- Use meaningful variable/function names
- Write self-documenting code
- Add comments for complex logic
- Maintain consistent formatting (use Prettier)
- Write unit tests for new features

---

## 📄 License

This project is licensed under the UNLICENSED License.

---

## 🙏 Acknowledgments

- [NestJS](https://nestjs.com/) - Framework
- [Vercel AI SDK](https://sdk.vercel.ai/) - AI streaming
- [Groq](https://groq.com/) - Fast AI inference
- [Tavily](https://tavily.com/) - Web search API
- [TypeORM](https://typeorm.io/) - Database ORM

---

## 📞 Support

For questions or issues:
- Open an [Issue](https://github.com/Kashif-Rezwi/better-dev-api/issues)
- Contact: [GitHub Profile](https://github.com/Kashif-Rezwi)

---

**Built with ❤️ using NestJS and TypeScript**
