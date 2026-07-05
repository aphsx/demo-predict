"""Realized-outcome metric computations (TRAINING-PIPELINE §15).

Every number here is produced by the SAME metric implementations used at
training time (src/training/metrics.py) — imported, never re-derived — so a
realized PR-AUC is directly comparable with the training-time test PR-AUC of
the same model version.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error

from src.training.metrics import (
    calibration_curve_points,
    churn_metrics,
    clv_metrics,
    confusion_at_threshold,
    interval_coverage,
    lift_table,
    pinball_loss,
    round_metrics,
    smape,
)

# Below this many matched customers a realized metric is noise, not evidence.
MIN_SAMPLES = 20


def realized_churn_metrics(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    threshold: float,
) -> dict[str, Any]:
    """Full churn metric block at the SERVED operating threshold.

    Returns the same evidence shape training persists for a holdout split:
    metrics + confusion matrix + calibration curve + lift table.
    """

    y_true = np.asarray(y_true, dtype=int)
    y_prob = np.asarray(y_prob, dtype=float)
    return {
        "metrics": round_metrics(churn_metrics(y_true, y_prob, threshold=threshold)),
        "confusion_matrix": confusion_at_threshold(y_true, y_prob, threshold),
        "calibration": calibration_curve_points(y_true, y_prob),
        "lift_table": lift_table(y_true, y_prob),
    }


def realized_clv_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    """Realized revenue vs predicted CLV — Spearman/MAE/top-decile capture."""

    return round_metrics(
        clv_metrics(np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float))
    )


def realized_credit_metrics(frames: dict[int, pd.DataFrame]) -> dict[str, float]:
    """Realized credit-usage metrics per elapsed horizon.

    `frames` maps horizon_days → DataFrame with columns:
      y_true  actual usage over the horizon (label definition from labels.py)
      p50     served point forecast (predicted_credit_usage_{h}d)
      p10/p90 served interval bounds (nullable — legacy rows without interval)

    Only p10/p50/p90 are persisted per customer, so realized quantile coverage
    is measured on the p10–p90 band (the trained model's primary metric).
    """

    metrics: dict[str, float] = {}
    coverages: list[float] = []
    for horizon_days, frame in sorted(frames.items()):
        y_true = frame["y_true"].to_numpy(dtype=float)
        p50 = frame["p50"].to_numpy(dtype=float)
        metrics[f"mae_{horizon_days}d"] = float(mean_absolute_error(y_true, p50))
        metrics[f"smape_{horizon_days}d"] = smape(y_true, p50)
        metrics[f"pinball_p50_{horizon_days}d"] = pinball_loss(y_true, p50, 0.50)
        metrics[f"n_{horizon_days}d"] = int(len(frame))

        interval = frame.dropna(subset=["p10", "p90"])
        if len(interval) >= MIN_SAMPLES:
            coverage = interval_coverage(
                interval["y_true"].to_numpy(dtype=float),
                interval["p10"].to_numpy(dtype=float),
                interval["p90"].to_numpy(dtype=float),
            )
            metrics[f"coverage_p10_p90_{horizon_days}d"] = coverage
            coverages.append(coverage)

    if coverages:
        metrics["coverage_p10_p90"] = float(np.mean(coverages))
    metrics["n"] = int(max((len(frame) for frame in frames.values()), default=0))
    return round_metrics(metrics)
