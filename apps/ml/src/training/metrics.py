"""Evaluation metrics for the ML v2 training pipeline (TRAINING-PIPELINE §11).

Metric key names are part of the API contract — the Model Performance page
renders `metrics_json` records directly (see apps/web/src/mocks/ml.ts and
apps/web/src/features/model-performance/metricInfo.ts). Do not rename keys.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    f1_score,
    mean_absolute_error,
    precision_score,
    recall_score,
    roc_auc_score,
)


# ── Churn (binary classification) ────────────────────────────────


def churn_metrics(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    *,
    threshold: float,
    ranking_scores: np.ndarray | None = None,
) -> dict[str, float]:
    """All churn metrics at a given operating threshold.

    `y_prob` must be the calibrated probabilities (Brier/ECE/threshold
    metrics). Pass the model's RAW scores as `ranking_scores` for the ranking
    metrics — isotonic calibration flattens scores into plateaus and the
    resulting ties artificially depress PR-AUC/lift, which would make the
    candidate look worse than the uncalibrated baselines it is gated against.
    """

    y_true = np.asarray(y_true, dtype=int)
    y_prob = np.asarray(y_prob, dtype=float)
    ranking = y_prob if ranking_scores is None else np.asarray(ranking_scores, dtype=float)
    y_pred = (y_prob >= threshold).astype(int)

    return {
        "pr_auc": float(average_precision_score(y_true, ranking)),
        "roc_auc": float(roc_auc_score(y_true, ranking)) if len(np.unique(y_true)) > 1 else float("nan"),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "recall_at_top10pct": recall_at_top_k(y_true, ranking, 0.10),
        "lift_at_top10pct": lift_at_top_k(y_true, ranking, 0.10),
        "brier": float(brier_score_loss(y_true, np.clip(y_prob, 0.0, 1.0))),
        "ece": expected_calibration_error(y_true, y_prob),
        "threshold": float(threshold),
        "positive_rate": float(y_true.mean()),
        "n": int(len(y_true)),
    }


def recall_at_top_k(y_true: np.ndarray, y_prob: np.ndarray, top_frac: float) -> float:
    """Share of all true positives captured in the top `top_frac` of scores."""

    y_true = np.asarray(y_true, dtype=int)
    n_top = max(1, int(np.ceil(len(y_true) * top_frac)))
    top_idx = np.argsort(-np.asarray(y_prob, dtype=float))[:n_top]
    total_pos = y_true.sum()
    if total_pos == 0:
        return 0.0
    return float(y_true[top_idx].sum() / total_pos)


def lift_at_top_k(y_true: np.ndarray, y_prob: np.ndarray, top_frac: float) -> float:
    """Positive density in the top `top_frac` vs the overall base rate."""

    y_true = np.asarray(y_true, dtype=int)
    base_rate = y_true.mean()
    if base_rate == 0:
        return 0.0
    n_top = max(1, int(np.ceil(len(y_true) * top_frac)))
    top_idx = np.argsort(-np.asarray(y_prob, dtype=float))[:n_top]
    return float(y_true[top_idx].mean() / base_rate)


def expected_calibration_error(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    n_bins: int = 10,
) -> float:
    """ECE with equal-width probability bins (TRAINING §10)."""

    y_true = np.asarray(y_true, dtype=float)
    y_prob = np.clip(np.asarray(y_prob, dtype=float), 0.0, 1.0)
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    bin_ids = np.clip(np.digitize(y_prob, bins[1:-1]), 0, n_bins - 1)
    ece = 0.0
    for b in range(n_bins):
        mask = bin_ids == b
        if not mask.any():
            continue
        ece += (mask.mean()) * abs(y_true[mask].mean() - y_prob[mask].mean())
    return float(ece)


def calibration_curve_points(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    n_bins: int = 10,
) -> dict[str, Any]:
    """Calibration curve persisted to `ml_model_evaluations.calibration_json`."""

    y_true = np.asarray(y_true, dtype=float)
    y_prob = np.clip(np.asarray(y_prob, dtype=float), 0.0, 1.0)
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    bin_ids = np.clip(np.digitize(y_prob, bins[1:-1]), 0, n_bins - 1)
    prob_pred: list[float] = []
    prob_true: list[float] = []
    for b in range(n_bins):
        mask = bin_ids == b
        if not mask.any():
            continue
        prob_pred.append(round(float(y_prob[mask].mean()), 4))
        prob_true.append(round(float(y_true[mask].mean()), 4))
    return {
        "prob_pred": prob_pred,
        "prob_true": prob_true,
        "ece": round(expected_calibration_error(y_true, y_prob, n_bins), 4),
    }


def confusion_at_threshold(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    threshold: float,
) -> dict[str, float]:
    y_true = np.asarray(y_true, dtype=int)
    y_pred = (np.asarray(y_prob, dtype=float) >= threshold).astype(int)
    return {
        "tp": int(((y_pred == 1) & (y_true == 1)).sum()),
        "fp": int(((y_pred == 1) & (y_true == 0)).sum()),
        "fn": int(((y_pred == 0) & (y_true == 1)).sum()),
        "tn": int(((y_pred == 0) & (y_true == 0)).sum()),
        "threshold": round(float(threshold), 4),
    }


def lift_table(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    n_deciles: int = 10,
    keep_top: int = 5,
) -> list[dict[str, float]]:
    """Decile lift table (top `keep_top` deciles) for the Model Performance page."""

    y_true = np.asarray(y_true, dtype=int)
    order = np.argsort(-np.asarray(y_prob, dtype=float))
    sorted_true = y_true[order]
    total_pos = max(1, int(y_true.sum()))
    base_rate = max(y_true.mean(), 1e-12)
    rows: list[dict[str, float]] = []
    splits = np.array_split(sorted_true, n_deciles)
    for decile, chunk in enumerate(splits[:keep_top], start=1):
        if len(chunk) == 0:
            continue
        rows.append(
            {
                "decile": decile,
                "share_of_churners": round(float(chunk.sum() / total_pos), 4),
                "lift": round(float(chunk.mean() / base_rate), 2),
            }
        )
    return rows


def select_threshold_max_fbeta(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    beta: float = 2.0,
) -> float:
    """Sweep thresholds on validation and pick max F-beta (TRAINING §13)."""

    y_true = np.asarray(y_true, dtype=int)
    y_prob = np.asarray(y_prob, dtype=float)
    best_threshold, best_score = 0.5, -1.0
    for threshold in np.unique(np.round(np.quantile(y_prob, np.linspace(0.02, 0.98, 97)), 4)):
        y_pred = (y_prob >= threshold).astype(int)
        precision = precision_score(y_true, y_pred, zero_division=0)
        recall = recall_score(y_true, y_pred, zero_division=0)
        denom = (beta**2) * precision + recall
        fbeta = 0.0 if denom == 0 else (1 + beta**2) * precision * recall / denom
        if fbeta > best_score:
            best_score, best_threshold = fbeta, float(threshold)
    return best_threshold


def risk_thresholds_from_high(high_threshold: float) -> dict[str, float]:
    """Derive the 4-level risk bands around the F2-optimal "high" line (§13)."""

    high = float(np.clip(high_threshold, 0.05, 0.95))
    medium = round(high * 0.5, 2)
    critical = round(high + 0.6 * (1.0 - high), 2)
    return {"medium": medium, "high": round(high, 2), "critical": critical}


# ── CLV (regression + ranking) ───────────────────────────────────


def clv_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    corr = spearmanr(y_true, y_pred).statistic if len(y_true) > 2 else float("nan")
    return {
        "spearman": round(float(0.0 if np.isnan(corr) else corr), 4),
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 2),
        "rmse": round(float(np.sqrt(np.mean((y_true - y_pred) ** 2))), 2),
        "smape": round(smape(y_true, y_pred), 4),
        "top_decile_capture": round(top_decile_capture(y_true, y_pred), 4),
        "n": int(len(y_true)),
    }


def smape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denom = (np.abs(y_true) + np.abs(y_pred)).clip(min=1e-9)
    return float(np.mean(2.0 * np.abs(y_pred - y_true) / denom))


def top_decile_capture(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Share of total actual revenue captured by the model's top 10% customers."""

    y_true = np.asarray(y_true, dtype=float)
    total = y_true.sum()
    if total <= 0:
        return 0.0
    n_top = max(1, int(np.ceil(len(y_true) * 0.10)))
    top_idx = np.argsort(-np.asarray(y_pred, dtype=float))[:n_top]
    return float(y_true[top_idx].sum() / total)


