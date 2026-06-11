-- [NEW] Train clean layer — typed tables for model training (reads train_raw_sheet_*).
-- Train-only; predict clean is a separate family (predict_clean_*).
-- Run after 001–004. Safe to re-run partial sections via IF NOT EXISTS.

-- Extend catalog status for clean phase
ALTER TABLE train_data_sources
    DROP CONSTRAINT IF EXISTS train_data_sources_import_status_check;

ALTER TABLE train_data_sources
    ADD CONSTRAINT train_data_sources_import_status_check
    CHECK (import_status IN ('pending', 'importing', 'cleaning', 'ready', 'failed'));

ALTER TABLE train_data_sources
    ADD COLUMN IF NOT EXISTS clean_manifest JSONB;

ALTER TABLE train_data_sources
    ADD COLUMN IF NOT EXISTS cleaned_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS train_clean_customers (
    id            BIGSERIAL PRIMARY KEY,
    source_id     UUID NOT NULL REFERENCES train_data_sources (id) ON DELETE CASCADE,
    acc_id        INTEGER NOT NULL,
    status_sms    TEXT,
    credit_sms    NUMERIC,
    credit_email  NUMERIC,
    expire_sms    DATE,
    expire_email  DATE,
    status_email  TEXT,
    join_date     DATE,
    last_access   TIMESTAMPTZ,
    last_send     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_train_clean_customers_source ON train_clean_customers (source_id);
CREATE INDEX IF NOT EXISTS idx_train_clean_customers_acc ON train_clean_customers (source_id, acc_id);

CREATE TABLE IF NOT EXISTS train_clean_payments (
    id            BIGSERIAL PRIMARY KEY,
    source_id     UUID NOT NULL REFERENCES train_data_sources (id) ON DELETE CASCADE,
    acc_id        INTEGER NOT NULL,
    payment_uid   BIGINT,
    payment_date  TIMESTAMPTZ NOT NULL,
    amount        NUMERIC,
    credit_add    NUMERIC,
    credit_type   TEXT
);

CREATE INDEX IF NOT EXISTS idx_train_clean_payments_source ON train_clean_payments (source_id);
CREATE INDEX IF NOT EXISTS idx_train_clean_payments_acc ON train_clean_payments (source_id, acc_id);
CREATE INDEX IF NOT EXISTS idx_train_clean_payments_date ON train_clean_payments (source_id, payment_date);

CREATE TABLE IF NOT EXISTS train_clean_usage (
    id            BIGSERIAL PRIMARY KEY,
    source_id     UUID NOT NULL REFERENCES train_data_sources (id) ON DELETE CASCADE,
    acc_id        INTEGER NOT NULL,
    year          INTEGER,
    month         INTEGER,
    usage         NUMERIC,
    channel       TEXT NOT NULL,
    usage_source  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_train_clean_usage_source ON train_clean_usage (source_id);
CREATE INDEX IF NOT EXISTS idx_train_clean_usage_acc ON train_clean_usage (source_id, acc_id);
CREATE INDEX IF NOT EXISTS idx_train_clean_usage_period ON train_clean_usage (source_id, year, month);
