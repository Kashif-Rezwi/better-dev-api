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
- [Operational Modes](#-operational-modes)
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
│  │         │                │                  │           │    │
│  │         │    ┌───────────┴────────────┐     │           │    │
│  │         │    │    AIService           │     │           │    │
│  │         │    │  - analyzeQueryIntent()│     │           │    │
│  │         │    │  - streamResponseWith  │     │           │    │
│  │         │    │    Mode()              │     │           │    │
│  │         │    │  - generateResponse()  │     │           │    │
│  │         │    └───────────┬────────────┘     │           │    │
│  │         │                │                  │           │    │
│  │         │    ┌───────────┴────────────┐     │           │    │
│  │         │    │ Operational Modes      │     │           │    │
│  │         │    │                        │     │           │    │
│  │         │    │ ┌────────────────────┐ │     │           │    │
│  │         │    │ │ ModeResolver       │ │     │           │    │
│  │         │    │ │ Service            │ │     │           │    │
│  │         │    │ └─────────┬──────────┘ │     │           │    │
│  │         │    │           │            │     │           │    │
│  │         │    │ ┌─────────┴──────────┐ │     │           │    │
│  │         │    │ │ AutoClassifier     │ │     │           │    │
│  │         │    │ │ Service            │ │     │           │    │
│  │         │    │ └─────────┬──────────┘ │     │           │    │
│  │         │    │           │            │     │           │    │
│  │         │    │ ┌─────────┴──────────┐ │     │           │    │
│  │         │    │ │ ClassificationCache│ │     │           │    │
│  │         │    │ │ Service            │ │     │           │    │
│  │         │    │ └────────────────────┘ │     │           │    │
│  │         │    └────────────────────────┘     │           │    │
│  │         │                                   │           │    │
│  └─────────┼───────────────────────────────────┼───────────┘    │
│            │                                   │                │
│  ┌─────────┴────────────────┴──────────────────┴────────────┐   │
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
│  - conversations (id, userId, title, systemPrompt,              │
│                   operationalMode)                              │
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
  - **Native Vision support** with Llama 4 Scout (Automatic detection)
  - Automatic model selection based on task and content type

- **🔧 Extensible Tool System**
  - Plugin-based architecture
  - Type-safe tool definitions with Zod
  - Automatic tool registration
  - Built-in web search with Tavily
  - Automatically determines if queries need web search

- **💬 Conversation Management**
  - Persistent history with JSONB parts support
  - **Subquery Batching**: sidebar loads instantly by fetching only the latest message preview.
  - **O(1) Enrichment**: Map-based lookup for instant attachment injection.
  - Vision History Window: Automatically manages model limits (max 5 images).
  - **Index-Safe Restoration**: Ensures zero data loss during SDK message transformation.

- **🔐 Security**
  - JWT-based authentication
  - Password hashing with bcrypt
  - Request validation with class-validator
  - CORS configuration

- **🎯 Operational Modes** (NEW)
  - **Fast Mode** - Quick responses with Llama 3.1 8B (500 tokens, 0.5 temp)
  - **Thinking Mode** - Deep analysis with Llama 3.3 70B (4000 tokens, 0.7 temp)
  - **Auto Mode** - AI-powered classification (default)
  - Intelligent query complexity detection
  - 5-minute classification caching (70% API call reduction)
  - Per-conversation and per-message mode control
  - Mode metadata tracking in message history

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

## 🧠 AI Service & Intelligent Query Routing

### Query Intent Analysis

The AI Service includes an intelligent query intent analyzer that optimizes tool usage and reduces unnecessary API calls. The `analyzeQueryIntent()` method automatically determines whether a user query requires real-time web search or can be answered from general knowledge.

### How It Works

```typescript
// Automatically analyzes each query
const needsWebSearch = await aiService.analyzeQueryIntent(messages);

// Routes to appropriate model
if (needsWebSearch) {
  // Use tool-calling model with web search
  stream = aiService.streamResponse(messages, tools);
} else {
  // Use fast text model without tools
  stream = aiService.streamResponse(messages);
}
```

### Intelligence Features

**✅ Queries that trigger web search:**
- Current/recent events and news (e.g., "latest AI trends 2025")
- Real-time information (e.g., "today's weather", "current stock price")
- Up-to-date data that changes frequently

**❌ Queries that use general knowledge:**
- General knowledge questions (e.g., "What is JavaScript?", "Explain OOP")
- Follow-up questions to previous searches (context already available)
- Questions about AI capabilities
- General conversation and clarification

### Smart Conversation Context

The analyzer checks recent conversation history (last 3 turns) to detect if web search was recently performed. This prevents redundant searches when:
- User asks follow-up questions about search results
- Context is already available from previous tool calls
- User is refining or clarifying a previous query

### Benefits

- **💰 Cost Optimization** - Avoids unnecessary tool-calling model usage
- **⚡ Faster Responses** - Uses lightweight models when appropriate
- **🎯 Better UX** - Reduces wait time for simple queries
- **🔍 Smarter Tool Usage** - Only searches when truly needed

### Configuration

The feature uses different AI models for different tasks:

```env
# Fast model for query analysis and simple responses
AI_TEXT_MODEL=llama-3.1-8b-instant

# Powerful model for tool calling and complex tasks
AI_TOOL_MODEL=llama-3.3-70b-versatile
```

### Example Flow

```
User: "What is machine learning?"
  ↓
AnalyzeQueryIntent() → NO (general knowledge)
  ↓
Use fast text model → Quick response
  ↓
User: "What are the latest ML breakthroughs in 2025?"
  ↓
AnalyzeQueryIntent() → YES (current events)
  ↓
Use tool model + web search → Real-time results
```

---

## 🎯 Operational Modes

### Overview

The Operational Modes system provides intelligent chat response modes that automatically adjust AI model selection, token limits, and response styles based on query complexity and user preferences.

**Available Modes:**
- **Fast Mode** - Quick, concise responses using lightweight models (Llama 3.1 8B)
- **Thinking Mode** - Detailed, comprehensive responses using advanced models (Llama 3.3 70B)
- **Auto Mode** - AI-powered automatic mode selection based on query complexity (default)

---

### High-Level Design (HLD)

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Request                            │
│  POST /chat/conversations/:id/messages                          │
│  { messages, modeOverride?: "fast"|"thinking"|"auto" }          │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────────┐
│                    ChatController                               │
│  - Validates request                                            │
│  - Extracts modeOverride (optional)                             │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────────┐
│                    ChatService                                  │
│  - handleStreamingResponse()                                    │
└──────────────┬──────────────────────────────────────────────────┘
               │
               │  ┌────────────────────────────────────────────┐
               │  │      MODE RESOLUTION HIERARCHY             │
               │  │                                            │
               │  │  Priority (highest to lowest):             │
               │  │  1. Message-level override (request)       │
               │  │  2. Conversation-level setting (DB)        │
               │  │  3. Default mode ("auto")                  │
               │  └────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    ModeResolverService                           │
│  - resolveMode()                                                 │
│  - getRequestedMode() → Returns: "fast"|"thinking"|"auto"        │
│  - resolveEffectiveMode() → Returns: "fast"|"thinking"           │
└──────────────┬───────────────────────────────────────────────────┘
               │
               │ If mode === "auto"
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                 AutoClassifierService                            │
│  Uses AI to classify query complexity                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │           Classification Logic                           │    │
│  │                                                          │    │
│  │  1. Check ClassificationCacheService (5-min TTL)         │    │
│  │  2. Quick heuristic: queries < 15 chars → fast           │    │
│  │  3. AI classification prompt                             │    │
│  │     - SIMPLE queries → fast mode                         │    │
│  │     - COMPLEX queries → thinking mode                    │    │
│  │  4. Cache result for future requests                     │    │
│  │  5. Timeout fallback: 5s → defaults to fast              │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────┬───────────────────────────────────────────────────┘
               │
               │ Returns: { requested, effective }
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    MODE_CONFIG                                   │
│  Static configuration for each mode                              │
│                                                                  │
│  fast: {                         thinking: {                     │
│    model: llama-3.1-8b-instant     model: llama-3.3-70b-versatile│
│    maxTokens: 500                  maxTokens: 4000               │
│    temperature: 0.5                temperature: 0.7              │
│    systemPrompt: "Be concise"      systemPrompt: "Be detailed"   │
│  }                                }                              │
└──────────────┬───────────────────────────────────────────────────┘
               │
               │ Pass effective mode config
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    AIService                                     │
│  - streamResponseWithMode(messages, effectiveMode, ...)          │
│  - Applies mode config (model, tokens, temperature, prompt)      │
│  - Streams response with configured parameters                   │
└──────────────┬───────────────────────────────────────────────────┘
               │
               │ Stream response + save metadata
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                Message Saved with Metadata                       │
│  {                                                               │
│    content: "...",                                               │
│    metadata: {                                                   │
│      mode: {                                                     │
│        requested: "auto",                                        │
│        effective: "thinking",                                    │
│        modelUsed: "llama-3.3-70b-versatile",                     │
│        temperature: 0.7                                          │
│      }                                                           │
│    }                                                             │
│  }                                                               │
└──────────────────────────────────────────────────────────────────┘
```

---

### Low-Level Design (LLD)

#### Component Breakdown

**1. Mode Types & Configuration (`mode.config.ts`)**

```typescript
// Type definitions
export type OperationalMode = 'fast' | 'thinking' | 'auto';
export type EffectiveMode = 'fast' | 'thinking';

// Configuration per mode
export const MODE_CONFIG: Record<EffectiveMode, ModeConfig> = {
  fast: {
    model: 'llama-3.1-8b-instant',
    maxTokens: 500,
    temperature: 0.5,
    systemPrompt: 'Be extremely concise and direct...'
  },
  thinking: {
    model: 'llama-3.3-70b-versatile',
    maxTokens: 4000,
    temperature: 0.7,
    systemPrompt: 'Provide thorough, comprehensive responses...'
  }
};
```

**2. ModeResolverService** (`mode-resolver.service.ts`)

Resolves operational mode using hierarchy:

```
Request Priority:
  ┌─────────────────────────────────────────┐
  │ 1. modeOverride (API request body)      │ ← Highest priority
  ├─────────────────────────────────────────┤
  │ 2. conversation.operationalMode (DB)    │
  ├─────────────────────────────────────────┤
  │ 3. Default: "auto"                      │ ← Lowest priority
  └─────────────────────────────────────────┘
```

**Key Methods:**
- `resolveMode()` - Main entry point
- `getRequestedMode()` - Determines mode via hierarchy
- `resolveEffectiveMode()` - Converts "auto" to concrete mode

**3. AutoClassifierService** (`auto-classifier.service.ts`)

AI-powered query complexity analysis:

```
Classification Flow:
  ┌─────────────────────────────────────────┐
  │ 1. Extract last user message            │
  ├─────────────────────────────────────────┤
  │ 2. Quick heuristic (< 15 chars → fast)  │
  ├─────────────────────────────────────────┤
  │ 3. Check ClassificationCacheService     │
  │    - Cache hit → return cached mode     │
  ├─────────────────────────────────────────┤
  │ 4. AI classification (with 5s timeout)  │
  │    - Send prompt to lightweight model   │
  │    - "SIMPLE" → fast mode               │
  │    - "COMPLEX" → thinking mode          │
  ├─────────────────────────────────────────┤
  │ 5. Cache result (5-minute TTL)          │
  ├─────────────────────────────────────────┤
  │ 6. Return effective mode                │
  └─────────────────────────────────────────┘
```

**Classification Criteria:**

| Query Type | Mode | Examples |
|------------|------|----------|
| Short questions | Fast | "What is X?", "Define Y" |
| Factual lookups | Fast | "Who invented Z?" |
| Yes/no questions | Fast | "Can I do X?" |
| Multi-part analysis | Thinking | "Compare X and Y in detail" |
| Code implementation | Thinking | "Build a function that..." |
| Debugging requests | Thinking | "Why is this code failing?" |
| Design decisions | Thinking | "Design a system for..." |

**4. ClassificationCacheService** (`classification-cache.service.ts`)

In-memory caching to reduce AI calls:

```
Cache Behavior:
  - TTL: 5 minutes per entry
  - Key: MD5 hash of last user message text
  - Cleanup: Every 60 seconds (removes expired)
  - Storage: Map<string, CacheEntry>
```

**Benefits:**
- Reduces classification API calls by ~70%
- Improves response time for repeated queries
- Automatic expiration ensures fresh classifications

---

### Database Schema

**Conversation Entity** (`conversation.entity.ts`)

```sql
ALTER TABLE conversations ADD COLUMN operational_mode VARCHAR(20);
-- Values: 'fast' | 'thinking' | 'auto' | NULL

-- NULL means use default behavior (auto mode)
```

**Message Metadata** (`message.entity.ts`)

```typescript
// Messages store mode metadata in JSONB
{
  "metadata": {
    "toolCalls": [...],  // Existing tool call data
    "mode": {            // NEW: Mode tracking
      "requested": "auto",
      "effective": "thinking",
      "modelUsed": "llama-3.3-70b-versatile",
      "temperature": 0.7,
      "tokensUsed": null  // Future: token tracking
    }
  }
}
```

---

### API Endpoints

#### **1. Send Message with Mode Override**

```http
POST /chat/conversations/:id/messages
Authorization: Bearer {token}
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "parts": [{ "type": "text", "text": "Explain quantum computing" }]
    }
  ],
  "modeOverride": "thinking"  // Optional: "fast" | "thinking" | "auto"
}

