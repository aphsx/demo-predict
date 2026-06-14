"""Credit usage forecast training (TRAINING-PIPELINE §8 — quantile regression).

LightGBM quantile models per horizon (30d, 90d) × quantile (p10–p90), Optuna
tuned on p50 pinball loss per horizon, with a multiplicative interval widening
factor calibrated on validation so p10–p90 coverage lands at the 80% target.

The models are trained on the LOG-RATIO against the carryover baseline
(`log1p(y) − log1p(carryover)`). Trees predict piecewise-constant values and
cannot track the y≈carryover relationship across seven orders of usage
magnitude; anchoring on the baseline makes the model learn corrections to it,
so it starts from baseline accuracy instead of competing against it from
scratch. Quantiles survive the transform because per-row shifts and
monotonic maps preserve quantile order.

On top of the anchor, the median correction is SHRUNK toward zero by a factor
λ ∈ [0, 1] calibrated on validation MAE (`_calibrate_shrinkage`). λ = 0
degrades gracefully to the carryover baseline, so a regime change in future
data can make the model fall back to the baseline but never collapse below it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

import lightgbm as lgb
import numpy as np
import optuna
import pandas as pd
import xgboost as xgb

from src.training.baselines import credit_last_30d_carryover, credit_moving_avg_90d
from src.training.datasets import SplitFrame
from src.training.labels import CREDIT_HORIZONS
from src.training.metrics import credit_metrics, interval_coverage, pinball_loss, smape
from src.training.preprocessing import PreprocessorConfig, transform_features
from sklearn.metrics import mean_absolute_error

logger = logging.getLogger(__name__)

RANDOM_SEED = 42
EARLY_STOPPING_ROUNDS = 50
QUANTILES = [0.10, 0.25, 0.50, 0.75, 0.90]
HORIZONS = CREDIT_HORIZONS  # single source in labels.py
CREDIT_TRIALS = 30
TARGET_COVERAGE = 0.80
URGENT_TOPUP_DAYS = 14

# Top-up timing model (XGBoost AFT — handles the ~70% censored rows that the
# observed-only alternatives would silently drop). The small distribution ×
# scale grid is chosen on validation urgent-F2: the model exists to power the
# "must top up within ≤14 days" alert, so that is what selection optimizes.
TOPUP_AFT_DISTRIBUTIONS = ("normal", "logistic")
TOPUP_AFT_SCALES = (0.5, 1.0, 1.5)
TOPUP_AFT_ROUNDS = 600
TOPUP_MIN_OBSERVED_DAYS = 0.5  # AFT bounds must be positive; same-day top-up → half a day
TOPUP_RAW_PRED_CAP = 3650.0  # AFT extrapolates exp(η) — censored-heavy rows can overflow
# Cap on the learned log-ratio correction (≈ ×0.22 – ×4.5 of the carryover
# anchor). Uncapped corrections extrapolate badly on whale customers at older
# backtest cutoffs and blow up MAE.
CORRECTION_CLIP = 1.5

optuna.logging.set_verbosity(optuna.logging.WARNING)


def credit_anchor_log(features_raw: pd.DataFrame, horizon_days: int) -> np.ndarray:
    """log1p of the carryover baseline forecast (the model's anchor)."""

    return np.log1p(np.clip(credit_last_30d_carryover(features_raw, horizon_days), 0, None))


@dataclass
class CreditHorizonModels:
    horizon_days: int
    params: dict[str, Any]
    models: dict[float, lgb.LGBMRegressor]
    interval_widening: float
    correction_shrinkage: float = 1.0

    def predict_quantiles(
        self,
        x: pd.DataFrame,
        anchor_log: np.ndarray,
    ) -> dict[float, np.ndarray]:
        ordered = _ordered_quantile_predictions(
            self.models, x, anchor_log, getattr(self, "correction_shrinkage", 1.0)
        )
        return _widen_interval(ordered, self.interval_widening)


def _ordered_quantile_predictions(
    models: dict[float, lgb.LGBMRegressor],
    x: pd.DataFrame,
    anchor_log: np.ndarray,
    shrinkage: float,
) -> dict[float, np.ndarray]:
    """Anchor + shrunk correction, mapped back to credit units and sorted.

    Shrinkage moves the LOCATION of all quantiles toward the carryover anchor
    by scaling the median correction with λ, while keeping each quantile's
    spread around the median intact (a uniform shift in log space preserves
    quantile order and interval width).
    """

    corrections = {alpha: models[alpha].predict(x) for alpha in QUANTILES}
    location_shift = (shrinkage - 1.0) * corrections[0.50]
    raw = {
        alpha: np.clip(
            np.expm1(
                np.clip(corrections[alpha] + location_shift, -CORRECTION_CLIP, CORRECTION_CLIP)
                + anchor_log
            ),
            0,
            None,
        )
        for alpha in QUANTILES
    }
    # Resolve quantile crossings by pinning p50 (the value the shrinkage was
    # calibrated on) and clamping outer quantiles to stay monotone around it —
    # a full sort would silently swap the median away from the tuned forecast.
    median = raw[0.50]
    ordered: dict[float, np.ndarray] = {0.50: median}
    bound = median
    for alpha in (0.25, 0.10):
        bound = np.minimum(raw[alpha], bound)
        ordered[alpha] = bound
    bound = median
    for alpha in (0.75, 0.90):
        bound = np.maximum(raw[alpha], bound)
        ordered[alpha] = bound
    return ordered


def _calibrate_shrinkage(
    models: dict[float, lgb.LGBMRegressor],
    x_val: pd.DataFrame,
    y_val: np.ndarray,
    anchor_val: np.ndarray,
) -> float:
    """Pick λ ∈ [0, 1] minimizing validation p50 MAE.

    λ = 0 reproduces the carryover baseline exactly, so the point forecast can
    never be worse than the baseline on the tuning split. This is the guard
    against regime change in future data: when the learned corrections stop
    helping, retraining shrinks them away instead of betting on them.
    """

    c50 = models[0.50].predict(x_val)
    best_lambda, best_mae = 0.0, float("inf")
    for lam in np.linspace(0.0, 1.0, 11):
        predictions = np.clip(
            np.expm1(np.clip(lam * c50, -CORRECTION_CLIP, CORRECTION_CLIP) + anchor_val),
            0,
            None,
        )
        mae = float(mean_absolute_error(y_val, predictions))
        if mae < best_mae - 1e-9:
            best_mae, best_lambda = mae, float(lam)
    return best_lambda


@dataclass
class CreditTrainResult:
    horizons: dict[int, CreditHorizonModels]
    validation_metrics: dict[str, float]
    test_metrics: dict[str, float]
    baseline_metrics: dict[str, dict[str, dict[str, float]]]
    preprocessor: PreprocessorConfig
    params_by_horizon: dict[int, dict[str, Any]] = field(default_factory=dict)
    topup_model: "TopupTimingModel | None" = None


def train_credit(
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
    *,
    n_trials: int = CREDIT_TRIALS,
    topup_censor_days: float = 180.0,
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
    anchors = {
        horizon: {
            split: credit_anchor_log(dataset.features(split), horizon)
            for split in ("train", "validation", "test")
        }
        for horizon in HORIZONS
    }

    horizons: dict[int, CreditHorizonModels] = {}
    for horizon_days in HORIZONS:
        notify(f"credit: tuning LightGBM quantile models for {horizon_days}d horizon ({n_trials} trials)")
        horizons[horizon_days] = _train_horizon(
            x["train"], y[horizon_days]["train"], anchors[horizon_days]["train"],
            x["validation"], y[horizon_days]["validation"], anchors[horizon_days]["validation"],
            horizon_days=horizon_days, n_trials=n_trials,
        )

    predictions = {
        split: {
            horizon: horizons[horizon].predict_quantiles(x[split], anchors[horizon][split])
            for horizon in HORIZONS
        }
        for split in ("validation", "test")
    }
    notify("credit: training top-up timing model (XGBoost AFT)")
    topup_model = train_topup_model(dataset, preprocessor, censor_days=topup_censor_days)

    validation_metrics = credit_metrics(
        y[30]["validation"], predictions["validation"][30],
        y[90]["validation"], predictions["validation"][90],
    )
    test_metrics = credit_metrics(
        y[30]["test"], predictions["test"][30],
        y[90]["test"], predictions["test"][90],
    )
    for split_name, metrics in (("validation", validation_metrics), ("test", test_metrics)):
        metrics.update(topup_timing_metrics(dataset, split_name, topup_model, x[split_name]))
        metrics.update(
            urgent_topup_metrics(
                dataset,
                split_name,
                heuristic_topup_days(
                    dataset.features(split_name), predictions[split_name][30][0.50]
                ),
                suffix="_heuristic",
            )
        )

    baseline_metrics = _evaluate_baselines(dataset, y)

    return CreditTrainResult(
        horizons=horizons,
        validation_metrics=validation_metrics,
        test_metrics=test_metrics,
        baseline_metrics=baseline_metrics,
        preprocessor=preprocessor,
        params_by_horizon={h: m.params for h, m in horizons.items()},
        topup_model=topup_model,
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
        anchor_train = credit_anchor_log(dataset.features("train"), horizon_days)
        anchor_val = credit_anchor_log(dataset.features("validation"), horizon_days)
        anchor_test = credit_anchor_log(dataset.features("test"), horizon_days)

        models = _fit_quantile_models(
            result.params_by_horizon[horizon_days],
            x_train, y_train, anchor_train, x_val, y_val, anchor_val,
        )
        shrinkage = _calibrate_shrinkage(models, x_val, y_val, anchor_val)
        widening = _calibrate_widening(models, x_val, y_val, anchor_val, shrinkage)
        bundle = CreditHorizonModels(
            horizon_days=horizon_days,
            params=result.params_by_horizon[horizon_days],
            models=models,
            interval_widening=widening,
            correction_shrinkage=shrinkage,
        )
        predictions[horizon_days] = bundle.predict_quantiles(x_test, anchor_test)

    champion_metrics = credit_metrics(
        y_test[30], predictions[30], y_test[90], predictions[90]
    )
    # Refit the top-up timing model at this cutoff with the champion's
    # (distribution, scale) — same protocol as the quantile-model refits.
    bt_topup = train_topup_model(
        dataset,
        preprocessor,
        censor_days=result.topup_model.censor_days if result.topup_model else 180.0,
        fixed_params=(
            (result.topup_model.distribution, result.topup_model.scale)
            if result.topup_model
            else None
        ),
    )
    champion_metrics.update(topup_timing_metrics(dataset, "test", bt_topup, x_test))
    champion_metrics.update(
        urgent_topup_metrics(
            dataset, "test",
            heuristic_topup_days(dataset.features("test"), predictions[30][0.50]),
            suffix="_heuristic",
        )
    )
    baseline_metrics = _evaluate_baselines(
        dataset, {h: {"test": y_test[h]} for h in HORIZONS}, splits=("test",)
    )
    return champion_metrics, baseline_metrics


def _train_horizon(
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    anchor_train: np.ndarray,
    x_val: pd.DataFrame,
    y_val: np.ndarray,
    anchor_val: np.ndarray,
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

    target_train = np.log1p(np.clip(y_train, 0, None)) - anchor_train
    target_val = np.log1p(np.clip(y_val, 0, None)) - anchor_val

    def objective(trial: optuna.Trial) -> float:
        params = build_params(trial)
        model = lgb.LGBMRegressor(objective="quantile", alpha=0.50, **params)
        model.fit(
            x_train,
            target_train,
            eval_set=[(x_val, target_val)],
            callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False), lgb.log_evaluation(0)],
        )
        predictions = np.clip(np.expm1(model.predict(x_val) + anchor_val), 0, None)
        return pinball_loss(y_val, predictions, 0.50)

    study = optuna.create_study(
        direction="minimize",
        sampler=optuna.samplers.TPESampler(seed=RANDOM_SEED),
    )
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)
    best_params = build_params(optuna.trial.FixedTrial(study.best_params))

    models = _fit_quantile_models(
        best_params, x_train, y_train, anchor_train, x_val, y_val, anchor_val
    )
    shrinkage = _calibrate_shrinkage(models, x_val, y_val, anchor_val)
    widening = _calibrate_widening(models, x_val, y_val, anchor_val, shrinkage)
    return CreditHorizonModels(
        horizon_days=horizon_days,
        params=best_params,
        models=models,
        interval_widening=widening,
        correction_shrinkage=shrinkage,
    )


def _fit_quantile_models(
    params: dict[str, Any],
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    anchor_train: np.ndarray,
    x_val: pd.DataFrame,
    y_val: np.ndarray,
    anchor_val: np.ndarray,
) -> dict[float, lgb.LGBMRegressor]:
    target_train = np.log1p(np.clip(y_train, 0, None)) - anchor_train
    target_val = np.log1p(np.clip(y_val, 0, None)) - anchor_val
    models: dict[float, lgb.LGBMRegressor] = {}
    for alpha in QUANTILES:
        model = lgb.LGBMRegressor(objective="quantile", alpha=alpha, **params)
        model.fit(
            x_train,
            target_train,
            eval_set=[(x_val, target_val)],
            callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False), lgb.log_evaluation(0)],
        )
        models[alpha] = model
    return models


