-- [NEW] Predict raw layer: one PostgreSQL table per Excel sheet (8) + catalog.
-- Separate from train_* and [LEGACY] raw_customers/payments/usage.
-- prediction_run_id links to [LEGACY] prediction_runs until that table is removed.

CREATE TABLE predict_data_sources (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                 TEXT NOT NULL,
    client_label         TEXT,
    original_filename    TEXT NOT NULL,
    file_checksum_sha256 TEXT NOT NULL,
    file_size_bytes      BIGINT,
    import_status        TEXT NOT NULL DEFAULT 'pending'
        CHECK (import_status IN ('pending', 'importing', 'ready', 'failed')),
    imported_at          TIMESTAMPTZ,
    sheet_manifest       JSONB,
    notes                TEXT,
    error_message        TEXT,
    imported_by          TEXT,
    prediction_run_id    UUID,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_predict_data_sources_status ON predict_data_sources (import_status);
CREATE INDEX idx_predict_data_sources_client ON predict_data_sources (client_label);
CREATE INDEX idx_predict_data_sources_imported_by ON predict_data_sources (imported_by);
CREATE INDEX idx_predict_data_sources_run ON predict_data_sources (prediction_run_id);

CREATE TABLE predict_raw_sheet_users_user_profile (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES predict_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE predict_raw_sheet_backend_payment (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES predict_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE predict_raw_sheet_sms_usage_bc (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES predict_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE predict_raw_sheet_sms_usage_api (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES predict_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE predict_raw_sheet_sms_usage_otp (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES predict_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE predict_raw_sheet_email_usage_bc (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES predict_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE predict_raw_sheet_email_usage_api (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES predict_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE predict_raw_sheet_email_usage_otp (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES predict_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_predict_raw_users_source ON predict_raw_sheet_users_user_profile (source_id);
CREATE INDEX idx_predict_raw_users_source_row ON predict_raw_sheet_users_user_profile (source_id, excel_row);

CREATE INDEX idx_predict_raw_pay_source ON predict_raw_sheet_backend_payment (source_id);
CREATE INDEX idx_predict_raw_pay_source_row ON predict_raw_sheet_backend_payment (source_id, excel_row);

CREATE INDEX idx_predict_raw_sms_bc_source ON predict_raw_sheet_sms_usage_bc (source_id);
CREATE INDEX idx_predict_raw_sms_api_source ON predict_raw_sheet_sms_usage_api (source_id);
CREATE INDEX idx_predict_raw_sms_otp_source ON predict_raw_sheet_sms_usage_otp (source_id);
CREATE INDEX idx_predict_raw_email_bc_source ON predict_raw_sheet_email_usage_bc (source_id);
CREATE INDEX idx_predict_raw_email_api_source ON predict_raw_sheet_email_usage_api (source_id);
CREATE INDEX idx_predict_raw_email_otp_source ON predict_raw_sheet_email_usage_otp (source_id);
