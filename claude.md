# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository. It is the
single source of truth for architecture and conventions. When prose here disagrees with code,
trust the code and fix this file.

# Moby Analytics — Project Context

## Project Overview

Internal analytics platform for **1Moby**, a B2B SaaS messaging company (SMS/Email service).
~5 internal users. Analyzes uploaded Excel data to predict customer churn, segment customers
by CLV / value tier, and forecast credit consumption.

**Deployment target:** Local Docker first. Production decision deferred.

## Commands

Package manager is **Bun** (`packageManager: bun@1.0.0`); the monorepo is driven by **Turborepo**.
Run from repo root unless noted.

```bash
# Install all workspaces
bun install

# Full stack via Docker (recommended) — db, redis, ml, api, web.
# Fresh Postgres volumes initialize from the single schema at db/init/001_schema.sql.
docker compose up --build
docker compose up -d db redis        # just the backing services for local dev

# Run everything in dev via Turbo (web :3000, api :3001)
bun run dev
bun run build                        # turbo build (web: next build; api: none)
bun run lint                         # turbo lint — no per-app lint scripts yet, currently a no-op

# Per-app dev (cd into the app)
cd apps/web && bun run dev           # Next.js on :3000
cd apps/api && bun run dev           # Elysia, hot-reload (bun --watch) on :3001
cd apps/api && bun run db:introspect # Drizzle reflects current PG schema into src/db/schema.ts (never `generate`)

# ML service (Python 3.11). Run inside the container or a venv with apps/ml/requirements.txt installed.
cd apps/ml
uvicorn api.main:app --port 8000 --reload          # FastAPI health + internal job triggers only
python -m src.cli.train   --help                   # training CLI  (src/training/runner.py)
python -m src.cli.predict --help                   # prediction CLI (src/prediction/runner.py)
# Legacy shims still work: python train_v2.py / predict_v2.py
```

### Tests / verification

There is **no unit-test framework** (no jest/vitest/pytest config). ML correctness is checked by the
`apps/ml/scripts/verify_*.py` "contract" scripts — run them against a populated DB after changing the
matching pipeline module:

```bash
cd apps/ml
python scripts/verify_clean_data_access.py     # train_clean_* / predict_clean_* loaders
python scripts/verify_feature_builder.py       # model-specific feature contracts + feature_code_hash
python scripts/verify_preprocessing.py         # fit-on-train-only preprocessing artifact
python scripts/profile_training_dataset.py     # dataset profiling / label viability
```

When asked whether an ML rebuild task is "good enough / complete / ready", use the `ml-contract-review`
Cursor skill (`.cursor/skills/ml-contract-review/`) and the specs under `docs/ML-V2-*.md`.

## Tech Stack

- **Frontend:** Next.js 16 (App Router) + React 18 + TypeScript + Tailwind CSS + Better Auth client.
  Charts via `recharts`, animation via `gsap`, state via `zustand`, typed API client via `@elysiajs/eden`.
- **API:** Elysia.js on Bun + Better Auth (server) + Drizzle ORM (introspect-only) + ioredis.
- **ML:** Python 3.11. FastAPI exposes `/health` + internal job triggers only; the actual training and
  prediction run as CLIs (`train_v2.py`, `predict_v2.py`) under `apps/ml/src/{training,prediction}/`.
- **ML libs:** LightGBM, XGBoost, SHAP, lifetimes (BG-NBD/Gamma-Gamma), scikit-learn, Optuna.
- **Database:** PostgreSQL 15 (`pgvector/pgvector:pg15` image; the `vector` extension is reserved for
  AI-chat RAG but not yet enabled — see `docs/AI-ASSISTANT.md`).
- **Queue / progress:** Redis — Arq for job dispatch (Python-native), Redis Streams for progress events.
- **Storage:** Local filesystem (`./models` volume) in dev; R2 deferred.
- **Monorepo:** Turborepo + Bun workspaces.

## Canonical Documentation

The documentation map lives in [`docs/README.md`](docs/README.md). The ML v2 design is canonical:

