"""Realized-outcome backfill runner (TRAINING-PIPELINE §15).

Closes the loop the legacy system never had: once a completed prediction run's
horizon has fully elapsed AND newer clean activity data covers that window,
rebuild the ACTUAL labels for the run's customers using the exact same label
builders training uses (src/training/labels.py — imported, never duplicated)
and measure how the served predictions really performed:

  churn   realized PR-AUC / precision / recall / lift / calibration at the
          SERVED risk threshold (the model card's "high" line)
  clv     realized 6m revenue vs predicted_clv_6m (Spearman / MAE / capture)
  credit  realized 30d/90d usage vs served p50 + p10–p90 interval coverage

Results are persisted as `ml_model_evaluations` rows with
evaluation_type='production_holdout' linked to the prediction run via the
`prediction_run_id` column — per the docs, "the most honest number in the
system". A `ml_data_validation_reports` row (validation_type='realized_outcome')
records per-run evidence, including every failure.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

from src.constants import RunStatus
from src.outcomes.metrics import (
    MIN_SAMPLES,
    realized_churn_metrics,
    realized_clv_metrics,
    realized_credit_metrics,
)
from src.training import repository
from src.training.data import database_url, load_predict_clean
from src.training.labels import (
    CREDIT_HORIZONS,
    LabelConfig,
    build_churn_labels,
    build_clv_labels,
    build_credit_usage_labels,
)
from src.training.validation import ValidationReport

logger = logging.getLogger(__name__)

PRODUCTION_HOLDOUT_EVALUATION_TYPE = "production_holdout"
PRODUCTION_DATASET_SPLIT = "production"
REALIZED_OUTCOME_VALIDATION_TYPE = "realized_outcome"
MODEL_TYPES = ("churn", "clv", "credit")
DEFAULT_HORIZON_DAYS = 180
# Served fallback when a legacy model card carries no thresholds block. The
# real threshold always travels with the champion artifact (TRAINING §13).
DEFAULT_CHURN_THRESHOLD = 0.5


@dataclass(frozen=True)
class ActualsSource:
    """The predict source whose clean activity data provides the actuals."""

    source_id: str
    max_activity_date: pd.Timestamp


@dataclass(frozen=True)
class OutcomeResult:
    """One model's realized outcome for one prediction run (or why it was skipped)."""

    model_type: str
    horizon_days: int | None
    metrics: dict[str, Any] | None
    context: dict[str, Any]
    confusion_matrix: dict[str, Any] | None = None
    calibration: dict[str, Any] | None = None
    lift_table: list[dict[str, Any]] | None = None
    skipped_reason: str | None = None

    @property
    def measured(self) -> bool:
        return self.metrics is not None and self.skipped_reason is None


# ── Entry point ──────────────────────────────────────────────────


def run_outcome_backfill(prediction_run_id: str | None = None, *, force: bool = False) -> None:
    """Measure realized outcomes for eligible completed prediction runs.

    Batch mode (no id): every completed run not yet measured (or all with
    `force=True`). Targeted mode (id given): that run only, always recomputed;
    a targeted failure re-raises after being persisted as a failed report.
    """

    actuals = find_actuals_source()
    if actuals is None:
        message = "No ready predict data source with clean activity data — nothing to measure."
        if prediction_run_id:
            raise RuntimeError(message)
        logger.warning(message)
        return

    if prediction_run_id:
        runs = [_load_run(prediction_run_id)]
    else:
        runs = _completed_runs()
        if not force:
            measured = _measured_run_ids()
            runs = [run for run in runs if run["id"] not in measured]

    if not runs:
        logger.info("outcome backfill: no unmeasured completed runs (use --force to re-measure)")
        return

    logger.info(
        "outcome backfill: %d run(s) against source %s (activity through %s)",
        len(runs),
        actuals.source_id,
        actuals.max_activity_date.date(),
    )

    failed_run_ids: list[str] = []
    for run in runs:
        try:
            backfill_run(run, actuals)
        except Exception as exc:  # noqa: BLE001 - §15: every failure is persisted, batch continues.
            logger.exception("outcome backfill failed for run %s", run["id"])
            failed_run_ids.append(run["id"])
            _save_outcome_report(
                run,
                actuals,
                status="failed",
                results=[],
                row_count=0,
                error=f"{type(exc).__name__}: {exc}",
            )
            if prediction_run_id:
                raise
    if failed_run_ids:
        logger.warning("outcome backfill finished with failures: %s", ", ".join(failed_run_ids))


