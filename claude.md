# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Moby Analytics — Project Context

## Project Overview

Internal analytics platform for **1Moby**, a B2B SaaS messaging company (SMS/Email service).
~5 internal users. Analyzes uploaded Excel data to predict customer churn, segment customers
by CLV/RFM, and forecast credit consumption.

**Deployment target:** Local Docker first. Production decision deferred.

## Commands

Package manager is **Bun** (`packageManager: bun@1.0.0`); the monorepo is driven by **Turborepo**. Run from repo root unless noted.

```bash
# Install all workspaces
bun install

# Full stack via Docker (recommended) — db, redis, ml, api, web.
# ml entrypoint runs migrate_or_repair.py (Alembic + moby-data-prep SQL) before serving.
docker compose up --build
docker compose up -d db redis        # just the backing services for local dev

# Run everything in dev via Turbo (web :3000, api :3001)
bun run dev
bun run build                        # turbo build (web: next build; api: none)
bun run lint                         # turbo lint — NOTE: no per-app lint scripts defined yet, so this is currently a no-op

# Per-app dev (cd into the app)
cd apps/web && bun run dev           # Next.js on :3000
cd apps/api && bun run dev           # Elysia, hot-reload (bun --watch) on :3001
cd apps/api && bun run db:introspect # Drizzle reflects current PG schema into src/db/schema.ts (never `generate`)

# ML service (Python 3.11). Run inside the container or a venv with apps/ml/requirements.txt installed.
cd apps/ml
uvicorn api.main:app --port 8000 --reload      # FastAPI health/internal surface only
python scripts/migrate_or_repair.py            # apply Alembic + moby-data-prep migrations / repair partial dev volumes
alembic revision --autogenerate -m "msg"       # ml_* / Better-Auth schema only — Alembic owns these
alembic upgrade head
```

### Tests / verification

There is **no unit-test framework** (no jest/vitest/pytest config). ML correctness is checked by the
`apps/ml/scripts/verify_*.py` "contract" scripts — run them against a populated DB after changing the
matching pipeline module:

```bash
cd apps/ml
python scripts/verify_clean_data_access.py     # train_clean_* / predict_clean_* loaders
python scripts/verify_feature_builder.py       # deterministic 24-feature contract + feature_code_hash
python scripts/verify_preprocessing.py         # fit-on-train-only preprocessing artifact
python scripts/profile_training_dataset.py     # dataset profiling / label viability
```

When asked whether an ML rebuild task is "good enough / complete / ready", use the `ml-contract-review`
Cursor skill (`.cursor/skills/ml-contract-review/`) and the specs under `docs/ML-*.md`.

## Tech Stack

<<<<<<< Updated upstream
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + Better Auth client
- **API:** Elysia.js on Bun + Better Auth (server) + Drizzle ORM + ioredis
- **ML Worker:** Python + Arq consumer + FastAPI (internal routes only: `/health`, `/internal/explain`, `/internal/train`)
=======
- **Frontend:** Next.js 16 (App Router) + React 18 + TypeScript + Tailwind CSS + Better Auth client (`recharts` for charts, `gsap` for animation). Note: prose in this repo sometimes says "Next.js 14" — `apps/web/package.json` is the source of truth.
- **API:** Elysia.js on Bun + Better Auth (server) + Drizzle ORM
- **ML Runtime:** Python + FastAPI health/internal surface; ML v2 training/prediction runner is being rebuilt
>>>>>>> Stashed changes
- **ML libs:** LightGBM, XGBoost, SHAP, lifetimes (BG-NBD/Gamma-Gamma), scikit-learn, Optuna
- **Database:** PostgreSQL 15
- **Queue:** Arq (Python-native Redis task queue) for job dispatch; Redis Streams for progress events
- **Storage:** Local filesystem (`./models` volume) in dev; R2 deferred
- **Monorepo:** Turborepo + Bun workspaces

## Repository Structure

