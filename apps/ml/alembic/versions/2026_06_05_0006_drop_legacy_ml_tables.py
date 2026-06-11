"""drop legacy ml output tables

Revision ID: 0006_drop_legacy_ml_tables
Revises: 0005_ml_rebuild_tables
Create Date: 2026-06-05

The ML v2 tables are now the only supported training/prediction schema.
Keep auth tables and train/predict raw+clean imports intact.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0006_drop_legacy_ml_tables"
down_revision: Union[str, None] = "0005_ml_rebuild_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove the legacy bridge from predict uploads to prediction_runs.
    op.execute("DROP INDEX IF EXISTS idx_predict_data_sources_run")
    op.execute("ALTER TABLE IF EXISTS predict_data_sources DROP COLUMN IF EXISTS prediction_run_id")

    # Drop legacy inference/model registry tables. New ml_* tables replace these.
    op.execute("DROP TABLE IF EXISTS explanations CASCADE")
    op.execute("DROP TABLE IF EXISTS predictions CASCADE")
    op.execute("DROP TABLE IF EXISTS prediction_runs CASCADE")
    op.execute("DROP TABLE IF EXISTS model_versions CASCADE")
    op.execute("DROP FUNCTION IF EXISTS update_updated_at() CASCADE")


def downgrade() -> None:
    raise RuntimeError(
        "Downgrade is not supported: legacy ML tables were intentionally removed. "
        "Restore from backup if old prediction_runs/predictions data is required."
    )