def backfill_run(run: dict[str, Any], actuals: ActualsSource) -> None:
    """Measure one completed run and upsert its production_holdout evaluations."""

    run_id = run["id"]
    if run["status"] != RunStatus.COMPLETED:
        raise RuntimeError(f"Prediction run {run_id} is '{run['status']}' — only completed runs are measured")

    cutoff = pd.Timestamp(run["cutoff_date"])
    version_rows = {
        model_type: _model_version_row(model_type, _served_versions(run).get(model_type))
        for model_type in MODEL_TYPES
    }

    outputs = _load_outputs(run_id)
    if outputs.empty:
        raise RuntimeError(f"Prediction run {run_id} has no outputs to measure")

    customers, payments, usage = load_predict_clean(actuals.source_id)
    results = compute_run_outcomes(
        outputs,
        customers,
        payments,
        usage,
        cutoff=cutoff,
        actuals_max=actuals.max_activity_date,
        version_rows=version_rows,
    )

    measured = [result for result in results if result.measured]
    for result in measured:
        version_row = version_rows[result.model_type]
        assert version_row is not None  # measured implies the version resolved
        _replace_evaluation(
            run_id=run_id,
            version_row=version_row,
            result=result,
            cutoff=cutoff,
            actuals=actuals,
        )
        logger.info(
            "run %s %s: realized metrics persisted (n=%s)",
            run_id[:8],
            result.model_type,
            result.metrics.get("n") if result.metrics else None,
        )
    for result in results:
        if result.skipped_reason:
            logger.info("run %s %s: skipped — %s", run_id[:8], result.model_type, result.skipped_reason)

    _save_outcome_report(
        run,
        actuals,
        status="passed" if measured else "warning",
        results=results,
        row_count=int(len(outputs)),
    )


# ── Outcome computation (pure — reused by the verify script) ─────


def compute_run_outcomes(
    outputs: pd.DataFrame,
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    *,
    cutoff: pd.Timestamp,
    actuals_max: pd.Timestamp,
    version_rows: dict[str, dict[str, Any] | None],
) -> list[OutcomeResult]:
    """Compute realized outcomes for every measurable model of one run."""

    results: list[OutcomeResult] = []

    for model_type in ("churn", "clv"):
        version_row = version_rows.get(model_type)
        horizon_days = _card_horizon(version_row)
        if version_row is None:
            results.append(
                _skipped(model_type, horizon_days, "served model version not found in registry")
            )
            continue
        horizon_end = cutoff + pd.Timedelta(days=horizon_days)
        if actuals_max < horizon_end:
            results.append(
                _skipped(
                    model_type,
                    horizon_days,
                    f"horizon not elapsed — needs activity data through {horizon_end.date()}, "
                    f"newest is {actuals_max.date()}",
                )
            )
            continue
        if model_type == "churn":
            results.append(
                compute_churn_outcome(
                    outputs, customers, payments, usage,
                    cutoff=cutoff,
                    horizon_days=horizon_days,
                    thresholds=_card_thresholds(version_row),
                )
            )
        else:
            results.append(
                compute_clv_outcome(
                    outputs, customers, payments, usage,
                    cutoff=cutoff,
                    horizon_days=horizon_days,
                )
            )

    credit_row = version_rows.get("credit")
    if credit_row is None:
        results.append(_skipped("credit", max(CREDIT_HORIZONS), "served model version not found in registry"))
    else:
        results.append(
            compute_credit_outcome(
                outputs, customers, payments, usage, cutoff=cutoff, actuals_max=actuals_max
            )
        )
    return results


