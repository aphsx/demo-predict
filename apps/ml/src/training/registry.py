"""Model registry persistence: versions, evaluations, aliases, promotion.

TRAINING-PIPELINE §14 — every trained model becomes a row in
`ml_model_versions` (candidate → production → archived); the prediction
runner only ever loads through the `production` alias; every activation is
recorded in `ml_model_activation_history`.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text

from src.training.data import database_url

PRODUCTION_ALIAS = "production"


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def next_version(model_type: str) -> str:
    """Version naming: {type}-{YYYY.MM}.{seq}."""

    prefix = f"{model_type}-{datetime.now(timezone.utc).strftime('%Y.%m')}"
    with create_engine(database_url()).connect() as conn:
        count = conn.execute(
            text(
                "SELECT count(*) FROM ml_model_versions WHERE model_type = :model_type AND version LIKE :prefix"
            ),
            {"model_type": model_type, "prefix": f"{prefix}.%"},
        ).scalar_one()
    return f"{prefix}.{count}"


def insert_model_version(
    *,
    training_run_id: str,
    feature_set_id: str | None,
    model_type: str,
    version: str,
    artifact_path: str,
    artifact_checksum: str,
    metrics: dict[str, Any],
    validation_metrics: dict[str, Any],
    test_metrics: dict[str, Any],
    feature_names: list[str],
    label_definition: dict[str, Any],
    training_data_snapshot: dict[str, Any],
    model_card: dict[str, Any],
    status: str = "candidate",
) -> str:
    with create_engine(database_url()).begin() as conn:
        version_id = conn.execute(
            text(
                """
                INSERT INTO ml_model_versions (
                  training_run_id, feature_set_id, model_type, version, status,
                  artifact_path, artifact_checksum, metrics_json,
                  validation_metrics_json, test_metrics_json, feature_names_json,
                  label_definition_json, training_data_snapshot_json,
                  model_card_json, trained_at
                ) VALUES (
                  CAST(:training_run_id AS UUID), CAST(:feature_set_id AS UUID),
                  :model_type, :version, :status, :artifact_path, :artifact_checksum,
                  CAST(:metrics AS JSONB), CAST(:validation_metrics AS JSONB),
                  CAST(:test_metrics AS JSONB), CAST(:feature_names AS JSONB),
                  CAST(:label_definition AS JSONB), CAST(:training_data_snapshot AS JSONB),
                  CAST(:model_card AS JSONB), NOW()
                )
                RETURNING id::text
                """
            ),
            {
                "training_run_id": training_run_id,
                "feature_set_id": feature_set_id,
                "model_type": model_type,
                "version": version,
                "status": status,
                "artifact_path": artifact_path,
                "artifact_checksum": artifact_checksum,
                "metrics": _json(metrics),
                "validation_metrics": _json(validation_metrics),
                "test_metrics": _json(test_metrics),
                "feature_names": _json(feature_names),
                "label_definition": _json(label_definition),
                "training_data_snapshot": _json(training_data_snapshot),
                "model_card": _json(model_card),
            },
        ).scalar_one()
    return str(version_id)


def insert_evaluation(
    *,
    model_version_id: str,
    training_run_id: str,
    model_type: str,
    evaluation_type: str,  # holdout | backtest | baseline
    dataset_split: str,  # validation | test | backtest
    metrics: dict[str, Any],
    cutoff_date: str | None = None,
    horizon_days: int | None = None,
    baseline_name: str | None = None,
    feature_set_id: str | None = None,
    confusion_matrix: dict[str, Any] | None = None,
    calibration: dict[str, Any] | None = None,
    lift_table: list[dict[str, Any]] | None = None,
    feature_importance: list[dict[str, Any]] | None = None,
) -> str:
    with create_engine(database_url()).begin() as conn:
        evaluation_id = conn.execute(
            text(
                """
                INSERT INTO ml_model_evaluations (
                  model_version_id, training_run_id, model_type, evaluation_type,
                  dataset_split, cutoff_date, horizon_days, baseline_name,
                  feature_set_id, metrics_json, confusion_matrix_json,
                  calibration_json, lift_table_json, feature_importance_json
                ) VALUES (
                  CAST(:model_version_id AS UUID), CAST(:training_run_id AS UUID),
                  :model_type, :evaluation_type, :dataset_split,
                  CAST(:cutoff_date AS DATE), :horizon_days, :baseline_name,
                  CAST(:feature_set_id AS UUID), CAST(:metrics AS JSONB),
                  CAST(:confusion_matrix AS JSONB), CAST(:calibration AS JSONB),
                  CAST(:lift_table AS JSONB), CAST(:feature_importance AS JSONB)
                )
                RETURNING id::text
                """
            ),
            {
                "model_version_id": model_version_id,
                "training_run_id": training_run_id,
                "model_type": model_type,
                "evaluation_type": evaluation_type,
                "dataset_split": dataset_split,
                "cutoff_date": cutoff_date,
                "horizon_days": horizon_days,
                "baseline_name": baseline_name,
                "feature_set_id": feature_set_id,
                "metrics": _json(metrics),
                "confusion_matrix": _json(confusion_matrix) if confusion_matrix else None,
                "calibration": _json(calibration) if calibration else None,
                "lift_table": _json(lift_table) if lift_table else None,
                "feature_importance": _json(feature_importance) if feature_importance else None,
            },
        ).scalar_one()
    return str(evaluation_id)


def current_champion(model_type: str) -> dict[str, Any] | None:
    """Champion version row via the production alias, or None."""

    with create_engine(database_url()).connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT v.id::text AS id, v.version, v.artifact_path, v.artifact_checksum,
                       v.model_card_json, v.metrics_json
                FROM ml_model_aliases a
                JOIN ml_model_versions v ON v.id = a.model_version_id
                WHERE a.model_type = :model_type AND a.alias = :alias
                """
            ),
            {"model_type": model_type, "alias": PRODUCTION_ALIAS},
        ).mappings().first()
    return dict(row) if row else None


