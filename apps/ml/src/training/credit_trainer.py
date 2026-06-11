"""Credit usage forecast training (TRAINING-PIPELINE §8 — quantile regression).

LightGBM quantile models per horizon (30d, 90d) × quantile (p10–p90), Optuna
tuned on p50 pinball loss per horizon, with a multiplicative interval widening
factor calibrated on validation so p10–p90 coverage lands at the 80% target.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

import lightgbm as lgb
import numpy as np
import optuna
import pandas as pd

from src.training.baselines import credit_last_30d_carryover, credit_moving_avg_90d
from src.training.datasets import SplitFrame
from src.training.metrics import credit_metrics, interval_coverage, pinball_loss, smape
from src.training.preprocessing import PreprocessorConfig, transform_features
from sklearn.metrics import mean_absolute_error

logger = logging.getLogger(__name__)

RANDOM_SEED = 42
QUANTILES = [0.10, 0.25, 0.50, 0.75, 0.90]
HORIZONS = {30: "future_credit_usage_30d", 90: "future_credit_usage_90d"}
CREDIT_TRIALS = 30
TARGET_COVERAGE = 0.80

optuna.logging.set_verbosity(optuna.logging.WARNING)


@dataclass
class CreditHorizonModels:
    horizon_days: int
    params: dict[str, Any]
    models: dict[float, lgb.LGBMRegressor]
    interval_widening: float
    # Models are trained on log1p(usage): quantiles are invariant under
    # monotonic transforms, and the log scale tames the heavy right tail.
    log_target: bool = True

    def predict_quantiles(self, x: pd.DataFrame) -> dict[float, np.ndarray]:
        raw = {}
        for alpha in QUANTILES:
            pred = self.models[alpha].predict(x)
            if self.log_target:
                pred = np.expm1(pred)
            raw[alpha] = np.clip(pred, 0, None)
        stacked = np.sort(np.vstack([raw[alpha] for alpha in QUANTILES]), axis=0)
        ordered = {alpha: stacked[i] for i, alpha in enumerate(QUANTILES)}
        return _widen_interval(ordered, self.interval_widening)


@dataclass
class CreditTrainResult:
    horizons: dict[int, CreditHorizonModels]
    validation_metrics: dict[str, float]
    test_metrics: dict[str, float]
    baseline_metrics: dict[str, dict[str, dict[str, float]]]
    preprocessor: PreprocessorConfig
    params_by_horizon: dict[int, dict[str, Any]] = field(default_factory=dict)


def train_credit(
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
    *,
    n_trials: int = CREDIT_TRIALS,
    progress: Callable[[str], None] | None = None,
) -> CreditTrainResult:
    notify = progress or (lambda message: logger.info(message))

    x = {
        split: transform_features(dataset.features(split), preprocessor)
        for split in ("train", "validation", "test")
    }
    y = {
        horizon: {
            split: pd.to_numeric(dataset.labels(split, column), errors="coerce").fillna(0.0).to_numpy()
            for split in ("train", "validation", "test")
        }
        for horizon, column in HORIZONS.items()
    }

    horizons: dict[int, CreditHorizonModels] = {}
    for horizon_days, _column in HORIZONS.items():
        notify(f"credit: tuning LightGBM quantile models for {horizon_days}d horizon ({n_trials} trials)")
        horizons[horizon_days] = _train_horizon(
            x["train"], y[horizon_days]["train"], x["validation"], y[horizon_days]["validation"],
            horizon_days=horizon_days, n_trials=n_trials,
        )

    validation_metrics = credit_metrics(
        y[30]["validation"], horizons[30].predict_quantiles(x["validation"]),
        y[90]["validation"], horizons[90].predict_quantiles(x["validation"]),
    )
    test_metrics = credit_metrics(
        y[30]["test"], horizons[30].predict_quantiles(x["test"]),
        y[90]["test"], horizons[90].predict_quantiles(x["test"]),
    )

    baseline_metrics = _evaluate_baselines(dataset, y)

    return CreditTrainResult(
        horizons=horizons,
        validation_metrics=validation_metrics,
        test_metrics=test_metrics,
        baseline_metrics=baseline_metrics,
        preprocessor=preprocessor,
        params_by_horizon={h: m.params for h, m in horizons.items()},
    )


def backtest_credit(
    result: CreditTrainResult,
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
) -> tuple[dict[str, float], dict[str, dict[str, float]]]:
    """Refit champion params at an older cutoff; return (champion, baselines) test metrics."""

    x_train = transform_features(dataset.features("train"), preprocessor)
    x_val = transform_features(dataset.features("validation"), preprocessor)
    x_test = transform_features(dataset.features("test"), preprocessor)

    predictions: dict[int, dict[float, np.ndarray]] = {}
    y_test: dict[int, np.ndarray] = {}
    for horizon_days, column in HORIZONS.items():
        y_train = pd.to_numeric(dataset.labels("train", column), errors="coerce").fillna(0.0).to_numpy()
        y_val = pd.to_numeric(dataset.labels("validation", column), errors="coerce").fillna(0.0).to_numpy()
        y_test[horizon_days] = pd.to_numeric(dataset.labels("test", column), errors="coerce").fillna(0.0).to_numpy()
        models = _fit_quantile_models(result.params_by_horizon[horizon_days], x_train, y_train, x_val, y_val)
        widening = _calibrate_widening(models, x_val, y_val)
        bundle = CreditHorizonModels(
            horizon_days=horizon_days,
            params=result.params_by_horizon[horizon_days],
            models=models,
            interval_widening=widening,
        )
        predictions[horizon_days] = bundle.predict_quantiles(x_test)

    champion_metrics = credit_metrics(
        y_test[30], predictions[30], y_test[90], predictions[90]
    )
    y_by_split = {
        horizon: {"test": y_test[horizon]}
        for horizon in HORIZONS
    }
    baseline_metrics = _evaluate_baselines(dataset, {h: {"test": y_test[h]} for h in HORIZONS}, splits=("test",))
    return champion_metrics, baseline_metrics


def _train_horizon(
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_val: pd.DataFrame,
    y_val: np.ndarray,
    *,
    horizon_days: int,
    n_trials: int,
) -> CreditHorizonModels:
    def build_params(trial: optuna.Trial) -> dict[str, Any]:
        return {
            "n_estimators": 1200,
            "num_leaves": trial.suggest_int("num_leaves", 16, 128),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "min_child_samples": trial.suggest_int("min_child_samples", 20, 200),
            "feature_fraction": trial.suggest_float("feature_fraction", 0.5, 1.0),
            "bagging_fraction": trial.suggest_float("bagging_fraction", 0.5, 1.0),
            "bagging_freq": 1,
            "lambda_l1": trial.suggest_float("lambda_l1", 1e-8, 10.0, log=True),
            "lambda_l2": trial.suggest_float("lambda_l2", 1e-8, 10.0, log=True),
            "random_state": RANDOM_SEED,
            "n_jobs": -1,
            "verbosity": -1,
        }

    def objective(trial: optuna.Trial) -> float:
        params = build_params(trial)
        model = lgb.LGBMRegressor(objective="quantile", alpha=0.50, **params)
        model.fit(
            x_train,
            np.log1p(np.clip(y_train, 0, None)),
            eval_set=[(x_val, np.log1p(np.clip(y_val, 0, None)))],
            callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)],
        )
        predictions = np.clip(np.expm1(model.predict(x_val)), 0, None)
        return pinball_loss(y_val, predictions, 0.50)

    study = optuna.create_study(
        direction="minimize",
        sampler=optuna.samplers.TPESampler(seed=RANDOM_SEED),
    )
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)
    best_params = build_params(optuna.trial.FixedTrial(study.best_params))

    models = _fit_quantile_models(best_params, x_train, y_train, x_val, y_val)
    widening = _calibrate_widening(models, x_val, y_val)
    return CreditHorizonModels(
        horizon_days=horizon_days,
        params=best_params,
        models=models,
        interval_widening=widening,
    )


def _fit_quantile_models(
    params: dict[str, Any],
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_val: pd.DataFrame,
    y_val: np.ndarray,
) -> dict[float, lgb.LGBMRegressor]:
    models: dict[float, lgb.LGBMRegressor] = {}
    y_train_log = np.log1p(np.clip(y_train, 0, None))
    y_val_log = np.log1p(np.clip(y_val, 0, None))
    for alpha in QUANTILES:
        model = lgb.LGBMRegressor(objective="quantile", alpha=alpha, **params)
        model.fit(
            x_train,
            y_train_log,
            eval_set=[(x_val, y_val_log)],
            callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)],
        )
        models[alpha] = model
    return models


def _calibrate_widening(
    models: dict[float, lgb.LGBMRegressor],
    x_val: pd.DataFrame,
    y_val: np.ndarray,
) -> float:
    """Pick a widening multiplier so validation p10–p90 coverage ≈ 80% (§11)."""

    raw = {
        alpha: np.clip(np.expm1(models[alpha].predict(x_val)), 0, None)
        for alpha in QUANTILES
    }
    stacked = np.sort(np.vstack([raw[alpha] for alpha in QUANTILES]), axis=0)
    ordered = {alpha: stacked[i] for i, alpha in enumerate(QUANTILES)}

    best_factor, best_gap = 1.0, float("inf")
    for factor in np.linspace(0.3, 3.0, 28):
        widened = _widen_interval(ordered, float(factor))
        coverage = interval_coverage(y_val, widened[0.10], widened[0.90])
        gap = abs(coverage - TARGET_COVERAGE)
        if gap < best_gap:
            best_gap, best_factor = gap, float(factor)
    return best_factor


def _widen_interval(
    quantile_predictions: dict[float, np.ndarray],
    factor: float,
) -> dict[float, np.ndarray]:
    """Scale outer quantiles away from p50 by `factor` (p50 untouched)."""

    p50 = quantile_predictions[0.50]
    widened: dict[float, np.ndarray] = {}
    for alpha, values in quantile_predictions.items():
        if alpha == 0.50:
            widened[alpha] = values
        else:
            widened[alpha] = np.clip(p50 + (values - p50) * factor, 0, None)
    return widened


def _evaluate_baselines(
    dataset: SplitFrame,
    y: dict[int, dict[str, np.ndarray]],
    splits: tuple[str, ...] = ("validation", "test"),
) -> dict[str, dict[str, dict[str, float]]]:
    scorers = {
        "last_30d_carryover": credit_last_30d_carryover,
        "moving_avg_90d": credit_moving_avg_90d,
    }
    results: dict[str, dict[str, dict[str, float]]] = {}
    for baseline_name, scorer in scorers.items():
        results[baseline_name] = {}
        for split_name in splits:
            features = dataset.features(split_name)
            pred_30 = scorer(features, 30)
            pred_90 = scorer(features, 90)
            results[baseline_name][split_name] = {
                "mae_30d": round(float(mean_absolute_error(y[30][split_name], pred_30)), 2),
                "smape_30d": round(smape(y[30][split_name], pred_30), 4),
                "mae_90d": round(float(mean_absolute_error(y[90][split_name], pred_90)), 2),
                "smape_90d": round(smape(y[90][split_name], pred_90), 4),
                "n": int(len(pred_30)),
            }
    return results
