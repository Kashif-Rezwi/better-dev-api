# Better DEV API

> Backend service for Better DEV, a multi-modal AI chat platform with real-time streaming responses, tool calling, file processing, and conversation management.

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeORM](https://img.shields.io/badge/TypeORM-0.3-FE0803?style=flat&logo=typeorm&logoColor=white)](https://typeorm.io/)
[![Vercel AI SDK](https://img.shields.io/badge/Vercel_AI_SDK-v5-black?style=flat&logo=vercel&logoColor=white)](https://sdk.vercel.ai/)
[![Groq](https://img.shields.io/badge/Groq-F55036?style=flat)](https://groq.com/)
[![CI](https://github.com/Kashif-Rezwi/better-dev-api/actions/workflows/deploy.yml/badge.svg)](https://github.com/Kashif-Rezwi/better-dev-api/actions)

## Overview

Better DEV API is a NestJS 11 application that powers the [Better DEV UI](https://github.com/Kashif-Rezwi/better-dev-ui), a multi-modal AI chat platform. It streams LLM responses, executes autonomous web search, extracts text from uploaded documents and images, and persists conversations per user.

- **Streaming chat** over Server-Sent Events (SSE) using Vercel AI SDK v5.
- **Operational modes** — Fast, Thinking, Auto (LLM-classified), plus a Vision-effective mode when images are attached.
- **Tool calling** — a Zod-validated Tavily web search tool with AI-generated summaries and inline citations.
- **File processing** — OCR (Tesseract.js), PDF text extraction, DOCX extraction, and image thumbnails (Sharp), with S3-compatible object storage.
- **Stateless JWT auth** with bcrypt password hashing and a typed `@CurrentUser()` request context.
- **Reliability** — uniform JSON error responses, request logging, transactional multi-table writes, and composite database indexes.

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT LAYER (better-dev-ui)                          │
│                                                                                  │
│   POST /attachments/upload     POST /chat/.../messages     GET /chat/...         │
│   (Multipart file upload)      (SSE streaming response)    (Conversations list)  │
└────────────────────────┬──────────────────┬───────────────────────┬──────────────┘
                         │                  │                       │
                         ▼                  ▼                       ▼
┌────────────────────────┴──────────────────┴───────────────────────┴──────────────┐
│                           SECURITY & MIDDLEWARE LAYER                            │
│                                                                                  │
│   • JwtAuthGuard + @CurrentUser()        • ValidationPipe (Whitelist/Transform)  │
│   • LoggingInterceptor (Timing/Latency)  • GlobalExceptionFilter (Uniform JSON)  │
└────────────────────────┬──────────────────┬───────────────────────┬──────────────┘
                         │                  │                       │
                         ▼                  ▼                       ▼
┌────────────────────────┴──────────────────┴───────────────────────┴──────────────┐
│                                  DOMAIN MODULES                                  │
│                                                                                  │
│  ┌─────────────────────────┐   ┌──────────────────────────────────────────────┐  │
│  │       AuthModule        │   │                  ChatModule                  │  │
│  │  (JWT, Password Hash)   │   │  • SSE Streaming & Conversation Lifecycle    │  │
│  └────────────┬────────────┘   │  • Tool Orchestration (Tavily Web Search)    │  │
│               │                └───────┬──────────────┬──────────────┬────────┘  │
│               ▼                        │              │              │           │
│  ┌─────────────────────────┐           ▼              │              │           │
│  │       UserModule        │   ┌──────────────┐       │              │           │
│  │  (User Profile/Account) │   │ Attachment-  │       │              │           │
│  └─────────────────────────┘   │ Module       │       │              │           │
│                                │ • Storage    │       ▼              ▼           │
│                                │ • In-process │ ┌───────────┐  ┌──────────────┐  │
│                                │   OCR / Text │ │ModesModule│  │  CoreModule  │  │
│                                └───────┬──────┘ │• Auto-    │  │   (@Global)  │  │
│                                        │        │  Classify │  │• AIService   │  │
│                                        │        │• MD5 Cache│─►│• Model Config│  │
│                                        │        └───────────┘  └──────────────┘  │
└────────────────────────────────────────┼─────────────────────────────┬───────────┘
                                         │                             │
                                         ▼                             ▼
┌────────────────────────────────────────┴─────────────────────────────┴───────────┐
│                          DATA & STORAGE INFRASTRUCTURE                           │
│                                                                                  │
│        Neon PostgreSQL (Serverless)           S3-Compatible Object Storage       │
│        • TypeORM 0.3 Repositories             • Supabase Storage / Local Disk    │
│        • Composite Performance Indexes        • Async Upload & Pre-signed URLs   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Request flow (chat)

```text
User message
  ↓
ChatController (SSE response)
  ↓
ChatService: load history + attachments, verify ownership
  ↓
ModeResolver → AutoClassifier (heuristic pre-filter → LLM → 5-min MD5 cache)
  ↓
AIService: system prompt + history + file text, image cap applied
  ↓
AI SDK v5 streamText (Groq) — tools available
  ↓
Tool iterations (max 5) → Tavily search → summary with citations
  ↓
SSE delta stream → client disconnect cancels via req.on('close')
  ↓
Assistant message persisted (transaction) with mode/tool metadata
```

## Features

### 1. Chat & streaming

- **SSE streaming** with client-disconnect cancellation (`req.on('close')` → `reader.cancel()`).
- **Vision-effective mode**: when message parts contain images, the effective mode switches to `vision` automatically.
- **Image context cap**: image parts are capped (currently 5 images); older images are replaced with `[Previous Image Omitted]` to respect model token limits.
- **O(1) attachment enrichment**: conversation attachments are pre-fetched into a `Map` and extracted document text is injected into the message context without repeated lookups.
- **Batched conversation previews**: `getUserConversations` returns metadata plus the latest message preview in a single `DISTINCT ON` query.

### 2. Operational modes

| Mode | Model (default, env-overridable) | Max tokens | Temperature | Behavior |
| :--- | :--- | :---: | :---: | :--- |
| Fast | `AI_TEXT_MODEL` → `openai/gpt-oss-20b` | 500 | 0.5 | Terse, direct answers |
| Thinking | `AI_TOOL_MODEL` → `openai/gpt-oss-120b` | 4000 | 0.7 | Detailed, step-by-step |
| Vision | `AI_VISION_MODEL` → `openai/gpt-oss-120b` | 2000 | 0.6 | Image-focused prompting; images are read via server-side OCR text because no vision-capable model is available on the current Groq tier |

**Auto mode** classifies query complexity with a short-query heuristic (< 15 chars → Fast), then an LLM classification call with a 5-second timeout (fallback: Fast). Results are cached in memory by MD5 of the last user message for 5 minutes (FIFO cap of 1,000 entries, cleanup every minute).

### 3. Tool system

- **Registry**: tools register by unique lowercase/underscore name with a Zod parameter schema, validated at startup (converted to OpenAPI 3.0 for the AI SDK).
- **Registered tool**: `tavily_web_search` (query: 1–500 chars, `maxResults`: 1–10) with automatic retry and backoff.
- **Intent analysis**: before tool use, a lightweight LLM call decides whether the query needs live web data; recent searches in history (last 3 turns) suppress redundant searches.
- **Search summaries**: a separate text-model call synthesizes results into a short summary with `[n]` citation markers linked to sources.
- Tool call iterations are capped (currently 5 steps) to prevent runaway loops.

### 4. File processing & storage

- **Uploads** via Multer: images (JPEG/PNG/GIF/WebP), PDFs, and Word documents; a 10 MB limit is enforced by configuration (`MAX_UPLOAD_SIZE_BYTES`).
- **In-process extraction** (async after upload): Tesseract.js OCR + Sharp thumbnail (images), `pdf-parse` (PDF), `mammoth` (DOCX).
- **Ownership enforcement**: attachments can only be added to conversations owned by the authenticated user.
- **Provider-agnostic storage driver** built on the AWS S3 SDK v3 — currently Supabase Object Storage (S3-compatible, path-style), with a local-disk fallback for development. Also compatible with Cloudflare R2 and DigitalOcean Spaces via configuration.

### 5. API quality

- Global exception filter producing a uniform `{ statusCode, error, message, timestamp, path, method }` envelope.
- Logging interceptor emitting `[METHOD] url status - durationms`.
- `ValidationPipe` with whitelisting and DTO transformation on every request.
- Multi-statement writes run inside `dataSource.transaction(...)`.
- Composite indexes on `(conversationId, createdAt)` and `(userId, updatedAt)`; `synchronize: false` in production.

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| Framework | NestJS 11, TypeScript 5.7, Express |
| AI engine | Vercel AI SDK v5 (`ai`), `@ai-sdk/groq`, Groq models (`gpt-oss-20b` / `gpt-oss-120b`) |
| Database & ORM | PostgreSQL (Neon serverless), TypeORM 0.3, `pg` |
| Object storage | AWS S3 SDK v3 (S3-compatible providers / local disk) |
| File processing | Tesseract.js, Sharp, `pdf-parse`, `mammoth` |
| Validation & auth | `class-validator`, `class-transformer`, Passport JWT, bcrypt |
| Search & tools | Tavily, Zod |

## Project Structure

```
better-dev-api/
├── architectures/                   # Current / legacy / proposed architecture specs
├── src/
│   ├── common/                      # Cross-cutting HTTP & security primitives
│   │   ├── decorators/              # @CurrentUser()
│   │   ├── filters/                 # GlobalExceptionFilter
│   │   ├── guards/                  # JwtAuthGuard
│   │   ├── interceptors/            # LoggingInterceptor
│   │   └── interfaces/              # AuthUser interface
│   ├── config/                      # database, jwt, token-limit configuration
│   ├── health.controller.ts         # GET /health
│   ├── main.ts                      # Bootstrap: CORS whitelist, global pipes/filters
│   ├── app.module.ts                # Root module
│   └── modules/
│       ├── core/                    # Global AI layer (AIService, model/mode/provider config, prompts)
│       ├── auth/                    # Register / login / profile / logout
│       ├── user/                    # User accounts
│       ├── attachment/              # Upload, storage driver, OCR & extraction
│       └── chat/                    # Conversations, SSE streaming, modes, tools, entities
├── test/                            # Manual integration/stress scripts (not Jest)
├── .github/workflows/               # CI: install + build + tests on main/PR
├── render.yaml                      # Render blueprint (production)
├── Dockerfile / docker-compose.yml / nginx      # Legacy reference infra (see Deployment)
└── package.json
```

Note: the Docker/nginx files are legacy reference material from an earlier DigitalOcean VPS deployment and are not used by the current Render-based stack.

## API

Base URL: local `http://localhost:3001` — production `https://better-dev-api.onrender.com`.

All chat and attachment endpoints require `Authorization: Bearer <JWT_TOKEN>`.

### Health (`/health`)

| Method | Path | Purpose |
| :--- | :--- | :--- |
| GET | `/health` | Service status: `{ "status": "ok", "timestamp": "...", "service": "better-dev-ai-chat" }` |
| GET | `/health/storage` | Storage driver status: `{ "status": "ok" \| "degraded", "storage": { ... } }` |

### Authentication (`/auth`)

**POST /auth/register** — Public. Creates an account and returns a JWT.

```json
{
  "email": "developer@example.com",
  "password": "securePassword123"
}
```

Response `201 Created`:

```json
{
  "accessToken": "<jwt>",
  "user": { "id": "<uuid>", "email": "developer@example.com", "credits": 1000 }
}
```

**POST /auth/login** — Public. Same request/response shape as register.

**GET /auth/profile** — Returns the current user: `{ "userId": "<uuid>", "email": "..." }`.

**POST /auth/logout** — JWT is stateless; logout clears the client-side token. Returns `{ "message": "Logged out successfully" }`.

### Chat (`/chat`)

| Method | Path | Purpose |
| :--- | :--- | :--- |
| POST | `/chat/conversations/with-message` | Create a conversation and its first user message in one transaction (`{ title?, systemPrompt?, firstMessage, parts? }`) |
| GET | `/chat/conversations` | List the user's conversations with latest message previews |
| GET | `/chat/conversations/:id` | Conversation with ordered messages |
| PATCH | `/chat/conversations/:id` | Update `title` (≤ 100 chars) and/or `systemPrompt` (≤ 2000 chars) |
| POST | `/chat/conversations/:id/messages` | Send messages; returns an SSE text/tool delta stream. Body: `{ "messages": [{ "role": "user", "parts": [{ "type": "text", "text": "..." }] }], "modeOverride": "thinking" }` |
| POST | `/chat/conversations/:id/generate-title` | Generate a short AI title from `{ "message": "..." }` → `{ "title": "..." }` |
| PUT | `/chat/conversations/:id/system-prompt` | Replace the conversation system prompt (`{ "systemPrompt": "..." }`) |
| DELETE | `/chat/conversations/:id` | Delete a conversation → `204 No Content` |

### Attachments (`/attachments`)

| Method | Path | Purpose |
| :--- | :--- | :--- |
| POST | `/attachments/upload` | `multipart/form-data` with `file`, `conversationId`, optional `messageId`. Images/PDFs/DOCX only, 10 MB max |
| GET | `/attachments/:id` | Attachment metadata (ownership-verified) |
| DELETE | `/attachments/:id` | Delete the attachment and its storage object |

## Environment Variables

See `.env.example` for the authoritative list with comments. The key variables are:

```env
# Application
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000      # comma-separated CORS whitelist

# Auth
JWT_SECRET=generate-a-secure-random-secret-at-least-32-chars
JWT_EXPIRATION=7d

# Database (production uses DATABASE_URL; local dev can use *_HOST/_PORT/_USER/_PASSWORD/_NAME)
DATABASE_URL=postgresql://user:password@host:5432/better_dev_db

# AI (Groq)
GROQ_API_KEY=gsk_your_groq_api_key
DEFAULT_AI_MODEL=openai/gpt-oss-120b
AI_TEXT_MODEL=openai/gpt-oss-20b
AI_TOOL_MODEL=openai/gpt-oss-120b
AI_VISION_MODEL=openai/gpt-oss-120b

# Search
TAVILY_API_KEY=tvly-your-tavily-api-key

# Storage (S3-compatible; Supabase Storage in production)
USE_S3_STORAGE=true
S3_BUCKET_NAME=better-dev-attachments
S3_REGION=ap-south-1
S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_CDN_URL=https://<project-ref>.storage.supabase.co/storage/v1/object/public/better-dev-attachments
S3_PUBLIC_READ=false
S3_FORCE_PATH_STYLE=true
# Local development (no object storage):
# USE_S3_STORAGE=false
# LOCAL_STORAGE_PATH=./uploads

# Token & upload limits (defaults shown)
MAX_DOCUMENT_TOKENS=32000
MAX_TOTAL_CONTEXT_TOKENS=64000
MAX_UPLOAD_SIZE_BYTES=10485760
```

## Getting Started

Prerequisites: Node.js 20+, a PostgreSQL database (local or [Neon](https://neon.tech)), and a [Groq](https://console.groq.com) API key.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env   # then fill in real values

# 3. Start the development server
npm run start:dev
```

The API is live at `http://localhost:3001` with a health check at `http://localhost:3001/health`.

### Build & run the production build

```bash
npm run build         # tsc -p tsconfig.build.json
npm run start:prod    # node dist/main
```

Docker convenience scripts exist (`npm run docker:up` etc.) for the legacy local stack — note that it predates the Neon database and is intended as reference only.

## Testing

The repository includes a Jest unit test suite (currently 5 suites / 32 tests):

```bash
npm test              # run all unit tests
npm run test:watch    # watch mode
npm run test:cov      # coverage report
```

There are also manual integration scripts under `test/` (`test-ai-sdk-v5.sh`, `stress-test.sh`) for exercising a running server.

## CI

GitHub Actions runs on pushes and pull requests to `main`: install dependencies (`npm ci`), verify the TypeScript build (`npm run build`), and run the Jest suite (`npm test`).

## Deployment & Infrastructure

The production stack runs on managed, free-tier cloud infrastructure — `render.yaml` is the Render blueprint:

- **API**: [Render](https://render.com) web service. Health check: [`https://better-dev-api.onrender.com/health`](https://better-dev-api.onrender.com/health).
- **Database**: [Neon](https://neon.tech) serverless PostgreSQL, injected via `DATABASE_URL`.
- **Object storage**: [Supabase Storage](https://supabase.com/docs/guides/storage) (S3-compatible). Previously Cloudflare R2 was used; Supabase was chosen for free-tier pricing. Attachment files are served through the public object URL.
- **Frontend**: [Better DEV UI](https://github.com/Kashif-Rezwi/better-dev-ui) deployed on [Vercel](https://vercel.com).

The repository also contains legacy Docker (`Dockerfile`, `docker-compose.yml`) and `nginx/` configuration from an earlier DigitalOcean VPS deployment. These files are reference only and are not part of the current deployment; the compose stack has no database service and predates the Neon backend.

## Related Repositories

- [better-dev-ui](https://github.com/Kashif-Rezwi/better-dev-ui) — React client for this API.

## License

No license file is present. `package.json` declares the project `UNLICENSED` (all rights reserved by default).