def promote_model_version(
    *,
    model_type: str,
    model_version_id: str,
    reason: str,
    created_by: str | None = None,
    action: str = "promote",
) -> None:
    """Point the production alias at a version; archive the previous champion.

    `action` is recorded in ml_model_activation_history — "promote" for the
    training gate's automatic choice, "manual_override" for an operator pinning
    a specific version from the UI.
    """

    with create_engine(database_url()).begin() as conn:
        previous = conn.execute(
            text(
                """
                SELECT model_version_id::text FROM ml_model_aliases
                WHERE model_type = :model_type AND alias = :alias
                """
            ),
            {"model_type": model_type, "alias": PRODUCTION_ALIAS},
        ).scalar()

        conn.execute(
            text(
                """
                UPDATE ml_model_versions
                SET is_active = FALSE, status = 'archived', deactivated_at = NOW()
                WHERE model_type = :model_type AND is_active = TRUE AND id != CAST(:version_id AS UUID)
                """
            ),
            {"model_type": model_type, "version_id": model_version_id},
        )
        conn.execute(
            text(
                """
                UPDATE ml_model_versions
                SET is_active = TRUE, status = 'production', activated_at = NOW()
                WHERE id = CAST(:version_id AS UUID)
                """
            ),
            {"version_id": model_version_id},
        )
        conn.execute(
            text(
                """
                INSERT INTO ml_model_aliases (model_type, alias, model_version_id, created_by)
                VALUES (:model_type, :alias, CAST(:version_id AS UUID), :created_by)
                ON CONFLICT ON CONSTRAINT uq_ml_model_aliases_type_alias
                DO UPDATE SET model_version_id = EXCLUDED.model_version_id, updated_at = NOW()
                """
            ),
            {
                "model_type": model_type,
                "alias": PRODUCTION_ALIAS,
                "version_id": model_version_id,
                "created_by": created_by,
            },
        )
        conn.execute(
            text(
                """
                INSERT INTO ml_model_activation_history (
                  model_type, previous_model_version_id, new_model_version_id,
                  action, reason, created_by
                ) VALUES (
                  :model_type, CAST(:previous AS UUID), CAST(:new AS UUID),
                  :action, :reason, :created_by
                )
                """
            ),
            {
                "model_type": model_type,
                "previous": previous,
                "new": model_version_id,
                "action": action,
                "reason": reason,
                "created_by": created_by,
            },
        )


