"""ml v2 output contract columns + run progress/results

Revision ID: 0007_ml_v2_output_columns
Revises: 0006_drop_legacy_ml_tables
Create Date: 2026-06-10

Adds the JSONB columns required by docs/ML-V2-OUTPUT-CONTRACT.md §3.10
(churn_factors_json, p_alive, profile_snapshot_json,
credit_forecast_interval_json) plus run-level progress/results columns the
web run pages poll (`progress_json`, `results_json`, prediction run `name`).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0007_ml_v2_output_columns"
down_revision: Union[str, None] = "0006_drop_legacy_ml_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ml_prediction_outputs", sa.Column("churn_factors_json", postgresql.JSONB))
    op.add_column("ml_prediction_outputs", sa.Column("p_alive", sa.Numeric(5, 4)))
    op.add_column("ml_prediction_outputs", sa.Column("profile_snapshot_json", postgresql.JSONB))
    op.add_column(
        "ml_prediction_outputs",
        sa.Column("credit_forecast_interval_json", postgresql.JSONB),
    )

    op.add_column(
        "ml_prediction_runs",
        sa.Column("name", sa.Text, nullable=False, server_default=sa.text("'Prediction run'")),
    )
    op.add_column("ml_prediction_runs", sa.Column("progress_json", postgresql.JSONB))
    op.add_column("ml_prediction_runs", sa.Column("model_versions_json", postgresql.JSONB))

    op.add_column("ml_training_runs", sa.Column("progress_json", postgresql.JSONB))
    op.add_column("ml_training_runs", sa.Column("results_json", postgresql.JSONB))


def downgrade() -> None:
    op.drop_column("ml_training_runs", "results_json")
    op.drop_column("ml_training_runs", "progress_json")

    op.drop_column("ml_prediction_runs", "model_versions_json")
    op.drop_column("ml_prediction_runs", "progress_json")
    op.drop_column("ml_prediction_runs", "name")

    op.drop_column("ml_prediction_outputs", "credit_forecast_interval_json")
    op.drop_column("ml_prediction_outputs", "profile_snapshot_json")
    op.drop_column("ml_prediction_outputs", "p_alive")
    op.drop_column("ml_prediction_outputs", "churn_factors_json")
