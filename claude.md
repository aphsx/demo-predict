# Moby Analytics — Project Context

## Project Overview

Internal analytics platform for **1Moby**, a B2B SaaS messaging company (SMS/Email service).
~5 internal users. Analyzes uploaded Excel data to predict customer churn, segment customers
by CLV/RFM, and forecast credit consumption.

**Deployment target:** Local Docker first. Production decision deferred.

## Tech Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + Better Auth client
- **API:** Elysia.js on Bun + Better Auth (server) + Drizzle ORM
- **ML Runtime:** Python + FastAPI health/internal surface; ML v2 training/prediction runner is being rebuilt
- **ML libs:** LightGBM, XGBoost, SHAP, lifetimes (BG-NBD/Gamma-Gamma), scikit-learn, Optuna
- **Database:** PostgreSQL 15
- **Progress:** Redis Streams for train import progress events
- **Storage:** Local filesystem (`./models` volume) in dev; R2 deferred
- **Monorepo:** Turborepo + Bun workspaces

## Repository Structure

```
moby-analytics/
├── apps/
│   ├── web/           # Next.js 14 — frontend + proxy rewrite to Elysia
│   ├── api/           # Elysia.js (Bun) — auth + import/clean REST
│   └── ml/            # Python — FastAPI health + ML v2 rebuild modules
├── packages/
│   └── types/         # Shared TypeScript types (stub; populate as routes solidify)
├── models/            # ML model artifacts (.pkl, metrics.json, training_log.txt)
├── data/              # Training Excel files
├── docker-compose.yml
├── turbo.json
├── package.json       # Bun workspace root
└── CLAUDE.md
```

## Service Ports

| Service | Internal | External | Notes |
|---|---|---|---|
| Next.js (`web`) | `:3000` | `:3000` | Proxy rewrites `/api/*` → Elysia |
| Elysia (`api`) | `:3001` | `:3001` | REST + Better Auth |
| FastAPI (`ml`) | `:8000` | `:8001` | Internal routes only |
| PostgreSQL (`db`) | `:5432` | `:5433` | Alembic manages schema |
| Redis | `:6379` | — | Train import progress Streams |

## Traffic Flow