def _calibrate_widening(
    models: dict[float, lgb.LGBMRegressor],
    x_val: pd.DataFrame,
    y_val: np.ndarray,
    anchor_val: np.ndarray,
    shrinkage: float = 1.0,
) -> float:
    """Pick a widening multiplier so validation p10–p90 coverage ≈ 80% (§11)."""

    ordered = _ordered_quantile_predictions(models, x_val, anchor_val, shrinkage)

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


def urgent_topup_metrics(
    dataset: SplitFrame,
    split: str,
    est_days: np.ndarray,
    suffix: str = "",
) -> dict[str, Any]:
    """Quality of the "must top up within ≤14 days" alert (TRAINING §11).

    `est_days` is the estimated days-until-top-up per row of the split (from
    the AFT model or the balance/burn heuristic — pass `suffix` to persist
    both side by side). Actual urgency = the customer really topped up within
    14 days after the cutoff (`days_until_next_topup` label; censored rows
    count as not urgent).
    """

    actual = _actual_urgent(dataset, split)
    predicted = np.asarray(est_days, dtype=float) <= URGENT_TOPUP_DAYS

    tp = int(np.sum(predicted & actual))
    fp = int(np.sum(predicted & ~actual))
    fn = int(np.sum(~predicted & actual))
    return {
        f"urgent_topup_precision{suffix}": round(tp / (tp + fp), 4) if tp + fp else None,
        f"urgent_topup_recall{suffix}": round(tp / (tp + fn), 4) if tp + fn else None,
        f"urgent_topup_actual_n{suffix}": tp + fn,
        f"urgent_topup_flagged_n{suffix}": tp + fp,
    }