```
moby-analytics/
├── apps/
<<<<<<< Updated upstream
│   ├── web/           # Next.js 14 — frontend + proxy rewrite to Elysia
│   ├── api/           # Elysia.js (Bun) — REST + auth + orchestration + SSE
│   └── ml/            # Python — FastAPI (internal) + Arq worker + train CLI
=======
│   ├── web/           # Next.js — frontend + proxy rewrite to Elysia (src/app/* routes)
│   ├── api/           # Elysia.js (Bun) — auth + import/clean REST (src/routes/{train,predict}-data.ts)
│   └── ml/            # Python — FastAPI health + ML v2 rebuild modules
│       ├── api/       #   FastAPI app (main.py = health only; keep tiny)
│       ├── src/training/  # Active ML v2 rebuild: data, features, labels, preprocessing, validation, repository
│       ├── scripts/   #   verify_*.py contract checks + migrate_or_repair.py + profile_training_dataset.py
│       └── alembic/   #   Owns the ml_* / Better-Auth schema migrations
├── moby-data-prep/    # Owns raw+clean table SQL (migrations/00X_*.sql) + Excel import contract docs/config
>>>>>>> Stashed changes
├── packages/
│   └── types/         # Shared TypeScript types (stub; populate as routes solidify)
├── docs/              # ML-*.md specs (SRS, FEATURE-SPEC, QUALITY-GATES, TASKS, EXPERIMENT-PLAN, DB-REBUILD-PLAN)
├── models/            # ML model artifacts (.pkl, metrics.json, training_log.txt)
├── data/              # Training Excel files
├── docker-compose.yml
├── turbo.json
├── package.json       # Bun workspace root
└── CLAUDE.md
```

Note: schema is owned by **two** migration sources, both applied at `ml` container startup by
`apps/ml/scripts/migrate_or_repair.py` (see `apps/ml/entrypoint.sh`): Alembic (`apps/ml/alembic/versions/`)
for `ml_*`/Better-Auth tables, and `moby-data-prep/migrations/*.sql` (mounted at `/app/train-migrations`)
for the `*_raw_sheet_*` / `*_clean_*` tables. Drizzle only introspects; never run `drizzle-kit generate`.

## Service Ports

| Service | Internal | External | Notes |
|---|---|---|---|
| Next.js (`web`) | `:3000` | `:3000` | Proxy rewrites `/api/*` → Elysia |
| Elysia (`api`) | `:3001` | `:3001` | REST + Better Auth + SSE |
| FastAPI (`ml`) | `:8000` | `:8001` | Internal routes only |
| PostgreSQL (`db`) | `:5432` | `:5433` | Alembic manages schema |
| Redis | `:6379` | — | Arq queue + progress Streams |

## Traffic Flow

```
Browser → Next.js :3000
  /api/auth/* → Next.js (dead handler — will be removed next)
  /api/*      → Elysia :3001 (Next.js proxy rewrite via ELYSIA_URL)

Elysia :3001
  → PostgreSQL (Drizzle)
  → Redis (Arq enqueue + progress XREAD)
  → FastAPI :8000/internal/explain  (SHAP, token-gated)
  → FastAPI :8000/internal/train    (training trigger, token-gated)

FastAPI :8000/health  ← Docker healthcheck
Arq worker            ← arq:queue (Redis), writes results to PostgreSQL
```

## Data Model

The user uploads a **fixed-schema Excel file with exactly 8 sheets**. Schema is FIXED.

| Sheet                | Purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `Users+User_profile` | acc_id, status(SMS/Email), credits, expire dates, join_date, last_access, last_send |
| `Backend_payment`    | uid, payment_date, acc_id, credit_add, amount, credit_type                          |
| `SMS_usage (BC)`     | year, month, acc_id, usage                                                          |
| `SMS_usage (API)`    | year, month, acc_id, usage                                                          |
| `SMS_usage (OTP)`    | year, month, acc_id, usage                                                          |
| `Email_usage (BC)`   | year, month, acc_id, usage                                                          |
| `Email_usage (API)`  | year, month, acc_id, usage                                                          |
| `Email_usage (OTP)`  | year, month, acc_id, usage                                                          |

