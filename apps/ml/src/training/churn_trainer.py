"""Churn model training (TRAINING-PIPELINE §8–§10, §13).

Candidates: Logistic Regression, Random Forest, LightGBM (Optuna), XGBoost
(Optuna). Selection on validation PR-AUC, calibration fitted on validation
(Platt vs isotonic by Brier), threshold = max-F2 on validation. Test split is
touched once, at the end, for reporting.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable

import lightgbm as lgb
import numpy as np
import optuna
import pandas as pd
import xgboost as xgb
from sklearn.ensemble import RandomForestClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss

from src.training.baselines import (
    ChurnLogisticBaseline,
    churn_recency_rule_scores,
    churn_rfm_quartile_scores,
)
from src.training.datasets import SplitFrame
from src.training.metrics import (
    calibration_curve_points,
    churn_metrics,
    confusion_at_threshold,
    lift_table,
    risk_thresholds_from_high,
    select_threshold_max_fbeta,
)
from src.training.preprocessing import PreprocessorConfig, transform_features

logger = logging.getLogger(__name__)

RANDOM_SEED = 42
LGBM_TRIALS = 100
XGB_TRIALS = 50

optuna.logging.set_verbosity(optuna.logging.WARNING)


@dataclass
class FittedCalibrator:
    """Serializable calibration wrapper (Platt or isotonic)."""

    method: str
    model: Any

    def transform(self, raw_scores: np.ndarray) -> np.ndarray:
        raw_scores = np.asarray(raw_scores, dtype=float)
        if self.method == "platt":
            return self.model.predict_proba(raw_scores.reshape(-1, 1))[:, 1]
        return np.clip(self.model.predict(raw_scores), 0.0, 1.0)


@dataclass
class ChurnCandidate:
    name: str
    model: Any
    params: dict[str, Any]
    validation_pr_auc: float

    def predict_raw(self, x: pd.DataFrame) -> np.ndarray:
        if isinstance(self.model, lgb.LGBMClassifier):
            return self.model.predict_proba(x)[:, 1]
        if isinstance(self.model, xgb.XGBClassifier):
            return self.model.predict_proba(x)[:, 1]
        return self.model.predict_proba(x)[:, 1]


@dataclass
class ChurnTrainResult:
    champion: ChurnCandidate
    calibrator: FittedCalibrator
    thresholds: dict[str, float]
    competition: dict[str, float]
    validation_metrics: dict[str, float]
    test_metrics: dict[str, float]
    calibration_json: dict[str, Any]
    confusion_json: dict[str, float]
    lift_table_json: list[dict[str, float]]
    feature_importance: list[dict[str, Any]]
    baseline_metrics: dict[str, dict[str, dict[str, float]]]
    preprocessor: PreprocessorConfig

    def predict_proba(self, features_raw: pd.DataFrame) -> np.ndarray:
        x = transform_features(features_raw, self.preprocessor)
        return self.calibrator.transform(self.champion.predict_raw(x))


@dataclass
class ChurnTraining:
    """Tuned candidates + cached splits, before champion finalization.

    The runner finalizes candidates in CV order and keeps the first one that
    passes the promotion gate (§8: a tree that cannot decisively beat the
    simple models is not the champion).
    """

    dataset: SplitFrame
    preprocessor: PreprocessorConfig
    candidates: list[ChurnCandidate]  # sorted by CV PR-AUC, best first
    competition: dict[str, float]
    cv_oof: dict[str, np.ndarray]
    x_trval: pd.DataFrame
    y_trval: np.ndarray
    x_test: pd.DataFrame
    y_test: np.ndarray
    y_train: np.ndarray
    y_val: np.ndarray


def train_churn_candidates(
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
    *,
    lgbm_trials: int = LGBM_TRIALS,
    xgb_trials: int = XGB_TRIALS,
    progress: Callable[[str], None] | None = None,
) -> ChurnTraining:
    notify = progress or (lambda message: logger.info(message))

    x_train = transform_features(dataset.features("train"), preprocessor)
    x_val = transform_features(dataset.features("validation"), preprocessor)
    x_test = transform_features(dataset.features("test"), preprocessor)
    y_train = np.asarray(dataset.labels("train", "churn_label"), dtype=int)
    y_val = np.asarray(dataset.labels("validation", "churn_label"), dtype=int)
    y_test = np.asarray(dataset.labels("test", "churn_label"), dtype=int)

    scale_pos_weight = float((y_train == 0).sum() / max(1, (y_train == 1).sum()))

    # ── Candidates (§8): tune hyperparameters on the validation split ──
    notify("churn: training Logistic Regression candidate")
    candidates = [_fit_logistic(x_train, y_train, x_val, y_val)]
    notify("churn: training Random Forest candidate")
    candidates.append(_fit_random_forest(x_train, y_train, x_val, y_val))
    notify(f"churn: tuning LightGBM with Optuna ({lgbm_trials} trials)")
    candidates.append(_tune_lightgbm(x_train, y_train, x_val, y_val, scale_pos_weight, lgbm_trials))
    notify(f"churn: tuning XGBoost with Optuna ({xgb_trials} trials)")
    candidates.append(_tune_xgboost(x_train, y_train, x_val, y_val, scale_pos_weight, xgb_trials))

    # ── Candidate ranking by 5-fold CV on train∪validation ───────
    # A single 20% validation slice is too noisy to pick the champion at this
    # dataset size; cross-validated PR-AUC over train∪validation ranks the
    # candidates, and its out-of-fold predictions feed calibration (§10) and
    # threshold selection (§13). The test split stays untouched until the end.
    x_trval = pd.concat([x_train, x_val], ignore_index=True)
    y_trval = np.concatenate([y_train, y_val])

    competition: dict[str, float] = {}
    cv_oof: dict[str, np.ndarray] = {}
    for candidate in candidates:
        candidate.params = _resolved_params(candidate)
        cv_score, oof = _cv_oof(candidate, x_trval, y_trval)
        cv_oof[candidate.name] = oof
        competition[candidate.name] = round(cv_score, 4)
        notify(f"churn: {candidate.name} CV PR-AUC = {cv_score:.4f} (val {candidate.validation_pr_auc:.4f})")

    candidates.sort(key=lambda candidate: -competition[candidate.name])
    return ChurnTraining(
        dataset=dataset,
        preprocessor=preprocessor,
        candidates=candidates,
        competition=competition,
        cv_oof=cv_oof,
        x_trval=x_trval,
        y_trval=y_trval,
        x_test=x_test,
        y_test=y_test,
        y_train=y_train,
        y_val=y_val,
    )


def finalize_churn_candidate(
    training: ChurnTraining,
    candidate: ChurnCandidate,
    progress: Callable[[str], None] | None = None,
) -> ChurnTrainResult:
    """Calibrate + threshold + evaluate one candidate as the would-be champion."""

    notify = progress or (lambda message: logger.info(message))

    # ── Calibration on out-of-fold predictions (§10) ──────────────
    oof = training.cv_oof[candidate.name]
    calibrator = _fit_calibrator(oof, training.y_trval)
    calibrated_oof = calibrator.transform(oof)
    notify(f"churn: {candidate.name} calibration method = {calibrator.method}")

    # ── Threshold from calibrated OOF (§13, clipped to a usable band) ──
    f2_threshold = select_threshold_max_fbeta(training.y_trval, calibrated_oof, beta=2.0)
    high_threshold = float(np.clip(f2_threshold, 0.35, 0.85))
    thresholds = risk_thresholds_from_high(high_threshold)

    validation_metrics = churn_metrics(
        training.y_trval, calibrated_oof, threshold=thresholds["high"], ranking_scores=oof
    )

    # ── Final model: refit candidate config on train∪validation ───
    final_model = clone_candidate_model(candidate, training.y_trval)
    final_model.fit(training.x_trval, training.y_trval)
    candidate.model = final_model

    # ── Test split (§6) ───────────────────────────────────────────
    raw_test = candidate.predict_raw(training.x_test)
    calibrated_test = calibrator.transform(raw_test)
    test_metrics = churn_metrics(
        training.y_test, calibrated_test, threshold=thresholds["high"], ranking_scores=raw_test
    )

    # ── Baselines evaluated with the same harness (§12) ──────────
    baseline_metrics = _evaluate_baselines(
        training.dataset,
        training.preprocessor,
        training.y_train,
        training.y_val,
        training.y_test,
        thresholds["high"],
    )

    return ChurnTrainResult(
        champion=candidate,
        calibrator=calibrator,
        thresholds=thresholds,
        competition=training.competition,
        validation_metrics=validation_metrics,
        test_metrics=test_metrics,
        calibration_json=calibration_curve_points(training.y_test, calibrated_test),
        confusion_json=confusion_at_threshold(training.y_test, calibrated_test, thresholds["high"]),
        lift_table_json=lift_table(training.y_test, raw_test),
        feature_importance=_feature_importance(candidate, training.x_trval),
        baseline_metrics=baseline_metrics,
        preprocessor=training.preprocessor,
    )


def train_churn(
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
    *,
    lgbm_trials: int = LGBM_TRIALS,
    xgb_trials: int = XGB_TRIALS,
    progress: Callable[[str], None] | None = None,
) -> ChurnTrainResult:
    """Convenience wrapper: finalize the top-CV candidate."""

    training = train_churn_candidates(
        dataset, preprocessor, lgbm_trials=lgbm_trials, xgb_trials=xgb_trials, progress=progress
    )
    return finalize_churn_candidate(training, training.candidates[0], progress)


def refit_for_backtest(
    champion: ChurnCandidate,
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """Refit champion config at an older cutoff with the same OOF protocol.

    Returns (y_test, calibrated_probs, raw_scores, high_threshold).
    """

    x_train = transform_features(dataset.features("train"), preprocessor)
    x_val = transform_features(dataset.features("validation"), preprocessor)
    x_test = transform_features(dataset.features("test"), preprocessor)
    y_train = np.asarray(dataset.labels("train", "churn_label"), dtype=int)
    y_val = np.asarray(dataset.labels("validation", "churn_label"), dtype=int)
    y_test = np.asarray(dataset.labels("test", "churn_label"), dtype=int)

    x_trval = pd.concat([x_train, x_val], ignore_index=True)
    y_trval = np.concatenate([y_train, y_val])

    _, oof = _cv_oof(champion, x_trval, y_trval)
    calibrator = _fit_calibrator(oof, y_trval)
    f2_threshold = select_threshold_max_fbeta(y_trval, calibrator.transform(oof), beta=2.0)
    high_threshold = float(np.clip(f2_threshold, 0.35, 0.85))

    model = clone_candidate_model(champion, y_trval)
    model.fit(x_trval, y_trval)
    raw_scores = model.predict_proba(x_test)[:, 1]
    probs = calibrator.transform(raw_scores)
    return y_test, probs, raw_scores, high_threshold


def _cv_oof(
    candidate: ChurnCandidate,
    x: pd.DataFrame,
    y: np.ndarray,
    n_folds: int = 5,
) -> tuple[float, np.ndarray]:
    """Stratified K-fold CV: mean PR-AUC + out-of-fold probabilities."""

    from sklearn.model_selection import StratifiedKFold

    oof = np.zeros(len(y), dtype=float)
    scores: list[float] = []
    folds = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=RANDOM_SEED)
    for fold_train, fold_test in folds.split(x, y):
        model = clone_candidate_model(candidate, y[fold_train])
        model.fit(x.iloc[fold_train], y[fold_train])
        fold_probs = model.predict_proba(x.iloc[fold_test])[:, 1]
        oof[fold_test] = fold_probs
        scores.append(float(average_precision_score(y[fold_test], fold_probs)))
    return float(np.mean(scores)), oof


def _resolved_params(candidate: ChurnCandidate) -> dict[str, Any]:
    """Freeze early-stopping-dependent params so clones train standalone."""

    params = dict(candidate.params)
    if candidate.name == "lightgbm":
        best_iteration = getattr(candidate.model, "best_iteration_", None)
        params["n_estimators"] = int(best_iteration) if best_iteration else 300
    elif candidate.name == "xgboost":
        params.pop("early_stopping_rounds", None)
        best_iteration = getattr(candidate.model, "best_iteration", None)
        params["n_estimators"] = int(best_iteration) + 1 if best_iteration is not None else 300
    return params


def clone_candidate_model(champion: ChurnCandidate, y_train: np.ndarray) -> Any:
    """Fresh estimator with the champion's hyperparameters (for backtests)."""

    scale_pos_weight = float((y_train == 0).sum() / max(1, (y_train == 1).sum()))
    if champion.name == "lightgbm":
        params = dict(champion.params)
        params["scale_pos_weight"] = scale_pos_weight
        return lgb.LGBMClassifier(**params)
    if champion.name == "xgboost":
        params = dict(champion.params)
        params["scale_pos_weight"] = scale_pos_weight
        return xgb.XGBClassifier(**params)
    if champion.name == "random_forest":
        return RandomForestClassifier(**champion.params)
    return LogisticRegression(**champion.params)


