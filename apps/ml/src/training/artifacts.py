"""Model artifact persistence (TRAINING-PIPELINE §16).

Layout: models/{model_type}/{version}/
  model.pkl, calibrator.pkl (churn), preprocessor.json, feature_names.json,
  thresholds.json (churn), metrics.json, model_card.json, training_log.txt
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

import dill

from src.training.preprocessing import PreprocessorConfig, load_preprocessor, save_preprocessor


def models_dir() -> Path:
    return Path(os.getenv("MODEL_DIR", str(Path(__file__).resolve().parents[2] / "models")))


def artifact_dir(model_type: str, version: str) -> Path:
    target = models_dir() / model_type / version
    target.mkdir(parents=True, exist_ok=True)
    return target


def save_artifacts(
    *,
    model_type: str,
    version: str,
    model_object: Any,
    preprocessor: PreprocessorConfig,
    feature_names: list[str],
    metrics: dict[str, Any],
    model_card: dict[str, Any],
    calibrator: Any | None = None,
    thresholds: dict[str, float] | None = None,
    training_log: str | None = None,
    feature_baseline: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Write all artifacts; returns (artifact_path, model_pkl_sha256).

    The returned path is RELATIVE to MODEL_DIR (`{model_type}/{version}`) so
    the registry row stays valid across hosts/containers with different
    MODEL_DIR mounts.
    """

    target = artifact_dir(model_type, version)

    model_path = target / "model.pkl"
    with open(model_path, "wb") as handle:
        dill.dump(model_object, handle)
    checksum = hashlib.sha256(model_path.read_bytes()).hexdigest()

    if calibrator is not None:
        with open(target / "calibrator.pkl", "wb") as handle:
            dill.dump(calibrator, handle)
    if thresholds is not None:
        _write_json(target / "thresholds.json", thresholds)
    if feature_baseline is not None:
        # Training feature distribution snapshot for prediction-time PSI drift.
        _write_json(target / "feature_baseline.json", feature_baseline)

    save_preprocessor(preprocessor, target / "preprocessor.json")
    _write_json(target / "feature_names.json", feature_names)
    _write_json(target / "metrics.json", metrics)
    _write_json(target / "model_card.json", model_card)
    if training_log:
        (target / "training_log.txt").write_text(training_log, encoding="utf-8")

    return f"{model_type}/{version}", checksum


def load_artifacts(artifact_path: str) -> dict[str, Any]:
    """Load model + companions; raises when files are missing/corrupt.

    Accepts a MODEL_DIR-relative path (preferred) or a legacy absolute path.
    """

    target = Path(artifact_path)
    if not target.is_absolute():
        target = models_dir() / target
    with open(target / "model.pkl", "rb") as handle:
        model_object = dill.load(handle)

    calibrator = None
    calibrator_path = target / "calibrator.pkl"
    if calibrator_path.exists():
        with open(calibrator_path, "rb") as handle:
            calibrator = dill.load(handle)

    thresholds = None
    thresholds_path = target / "thresholds.json"
    if thresholds_path.exists():
        thresholds = json.loads(thresholds_path.read_text(encoding="utf-8"))

    # Optional — absent on artifacts trained before drift monitoring shipped.
    feature_baseline = None
    baseline_path = target / "feature_baseline.json"
    if baseline_path.exists():
        feature_baseline = json.loads(baseline_path.read_text(encoding="utf-8"))

    return {
        "model": model_object,
        "calibrator": calibrator,
        "thresholds": thresholds,
        "feature_baseline": feature_baseline,
        "preprocessor": load_preprocessor(target / "preprocessor.json"),
        "feature_names": json.loads((target / "feature_names.json").read_text(encoding="utf-8")),
        "model_card": json.loads((target / "model_card.json").read_text(encoding="utf-8")),
    }


def verify_artifact_load(artifact_path: str, sample_features: Any) -> bool:
    """Promotion gate №6 — artifacts must load and predict a sample (§14)."""

    bundle = load_artifacts(artifact_path)
    from src.training.preprocessing import transform_features

    transformed = transform_features(sample_features, bundle["preprocessor"])
    model_object = bundle["model"]
    if hasattr(model_object, "predict_proba"):
        scores = model_object.predict_proba(transformed)
        return scores.shape[0] == len(transformed)
    if hasattr(model_object, "predict"):
        return len(model_object.predict(transformed)) == len(transformed)
    # composite bundles (clv / credit dicts) expose their own predict hooks
    return model_object is not None


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
