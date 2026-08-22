# Better DEV AI Backend

> Core server and API for Better DEV, an intelligent, multi-modal AI chat platform with tool-calling capabilities, file processing (OCR & document extraction), dynamic operational modes, and real-time streaming responses.

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeORM](https://img.shields.io/badge/TypeORM-0.3-FE0803?style=flat&logo=typeorm&logoColor=white)](https://typeorm.io/)
[![AI SDK](https://img.shields.io/badge/Vercel_AI_SDK-v5-black?style=flat&logo=vercel&logoColor=white)](https://sdk.vercel.ai/)

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [API Documentation](#-api-documentation)
- [Operational Modes](#-operational-modes)
- [Tool System](#-tool-system)
- [Multi-Modal & File Processing Pipeline](#-multi-modal--file-processing-pipeline)
- [Environment Variables](#-environment-variables)
- [Getting Started](#-getting-started)
- [Testing](#-testing)
- [Deployment & Infrastructure](#-deployment--infrastructure)

---

## 🌟 Overview

Better DEV AI Backend is a production-ready NestJS 11 application powering an intelligent multi-modal conversational AI system. It provides:

- **Real-time AI Conversations** with Server-Sent Events (SSE) streaming using Vercel AI SDK v5.
- **Multi-Modal Document & Image Processing** with Tesseract OCR, PDF parsing, Word document text extraction, and Cloudflare R2 / S3 storage.
- **Intelligent Tool Execution** with autonomous web search query intent analysis powered by Tavily.
- **Dynamic Operational Modes** (Fast, Thinking, Vision, Auto-Classifier with 5-minute MD5 query caching).
- **Enterprise-Grade Reliability**: Global exception formatting, structured latency logging interceptor, transaction boundaries for multi-table writes, and composite database indexing.
- **Stateless JWT Authentication** with bcrypt password hashing and strongly typed `@CurrentUser()` request context.

---

## 🏗️ Architecture

### High-Level Design (HLD)

```mermaid
graph TD
    subgraph Client_Layer["Client Layer (better-dev-ui)"]
        UI_Upload["POST /attachments/upload (Multer)"]
        UI_Chat["POST /chat/conversations/:id/messages (SSE)"]
        UI_List["GET /chat/conversations"]
    end

    subgraph Security_Middleware["Security & Middleware Layer"]
        Guard["JwtAuthGuard + @CurrentUser()"]
        Filter["GlobalExceptionFilter (Uniform JSON Errors)"]
        Logging["LoggingInterceptor (Latency & Status)"]
        Validation["ValidationPipe (Whitelist + Transform)"]
    end

    subgraph Domain_Modules["Domain Modules"]
        AuthM["AuthModule<br/>(JWT, Password Hashing)"]
        UserM["UserModule<br/>(User Account Management)"]
        AttachM["AttachmentModule<br/>(Storage, OCR, Ownership)"]
        ChatM["ChatModule<br/>(Conversation Lifecycle, SSE)"]
        ModesM["ModesModule<br/>(Auto-Classification, Caching)"]
        CoreM["CoreModule (@Global)<br/>(AIService, Provider Config)"]
    end

    subgraph Data_Storage["Data & Storage Infrastructure"]
        Postgres[("Neon PostgreSQL<br/>(TypeORM 0.3 + Composite Indexes)")]
        Storage[("Object Storage<br/>(Cloudflare R2 / AWS S3 / Local)")]
    end

    UI_Upload --> Guard --> Validation --> AttachM
    UI_Chat --> Guard --> Validation --> ChatM
    UI_List --> Guard --> Validation --> ChatM

    AuthM --> UserM
    AttachM --> Postgres
    AttachM --> Storage

    ChatM --> ModesM
    ChatM --> AttachM
    ChatM --> CoreM
    ChatM --> Postgres
    ModesM --> CoreM
```

---

## ✨ Features

### 1. Multi-Modal Chat & Streaming
- **AI SDK v5 Compatible SSE Streaming**: Real-time response streaming with client disconnection cancellation listeners (`req.on('close')`).
- **Vision History Window**: Detects images in chat history and keeps visual data for the most recent 3 user messages to avoid model token limits.
- **O(1) Map-Based Context Enrichment**: Pre-fetches conversation attachments into an in-memory `Map` to inject extracted document text without $O(N^2)$ array lookups.
- **Subquery Batching**: `getUserConversations` fetches conversation metadata and latest message previews in a single `DISTINCT ON` query.

### 2. Operational Modes
- **Fast Mode**: Low latency, lightweight text generation with `llama-3.1-8b-instant` (500 tokens, 0.5 temperature).
- **Thinking Mode**: High-reasoning model with `llama-3.3-70b-versatile` (4000 tokens, 0.7 temperature).
- **Vision Mode**: Auto-detected visual model (`meta-llama/llama-4-scout-17b-16e-instruct` or configured vision model) when image attachments are present.
- **Auto Mode**: Evaluates query complexity via fast heuristic pre-filtering and LLM analysis, cached for 5 minutes via in-memory MD5 cache.

### 3. File Processing & Object Storage
- **Unified Storage Driver**: Provider-agnostic S3/Cloudflare R2/Local storage driver with native `crypto.randomUUID()`.
- **In-Process Content Extraction**:
  - Images: OCR text extraction via Tesseract.js and thumbnail generation via Sharp.
  - PDFs: Text extraction via `pdf-parse`.
  - Documents: Word `.docx` parsing via `mammoth`.
- **Ownership Verification**: Enforces that users can only attach files to conversations they own.

### 4. Enterprise Architecture & Reliability
- **Transactional Consistency**: Multi-table operations execute within `dataSource.transaction(...)`.
- **Database Indexing**: Composite indexes on `(conversationId, createdAt ASC)` and `(userId, updatedAt DESC)` prevent sequential scans.
- **Global Error Envelope**: Uniform JSON error responses across all endpoints.

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Framework** | NestJS 11, TypeScript 5.7, Express 5 |
| **AI Engine** | Vercel AI SDK v5, Groq SDK, `@ai-sdk/openai` |
| **Database & ORM** | PostgreSQL 16 (Neon Serverless), TypeORM 0.3 |
| **Object Storage** | AWS S3 SDK v3 (Cloudflare R2 / AWS S3 / Local Disk) |
| **File Processing** | Tesseract.js, Sharp, `pdf-parse`, `mammoth` |
| **Validation & Auth** | `class-validator`, `class-transformer`, Passport JWT, bcrypt |
| **Search & Tools** | Tavily Web Search API, Zod schema validation |

---

## 📁 Project Structure

```
better-dev-api/
├── architectures/                   # Architectural blueprints & documentation
│   ├── ARCHITECTURE_CURRENT.md      # Current modular target architecture
│   ├── ARCHITECTURE_LEGACY.md       # Historical DigitalOcean VPS reference
│   └── ARCHITECTURE_PROPOSED.md     # Future BullMQ + RAG roadmap
│
├── src/
│   ├── common/                      # Cross-cutting HTTP & security primitives
│   │   ├── decorators/              # @CurrentUser() parameter decorator
│   │   ├── filters/                 # GlobalExceptionFilter
│   │   ├── guards/                  # JwtAuthGuard
│   │   ├── interceptors/            # LoggingInterceptor
│   │   └── interfaces/              # AuthUser interface
│   │
│   ├── config/                      # Environment & module configuration
│   │   ├── database.config.ts       # TypeORM PostgreSQL connection config
│   │   └── jwt.config.ts            # JWT expiration & secret config
│   │
│   ├── modules/
│   │   ├── core/                    # Global AI intelligence layer
│   │   │   ├── config/              # mode.config.ts, model.config.ts, provider.config.ts
│   │   │   ├── constants/           # ai.constants.ts
│   │   │   ├── prompts/             # System prompts & query intent analysis prompts
│   │   │   ├── utils/               # message.utils.ts, model-loader.util.ts
│   │   │   ├── ai.service.ts        # AI single-pass streaming & context management
│   │   │   └── core.module.ts
│   │   │
│   │   ├── auth/                    # Authentication module
│   │   │   ├── dto/                 # RegisterDto, LoginDto
│   │   │   ├── strategies/          # JwtStrategy
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.module.ts
│   │   │
│   │   ├── user/                    # User account management
│   │   │   ├── entities/            # User entity
│   │   │   ├── user.service.ts
│   │   │   └── user.module.ts
│   │   │
│   │   ├── attachment/              # File upload, storage & OCR
│   │   │   ├── dto/                 # UploadAttachmentDto
│   │   │   ├── entities/            # Attachment entity
│   │   │   ├── services/            # StorageService, FileProcessorService
│   │   │   ├── attachment.controller.ts
│   │   │   ├── attachment.service.ts
│   │   │   └── attachment.module.ts
│   │   │
│   │   └── chat/                    # Chat orchestration & modes
│   │       ├── dto/                 # ChatRequestDto, GenerateTitleDto, UpdateConversationDto
│   │       ├── entities/            # Conversation, Message entities
│   │       ├── modes/               # AutoClassifierService, ModeResolverService, ClassificationCacheService
│   │       ├── tools/               # ToolRegistry, TavilyService, WebSearchTool
│   │       ├── chat.controller.ts
│   │       ├── chat.service.ts
│   │       └── chat.module.ts
│   │
│   ├── app.module.ts                # Root application module
│   ├── main.ts                      # NestJS bootstrap entry point
│   └── health.controller.ts         # /health endpoint
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## 📡 API Documentation

### Base URL
- **Local**: `http://localhost:3001`
- **Production**: `https://better-dev-api.onrender.com`

---

### Authentication Endpoints (`/auth`)

#### 1. Register User
```http
POST /auth/register
Content-Type: application/json

{
  "email": "developer@example.com",
  "password": "securePassword123"
}
```
**Response (201 Created):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "7b8e3a21-93bf-4c7a-a63e-251f280a9db5",
    "email": "developer@example.com"
  }
}
```

#### 2. Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "developer@example.com",
  "password": "securePassword123"
}
```
**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "7b8e3a21-93bf-4c7a-a63e-251f280a9db5",
    "email": "developer@example.com"
  }
}
```

#### 3. Get Current Profile
```http
GET /auth/profile
Authorization: Bearer <JWT_TOKEN>
```
**Response (200 OK):**
```json
{
  "userId": "7b8e3a21-93bf-4c7a-a63e-251f280a9db5",
  "email": "developer@example.com"
}
```

#### 4. Logout
```http
POST /auth/logout
Authorization: Bearer <JWT_TOKEN>
```
**Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

---

### Chat Endpoints (`/chat`)

#### 1. Create Conversation with First Message
```http
POST /chat/conversations/with-message
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "title": "React Performance Audit",
  "firstMessage": "How do I optimize React 19 rendering?",
  "systemPrompt": "You are a senior frontend architect."
}
```

#### 2. List User Conversations
```http
GET /chat/conversations
Authorization: Bearer <JWT_TOKEN>
```

#### 3. Get Single Conversation with Ordered Messages
```http
GET /chat/conversations/:id
Authorization: Bearer <JWT_TOKEN>
```

#### 4. Update Conversation Title or System Prompt
```http
PATCH /chat/conversations/:id
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "title": "Renamed Conversation Title"
}
```

#### 5. Send Message (AI SDK v5 SSE Stream)
```http
POST /chat/conversations/:id/messages
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "parts": [{ "type": "text", "text": "Analyze this document" }]
    }
  ],
  "modeOverride": "thinking"
}
```
**Response:** Server-Sent Events (SSE) text & tool delta stream.

#### 6. Auto-Generate Title
```http
POST /chat/conversations/:id/generate-title
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "message": "Can you explain Postgres indexing strategies?"
}
```

#### 7. Update System Prompt
```http
PUT /chat/conversations/:id/system-prompt
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "systemPrompt": "You are an expert PostgreSQL DBA."
}
```

#### 8. Delete Conversation
```http
DELETE /chat/conversations/:id
Authorization: Bearer <JWT_TOKEN>
```

---

### Attachment Endpoints (`/attachments`)

#### 1. Upload Attachment
```http
POST /attachments/upload
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

