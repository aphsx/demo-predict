"""Evaluation metrics for the ML v2 training pipeline (TRAINING-PIPELINE §11).

Metric key names are part of the API contract — the Model Performance page
renders `metrics_json` records directly (see apps/web/src/mocks/ml.ts and
apps/web/src/features/model-performance/metricInfo.ts). Do not rename keys.

Gold-standard extensions (additive — no existing key is removed):
  log_loss            Binary cross-entropy (threshold-free calibration)
  bss                 Brier Skill Score: 1 - Brier/Brier_ref (base-rate climatology).
                      > 0 = beats naive; 1 = perfect; < 0 = worse than trivial.
  mce                 Maximum Calibration Error: worst-case bin (complements ECE).
  recall_at_top{5,20}pct / lift_at_top{5,20}pct   Additional decile coverage.

Separate statistical functions (not stored in metrics_json):
  hosmer_lemeshow_test  Chi-squared goodness-of-fit for calibration.
  bootstrap_ci          Percentile bootstrap 95% CI for all churn_metrics keys.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import chi2 as chi2_dist
from scipy.stats import spearmanr
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    f1_score,
    log_loss,
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

    brier = float(brier_score_loss(y_true, np.clip(y_prob, 0.0, 1.0)))
    base_rate = float(y_true.mean())
    brier_ref = base_rate * (1.0 - base_rate)  # climatological Brier score

    return {
        # ── Existing keys (API contract — never rename or remove) ──
        "pr_auc": float(average_precision_score(y_true, ranking)),
        "roc_auc": float(roc_auc_score(y_true, ranking)) if len(np.unique(y_true)) > 1 else float("nan"),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "recall_at_top10pct": recall_at_top_k(y_true, ranking, 0.10),
        "lift_at_top10pct": lift_at_top_k(y_true, ranking, 0.10),
        "brier": brier,
        "ece": expected_calibration_error(y_true, y_prob),
        "threshold": float(threshold),
        "positive_rate": base_rate,
        "n": int(len(y_true)),
        # ── Gold-standard additions ────────────────────────────────
        "log_loss": float(log_loss(y_true, np.clip(y_prob, 1e-15, 1 - 1e-15))),
        "bss": float(1.0 - brier / brier_ref) if brier_ref > 0 else 0.0,
        "mce": maximum_calibration_error(y_true, y_prob),
        "recall_at_top5pct": recall_at_top_k(y_true, ranking, 0.05),
        "recall_at_top20pct": recall_at_top_k(y_true, ranking, 0.20),
        "lift_at_top5pct": lift_at_top_k(y_true, ranking, 0.05),
        "lift_at_top20pct": lift_at_top_k(y_true, ranking, 0.20),
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


def maximum_calibration_error(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    n_bins: int = 10,
) -> float:
    """Worst-case bin-level calibration error (equal-width bins).

    Complements ECE: ECE averages calibration error weighted by bin population;
    MCE surfaces the single most dangerous miscalibrated region, which a small
    ECE can hide when that region is sparsely populated.
    """
    y_true = np.asarray(y_true, dtype=float)
    y_prob = np.clip(np.asarray(y_prob, dtype=float), 0.0, 1.0)
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    bin_ids = np.clip(np.digitize(y_prob, bins[1:-1]), 0, n_bins - 1)
    mce = 0.0
    for b in range(n_bins):
        mask = bin_ids == b
        if not mask.any():
            continue
        mce = max(mce, abs(y_true[mask].mean() - y_prob[mask].mean()))
    return float(mce)


def hosmer_lemeshow_test(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    n_groups: int = 10,
) -> dict[str, float]:
    """Hosmer-Lemeshow chi-squared goodness-of-fit test for calibration.

    Null hypothesis: predicted probabilities match observed event rates.

    Returns:
        statistic  Chi-squared HL statistic (lower = better fit)
        p_value    Probability under chi-sq(df=n_groups-2).
                   p > 0.05 → fail to reject H0 (calibration adequate)
                   p ≤ 0.05 → reject H0 (significant miscalibration)
        df         Degrees of freedom (n_groups - 2)

    Caution: with n > 10,000 the test has very high power and rejects even
    trivially small miscalibrations. Interpret p_value as a continuous
    diagnostic rather than a binary gate at large sample sizes.
    """
    y_true = np.asarray(y_true, dtype=float)
    y_prob = np.clip(np.asarray(y_prob, dtype=float), 1e-10, 1 - 1e-10)

    order = np.argsort(y_prob)
    y_true_s = y_true[order]
    y_prob_s = y_prob[order]
    groups = np.array_split(np.arange(len(y_true)), n_groups)

    hl_stat = 0.0
    for idx in groups:
        if len(idx) == 0:
            continue
        n_g = len(idx)
        o_g = float(y_true_s[idx].sum())
        e_g = float(y_prob_s[idx].sum())
        pi_g = e_g / n_g
        denom = n_g * pi_g * (1.0 - pi_g)
        if denom < 1e-10:
            continue
        hl_stat += (o_g - e_g) ** 2 / denom

    df = n_groups - 2
    p_value = float(1.0 - chi2_dist.cdf(hl_stat, df))
    return {"statistic": round(float(hl_stat), 4), "p_value": round(p_value, 4), "df": df}


def bootstrap_ci(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    *,
    threshold: float,
    ranking_scores: np.ndarray | None = None,
    n_boot: int = 1000,
    alpha: float = 0.05,
    seed: int = 42,
) -> dict[str, dict[str, float]]:
    """Percentile bootstrap confidence intervals for all churn_metrics keys.

    Samples with replacement n_boot times and collects each metric's sampling
    distribution. Returns the alpha/2 and 1-alpha/2 percentiles as CI bounds.
    Valid for n ≥ 500; for smaller holdouts consider BCa correction.

    Degenerate bootstrap samples (only one class present) are discarded.
    Keys excluded from CI: n, threshold, positive_rate (not random quantities).

    Returns:
        {metric: {"ci_lower": float, "ci_upper": float, "n_boot_valid": int}}
    """
    y_true = np.asarray(y_true, dtype=int)
    y_prob = np.asarray(y_prob, dtype=float)
    ranking = y_prob if ranking_scores is None else np.asarray(ranking_scores, dtype=float)

    rng = np.random.default_rng(seed)
    n = len(y_true)
    SKIP = {"n", "threshold", "positive_rate"}

    boot_dist: dict[str, list[float]] = {}
    for _ in range(n_boot):
        idx = rng.integers(0, n, size=n)
        bt = y_true[idx]
        bp = y_prob[idx]
        br = ranking[idx]
        if bt.sum() == 0 or (bt == 0).sum() == 0:
            continue
        m = churn_metrics(bt, bp, threshold=threshold, ranking_scores=br)
        for k, v in m.items():
            if k in SKIP:
                continue
            if isinstance(v, (int, float)) and not (isinstance(v, float) and np.isnan(v)):
                boot_dist.setdefault(k, []).append(float(v))

    lo_pct = alpha / 2 * 100
    hi_pct = (1.0 - alpha / 2) * 100
    return {
        k: {
            "ci_lower": round(float(np.percentile(vals, lo_pct)), 4),
            "ci_upper": round(float(np.percentile(vals, hi_pct)), 4),
            "n_boot_valid": len(vals),
        }
        for k, vals in boot_dist.items()
        if len(vals) >= 10
    }


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
        "rmsle": round(rmsle(y_true, y_pred), 4),
        "smape": round(smape(y_true, y_pred), 4),
        "top_decile_capture": round(top_decile_capture(y_true, y_pred), 4),
        "n": int(len(y_true)),
    }


def rmsle(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Root Mean Squared Log Error — scale-invariant, penalises under-prediction less for zeros."""
    y_true = np.clip(np.asarray(y_true, dtype=float), 0.0, None)
    y_pred = np.clip(np.asarray(y_pred, dtype=float), 0.0, None)
    return float(np.sqrt(np.mean((np.log1p(y_pred) - np.log1p(y_true)) ** 2)))


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


