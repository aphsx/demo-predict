"""baseline schema

Revision ID: 0001_baseline
Revises:
Create Date: 2026-05-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.create_table(
        "model_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True),
                  primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("model_type", sa.Text, nullable=False),
        sa.Column("version", sa.Text, nullable=False),
        sa.Column("trained_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("metrics_json", postgresql.JSONB),
        sa.Column("model_file_path", sa.Text),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("FALSE")),
        sa.UniqueConstraint("model_type", "version"),
    )

    op.create_table(
        "prediction_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True),
                  primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default=sa.text("'pending'")),
        sa.Column("cutoff_date", sa.Date, nullable=False),
        sa.Column("total_customers", sa.Integer),
        sa.Column("active_customers", sa.Integer),
        sa.Column("error_message", sa.Text),
        sa.Column("model_version_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("model_versions.id")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "raw_customers",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("prediction_runs.id", ondelete="CASCADE")),
        sa.Column("acc_id", sa.Integer, nullable=False),
        sa.Column("status_sms", sa.Text),
        sa.Column("credit_sms", sa.Numeric),
        sa.Column("credit_email", sa.Numeric),
        sa.Column("expire_sms", sa.Date),
        sa.Column("expire_email", sa.Date),
        sa.Column("status_email", sa.Text),
        sa.Column("join_date", sa.Date),
        sa.Column("last_access", sa.TIMESTAMP(timezone=True)),
        sa.Column("last_send", sa.TIMESTAMP(timezone=True)),
    )
    op.create_index("idx_raw_cust_run", "raw_customers", ["run_id"])

    op.create_table(
        "raw_payments",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("prediction_runs.id", ondelete="CASCADE")),
        sa.Column("acc_id", sa.Integer, nullable=False),
        sa.Column("payment_date", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("amount", sa.Numeric),
        sa.Column("credit_add", sa.Numeric),
        sa.Column("credit_type", sa.Text),
    )
    op.create_index("idx_raw_pay_run", "raw_payments", ["run_id"])

    op.create_table(
        "raw_usage",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("prediction_runs.id", ondelete="CASCADE")),
        sa.Column("acc_id", sa.Integer, nullable=False),
        sa.Column("year", sa.Integer),
        sa.Column("month", sa.Integer),
        sa.Column("usage", sa.Numeric),
        sa.Column("channel", sa.Text),
        sa.Column("source", sa.Text),
    )
    op.create_index("idx_raw_usage_run", "raw_usage", ["run_id"])

    op.create_table(
        "predictions",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("prediction_runs.id", ondelete="CASCADE")),
        sa.Column("acc_id", sa.Integer, nullable=False),
        sa.Column("lifecycle_stage", sa.Text),
        sa.Column("sub_stage", sa.Text),
        sa.Column("churn_probability", sa.Numeric(5, 4)),
        sa.Column("predicted_clv_6m", sa.Numeric(14, 2)),
        sa.Column("clv_ci95_lo", sa.Numeric(14, 2)),
        sa.Column("clv_ci95_hi", sa.Numeric(14, 2)),
        sa.Column("clv_ci80_lo", sa.Numeric(14, 2)),
        sa.Column("clv_ci80_hi", sa.Numeric(14, 2)),
        sa.Column("p_alive", sa.Numeric(5, 4)),
        sa.Column("credit_p10", sa.Numeric(8, 2)),
        sa.Column("credit_p25", sa.Numeric(8, 2)),
        sa.Column("credit_p50", sa.Numeric(8, 2)),
        sa.Column("credit_p75", sa.Numeric(8, 2)),
        sa.Column("credit_p90", sa.Numeric(8, 2)),
        sa.Column("n_purchases", sa.Integer),
        sa.Column("forecast_confidence", sa.Numeric(4, 2)),
        sa.Column("comeback_probability", sa.Numeric(5, 4)),
        sa.Column("conversion_probability", sa.Numeric(5, 4)),
        sa.Column("is_active", sa.Integer),
        sa.Column("total_revenue", sa.Numeric(14, 2)),
        sa.Column("days_since_last_activity", sa.Integer),
        sa.Column("ever_paid", sa.Boolean, server_default=sa.text("FALSE")),
        sa.Column("revenue_at_risk", sa.Numeric(14, 2)),
        sa.Column("avg_transaction_value", sa.Numeric(14, 2)),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_pred_run", "predictions", ["run_id"])
    op.create_index("idx_pred_acc", "predictions", ["acc_id"])
    op.create_index("idx_pred_lifecycle", "predictions", ["lifecycle_stage"])

    # ── updated_at trigger for prediction_runs ────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_runs_updated_at
          BEFORE UPDATE ON prediction_runs
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    """)

    # ── better-auth tables ────────────────────────────────────────
    op.create_table(
        "user",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("email", sa.Text, nullable=False, unique=True),
        sa.Column("emailVerified", sa.Boolean, nullable=False, server_default=sa.text("FALSE")),
        sa.Column("image", sa.Text),
        sa.Column("createdAt", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updatedAt", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "session",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("userId", sa.Text, sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.Text, nullable=False, unique=True),
        sa.Column("expiresAt", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("ipAddress", sa.Text),
        sa.Column("userAgent", sa.Text),
        sa.Column("createdAt", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updatedAt", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("idx_session_user", "session", ["userId"])
    op.create_index("idx_session_token", "session", ["token"])

    op.create_table(
        "account",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("userId", sa.Text, sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("accountId", sa.Text, nullable=False),
        sa.Column("providerId", sa.Text, nullable=False),
        sa.Column("accessToken", sa.Text),
        sa.Column("refreshToken", sa.Text),
        sa.Column("idToken", sa.Text),
        sa.Column("accessTokenExpiresAt", sa.TIMESTAMP(timezone=True)),
        sa.Column("refreshTokenExpiresAt", sa.TIMESTAMP(timezone=True)),
        sa.Column("scope", sa.Text),
        sa.Column("password", sa.Text),
        sa.Column("createdAt", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updatedAt", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("providerId", "accountId"),
    )
    op.create_index("idx_account_user", "account", ["userId"])

    op.create_table(
        "verification",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("identifier", sa.Text, nullable=False),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("expiresAt", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("createdAt", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updatedAt", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )


def downgrade() -> None:
    op.drop_table("verification")
    op.drop_index("idx_account_user", table_name="account")
    op.drop_table("account")
    op.drop_index("idx_session_token", table_name="session")
    op.drop_index("idx_session_user", table_name="session")
    op.drop_table("session")
    op.drop_table("user")

    op.execute("DROP TRIGGER IF EXISTS trg_runs_updated_at ON prediction_runs")
    op.execute("DROP FUNCTION IF EXISTS update_updated_at()")

    op.drop_index("idx_pred_lifecycle", table_name="predictions")
    op.drop_index("idx_pred_acc", table_name="predictions")
    op.drop_index("idx_pred_run", table_name="predictions")
    op.drop_table("predictions")

    op.drop_index("idx_raw_usage_run", table_name="raw_usage")
    op.drop_table("raw_usage")
    op.drop_index("idx_raw_pay_run", table_name="raw_payments")
    op.drop_table("raw_payments")
    op.drop_index("idx_raw_cust_run", table_name="raw_customers")
    op.drop_table("raw_customers")

    op.drop_table("prediction_runs")
    op.drop_table("model_versions")
