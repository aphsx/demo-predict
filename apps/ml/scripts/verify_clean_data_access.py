#!/usr/bin/env python3
"""Verify clean data loaders and Gate 1 readiness checks.

This script is read-only. It does not train, score, or write database rows.
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
from src.training.validation import (  # noqa: E402
    check_predict_source_readiness,
    check_train_source_readiness,
)


SourceKind = Literal["train", "predict"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify clean data access layer.")
    parser.add_argument("--source-kind", choices=["train", "predict"], default="train")
    parser.add_argument("--source-id", help="Source id to verify. Defaults to latest ready source.")
    parser.add_argument("--output-json", type=Path, help="Optional path for a JSON report.")
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


def verify_source(source_kind: SourceKind, source_id: str) -> dict[str, Any]:
    if source_kind == "train":
        readiness = check_train_source_readiness(source_id)
        customers, payments, usage = load_train_clean(source_id)
    else:
        readiness = check_predict_source_readiness(source_id)
        customers, payments, usage = load_predict_clean(source_id)

    loader_checks = _loader_checks(
        source_kind=source_kind,
        customers=customers,
        payments=payments,
        usage=usage,
    )
    status = "passed" if readiness.status != "failed" and all(c["passed"] for c in loader_checks) else "failed"

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "source_kind": source_kind,
        "source_id": source_id,
        "status": status,
        "readiness": readiness.to_dict(),
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
    return value


def main() -> None:
    args = parse_args()
    source_kind: SourceKind = args.source_kind
    source_id = args.source_id or latest_ready_source(source_kind)
    report = verify_source(source_kind, source_id)

    print("=" * 80)
    print("Clean Data Access Verification")
    print("=" * 80)
    print(f"source_kind: {report['source_kind']}")
    print(f"source_id:   {report['source_id']}")
    print(f"status:      {report['status']}")
    print(f"readiness:   {report['readiness']['status']}")
    print(f"rows:        {report['readiness']['stats']['row_counts']}")
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


if __name__ == "__main__":
    main()