Response: 200 OK (Server-Sent Events)
```

#### **2. Update Conversation Mode**

```http
PUT /chat/conversations/:id/operational-mode
Authorization: Bearer {token}
Content-Type: application/json

{
  "mode": "fast"  // "fast" | "thinking" | "auto"
}

Response: 200 OK
{
  "id": "conv-uuid",
  "title": "Conversation Title",
  "systemPrompt": "...",
  "operationalMode": "fast",  // Updated mode
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

#### **3. Create Conversation with Mode**

```http
POST /chat/conversations/with-message
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "New Chat",
  "systemPrompt": "You are a helpful assistant.",
  "operationalMode": "thinking",  // Optional
  "firstMessage": "Hello!"
}

Response: 201 Created
{
  "id": "conv-uuid",
  "title": "New Chat",
  "operationalMode": "thinking",
  ...
}
```

---

### Request Flow Example

**Scenario:** User sends "Explain how databases work internally" with no mode override

```
1. Request arrives at ChatController
   └─> No modeOverride in request

2. ChatService.handleStreamingResponse()
   └─> Calls ModeResolverService.resolveMode()

3. ModeResolverService.getRequestedMode()
   ├─> Check modeOverride: null
   ├─> Check conversation.operationalMode: null
   └─> Default: "auto"
   └─> Requested mode = "auto"

4. ModeResolverService.resolveEffectiveMode()
   └─> Mode is "auto" → delegate to AutoClassifierService

5. AutoClassifierService.classify()
   ├─> Extract query: "Explain how databases work internally"
   ├─> Length check: 38 chars (> 15) → continue
   ├─> Cache check: MISS (not cached)
   ├─> AI classification prompt sent:
   │   "Query: 'Explain how databases work internally'"
   │   Response: "COMPLEX"
   ├─> Result: "thinking" mode
   └─> Cache result with key: md5(query)

6. Return to ChatService
   └─> { requested: "auto", effective: "thinking" }

7. ChatService gets MODE_CONFIG["thinking"]
   └─> model: llama-3.3-70b-versatile
   └─> maxTokens: 4000
   └─> temperature: 0.7
   └─> systemPrompt: "Provide thorough, comprehensive..."

8. AIService.streamResponseWithMode()
   └─> Apply mode config to streaming request

9. Response streamed to client
   └─> Save message with mode metadata

10. Next identical query
    └─> Cache HIT → skip AI classification
    └─> Instant mode resolution (< 1ms)
```

---

### Performance Characteristics

| Operation | Latency | Notes |
|-----------|---------|-------|
| Mode resolution (no auto) | < 1ms | Direct lookup |
| Cache hit (auto mode) | < 1ms | MD5 hash lookup |
| Cache miss (auto mode) | ~100-500ms | AI classification call |
| Classification timeout | 5s | Fallback to fast mode |

**Optimization Strategies:**
- ✅ 5-minute cache TTL reduces 70% of classification calls
- ✅ Heuristic pre-filter (< 15 chars) ~10% speedup
- ✅ 5-second timeout prevents hanging requests
- ✅ Fail-safe: errors → default to fast mode

---

### Configuration

**Environment Variables:**

```env
# Fast mode model (lightweight, quick responses)
AI_TEXT_MODEL=llama-3.1-8b-instant

# Thinking mode model (powerful, detailed responses)
AI_TOOL_MODEL=llama-3.3-70b-versatile
```

**Mode Customization:**

Edit `src/modules/chat/modes/mode.config.ts`:

```typescript
export const MODE_CONFIG: Record<EffectiveMode, ModeConfig> = {
  fast: {
    model: process.env.AI_TEXT_MODEL || 'llama-3.1-8b-instant',
    maxTokens: 500,        // Adjust max response length
    temperature: 0.5,      // Adjust creativity (0.0 - 1.0)
    systemPrompt: '...'    // Customize behavior
  },
  thinking: {
    model: process.env.AI_TOOL_MODEL || 'llama-3.3-70b-versatile',
    maxTokens: 4000,
    temperature: 0.7,
    systemPrompt: '...'
  }
};
```

---

### Benefits

**For Users:**
- 🚀 **Faster responses** for simple queries (fast mode)
- 🧠 **Deeper answers** for complex questions (thinking mode)
- 🤖 **Automatic optimization** with auto mode (default)
- 🎯 **Manual control** via mode override or conversation settings

**For System:**
- 💰 **Cost optimization** - Use lightweight models when appropriate
- ⚡ **Performance** - Faster responses with smaller models
- 📊 **Observability** - Mode metadata tracked per message
- 🔧 **Flexibility** - Easy to add new modes or adjust configs

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

This API is deployed on **Render** (free tier) with **Neon** serverless PostgreSQL and **Cloudflare R2** object storage — a fully managed, $0/month production stack.

**Live API**: `https://api.betterdev.in`

---

### Production Architecture

```
GitHub (push to main)
       ↓ native Git webhook (auto-deploy)
Render Web Service (Node 20, Singapore region)
       ↓ health check: GET /health
Custom Domain: api.betterdev.in
       ↓ (Hostinger DNS CNAME → better-dev-api.onrender.com)
       ├──────────────┬───────────────────────┐
       ▼              ▼                       ▼
Neon PostgreSQL   Cloudflare R2          External APIs
(serverless,      (attachments,          (Groq, Tavily)
 free tier)        zero egress)
```

### Render Configuration

| Setting | Value |
| :--- | :--- |
| Service Type | Web Service (Node runtime) |
| Plan | Free |
| Region | Singapore |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start:prod` |
| Health Check Path | `/health` |
| Auto-Deploy | Enabled on `main` |

Infrastructure is codified in [`render.yaml`](render.yaml) (Render Blueprint). All configuration keys are documented in [`.env.example`](.env.example).

> **Free-tier note:** the Render free plan spins down after ~15 minutes of inactivity; the first request after idle takes ~30–60s (cold start). Optionally ping `/health` every 10 minutes with a free monitor (e.g. UptimeRobot, cron-job.org) to keep it warm.

### Managing the Deployment

```bash
# Check health
curl https://api.betterdev.in/health
```

- **Logs / shell / rollbacks:** Render Dashboard → `better-dev-api` → Logs / Shell / Deploys (one-click rollback to any previous green deploy).
- **Database:** Neon Dashboard → `better-dev-db` (branching, query editor, monitoring).
- **CI:** GitHub Actions (`.github/workflows/deploy.yml`) verifies the TypeScript build on every push/PR to `main`. Render handles deployment itself via the Git webhook — no SSH, no servers.

---

### Legacy Infrastructure (Historical Reference)

> ⚠️ **Deprecated.** The API previously ran on a single DigitalOcean VPS (Ubuntu 22.04) with Docker, host-installed PostgreSQL, Nginx + Certbot SSL, and SSH-based GitHub Actions deploys. That droplet has been terminated and this setup no longer exists. The steps below are kept for historical reference only — **do not follow them for new deployments.**

#### 🌐 DigitalOcean VPS Deployment (Deprecated)

##### **Step 1: Prepare the VPS**

1. **Create a DigitalOcean Droplet** with Ubuntu 22.04 LTS
2. **SSH into the server**:
   ```bash
   ssh root@your-server-ip
   ```

3. **Create a non-root user** (best practice):
   ```bash
   adduser kashif
   usermod -aG sudo kashif
   su - kashif
   ```

---

##### **Step 2: Install Docker & Docker Compose**

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group (no sudo needed)
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

---

##### **Step 3: Install PostgreSQL on VPS**

Instead of running PostgreSQL in Docker, we use a standalone database for stability and performance:

```bash
# Install PostgreSQL 14
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql

CREATE DATABASE better_dev_db;
CREATE USER better_dev WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE better_dev_db TO better_dev;
\q

# Configure PostgreSQL to accept connections
sudo nano /etc/postgresql/14/main/postgresql.conf
# Set: listen_addresses = '*'

sudo nano /etc/postgresql/14/main/pg_hba.conf
# Add: host all all 0.0.0.0/0 md5

sudo systemctl restart postgresql

# Open firewall (if using UFW)
sudo ufw allow 5432/tcp
```

---

##### **Step 4: Clone Repository**

```bash
cd ~
git clone https://github.com/Kashif-Rezwi/better-dev-api.git
cd better-dev-api
```

---

##### **Step 5: Configure Environment**

Create `.env` file:

```bash
nano .env
```

Add environment variables:

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=better_dev
DATABASE_PASSWORD=your_secure_password
DATABASE_NAME=better_dev_db

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRATION=7d

# App
PORT=3001
NODE_ENV=production

# AI
GROQ_API_KEY=gsk_your_groq_api_key
DEFAULT_AI_MODEL=openai/gpt-oss-120b
AI_TEXT_MODEL=llama-3.1-8b-instant
AI_TOOL_MODEL=llama-3.3-70b-versatile

# Tools
TAVILY_API_KEY=tvly-your-tavily-api-key
```

---

##### **Step 6: Build & Start Docker Container**

```bash
# Build Docker image
docker compose build --no-cache

# Start container in detached mode
docker compose up -d

# Verify API is running
curl http://localhost:3001/health

# View logs
docker compose logs -f
```

---

##### **Step 7: Install & Configure Nginx Reverse Proxy**

```bash
# Install Nginx
sudo apt update
sudo apt install nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/api.betterdev.in
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name api.betterdev.in;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
# Create symbolic link
sudo ln -sf /etc/nginx/sites-available/api.betterdev.in /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

##### **Step 8: Enable HTTPS with Certbot (Free SSL)**

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain SSL certificate (auto-configures Nginx)
sudo certbot --nginx -d api.betterdev.in

# Verify auto-renewal
sudo certbot renew --dry-run
```

Now your API is accessible at: **`https://api.betterdev.in`**

---

##### **Step 9: Set Up GitHub Actions CI/CD (Auto Deploy)**

This enables automatic deployment on every push to `main` branch.

**On the VPS:**

1. **Generate SSH key for deployments** (no passphrase):
   ```bash
   ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy
   
   # Add public key to authorized_keys
   cat ~/.ssh/github_actions_deploy.pub >> ~/.ssh/authorized_keys
   
   # Copy private key (you'll add this to GitHub Secrets)
   cat ~/.ssh/github_actions_deploy
   ```

**On GitHub:**

2. **Add SSH private key to GitHub Secrets**:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Add secret: `SSH_PRIVATE_KEY` (paste the private key content)
   - Add secret: `SERVER_IP` (your VPS IP address)
   - Add secret: `SERVER_USER` (your username, e.g., `kashif`)

3. **Create GitHub Actions workflow**:

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to DigitalOcean

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.SERVER_IP }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd ~/better-dev-api
            git pull origin main
            docker compose down
            docker compose up -d --build
            docker compose logs --tail=50
