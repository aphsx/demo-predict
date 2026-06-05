"""add new ml training and prediction tables

Revision ID: 0005_ml_rebuild_tables
Revises: 0004_schema_improvements
Create Date: 2026-06-05

This migration intentionally keeps legacy prediction tables in place.
The new train/predict import tables are applied by moby-data-prep SQL after
Alembic in dev bootstraps, so source_id columns are UUID lineage fields here
instead of hard foreign keys to train_data_sources/predict_data_sources.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0005_ml_rebuild_tables"
down_revision: Union[str, None] = "0004_schema_improvements"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id",
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("uuid_generate_v4()"),
    )


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("NOW()"),
    )


def upgrade() -> None:
    op.create_table(
        "ml_training_runs",
        _uuid_pk(),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_type", sa.Text, nullable=False, server_default=sa.text("'initial_train'")),
        sa.Column("status", sa.Text, nullable=False, server_default=sa.text("'pending'")),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("finished_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("cutoff_date", sa.Date, nullable=False),
        sa.Column("horizon_days", sa.Integer, nullable=False),
        sa.Column("training_config_json", postgresql.JSONB),
        sa.Column(
            "parent_training_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ml_training_runs.id", ondelete="SET NULL"),
        ),
        sa.Column("notes", sa.Text),
        sa.Column("error_message", sa.Text),
        sa.Column("created_by", sa.Text, sa.ForeignKey("user.id", ondelete="SET NULL")),
        _created_at(),
    )
    op.create_index("idx_ml_training_runs_source", "ml_training_runs", ["source_id"])
    op.create_index("idx_ml_training_runs_status", "ml_training_runs", ["status"])
    op.create_index("idx_ml_training_runs_created_by", "ml_training_runs", ["created_by"])

    op.create_table(
        "ml_feature_sets",
        _uuid_pk(),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("version", sa.Text, nullable=False),
        sa.Column("model_type", sa.Text, nullable=False),
        sa.Column("feature_names_json", postgresql.JSONB, nullable=False),
        sa.Column("feature_schema_json", postgresql.JSONB, nullable=False),
        sa.Column("transform_config_json", postgresql.JSONB),
        sa.Column("feature_code_hash", sa.Text),
        sa.Column("status", sa.Text, nullable=False, server_default=sa.text("'candidate'")),
        _created_at(),
        sa.UniqueConstraint("name", "version", "model_type", name="uq_ml_feature_sets_name_version_type"),
    )
    op.create_index("idx_ml_feature_sets_model_type", "ml_feature_sets", ["model_type"])
    op.create_index("idx_ml_feature_sets_status", "ml_feature_sets", ["status"])

    op.create_table(
        "ml_model_versions",
        _uuid_pk(),
        sa.Column(
            "training_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ml_training_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "feature_set_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ml_feature_sets.id", ondelete="SET NULL"),
        ),
        sa.Column("model_type", sa.Text, nullable=False),
        sa.Column("version", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default=sa.text("'candidate'")),
        sa.Column("artifact_path", sa.Text),
        sa.Column("artifact_checksum", sa.Text),
        sa.Column("metrics_json", postgresql.JSONB),
        sa.Column("validation_metrics_json", postgresql.JSONB),
        sa.Column("test_metrics_json", postgresql.JSONB),
        sa.Column("feature_names_json", postgresql.JSONB),
        sa.Column("label_definition_json", postgresql.JSONB),
        sa.Column("training_data_snapshot_json", postgresql.JSONB),
        sa.Column("model_card_json", postgresql.JSONB),
        sa.Column("model_card_path", sa.Text),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("FALSE")),
        sa.Column("activated_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("deactivated_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("trained_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        _created_at(),
        sa.UniqueConstraint("model_type", "version", name="uq_ml_model_versions_type_version"),
    )
    op.create_index("idx_ml_model_versions_training_run", "ml_model_versions", ["training_run_id"])
    op.create_index("idx_ml_model_versions_feature_set", "ml_model_versions", ["feature_set_id"])
    op.create_index("idx_ml_model_versions_type_status", "ml_model_versions", ["model_type", "status"])
    op.create_index("idx_ml_model_versions_active", "ml_model_versions", ["model_type", "is_active"])
    op.create_index(
        "uq_ml_model_versions_one_active_per_type",
        "ml_model_versions",
        ["model_type"],
        unique=True,
        postgresql_where=sa.text("is_active = TRUE"),
    )

    op.create_table(
        "ml_model_aliases",
        _uuid_pk(),
        sa.Column("model_type", sa.Text, nullable=False),
        sa.Column("alias", sa.Text, nullable=False),
        sa.Column(
            "model_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ml_model_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_by", sa.Text, sa.ForeignKey("user.id", ondelete="SET NULL")),
        _created_at(),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.UniqueConstraint("model_type", "alias", name="uq_ml_model_aliases_type_alias"),
    )
    op.create_index("idx_ml_model_aliases_version", "ml_model_aliases", ["model_version_id"])

    op.create_table(
        "ml_model_activation_history",
        _uuid_pk(),
        sa.Column("model_type", sa.Text, nullable=False),
        sa.Column(
            "previous_model_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ml_model_versions.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "new_model_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ml_model_versions.id", ondelete="SET NULL"),
        ),
        sa.Column("action", sa.Text, nullable=False),
        sa.Column("reason", sa.Text),
        sa.Column("created_by", sa.Text, sa.ForeignKey("user.id", ondelete="SET NULL")),
        _created_at(),
    )
    op.create_index("idx_ml_activation_history_type", "ml_model_activation_history", ["model_type"])
    op.create_index("idx_ml_activation_history_new_version", "ml_model_activation_history", ["new_model_version_id"])

    op.create_table(
        "ml_prediction_runs",
        _uuid_pk(),
        sa.Column("predict_source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default=sa.text("'pending'")),
        sa.Column("cutoff_date", sa.Date, nullable=False),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("finished_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("total_customers", sa.Integer),
        sa.Column("error_message", sa.Text),
        sa.Column("created_by", sa.Text, sa.ForeignKey("user.id", ondelete="SET NULL")),
        _created_at(),
    )
    op.create_index("idx_ml_prediction_runs_source", "ml_prediction_runs", ["predict_source_id"])
    op.create_index("idx_ml_prediction_runs_status", "ml_prediction_runs", ["status"])
    op.create_index("idx_ml_prediction_runs_created_by", "ml_prediction_runs", ["created_by"])

    op.create_table(
        "ml_data_validation_reports",
        _uuid_pk(),
        sa.Column("source_id", postgresql.UUID(as_uuid=True)),
        sa.Column("source_kind", sa.Text, nullable=False),
        sa.Column(
            "training_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ml_training_runs.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "prediction_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ml_prediction_runs.id", ondelete="CASCADE"),
        ),
        sa.Column("validation_type", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("row_count", sa.Integer),
        sa.Column("stats_json", postgresql.JSONB),
        sa.Column("anomalies_json", postgresql.JSONB),
        sa.Column("drift_json", postgresql.JSONB),
        _created_at(),
    )
    op.create_index("idx_ml_validation_reports_source", "ml_data_validation_reports", ["source_kind", "source_id"])
    op.create_index("idx_ml_validation_reports_training", "ml_data_validation_reports", ["training_run_id"])
    op.create_index("idx_ml_validation_reports_prediction", "ml_data_validation_reports", ["prediction_run_id"])
    op.create_index("idx_ml_validation_reports_status", "ml_data_validation_reports", ["status"])

    op.create_table(
        "ml_model_evaluations",
        _uuid_pk(),
        sa.Column(
            "model_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ml_model_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "training_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ml_training_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("model_type", sa.Text, nullable=False),
        sa.Column("evaluation_type", sa.Text, nullable=False),
        sa.Column("dataset_split", sa.Text, nullable=False),
        sa.Column("cutoff_date", sa.Date),
        sa.Column("horizon_days", sa.Integer),
        sa.Column("baseline_name", sa.Text),
        sa.Column(
            "feature_set_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ml_feature_sets.id", ondelete="SET NULL"),
        ),
        sa.Column("metrics_json", postgresql.JSONB),
        sa.Column("confusion_matrix_json", postgresql.JSONB),
        sa.Column("calibration_json", postgresql.JSONB),
        sa.Column("lift_table_json", postgresql.JSONB),
        sa.Column("feature_importance_json", postgresql.JSONB),
        sa.Column("error_analysis_json", postgresql.JSONB),
        sa.Column("business_metrics_json", postgresql.JSONB),
        sa.Column("artifact_path", sa.Text),
        _created_at(),
    )
    op.create_index("idx_ml_evaluations_model_version", "ml_model_evaluations", ["model_version_id"])
    op.create_index("idx_ml_evaluations_training_run", "ml_model_evaluations", ["training_run_id"])
    op.create_index("idx_ml_evaluations_type_split", "ml_model_evaluations", ["model_type", "evaluation_type", "dataset_split"])

    op.create_table(
        "ml_prediction_outputs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "prediction_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ml_prediction_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("acc_id", sa.Integer, nullable=False),
        sa.Column("lifecycle_stage", sa.Text),
        sa.Column("sub_stage", sa.Text),
        sa.Column("churn_probability", sa.Numeric(5, 4)),
        sa.Column("churn_risk_level", sa.Text),
        sa.Column("predicted_clv_6m", sa.Numeric(14, 2)),
        sa.Column("customer_value_tier", sa.Text),
        sa.Column("revenue_at_risk", sa.Numeric(14, 2)),
        sa.Column("predicted_credit_usage_30d", sa.Numeric(14, 2)),
        sa.Column("predicted_credit_usage_90d", sa.Numeric(14, 2)),
        sa.Column("estimated_days_until_topup", sa.Integer),
        sa.Column("credit_urgency_level", sa.Text),
        sa.Column("recommended_followup_date", sa.Date),
        sa.Column("usage_trend", sa.Text),
        sa.Column("days_since_last_activity", sa.Integer),
        sa.Column("n_purchases", sa.Integer),
        sa.Column("total_revenue", sa.Numeric(14, 2)),
        sa.Column("avg_transaction_value", sa.Numeric(14, 2)),
        sa.Column("ever_paid", sa.Boolean, nullable=False, server_default=sa.text("FALSE")),
        sa.Column("priority_score", sa.Numeric(5, 2)),
        sa.Column("priority_reason", sa.Text),
        sa.Column("recommended_action", sa.Text),
        sa.Column("ai_explanation", sa.Text),
        sa.Column("ai_reasoning_json", postgresql.JSONB),
        sa.Column("ai_recommended_message", sa.Text),
        sa.Column("ai_generated_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("ai_model", sa.Text),
        sa.Column("ai_status", sa.Text, nullable=False, server_default=sa.text("'not_requested'")),
        sa.Column("output_status", sa.Text, nullable=False, server_default=sa.text("'predicted'")),
        sa.Column("output_notes", sa.Text),
        sa.Column("model_eligibility_json", postgresql.JSONB),
        sa.Column("model_versions_json", postgresql.JSONB),
        _created_at(),
        sa.UniqueConstraint("prediction_run_id", "acc_id", name="uq_ml_prediction_outputs_run_acc"),
    )
    op.create_index("idx_ml_prediction_outputs_run", "ml_prediction_outputs", ["prediction_run_id"])
    op.create_index("idx_ml_prediction_outputs_acc", "ml_prediction_outputs", ["acc_id"])
    op.create_index("idx_ml_prediction_outputs_lifecycle", "ml_prediction_outputs", ["lifecycle_stage"])
    op.create_index("idx_ml_prediction_outputs_churn", "ml_prediction_outputs", ["churn_risk_level"])
    op.create_index("idx_ml_prediction_outputs_priority", "ml_prediction_outputs", ["priority_score"])


def downgrade() -> None:
    op.drop_index("idx_ml_prediction_outputs_priority", table_name="ml_prediction_outputs")
    op.drop_index("idx_ml_prediction_outputs_churn", table_name="ml_prediction_outputs")
    op.drop_index("idx_ml_prediction_outputs_lifecycle", table_name="ml_prediction_outputs")
    op.drop_index("idx_ml_prediction_outputs_acc", table_name="ml_prediction_outputs")
    op.drop_index("idx_ml_prediction_outputs_run", table_name="ml_prediction_outputs")
    op.drop_table("ml_prediction_outputs")

    op.drop_index("idx_ml_evaluations_type_split", table_name="ml_model_evaluations")
    op.drop_index("idx_ml_evaluations_training_run", table_name="ml_model_evaluations")
    op.drop_index("idx_ml_evaluations_model_version", table_name="ml_model_evaluations")
    op.drop_table("ml_model_evaluations")

    op.drop_index("idx_ml_validation_reports_status", table_name="ml_data_validation_reports")
    op.drop_index("idx_ml_validation_reports_prediction", table_name="ml_data_validation_reports")
    op.drop_index("idx_ml_validation_reports_training", table_name="ml_data_validation_reports")
    op.drop_index("idx_ml_validation_reports_source", table_name="ml_data_validation_reports")
    op.drop_table("ml_data_validation_reports")

    op.drop_index("idx_ml_prediction_runs_created_by", table_name="ml_prediction_runs")
    op.drop_index("idx_ml_prediction_runs_status", table_name="ml_prediction_runs")
    op.drop_index("idx_ml_prediction_runs_source", table_name="ml_prediction_runs")
    op.drop_table("ml_prediction_runs")

    op.drop_index("idx_ml_activation_history_new_version", table_name="ml_model_activation_history")
    op.drop_index("idx_ml_activation_history_type", table_name="ml_model_activation_history")
    op.drop_table("ml_model_activation_history")

    op.drop_index("idx_ml_model_aliases_version", table_name="ml_model_aliases")
    op.drop_table("ml_model_aliases")

    op.drop_index("uq_ml_model_versions_one_active_per_type", table_name="ml_model_versions")
    op.drop_index("idx_ml_model_versions_active", table_name="ml_model_versions")
    op.drop_index("idx_ml_model_versions_type_status", table_name="ml_model_versions")
    op.drop_index("idx_ml_model_versions_feature_set", table_name="ml_model_versions")
    op.drop_index("idx_ml_model_versions_training_run", table_name="ml_model_versions")
    op.drop_table("ml_model_versions")

    op.drop_index("idx_ml_feature_sets_status", table_name="ml_feature_sets")
    op.drop_index("idx_ml_feature_sets_model_type", table_name="ml_feature_sets")
    op.drop_table("ml_feature_sets")

    op.drop_index("idx_ml_training_runs_created_by", table_name="ml_training_runs")
    op.drop_index("idx_ml_training_runs_status", table_name="ml_training_runs")
    op.drop_index("idx_ml_training_runs_source", table_name="ml_training_runs")
    op.drop_table("ml_training_runs")