## PostgreSQL Schema (Drizzle — introspected, Alembic owns migrations)

Tables:

- `user`, `session`, `account`, `verification` — Better Auth (camelCase column names)
- `model_versions` — trained model registry
- `prediction_runs` — one run per "Run Analysis" click
- `raw_customers`, `raw_payments`, `raw_usage` — parsed Excel rows (scoped per run)
- `predictions` — all ML output per customer per run (flat wide table)

Key design decisions:

- Raw data is scoped per run (`run_id` FK with CASCADE). Re-uploading clears and re-inserts.
- All ML output goes into a single `predictions` table (not split by model type).
- `model_version_id` on `prediction_runs` is present but currently not set by the pipeline.
- Better Auth tables use camelCase column names (quoted identifiers in PG) — Drizzle schema
  preserves this in `apps/api/src/db/schema.ts`.

## The Five ML Models + Lifecycle Engine

| Component           | Type                       | Output                                               |
| ------------------- | -------------------------- | ---------------------------------------------------- |
| **Lifecycle**       | Rule-based                 | Stage: Ghost / Churned / Active Free / Active Paid   |
| **Churn**           | LightGBM + Optuna + SHAP   | `churn_probability`, per-customer SHAP factors       |
| **CLV + RFM**       | BG-NBD + Gamma-Gamma       | `predicted_clv_6m`, `p_alive`, `n_purchases`         |
| **Credit Forecast** | Quantile regression        | `credit_p10` … `credit_p90`                          |
| **Winback**         | LightGBM                   | `comeback_probability` (for Churned stage only)      |
| **Conversion**      | LightGBM                   | `conversion_probability` (for Active Free only)      |

## Job Flow

1. User creates a run (`POST /runs`) — status: `pending`
2. User uploads Excel (`POST /runs/:id/upload`) — Elysia parses, batch-inserts raw rows, sets status `processing`, enqueues Arq job
3. Arq worker consumes `arq:queue`, runs the full 5-model pipeline via `MobyPredictor`
4. Worker writes progress to Redis Stream `progress:{run_id}` (XADD)
5. Elysia's SSE endpoint (`GET /runs/:id/stream`) XREADs from that stream and pushes to browser
6. Worker saves predictions to `predictions` table, updates run status to `done`/`failed`

## Architectural Decisions

| Decision | Rationale |
|---|---|
| **Elysia (not FastAPI) owns REST** | Single process boundaries: ML pipeline code is Python-only; Elysia handles TypeScript-native concerns (typed API, SSE, Drizzle). |
| **Arq for jobs** | Python-native queue; the only consumer is Python. No need for cross-language Streams protocol. |
| **Redis Streams for progress** | Worker pushes structured events; SSE endpoint XREADs without polling. |
| **FastAPI is internal-only** | SHAP and training require Python. Elysia proxies these via X-Internal-Token. FastAPI never serves the browser directly. |
| **Drizzle in introspect mode** | Alembic owns schema; Drizzle reflects it. `drizzle-kit generate` is never run. |
| **SSE not WebSockets** | Server pushes only. Auto-reconnect built-in. Works behind any proxy. |
| **PostgreSQL not MongoDB** | Data is relational. All ML output is tabular. |

## Route Map (Elysia)

