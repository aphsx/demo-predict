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

- **Frontend:** Next.js 16 (App Router) + React 18 + TypeScript + Tailwind CSS + Better Auth client (`recharts` for charts, `gsap` for animation). Note: prose in this repo sometimes says "Next.js 14" — `apps/web/package.json` is the source of truth.
- **API:** Elysia.js on Bun + Better Auth (server) + Drizzle ORM
- **ML Runtime:** Python + FastAPI internal surface (`/health`, `/internal/training-runs`, `/internal/prediction-runs`) — training/prediction runs execute as detached subprocesses (`train_v2.py` / `predict_v2.py`)
- **ML libs:** LightGBM, XGBoost, SHAP, lifetimes (BG-NBD/Gamma-Gamma), scikit-learn, Optuna
- **Database:** PostgreSQL 15
- **Storage:** Local filesystem (`./models` volume) in dev; R2 deferred
- **Monorepo:** Turborepo + Bun workspaces

## Canonical ML v2 Documentation

The single source of truth for ML v2 design lives in `docs/` (older ML/design docs were deleted):

- `docs/ML-V2-OVERVIEW.md` — system overview, scope, build phases
- `docs/ML-V2-DASHBOARD-SPEC.md` — what every web page/widget shows, field-by-field
- `docs/ML-V2-OUTPUT-CONTRACT.md` — `ml_prediction_outputs` field contract + derived-field formulas
- `docs/ML-V2-TRAINING-PIPELINE.md` — training pipeline, anti-leakage suite, metrics, promotion gate, retraining policy

When implementing anything ML- or dashboard-related, follow these docs over any legacy code.

## Repository Structure

