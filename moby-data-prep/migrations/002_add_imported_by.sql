-- Add imported_by if 001 was applied before this column existed.
ALTER TABLE train_data_sources
    ADD COLUMN IF NOT EXISTS imported_by TEXT;

CREATE INDEX IF NOT EXISTS idx_train_data_sources_imported_by
    ON train_data_sources (imported_by);

-- Link imports to Better Auth user (same as prediction_runs.user_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'train_data_sources_imported_by_fkey'
    ) THEN
        ALTER TABLE train_data_sources
            ADD CONSTRAINT train_data_sources_imported_by_fkey
            FOREIGN KEY (imported_by) REFERENCES "user" (id) ON DELETE SET NULL;
    END IF;
END $$;