file: [Binary File: PDF, Image, DOCX]
conversationId: "e231e244-a97a-4883-9b8c-07c63e8cadfe"
messageId: "optional-uuid"
```

#### 2. Get Attachment Metadata
```http
GET /attachments/:id
Authorization: Bearer <JWT_TOKEN>
```

#### 3. Delete Attachment
```http
DELETE /attachments/:id
Authorization: Bearer <JWT_TOKEN>
```

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```env
# Application
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Authentication
JWT_SECRET=super-secret-jwt-signing-key-minimum-32-chars
JWT_EXPIRATION=7d

# Database (PostgreSQL / Neon)
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
# Or individual DB variables:
# DATABASE_HOST=localhost
# DATABASE_PORT=5432
# DATABASE_USER=postgres
# DATABASE_PASSWORD=postgres
# DATABASE_NAME=better_dev_db
# DATABASE_SSL=false

# AI Providers & Keys
GROQ_API_KEY=gsk_your_groq_api_key
DEFAULT_AI_MODEL=openai/gpt-oss-120b
AI_TEXT_MODEL=openai/gpt-oss-20b
AI_TOOL_MODEL=openai/gpt-oss-120b
AI_VISION_MODEL=openai/gpt-oss-120b

# Search Tools
TAVILY_API_KEY=tvly-your-tavily-api-key

# Storage (Cloudflare R2 / AWS S3 / Supabase Storage)
USE_S3_STORAGE=true
S3_REGION=auto
S3_BUCKET=better-dev-attachments
S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_READ=false
S3_CDN_URL=https://your-cdn-domain.com
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run start:dev
```
API will be live at `http://localhost:3001`. Health check available at `http://localhost:3001/health`.

### 3. Production Build
```bash
npm run build
npm run start:prod
```

---

## 🧪 Testing

The repository includes a comprehensive Jest unit test suite:

```bash
# Run all unit test suites
npm test

# Run tests in watch mode
npm run test:watch

# Generate code coverage report
npm run test:cov
```

---

## 🌐 Deployment & Infrastructure

The production stack runs on fully managed cloud infrastructure:

- **Web API Service**: [Render](https://render.com) (Node.js 20 native runtime, health check `GET /health`).
- **Database**: [Neon](https://neon.tech) Serverless PostgreSQL 16.
- **Object Storage**: [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/) / S3-compatible storage with zero egress fees.
- **Frontend UI**: [Vercel](https://vercel.com) (`https://better-dev-ui-kashifrezwis-projects.vercel.app`).
