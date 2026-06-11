#!/usr/bin/env python3
"""Verify clean data loaders and early ML quality gates.

This script does not train or score. It only writes database rows when
`--persist-reports` is passed.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.training.data import (  # noqa: E402
    database_url,
    load_predict_clean,
    load_train_clean,
)
from src.training.labels import LabelConfig  # noqa: E402
from src.training.repository import save_validation_reports  # noqa: E402
from src.training.validation import (  # noqa: E402
    check_predict_source_readiness,
    check_predict_schema_quality,
    check_train_cutoff_feasibility,
    check_train_label_viability,
    check_train_schema_quality,
    check_train_source_readiness,
)


SourceKind = Literal["train", "predict"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify clean data access layer.")
    parser.add_argument("--source-kind", choices=["train", "predict"], default="train")
    parser.add_argument("--source-id", help="Source id to verify. Defaults to latest ready source.")
    parser.add_argument("--cutoff-date", default="2025-07-01", help="Cutoff for train label viability.")
    parser.add_argument("--horizon-days", type=int, default=180)
    parser.add_argument("--active-window-days", type=int, default=180)
    parser.add_argument("--output-json", type=Path, help="Optional path for a JSON report.")
    parser.add_argument(
        "--persist-reports",
        action="store_true",
        help="Insert generated validation reports into ml_data_validation_reports.",
    )
    parser.add_argument("--training-run-id", help="Optional ml_training_runs.id for persisted reports.")
    parser.add_argument("--prediction-run-id", help="Optional ml_prediction_runs.id for persisted reports.")
    return parser.parse_args()


def latest_ready_source(source_kind: SourceKind) -> str:
    table_name = "train_data_sources" if source_kind == "train" else "predict_data_sources"
    with create_engine(database_url()).connect() as conn:
        row = conn.execute(
            text(
                f"""
                SELECT id::text
                FROM {table_name}
                WHERE import_status = 'ready'
                ORDER BY created_at DESC
                LIMIT 1
                """
            )
        ).first()

    if row is None:
        raise RuntimeError(f"No ready {table_name} row found.")
    return str(row[0])


def verify_source(
    source_kind: SourceKind,
    source_id: str,
    label_config: LabelConfig,
) -> dict[str, Any]:
    if source_kind == "train":
        readiness = check_train_source_readiness(source_id)
        schema_quality = check_train_schema_quality(source_id)
        cutoff_feasibility = (
            check_train_cutoff_feasibility(source_id, label_config)
            if schema_quality.status != "failed"
            else None
        )
        label_viability = (
            check_train_label_viability(source_id, label_config)
            if schema_quality.status != "failed"
            and cutoff_feasibility is not None
            and cutoff_feasibility.status != "failed"
            else None
        )
        loader = load_train_clean
    else:
        readiness = check_predict_source_readiness(source_id)
        schema_quality = check_predict_schema_quality(source_id)
        cutoff_feasibility = None
        label_viability = None
        loader = load_predict_clean

    if (
        readiness.status == "failed"
        or schema_quality.status == "failed"
        or (cutoff_feasibility is not None and cutoff_feasibility.status == "failed")
        or (label_viability is not None and label_viability.status == "failed")
    ):
        return {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "source_kind": source_kind,
            "source_id": source_id,
            "status": "failed",
            "readiness": readiness.to_dict(),
            "schema_quality": schema_quality.to_dict(),
            "cutoff_feasibility": cutoff_feasibility.to_dict()
            if cutoff_feasibility
            else None,
            "label_viability": label_viability.to_dict() if label_viability else None,
            "loader_checks": [],
            "dataframe_summary": None,
        }

    customers, payments, usage = loader(source_id)

    loader_checks = _loader_checks(
        source_kind=source_kind,
        customers=customers,
        payments=payments,
        usage=usage,
    )
    status = (
        "passed"
        if readiness.status != "failed"
        and schema_quality.status != "failed"
        and (cutoff_feasibility is None or cutoff_feasibility.status != "failed")
        and (label_viability is None or label_viability.status != "failed")
        and all(c["passed"] for c in loader_checks)
        else "failed"
    )

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "source_kind": source_kind,
        "source_id": source_id,
        "status": status,
        "readiness": readiness.to_dict(),
        "schema_quality": schema_quality.to_dict(),
        "cutoff_feasibility": cutoff_feasibility.to_dict() if cutoff_feasibility else None,
        "label_viability": label_viability.to_dict() if label_viability else None,
        "loader_checks": loader_checks,
        "dataframe_summary": {
            "customers": _frame_summary(customers),
            "payments": _frame_summary(payments),
            "usage": _frame_summary(usage),
        },
    }


def _loader_checks(
    source_kind: SourceKind,
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
) -> list[dict[str, Any]]:
    checks = [
        _check("customers_dataframe", isinstance(customers, pd.DataFrame), "customers is a DataFrame"),
        _check("payments_dataframe", isinstance(payments, pd.DataFrame), "payments is a DataFrame"),
        _check("usage_dataframe", isinstance(usage, pd.DataFrame), "usage is a DataFrame"),
        _check("customers_acc_id_parsed", str(customers["acc_id"].dtype) == "Int64", "customers.acc_id is nullable integer"),
        _check("usage_has_period", "period" in usage.columns, "usage has period column"),
        _check("usage_period_parsed", pd.api.types.is_datetime64_any_dtype(usage["period"]), "usage.period is datetime"),
        _check("customer_dates_parsed", _all_datetime(customers, ["join_date", "expire_sms", "expire_email", "last_access", "last_send"]), "customer date columns are datetime"),
        _check("payment_date_parsed", pd.api.types.is_datetime64_any_dtype(payments["payment_date"]), "payments.payment_date is datetime"),
        _check("payment_numeric_parsed", _all_numeric(payments, ["amount", "credit_add"]), "payment numeric columns are numeric"),
        _check("usage_numeric_parsed", _all_numeric(usage, ["usage"]), "usage.usage is numeric"),
    ]

    if source_kind == "train":
        checks.extend(
            [
                _check("train_customers_non_empty", len(customers) > 0, "train customers are non-empty"),
                _check("train_payments_non_empty", len(payments) > 0, "train payments are non-empty"),
                _check("train_usage_non_empty", len(usage) > 0, "train usage is non-empty"),
            ]
        )
    else:
        checks.append(
            _check("predict_customers_non_empty", len(customers) > 0, "predict customers are non-empty")
        )

    return checks


def _check(name: str, passed: bool, message: str) -> dict[str, Any]:
    return {"name": name, "passed": bool(passed), "message": message}


def _all_datetime(frame: pd.DataFrame, columns: list[str]) -> bool:
    return all(pd.api.types.is_datetime64_any_dtype(frame[column]) for column in columns)


def _all_numeric(frame: pd.DataFrame, columns: list[str]) -> bool:
    return all(pd.api.types.is_numeric_dtype(frame[column]) for column in columns)


def _frame_summary(frame: pd.DataFrame) -> dict[str, Any]:
    return {
        "rows": int(len(frame)),
        "columns": list(frame.columns),
        "dtypes": {column: str(dtype) for column, dtype in frame.dtypes.items()},
    }


def to_jsonable(value: Any) -> Any:
    if value is pd.NA:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return None if np.isnan(value) else float(value)
    if isinstance(value, (pd.Timestamp, datetime)):
        return None if pd.isna(value) else value.isoformat()
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_jsonable(v) for v in value]
    if isinstance(value, (set, tuple)):
        return [to_jsonable(v) for v in value]
    return value


def main() -> None:
    args = parse_args()
    source_kind: SourceKind = args.source_kind
    source_id = args.source_id or latest_ready_source(source_kind)
    label_config = LabelConfig(
        cutoff_date=pd.Timestamp(args.cutoff_date),
        horizon_days=args.horizon_days,
        active_window_days=args.active_window_days,
    )
    report = verify_source(source_kind, source_id, label_config)

    persisted_report_ids: list[str] = []
    if args.persist_reports:
        reports = [
            _report_from_dict(report["readiness"]),
            _report_from_dict(report["schema_quality"]),
        ]
        if report["cutoff_feasibility"] is not None:
            reports.append(_report_from_dict(report["cutoff_feasibility"]))
        if report["label_viability"] is not None:
            reports.append(_report_from_dict(report["label_viability"]))
        persisted_report_ids = save_validation_reports(
            reports,
            training_run_id=args.training_run_id,
            prediction_run_id=args.prediction_run_id,
        )
        report["persisted_report_ids"] = persisted_report_ids

    print("=" * 80)
    print("Clean Data Access Verification")
    print("=" * 80)
    print(f"source_kind: {report['source_kind']}")
    print(f"source_id:   {report['source_id']}")
    print(f"status:      {report['status']}")
    print(f"readiness:   {report['readiness']['status']}")
    print(f"schema:      {report['schema_quality']['status']}")
    if report["cutoff_feasibility"] is not None:
        print(f"cutoff:      {report['cutoff_feasibility']['status']}")
    if report["label_viability"] is not None:
        print(f"labels:      {report['label_viability']['status']}")
    print(f"rows:        {report['readiness']['stats']['row_counts']}")
    if persisted_report_ids:
        print(f"persisted:   {persisted_report_ids}")
    print("=" * 80)

    if args.output_json:
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_json.write_text(
            json.dumps(to_jsonable(report), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"Wrote JSON report: {args.output_json}")

    if report["status"] != "passed":
        raise SystemExit(1)


def _report_from_dict(raw: dict[str, Any]):
    from src.training.validation import ValidationCheck, ValidationReport

    return ValidationReport(
        source_id=raw["source_id"],
        source_kind=raw["source_kind"],
        validation_type=raw["validation_type"],
        status=raw["status"],
        row_count=raw["row_count"],
        stats=raw["stats"],
        anomalies=raw["anomalies"],
        checks=[
            ValidationCheck(
                name=check["name"],
                severity=check["severity"],
                passed=check["passed"],
                message=check["message"],
                details=check.get("details"),
            )
            for check in raw["checks"]
        ],
    )


if __name__ == "__main__":
    main()
