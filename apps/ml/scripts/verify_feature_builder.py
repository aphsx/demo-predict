#!/usr/bin/env python3
"""Verify the Tier A feature builder without training or scoring models."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

import pandas as pd
from sqlalchemy import create_engine, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.training.data import database_url, load_predict_clean, load_train_clean  # noqa: E402
from src.training.features import (  # noqa: E402
    CREDIT_TIER_A_FEATURES,
    FeatureSetContract,
    build_all_features,
    build_feature_set_contract,
    feature_names_for_model,
)
from src.training.repository import save_feature_set_contract, save_validation_report  # noqa: E402
from src.training.validation import (  # noqa: E402
    ValidationReport,
    check_predict_feature_leakage,
    check_train_feature_leakage,
)


SourceKind = Literal["train", "predict"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify Tier A feature builder.")
    parser.add_argument("--source-kind", choices=["train", "predict"], default="train")
    parser.add_argument("--source-id", help="Source id to verify. Defaults to latest ready source.")
    parser.add_argument("--cutoff-date", default="2025-07-01")
    parser.add_argument("--output-json", type=Path, help="Optional path for a JSON report.")
    parser.add_argument("--feature-set-name", default="churn_A_safe_history")
    parser.add_argument("--feature-set-version", default="v1")
    parser.add_argument("--model-type", default="churn")
    parser.add_argument(
        "--persist-feature-set",
        action="store_true",
        help="Upsert the generated feature set contract into ml_feature_sets.",
    )
    parser.add_argument(
        "--persist-leakage-report",
        action="store_true",
        help="Insert the Gate 5 leakage report into ml_data_validation_reports.",
    )
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


def verify_feature_builder(
    source_kind: SourceKind,
    source_id: str,
    cutoff_date: pd.Timestamp,
    *,
    feature_set_name: str,
    feature_set_version: str,
    model_type: str,
) -> dict[str, Any]:
    report, _, _ = build_feature_builder_artifacts(
        source_kind,
        source_id,
        cutoff_date,
        feature_set_name=feature_set_name,
        feature_set_version=feature_set_version,
        model_type=model_type,
    )
    return report


def build_feature_builder_artifacts(
    source_kind: SourceKind,
    source_id: str,
    cutoff_date: pd.Timestamp,
    *,
    feature_set_name: str,
    feature_set_version: str,
    model_type: str,
) -> tuple[dict[str, Any], FeatureSetContract, ValidationReport]:
    loader = load_train_clean if source_kind == "train" else load_predict_clean
    customers, payments, usage = loader(source_id)
    result = build_all_features(customers, payments, usage, cutoff_date)
    contract = build_feature_set_contract(
        result,
        name=feature_set_name,
        version=feature_set_version,
        model_type=model_type,
        feature_names=feature_names_for_model(model_type),
    )
    leakage_report = (
        check_train_feature_leakage(source_id, cutoff_date)
        if source_kind == "train"
        else check_predict_feature_leakage(source_id, cutoff_date)
    )

    checks = [
        _check(
            "one_feature_row_per_customer",
            len(result.feature_df) == customers["acc_id"].nunique(),
            "Feature row count matches distinct customer count.",
            {
                "feature_rows": len(result.feature_df),
                "distinct_customers": int(customers["acc_id"].nunique()),
            },
        ),
        _check(
            "feature_names_match_builder_contract",
            result.feature_names == CREDIT_TIER_A_FEATURES,
            "Feature builder emits the full Tier A superset in deterministic order.",
        ),
        _check(
            "feature_columns_are_deterministic",
            list(result.feature_df.columns) == ["acc_id", *CREDIT_TIER_A_FEATURES],
            "Feature DataFrame columns are in deterministic order.",
        ),
        _check(
            "no_duplicate_feature_acc_id",
            not result.feature_df["acc_id"].duplicated().any(),
            "Feature DataFrame has no duplicate acc_id rows.",
        ),
        _check(
            "payment_features_are_pre_cutoff",
            _date_before_cutoff(result.feature_stats["pit"]["max_feature_payment_date"], cutoff_date),
            "Max feature payment date is before cutoff.",
            {"max_feature_payment_date": result.feature_stats["pit"]["max_feature_payment_date"]},
        ),
        _check(
            "usage_features_are_pre_cutoff",
            _date_before_cutoff(result.feature_stats["pit"]["max_feature_usage_period"], cutoff_date),
            "Max feature usage period is before cutoff.",
            {"max_feature_usage_period": result.feature_stats["pit"]["max_feature_usage_period"]},
        ),
    ]

    report = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "source_kind": source_kind,
        "source_id": source_id,
        "cutoff_date": pd.Timestamp(cutoff_date).date().isoformat(),
        "status": "passed"
        if all(check["passed"] for check in checks) and leakage_report.status != "failed"
        else "failed",
        "checks": checks,
        "leakage_report": leakage_report.to_dict(),
        "feature_stats": result.feature_stats,
        "feature_schema": result.feature_schema,
        "feature_set_contract": {
            "name": contract.name,
            "version": contract.version,
            "model_type": contract.model_type,
            "feature_names": contract.feature_names,
            "transform_config": contract.transform_config,
            "feature_code_hash": contract.feature_code_hash,
            "lifecycle_code_hash": contract.lifecycle_code_hash,
            "status": contract.status,
        },
        "eligibility_counts": {
            "eligible_for_churn": int(result.eligibility_df["eligible_for_churn"].sum()),
            "eligible_for_clv": int(result.eligibility_df["eligible_for_clv"].sum()),
            "eligible_for_credit": int(result.eligibility_df["eligible_for_credit"].sum()),
        },
        "lifecycle_counts": {
            str(stage): int(count)
            for stage, count in result.lifecycle_df["lifecycle_stage"].value_counts().items()
        },
    }
    return report, contract, leakage_report


def _check(
    name: str,
    passed: bool,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "name": name,
        "passed": bool(passed),
        "message": message,
        "details": details or {},
    }


def _date_before_cutoff(value: str | None, cutoff_date: pd.Timestamp) -> bool:
    if value is None:
        return True
    return pd.Timestamp(value) < pd.Timestamp(cutoff_date)


def to_jsonable(value: Any) -> Any:
    if value is pd.NA:
        return None
    if isinstance(value, pd.Timestamp):
        return None if pd.isna(value) else value.isoformat()
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_jsonable(v) for v in value]
    if isinstance(value, tuple):
        return [to_jsonable(v) for v in value]
    return value


def main() -> None:
    args = parse_args()
    source_kind: SourceKind = args.source_kind
    source_id = args.source_id or latest_ready_source(source_kind)
    report, contract, leakage_report = build_feature_builder_artifacts(
        source_kind,
        source_id,
        pd.Timestamp(args.cutoff_date),
        feature_set_name=args.feature_set_name,
        feature_set_version=args.feature_set_version,
        model_type=args.model_type,
    )

    persisted_feature_set_id = None
    if args.persist_feature_set:
        persisted_feature_set_id = save_feature_set_contract(contract)
        report["persisted_feature_set_id"] = persisted_feature_set_id

    persisted_leakage_report_id = None
    if args.persist_leakage_report:
        persisted_leakage_report_id = save_validation_report(leakage_report)
        report["persisted_leakage_report_id"] = persisted_leakage_report_id

    print("=" * 80)
    print("Tier A Feature Builder Verification")
    print("=" * 80)
    print(f"source_kind: {report['source_kind']}")
    print(f"source_id:   {report['source_id']}")
    print(f"cutoff_date: {report['cutoff_date']}")
    print(f"status:      {report['status']}")
    print(f"features:    {report['feature_stats']['feature_count']}")
    print(f"rows:        {report['feature_stats']['row_count']}")
    print(f"code_hash:   {report['feature_set_contract']['feature_code_hash']}")
    print(f"life_hash:   {report['feature_set_contract']['lifecycle_code_hash']}")
    print(f"leakage:     {report['leakage_report']['status']}")
    print(f"eligibility: {report['eligibility_counts']}")
    print(f"lifecycle:   {report['lifecycle_counts']}")
    if persisted_feature_set_id:
        print(f"feature_set: {persisted_feature_set_id}")
    if persisted_leakage_report_id:
        print(f"leakage_id:  {persisted_leakage_report_id}")
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
