-- [NEW] Train raw layer: one PostgreSQL table per Excel sheet (8) + catalog.
-- [LEGACY] predict uses prediction_runs + raw_customers/payments/usage (apps/api uploads.ts).
-- Predict/clean families: see moby-data-prep/docs/naming-convention.md and docs/DATA-PIPELINE-MIGRATION.md.
-- Run: psql "$DATABASE_URL" -f migrations/001_train_raw_eight_tables.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE train_data_sources (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                 TEXT NOT NULL,
    client_label         TEXT,
    original_filename    TEXT NOT NULL,
    file_checksum_sha256 TEXT NOT NULL UNIQUE,
    file_size_bytes      BIGINT,
    import_status        TEXT NOT NULL DEFAULT 'pending'
        CHECK (import_status IN ('pending', 'importing', 'ready', 'failed')),
    imported_at          TIMESTAMPTZ,
    sheet_manifest       JSONB,
    notes                TEXT,
    error_message        TEXT,
    imported_by          TEXT REFERENCES "user" (id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_train_data_sources_status ON train_data_sources (import_status);
CREATE INDEX idx_train_data_sources_client ON train_data_sources (client_label);
CREATE INDEX idx_train_data_sources_imported_by ON train_data_sources (imported_by);

CREATE TABLE train_raw_sheet_users_user_profile (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES train_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE train_raw_sheet_backend_payment (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES train_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE train_raw_sheet_sms_usage_bc (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES train_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE train_raw_sheet_sms_usage_api (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES train_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE train_raw_sheet_sms_usage_otp (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES train_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE train_raw_sheet_email_usage_bc (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES train_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE train_raw_sheet_email_usage_api (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES train_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE train_raw_sheet_email_usage_otp (
    id           BIGSERIAL PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES train_data_sources (id) ON DELETE CASCADE,
    excel_row    INTEGER NOT NULL,
    row_payload  JSONB NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_train_raw_users_source ON train_raw_sheet_users_user_profile (source_id);
CREATE INDEX idx_train_raw_users_source_row ON train_raw_sheet_users_user_profile (source_id, excel_row);

CREATE INDEX idx_train_raw_pay_source ON train_raw_sheet_backend_payment (source_id);
CREATE INDEX idx_train_raw_pay_source_row ON train_raw_sheet_backend_payment (source_id, excel_row);

CREATE INDEX idx_train_raw_sms_bc_source ON train_raw_sheet_sms_usage_bc (source_id);
CREATE INDEX idx_train_raw_sms_api_source ON train_raw_sheet_sms_usage_api (source_id);
CREATE INDEX idx_train_raw_sms_otp_source ON train_raw_sheet_sms_usage_otp (source_id);
CREATE INDEX idx_train_raw_email_bc_source ON train_raw_sheet_email_usage_bc (source_id);
CREATE INDEX idx_train_raw_email_api_source ON train_raw_sheet_email_usage_api (source_id);
CREATE INDEX idx_train_raw_email_otp_source ON train_raw_sheet_email_usage_otp (source_id);
