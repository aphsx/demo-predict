"""Baseline scorers (TRAINING-PIPELINE §12).

Every baseline is evaluated with the exact same harness as the candidates and
persisted to `ml_model_evaluations` with `baseline_name`. A candidate that
cannot beat these on the primary metric is never promoted.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from src.training.preprocessing import PreprocessorConfig, transform_features

CHURN_BASELINE_NAMES = ["recency_rule_90d", "rfm_quartile", "logistic_regression"]
CLV_BASELINE_NAMES = ["segment_mean", "revenue_180d_carryover"]
CREDIT_BASELINE_NAMES = ["last_30d_carryover", "moving_avg_90d"]


# ── Churn baselines (score = churn-likelihood ranking) ───────────


def churn_recency_rule_scores(features: pd.DataFrame) -> np.ndarray:
    """Rule: the longer since last activity, the more churn-like (90d rule)."""

    days = pd.to_numeric(features["days_since_last_activity"], errors="coerce").fillna(180.0)
    return np.clip(days / 180.0, 0.0, 1.0).to_numpy()


def churn_rfm_quartile_scores(features: pd.DataFrame) -> np.ndarray:
    """RFM-style rank score: stale + infrequent + low-spend → high churn score."""

    recency = pd.to_numeric(features["days_since_last_payment"], errors="coerce").fillna(365.0)
    frequency = pd.to_numeric(features["payment_count_180d"], errors="coerce").fillna(0.0)
    monetary = pd.to_numeric(features["total_revenue_180d"], errors="coerce").fillna(0.0)
    score = (
        recency.rank(pct=True)
        + (-frequency).rank(pct=True)
        + (-monetary).rank(pct=True)
    ) / 3.0
    return score.to_numpy()


class ChurnLogisticBaseline:
    """Plain logistic regression on the preprocessed Tier A features."""

    def __init__(self, preprocessor: PreprocessorConfig):
        self.preprocessor = preprocessor
        self.model = LogisticRegression(max_iter=2000, class_weight="balanced")

    def fit(self, features_train: pd.DataFrame, y_train: pd.Series) -> "ChurnLogisticBaseline":
        x_train = transform_features(features_train, self.preprocessor)
        self.model.fit(x_train, np.asarray(y_train, dtype=int))
        return self

    def predict_proba(self, features: pd.DataFrame) -> np.ndarray:
        x = transform_features(features, self.preprocessor)
        return self.model.predict_proba(x)[:, 1]


# ── CLV baselines ────────────────────────────────────────────────


class ClvSegmentMeanBaseline:
    """Predict the mean future revenue of the customer's past-revenue quartile.

    Segment statistics are learned on the train split only.
    """

    def __init__(self) -> None:
        self.bin_edges: np.ndarray | None = None
        self.segment_means: dict[int, float] = {}
        self.global_mean = 0.0

    def fit(self, features_train: pd.DataFrame, y_train: pd.Series) -> "ClvSegmentMeanBaseline":
        past = pd.to_numeric(features_train["total_revenue_180d"], errors="coerce").fillna(0.0)
        y = pd.to_numeric(y_train, errors="coerce").fillna(0.0)
        positive_edges = np.unique(np.quantile(past[past > 0], [0.25, 0.5, 0.75])) if (past > 0).any() else np.array([])
        self.bin_edges = positive_edges
        segments = self._segment(past)
        means = y.groupby(segments).mean()
        self.segment_means = {int(seg): float(mean) for seg, mean in means.items()}
        self.global_mean = float(y.mean())
        return self

    def predict(self, features: pd.DataFrame) -> np.ndarray:
        past = pd.to_numeric(features["total_revenue_180d"], errors="coerce").fillna(0.0)
        segments = self._segment(past)
        return segments.map(lambda seg: self.segment_means.get(int(seg), self.global_mean)).to_numpy()

    def _segment(self, past: pd.Series) -> pd.Series:
        if self.bin_edges is None or len(self.bin_edges) == 0:
            return pd.Series(np.zeros(len(past), dtype=int), index=past.index)
        segments = np.digitize(past, self.bin_edges) + 1
        segments[past <= 0] = 0
        return pd.Series(segments, index=past.index)


def clv_carryover_scores(features: pd.DataFrame) -> np.ndarray:
    """Assume the next 180 days repeat the last 180 days of revenue."""

    return pd.to_numeric(features["total_revenue_180d"], errors="coerce").fillna(0.0).to_numpy()


# ── Credit baselines (point forecast of future usage) ───────────


def credit_last_30d_carryover(features: pd.DataFrame, horizon_days: int) -> np.ndarray:
    """Use last-90d usage scaled to a 30-day month, carried over the horizon."""

    monthly = pd.to_numeric(features["usage_recent_90d"], errors="coerce").fillna(0.0) / 3.0
    return (monthly * (horizon_days / 30.0)).to_numpy()


def credit_moving_avg_90d(features: pd.DataFrame, horizon_days: int) -> np.ndarray:
    """Average monthly usage over the last 180 days, scaled to the horizon."""

    monthly = pd.to_numeric(features["usage_total_180d"], errors="coerce").fillna(0.0) / 6.0
    return (monthly * (horizon_days / 30.0)).to_numpy()
