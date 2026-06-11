"""Post-training leakage test suite (TRAINING-PIPELINE §5.2).

Runs automatically after every churn training. Any hard failure blocks
promotion. Results are persisted to `ml_data_validation_reports` with
`validation_type='leakage'` by the runner.
"""

from __future__ import annotations

import logging
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from sklearn.tree import DecisionTreeClassifier

from src.training.churn_trainer import ChurnCandidate, clone_candidate_model
from src.training.datasets import SplitFrame, check_split_contamination
from src.training.preprocessing import PreprocessorConfig, transform_features

logger = logging.getLogger(__name__)

RANDOM_SEED = 42
SINGLE_FEATURE_AUC_LIMIT = 0.90
SHUFFLE_AUC_TOLERANCE = 0.07
SUSPECT_DROP_LIMIT = 0.30
SCORE_SANITY_LIMIT = 0.97

RECENCY_SUSPECTS = [
    "days_since_last_activity",
    "days_since_last_usage",
    "days_since_last_payment",
    "payment_overdue_ratio",
]


def run_leakage_suite(
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
    champion: ChurnCandidate,
    validation_roc_auc: float,
) -> dict[str, Any]:
    """Run all §5.2 tests; returns {passed, checks: [...]}."""

    x_train = transform_features(dataset.features("train"), preprocessor)
    x_val = transform_features(dataset.features("validation"), preprocessor)
    y_train = np.asarray(dataset.labels("train", "churn_label"), dtype=int)
    y_val = np.asarray(dataset.labels("validation", "churn_label"), dtype=int)

    checks = [
        _single_feature_auc_scan(x_train, y_train, x_val, y_val),
        _target_shuffle(champion, x_train, y_train, x_val, y_val),
        _suspect_drop_audit(champion, x_train, y_train, x_val, y_val),
        _split_contamination(dataset),
        _score_sanity(validation_roc_auc),
    ]
    hard_failures = [c for c in checks if not c["passed"] and c["severity"] == "fail"]
    return {
        "passed": len(hard_failures) == 0,
        "checks": checks,
    }


def _single_feature_auc_scan(
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_val: pd.DataFrame,
    y_val: np.ndarray,
) -> dict[str, Any]:
    per_feature: dict[str, float] = {}
    for feature in x_train.columns:
        stump = DecisionTreeClassifier(max_depth=2, random_state=RANDOM_SEED)
        stump.fit(x_train[[feature]], y_train)
        scores = stump.predict_proba(x_val[[feature]])[:, 1]
        try:
            per_feature[feature] = round(float(roc_auc_score(y_val, scores)), 4)
        except ValueError:
            per_feature[feature] = 0.5
    worst_feature = max(per_feature, key=per_feature.get)
    worst_auc = per_feature[worst_feature]
    return {
        "name": "single_feature_auc_scan",
        "passed": worst_auc <= SINGLE_FEATURE_AUC_LIMIT,
        "severity": "fail",
        "message": f"max single-feature AUC = {worst_auc} ({worst_feature}); limit {SINGLE_FEATURE_AUC_LIMIT}",
        "details": {"worst_feature": worst_feature, "worst_auc": worst_auc, "per_feature": per_feature},
    }


def _target_shuffle(
    champion: ChurnCandidate,
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_val: pd.DataFrame,
    y_val: np.ndarray,
) -> dict[str, Any]:
    rng = np.random.default_rng(RANDOM_SEED)
    shuffled = rng.permutation(y_train)
    model = clone_candidate_model(champion, shuffled)
    model = _fit_quiet(model, x_train, shuffled, x_val, y_val)
    auc = float(roc_auc_score(y_val, model.predict_proba(x_val)[:, 1]))
    passed = abs(auc - 0.5) <= SHUFFLE_AUC_TOLERANCE
    return {
        "name": "target_shuffle",
        "passed": passed,
        "severity": "fail",
        "message": f"shuffled-label validation AUC = {auc:.4f} (expected ≈ 0.50 ± {SHUFFLE_AUC_TOLERANCE})",
        "details": {"auc": round(auc, 4)},
    }


def _suspect_drop_audit(
    champion: ChurnCandidate,
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_val: pd.DataFrame,
    y_val: np.ndarray,
) -> dict[str, Any]:
    keep = [c for c in x_train.columns if c not in RECENCY_SUSPECTS]
    full_model = _fit_quiet(clone_candidate_model(champion, y_train), x_train, y_train, x_val, y_val)
    full_auc = float(roc_auc_score(y_val, full_model.predict_proba(x_val)[:, 1]))
    dropped_model = _fit_quiet(
        clone_candidate_model(champion, y_train), x_train[keep], y_train, x_val[keep], y_val
    )
    dropped_auc = float(roc_auc_score(y_val, dropped_model.predict_proba(x_val[keep])[:, 1]))
    drop = full_auc - dropped_auc
    return {
        "name": "suspect_drop_audit",
        "passed": drop <= SUSPECT_DROP_LIMIT,
        "severity": "fail",
        "message": (
            f"AUC {full_auc:.4f} → {dropped_auc:.4f} without recency suspects "
            f"(drop {drop:.4f}; limit {SUSPECT_DROP_LIMIT})"
        ),
        "details": {
            "full_auc": round(full_auc, 4),
            "without_suspects_auc": round(dropped_auc, 4),
            "auc_drop": round(drop, 4),
            "dropped_features": RECENCY_SUSPECTS,
        },
    }


def _split_contamination(dataset: SplitFrame) -> dict[str, Any]:
    report = check_split_contamination(dataset)
    return {
        "name": "split_contamination",
        "passed": bool(report["passed"]),
        "severity": "fail",
        "message": "acc_id sets disjoint across splits" if report["passed"] else f"overlap: {report['overlaps']}",
        "details": report,
    }


def _score_sanity(validation_roc_auc: float) -> dict[str, Any]:
    suspicious = validation_roc_auc > SCORE_SANITY_LIMIT
    return {
        "name": "score_sanity",
        "passed": not suspicious,
        "severity": "warn",  # flags for investigation, does not block (§5.2)
        "message": (
            f"validation ROC-AUC {validation_roc_auc:.4f} "
            + ("> 0.97 — unnaturally high for churn, investigate" if suspicious else "within plausible range")
        ),
        "details": {"validation_roc_auc": round(validation_roc_auc, 4)},
    }


def _fit_quiet(model: Any, x_train: pd.DataFrame, y_train: np.ndarray, x_val: pd.DataFrame, y_val: np.ndarray) -> Any:
    if isinstance(model, lgb.LGBMClassifier):
        model.fit(
            x_train,
            y_train,
            eval_set=[(x_val, y_val)],
            callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)],
        )
    else:
        try:
            model.fit(x_train, y_train, eval_set=[(x_val, y_val)], verbose=False)
        except TypeError:
            model.fit(x_train, y_train)
    return model
