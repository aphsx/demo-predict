# Predict clean schema

Per-run typed tables from `predict_raw_sheet_*` (same field contract as train clean).

## Tables

| Table | Source sheet(s) |
|-------|-----------------|
| `predict_clean_customers` | `Users+User_profile` |
| `predict_clean_payments` | `Backend_payment` |
| `predict_clean_usage` | 6 usage sheets (`channel` + `usage_source`) |

## Catalog (`predict_data_sources`)

- `import_status`: `pending` | `importing` | `cleaning` | `ready` | `failed`
- `prediction_run_id` — links upload to `prediction_runs`
- `sheet_manifest`, `clean_manifest`, `cleaned_at`
- Lineage on clean rows: `excel_row`, `raw_row_id`

## API

`POST /predict-data-sources/import` — raw then clean in one request (used from `/runs` upload).

## ML

Worker still reads legacy path until wired to `predict_clean_*`; `period` and labels are applied in Python at model load.
