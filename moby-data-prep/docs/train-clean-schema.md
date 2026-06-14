# Train clean schema

Train-only typed tables populated from `train_raw_sheet_*` after Excel import.

## Tables

| Table | Source sheet(s) | Notes |
|-------|-----------------|-------|
| `train_clean_customers` | `Users+User_profile` | Mirrors `data_loader.py` user renames |
| `train_clean_payments` | `Backend_payment` | Drops rows without `payment_date` |
| `train_clean_usage` | 6 usage sheets | `channel` (sms/email) + `usage_source` (bc/api/otp) |

## Catalog (`train_data_sources`)

- `import_status`: `pending` \| `importing` \| `cleaning` \| `ready` \| `failed`
- `sheet_manifest`: raw row counts per sheet
- `clean_manifest`: `{ raw, clean: { customers, payments, usage }, skipped, warnings }`
- `train_clean_*`: `excel_row`, `raw_row_id` (lineage to raw row)
- `cleaned_at`: when clean ETL finished

## API

- `POST /train-data-sources/import` and `/import/async` run raw then clean in one job
- Progress: Redis stream `train-import:{source_id}`; UI polls `GET /train-data-sources/:id/import/progress`

## Not in scope

- `predict_clean_*` — separate future family
- ML `train.py --source-id` — not wired yet; still uses filesystem Excel in dev
