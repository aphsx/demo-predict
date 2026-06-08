#!/usr/bin/env python3
"""Verify preprocessing fit/transform safety without training models."""

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

from src.training.data import database_url, load_train_clean  # noqa: E402
from src.training.features import build_all_features  # noqa: E402
from src.training.preprocessing import (  # noqa: E402
    check_preprocessing_safety,
    fit_transform_preprocessor,
    load_preprocessor,
    save_preprocessor,
    transform_features,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify preprocessing safety contract.")
    parser.add_argument("--source-id", help="Train source id. Defaults to latest ready source.")
    parser.add_argument("--cutoff-date", default="2025-07-01")
    parser.add_argument(
        "--artifact-path",
        type=Path,
        default=Path("/app/models/preprocessor_config.json"),
        help="Where to save the fitted preprocessing config.",
    )
    parser.add_argument("--output-json", type=Path, help="Optional path for a JSON report.")
    return parser.parse_args()


def latest_ready_train_source() -> str:
    with create_engine(database_url()).connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT id::text
                FROM train_data_sources
                WHERE import_status = 'ready'
                ORDER BY created_at DESC
                LIMIT 1
                """
            )
        ).first()

    if row is None:
        raise RuntimeError("No ready train_data_sources row found.")
    return str(row[0])


def verify_preprocessing(
    source_id: str,
    cutoff_date: pd.Timestamp,
    artifact_path: Path,
) -> dict[str, Any]:
    customers, payments, usage = load_train_clean(source_id)
    feature_result = build_all_features(customers, payments, usage, cutoff_date)
    feature_df = feature_result.feature_df
    train_df = feature_df[feature_df["acc_id"] % 5 != 0].copy()
    holdout_df = feature_df[feature_df["acc_id"] % 5 == 0].copy()

    transformed_train, preprocessor = fit_transform_preprocessor(
        train_df,
        feature_result.feature_schema,
    )
    transformed_holdout = transform_features(holdout_df, preprocessor)
    save_preprocessor(preprocessor, artifact_path)
    loaded_preprocessor = load_preprocessor(artifact_path)
    loaded_holdout = transform_features(holdout_df, loaded_preprocessor)
    safety = check_preprocessing_safety(train_df, holdout_df, preprocessor)

    checks = [
        _check("train_split_non_empty", len(train_df) > 0, "Train split is non-empty."),
        _check("holdout_split_non_empty", len(holdout_df) > 0, "Holdout split is non-empty."),
        _check(
            "train_transform_has_no_missing_values",
            not transformed_train.isna().any().any(),
            "Transformed train matrix has no missing values.",
        ),
        _check(
            "holdout_transform_has_no_missing_values",
            not transformed_holdout.isna().any().any(),
            "Transformed holdout matrix has no missing values.",
        ),
        _check(
            "loaded_preprocessor_matches_saved_transform",
            transformed_holdout.equals(loaded_holdout),
            "Loaded preprocessor reproduces holdout transform.",
        ),
        _check(
            "feature_order_preserved_after_load",
            list(loaded_holdout.columns) == feature_result.feature_names,
            "Loaded preprocessor preserves feature order.",
        ),
    ]

    status = (
        "passed"
        if all(check["passed"] for check in checks) and safety.status == "passed"
        else "failed"
    )
    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "source_id": source_id,
        "cutoff_date": pd.Timestamp(cutoff_date).date().isoformat(),
        "status": status,
        "checks": checks,
        "safety_report": safety.__dict__,
        "artifact_path": str(artifact_path),
        "stats": {
            "feature_count": len(feature_result.feature_names),
            "feature_rows": int(len(feature_df)),
            "train_rows": int(len(train_df)),
            "holdout_rows": int(len(holdout_df)),
            "fitted_row_count": preprocessor.fitted_row_count,
            "feature_names": feature_result.feature_names,
        },
    }


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


def to_jsonable(value: Any) -> Any:
    if value is pd.NA:
        return None
    if isinstance(value, pd.Timestamp):
        return None if pd.isna(value) else value.isoformat()
    if isinstance(value, dict):
        return {str(key): to_jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [to_jsonable(item) for item in value]
    return value


def main() -> None:
    args = parse_args()
    source_id = args.source_id or latest_ready_train_source()
    report = verify_preprocessing(
        source_id,
        pd.Timestamp(args.cutoff_date),
        args.artifact_path,
    )

    print("=" * 80)
    print("Preprocessing Safety Verification")
    print("=" * 80)
    print(f"source_id:   {report['source_id']}")
    print(f"cutoff_date: {report['cutoff_date']}")
    print(f"status:      {report['status']}")
    print(f"features:    {report['stats']['feature_count']}")
    print(f"train_rows:  {report['stats']['train_rows']}")
    print(f"holdout:     {report['stats']['holdout_rows']}")
    print(f"artifact:    {report['artifact_path']}")
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