def _fit_logistic(
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_val: pd.DataFrame,
    y_val: np.ndarray,
) -> ChurnCandidate:
    params: dict[str, Any] = {
        "max_iter": 2000,
        "class_weight": "balanced",
        "C": 1.0,
        "random_state": RANDOM_SEED,
    }
    model = LogisticRegression(**params).fit(x_train, y_train)
    return ChurnCandidate(
        name="logistic_regression",
        model=model,
        params=params,
        validation_pr_auc=float(average_precision_score(y_val, model.predict_proba(x_val)[:, 1])),
    )


def _fit_random_forest(
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_val: pd.DataFrame,
    y_val: np.ndarray,
) -> ChurnCandidate:
    params: dict[str, Any] = {
        "n_estimators": 500,
        "min_samples_leaf": 5,
        "max_features": "sqrt",
        "class_weight": "balanced",
        "random_state": RANDOM_SEED,
        "n_jobs": -1,
    }
    model = RandomForestClassifier(**params).fit(x_train, y_train)
    return ChurnCandidate(
        name="random_forest",
        model=model,
        params=params,
        validation_pr_auc=float(average_precision_score(y_val, model.predict_proba(x_val)[:, 1])),
    )


def _tune_lightgbm(
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_val: pd.DataFrame,
    y_val: np.ndarray,
    scale_pos_weight: float,
    n_trials: int,
) -> ChurnCandidate:
    def objective(trial: optuna.Trial) -> float:
        params = _lgbm_search_space(trial, scale_pos_weight)
        model = lgb.LGBMClassifier(**params)
        model.fit(
            x_train,
            y_train,
            eval_set=[(x_val, y_val)],
            eval_metric="average_precision",
            callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)],
        )
        return float(average_precision_score(y_val, model.predict_proba(x_val)[:, 1]))

    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=RANDOM_SEED),
        pruner=optuna.pruners.MedianPruner(n_warmup_steps=10),
    )
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)

    best_params = _lgbm_search_space(optuna.trial.FixedTrial(study.best_params), scale_pos_weight)
    model = lgb.LGBMClassifier(**best_params)
    model.fit(
        x_train,
        y_train,
        eval_set=[(x_val, y_val)],
        eval_metric="average_precision",
        callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)],
    )
    return ChurnCandidate(
        name="lightgbm",
        model=model,
        params=best_params,
        validation_pr_auc=float(average_precision_score(y_val, model.predict_proba(x_val)[:, 1])),
    )