def winkler_score(
    y_true: np.ndarray,
    lower: np.ndarray,
    upper: np.ndarray,
    alpha: float = 0.20,
) -> float:
    """Mean Winkler score for a (1-alpha) prediction interval (proper scoring rule).

    = interval width  when y ∈ [lo, hi]
    = interval width + (2/alpha) × |violation|  when y is outside
    Lower is better: rewards narrow intervals that contain the truth.
    Reference: Winkler (1972) "A Decision-Theoretic Approach to Interval Estimation".
    """
    y_true = np.asarray(y_true, dtype=float)
    lower = np.asarray(lower, dtype=float)
    upper = np.asarray(upper, dtype=float)
    width = upper - lower
    penalty = (2.0 / alpha) * (np.maximum(0.0, lower - y_true) + np.maximum(0.0, y_true - upper))
    return float(np.mean(width + penalty))


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
        "winkler_p10_p90_30d": round(winkler_score(y_true_30d, pred_30d[0.10], pred_30d[0.90]), 2),
        "winkler_p10_p90_90d": round(winkler_score(y_true_90d, pred_90d[0.10], pred_90d[0.90]), 2),
        "pinball_composite_30d": round(
            float(np.mean([pinball_loss(y_true_30d, pred_30d[q], q) for q in (0.10, 0.25, 0.50, 0.75, 0.90)])), 2
        ),
        "pinball_composite_90d": round(
            float(np.mean([pinball_loss(y_true_90d, pred_90d[q], q) for q in (0.10, 0.25, 0.50, 0.75, 0.90)])), 2
        ),
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
