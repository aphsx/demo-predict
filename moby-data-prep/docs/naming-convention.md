# Table naming convention

Prefix by **purpose** and **layer** so train, predict, and clean never collide.

## Pattern

```
{purpose}_{layer}_{entity}
```

| Segment | Values | Meaning |
|---------|--------|---------|
| `purpose` | `train`, `predict` | Training dataset vs inference/upload run |
| `layer` | `data` (catalog), `raw`, `clean` | Catalog / Excel-faithful / ETL output |
| `entity` | `sheet_*`, `sources`, `runs`, … | Specific table |

## Implemented (train raw)

| Table | Role |
|-------|------|
| `train_data_sources` | Catalog: one row per imported training `.xlsx` (`imported_by` = user who uploaded) |
| `train_raw_sheet_users_user_profile` | Raw sheet mirror |
| `train_raw_sheet_backend_payment` | Raw sheet mirror |
| `train_raw_sheet_sms_usage_bc` | Raw sheet mirror |
| `train_raw_sheet_sms_usage_api` | Raw sheet mirror |
| `train_raw_sheet_sms_usage_otp` | Raw sheet mirror |
| `train_raw_sheet_email_usage_bc` | Raw sheet mirror |
| `train_raw_sheet_email_usage_api` | Raw sheet mirror |
| `train_raw_sheet_email_usage_otp` | Raw sheet mirror |

Import CLI: `scripts/import_train_raw.py`  
Config: `config/excel_schema.yaml` (train raw only)

## Implemented (predict raw)

| Table | Role |
|-------|------|
| `predict_data_sources` | Catalog per upload; optional `prediction_run_id` → `prediction_runs` |
| `predict_raw_sheet_users_user_profile` | Raw sheet mirror (same 8 sheets as train) |
| `predict_raw_sheet_backend_payment` | … |
| `predict_raw_sheet_sms_usage_bc` | … |
| `predict_raw_sheet_sms_usage_api` | … |
| `predict_raw_sheet_sms_usage_otp` | … |
| `predict_raw_sheet_email_usage_bc` | … |
| `predict_raw_sheet_email_usage_api` | … |
| `predict_raw_sheet_email_usage_otp` | … |

Migration: `migrations/003_predict_raw_eight_tables.sql`  
API: `POST /predict-data-sources/import` (Elysia) · `/runs` page upload

## Reserved (not created yet)

### Clean (after ETL)

| Table | Role |
|-------|------|
| `train_clean_runs` | One clean job on a `train_data_sources` row |
| `train_clean_customers` | Typed, normalized rows (TBD columns) |
| `train_clean_payments` | … |
| `train_clean_usage` | Unified usage (channel + source) |
| `predict_clean_runs` | Clean job on predict raw |
| `predict_clean_*` | Same idea for predict path |

## Rules

1. **Never** share a raw table between train and predict — separate catalogs and sheet tables.
2. **Clean** tables only read from raw of the **same** purpose (`train_clean_*` ← `train_raw_*`).
3. Sheet suffix stays aligned across purposes: `train_raw_sheet_sms_usage_bc` ↔ `predict_raw_sheet_sms_usage_bc`.
4. Indexes: `idx_{table}_{columns}` e.g. `idx_train_raw_users_source`.