def _lgbm_search_space(trial: optuna.Trial, scale_pos_weight: float) -> dict[str, Any]:
    return {
        "n_estimators": 2000,
        "num_leaves": trial.suggest_int("num_leaves", 16, 256),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
        "min_child_samples": trial.suggest_int("min_child_samples", 10, 200),
        "feature_fraction": trial.suggest_float("feature_fraction", 0.5, 1.0),
        "bagging_fraction": trial.suggest_float("bagging_fraction", 0.5, 1.0),
        "bagging_freq": 1,
        "lambda_l1": trial.suggest_float("lambda_l1", 1e-8, 10.0, log=True),
        "lambda_l2": trial.suggest_float("lambda_l2", 1e-8, 10.0, log=True),
        "scale_pos_weight": scale_pos_weight,
        "random_state": RANDOM_SEED,
        "n_jobs": -1,
        "verbosity": -1,
    }


def _tune_xgboost(
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_val: pd.DataFrame,
    y_val: np.ndarray,
    scale_pos_weight: float,
    n_trials: int,
) -> ChurnCandidate:
    def build_params(trial: optuna.Trial) -> dict[str, Any]:
        return {
            "n_estimators": 1500,
            "max_depth": trial.suggest_int("max_depth", 3, 9),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "min_child_weight": trial.suggest_int("min_child_weight", 1, 50),
            "subsample": trial.suggest_float("subsample", 0.5, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
            "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 10.0, log=True),
            "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 10.0, log=True),
            "scale_pos_weight": scale_pos_weight,
            "random_state": RANDOM_SEED,
            "n_jobs": -1,
            "eval_metric": "aucpr",
            "early_stopping_rounds": 50,
        }

    def objective(trial: optuna.Trial) -> float:
        model = xgb.XGBClassifier(**build_params(trial))
        model.fit(x_train, y_train, eval_set=[(x_val, y_val)], verbose=False)
        return float(average_precision_score(y_val, model.predict_proba(x_val)[:, 1]))

    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=RANDOM_SEED),
        pruner=optuna.pruners.MedianPruner(n_warmup_steps=10),
    )
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)

    best_params = build_params(optuna.trial.FixedTrial(study.best_params))
    model = xgb.XGBClassifier(**best_params)
    model.fit(x_train, y_train, eval_set=[(x_val, y_val)], verbose=False)
    return ChurnCandidate(
        name="xgboost",
        model=model,
        params=best_params,
        validation_pr_auc=float(average_precision_score(y_val, model.predict_proba(x_val)[:, 1])),
    )


