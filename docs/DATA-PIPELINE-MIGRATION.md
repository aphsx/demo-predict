# Data pipeline migration (in progress)

Greenfield raw layers first; legacy typed `raw_*` per run **removed**.

| Purpose | Layer | Status | Tables / routes |
|---------|-------|--------|-----------------|
| **Train** | raw | **NEW** | `train_data_sources`, `train_raw_sheet_*` · `POST /train-data-sources/import` · `/training` |
| **Train** | clean | **NEW** | `train_clean_*` · runs after raw on same import (async SSE `phase`: raw \| clean) |
| **Predict** | raw | **NEW** (import only) | `predict_data_sources`, `predict_raw_sheet_*` · `POST /predict-data-sources/import` · `/runs` upload |
| Predict | clean | **NEW** | `predict_clean_*` · runs after raw on `POST /predict-data-sources/import` |
| **Predict** | ML output | **REBUILDING** | legacy `prediction_runs`/`predictions` dropped by Alembic `0006`; new output target is `ml_prediction_runs` + `ml_prediction_outputs` |
| ~~Predict~~ | ~~typed raw~~ | **removed** | ~~`raw_customers`, `raw_payments`, `raw_usage`~~ · ~~`POST /runs/:id/upload`~~ |

## Removed (004)

- PostgreSQL: `DROP` `raw_usage`, `raw_payments`, `raw_customers` (`moby-data-prep/migrations/004_drop_legacy_raw_tables.sql`)
- API: `apps/api/src/routes/uploads.ts` deleted
- Drizzle / SQLAlchemy models for `raw_*` removed
- Worker / SHAP: return error until `predict_raw_*` loader exists

## Predict raw import (current)

1. Upload predict dataset → `predict_data_sources` + `predict_raw_sheet_*`
2. Raw import → predict clean (typed + manifest)
3. Clean rows → `predict_clean_customers`, `predict_clean_payments`, `predict_clean_usage`
4. Prediction ML output is not wired yet; next target is `ml_prediction_runs` + `ml_prediction_outputs`

## ML rebuild status

Implemented and verified:

```text
train_clean_*/predict_clean_* loaders
data validation reports
label builders and label viability checks
Tier A feature builder
feature set contract + ml_feature_sets persistence
PIT/leakage report
observed lifecycle/status separation via lifecycle_df
preprocessing fit/transform/save/load contract
```

Not wired yet:

```text
dataset builders
churn baseline training
champion aliases
prediction runner
ml_prediction_outputs insertion
```

## Docker migrations

| File | Skip when |
|------|-----------|
| `001_*` | `train_data_sources` exists |
| `002_*` | always runs (`IF NOT EXISTS`) |
| `003_*` | `predict_data_sources` exists |
| `004_*` | `raw_customers` already dropped |
| `005_*` | `train_clean_customers` exists |
| `006_*` | always runs (`IF NOT EXISTS` lineage columns) |
| `007_*` | `predict_clean_customers` exists |

**Apply 005 on existing DB (if migrate_or_repair did not run it):**

```bash
docker exec -i demo-predict-db-1 psql -U moby -d moby \
  < moby-data-prep/migrations/005_train_clean_tables.sql
```

**Apply 004 on existing DB:**

```bash
docker exec -i demo-predict-db-1 psql -U moby -d moby \
  < moby-data-prep/migrations/004_drop_legacy_raw_tables.sql
```

Then **Refresh** in DBeaver (`localhost:5433`).

## Next

- Build dataset contracts from `feature_df + lifecycle_df + labels`
- Train/evaluate churn baselines before advanced models
- Implement prediction runner from `predict_clean_*` with champion aliases
