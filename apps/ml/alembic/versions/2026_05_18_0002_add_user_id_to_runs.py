"""add user_id to prediction_runs

Revision ID: 0002_add_user_id_to_runs
Revises: 0001_baseline
Create Date: 2026-05-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002_add_user_id_to_runs"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "prediction_runs",
        sa.Column(
            "user_id", sa.Text,
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_runs_user_id", "prediction_runs", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_runs_user_id", table_name="prediction_runs")
    op.drop_column("prediction_runs", "user_id")
