# Data pipeline migration (in progress)

We are replacing the legacy predict path with a greenfield layout.

| Purpose | Layer | Status | Tables / routes |
|---------|-------|--------|-----------------|
| **Train** | raw | **NEW** (use this) | `train_data_sources`, `train_raw_sheet_*` · `POST /train-data-sources/import` · `/training` page · `imported_by` → `user.id` (Better Auth) |
| **Train** | clean | planned | `train_clean_*` |
| Predict | raw | planned | `predict_data_sources`, `predict_raw_sheet_*` |
| Predict | clean | planned | `predict_clean_*` |
| **Predict** | raw + ML | **LEGACY** (being replaced) | `prediction_runs`, `raw_*`, `predictions` · `POST /runs/:id/upload` · `/runs` page |

Look for `[NEW]` and `[LEGACY]` comments in the codebase at integration points.

Spec: `moby-data-prep/docs/naming-convention.md`

## Docker (`DOCKER_BUILD=1` / `docker compose up --build`)

1. **Alembic** (ml `entrypoint.sh` → `migrate_or_repair.py`) — `[LEGACY]` tables: `user`, `prediction_runs`, `raw_*`, …
2. **Train raw SQL** (same script, after Alembic) — `[NEW]` from `moby-data-prep/migrations/*.sql` mounted at `/app/train-migrations`

If `train_data_sources` already exists, train migrations are skipped.

**Local without Docker:** run manually:

```bash
psql "$DATABASE_URL" -f moby-data-prep/migrations/001_train_raw_eight_tables.sql
psql "$DATABASE_URL" -f moby-data-prep/migrations/002_add_imported_by.sql
```