def heuristic_topup_days(features_raw: pd.DataFrame, p50_30d: np.ndarray) -> np.ndarray:
    """Prediction-side derivation: ceil(balance / (p50_30d / 30)).

    Uses the PIT-safe `credit_balance_proxy` feature in place of the
    export-time snapshot balance, which does not exist for historical
    cutoffs. Rows with no forecast burn get +inf (never urgent).
    """

    balance = (
        pd.to_numeric(features_raw["credit_balance_proxy"], errors="coerce")
        .fillna(0.0)
        .clip(lower=0.0)
        .to_numpy()
    )
    daily_burn = np.asarray(p50_30d, dtype=float) / 30.0
    est_days = np.full(len(balance), np.inf)
    burning = daily_burn > 0
    est_days[burning] = np.ceil(balance[burning] / daily_burn[burning])
    return est_days


def _actual_urgent(dataset: SplitFrame, split: str) -> np.ndarray:
    rows = dataset.split(split)
    days_label = pd.to_numeric(rows["days_until_next_topup"], errors="coerce")
    observed = (
        rows["topup_observed"].fillna(False).astype(bool)
        if "topup_observed" in rows.columns
        else days_label.notna()
    )
    return (observed & (days_label <= URGENT_TOPUP_DAYS)).to_numpy()


