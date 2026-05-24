# Data pipeline migration (in progress)

Greenfield raw layers first; legacy typed `raw_*` per run **removed**.

| Purpose | Layer | Status | Tables / routes |
|---------|-------|--------|-----------------|
| **Train** | raw | **NEW** | `train_data_sources`, `train_raw_sheet_*` · `POST /train-data-sources/import` · `/training` |
| **Train** | clean | planned | `train_clean_*` |
| **Predict** | raw | **NEW** (import only) | `predict_data_sources`, `predict_raw_sheet_*` · `POST /predict-data-sources/import` · `/runs` upload |
| Predict | clean | planned | `predict_clean_*` |
| **Predict** | ML output | **LEGACY** (still used) | `prediction_runs`, `predictions` · Arq worker (not wired to `predict_raw_*` yet) |
| ~~Predict~~ | ~~typed raw~~ | **removed** | ~~`raw_customers`, `raw_payments`, `raw_usage`~~ · ~~`POST /runs/:id/upload`~~ |

## Removed (004)

- PostgreSQL: `DROP` `raw_usage`, `raw_payments`, `raw_customers` (`moby-data-prep/migrations/004_drop_legacy_raw_tables.sql`)
- API: `apps/api/src/routes/uploads.ts` deleted
- Drizzle / SQLAlchemy models for `raw_*` removed
- Worker / SHAP: return error until `predict_raw_*` loader exists

## Predict raw import (current)

1. Create run → upload on `/runs` → `predict_raw_sheet_*`
2. Run status → `imported`
3. **No ML pipeline** from raw yet (retry → 503)

## Docker migrations

| File | Skip when |
|------|-----------|
| `001_*` | `train_data_sources` exists |
| `002_*` | always runs (`IF NOT EXISTS`) |
| `003_*` | `predict_data_sources` exists |
| `004_*` | `raw_customers` already dropped |

**Apply 004 on existing DB:**

```bash
docker exec -i demo-predict-db-1 psql -U moby -d moby \
  < moby-data-prep/migrations/004_drop_legacy_raw_tables.sql
```

Then **Refresh** in DBeaver (`localhost:5433`).

## Next

- Worker `load_from_db` from `predict_raw_*`
- Remove retry 503 / explain 503 when wired
