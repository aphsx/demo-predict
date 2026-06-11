"""Post-training leakage test suite (TRAINING-PIPELINE §5.2).

Runs automatically after every training — the AUC-based suite for churn and
the rank-correlation suite for the regression models (CLV / credit). Any hard
failure blocks promotion. Results are persisted to
`ml_data_validation_reports` with `validation_type='leakage'` by the runner.
"""

from __future__ import annotations

import logging
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
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

# Regression suite (CLV / credit). Monthly usage is highly persistent, so a
# single carryover-style feature can legitimately rank the future target very
# well — the single-feature scan therefore warns instead of failing, with a
# higher limit. Target shuffle has no such excuse: a model fit on permuted
# labels that still ranks the real future is reading post-cutoff data.
SINGLE_FEATURE_SPEARMAN_LIMIT = 0.95
SHUFFLE_SPEARMAN_TOLERANCE = 0.10
SHUFFLE_ROUNDS = 5
REGRESSION_SANITY_LIMIT = 0.97

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
    # Early-stop against shuffled validation labels — stopping on the real
    # ones would pick the round that happens to fit them and bias the test.
    # A single shuffled fit is still a smooth function of features that
    # genuinely correlate with the label, so one draw's AUC has a wide null
    # (observed up to ~0.66 on this data). The leak signature is AUC above
    # 0.5 that survives EVERY permutation; chance alignment flips direction
    # per draw — test the lower confidence bound of the mean deviation.
    rng = np.random.default_rng(RANDOM_SEED)
    aucs: list[float] = []
    for _ in range(SHUFFLE_ROUNDS):
        shuffled = rng.permutation(y_train)
        model = clone_candidate_model(champion, shuffled)
        model = _fit_quiet(model, x_train, shuffled, x_val, rng.permutation(y_val))
        aucs.append(float(roc_auc_score(y_val, model.predict_proba(x_val)[:, 1])))
    deviations = np.asarray(aucs) - 0.5
    mean_dev = float(deviations.mean())
    std_err = float(deviations.std(ddof=1) / np.sqrt(len(deviations)))
    lower_bound = mean_dev - 2.0 * std_err
    # One-sided: pipeline leakage shows up as the shuffled model STILL scoring
    # well. AUC below 0.5 is chance anti-correlation, not leakage.
    passed = lower_bound <= SHUFFLE_AUC_TOLERANCE
    return {
        "name": "target_shuffle",
        "passed": passed,
        "severity": "fail",
        "message": (
            f"shuffled-label AUC deviation mean = {mean_dev:+.4f} "
            f"(LCB {lower_bound:+.4f}) over {SHUFFLE_ROUNDS} shuffles "
            f"(leak ถ้า LCB > {SHUFFLE_AUC_TOLERANCE})"
        ),
        "details": {
            "mean_auc": round(float(np.mean(aucs)), 4),
            "lower_confidence_bound": round(lower_bound, 4),
            "per_shuffle_auc": [round(a, 4) for a in aucs],
        },
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


# ── Regression suite (CLV / credit) ──────────────────────────────


def run_regression_leakage_suite(
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
    label_columns: list[str],
) -> dict[str, Any]:
    """§5.2 suite for the regression models; returns {passed, checks: [...]}.

    Mirrors the churn suite with Spearman in place of AUC. Runs once per label
    column (credit has two horizons). Split contamination is label-independent
    and runs once.
    """

    x_train = transform_features(dataset.features("train"), preprocessor)
    x_val = transform_features(dataset.features("validation"), preprocessor)

    checks: list[dict[str, Any]] = [_split_contamination(dataset)]
    for column in label_columns:
        y_train = _numeric_labels(dataset, "train", column)
        y_val = _numeric_labels(dataset, "validation", column)
        reference = _fit_quiet(_reference_regressor(), x_train, y_train, x_val, y_val)
        reference_spearman = _abs_spearman(y_val, reference.predict(x_val))
        checks.extend(
            [
                _single_feature_spearman_scan(x_val, y_val, column),
                _regression_target_shuffle(x_train, y_train, x_val, y_val, column),
                _regression_score_sanity(reference_spearman, column),
            ]
        )
    hard_failures = [c for c in checks if not c["passed"] and c["severity"] == "fail"]
    return {
        "passed": len(hard_failures) == 0,
        "checks": checks,
    }


def _single_feature_spearman_scan(
    x_val: pd.DataFrame,
    y_val: np.ndarray,
    label_column: str,
) -> dict[str, Any]:
    per_feature = {
        feature: round(_abs_spearman(y_val, x_val[feature].to_numpy()), 4)
        for feature in x_val.columns
    }
    worst_feature = max(per_feature, key=per_feature.get)
    worst = per_feature[worst_feature]
    return {
        "name": f"single_feature_spearman_scan[{label_column}]",
        "passed": worst <= SINGLE_FEATURE_SPEARMAN_LIMIT,
        "severity": "warn",  # persistence can be legitimately strong — investigate, don't block
        "message": (
            f"max single-feature |spearman| vs {label_column} = {worst} "
            f"({worst_feature}); limit {SINGLE_FEATURE_SPEARMAN_LIMIT}"
        ),
        "details": {"worst_feature": worst_feature, "worst_spearman": worst, "per_feature": per_feature},
    }


def _regression_target_shuffle(
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_val: pd.DataFrame,
    y_val: np.ndarray,
    label_column: str,
) -> dict[str, Any]:
    # Validation labels are shuffled too: early-stopping against the REAL
    # validation labels would pick the boosting round that happens to
    # correlate with them, biasing the test toward false leak alarms.
    #
    # A shuffled model's predictions are still a smooth function of the
    # features, and the features genuinely correlate with the target — so a
    # single draw's |spearman| has a wide, feature-mediated null (observed
    # ±0.3 on this data) and cannot be thresholded directly. The leak
    # signature is rank-recovery that survives EVERY permutation with a
    # consistent positive sign; chance alignment flips sign per draw. Test
    # the one-sided lower confidence bound of the signed mean instead.
    rng = np.random.default_rng(RANDOM_SEED)
    correlations = []
    for _ in range(SHUFFLE_ROUNDS):
        shuffled_train = rng.permutation(y_train)
        shuffled_val = rng.permutation(y_val)
        model = _fit_quiet(_reference_regressor(), x_train, shuffled_train, x_val, shuffled_val)
        correlations.append(_signed_spearman(y_val, model.predict(x_val)))
    mean_corr = float(np.mean(correlations))
    std_err = float(np.std(correlations, ddof=1) / np.sqrt(len(correlations)))
    lower_bound = mean_corr - 2.0 * std_err
    passed = lower_bound <= SHUFFLE_SPEARMAN_TOLERANCE
    return {
        "name": f"target_shuffle[{label_column}]",
        "passed": passed,
        "severity": "fail",
        "message": (
            f"shuffled-label signed spearman mean = {mean_corr:+.4f} "
            f"(LCB {lower_bound:+.4f}) over {SHUFFLE_ROUNDS} shuffles "
            f"(leak ถ้า LCB > {SHUFFLE_SPEARMAN_TOLERANCE})"
        ),
        "details": {
            "mean_spearman": round(mean_corr, 4),
            "lower_confidence_bound": round(lower_bound, 4),
            "per_shuffle": [round(c, 4) for c in correlations],
        },
    }


def _regression_score_sanity(reference_spearman: float, label_column: str) -> dict[str, Any]:
    suspicious = reference_spearman > REGRESSION_SANITY_LIMIT
    return {
        "name": f"score_sanity[{label_column}]",
        "passed": not suspicious,
        "severity": "warn",  # flags for investigation, does not block (§5.2)
        "message": (
            f"reference-model validation |spearman| {reference_spearman:.4f} "
            + (
                f"> {REGRESSION_SANITY_LIMIT} — unnaturally high, investigate"
                if suspicious
                else "within plausible range"
            )
        ),
        "details": {"validation_spearman": round(reference_spearman, 4)},
    }


def _reference_regressor() -> lgb.LGBMRegressor:
    return lgb.LGBMRegressor(
        n_estimators=300,
        learning_rate=0.05,
        num_leaves=31,
        min_child_samples=20,
        random_state=RANDOM_SEED,
        verbosity=-1,
    )


def _numeric_labels(dataset: SplitFrame, split: str, column: str) -> np.ndarray:
    return (
        pd.to_numeric(dataset.labels(split, column), errors="coerce").fillna(0.0).to_numpy()
    )


def _abs_spearman(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return abs(_signed_spearman(y_true, y_pred))


def _signed_spearman(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    corr = spearmanr(np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float)).statistic
    return 0.0 if corr is None or np.isnan(corr) else float(corr)


def _fit_quiet(model: Any, x_train: pd.DataFrame, y_train: np.ndarray, x_val: pd.DataFrame, y_val: np.ndarray) -> Any:
    if isinstance(model, (lgb.LGBMClassifier, lgb.LGBMRegressor)):
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