```
Browser → Next.js :3000
  /api/auth/* → Next.js (dead handler — will be removed next)
  /api/*      → Elysia :3001 (Next.js proxy rewrite via ELYSIA_URL)

Elysia :3001
  → PostgreSQL (Drizzle)
  → Redis Streams (train import progress)
  → mounted routes: /train-data-sources, /predict-data-sources

FastAPI :8000/health  ← Docker healthcheck
ML v2 training/prediction runner is not wired to Elysia yet
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
- `train_data_sources`, `train_raw_sheet_*`, `train_clean_*` — training import/clean foundation
- `predict_data_sources`, `predict_raw_sheet_*`, `predict_clean_*` — prediction import/clean foundation
- `ml_training_runs`, `ml_feature_sets`, `ml_model_versions`, `ml_model_aliases`, `ml_model_evaluations` — ML v2 training/model registry
- `ml_prediction_runs`, `ml_prediction_outputs` — ML v2 prediction runs/output
- `ml_data_validation_reports` — structured quality-gate reports

Key design decisions:

- Train and predict imports are separate. Training uses `train_clean_*`; prediction uses `predict_clean_*`.
- Legacy `raw_customers`, `raw_payments`, `raw_usage`, `prediction_runs`, `predictions`, and `model_versions` are dropped/replaced.
- Observed lifecycle/status is separate from predicted scores. `lifecycle_stage` is rule-based, not a model score.
- All prediction output goes into `ml_prediction_outputs`, one row per customer per prediction run.
- Better Auth tables use camelCase column names (quoted identifiers in PG) — Drizzle schema
  preserves this in `apps/api/src/db/schema.ts`.

## ML v2 Components

| Component           | Type                       | Output                                               |
| ------------------- | -------------------------- | ---------------------------------------------------- |
| **Lifecycle**       | Rule-based                 | Stage: Ghost / Churned / Active Free / Active Paid   |
| **Churn**           | LightGBM + Optuna + SHAP   | `churn_probability`, per-customer SHAP factors       |
| **CLV + RFM**       | BG-NBD + Gamma-Gamma       | `predicted_clv_6m`, `p_alive`, `n_purchases`         |
| **Credit Forecast** | Quantile regression        | `credit_p10` … `credit_p90`                          |

Removed from ML v2 scope: win-back/conversion models and `comeback_probability` / `conversion_probability`.

## Current ML Rebuild Status

Implemented and verified:

- Clean data loaders for `train_clean_*` and `predict_clean_*`
- Gate 1-5 validation reports and persistence into `ml_data_validation_reports`
- Label builders and label viability checks
- Tier A feature builder with deterministic 24-feature contract
- `FeatureBuildResult.feature_df` for model inputs and `FeatureBuildResult.lifecycle_df` for observed lifecycle/status
- `ml_feature_sets` persistence with `feature_code_hash`
- Preprocessing contract: fit on train split only, transform validation/test/predict, save/load JSON artifact

Not built yet:

- Dataset builders (`features + labels + lifecycle_df`)
- Churn baseline/candidate training
- Champion/challenger alias activation
- Prediction runner writing `ml_prediction_outputs`

## Architectural Decisions

| Decision | Rationale |
|---|---|
| **Elysia (not FastAPI) owns REST** | Single process boundaries: ML pipeline code is Python-only; Elysia handles TypeScript-native concerns (typed API, SSE, Drizzle). |
| **No legacy Arq API enqueue** | Old `/runs` prediction runtime is removed; do not reintroduce `arq:queue` job producer for ML v2. |
| **Redis Streams for import progress** | Train import writes structured events that the API polls for progress. |
| **FastAPI is internal-only** | Python ML code stays behind the API boundary. Browser routes should go through Elysia/Next.js. |
| **Drizzle in introspect mode** | Alembic owns schema; Drizzle reflects it. `drizzle-kit generate` is never run. |
| **SSE not WebSockets** | Server pushes only. Auto-reconnect built-in. Works behind any proxy. |
| **PostgreSQL not MongoDB** | Data is relational. All ML output is tabular. |

## Route Map (Elysia)

```
Auth (Better Auth)
  /api/auth/*                     Better Auth native handler

Train Import
  GET    /train-data-sources
  POST   /train-data-sources/import
  GET    /train-data-sources/:id/import/progress

Predict Import
  GET    /predict-data-sources
  POST   /predict-data-sources/import
  GET    /predict-data-sources/:id/import/progress

Legacy prediction routes are not the ML v2 target. Prediction output should be rebuilt on
`ml_prediction_runs` + `ml_prediction_outputs`.

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

- **LLM / Gemini insights** — rebuild after ML v2 prediction outputs exist; do not reuse legacy `/runs/:id/explanation`.
- **R2 integration** — store `.pkl` files in Cloudflare R2 keyed by `dataset_id` (currently local filesystem)
- **Eden Treaty** — typed API client from web → Elysia (currently plain `fetch` + manual types in `web/src/lib/api.ts`)
- **Real email notifications** on pipeline completion

## What NOT to Change

- Legacy `apps/ml/src/models/` model code — replace only after the corresponding ML v2 model is implemented and verified.
- `apps/ml/src/training/` is the active ML v2 rebuild area.
- Legacy Arq worker/API enqueue path — do not extend it for ML v2 prediction. Build the new prediction runner separately.
- `apps/ml/alembic/` — Do not add migrations from Drizzle. Alembic owns the schema.
- Legacy `apps/ml/train.py` — do not revive old filesystem-Excel training; ML v2 trains from `train_clean_*`.

## Always Check

- Is the run status updated to `running`/`done`/`failed` at the right points?
- Are all Elysia routes using `requireUser`?
- Are run/source read routes shared across all authenticated internal users?
- Are run/source mutation routes restricted to the owner/importer (or future admin role), with null owner denied?
- Are uploaded files validated (size, MIME, required sheet presence) before inserting?
- Are batch inserts used (never row-by-row `for` loops)?
