# n8n AI Workflow Builder

An AI-powered visual n8n workflow builder. Describe automations in natural language and the AI creates real n8n workflows on your instance — with always-up-to-date node documentation via RAG.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy the following into your `.env.local` file:

```bash
# ─── RAG: Neon Postgres (via Vercel Marketplace) ──────────────────────────
# Required for the node documentation RAG system.
# Get this from: Vercel Dashboard → Storage → Neon Postgres → .env tab
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# ─── RAG: Embedding Generation ─────────────────────────────────────────────
# Used to generate vector embeddings for node documentation.
# This is a project-level OpenAI key (separate from the user's chat key).
OPENAI_API_KEY=sk-...

# ─── RAG: Cron Job Security ────────────────────────────────────────────────
# Secures the /api/sync-docs endpoint from unauthorized access.
# Must be at least 16 characters. Set this in Vercel Environment Variables.
CRON_SECRET=your-secret-at-least-16-chars

# ─── Optional: GitHub Token ────────────────────────────────────────────────
# Increases GitHub API rate limits from 60/hour to 5000/hour.
# Recommended for the doc sync pipeline which fetches many files.
# Create one at: https://github.com/settings/tokens (no scopes needed)
GITHUB_TOKEN=ghp_...
```

### 3. Set up the database

Create a Neon Postgres database via the [Vercel Marketplace](https://vercel.com/marketplace/neon) and enable the `vector` extension:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then run the Drizzle migration:

```bash
npx drizzle-kit push
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and configure your AI provider and n8n instance in Settings.

### 5. Sync node documentation

Go to **Settings** and click **"Sync Now"** to index all n8n node documentation. This fetches docs from the official n8n GitHub repos and stores them as vector embeddings for RAG retrieval.

The sync also runs automatically every Monday via Vercel Cron.

## Architecture

### RAG Pipeline

The AI uses Retrieval-Augmented Generation to always have up-to-date n8n node knowledge:

1. **Ingestion** — Fetches node docs from `n8n-io/n8n-docs` (markdown) and `n8n-io/n8n` (source code) on GitHub
2. **Chunking** — Splits each node into overview, parameters, credentials, and examples chunks
3. **Embedding** — Generates vector embeddings via OpenAI `text-embedding-3-small`
4. **Storage** — Stores in Neon Postgres with pgvector for fast cosine similarity search
5. **Retrieval** — When the AI needs to build a workflow, it searches for relevant node docs using semantic similarity
6. **Generation** — The LLM uses retrieved docs to produce correct node types, versions, and parameter configurations

### Key Files

| Path | Purpose |
|------|---------|
| `src/lib/rag/ingest.ts` | GitHub fetching, parsing, chunking, embedding pipeline |
| `src/lib/rag/retrieval.ts` | Cosine similarity search for relevant node docs |
| `src/lib/rag/embedding.ts` | AI SDK embed/embedMany wrappers |
| `src/lib/db/schema.ts` | Drizzle ORM schema (node_docs + sync_log tables) |
| `src/lib/ai/tools.ts` | AI tools including RAG retrieval + workflow CRUD |
| `src/lib/ai/system-prompt.ts` | System prompt with RAG instructions |
| `src/app/api/sync-docs/route.ts` | API route for triggering doc sync |
| `vercel.json` | Vercel Cron job for weekly auto-sync |

## Deploy on Vercel

1. Push to GitHub
2. Import in [Vercel](https://vercel.com/new)
3. Add a Neon Postgres database from the Vercel Marketplace
4. Set environment variables (`DATABASE_URL`, `OPENAI_API_KEY`, `CRON_SECRET`)
5. Deploy — cron job for doc sync will activate automatically
