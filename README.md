# Moby Analytics

Internal analytics platform for **1Moby**, a B2B SaaS messaging company (SMS/Email).
It ingests a fixed-schema Excel export, then predicts customer **churn**, segments customers by
**CLV / value tier**, and forecasts **credit consumption** — for ~5 internal users.

> **New here?** Start with [`claude.md`](claude.md) for the full architecture, then
> [`docs/README.md`](docs/README.md) for the documentation map.

## Stack

| Layer | Tech |
|---|---|
| **Frontend** (`apps/web`) | Next.js 16 (App Router) · React 18 · TypeScript · Tailwind · Better Auth client · recharts · gsap |
| **API** (`apps/api`) | Elysia.js on Bun · Better Auth · Drizzle ORM (introspect-only) · ioredis |
| **ML** (`apps/ml`) | Python 3.11 · FastAPI (health + internal job triggers) · LightGBM · XGBoost · SHAP · lifetimes · Optuna |
| **Database** | PostgreSQL 15 (`pgvector/pgvector:pg15` image) · schema bootstrapped from `db/init/001_schema.sql` |
| **Queue / progress** | Redis (Arq + Redis Streams for progress) |
| **Monorepo** | Turborepo + Bun workspaces |

## Run it

### Docker (recommended)

```bash
cp .env.example .env          # fill in secrets (Google OAuth, Ollama, etc.)
docker compose up --build     # db, redis, ml, api, web
```

Fresh Postgres volumes initialize automatically from `db/init/001_schema.sql`.

### Local dev (fast UI loop)

Run the backing services in Docker and the frontend on the host:

```bash
docker compose up -d db redis api    # add `ml` if you need training/prediction
cd apps/web && bun install
ELYSIA_URL=http://localhost:3001 bun run dev   # Next.js on :3000
```

See [`docs/WEB-DEV-WORKFLOW.md`](docs/WEB-DEV-WORKFLOW.md) for the full UI workflow.

## Service ports

| Service | Internal | External | Notes |
|---|---|---|---|
| `web` (Next.js) | `:3000` | `:3000` | proxy-rewrites `/api/*` → Elysia |
| `api` (Elysia) | `:3001` | `:3001` | REST + Better Auth + SSE |
| `ml` (FastAPI) | `:8000` | `:8001` | internal-only: `/health` + job triggers |
| `db` (Postgres) | `:5432` | `:5433` | schema from `db/init/001_schema.sql` |
| `redis` | `:6379` | — | Arq queue + progress Streams |

## How data flows

```
Excel (8 sheets) ─import→ {train,predict}_raw_* ─clean→ {train,predict}_clean_*

TRAINING   train_clean_*  → gates → labels + features → temporal split
           → baselines + candidates (Optuna) → calibration → evaluation
           → promotion gate → artifacts + ml_model_versions (alias "production")

PREDICTION predict_clean_* → features → lifecycle rules → champion models
           → derived fields → ml_prediction_outputs (1 row / customer / run)

WEB        Overview ▸ Customers ▸ Customer 360 ▸ Model Performance ▸ Runs ▸ Training ▸ AI Assistant
```

Elysia owns all REST + auth + SSE. The ML FastAPI service is internal-only: Elysia triggers training
and prediction over `/internal/*` (token-gated), which spawn `apps/ml/train_v2.py` / `predict_v2.py`.
There are **3 ML models** (churn, CLV, credit) plus rule-based lifecycle — win-back and conversion
models were permanently cut.

## Documentation

| Doc | Purpose |
|---|---|
| [`claude.md`](claude.md) | Architecture, schema, conventions — the project's source of truth |
| [`docs/README.md`](docs/README.md) | Index of all docs |
| [`docs/ML-V2-*.md`](docs/) | ML v2 design: overview, dashboard spec, output contract, training pipeline |
| [`docs/AI-ASSISTANT.md`](docs/AI-ASSISTANT.md) | AI chat assistant architecture + build plan |
| [`moby-data-prep/`](moby-data-prep/) | Excel import contract, naming convention, raw/clean schemas |