# ── Credit forecast (quantile regression) ────────────────────────


def pinball_loss(y_true: np.ndarray, y_pred: np.ndarray, alpha: float) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    diff = y_true - y_pred
    return float(np.mean(np.maximum(alpha * diff, (alpha - 1) * diff)))


def interval_coverage(y_true: np.ndarray, lower: np.ndarray, upper: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    return float(np.mean((y_true >= np.asarray(lower)) & (y_true <= np.asarray(upper))))


def credit_metrics(
    y_true_30d: np.ndarray,
    pred_30d: dict[float, np.ndarray],
    y_true_90d: np.ndarray,
    pred_90d: dict[float, np.ndarray],
) -> dict[str, float]:
    """Credit forecast metrics; `pred_*` maps quantile alpha → predictions."""

    coverage_30 = interval_coverage(y_true_30d, pred_30d[0.10], pred_30d[0.90])
    coverage_90 = interval_coverage(y_true_90d, pred_90d[0.10], pred_90d[0.90])
    return {
        "mae_30d": round(float(mean_absolute_error(y_true_30d, pred_30d[0.50])), 2),
        "smape_30d": round(smape(y_true_30d, pred_30d[0.50]), 4),
        "mae_90d": round(float(mean_absolute_error(y_true_90d, pred_90d[0.50])), 2),
        "smape_90d": round(smape(y_true_90d, pred_90d[0.50]), 4),
        "coverage_p10_p90": round(float((coverage_30 + coverage_90) / 2.0), 4),
        "coverage_p10_p90_30d": round(coverage_30, 4),
        "coverage_p10_p90_90d": round(coverage_90, 4),
        "pinball_p50_30d": round(pinball_loss(y_true_30d, pred_30d[0.50], 0.50), 2),
        "pinball_p50_90d": round(pinball_loss(y_true_90d, pred_90d[0.50], 0.50), 2),
        "n": int(len(y_true_30d)),
    }


def round_metrics(metrics: dict[str, float], digits: int = 4) -> dict[str, float]:
    rounded: dict[str, float] = {}
    for key, value in metrics.items():
        if isinstance(value, float) and not np.isnan(value):
            rounded[key] = round(value, digits)
        elif isinstance(value, float) and np.isnan(value):
            rounded[key] = 0.0
        else:
            rounded[key] = value
    return rounded
