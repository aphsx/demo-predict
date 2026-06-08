"""Persistence helpers for ML training validation artifacts."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import create_engine, text

from src.training.data import database_url
from src.training.validation import ValidationReport


def save_validation_report(
    report: ValidationReport,
    *,
    training_run_id: str | None = None,
    prediction_run_id: str | None = None,
) -> str:
    """Persist a validation report to `ml_data_validation_reports`.

    The report object stays independent from persistence so validation can run
    read-only during local checks and tests.
    """

    row = report.to_validation_report_row()
    with create_engine(database_url()).begin() as conn:
        report_id = conn.execute(
            text(
                """
                INSERT INTO ml_data_validation_reports (
                  source_id,
                  source_kind,
                  training_run_id,
                  prediction_run_id,
                  validation_type,
                  status,
                  row_count,
                  stats_json,
                  anomalies_json,
                  drift_json
                )
                VALUES (
                  CAST(:source_id AS UUID),
                  :source_kind,
                  CAST(:training_run_id AS UUID),
                  CAST(:prediction_run_id AS UUID),
                  :validation_type,
                  :status,
                  :row_count,
                  CAST(:stats_json AS JSONB),
                  CAST(:anomalies_json AS JSONB),
                  CAST(:drift_json AS JSONB)
                )
                RETURNING id::text
                """
            ),
            {
                "source_id": row["source_id"],
                "source_kind": row["source_kind"],
                "training_run_id": training_run_id,
                "prediction_run_id": prediction_run_id,
                "validation_type": row["validation_type"],
                "status": row["status"],
                "row_count": row["row_count"],
                "stats_json": _json_dumps(row["stats_json"]),
                "anomalies_json": _json_dumps(row["anomalies_json"]),
                "drift_json": _json_dumps(row["drift_json"]),
            },
        ).scalar_one()

    return str(report_id)


def save_validation_reports(
    reports: list[ValidationReport],
    *,
    training_run_id: str | None = None,
    prediction_run_id: str | None = None,
) -> list[str]:
    return [
        save_validation_report(
            report,
            training_run_id=training_run_id,
            prediction_run_id=prediction_run_id,
        )
        for report in reports
    ]


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)