def compute_churn_outcome(
    outputs: pd.DataFrame,
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    *,
    cutoff: pd.Timestamp,
    horizon_days: int,
    thresholds: dict[str, float] | None,
) -> OutcomeResult:
    """Realized churn labels (same definition as training) vs served probabilities."""

    config = LabelConfig(cutoff_date=cutoff, horizon_days=horizon_days)
    labels = build_churn_labels(customers, payments, usage, config)
    scored = outputs.loc[outputs["churn_probability"].notna(), ["acc_id", "churn_probability"]]
    joined = scored.merge(labels[["acc_id", "churn_label"]], on="acc_id", how="inner")

    threshold = float((thresholds or {}).get("high", DEFAULT_CHURN_THRESHOLD))
    context: dict[str, Any] = {
        "predicted_customers": int(len(scored)),
        "label_population": int(len(labels)),
        "matched_customers": int(len(joined)),
        "threshold": threshold,
        "threshold_source": "model_card" if thresholds else "default_fallback",
    }
    if len(joined) < MIN_SAMPLES:
        return _skipped(
            "churn", horizon_days,
            f"only {len(joined)} scored customers matched the realized label population (< {MIN_SAMPLES})",
            context,
        )

    y_true = joined["churn_label"].to_numpy(dtype=int)
    if len(np.unique(y_true)) < 2:
        return _skipped(
            "churn", horizon_days,
            "realized labels are single-class — ranking metrics undefined",
            context,
        )

    block = realized_churn_metrics(y_true, joined["churn_probability"].to_numpy(dtype=float), threshold)
    context["realized_churn_rate"] = round(float(y_true.mean()), 4)
    return OutcomeResult(
        model_type="churn",
        horizon_days=horizon_days,
        metrics=block["metrics"],
        context=context,
        confusion_matrix=block["confusion_matrix"],
        calibration=block["calibration"],
        lift_table=block["lift_table"],
    )


def compute_clv_outcome(
    outputs: pd.DataFrame,
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    *,
    cutoff: pd.Timestamp,
    horizon_days: int,
) -> OutcomeResult:
    """Realized 6m revenue (same label as training) vs served predicted_clv_6m."""

    config = LabelConfig(cutoff_date=cutoff, horizon_days=horizon_days)
    labels = build_clv_labels(customers, payments, usage, config)
    scored = outputs.loc[outputs["predicted_clv_6m"].notna(), ["acc_id", "predicted_clv_6m"]]
    joined = scored.merge(labels[["acc_id", "future_revenue_6m"]], on="acc_id", how="inner")

    context: dict[str, Any] = {
        "predicted_customers": int(len(scored)),
        "label_population": int(len(labels)),
        "matched_customers": int(len(joined)),
    }
    if len(joined) < MIN_SAMPLES:
        return _skipped(
            "clv", horizon_days,
            f"only {len(joined)} scored customers matched the realized label population (< {MIN_SAMPLES})",
            context,
        )

    metrics = realized_clv_metrics(
        joined["future_revenue_6m"].to_numpy(dtype=float),
        joined["predicted_clv_6m"].to_numpy(dtype=float),
    )
    context["realized_total_revenue"] = round(float(joined["future_revenue_6m"].sum()), 2)
    context["predicted_total_clv"] = round(float(joined["predicted_clv_6m"].sum()), 2)
    return OutcomeResult(model_type="clv", horizon_days=horizon_days, metrics=metrics, context=context)