# ── Top-up timing model (XGBoost AFT) ────────────────────────────


@dataclass
class TopupTimingModel:
    booster: xgb.Booster
    distribution: str
    scale: float
    censor_days: float
    feature_names: list[str]
    # Censoring inflates the raw AFT estimate, so a fixed "≤14 days" UI rule
    # on raw days barely fires. AFT days are monotone in risk, so flagging at
    # the F2-optimal validation threshold t* is the optimal decision rule —
    # day_scale = 14 / t* bakes that rule into the shipped days value while
    # preserving ranking. Tuned on validation in train_topup_model.
    day_scale: float = 1.0
    urgent_day_threshold_raw: float = float(URGENT_TOPUP_DAYS)

    def predict_days(self, x: pd.DataFrame) -> np.ndarray:
        data = xgb.DMatrix(x[self.feature_names])
        raw = np.clip(self.booster.predict(data), 0.0, TOPUP_RAW_PRED_CAP)
        return raw * self.day_scale


def train_topup_model(
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
    censor_days: float,
    fixed_params: tuple[str, float] | None = None,
) -> TopupTimingModel:
    """Fit days-until-next-top-up as a right-censored AFT regression.

    Customers who never topped up inside the label window are censored at
    `censor_days` (lower bound = window, upper bound = +inf) instead of being
    dropped or faked as zero. `fixed_params` skips the selection grid —
    backtest refits reuse the champion's (distribution, scale).
    """

    x_train = transform_features(dataset.features("train"), preprocessor)
    x_val = transform_features(dataset.features("validation"), preprocessor)
    dtrain = _topup_dmatrix(x_train, dataset, "train", censor_days)
    dval = _topup_dmatrix(x_val, dataset, "validation", censor_days)
    actual_val = _actual_urgent(dataset, "validation")

    grid = [fixed_params] if fixed_params else [
        (distribution, scale)
        for distribution in TOPUP_AFT_DISTRIBUTIONS
        for scale in TOPUP_AFT_SCALES
    ]
    best: TopupTimingModel | None = None
    best_score = -1.0
    for distribution, scale in grid:
        params = {
            "objective": "survival:aft",
            "eval_metric": "aft-nloglik",
            "aft_loss_distribution": distribution,
            "aft_loss_distribution_scale": scale,
            "max_depth": 4,
            "learning_rate": 0.05,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "min_child_weight": 10.0,
            "lambda": 1.0,
            "seed": RANDOM_SEED,
            "verbosity": 0,
        }
        booster = xgb.train(
            params,
            dtrain,
            num_boost_round=TOPUP_AFT_ROUNDS,
            evals=[(dval, "validation")],
            early_stopping_rounds=50,
            verbose_eval=False,
        )
        days_val = np.clip(booster.predict(dval), 0.0, TOPUP_RAW_PRED_CAP)
        threshold, score = _tune_urgent_threshold(actual_val, days_val)
        if score > best_score:
            best_score = score
            best = TopupTimingModel(
                booster=booster,
                distribution=distribution,
                scale=scale,
                censor_days=censor_days,
                feature_names=list(x_train.columns),
                day_scale=float(URGENT_TOPUP_DAYS) / threshold,
                urgent_day_threshold_raw=threshold,
            )
    assert best is not None
    return best


