-- [NEW] Lineage columns on train_clean_* — link clean rows back to raw import.
-- Run after 005. Safe to re-run (IF NOT EXISTS).

ALTER TABLE train_clean_customers
    ADD COLUMN IF NOT EXISTS excel_row INTEGER;

ALTER TABLE train_clean_customers
    ADD COLUMN IF NOT EXISTS raw_row_id BIGINT;

UPDATE train_clean_customers
SET excel_row = COALESCE(excel_row, 0),
    raw_row_id = COALESCE(raw_row_id, 0)
WHERE excel_row IS NULL OR raw_row_id IS NULL;

ALTER TABLE train_clean_customers
    ALTER COLUMN excel_row SET NOT NULL;

ALTER TABLE train_clean_customers
    ALTER COLUMN raw_row_id SET NOT NULL;

ALTER TABLE train_clean_payments
    ADD COLUMN IF NOT EXISTS excel_row INTEGER;

ALTER TABLE train_clean_payments
    ADD COLUMN IF NOT EXISTS raw_row_id BIGINT;

UPDATE train_clean_payments
SET excel_row = COALESCE(excel_row, 0),
    raw_row_id = COALESCE(raw_row_id, 0)
WHERE excel_row IS NULL OR raw_row_id IS NULL;

ALTER TABLE train_clean_payments
    ALTER COLUMN excel_row SET NOT NULL;

ALTER TABLE train_clean_payments
    ALTER COLUMN raw_row_id SET NOT NULL;

ALTER TABLE train_clean_usage
    ADD COLUMN IF NOT EXISTS excel_row INTEGER;

ALTER TABLE train_clean_usage
    ADD COLUMN IF NOT EXISTS raw_row_id BIGINT;

UPDATE train_clean_usage
SET excel_row = COALESCE(excel_row, 0),
    raw_row_id = COALESCE(raw_row_id, 0)
WHERE excel_row IS NULL OR raw_row_id IS NULL;

ALTER TABLE train_clean_usage
    ALTER COLUMN excel_row SET NOT NULL;

ALTER TABLE train_clean_usage
    ALTER COLUMN raw_row_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_train_clean_customers_lineage
    ON train_clean_customers (source_id, excel_row);

CREATE INDEX IF NOT EXISTS idx_train_clean_payments_lineage
    ON train_clean_payments (source_id, excel_row);

CREATE INDEX IF NOT EXISTS idx_train_clean_usage_lineage
    ON train_clean_usage (source_id, excel_row);
