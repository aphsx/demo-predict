# AI Chat v2 — Rebuild Plan

Status: **Approved — building**
Author: rebuild effort, June 2026
Supersedes: the current `apps/api/src/routes/ai-chat.ts` chat path + `apps/web` chat UI.

---

## 1. Goal

Replace the current AI Chat (brittle text-to-SQL + fake keyword "RAG", no
persistence, no streaming) with a production-quality internal analytics
assistant for 1Moby.

Decisions locked with the product owner:

| Topic | Decision |
|---|---|
| **LLM** | Keep **Ollama Cloud** (`qwen3.5:397b-cloud`) for chat; add an Ollama embedding model for RAG |
| **Capabilities** | (1) Text-to-SQL over prediction data, (2) per-account investigation, (3) company/ML knowledge Q&A |
| **RAG** | **Real vector RAG** via **pgvector** (not keyword) |
| **Streaming** | **Yes** — token-by-token via SSE |
| **History** | **Full Postgres persistence** — multi-conversation, sidebar, rename/delete |
| **Knowledge ingestion** | Standard flow: auto-ingest existing docs on first boot + admin upload page for adding more later |

**Final adjustments after plan review:**
- Capabilities: keep the **3 core** only (no separate action/chart/export feature). Insights surface naturally inside answers via `priority_reason` / `churn_factors_json` when relevant.
- RAG: **inline source citations** in answers (footnote-style links back to the knowledge chunk).
- History/UI: **defaults** (sidebar + rename/delete + collapsible evidence panel).
- DB: dev volume is disposable, so AI-chat schema is folded straight into `db/init` and applied via `docker compose down -v` reinit — **no standalone migration needed**.

---

## 2. What we keep, rewrite, and delete

The current code is not all bad — the SQL safety layer is genuinely solid and
worth reusing. We rebuild the orchestration around it.

**Keep & extend (good engineering):**
- `apps/api/src/lib/ai/semantic-layer.ts` — table/column allow-list + role gating
- `apps/api/src/lib/ai/sql-guard.ts` — SELECT-only / limit / sensitive-column validation
- `apps/api/src/lib/ai/sql-executor.ts` — read-only transaction execution
- `apps/api/src/lib/ai/safety.ts` — question/output sanitization
- `apps/api/src/lib/ai/ollama.ts` — extended with **embeddings**, **streaming**, and **tool-calling**

**Rewrite:**
- `apps/api/src/routes/ai-chat.ts` — split into a thin route layer + an orchestrator module
- `apps/web/src/stores/chatStore.ts` — talk to persistent conversations + consume SSE stream
- `apps/web/src/features/ai-chat/AIChatView.tsx` + `AIChatWidget.tsx` — conversation sidebar, streaming render, evidence panel

**Delete:**
- `apps/api/src/lib/ai/company-knowledge.ts` — the fake keyword "RAG" (replaced by real vector RAG)
- The hardcoded routing / template branching inside the old route

---

## 3. Architecture

```
Browser (Next.js :3000)
  │  REST: conversations CRUD, knowledge admin
  │  SSE:  POST /ai-chat/conversations/:id/messages  → token stream
  ▼
Elysia :3001
  ├─ ai-chat routes (conversations, messages, knowledge)
  ├─ orchestrator (tool-calling loop)
  │     ├─ tool: query_database   → semantic-layer + sql-guard + sql-executor
  │     ├─ tool: get_customer     → per-account evidence query
  │     └─ tool: search_knowledge → pgvector cosine retrieval
  ├─ Ollama Cloud  (chat: qwen3.5:397b-cloud, stream=true, tools)
  └─ Ollama Cloud  (embed: embeddinggemma / nomic-embed-text)
  ▼
PostgreSQL 15 + pgvector
  conversations, messages, knowledge_documents, knowledge_chunks(embedding)
  + existing ml_prediction_outputs / predict_clean_* (read-only via SQL tool)
```

### Orchestration: agentic tool-calling (primary) with router fallback

Instead of the old brittle `if churn-intent → hardcoded SQL` branching, the LLM
is given three tools and decides which to call:

- `query_database(question)` — natural-language analytics → validated SQL → rows
- `get_customer(acc_id)` — full evidence bundle for one account (reuses the existing account query)
- `search_knowledge(query)` — top-k semantic chunks from the knowledge base

The model may call zero, one, or several tools, then synthesizes a grounded
answer. Every tool result is attached to the message as **evidence** (SQL run,
rows read, sources cited) so answers are auditable and never hallucinated.

If `qwen3.5:397b-cloud` tool-calling proves unreliable in testing, fall back to
a deterministic intent router (classify → call tools) using the same tool
functions — no rework of the tools themselves.

---

## 4. Database changes

New file `db/init/002_ai_chat.sql` (idempotent), also appended to fresh-volume
bootstrap. For existing volumes it is run once manually (instructions below).

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- Conversations (per user; optionally scoped to a prediction run)
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    run_id       uuid REFERENCES public.ml_prediction_runs(id) ON DELETE SET NULL,
    title        text NOT NULL DEFAULT 'New chat',
    archived     boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Messages
