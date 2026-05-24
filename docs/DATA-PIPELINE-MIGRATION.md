# Data pipeline migration (in progress)

We are replacing the legacy predict path with a greenfield layout.

| Purpose | Layer | Status | Tables / routes |
|---------|-------|--------|-----------------|
| **Train** | raw | **NEW** (use this) | `train_data_sources`, `train_raw_sheet_*` · `POST /train-data-sources/import` · `/training` page |
| **Train** | clean | planned | `train_clean_*` |
| Predict | raw | planned | `predict_data_sources`, `predict_raw_sheet_*` |
| Predict | clean | planned | `predict_clean_*` |
| **Predict** | raw + ML | **LEGACY** (being replaced) | `prediction_runs`, `raw_*`, `predictions` · `POST /runs/:id/upload` · `/runs` page |

Look for `[NEW]` and `[LEGACY]` comments in the codebase at integration points.

Spec: `moby-data-prep/docs/naming-convention.md`