- `docs/ML-V2-OVERVIEW.md` — system overview, scope, build phases
- `docs/ML-V2-DASHBOARD-SPEC.md` — what every web page/widget shows, field-by-field
- `docs/ML-V2-OUTPUT-CONTRACT.md` — `ml_prediction_outputs` field contract + derived-field formulas
- `docs/ML-V2-TRAINING-PIPELINE.md` — training pipeline, anti-leakage suite, metrics, promotion gate, retraining
- `docs/AI-ASSISTANT.md` — AI chat assistant (separate feature)
- `moby-data-prep/docs/*` — Excel import contract, table naming, raw/clean schemas

When implementing anything ML- or dashboard-related, follow these docs over any legacy code.

## Repository Structure

```
moby-analytics/
├── apps/
│   ├── web/           # Next.js 16 — frontend + proxy rewrite to Elysia (src/app/* routes)
│   ├── api/           # Elysia.js (Bun) — REST + auth + SSE + import/clean orchestration
│   │   └── src/routes/  # prediction-runs, training-runs, model-performance,
│   │                    #   train-data, predict-data, ai-chat
│   └── ml/            # Python — FastAPI (internal) + ML v2 training/prediction runners
│       ├── api/       #   FastAPI app (main.py = health + /internal job triggers; keep tiny)
│       ├── src/
│       │   ├── cli/         #   train.py / predict.py — CLI entry points (run via -m src.cli.*)
│       │   ├── training/    #   gates, labels, features, preprocessing, datasets, baselines,
│       │   │                #     {churn,clv,credit}_trainer, metrics, registry, runner
│       │   ├── prediction/  #   prediction runner → ml_prediction_outputs
│       │   └── constants.py
│       ├── train_v2.py / predict_v2.py   # compat shims → src/cli/train.py / predict.py
│       ├── pyproject.toml   # Python package metadata + console_scripts
│       └── scripts/         #   verify_*.py contract checks + profile_training_dataset.py
├── db/init/           # Single PostgreSQL bootstrap schema (001_schema.sql)
├── moby-data-prep/    # Excel import contract docs/config + import CLI
├── packages/
│   └── types/         # Shared TypeScript types (@moby/types) — single source for web + api
├── docs/              # ML-V2-*.md + AI-ASSISTANT.md + WEB-DEV-WORKFLOW.md (see docs/README.md)
├── models/            # ML model artifacts (.pkl, metrics.json, model_card)
├── data/              # Training Excel files
├── docker-compose.yml
├── turbo.json
├── package.json       # Bun workspace root
└── claude.md
```

Schema is a single bootstrap file at `db/init/001_schema.sql`, mounted into Postgres as
`/docker-entrypoint-initdb.d/001_schema.sql` for fresh Docker volumes. Drizzle only reflects that
schema for query building — **never run `drizzle-kit generate` or push schema from Drizzle**. There is
**no Alembic / migration framework**; schema changes are made directly in `001_schema.sql`.

## Service Ports

| Service | Internal | External | Notes |
|---|---|---|---|
| Next.js (`web`) | `:3000` | `:3000` | Proxy rewrites `/api/*` → Elysia |
| Elysia (`api`) | `:3001` | `:3001` | REST + Better Auth + SSE |
| FastAPI (`ml`) | `:8000` | `:8001` | Internal routes only (`/health`, `/internal/*`) |
| PostgreSQL (`db`) | `:5432` | `:5433` | Bootstrap from `db/init/001_schema.sql` |
| Redis | `:6379` | — | Arq queue + progress Streams |

## Traffic Flow

