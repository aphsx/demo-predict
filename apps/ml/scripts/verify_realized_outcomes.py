#!/usr/bin/env python3
"""Verify the realized-outcome backfill contract (TRAINING-PIPELINE §15).

Checks, against a populated DB:
  1. Label-definition parity — the outcomes runner uses the EXACT training
     label builders (identity check on the imported functions, not a re-derived
     formula that could drift).
  2. Metric sanity — realized churn/CLV/credit metrics computed in-memory for
     the latest measurable completed prediction run stay in their valid ranges
     and the matched populations are consistent.
  3. Stored-row consistency — any persisted production_holdout evaluations for
     that run agree with the in-memory recomputation on model types and n.

Run from apps/ml/:  python scripts/verify_realized_outcomes.py [--prediction-run-id <uuid>]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import create_engine, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.outcomes import runner as outcomes_runner  # noqa: E402
from src.outcomes.runner import (  # noqa: E402
    PRODUCTION_HOLDOUT_EVALUATION_TYPE,
    OutcomeResult,
    compute_run_outcomes,
    find_actuals_source,
)
from src.training import labels as training_labels  # noqa: E402
from src.training.data import database_url, load_predict_clean  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify realized-outcome contract.")
    parser.add_argument(
        "--prediction-run-id",
        help="Completed prediction run to verify. Defaults to the latest completed run.",
    )
    parser.add_argument("--output-json", type=Path, help="Optional path for a JSON report.")
    return parser.parse_args()


def latest_completed_run_id() -> str:
    with create_engine(database_url()).connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT id::text
                FROM ml_prediction_runs
                WHERE status = 'completed'
                ORDER BY created_at DESC
                LIMIT 1
                """
            )
        ).first()
    if row is None:
        raise RuntimeError("No completed ml_prediction_runs row found.")
    return str(row[0])


