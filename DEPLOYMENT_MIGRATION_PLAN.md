# Backend Deployment Audit & Migration Plan (Render)

> **Repository**: `better-dev-api`  
> **Target Platform**: [Render](https://render.com)  
> **Canonical Production API Domain**: `https://api.betterdev.in`  
> **Canonical Production Frontend Domain**: `https://www.betterdev.in` (and `https://betterdev.in`)  
> **Role in Application**: Core NestJS API server, streaming AI orchestration (AI SDK v5 + Groq), multi-modal file ingestion, and authentication engine.

---

## 1. Executive Summary & Deployment Audit

### 1.1 Current Deployment State (Forensic Investigation)
* **Status**: **CONFIRMED DOWN / OFFLINE**.
* **Current DNS Record**:
  * `api.betterdev.in` → A record pointing to `165.22.241.160` (DigitalOcean IP range).
  * Direct HTTP/HTTPS requests to `https://api.betterdev.in/health` and `http://165.22.241.160/health` **timeout with no response**.
* **Root Cause**: The previously hosting DigitalOcean Droplet was terminated several months ago. No active backend service is currently receiving traffic.
* **Impact**: The live production frontend (`https://www.betterdev.in`) is unable to perform user authentication, conversation loading, or AI chat streaming.

### 1.2 Reconstructed Historical DigitalOcean Architecture
The application was previously deployed on a single Ubuntu 22.04 LTS Droplet:
* **Process Management**: Single Docker container running the NestJS app (`port 3001`).
* **Database**: PostgreSQL 14 running directly on the VPS host system (not in Docker).
* **Reverse Proxy & SSL**: Nginx with Let's Encrypt certificates managed via Certbot.
* **CI/CD**: GitHub Actions workflow (`.github/workflows/deploy.yml`) SSH-ing into the VPS on push to `main` and running `docker compose up -d --build`.
* **State of Data**: The database hosted directly on the deleted droplet is lost unless an offsite backup exists. File uploads stored on the local filesystem (`./uploads`) are also lost. Any files previously uploaded to DigitalOcean Spaces may still exist if the bucket remains active in the cloud account.

### 1.3 Backend Architecture & Runtime Capabilities
* **Framework**: NestJS 11.0.1 on Express.
* **Language & Runtime**: TypeScript 5.7.3 / Node.js 20+.
* **Database & ORM**: PostgreSQL via TypeORM 0.3.27 (`pg` 8.16.3).
* **AI Engine**: AI SDK v5 (`ai`, `@ai-sdk/groq`), dynamic model routing (Llama 3.1 8B, Llama 3.3 70B, Llama 4 Scout Vision).
* **Tool Calling**: Tavily Web Search API (`@tavily/core`).
* **Multi-Modal Processing**:
  * **Images & OCR**: `tesseract.js` v7.0.0 and `sharp` v0.34.5.
  * **PDFs**: `pdf-parse` v1.1.1.
  * **Word Docs**: `mammoth` v1.11.0.
* **Storage Abstraction**: `StorageService` supporting both S3-compatible cloud storage and local disk.
* **Health Check**: `GET /health` returning `{ status: 'ok', timestamp: '...', service: 'better-dev-ai-chat' }`.
* **Build & Start Commands**:
  * Build: `npm run build` (`tsc -p tsconfig.build.json` → outputs to `dist/`).
  * Start: `npm run start:prod` (`node dist/main`).

### 1.4 Critical Audit Findings & Identified Migration Requirements
1. **Unrestricted CORS Configuration**:
   [`src/main.ts`](file:///Users/kashifrezwi/Developer/betterdev/better-dev-api/src/main.ts#L11-L14) currently sets `origin: true` (allows all origins). Must be locked down to allow only verified frontend domains (`https://www.betterdev.in`, `https://betterdev.in`, and local development origins).
2. **Render Ephemeral Filesystem**:
   Render web service disks are ephemeral. Storing uploaded files in `./uploads` will result in file loss on container restarts/deployments. Cloud object storage (`USE_S3_STORAGE=true`) is **mandatory** for production.
3. **SSE Streaming & Timeouts on Render**:
   Render has a default 5-minute request timeout. The AI chat streaming endpoint (`/chat/conversations/:id/messages`) must keep connections alive.
4. **Tesseract.js Cold-Start Characteristics**:
   Tesseract downloads language models (~15MB) on first OCR initialization. Worker lifecycle management is already present in `file-processor.service.ts` with `OnModuleDestroy`.
5. **Missing Database & Schema Initialization**:
   Production database configuration uses `synchronize: false`. On a newly provisioned Render PostgreSQL database, tables must be initialized upon first deployment.
6. **Obsolete GitHub Actions Workflow**:
   [`.github/workflows/deploy.yml`](file:///Users/kashifrezwi/Developer/betterdev/better-dev-api/.github/workflows/deploy.yml) contains dead SSH actions pointing to the deleted VPS. This should be converted to a clean CI lint/build validation workflow, with Render handling deployment via native Git webhook.
7. **Storage Service Hardcoded to DigitalOcean Spaces**:
   [`storage.service.ts`](file:///Users/kashifrezwi/Developer/betterdev/better-dev-api/src/modules/attachment/services/storage.service.ts) previously (a) always sent `ACL: 'public-read'` on upload — which Cloudflare R2 and ACL-disabled AWS S3 buckets **reject** — and (b) constructed fallback URLs using the hardcoded `*.digitaloceanspaces.com` format. **RESOLVED**: the service is now provider-agnostic (see Task 5).

---

## 2. Target Architecture Specification

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RENDER CLOUD ENVIRONMENT                        │
│                                                                        │
│  Custom Domain: api.betterdev.in                                       │
│  (Hostinger DNS CNAME ──► better-dev-api.onrender.com)                 │
│         │                                                              │
│         ▼                                                              │
│  Render Managed Web Service (Node.js 20 Native)                        │
│  ├── Service Name: better-dev-api                                      │
│  ├── Health Check: /health                                             │
│  ├── Port: Automatically bound via $PORT                               │
│  ├── CORS: https://www.betterdev.in, https://betterdev.in               │
│  ├── Real-time SSE streaming for AI responses                          │
│  └── In-memory OCR & Document Text Extraction                          │
│         │                                                              │
│         ├──────────────────────────┬──────────────────────────┐        │
│         ▼                          ▼                          ▼        │
│  Render PostgreSQL         S3-Compatible Storage       External APIs   │
│  (Managed Database)        (Cloudflare R2 / AWS S3)    (Groq, Tavily)  │
│  - Users, Messages,        - Attachments, Images,                      │
│    Conversations             Documents                                 │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Service Specifications
* **Service Type**: Render Web Service (Native Node.js runtime).
* **Region**: Singapore (`singapore` — optimal latency for India/Asia users matching Vercel `bom1`).
* **Build Command**: `npm install && npm run build`
* **Start Command**: `npm run start:prod`
* **Health Check Path**: `/health`
* **Auto-Deploy**: Enabled on branch `main`.

### 2.2 Database Specifications
* **Service Type**: Render Managed PostgreSQL.
* **Database Name**: `better_dev_db`
* **Connection**: Via standard `DATABASE_URL` connection string provided automatically by Render.
* **SSL Requirement**: Supported natively with `rejectUnauthorized: false`.

### 2.3 Object Storage Specifications
* **Engine**: S3-Compatible API (Cloudflare R2, AWS S3, or DigitalOcean Spaces).
* **Flag**: `USE_S3_STORAGE=true`.

---

## 3. Environment Variables Reference

| Variable Name | Required | Target / Setting | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Node execution environment |
| `PORT` | Auto | Assigned by Render | Port to listen on (NestJS uses `process.env.PORT`) |
| `DATABASE_URL` | Yes | Injected from Render DB | Full PostgreSQL connection URI |
| `JWT_SECRET` | Yes | Secure random string (32+ chars) | Secret key for signing user authentication tokens |
| `JWT_EXPIRATION` | Yes | `7d` | JWT token validity duration |
| `FRONTEND_URL` | Yes | `https://www.betterdev.in,https://betterdev.in` | Comma-separated CORS allowed origins |
| `GROQ_API_KEY` | Yes | Secret (`gsk_...`) | Groq AI inference API key |
| `DEFAULT_AI_MODEL` | No | `openai/gpt-oss-120b` | Fallback AI model name |
| `AI_TEXT_MODEL` | No | `llama-3.1-8b-instant` | Fast text generation model |
| `AI_TOOL_MODEL` | No | `llama-3.3-70b-versatile` | Complex reasoning / tool execution model |
| `AI_VISION_MODEL` | No | `meta-llama/llama-4-scout-17b-16e-instruct` | Multi-modal vision analysis model |
| `TAVILY_API_KEY` | Yes | Secret (`tvly-...`) | Tavily search API key for web browsing tool |
| `USE_S3_STORAGE` | Yes | `true` | Enables cloud object storage for uploads |
| `S3_BUCKET_NAME` | If S3 | Bucket name | Target storage bucket |
| `S3_REGION` | If S3 | Region (e.g., `auto` for R2, `ap-south-1` for S3) | S3 region identifier |
| `S3_ENDPOINT` | If S3 | Full endpoint URL | S3 API endpoint (e.g. `https://<account>.r2.cloudflarestorage.com`) |
| `S3_ACCESS_KEY_ID` | If S3 | Access key ID | Storage API credentials |
| `S3_SECRET_ACCESS_KEY` | If S3 | Secret access key | Storage API credentials |
| `S3_CDN_URL` | No | Public custom CDN domain | Optional CDN distribution URL |
| `S3_PUBLIC_READ` | No | `false` (default) | Set `true` ONLY for providers supporting object ACLs (e.g. DigitalOcean Spaces). R2/AWS must keep `false` |
| `LOCAL_STORAGE_PATH` | No | `./uploads` | Local filesystem path when `USE_S3_STORAGE=false` (dev only) |
| `MAX_UPLOAD_SIZE_BYTES` | No | `10485760` (10MB) | Max single upload size limit |

---

## 4. Cross-Repository Dependencies

The backend repository provides services to the frontend repository (`better-dev-ui`) and requires the following coordination:

1. **Allowed Frontend Origins (CORS)**:
   * Frontend will originate requests from `https://www.betterdev.in` and `https://betterdev.in`.
   * For local developer pairing, also support `http://localhost:3000`.
2. **API Domain & Routing**:
   * Backend will serve production traffic at `https://api.betterdev.in`.
   * No path prefix (e.g., routes are `/auth/login`, `/chat/conversations`, not `/api/v1/...`).
3. **Response Headers for Streaming**:
   * Chat endpoint `/chat/conversations/:id/messages` sends `Content-Type: text/event-stream; charset=utf-8` and `Cache-Control: no-cache`.
4. **Attachment URLs**:
   * Upload endpoint `/attachments/upload` returns the public object storage URL for the frontend to render directly.

---

## 5. Step-by-Step Implementation Plan

### Task 1: Update CORS Configuration in `src/main.ts`
* **Type**: `Agent Implementation`
* **File**: [`src/main.ts`](file:///Users/kashifrezwi/Developer/betterdev/better-dev-api/src/main.ts)
* **Objective**: Enforce strict origin validation using the `FRONTEND_URL` environment variable while maintaining development convenience.
* **Code Modification**:
```typescript
// Enable CORS for allowed origins
const rawFrontendUrls = process.env.FRONTEND_URL || 'http://localhost:3000';
const allowedOrigins = rawFrontendUrls
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.enableCors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
});
```

---

### Task 2: Create Render Blueprint (`render.yaml`)
* **Type**: `Agent Implementation`
* **File**: `render.yaml` (New file in repo root)
* **Objective**: Provide Infrastructure-as-Code for 1-click or automated deployment on Render.
* **Content**:
```yaml
services:
  - type: web
    name: better-dev-api
    runtime: node
    plan: starter
    region: singapore
    buildCommand: npm install && npm run build
    startCommand: npm run start:prod
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: better-dev-db
          property: connectionString
      - key: JWT_SECRET
        generateValue: true
      - key: JWT_EXPIRATION
        value: 7d
      - key: FRONTEND_URL
        value: "https://www.betterdev.in,https://betterdev.in"
      - key: GROQ_API_KEY
        sync: false
      - key: TAVILY_API_KEY
        sync: false
      - key: DEFAULT_AI_MODEL
        value: openai/gpt-oss-120b
      - key: AI_TEXT_MODEL
        value: llama-3.1-8b-instant
      - key: AI_TOOL_MODEL
        value: llama-3.3-70b-versatile
      - key: AI_VISION_MODEL
        value: meta-llama/llama-4-scout-17b-16e-instruct
      - key: USE_S3_STORAGE
        value: "true"
      - key: S3_BUCKET_NAME
        sync: false
      - key: S3_REGION
        sync: false
      - key: S3_ENDPOINT
        sync: false
      - key: S3_ACCESS_KEY_ID
        sync: false
      - key: S3_SECRET_ACCESS_KEY
        sync: false

databases:
  - name: better-dev-db
    plan: starter
    databaseName: better_dev_db
    region: singapore
```

---

### Task 3: Create Authoritative `.env.example`
* **Type**: `Agent Implementation`
* **File**: `.env.example` (New file in repo root)
* **Objective**: Document all configuration keys clearly.
* **Content**:
```env
# ============================================
# APPLICATION & SERVER
# ============================================
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://www.betterdev.in,https://betterdev.in,http://localhost:3000

# ============================================
# DATABASE (PostgreSQL)
# ============================================
# Production (Render injected):
DATABASE_URL=postgresql://user:password@host:5432/better_dev_db

# Local Development fallback:
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=better_dev
DATABASE_PASSWORD=better_dev
DATABASE_NAME=better_dev_db

# ============================================
# AUTHENTICATION (JWT)
# ============================================
JWT_SECRET=generate-a-secure-random-secret-key-at-least-32-chars
JWT_EXPIRATION=7d

# ============================================
# AI PROVIDERS & MODELS (Groq)
# ============================================
GROQ_API_KEY=gsk_your_groq_api_key_here
DEFAULT_AI_MODEL=openai/gpt-oss-120b
AI_TEXT_MODEL=llama-3.1-8b-instant
AI_TOOL_MODEL=llama-3.3-70b-versatile
AI_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# ============================================
# SEARCH & TOOLS (Tavily)
# ============================================
TAVILY_API_KEY=tvly-your_tavily_api_key_here

# ============================================
# OBJECT STORAGE (S3 / Cloudflare R2 / DO Spaces)
# ============================================
USE_S3_STORAGE=true
S3_BUCKET_NAME=your-bucket-name
S3_REGION=auto
S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=your-s3-access-key-id
S3_SECRET_ACCESS_KEY=your-s3-secret-access-key
S3_CDN_URL=
# Set true ONLY for providers that support object ACLs (e.g. DigitalOcean Spaces).
# Cloudflare R2 and ACL-disabled AWS S3 buckets REJECT uploads that include an ACL.
# For R2, set S3_CDN_URL to the bucket's public r2.dev URL or custom domain instead.
S3_PUBLIC_READ=false

# Local filesystem storage (only used when USE_S3_STORAGE=false — development only)
LOCAL_STORAGE_PATH=./uploads

# ============================================
# TOKEN & UPLOAD LIMITS
# ============================================
MAX_DOCUMENT_TOKENS=32000
MAX_TOTAL_CONTEXT_TOKENS=64000
MAX_UPLOAD_SIZE_BYTES=10485760
```

---

### Task 4: Replace Obsolete CI/CD Workflow
* **Type**: `Agent Implementation`
* **File**: [`.github/workflows/deploy.yml`](file:///Users/kashifrezwi/Developer/betterdev/better-dev-api/.github/workflows/deploy.yml)
* **Objective**: Remove obsolete SSH commands pointing to dead VPS. Replace with a GitHub Actions CI workflow that runs linting, testing, and compilation verification on every PR and push to `main`.
* **Modification**:
```yaml
name: Continuous Integration

on:
  push:
    branches: ["main"]
  pull_request:
    branches: ["main"]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - name: Install Dependencies
        run: npm ci

      - name: Check TypeScript Build
        run: npm run build
```

---

### Task 5: Make Object Storage Provider-Agnostic
* **Type**: `Agent Implementation`
* **Status**: ✅ **IMPLEMENTED** in [`src/modules/attachment/services/storage.service.ts`](file:///Users/kashifrezwi/Developer/betterdev/better-dev-api/src/modules/attachment/services/storage.service.ts)
* **Objective**: Remove DigitalOcean Spaces hardcoding so uploads work on Cloudflare R2, AWS S3, or any S3-compatible provider.
* **Changes Applied**:
  1. **Conditional ACL**: `ACL: 'public-read'` is now only sent when `S3_PUBLIC_READ=true` (new env var, default `false`). R2 and ACL-disabled AWS buckets reject requests containing an ACL.
  2. **Provider-agnostic public URL** via new `buildPublicUrl()`:
     * `S3_CDN_URL` set → `{S3_CDN_URL}/{key}` (trailing slashes normalized).
     * Else if `S3_ENDPOINT` set → virtual-hosted URL derived from the endpoint (e.g. `https://{bucket}.nyc3.digitaloceanspaces.com/{key}` — identical to the old DO behavior).
     * Else → standard AWS URL `https://{bucket}.s3.{region}.amazonaws.com/{key}`.
  3. Empty `S3_ENDPOINT` now maps to `undefined` so AWS S3 uses its regional default endpoint.
  4. Log messages made provider-agnostic.
* **Provider Notes**:
  * **Cloudflare R2**: keep `S3_PUBLIC_READ=false`; the S3 API endpoint does not serve public objects — enable the bucket's public `r2.dev` URL or a custom domain and set it as `S3_CDN_URL`.
  * **DigitalOcean Spaces**: set `S3_PUBLIC_READ=true` (public CDN access relies on object ACLs).
  * **AWS S3**: keep `S3_PUBLIC_READ=false`; use bucket policy / CloudFront + `S3_CDN_URL` for public access.
* **Validation**: `npm run build` compiles cleanly; URL construction verified for R2, DO Spaces, and AWS S3 configurations.

---

### Task 6: Initialize Database Schema on First Deploy
* **Type**: `Agent Implementation` + `Manual User / Provider Action`
* **Objective**: Resolve Finding #5 — production runs with `synchronize: false` and no TypeORM migrations exist, so a freshly provisioned Render PostgreSQL would have **no tables** and the app would fail on first query.
* **Also Applied**: `database.config.ts` SSL comment updated from DigitalOcean-specific wording to provider-agnostic (`Accept managed provider certs`).
* **Recommended Approach (zero code change — one-time bootstrap)**:
  1. Create the Render PostgreSQL database first (Task 8).
  2. From a local checkout, create a `.env` using the **individual** dev variables pointing at the Render database's **External Connection String** (host, port, user, password, database) — do **not** set `DATABASE_URL`.
  3. Run `npm install && npm run start:dev` once. Because the dev path uses `synchronize: true`, TypeORM auto-creates all tables/indexes in the Render database.
  4. Stop the local server. The schema now exists; deploy the Render web service with `DATABASE_URL` (production path, `synchronize: false`).
* **Alternative (long-term hardening)**: introduce TypeORM migrations (`migration:generate` + `migrationsRun: true`) so future schema changes are versioned. Tracked as an optional future improvement.
* **Validation**: after bootstrap, connect with `psql` and confirm `\dt` lists the entity tables (e.g. `users`, `conversations`, `messages`, `attachments`).

---

### Task 7: Update Documentation & Deprecate VPS Setup
* **Type**: `Agent Implementation`
* **Files**: [`README.md`](file:///Users/kashifrezwi/Developer/betterdev/better-dev-api/README.md), [`architectures/ARCHITECTURE_CURRENT.md`](file:///Users/kashifrezwi/Developer/betterdev/better-dev-api/architectures/ARCHITECTURE_CURRENT.md)
* **Objective**: Move the old DigitalOcean VPS documentation to a clearly designated `### Legacy Infrastructure (Historical Reference)` section and document the new Render + PostgreSQL + Cloud Storage architecture as the single source of truth.

---

### Task 8: Create Render PostgreSQL Database
* **Type**: `Manual User / Provider Action`
* **Console**: [Render Dashboard](https://dashboard.render.com)
* **Instructions**:
  1. Click **New +** → **PostgreSQL**.
  2. Name: `better-dev-db`
  3. Database: `better_dev_db`
  4. Region: **Singapore** (or closest to India users).
  5. Plan: **Starter** (recommended for production durability).
  6. Click **Create Database**.

---

### Task 9: Create Render Web Service
* **Type**: `Manual User / Provider Action`
* **Console**: [Render Dashboard](https://dashboard.render.com)
* **Instructions**:
  1. Click **New +** → **Web Service**.
  2. Connect repository: `Kashif-Rezwi/better-dev-api`.
  3. Service Name: `better-dev-api`
  4. Region: **Singapore**.
  5. Branch: `main`.
  6. Runtime: **Node**.
  7. Build Command: `npm install && npm run build`
  8. Start Command: `npm run start:prod`
  9. Plan: **Starter**.
  10. Configure **Environment Variables** matching Section 3 above (including connecting `DATABASE_URL` to `better-dev-db`).
  11. Set **Health Check Path**: `/health`.
  12. Click **Create Web Service**.

---

### Task 10: Set Up S3-Compatible Object Storage
* **Type**: `Manual User / Provider Action`
* **Provider**: Cloudflare R2 (recommended: 0 egress fees) or AWS S3.
* **Instructions**:
  1. Create bucket (e.g. `better-dev-attachments`).
  2. Generate S3 API Credentials (`Access Key ID`, `Secret Access Key`, `Endpoint URL`).
  3. Enter `USE_S3_STORAGE=true` and bucket credentials in Render Web Service environment variables.
  4. **Public access (provider-specific — depends on Task 5 fix)**:
     * **Cloudflare R2**: keep `S3_PUBLIC_READ=false` (R2 rejects ACLs). Enable the bucket's public `r2.dev` URL (or attach a custom domain) and set it as `S3_CDN_URL`.
     * **AWS S3**: keep `S3_PUBLIC_READ=false`. Configure a bucket policy or CloudFront distribution for public reads and set `S3_CDN_URL` accordingly.
     * **DigitalOcean Spaces** (if reusing existing bucket): set `S3_PUBLIC_READ=true` so objects are publicly readable via the Spaces CDN.

---

### Task 11: Configure Custom Domain on Render
* **Type**: `Manual User / Provider Action`
* **Console**: Render Dashboard → `better-dev-api` → **Settings** → **Custom Domains**
* **Instructions**:
  1. Add `api.betterdev.in`.
  2. Render will show the target verification host (e.g., `better-dev-api.onrender.com`).

---

### Task 12: Update DNS Record at Hostinger
* **Type**: `Manual User / Provider Action`
* **Console**: Hostinger DNS Zone Management
* **Instructions**:
  1. Locate existing DNS record for name `api`:
     * **Delete** existing `A` record pointing to `165.22.241.160`.
  2. **Add** new `CNAME` record:
     * **Type**: `CNAME`
     * **Name / Host**: `api`
     * **Target / Points To**: `better-dev-api.onrender.com` (use exact target from Render dashboard).
     * **TTL**: `300` seconds (5 min) during cutover.
  3. Wait 5–15 minutes for DNS propagation and Render automatic SSL certificate issuance.

---

### Task 13: Clean Up Stale GitHub Secrets
* **Type**: `Manual User / Provider Action`
* **Console**: GitHub `better-dev-api` → **Settings** → **Secrets and variables** → **Actions**
* **Instructions**:
  * Remove dead SSH keys and VPS IP references (`SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_PORT`, and `SERVER_IP` if present — the workflow only referenced the four `SSH_*` secrets).

---

## 6. Verification & Validation Checklist

Execute this checklist once Render deployment is complete:

- [ ] **Compilation**: `npm run build` exits with code 0 locally and in GitHub Actions CI.
- [ ] **Direct Health Check**: `curl -sI https://better-dev-api.onrender.com/health` returns `HTTP/2 200 OK` with JSON `{ "status": "ok", ... }`.
- [ ] **Custom Domain DNS**: `dig +short api.betterdev.in CNAME` resolves to the Render hostname.
- [ ] **Custom Domain HTTPS**: `curl -sI https://api.betterdev.in/health` returns `200 OK` with a valid SSL certificate.
- [ ] **Database Connection**: Render server logs display successful TypeORM PostgreSQL initialization with no connection errors.
- [ ] **User Registration & JWT Auth**:
  ```bash
  curl -X POST https://api.betterdev.in/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"test@betterdev.in","password":"TestPassword123!","name":"Test User"}'
  ```
  Returns `201 Created` with user payload.
- [ ] **User Login**:
  ```bash
  curl -X POST https://api.betterdev.in/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@betterdev.in","password":"TestPassword123!"}'
  ```
  Returns `{ "access_token": "eyJhbGciOi..." }`.
- [ ] **CORS Headers**:
  ```bash
  curl -sI -X OPTIONS https://api.betterdev.in/auth/profile \
    -H "Origin: https://www.betterdev.in" \
    -H "Access-Control-Request-Method: GET"
  ```
  Returns `Access-Control-Allow-Origin: https://www.betterdev.in` and `Access-Control-Allow-Credentials: true`.
- [ ] **AI Chat Stream (SSE)**: Dispatching a message request returns valid `text/event-stream` chunks with active token generation from Groq.
- [ ] **File Attachment Upload**: Uploading a sample image/PDF to `/attachments/upload` returns the storage URL and processes text extraction without server crash.

---

## 7. Rollback & Disaster Recovery Strategy

1. **Render Instant Rollback**:
   * If a bad build is deployed, navigate to Render Dashboard → **Deploys** → Select previous green deployment → **Rollback to this deploy**.
2. **Database Snapshot Recovery**:
   * Render Managed PostgreSQL provides automated point-in-time recovery and daily snapshots on the Starter tier.
3. **Storage Redundancy**:
   * Attachments in S3/Cloudflare R2 persist independently of server deploy cycles.