```
Browser → Next.js :3000
  /api/*  → Elysia :3001 (Next.js proxy rewrite via ELYSIA_URL)

Elysia :3001
  → PostgreSQL (Drizzle / pg)
  → Redis (progress Streams XADD/XREAD; Arq enqueue)
  → FastAPI :8000/internal/training-runs    (token-gated, spawns python -m src.cli.train)
  → FastAPI :8000/internal/prediction-runs  (token-gated, spawns python -m src.cli.predict)
  → Ollama (AI chat / insights)

FastAPI :8000/health  ← Docker healthcheck
ML runners            ← write results to PostgreSQL (ml_* tables)
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

See `moby-data-prep/docs/` for the full import contract and table-naming rules.

## PostgreSQL Schema (Drizzle reflects `db/init/001_schema.sql`)

Table families:

- **Better Auth:** `user`, `session`, `account`, `verification` (camelCase column names, quoted identifiers).
- **Data sources / raw:** `train_data_sources`, `predict_data_sources`, `train_raw_sheet_*`,
  `predict_raw_sheet_*` (8 sheet mirrors each).
- **Clean:** `train_clean_*`, `predict_clean_*` (customers / payments / usage).
- **ML v2:** `ml_training_runs`, `ml_prediction_runs`, `ml_prediction_outputs` (flat wide output, 1 row
  per customer per run), `ml_model_versions`, `ml_model_evaluations`, `ml_model_aliases`,
  `ml_model_activation_history`, `ml_feature_sets`, `ml_data_validation_reports`.
- **AI chat:** `ai_conversations`, `ai_messages`. (Knowledge/vector tables are planned — see
  `docs/AI-ASSISTANT.md`.)

Key design decisions:

- Raw/clean data is scoped per source (`source_id` FK with CASCADE). Re-uploading clears and re-inserts.
- All ML output goes into a single `ml_prediction_outputs` table (not split by model type).
- Champion selection is via `ml_model_aliases` (`production` alias, one per model_type).
- Better Auth tables use camelCase column names — Drizzle schema preserves this in
  `apps/api/src/db/schema.ts`.

## ML v2 Components (see `docs/ML-V2-OVERVIEW.md` — canonical)

| Component           | Type                                 | Output                                              |
| ------------------- | ------------------------------------ | --------------------------------------------------- |
| **Lifecycle**       | Rule-based (not ML)                  | `lifecycle_stage`, `sub_stage`                      |
| **Churn**           | LightGBM + calibration + SHAP        | `churn_probability`, `churn_risk_level`, factors    |
| **CLV**             | BG-NBD + Gamma-Gamma vs ML regressor | `predicted_clv_6m`, `p_alive`                       |
| **Credit Forecast** | LightGBM quantile regression         | `predicted_credit_usage_30d/90d`, days-until-topup  |

Win-back and conversion models (`comeback_probability`, `conversion_probability`)
were **permanently cut** — do not reintroduce them.

## Job Flow (prediction run)

1. User imports predict data on `/runs` (`POST /predict-data-sources/import`) — raw + clean in one job;
   progress streamed via Redis Stream `predict-import:{source_id}`.
2. User creates a run (`POST /prediction-runs`) with `{ predict_source_id, name, cutoff_date }`.
3. Elysia calls FastAPI `/internal/prediction-runs` (token-gated), which spawns `predict_v2.py`.
4. The prediction runner loads `predict_clean_*` → gates → features → lifecycle + eligibility →
   champion models (churn / clv / credit) → SHAP (churn) → derived fields → **batch insert** into
   `ml_prediction_outputs` (one row per customer).
5. Run status moves `in_progress` → `completed` / `failed` (every exception ends in `failed` + `error_message`).

Training follows the same shape via `POST /training-runs` → `/internal/training-runs` → `train_v2.py`
(see `docs/ML-V2-TRAINING-PIPELINE.md`).

## Architectural Decisions

| Decision | Rationale |
|---|---|
| **Elysia (not FastAPI) owns REST** | ML pipeline code is Python-only; Elysia handles TypeScript-native concerns (typed API, SSE, Drizzle). |
| **FastAPI is internal-only** | Training/prediction/SHAP require Python. Elysia proxies via `INTERNAL_SERVICE_TOKEN`. FastAPI never serves the browser directly. |
| **ML runs as spawned CLIs** | `train_v2.py` / `predict_v2.py` are launched from FastAPI internal endpoints; results land in `ml_*` tables. |
| **Redis Streams for progress** | Workers push structured events; SSE / polling endpoints read without busy-looping. |
| **SSE not WebSockets** | Server pushes only (AI chat tokens, run progress). Auto-reconnect, works behind any proxy. |
| **Drizzle in introspect mode** | `db/init/001_schema.sql` owns schema; Drizzle reflects it. No `drizzle-kit generate`, no Alembic. |
| **PostgreSQL not MongoDB** | Data is relational. All ML output is tabular. |

## Route Map (Elysia — all keys snake_case, all routes `requireUser`)

```
Auth
  /api/auth/*                       Better Auth native handler

Prediction runs
  GET    /prediction-runs                       list runs
  POST   /prediction-runs                       create run { predict_source_id, name, cutoff_date }
  GET    /prediction-runs/:id                   run detail + progress
  DELETE /prediction-runs/:id                   owner only, cascade
  GET    /prediction-runs/:id/summary           dashboard aggregates (SQL-side)
  GET    /prediction-runs/:id/outputs           paginated customer table (sort/filter)
  GET    /prediction-runs/:id/outputs/:acc_id   Customer 360 (output + profile snapshot)
  GET    /prediction-runs/:id/customers/:acc_id/usage-monthly | payments

Data sources
  POST   /predict-data-sources/import           import predict Excel (raw + clean)
  POST   /train-data-sources/import             import train Excel (raw + clean)

Training / models
  POST   /training-runs                         trigger training { train_source_id, cutoff_date, horizon_days }
  GET    /training-runs/:id                     progress + gate results + metrics
  GET    /model-performance                     champion per model_type + evaluations + baselines

AI chat
  GET    /ai-chat/config                         { configured, provider, model } for the UI status line
  GET/POST/PATCH/DELETE /ai-chat/conversations[/:id]   POST accepts { title?, run_id? } (run-bound chat)
  POST   /ai-chat/conversations/:id/messages    SSE token stream (thinking/token/evidence/title/done/error)
                                                self-correcting Text-to-SQL agent; row-scope enforced to
                                                the user's own runs/sources (run-bound chats: that run only)

Health
  GET    /health
```

## Code Style Rules

### TypeScript (web + api)

- Strict mode on. No `any`.
- File naming: **kebab-case** for all files in `apps/web/src/` (e.g. `my-component.tsx`, `my-store.ts`). Export names stay PascalCase/camelCase.
- Elysia: use `t.Object({...})` for input validation. Group routes by resource in `apps/api/src/routes/`.
- Drizzle: prefer query builder over raw `sql`. Use explicit snake_case column aliases in `select()`.
- Shared types live in `packages/types` (`@moby/types`). Do not redefine across apps — import from there.
- Response keys must be snake_case (matches the frontend contract).
- Shared Excel parsing utilities are in `apps/api/src/lib/data-import/excel-core.ts` — do not duplicate in `train-import.ts` / `predict-import.ts`.

### Python (ml)

- Type hints on every function signature.
- One module per concern (`features.py`, `labels.py`, `{churn,clv,credit}_trainer.py`). No god files.
- Feature engineering separated from training/inference.
- `apps/ml/api/main.py` stays tiny — health + internal triggers only. No user-facing logic.

### Universal

- Every async operation must handle failure. Runs must update `status='failed'` with `error_message` on exception.
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
OLLAMA_API_KEY / OLLAMA_HOST / OLLAMA_MODEL        # AI chat + insights
OLLAMA_EMBED_MODEL / AI_RAG_TOP_K                  # RAG (planned)
```

### ml (FastAPI + runners)
```
DATABASE_URL
REDIS_HOST / REDIS_PORT
MODEL_DIR
DATA_DIR
INTERNAL_SERVICE_TOKEN   # shared with api service
```

### web (Next.js)
```
ELYSIA_URL               # http://api:3001 (Docker internal, for rewrites)
NEXT_PUBLIC_AUTH_URL     # http://localhost:3000 (browser-visible)
```

## What To Build Next (Phase 2)

- **AI chat RAG** — enable the `vector` extension + knowledge tables, ingest `docs/`, real retrieval
  (see `docs/AI-ASSISTANT.md`).
- **R2 integration** — store `.pkl` artifacts in Cloudflare R2 (currently local filesystem).
- **Realized-outcome loop** — measure predictions against actuals once a horizon completes
  (see `docs/ML-V2-TRAINING-PIPELINE.md` §15).
- **Real email notifications** on pipeline completion.

## What NOT to Change

- `apps/ml/src/training/` and `apps/ml/src/prediction/` — ML pipeline code. Touch only to fix bugs, never to refactor style.
- `db/init/001_schema.sql` — single schema bootstrap; edit deliberately and keep Drizzle in sync.
- `apps/ml/src/cli/train.py` / `apps/ml/src/cli/predict.py` — CLI entrypoints (spawned by FastAPI via `python -m`). `train_v2.py`/`predict_v2.py` are compat shims that forward to these.

## Always Check

- Is the run status updated to `in_progress`/`completed`/`failed` at the right points?
- Are all Elysia routes using `requireUser` and scoped by `userId`?
- Does run-ownership verification return 403 (not bypass) when ownership is null?
- Are uploaded files validated (size, MIME, required sheet presence) before inserting?
- Are batch inserts used (never row-by-row `for` loops)?