def _tune_urgent_threshold(actual: np.ndarray, days_val: np.ndarray) -> tuple[float, float]:
    """Sweep day-thresholds on validation; return (best threshold, best F2)."""

    candidates = np.unique(
        np.concatenate(
            [
                np.quantile(days_val, np.linspace(0.02, 0.98, 49)),
                [float(URGENT_TOPUP_DAYS)],
            ]
        )
    )
    best_threshold, best_score = float(URGENT_TOPUP_DAYS), -1.0
    for threshold in candidates:
        if threshold <= 0:
            continue
        score = _urgent_fbeta(actual, days_val <= threshold, beta=2.0)
        if score > best_score:
            best_score, best_threshold = score, float(threshold)
    return best_threshold, best_score


def topup_timing_metrics(
    dataset: SplitFrame,
    split: str,
    model: TopupTimingModel,
    x: pd.DataFrame,
) -> dict[str, Any]:
    """Urgent alert quality + MAE on the rows whose top-up was observed."""

    days_pred = model.predict_days(x)
    metrics = urgent_topup_metrics(dataset, split, days_pred)
    rows = dataset.split(split)
    days_label = pd.to_numeric(rows["days_until_next_topup"], errors="coerce")
    observed = days_label.notna().to_numpy()
    if observed.any():
        metrics["topup_mae_days_observed"] = round(
            float(np.mean(np.abs(days_pred[observed] - days_label.to_numpy()[observed]))), 2
        )
    metrics["topup_observed_n"] = int(observed.sum())
    return metrics


def _topup_dmatrix(
    x: pd.DataFrame,
    dataset: SplitFrame,
    split: str,
    censor_days: float,
) -> xgb.DMatrix:
    rows = dataset.split(split)
    days = pd.to_numeric(rows["days_until_next_topup"], errors="coerce").to_numpy()
    observed = ~np.isnan(days)
    lower = np.where(observed, np.clip(days, TOPUP_MIN_OBSERVED_DAYS, None), censor_days)
    upper = np.where(observed, np.clip(days, TOPUP_MIN_OBSERVED_DAYS, None), np.inf)
    matrix = xgb.DMatrix(x)
    matrix.set_float_info("label_lower_bound", lower.astype(np.float32))
    matrix.set_float_info("label_upper_bound", upper.astype(np.float32))
    return matrix


def _urgent_fbeta(actual: np.ndarray, predicted: np.ndarray, beta: float) -> float:
    tp = float(np.sum(predicted & actual))
    fp = float(np.sum(predicted & ~actual))
    fn = float(np.sum(~predicted & actual))
    if tp == 0:
        return 0.0
    precision = tp / (tp + fp)
    recall = tp / (tp + fn)
    return (1 + beta**2) * precision * recall / ((beta**2) * precision + recall)


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