def delete_model_version(
    *,
    model_type: str,
    model_version_id: str,
    created_by: str | None = None,
) -> dict[str, Any]:
    """Permanently delete a non-production model version (artifacts + DB row).

    Guardrails:
      - the version must exist and belong to `model_type`;
      - the current production champion (is_active / status='production') can
        NEVER be deleted — switch champion first.

    Removes the on-disk artifact directory, then deletes the
    `ml_model_versions` row. FK cascades clean up `ml_model_evaluations` and
    `ml_model_aliases`; `ml_model_activation_history` rows are kept with their
    version references set to NULL (audit trail survives).
    """

    import shutil

    from src.training.artifacts import models_dir

    with create_engine(database_url()).connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT version, status, is_active, artifact_path
                FROM ml_model_versions
                WHERE id = CAST(:version_id AS UUID) AND model_type = :model_type
                """
            ),
            {"version_id": model_version_id, "model_type": model_type},
        ).mappings().first()

    if row is None:
        raise ValueError(f"No {model_type} model version {model_version_id}")
    if row["is_active"] or row["status"] == "production":
        raise ValueError(
            f"{model_type} version {row['version']} is the production champion — "
            "switch the production model to another version before deleting it"
        )

    artifact_path = row["artifact_path"]
    artifact_removed = False
    if artifact_path:
        target = Path(artifact_path)
        if not target.is_absolute():
            target = models_dir() / target
        if target.exists():
            shutil.rmtree(target, ignore_errors=True)
            artifact_removed = True

    with create_engine(database_url()).begin() as conn:
        # Audit the deletion BEFORE removing the row. The version id is kept in
        # `reason` text (not the FK columns, which ON DELETE SET NULL would clear)
        # so the trail survives the row deletion.
        conn.execute(
            text(
                """
                INSERT INTO ml_model_activation_history (
                  model_type, previous_model_version_id, new_model_version_id,
                  action, reason, created_by
                ) VALUES (:model_type, NULL, NULL, 'delete', :reason, :created_by)
                """
            ),
            {
                "model_type": model_type,
                "reason": (
                    f"Deleted {model_type} version {row['version']} "
                    f"(id={model_version_id}, artifact_removed={artifact_removed})"
                ),
                "created_by": created_by,
            },
        )
        conn.execute(
            text("DELETE FROM ml_model_versions WHERE id = CAST(:version_id AS UUID)"),
            {"version_id": model_version_id},
        )

    return {
        "model_type": model_type,
        "version": row["version"],
        "model_version_id": model_version_id,
        "artifact_removed": artifact_removed,
    }


def activate_model_version(
    *,
    model_type: str,
    model_version_id: str,
    reason: str | None = None,
    created_by: str | None = None,
) -> dict[str, Any]:
    """Manually pin a specific version to the production alias (UI override).

    Validates the version exists, belongs to model_type, and has an artifact,
    then reuses the same promotion transaction with action='manual_override'.
    """

    with create_engine(database_url()).connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT version, status, artifact_path
                FROM ml_model_versions
                WHERE id = CAST(:version_id AS UUID) AND model_type = :model_type
                """
            ),
            {"version_id": model_version_id, "model_type": model_type},
        ).mappings().first()

    if row is None:
        raise ValueError(f"No {model_type} model version {model_version_id}")
    if not row["artifact_path"]:
        raise ValueError(f"{model_type} version {row['version']} has no artifact to activate")

    promote_model_version(
        model_type=model_type,
        model_version_id=model_version_id,
        reason=reason or f"Manual override to {row['version']}",
        created_by=created_by,
        action="manual_override",
    )
    return {"model_type": model_type, "version": row["version"], "model_version_id": model_version_id}


# ── Training run lifecycle ───────────────────────────────────────


def update_training_run(
    training_run_id: str,
    *,
    status: str | None = None,
    progress: dict[str, Any] | None = None,
    results: list[dict[str, Any]] | None = None,
    error_message: str | None = None,
    training_config: dict[str, Any] | None = None,
    mark_started: bool = False,
    mark_finished: bool = False,
) -> None:
    sets: list[str] = []
    params: dict[str, Any] = {"id": training_run_id}
    if status is not None:
        sets.append("status = :status")
        params["status"] = status
    if progress is not None:
        sets.append("progress_json = CAST(:progress AS JSONB)")
        params["progress"] = _json(progress)
    if results is not None:
        sets.append("results_json = CAST(:results AS JSONB)")
        params["results"] = _json(results)
    if error_message is not None:
        sets.append("error_message = :error_message")
        params["error_message"] = error_message
    if training_config is not None:
        sets.append("training_config_json = CAST(:training_config AS JSONB)")
        params["training_config"] = _json(training_config)
    if mark_started:
        sets.append("started_at = COALESCE(started_at, NOW())")
    if mark_finished:
        sets.append("finished_at = NOW()")
    if not sets:
        return
    with create_engine(database_url()).begin() as conn:
        conn.execute(
            text(f"UPDATE ml_training_runs SET {', '.join(sets)} WHERE id = CAST(:id AS UUID)"),
            params,
        )


def load_training_run(training_run_id: str) -> dict[str, Any]:
    with create_engine(database_url()).connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT id::text, source_id::text, status, cutoff_date, horizon_days,
                       created_by, training_config_json
                FROM ml_training_runs WHERE id = CAST(:id AS UUID)
                """
            ),
            {"id": training_run_id},
        ).mappings().first()
    if row is None:
        raise RuntimeError(f"Training run {training_run_id} not found")
    return dict(row)