def compute_credit_outcome(
    outputs: pd.DataFrame,
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    *,
    cutoff: pd.Timestamp,
    actuals_max: pd.Timestamp,
) -> OutcomeResult:
    """Realized 30d/90d usage vs served p50 + p10–p90 interval coverage."""

    elapsed = [
        horizon_days
        for horizon_days in sorted(CREDIT_HORIZONS)
        if actuals_max >= cutoff + pd.Timedelta(days=horizon_days)
    ]
    if not elapsed:
        needed = cutoff + pd.Timedelta(days=min(CREDIT_HORIZONS))
        return _skipped(
            "credit", max(CREDIT_HORIZONS),
            f"no credit horizon elapsed — needs activity data through {needed.date()}, "
            f"newest is {actuals_max.date()}",
        )

    labels = build_credit_usage_labels(customers, payments, usage, cutoff)
    frames: dict[int, pd.DataFrame] = {}
    context: dict[str, Any] = {"label_population": int(len(labels)), "horizons_elapsed": elapsed}
    for horizon_days in elapsed:
        label_column = CREDIT_HORIZONS[horizon_days]
        pred_column = f"predicted_credit_usage_{horizon_days}d"
        columns = ["acc_id", pred_column, f"p10_{horizon_days}d", f"p90_{horizon_days}d"]
        scored = outputs.loc[outputs[pred_column].notna(), columns]
        joined = scored.merge(labels[["acc_id", label_column]], on="acc_id", how="inner")
        context[f"matched_customers_{horizon_days}d"] = int(len(joined))
        if len(joined) < MIN_SAMPLES:
            continue
        frames[horizon_days] = pd.DataFrame(
            {
                "y_true": joined[label_column].to_numpy(dtype=float),
                "p50": joined[pred_column].to_numpy(dtype=float),
                "p10": joined[f"p10_{horizon_days}d"].to_numpy(dtype=float),
                "p90": joined[f"p90_{horizon_days}d"].to_numpy(dtype=float),
            }
        )

    if not frames:
        return _skipped(
            "credit", max(elapsed),
            f"fewer than {MIN_SAMPLES} scored customers matched the realized label population",
            context,
        )

    metrics = realized_credit_metrics(frames)
    return OutcomeResult(model_type="credit", horizon_days=max(frames), metrics=metrics, context=context)


def _skipped(
    model_type: str,
    horizon_days: int | None,
    reason: str,
    context: dict[str, Any] | None = None,
) -> OutcomeResult:
    return OutcomeResult(
        model_type=model_type,
        horizon_days=horizon_days,
        metrics=None,
        context=context or {},
        skipped_reason=reason,
    )


# ── Data access ──────────────────────────────────────────────────


def find_actuals_source() -> ActualsSource | None:
    """The ready predict source with the freshest clean activity data.

    Activity recency uses the same convention as the training Gate 3 check:
    max(payment_date::date, make_date(year, month, 1)) per source.
    """

    with create_engine(database_url()).connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT s.id::text AS source_id, a.max_activity
                FROM predict_data_sources s
                JOIN (
                  SELECT source_id, MAX(activity_date) AS max_activity
                  FROM (
                    SELECT source_id, payment_date::date AS activity_date
                    FROM predict_clean_payments
                    WHERE payment_date IS NOT NULL
                    UNION ALL
                    SELECT source_id, make_date(year, month, 1) AS activity_date
                    FROM predict_clean_usage
                    WHERE year IS NOT NULL AND month IS NOT NULL
                  ) events
                  GROUP BY source_id
                ) a ON a.source_id = s.id
                WHERE s.import_status = 'ready'
                ORDER BY a.max_activity DESC, s.created_at DESC
                LIMIT 1
                """
            )
        ).mappings().first()
    if row is None or row["max_activity"] is None:
        return None
    return ActualsSource(
        source_id=row["source_id"],
        max_activity_date=pd.Timestamp(row["max_activity"]),
    )


_RUN_SELECT = """
SELECT id::text AS id,
       predict_source_id::text AS predict_source_id,
       status,
       cutoff_date,
       model_versions_json
