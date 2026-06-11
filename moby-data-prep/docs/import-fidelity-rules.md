# Import fidelity rules (train raw)

Applies to `import_train_raw.py` → `train_data_sources` / `train_raw_sheet_*`.

What the importer **does** and **does not** do. Business cleaning belongs in a later **clean** phase.

## Principles

| Do at import | Defer to clean |
|--------------|----------------|
| Store every non-empty data row | Convert Excel serial → `date` / `timestamptz` |
| Keep duplicate rows | Dedupe usage (e.g. mock API = OTP sheets) |
| Trim header strings only | Drop payments without `payment_date` |
| Record `excel_row` for audit | `fillna(0)` on credits |
| One table per sheet | UNION usage + `channel` / `source` |
| SHA-256 checksum on file | Orphan `acc_id` checks |
| Block re-import of identical file | Feature engineering |

## Row handling

- **Header row:** row 1 in Excel; not stored.
- **`excel_row`:** 2 for first data row, etc.
- **Wholly empty rows:** skipped when `skip_wholly_empty_rows: true` (trailing blanks at end of sheet).
- **Partial empty rows:** kept if any cell has a value.

## Cell values

- Numbers, strings, booleans → stored directly in JSON.
- If openpyxl returns `datetime` / `date`, stored as:

  ```json
  { "_excel": "datetime", "iso": "...", "serial": 46055.31 }
  ```

  so both human-readable and serial are preserved.

- No rounding, no locale conversion, no enum normalization.

## Mock vs production data

The Bangkok University example file is a **mock**:

- `SMS_usage (API)` and `SMS_usage (OTP)` may be copies of each other.
- **Raw import still stores both sheets in full** — do not dedupe because of the mock.
- **Clean phase** may add a QC warning if overlap between sheets is suspiciously high on a production file.

## Reconciliation

After import, compare `train_data_sources.sheet_manifest` to Excel:

```sql
SELECT sheet_manifest FROM train_data_sources WHERE id = '<source_id>';
```

Re-count in Excel (data rows only, exclude header and trailing blanks) should match manifest per sheet.

## Failure behaviour

- Missing required sheet or header → entire import `failed`, no partial sheet commits left in `ready` state (transaction per sheet after source row created; on error status set to `failed`).
- Duplicate checksum → exit code 2, no new rows.

## Exit codes (`import_train_raw.py`)

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (file, DB, validation) |
| 2 | Already imported (checksum exists) |