```
Auth (Better Auth)
  /api/auth/*                     Better Auth native handler

Runs
  GET    /runs                    list user's runs
  POST   /runs                    create run
  GET    /runs/:id                get run
  DELETE /runs/:id                delete run + cascade

Upload
  POST   /runs/:id/upload         parse Excel, batch-insert, enqueue Arq job

Predictions
  GET    /runs/:id/predictions    paginated list (filters: lifecycle_stage, search)
  GET    /runs/:id/predictions/:acc_id   single customer
  GET    /runs/:id/predictions/:acc_id/explain   SHAP (proxied to FastAPI)
  GET    /runs/:id/summary        dashboard aggregates
  GET    /runs/:id/export         CSV download

SSE
  GET    /runs/:id/stream         Redis Streams XREAD → text/event-stream

Training / Admin
  GET    /model-metrics           metrics.json from models volume
  GET    /training-log            training_log.txt from models volume
  GET    /model-versions          model version history
  GET    /model-versions/active   latest active version per model type
  POST   /model-versions/train    trigger training (proxied to FastAPI)

Health
  GET    /health                  model file check + DB ping
```

## Code Style Rules

### TypeScript (web + api)

- Strict mode on. No `any`.
- Elysia: use `t.Object({...})` for input validation. Group routes by resource in `apps/api/src/routes/`.
- Drizzle: prefer query builder over raw `sql`. Use explicit snake_case column aliases in `select()` so response shapes match what the frontend expects.
- Shared types live in `packages/types`. Do not redefine across apps.
- Response keys must be snake_case (matches the existing frontend and prior FastAPI contract).

### Python (ml)

- Type hints on every function signature.
- One module per pipeline (`churn.py`, `clv.py`, `forecast.py`). No god files.
- Feature engineering separated from training/inference (`src/features.py`).
- `apps/ml/api/main.py` is now tiny — keep it that way. Resist adding user-facing logic here.

### Universal

- Every async operation must handle failure. Jobs must update `status='failed'` with `error_message` on exception.
- Never log sensitive data (session tokens, API keys, user PII).
- Environment variables from `process.env` / `os.environ` only. Never hardcode.
- Magic strings (queue names, stream keys, status values) extracted to constants.

## Environment Variables

### api (Elysia)
```
DATABASE_URL
REDIS_HOST / REDIS_PORT
BETTER_AUTH_SECRET
BETTER_AUTH_URL          # http://localhost:3001 in dev
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
ALLOWED_ORIGINS          # http://localhost:3000
INTERNAL_SERVICE_TOKEN   # shared with ml service
ML_INTERNAL_URL          # http://ml:8000
MODEL_DIR                # /app/models
```

### ml (FastAPI + worker + train)
```
DATABASE_URL
REDIS_HOST / REDIS_PORT
MODEL_DIR
DATA_DIR
INTERNAL_SERVICE_TOKEN   # shared with api service
GEMINI_API_KEY           # Phase 2 (LLM insights — not yet built)
```

### web (Next.js)
```
ELYSIA_URL               # http://api:3001 (Docker internal, for rewrites)
NEXT_PUBLIC_AUTH_URL     # http://localhost:3001 (browser-visible)
```

## What To Build Next (Phase 2)

- **LLM / Gemini insights** — `GET /runs/:id/explanation`, Gemini API call after ML pipeline completes, persisted in a new `explanations` table. The AI Chat page currently returns hardcoded demo responses; replace with real streaming.
- **R2 integration** — store `.pkl` files in Cloudflare R2 keyed by `dataset_id` (currently local filesystem)
- **Eden Treaty** — typed API client from web → Elysia (currently plain `fetch` + manual types in `web/src/lib/api.ts`)
- **Real email notifications** on pipeline completion

## What NOT to Change

- `apps/ml/src/` — ML pipeline code. Belongs to the original author. Touch only to fix bugs, never to refactor style.
- `apps/ml/worker/predict_worker.py` — Arq worker. Same constraint.
- `apps/ml/alembic/` — Do not add migrations from Drizzle. Alembic owns the schema.
- `apps/ml/train.py` — Training CLI.

## Always Check

- Is the run status updated to `running`/`done`/`failed` at the right points?
- Are all Elysia routes using `requireUser` and scoped by `userId`?
- Does `verifyRunOwnership` return 403 (not bypass) when `run.userId` is null?
- Are uploaded files validated (size, MIME, required sheet presence) before inserting?
- Are batch inserts used (never row-by-row `for` loops)?