# Isotonic is a step function: it quantizes scores into a handful of plateaus
# (k/n block rates), so every customer in a block gets an identical probability
# and within-tier ranking is lost. Platt (sigmoid) keeps scores continuous.
# Only prefer isotonic when it beats Platt on Brier by a *meaningful* margin —
# a hair of Brier gain does not justify collapsing thousands of customers onto
# ~100 distinct values. Both methods are monotonic, so ranking AUC is unchanged.
ISOTONIC_BRIER_MARGIN = 0.02  # isotonic must be >=2% better in Brier to be chosen


def _fit_calibrator(raw_val: np.ndarray, y_val: np.ndarray) -> FittedCalibrator:
    """Platt vs isotonic on validation; Platt wins ties (§10).

    Default to Platt for continuous, granular probabilities; switch to isotonic
    only when it is decisively better calibrated (Brier margin), keeping the
    overall calibration gate (ECE) satisfied either way.
    """

    platt = LogisticRegression(max_iter=2000)
    platt.fit(raw_val.reshape(-1, 1), y_val)
    platt_brier = brier_score_loss(y_val, platt.predict_proba(raw_val.reshape(-1, 1))[:, 1])

    n_positive = int(np.asarray(y_val).sum())
    if n_positive >= 200:
        isotonic = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
        isotonic.fit(raw_val, y_val)
        isotonic_brier = brier_score_loss(y_val, np.clip(isotonic.predict(raw_val), 0, 1))
        if isotonic_brier < platt_brier * (1.0 - ISOTONIC_BRIER_MARGIN):
            return FittedCalibrator(method="isotonic", model=isotonic)
    return FittedCalibrator(method="platt", model=platt)


