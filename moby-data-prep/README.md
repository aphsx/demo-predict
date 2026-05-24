# moby-data-prep

Data preparation for 1Moby ML — **separate table families** for train, predict, and clean.

| Purpose | Layer | Catalog | Sheet tables (×8) |
|---------|-------|---------|-------------------|
| **Train** | raw | `train_data_sources` | `train_raw_sheet_*` |
| Predict | raw | `predict_data_sources` *(future)* | `predict_raw_sheet_*` |
| Train | clean | `train_clean_runs` *(future)* | `train_clean_*` |
| Predict | clean | `predict_clean_runs` *(future)* | `predict_clean_*` |

See [docs/naming-convention.md](docs/naming-convention.md).

## Quick start (train raw)

```bash
cd moby-data-prep
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/moby

psql "$DATABASE_URL" -f migrations/001_train_raw_eight_tables.sql

python scripts/import_train_raw.py \
  --file "../data/[1Moby] Data_example for Bangkok university.xlsx" \
  --name "Bangkok University example" \
  --client bangkok_university
```

## Layout

| Path | Purpose |
|------|---------|
| `config/excel_schema.yaml` | Train raw: sheet → `train_raw_sheet_*` |
| `migrations/001_train_raw_eight_tables.sql` | Train raw DDL |
| `scripts/import_train_raw.py` | Import into train raw tables |
| `docs/naming-convention.md` | Train / predict / clean naming rules |
| `docs/raw-data-schema.md` | Train raw schema detail |