CREATE TABLE IF NOT EXISTS public.ai_messages (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('user','assistant')),
    content         text NOT NULL,
    evidence_json   jsonb,          -- sql, rows_read, sources, warnings
    model           text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_messages_conv_idx ON public.ai_messages(conversation_id, id);

-- Knowledge base
CREATE TABLE IF NOT EXISTS public.ai_knowledge_documents (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title        text NOT NULL,
    source       text NOT NULL,     -- e.g. file path or 'upload'
    uploaded_by  text REFERENCES public."user"(id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_knowledge_chunks (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id  uuid NOT NULL REFERENCES public.ai_knowledge_documents(id) ON DELETE CASCADE,
    chunk_index  int NOT NULL,
    content      text NOT NULL,
    embedding    vector(768),       -- dim depends on chosen embed model
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_embed_idx
    ON public.ai_knowledge_chunks USING hnsw (embedding vector_cosine_ops);
```

**Docker image change:** `postgres:15-alpine` → `pgvector/pgvector:pg15`
(drop-in, same data dir, adds the `vector` extension).

**Embedding dimension** is finalized in Phase 2 once we confirm the model
(`embeddinggemma` = 768, `nomic-embed-text` = 768).

---

## 5. RAG pipeline

1. **Chunk** — split source docs into ~500-token chunks with overlap.
2. **Embed** — call Ollama `/api/embed` per chunk; store vector.
3. **Retrieve** — embed the user query, `ORDER BY embedding <=> $query LIMIT k` (cosine).
4. **Ground** — top-k chunks injected into the prompt; sources cited back to the user.

**Initial knowledge sources (auto-ingested on first boot):**
- `docs/ML-V2-*.md` (overview, output contract, training pipeline, dashboard spec)
- The metric definitions currently hardcoded in `company-knowledge.ts`

**Admin upload (added later in same phase):** `POST /ai-chat/knowledge` accepts
`.md`/`.txt`/`.pdf`, runs the same chunk→embed→store flow, becomes searchable
immediately. `POST /ai-chat/knowledge/reindex` rebuilds everything.

---

## 6. API routes (Elysia, all under `requireUser`, scoped by `userId`)

```
GET    /ai-chat/conversations                 list (sidebar)
POST   /ai-chat/conversations                 create
GET    /ai-chat/conversations/:id             get + messages
PATCH  /ai-chat/conversations/:id             rename / archive
DELETE /ai-chat/conversations/:id             delete (cascade messages)
POST   /ai-chat/conversations/:id/messages    send user msg → SSE token stream of reply
                                              (persists user + assistant msg + evidence)

GET    /ai-chat/knowledge                     list documents (admin)
POST   /ai-chat/knowledge                     upload doc → ingest (admin)
DELETE /ai-chat/knowledge/:id                 remove doc + chunks (admin)
POST   /ai-chat/knowledge/reindex             rebuild embeddings (admin)
```

Auto title: first user message generates a short conversation title.

---

## 7. Streaming

- `POST /ai-chat/conversations/:id/messages` returns `text/event-stream`.
- Ollama chat called with `stream: true`; tokens relayed as SSE `data:` events.
- On completion the full assistant message + evidence is persisted, and a final
  `event: done` carries the evidence payload + message id.
- Frontend renders tokens live; on `done` it swaps in the evidence panel.

---

## 8. Frontend

- **Sidebar** — conversation list, new chat, rename, delete, active highlight.
- **Stream render** — assistant bubble fills token-by-token; typing indicator.
- **Evidence panel** — collapsible: SQL used, rows read, knowledge sources, warnings.
- **Admin knowledge page** — upload, list, delete, reindex (admin role only).
- `chatStore.ts` rewritten around the persistent API + SSE.

---

## 9. Build phases

1. **DB** — pgvector image + `002_ai_chat.sql` + Drizzle introspect + migration note.
2. **Embeddings + RAG** — extend `ollama.ts` (embed), chunker, ingest script, retrieval, verify cloud embeddings (fallback plan if unavailable).
3. **Orchestrator** — tool-calling loop reusing SQL safety + RAG + account query.
4. **Streaming + persistence** — SSE message endpoint, persist messages/evidence.
5. **REST routes** — conversations CRUD + knowledge admin.
6. **Frontend** — sidebar, streaming, evidence panel, knowledge upload page.
7. **Verification** — `apps/api` smoke checks + a `verify_ai_chat` script: schema present, embeddings round-trip, SQL guard still blocks writes, SSE streams, history persists.

---

## 10. Migration / rollout notes

- `db/init/*` only runs on a **fresh** Postgres volume. For the existing dev
  volume, run `002_ai_chat.sql` once manually:
  `docker compose exec -T db psql -U moby -d moby < db/init/002_ai_chat.sql`
  (or `docker compose down -v` to reinitialize from scratch — destroys data).
- New env vars: `OLLAMA_EMBED_MODEL` (default `embeddinggemma`),
  `AI_RAG_TOP_K` (default 5). Existing `OLLAMA_*` reused.
- No change to the ML pipeline, training, or existing prediction tables.

---

## 11. Open items confirmed as defaults (change if you disagree)

- Embedding model: `embeddinggemma` (768-dim) unless cloud only serves `nomic-embed-text`.
- Knowledge upload restricted to **admin** role.
- Conversations are **per-user private** (not shared across the ~5 internal users).
```
