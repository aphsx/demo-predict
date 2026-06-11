"""Preprocessing contract for ML feature matrices.

This module intentionally keeps preprocessing state explicit and serializable.
Fit functions learn imputation/scaling values from a training split only;
validation/test/predict callers should only use `transform_features`.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import pandas as pd

from src.training.features import FeatureSchema


ENTITY_COLUMNS = {"acc_id", "source_id", "cutoff_date"}


@dataclass(frozen=True)
class PreprocessorConfig:
    feature_names: list[str]
    feature_schema: FeatureSchema
    imputation_values: dict[str, float]
    center_values: dict[str, float]
    scale_values: dict[str, float]
    fitted_row_count: int
    scale_numeric: bool = True
    fitted: bool = True


@dataclass(frozen=True)
class PreprocessingReport:
    status: str
    checks: list[dict[str, Any]]
    stats: dict[str, Any]


def build_preprocessor(
    feature_schema: FeatureSchema,
    *,
    scale_numeric: bool = True,
) -> PreprocessorConfig:
    """Build an unfitted preprocessor contract from a feature schema."""

    return PreprocessorConfig(
        feature_names=list(feature_schema.keys()),
        feature_schema=feature_schema,
        imputation_values={},
        center_values={},
        scale_values={},
        fitted_row_count=0,
        scale_numeric=scale_numeric,
        fitted=False,
    )


def fit_preprocessor(
    feature_df_train: pd.DataFrame,
    feature_schema: FeatureSchema | None = None,
    *,
    scale_numeric: bool = True,
) -> PreprocessorConfig:
    """Fit imputation and scaling values from a training split only."""

    schema = feature_schema or _schema_from_frame(feature_df_train)
    feature_names = list(schema.keys())
    _require_feature_columns(feature_df_train, feature_names)

    numeric = feature_df_train[feature_names].apply(pd.to_numeric, errors="coerce")
    imputation_values = {
        feature_name: _imputation_value(numeric[feature_name], schema[feature_name])
        for feature_name in feature_names
    }
    imputed = numeric.fillna(imputation_values)
    center_values = {feature_name: float(imputed[feature_name].mean()) for feature_name in feature_names}
    scale_values = {
        feature_name: _safe_scale(float(imputed[feature_name].std(ddof=0)))
        for feature_name in feature_names
    }

    return PreprocessorConfig(
        feature_names=feature_names,
        feature_schema=schema,
        imputation_values=imputation_values,
        center_values=center_values,
        scale_values=scale_values,
        fitted_row_count=int(len(feature_df_train)),
        scale_numeric=scale_numeric,
        fitted=True,
    )


def transform_features(
    feature_df: pd.DataFrame,
    preprocessor: PreprocessorConfig,
) -> pd.DataFrame:
    """Transform features using a fitted preprocessor without refitting."""

    if not preprocessor.fitted:
        raise RuntimeError("Preprocessor must be fitted before transform.")
    _require_feature_columns(feature_df, preprocessor.feature_names)

    transformed = feature_df[preprocessor.feature_names].apply(pd.to_numeric, errors="coerce")
    transformed = transformed.fillna(preprocessor.imputation_values)
    if preprocessor.scale_numeric:
        for feature_name in preprocessor.feature_names:
            transformed[feature_name] = (
                transformed[feature_name] - preprocessor.center_values[feature_name]
            ) / preprocessor.scale_values[feature_name]

    return transformed[preprocessor.feature_names]


def fit_transform_preprocessor(
    feature_df_train: pd.DataFrame,
    feature_schema: FeatureSchema | None = None,
    *,
    scale_numeric: bool = True,
) -> tuple[pd.DataFrame, PreprocessorConfig]:
    """Fit on train split and return transformed training features."""

    preprocessor = fit_preprocessor(
        feature_df_train,
        feature_schema,
        scale_numeric=scale_numeric,
    )
    return transform_features(feature_df_train, preprocessor), preprocessor


def save_preprocessor(preprocessor: PreprocessorConfig, path: str | Path) -> None:
    """Save fitted preprocessing config as JSON artifact."""

    if not preprocessor.fitted:
        raise RuntimeError("Only fitted preprocessors should be saved.")
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(asdict(preprocessor), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def load_preprocessor(path: str | Path) -> PreprocessorConfig:
    """Load preprocessing config from a JSON artifact."""

    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return PreprocessorConfig(
        feature_names=list(raw["feature_names"]),
        feature_schema=raw["feature_schema"],
        imputation_values={key: float(value) for key, value in raw["imputation_values"].items()},
        center_values={key: float(value) for key, value in raw["center_values"].items()},
        scale_values={key: float(value) for key, value in raw["scale_values"].items()},
        fitted_row_count=int(raw["fitted_row_count"]),
        scale_numeric=bool(raw["scale_numeric"]),
        fitted=bool(raw["fitted"]),
    )


def check_preprocessing_safety(
    train_df: pd.DataFrame,
    other_df: pd.DataFrame,
    preprocessor: PreprocessorConfig,
) -> PreprocessingReport:
    """Return structured checks for Gate 8 preprocessing safety."""

    transformed_columns: list[str] = []
    transform_error: str | None = None
    try:
        transformed_columns = list(transform_features(other_df, preprocessor).columns)
    except Exception as exc:  # noqa: BLE001 - convert transform failures into report evidence.
        transform_error = str(exc)

    checks = [
        _check(
            "preprocessor_is_fitted",
            preprocessor.fitted,
            "Preprocessor has fitted train-split state.",
        ),
        _check(
            "fitted_row_count_matches_train_split",
            preprocessor.fitted_row_count == len(train_df),
            "Fitted row count matches the provided train split.",
            {"fitted_row_count": preprocessor.fitted_row_count, "train_rows": len(train_df)},
        ),
        _check(
            "feature_order_preserved",
            transformed_columns == preprocessor.feature_names,
            (
                "Transform preserves fitted feature order."
                if transform_error is None
                else "Transform failed for comparison split."
            ),
            {"error": transform_error} if transform_error else None,
        ),
        _check(
            "no_other_split_refit_state",
            preprocessor.fitted_row_count != len(other_df) or len(train_df) == len(other_df),
            "Fitted state does not match only the comparison split size.",
            {"other_rows": len(other_df)},
        ),
    ]
    return PreprocessingReport(
        status="passed" if all(check["passed"] for check in checks) else "failed",
        checks=checks,
        stats={
            "train_rows": int(len(train_df)),
            "other_rows": int(len(other_df)),
            "feature_count": len(preprocessor.feature_names),
            "scale_numeric": preprocessor.scale_numeric,
            "imputed_features": sorted(preprocessor.imputation_values.keys()),
        },
    )


def _imputation_value(series: pd.Series, metadata: dict[str, Any]) -> float:
    configured_default = metadata.get("default")
    if configured_default is not None:
        return float(configured_default)

    median = pd.to_numeric(series, errors="coerce").median()
    if pd.isna(median):
        return 0.0
    return float(median)


def _safe_scale(value: float) -> float:
    if value <= 0 or pd.isna(value):
        return 1.0
    return float(value)


def _schema_from_frame(feature_df: pd.DataFrame) -> FeatureSchema:
    feature_names = [column for column in feature_df.columns if column not in ENTITY_COLUMNS]
    return {
        feature_name: {
            "dtype": str(feature_df[feature_name].dtype),
            "nullable": bool(feature_df[feature_name].isna().any()),
            "default": None,
        }
        for feature_name in feature_names
    }


def _require_feature_columns(feature_df: pd.DataFrame, feature_names: list[str]) -> None:
    missing = [feature_name for feature_name in feature_names if feature_name not in feature_df.columns]
    if missing:
        raise ValueError(f"Missing feature columns: {missing}")


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