```
moby-analytics/
├── apps/
│   ├── web/           # Next.js — frontend + proxy rewrite to Elysia (src/app/* routes)
│   ├── api/           # Elysia.js (Bun) — auth + import/clean + ML v2 REST
│   │                  #   routes: {train,predict}-data.ts, prediction-runs.ts,
│   │                  #           training-runs.ts, model-performance.ts, ai-chat.ts
│   └── ml/            # Python — FastAPI internal API + ML v2 pipeline
│       ├── api/       #   FastAPI app (health + internal job triggers; keep tiny)
│       ├── src/training/    # gates, features, labels, preprocessing, datasets,
│       │                    # baselines, churn/clv/credit trainers, leakage,
│       │                    # registry, artifacts, runner (train_v2.py entry)
│       ├── src/prediction/  # prediction runner → ml_prediction_outputs (predict_v2.py entry)
│       ├── scripts/   #   verify_*.py contract checks + migrate_or_repair.py
│       └── alembic/   #   Owns the ml_* / Better-Auth schema migrations
├── moby-data-prep/    # Owns raw+clean table SQL (migrations/00X_*.sql) + Excel import contract docs/config
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
  /api/*      → Elysia :3001 (Next.js proxy rewrite via ELYSIA_URL)

Elysia :3001
  → PostgreSQL (Drizzle — clean tables, ml_* registry/run/output tables)
  → FastAPI :8000/internal/training-runs    (token-gated job trigger)
  → FastAPI :8000/internal/prediction-runs  (token-gated job trigger)

FastAPI :8000/health  ← Docker healthcheck
train_v2.py / predict_v2.py  ← detached subprocesses spawned by FastAPI;
                               they own all run status/progress updates in PG
                               (web polls run rows — no Redis in the ML path)
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

## PostgreSQL Schema (Drizzle — introspected, Alembic + moby-data-prep own migrations)

Tables:

- `user`, `session`, `account`, `verification` — Better Auth (camelCase column names)
- `train_data_sources` + `train_raw_sheet_*` + `train_clean_*` — training datasets (import → clean)
- `predict_data_sources` + `predict_raw_sheet_*` + `predict_clean_*` — prediction datasets (kept separate from train end-to-end)
- `ml_training_runs` — one row per training run (status / progress_json / results_json)
- `ml_feature_sets` — feature contract registry (`feature_code_hash` must match at predict time)
- `ml_model_versions` / `ml_model_aliases` / `ml_model_activation_history` — model registry; prediction loads only via alias `production`
- `ml_model_evaluations` — every metric for every split/cutoff/baseline (Model Performance reads this)
- `ml_data_validation_reports` — gate + leakage + output post-check evidence
- `ml_prediction_runs` / `ml_prediction_outputs` — one output row per customer per run (OUTPUT-CONTRACT)

Key design decisions:

- Train and predict clean data never mix (separate tables from import onward).
- All per-customer ML output is scalar columns + JSONB on `ml_prediction_outputs`; time-series charts read `predict_clean_*` directly.
- `artifact_path` on `ml_model_versions` is RELATIVE to `MODEL_DIR`.
- Better Auth tables use camelCase column names (quoted identifiers in PG) — Drizzle schema preserves this in `apps/api/src/db/schema.ts`.

## ML v2 Models + Lifecycle Engine

| Component           | Type                                              | Output                                                       |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| **Lifecycle**       | Rule-based (not ML)                               | `lifecycle_stage`, `sub_stage`                               |
| **Churn**           | LR/RF/LGBM/XGB candidates + Optuna + calibration  | `churn_probability`, `churn_risk_level`, `churn_factors_json` |
| **CLV**             | BG-NBD + Gamma-Gamma vs LightGBM Tweedie          | `predicted_clv_6m`, `p_alive`                                |
| **Credit Forecast** | LightGBM quantile (anchored on carryover baseline) | `predicted_credit_usage_30d/90d`, p10–p90 interval, `estimated_days_until_topup` |

Win-back and conversion models were removed permanently (ML-V2-OVERVIEW).
Churn champion = highest-CV candidate that passes the promotion gate (a tree that
cannot decisively beat logistic regression is not promoted over it).

## Job Flow (ML v2)

Training: `POST /training-runs` (Elysia inserts `ml_training_runs`, status `pending`)
→ Elysia POSTs `/internal/training-runs` on FastAPI (X-Internal-Token)
→ FastAPI spawns `python train_v2.py --training-run-id …` detached
→ runner: gates 1–5 → datasets (temporal split) → baselines + candidates (Optuna)
→ calibration (OOF) → leakage suite → month-aligned backtests → promotion gate
→ artifacts (`models/{type}/{version}/`) + registry + alias `production`
→ run row ends `completed`/`failed`; web polls `progress_json`/`results_json`.

Prediction: `POST /prediction-runs` → same trigger pattern → `predict_v2.py`
→ gates → features (same contract + hash check) → champions via alias →
derived fields (§5) → batch insert `ml_prediction_outputs` (1 row per customer)
→ Gate 15 post-check → run `completed` with `total_customers` + `model_versions_json`.

## Architectural Decisions

| Decision | Rationale |
|---|---|
| **Elysia (not FastAPI) owns REST** | ML pipeline code is Python-only; Elysia handles TypeScript-native concerns (typed API, Drizzle). |
| **HTTP trigger + detached subprocess (no queue)** | One ML job at a time for a 5-user tool; run rows in PG are the single source of progress/state. |
| **FastAPI is internal-only** | Training/prediction require Python. Elysia proxies via X-Internal-Token. FastAPI never serves the browser directly. |
| **Drizzle in introspect mode** | Alembic + moby-data-prep own schema; Drizzle reflects it. `drizzle-kit generate` is never run. |
| **Registry alias `production`** | Prediction never hardcodes a version; promotion/rollback = alias repoint with activation history. |
| **PostgreSQL not MongoDB** | Data is relational. All ML output is tabular. |

## Route Map (Elysia)

```
Auth (Better Auth)
  /api/auth/*                                Better Auth native handler

Data sources (import + clean)
  GET/POST/DELETE /train-data-sources …      import 8-sheet Excel → raw → clean
  GET/POST/DELETE /predict-data-sources …    same for predict datasets
  GET    /train-data-sources/:id/suggested-cutoff     Gate-3 feasible cutoff
  GET    /predict-data-sources/:id/suggested-cutoff   latest data date + 1

Prediction runs (ML v2)
  GET/POST /prediction-runs                  list / create (+trigger ML)
  GET/DELETE /prediction-runs/:id            detail (progress) / delete
  POST   /prediction-runs/:id/retry          failed runs only
  GET    /prediction-runs/:id/summary        all Overview widgets in one call
  GET    /prediction-runs/:id/outputs        customers table (filter/sort/page)
  GET    /prediction-runs/:id/outputs/:acc_id              Customer 360
  GET    /prediction-runs/:id/customers/:acc_id/usage-monthly
  GET    /prediction-runs/:id/customers/:acc_id/payments

Training runs
  GET/POST /training-runs                    history / start training (+trigger ML)
  GET    /training-runs/:id                  progress + per-model results

Model performance
  GET    /model-performance                  champions + evaluations + baselines

AI chat
  POST   /ai-chat/*                          isolated LLM chat API

Health
  GET    /health
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
- One module per concern under `src/training/` (`datasets.py`, `churn_trainer.py`, …). No god files.
- Feature engineering separated from training/inference (`src/training/features.py` — changing it changes `feature_code_hash`; prediction aborts on hash mismatch until retrain).
- `apps/ml/api/main.py` is tiny — keep it that way. Resist adding user-facing logic here.

### Universal

- Every async operation must handle failure. Jobs must update `status='failed'` with `error_message` on exception.
- Never log sensitive data (session tokens, API keys, user PII).
- Environment variables from `process.env` / `os.environ` only. Never hardcode.
- Magic strings (queue names, stream keys, status values) extracted to constants.

## Environment Variables

### api (Elysia)
```
DATABASE_URL
BETTER_AUTH_SECRET
BETTER_AUTH_URL          # http://localhost:3000 (auth flows through the Next proxy)
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
ALLOWED_ORIGINS          # http://localhost:3000
INTERNAL_SERVICE_TOKEN   # shared with ml service
ML_INTERNAL_URL          # http://ml:8000
DEV_AUTH_BYPASS / DEV_AUTH_BYPASS_USER_ID   # local-only auth bypass
```

### ml (FastAPI + train/predict CLIs)
```
DATABASE_URL
MODEL_DIR                # artifact root; ml_model_versions.artifact_path is relative to this
DATA_DIR
INTERNAL_SERVICE_TOKEN   # shared with api service
GEMINI_API_KEY           # Phase 2 (LLM insights)
```

### web (Next.js)
```
ELYSIA_URL               # http://api:3001 (Docker internal, for rewrites)
NEXT_PUBLIC_AUTH_URL     # http://localhost:3000 (browser-visible)
NEXT_PUBLIC_ML_USE_MOCK  # "1" = serve deterministic mocks instead of the real ML API (offline dev only)
```

## What To Build Next (Phase 2)

- **Realized-outcome loop** (TRAINING §15) — when a prediction run is 180 days old and newer data exists, compute real labels and write `evaluation_type='production_holdout'` rows; drives the retrain trigger.
- **AI explanation per customer** — fill the `ai_*` columns on `ml_prediction_outputs` (schema ready, `ai_status` default `not_requested`).
- **R2 integration** — store artifacts in Cloudflare R2 (currently local `models/` volume).
- **Eden Treaty** — typed API client from web → Elysia (currently plain `fetch` + manual types in `web/src/lib/mlApi.ts`).
- **Real email notifications** on pipeline completion.

## What NOT to Change

- `apps/ml/alembic/` — Do not add migrations from Drizzle. Alembic owns the `ml_*` schema; `moby-data-prep/migrations/` owns raw/clean tables.
- `apps/ml/src/training/features.py` — feature contract; any change must bump the feature set version and retrain (hash-checked at predict time).
- Metric key names in `src/training/metrics.py` — they are part of the web contract (`metricInfo.ts`).

## Always Check

- Does every training/prediction run end at `completed`/`failed` (never stuck `in_progress`), with `error_message` on failure?
- Are all Elysia routes using `requireUser`? Mutations owner-only via `canMutateOwnedRecord`.
- Do features/labels respect point-in-time (feature < cutoff, label ≥ cutoff)? Never mix.
- Is the test split touched exactly once per training run?
- Are batch inserts used (never row-by-row `for` loops)?
- Does the UI read thresholds/risk bands from the API (model card) — never hardcoded?
