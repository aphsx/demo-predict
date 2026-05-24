"""schema improvements: payment_uid, usage dedup, run date range

Revision ID: 0004_schema_improvements
Revises: 0003_add_explanations
Create Date: 2026-05-21

Fixes identified after reviewing real data:
  1. raw_payments.payment_uid — preserve original transaction ID from Excel uid column
  2. raw_usage unique constraint — prevent feature inflation from duplicate rows
  3. prediction_runs.data_start/end_date — record the actual data range for cutoff validation
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0004_schema_improvements"
down_revision: Union[str, None] = "0003_add_explanations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Preserve the original payment transaction ID from the Excel source
    op.add_column(
        "raw_payments",
        sa.Column("payment_uid", sa.BigInteger, nullable=True),
    )
    op.create_index("idx_raw_pay_uid", "raw_payments", ["payment_uid"])

    # 2. Prevent duplicate usage rows (same slot uploaded twice).
    #    INSERT ... ON CONFLICT DO NOTHING in the upload handler uses this constraint.
    op.create_unique_constraint(
        "uq_raw_usage_slot",
        "raw_usage",
        ["run_id", "acc_id", "year", "month", "channel", "source"],
    )

    # 3. Track the actual data date range so the UI can validate cutoff makes sense.
    #    Populated by the upload handler from min/max of payment_date.
    op.add_column("prediction_runs", sa.Column("data_start_date", sa.Date, nullable=True))
    op.add_column("prediction_runs", sa.Column("data_end_date",   sa.Date, nullable=True))


def downgrade() -> None:
    op.drop_column("prediction_runs", "data_end_date")
    op.drop_column("prediction_runs", "data_start_date")
    op.drop_constraint("uq_raw_usage_slot", "raw_usage", type_="unique")
    op.drop_index("idx_raw_pay_uid", table_name="raw_payments")
    op.drop_column("raw_payments", "payment_uid")
