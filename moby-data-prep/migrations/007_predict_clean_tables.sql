-- [NEW] Predict clean layer — typed tables for inference (reads predict_raw_sheet_*).
-- Mirror train_clean_* (005+006). Run after 003.

ALTER TABLE predict_data_sources
    DROP CONSTRAINT IF EXISTS predict_data_sources_import_status_check;

ALTER TABLE predict_data_sources
    ADD CONSTRAINT predict_data_sources_import_status_check
    CHECK (import_status IN ('pending', 'importing', 'cleaning', 'ready', 'failed'));

ALTER TABLE predict_data_sources
    ADD COLUMN IF NOT EXISTS clean_manifest JSONB;

ALTER TABLE predict_data_sources
    ADD COLUMN IF NOT EXISTS cleaned_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS predict_clean_customers (
    id            BIGSERIAL PRIMARY KEY,
    source_id     UUID NOT NULL REFERENCES predict_data_sources (id) ON DELETE CASCADE,
    raw_row_id    BIGINT NOT NULL,
    excel_row     INTEGER NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_predict_clean_customers_source ON predict_clean_customers (source_id);
CREATE INDEX IF NOT EXISTS idx_predict_clean_customers_acc ON predict_clean_customers (source_id, acc_id);
CREATE INDEX IF NOT EXISTS idx_predict_clean_customers_lineage ON predict_clean_customers (source_id, excel_row);

CREATE TABLE IF NOT EXISTS predict_clean_payments (
    id            BIGSERIAL PRIMARY KEY,
    source_id     UUID NOT NULL REFERENCES predict_data_sources (id) ON DELETE CASCADE,
    raw_row_id    BIGINT NOT NULL,
    excel_row     INTEGER NOT NULL,
    acc_id        INTEGER NOT NULL,
    payment_uid   BIGINT,
    payment_date  TIMESTAMPTZ NOT NULL,
    amount        NUMERIC,
    credit_add    NUMERIC,
    credit_type   TEXT
);

CREATE INDEX IF NOT EXISTS idx_predict_clean_payments_source ON predict_clean_payments (source_id);
CREATE INDEX IF NOT EXISTS idx_predict_clean_payments_acc ON predict_clean_payments (source_id, acc_id);
CREATE INDEX IF NOT EXISTS idx_predict_clean_payments_date ON predict_clean_payments (source_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_predict_clean_payments_lineage ON predict_clean_payments (source_id, excel_row);

CREATE TABLE IF NOT EXISTS predict_clean_usage (
    id            BIGSERIAL PRIMARY KEY,
    source_id     UUID NOT NULL REFERENCES predict_data_sources (id) ON DELETE CASCADE,
    raw_row_id    BIGINT NOT NULL,
    excel_row     INTEGER NOT NULL,
    acc_id        INTEGER NOT NULL,
    year          INTEGER,
    month         INTEGER,
    usage         NUMERIC,
    channel       TEXT NOT NULL,
    usage_source  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_predict_clean_usage_source ON predict_clean_usage (source_id);
CREATE INDEX IF NOT EXISTS idx_predict_clean_usage_acc ON predict_clean_usage (source_id, acc_id);
CREATE INDEX IF NOT EXISTS idx_predict_clean_usage_period ON predict_clean_usage (source_id, year, month);
CREATE INDEX IF NOT EXISTS idx_predict_clean_usage_lineage ON predict_clean_usage (source_id, excel_row);