def _evaluate_baselines(
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
    y_train: np.ndarray,
    y_val: np.ndarray,
    y_test: np.ndarray,
    threshold: float,
) -> dict[str, dict[str, dict[str, float]]]:
    """Baseline metrics per split: {baseline_name: {split: metrics}} (§12)."""

    features = {
        "validation": dataset.features("validation"),
        "test": dataset.features("test"),
    }
    y_by_split = {"validation": y_val, "test": y_test}

    logistic = ChurnLogisticBaseline(preprocessor).fit(dataset.features("train"), pd.Series(y_train))
    scorers: dict[str, Callable[[pd.DataFrame], np.ndarray]] = {
        "recency_rule_90d": churn_recency_rule_scores,
        "rfm_quartile": churn_rfm_quartile_scores,
        "logistic_regression": logistic.predict_proba,
    }

    results: dict[str, dict[str, dict[str, float]]] = {}
    for baseline_name, scorer in scorers.items():
        results[baseline_name] = {}
        for split_name, split_features in features.items():
            scores = scorer(split_features)
            results[baseline_name][split_name] = churn_metrics(
                y_by_split[split_name], scores, threshold=threshold
            )
    return results


def _feature_importance(champion: ChurnCandidate, x_train: pd.DataFrame) -> list[dict[str, Any]]:
    """Global mean |SHAP| for tree champions, |coef| for linear ones."""

    try:
        import shap

        if isinstance(champion.model, (lgb.LGBMClassifier, xgb.XGBClassifier, RandomForestClassifier)):
            sample = x_train.sample(min(1500, len(x_train)), random_state=RANDOM_SEED)
            explainer = shap.TreeExplainer(champion.model)
            values = explainer.shap_values(sample)
            if isinstance(values, list):  # RF/binary returns [neg, pos]
                values = values[1]
            if getattr(values, "ndim", 2) == 3:
                values = values[:, :, 1]
            mean_abs = np.abs(values).mean(axis=0)
        else:
            mean_abs = np.abs(champion.model.coef_[0])
    except Exception as exc:  # noqa: BLE001 - importance is informative, not load-bearing.
        logger.warning("feature importance failed: %s", exc)
        return []

    pairs = sorted(zip(x_train.columns, mean_abs), key=lambda pair: -pair[1])[:10]
    return [{"feature": name, "importance": round(float(value), 4)} for name, value in pairs]
