"""Feature drift monitoring (Population Stability Index).

The risk with any churn/CLV/credit model is not training accuracy — it is
silent decay: the model scores fine on the day it ships, then customer
behaviour shifts and its inputs drift away from what it was trained on, so the
predictions quietly go stale. This module makes that visible.

At TRAINING time `build_feature_baseline` snapshots the training feature
distribution (quantile bin edges + per-bin proportions) into the model
artifact. At PREDICTION time `compute_feature_drift` bins the live features
against those exact edges and scores PSI per feature:

    PSI < 0.10        stable      no meaningful shift
    0.10 ≤ PSI < 0.25 minor drift watch — predictions may be drifting
    PSI ≥ 0.25        major drift act  — consider retraining the champion

Drift is informational: it never blocks a prediction run, it flags it.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

# Industry-standard PSI bands.
PSI_MINOR_THRESHOLD = 0.10
PSI_MAJOR_THRESHOLD = 0.25
# Escalate the WHOLE run to "major_drift" only when at least this many features
# cross the major band. With ~24–27 correlated usage features, a single noisy
# feature crossing 0.25 should not flip every scored customer to PARTIAL — that
# reads as "the model is stale" when it isn't. One major feature still surfaces
# as "minor_drift" (a soft warning), so nothing is hidden.
MAJOR_DRIFT_MIN_FEATURES = 2
DEFAULT_BIN_COUNT = 10
# Laplace smoothing so an empty bin never yields div-by-zero / log(0) in PSI.
_EPSILON = 1e-6


def build_feature_baseline(
    feature_df: pd.DataFrame,
    feature_names: list[str],
    cutoff_date: pd.Timestamp,
    *,
    bin_count: int = DEFAULT_BIN_COUNT,
) -> dict[str, Any]:
    """Snapshot the training feature distribution for later PSI comparison.

    Bin edges are quantile-based on the training split (robust to skew/outliers
    that dominate this dataset). Features with too few distinct values fall back
    to a single bin and are reported as constant rather than drifting.
    """

    features: dict[str, Any] = {}
    for name in feature_names:
        values = pd.to_numeric(feature_df[name], errors="coerce").dropna().to_numpy()
        edges = _quantile_edges(values, bin_count)
        proportions = (
            _bin_proportions(values, edges) if edges is not None else None
        )
        features[name] = {
            "bin_edges": edges.tolist() if edges is not None else None,
            "train_proportions": proportions.tolist() if proportions is not None else None,
            "mean": _round(np.mean(values)) if values.size else None,
            "std": _round(np.std(values)) if values.size else None,
            "p50": _round(np.quantile(values, 0.50)) if values.size else None,
            "p95": _round(np.quantile(values, 0.95)) if values.size else None,
        }

    return {
        "method": "PSI",
        "cutoff_date": str(pd.Timestamp(cutoff_date).date()),
        "n_rows": int(len(feature_df)),
        "bin_count": bin_count,
        "features": features,
    }


def compute_feature_drift(
    feature_df: pd.DataFrame,
    baseline: dict[str, Any],
    *,
    model_type: str,
) -> dict[str, Any]:
    """Score PSI for each baseline feature against the live prediction features."""

    baseline_features: dict[str, Any] = baseline.get("features", {})
    per_feature: list[dict[str, Any]] = []
    minor = major = 0

    for name, spec in baseline_features.items():
        edges = spec.get("bin_edges")
        train_proportions = spec.get("train_proportions")
        if name not in feature_df.columns:
            per_feature.append({"feature": name, "psi": None, "status": "missing"})
            continue
        if not edges or not train_proportions:
            per_feature.append({"feature": name, "psi": 0.0, "status": "constant"})
            continue

        values = pd.to_numeric(feature_df[name], errors="coerce").dropna().to_numpy()
        edges_arr = np.asarray(edges, dtype=float)
        expected = np.asarray(train_proportions, dtype=float)
        actual = _bin_proportions(values, edges_arr) if values.size else np.zeros_like(expected)

        psi = _psi(expected, actual)
        status = _classify(psi)
        if status == "minor_drift":
            minor += 1
        elif status == "major_drift":
            major += 1
        per_feature.append(
            {
                "feature": name,
                "psi": _round(psi),
                "status": status,
                "live_mean": _round(np.mean(values)) if values.size else None,
                "train_mean": spec.get("mean"),
            }
        )

    per_feature.sort(key=lambda row: (row["psi"] is None, -(row["psi"] or 0.0)))
    if major >= MAJOR_DRIFT_MIN_FEATURES:
        overall = "major_drift"
    elif minor or major:
        # A single major-PSI feature still warrants a soft warning, not silence.
        overall = "minor_drift"
    else:
        overall = "stable"

    return {
        "method": "PSI",
        "model_type": model_type,
        "baseline_cutoff": baseline.get("cutoff_date"),
        "n_baseline_rows": baseline.get("n_rows"),
        "n_scored_rows": int(len(feature_df)),
        "thresholds": {"minor": PSI_MINOR_THRESHOLD, "major": PSI_MAJOR_THRESHOLD},
        "overall_status": overall,
        "minor_drift_count": minor,
        "major_drift_count": major,
        "features": per_feature,
    }


def drift_report_status(drift: dict[str, Any]) -> str:
    """Map a drift result to a ValidationReport status (never blocking)."""

    return "passed" if drift.get("overall_status") == "stable" else "warning"


def drift_anomalies(drift: dict[str, Any]) -> list[dict[str, Any]]:
    """Surface only the features that actually drifted, worst first."""

    return [
        {
            "feature": row["feature"],
            "psi": row["psi"],
            "status": row["status"],
            "message": f"{row['feature']} PSI={row['psi']} ({row['status']})",
        }
        for row in drift.get("features", [])
        if row.get("status") in ("minor_drift", "major_drift")
    ]


def _quantile_edges(values: np.ndarray, bin_count: int) -> np.ndarray | None:
    """Quantile bin edges with open ends; None when the feature is ~constant."""

    if values.size < bin_count:
        return None
    quantiles = np.linspace(0.0, 1.0, bin_count + 1)
    edges = np.unique(np.quantile(values, quantiles))
    if edges.size < 3:  # not enough distinct values to form meaningful bins
        return None
    edges = edges.astype(float)
    edges[0] = -np.inf
    edges[-1] = np.inf
    return edges


def _bin_proportions(values: np.ndarray, edges: np.ndarray) -> np.ndarray:
    counts, _ = np.histogram(values, bins=edges)
    total = counts.sum()
    if total == 0:
        return np.full(len(counts), 1.0 / len(counts))
    return counts / total


def _psi(expected: np.ndarray, actual: np.ndarray) -> float:
    expected = expected + _EPSILON
    actual = actual + _EPSILON
    return float(np.sum((actual - expected) * np.log(actual / expected)))


def _classify(psi: float) -> str:
    if psi >= PSI_MAJOR_THRESHOLD:
        return "major_drift"
    if psi >= PSI_MINOR_THRESHOLD:
        return "minor_drift"
    return "stable"


def _round(value: Any) -> float | None:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    return round(float(value), 4)
