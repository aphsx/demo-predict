# Data pipeline migration (in progress)

We are replacing the legacy predict path with a greenfield layout. **Do not extend** `[LEGACY]` tables for new work.

| Purpose | Layer | Status | Tables / routes |
|---------|-------|--------|-----------------|
| **Train** | raw | **NEW** | `train_data_sources`, `train_raw_sheet_*` · `POST /train-data-sources/import` · `/training` |
| **Train** | clean | planned | `train_clean_*` |
| **Predict** | raw | **NEW** | `predict_data_sources`, `predict_raw_sheet_*` · `POST /predict-data-sources/import` · `/runs` upload |
| Predict | clean | planned | `predict_clean_*` |
| **Predict** | ML + legacy raw | **LEGACY** | `raw_*`, Arq worker · `POST /runs/:id/upload` (still in API, not used by `/runs` UI) |

Look for `[NEW]` and `[LEGACY]` in the codebase.

Spec: `moby-data-prep/docs/naming-convention.md`

## Predict raw import (current behavior)

1. User creates a run (`POST /runs`) — status `pending`.
2. User uploads Excel on `/runs` → `POST /predict-data-sources/import` with `prediction_run_id`.
3. Rows land in `predict_raw_sheet_*` (`row_payload` JSONB per Excel row).
4. Run status → `imported` (raw only; **Arq / ML pipeline not wired** to `predict_*` yet).

Re-upload = new `predict_data_sources` row (new snapshot), same as train.

## Docker (`DOCKER_BUILD=1` / `docker compose up --build`)

1. **Alembic** — `[LEGACY]` auth + `prediction_runs`, `raw_*`, `predictions`, …
2. **moby-data-prep SQL** (same script, after Alembic) — `moby-data-prep/migrations/*.sql` at `/app/train-migrations`

Per-file apply (`migrate_or_repair.py`):

| File | Skip when |
|------|-----------|
| `001_*` | `train_data_sources` exists |
| `002_*` | always runs (`ADD COLUMN IF NOT EXISTS`) |
| `003_*` | `predict_data_sources` exists |

**Local without Docker:**

```bash
psql "postgresql://moby:moby1234@localhost:5433/moby" -f moby-data-prep/migrations/001_train_raw_eight_tables.sql
psql "postgresql://moby:moby1234@localhost:5433/moby" -f moby-data-prep/migrations/002_add_imported_by.sql
psql "postgresql://moby:moby1234@localhost:5433/moby" -f moby-data-prep/migrations/003_predict_raw_eight_tables.sql
```

## Next steps

- Worker / `data_loader` read `predict_raw_*` instead of `raw_*`.
- `predict_clean_*` + enqueue pipeline after clean.
- Remove `[LEGACY]` `uploads.ts`, `raw_*` tables, and old routes.