FROM ml_prediction_runs
"""


def _load_run(prediction_run_id: str) -> dict[str, Any]:
    with create_engine(database_url()).connect() as conn:
        row = conn.execute(
            text(_RUN_SELECT + "WHERE id = CAST(:id AS UUID)"),
            {"id": prediction_run_id},
        ).mappings().first()
    if row is None:
        raise RuntimeError(f"Prediction run {prediction_run_id} not found")
    return dict(row)


def _completed_runs() -> list[dict[str, Any]]:
    with create_engine(database_url()).connect() as conn:
        rows = conn.execute(
            text(_RUN_SELECT + "WHERE status = :status ORDER BY cutoff_date, created_at"),
            {"status": RunStatus.COMPLETED},
        ).mappings().all()
    return [dict(row) for row in rows]


def _measured_run_ids() -> set[str]:
    with create_engine(database_url()).connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT DISTINCT prediction_run_id::text AS run_id
                FROM ml_model_evaluations
                WHERE evaluation_type = :evaluation_type AND prediction_run_id IS NOT NULL
                """
            ),
            {"evaluation_type": PRODUCTION_HOLDOUT_EVALUATION_TYPE},
        ).all()
    return {row[0] for row in rows}


def _served_versions(run: dict[str, Any]) -> dict[str, str]:
    versions = run.get("model_versions_json") or {}
    if isinstance(versions, str):
        versions = json.loads(versions)
    return {str(key): str(value) for key, value in versions.items() if value}


