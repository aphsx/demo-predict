-- [LEGACY] Remove typed per-run raw tables (replaced by predict_raw_sheet_* later).
-- Safe to re-run: drops only if tables exist.

DROP TABLE IF EXISTS raw_usage CASCADE;
DROP TABLE IF EXISTS raw_payments CASCADE;
DROP TABLE IF EXISTS raw_customers CASCADE;
