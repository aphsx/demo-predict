# Excel import contract (train raw)

Machine-readable: [`config/excel_schema.yaml`](../config/excel_schema.yaml)  
Naming: [`naming-convention.md`](naming-convention.md)

Target tables: **`train_data_sources`** + **`train_raw_sheet_*`**

Reference file: `data/[1Moby] Data_example for Bangkok university.xlsx`

## Workbook structure

| Sheet | Required | PG table |
|-------|----------|----------|
| `Users+User_profile` | yes | `train_raw_sheet_users_user_profile` |
| `Backend_payment` | yes | `train_raw_sheet_backend_payment` |
| `SMS_usage (BC)` | no | `train_raw_sheet_sms_usage_bc` |
| `SMS_usage (API)` | no | `train_raw_sheet_sms_usage_api` |
| `SMS_usage (OTP)` | no | `train_raw_sheet_sms_usage_otp` |
| `Email_usage (BC)` | no | `train_raw_sheet_email_usage_bc` |
| `Email_usage (API)` | no | `train_raw_sheet_email_usage_api` |
| `Email_usage (OTP)` | no | `train_raw_sheet_email_usage_otp` |

## Headers

Keys in `row_payload` use trimmed Excel headers. See prior doc sections for `Users+User_profile` / `Backend_payment` / usage column lists.

## CLI

```bash
python scripts/import_train_raw.py \
  --file path/to/file.xlsx \
  --name "Display name" \
  --client client_label
```

Predict path (future): `import_predict_raw.py` → `predict_raw_sheet_*`.