def stored_production_holdout(prediction_run_id: str) -> list[dict[str, Any]]:
    with create_engine(database_url()).connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT model_type, metrics_json
                FROM ml_model_evaluations
                WHERE prediction_run_id = CAST(:run_id AS UUID)
                  AND evaluation_type = :evaluation_type
                """
            ),
            {
                "run_id": prediction_run_id,
                "evaluation_type": PRODUCTION_HOLDOUT_EVALUATION_TYPE,
            },
        ).mappings().all()
    out: list[dict[str, Any]] = []
    for row in rows:
        metrics = row["metrics_json"] or {}
        if isinstance(metrics, str):
            metrics = json.loads(metrics)
        out.append({"model_type": row["model_type"], "metrics": metrics})
    return out


def _check(
    name: str,
    passed: bool,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {"name": name, "passed": bool(passed), "message": message, "details": details or {}}


def _label_parity_checks() -> list[dict[str, Any]]:
    """The runner must import the training label builders — same object, not a copy."""

    pairs = [
        ("churn", outcomes_runner.build_churn_labels, training_labels.build_churn_labels),
        ("clv", outcomes_runner.build_clv_labels, training_labels.build_clv_labels),
        ("credit", outcomes_runner.build_credit_usage_labels, training_labels.build_credit_usage_labels),
    ]
    checks = [
        _check(
            f"label_definition_parity_{model_type}",
            used is canonical,
            f"outcomes runner uses src.training.labels.{canonical.__name__} for {model_type} "
            "(imported, not duplicated).",
        )
        for model_type, used, canonical in pairs
    ]
    checks.append(
        _check(
            "credit_horizons_shared",
            outcomes_runner.CREDIT_HORIZONS is training_labels.CREDIT_HORIZONS,
            "outcomes runner shares CREDIT_HORIZONS with the training label module.",
        )
    )
    return checks


def _metric_sanity_checks(results: list[OutcomeResult]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    by_type = {result.model_type: result for result in results}

    churn = by_type.get("churn")
    if churn is not None and churn.measured and churn.metrics is not None:
        m = churn.metrics
        checks.append(
            _check(
                "churn_metric_ranges",
                0.0 <= m["pr_auc"] <= 1.0
                and 0.0 <= m["roc_auc"] <= 1.0
                and 0.0 <= m["ece"] <= 1.0
                and 0.0 < m["positive_rate"] < 1.0
                and m["n"] > 0,
                "Realized churn PR-AUC/ROC-AUC/ECE in [0,1]; positive rate strictly inside (0,1).",
                {key: m[key] for key in ("pr_auc", "roc_auc", "ece", "positive_rate", "n")},
            )
        )
        checks.append(
            _check(
                "churn_population_consistency",
                churn.context["matched_customers"] <= churn.context["predicted_customers"]
                and churn.context["matched_customers"] == m["n"],
                "Matched churn population ⊆ scored population, and n matches.",
                {k: churn.context[k] for k in ("predicted_customers", "label_population", "matched_customers")},
            )
        )
    else:
        checks.append(
            _check(
                "churn_measurable",
                False,
                f"churn not measurable: {churn.skipped_reason if churn else 'no result'}",
            )
        )

    clv = by_type.get("clv")
    if clv is not None and clv.measured and clv.metrics is not None:
        m = clv.metrics
        checks.append(
            _check(
                "clv_metric_ranges",
                -1.0 <= m["spearman"] <= 1.0
                and m["mae"] >= 0.0
                and 0.0 <= m["top_decile_capture"] <= 1.0
                and m["n"] > 0,
                "Realized CLV Spearman in [-1,1]; MAE ≥ 0; top-decile capture in [0,1].",
                {key: m[key] for key in ("spearman", "mae", "top_decile_capture", "n")},
            )
        )
    else:
        checks.append(
            _check(
                "clv_measurable",
                False,
                f"clv not measurable: {clv.skipped_reason if clv else 'no result'}",
            )
        )

    credit = by_type.get("credit")
    if credit is not None and credit.measured and credit.metrics is not None:
        m = credit.metrics
        coverage_keys = [key for key in m if key.startswith("coverage_p10_p90")]
        mae_keys = [key for key in m if key.startswith("mae_")]
        checks.append(
            _check(
                "credit_metric_ranges",
                all(0.0 <= m[key] <= 1.0 for key in coverage_keys)
                and all(m[key] >= 0.0 for key in mae_keys)
                and m["n"] > 0,
                "Realized credit coverage in [0,1]; MAE ≥ 0 per elapsed horizon.",
                {key: m[key] for key in coverage_keys + mae_keys + ["n"]},
            )
        )
    else:
        checks.append(
            _check(
                "credit_measurable",
                False,
                f"credit not measurable: {credit.skipped_reason if credit else 'no result'}",
            )
        )

    return checks


def _stored_consistency_checks(
    prediction_run_id: str, results: list[OutcomeResult]
) -> list[dict[str, Any]]:
    stored = stored_production_holdout(prediction_run_id)
    if not stored:
        return [
            _check(
                "stored_rows_present",
                True,
                "No production_holdout rows stored yet for this run — run "
                "`python -m src.cli.backfill_outcomes` first to persist (informational).",
            )
        ]
    measured_types = {result.model_type for result in results if result.measured}
    stored_types = {row["model_type"] for row in stored}
    checks = [
        _check(
            "stored_model_types_match",
            stored_types <= measured_types,
            "Every stored production_holdout model type is recomputable in-memory.",
            {"stored": sorted(stored_types), "recomputed": sorted(measured_types)},
        )
    ]
    recomputed = {result.model_type: result.metrics for result in results if result.measured}
    for row in stored:
        metrics = recomputed.get(row["model_type"])
        if metrics is None:
            continue
        checks.append(
            _check(
                f"stored_n_matches_{row['model_type']}",
                row["metrics"].get("n") == metrics.get("n"),
                f"Stored n equals recomputed n for {row['model_type']} "
                "(same actuals source ⇒ same matched population).",
                {"stored_n": row["metrics"].get("n"), "recomputed_n": metrics.get("n")},
            )
        )
    return checks


def verify_realized_outcomes(prediction_run_id: str) -> dict[str, Any]:
    actuals = find_actuals_source()
    if actuals is None:
        raise RuntimeError("No ready predict data source with clean activity data.")

    run = outcomes_runner._load_run(prediction_run_id)  # noqa: SLF001 - contract script inspects the runner.
    cutoff = pd.Timestamp(run["cutoff_date"])
    version_rows = {
        model_type: outcomes_runner._model_version_row(  # noqa: SLF001
            model_type, outcomes_runner._served_versions(run).get(model_type)  # noqa: SLF001
        )
        for model_type in outcomes_runner.MODEL_TYPES
    }
    outputs = outcomes_runner._load_outputs(prediction_run_id)  # noqa: SLF001
    if outputs.empty:
        raise RuntimeError(f"Prediction run {prediction_run_id} has no outputs.")
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

    checks = (
        _label_parity_checks()
        + _metric_sanity_checks(results)
        + _stored_consistency_checks(prediction_run_id, results)
    )
    status = "passed" if all(check["passed"] for check in checks) else "failed"
    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "prediction_run_id": prediction_run_id,
        "cutoff_date": str(cutoff.date()),
        "actuals_source_id": actuals.source_id,
        "actuals_max_activity_date": str(actuals.max_activity_date.date()),
        "status": status,
        "checks": checks,
        "outcomes": [
            {
                "model_type": result.model_type,
                "measured": result.measured,
                "horizon_days": result.horizon_days,
                "skipped_reason": result.skipped_reason,
                "metrics": result.metrics,
                "context": result.context,
            }
            for result in results
        ],
    }


def main() -> None:
    args = parse_args()
    prediction_run_id = args.prediction_run_id or latest_completed_run_id()
    report = verify_realized_outcomes(prediction_run_id)

    print("=" * 80)
    print("Realized-Outcome Contract Verification (TRAINING-PIPELINE §15)")
    print("=" * 80)
    print(f"prediction_run_id: {report['prediction_run_id']}")
    print(f"cutoff_date:       {report['cutoff_date']}")
    print(f"actuals_source:    {report['actuals_source_id']}")
    print(f"actuals_through:   {report['actuals_max_activity_date']}")
    print(f"status:            {report['status']}")
    print("-" * 80)
    for check in report["checks"]:
        marker = "PASS" if check["passed"] else "FAIL"
        print(f"[{marker}] {check['name']}: {check['message']}")
    print("=" * 80)

    if args.output_json:
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_json.write_text(
            json.dumps(report, indent=2, ensure_ascii=False, default=str),
            encoding="utf-8",
        )
        print(f"Wrote JSON report: {args.output_json}")

    if report["status"] != "passed":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
