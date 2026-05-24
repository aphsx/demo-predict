-- Add imported_by if 001 was applied before this column existed.
ALTER TABLE train_data_sources
    ADD COLUMN IF NOT EXISTS imported_by TEXT;

CREATE INDEX IF NOT EXISTS idx_train_data_sources_imported_by
    ON train_data_sources (imported_by);