def _model_version_row(model_type: str, version: str | None) -> dict[str, Any] | None:
    """Registry row (id, training_run_id, model card) for a served version string."""

    if not version:
        return None
    with create_engine(database_url()).connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT id::text AS id, training_run_id::text AS training_run_id, model_card_json
                FROM ml_model_versions
                WHERE model_type = :model_type AND version = :version
                """
            ),
            {"model_type": model_type, "version": version},
        ).mappings().first()
    if row is None:
        return None
    card = row["model_card_json"] or {}
    if isinstance(card, str):
        card = json.loads(card)
    return {
        "id": row["id"],
        "training_run_id": row["training_run_id"],
        "version": version,
        "model_card": card,
    }


def _card_horizon(version_row: dict[str, Any] | None) -> int:
    if version_row is None:
        return DEFAULT_HORIZON_DAYS
    horizon = (version_row.get("model_card") or {}).get("horizon_days")
    return int(horizon) if horizon else DEFAULT_HORIZON_DAYS


def _card_thresholds(version_row: dict[str, Any] | None) -> dict[str, float] | None:
    if version_row is None:
        return None
    thresholds = (version_row.get("model_card") or {}).get("thresholds")
    return dict(thresholds) if isinstance(thresholds, dict) else None


def _load_outputs(prediction_run_id: str) -> pd.DataFrame:
    """Served predictions for the run, with the credit interval JSON flattened."""

    with create_engine(database_url()).connect() as conn:
        frame = pd.read_sql_query(
            text(
                """
                SELECT acc_id,
                       churn_probability,
                       predicted_clv_6m,
                       predicted_credit_usage_30d,
                       predicted_credit_usage_90d,
                       credit_forecast_interval_json
                FROM ml_prediction_outputs
                WHERE prediction_run_id = CAST(:run_id AS UUID)
                ORDER BY acc_id
                """
            ),
            conn,
            params={"run_id": prediction_run_id},
        )
    if frame.empty:
        return frame

    for column in (
        "churn_probability",
        "predicted_clv_6m",
        "predicted_credit_usage_30d",
        "predicted_credit_usage_90d",
    ):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    intervals = frame["credit_forecast_interval_json"].apply(_parse_json_cell)
    for key in ("p10_30d", "p90_30d", "p10_90d", "p90_90d"):
        frame[key] = pd.to_numeric(
            intervals.apply(lambda cell: (cell or {}).get(key)), errors="coerce"
        )
    frame["acc_id"] = frame["acc_id"].astype(int)
    return frame.drop(columns=["credit_forecast_interval_json"])


def _parse_json_cell(cell: Any) -> dict[str, Any] | None:
    if cell is None or (isinstance(cell, float) and pd.isna(cell)):
        return None
    if isinstance(cell, dict):
        return cell
    if isinstance(cell, str):
        try:
            parsed = json.loads(cell)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


# ── Persistence ──────────────────────────────────────────────────


def _replace_evaluation(
    *,
    run_id: str,
    version_row: dict[str, Any],
    result: OutcomeResult,
    cutoff: pd.Timestamp,
    actuals: ActualsSource,
) -> None:
    """Upsert one production_holdout evaluation (delete + insert, atomic per row)."""

    context = {
        **result.context,
        "actuals_source_id": actuals.source_id,
        "actuals_max_activity_date": str(actuals.max_activity_date.date()),
    }
    with create_engine(database_url()).begin() as conn:
        conn.execute(
            text(
                """
                DELETE FROM ml_model_evaluations
                WHERE prediction_run_id = CAST(:run_id AS UUID)
                  AND model_type = :model_type
                  AND evaluation_type = :evaluation_type
                """
            ),
            {
                "run_id": run_id,
                "model_type": result.model_type,
                "evaluation_type": PRODUCTION_HOLDOUT_EVALUATION_TYPE,
            },
        )
        conn.execute(
            text(
                """
                INSERT INTO ml_model_evaluations (
                  model_version_id, training_run_id, prediction_run_id,
                  model_type, evaluation_type, dataset_split,
                  cutoff_date, horizon_days,
                  metrics_json, business_metrics_json, confusion_matrix_json,
                  calibration_json, lift_table_json
                ) VALUES (
                  CAST(:model_version_id AS UUID), CAST(:training_run_id AS UUID),
                  CAST(:prediction_run_id AS UUID),
                  :model_type, :evaluation_type, :dataset_split,
                  CAST(:cutoff_date AS DATE), :horizon_days,
                  CAST(:metrics AS JSONB), CAST(:context AS JSONB),
                  CAST(:confusion_matrix AS JSONB),
                  CAST(:calibration AS JSONB), CAST(:lift_table AS JSONB)
                )
                """
            ),
            {
                "model_version_id": version_row["id"],
                "training_run_id": version_row["training_run_id"],
                "prediction_run_id": run_id,
                "model_type": result.model_type,
                "evaluation_type": PRODUCTION_HOLDOUT_EVALUATION_TYPE,
                "dataset_split": PRODUCTION_DATASET_SPLIT,
                "cutoff_date": str(cutoff.date()),
                "horizon_days": result.horizon_days,
                "metrics": _json(result.metrics),
                "context": _json(context),
                "confusion_matrix": _json(result.confusion_matrix) if result.confusion_matrix else None,
                "calibration": _json(result.calibration) if result.calibration else None,
                "lift_table": _json(result.lift_table) if result.lift_table else None,
            },
        )


def _save_outcome_report(
    run: dict[str, Any],
    actuals: ActualsSource,
    *,
    status: str,
    results: list[OutcomeResult],
    row_count: int,
    error: str | None = None,
) -> None:
    """Per-run evidence row in ml_data_validation_reports (§15 audit trail)."""

    anomalies = [
        {"check": result.model_type, "message": result.skipped_reason}
        for result in results
        if result.skipped_reason
    ]
    if error:
        anomalies.append({"check": "backfill", "message": error})
    report = ValidationReport(
        source_id=run["predict_source_id"],
        source_kind="predict",
        validation_type=REALIZED_OUTCOME_VALIDATION_TYPE,
        status=status,  # type: ignore[arg-type]
        row_count=row_count,
        stats={
            "prediction_run_id": run["id"],
            "cutoff_date": str(pd.Timestamp(run["cutoff_date"]).date()),
            "actuals_source_id": actuals.source_id,
            "actuals_max_activity_date": str(actuals.max_activity_date.date()),
            "measured_models": [result.model_type for result in results if result.measured],
            **({"error": error} if error else {}),
        },
        anomalies=anomalies,
        checks=[],
    )
    try:
        repository.save_validation_report(report, prediction_run_id=run["id"])
    except Exception:  # noqa: BLE001 - the report is evidence, not the outcome itself.
        logger.exception("failed to save realized-outcome report for run %s", run["id"])


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)
