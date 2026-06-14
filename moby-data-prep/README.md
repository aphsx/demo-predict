# moby-data-prep

Data preparation helpers for the fixed 1Moby Excel contract. Database tables are created by
the single bootstrap schema at `db/init/001_schema.sql`.

Data preparation for 1Moby ML — **separate table families** for train, predict, and clean.

| Purpose | Layer | Catalog | Sheet / typed tables (×8 / ×3) |
|---------|-------|---------|-------------------|
| **Train** | raw | `train_data_sources` | `train_raw_sheet_*` |
| Predict | raw | `predict_data_sources` | `predict_raw_sheet_*` |
| Train | clean | `train_data_sources` (`clean_manifest`) | `train_clean_*` (customers / payments / usage) |
| Predict | clean | `predict_data_sources` (`clean_manifest`) | `predict_clean_*` (customers / payments / usage) |

All four families are implemented; the live schema lives in `db/init/001_schema.sql`.

See [docs/naming-convention.md](docs/naming-convention.md).

## Quick start (train raw)

```bash
cd moby-data-prep
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/moby

python scripts/import_train_raw.py \
  --file "../data/[1Moby] Data_example for Bangkok university.xlsx" \
  --name "Bangkok University example" \
  --client bangkok_university
```

## Layout

| Path | Purpose |
|------|---------|
| `config/excel_schema.yaml` | Train raw: sheet → `train_raw_sheet_*` |
| `scripts/import_train_raw.py` | Import into train raw tables |
| `docs/naming-convention.md` | Train / predict / clean naming rules |
| `docs/raw-data-schema.md` | Train raw schema detail |