```

Now, every push to `main` automatically deploys to production! 🚀

---

#### 🎯 Production Features (Legacy)

✅ **Auto Deploy** - Push to GitHub → automatic deployment  
✅ **Auto Restart** - Docker restarts API if it crashes  
✅ **Health Checks** - Docker monitors API health  
✅ **SSL Auto-Renew** - Free HTTPS with auto-renewal  
✅ **Isolated Database** - PostgreSQL runs independently  
✅ **Reverse Proxy** - Nginx handles all traffic  
✅ **Production-Grade** - Enterprise-level architecture  

---

#### 🔄 Managing Deployment (Legacy)

```bash
# SSH into VPS
ssh kashif@your-server-ip

# View logs
cd ~/better-dev-api
docker compose logs -f

# Restart API
docker compose restart

# Rebuild and restart
docker compose down
docker compose up -d --build

# Check health
curl https://api.betterdev.in/health

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Check SSL certificate
sudo certbot certificates
```

---

### 🐳 Local Docker Development

For local development with Docker:

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
- **Performance**: Use O(1) Map Lookups for data enrichment (avoid O(n) finds).
- **Optimization**: Use Column-Selective Queries to reduce DB I/O.
- **Memory**: Use memory-safe mapping instead of deep-cloning large history objects.

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
