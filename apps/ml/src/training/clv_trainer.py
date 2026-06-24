"""CLV model training (TRAINING-PIPELINE §8 — regression + ranking).

Candidates: BG-NBD + Gamma-Gamma (behavioral, gives p_alive) vs LightGBM
Tweedie regressor (zero-heavy target). Primary metric: Spearman on
validation. BG-NBD is always fitted — its `p_alive` is persisted regardless
of which candidate wins the revenue forecast (OUTPUT-CONTRACT §3.5).
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Callable

import lightgbm as lgb
import numpy as np
import optuna
import pandas as pd
import xgboost as xgb
from lifetimes import BetaGeoFitter, GammaGammaFitter
from scipy.stats import spearmanr

from src.training.baselines import ClvSegmentMeanBaseline, clv_carryover_scores
from src.training.datasets import SplitFrame
from src.training.metrics import bootstrap_ci_regression, clv_metrics
from src.training.preprocessing import PreprocessorConfig, transform_features

logger = logging.getLogger(__name__)

RANDOM_SEED = 42
TWEEDIE_TRIALS = 50
XGB_TWEEDIE_TRIALS = 30
HURDLE_TRIALS = 30
# 9 log-spaced values [1e-4, 3.2e-4, ..., 1.0] — finer coverage than the old 3-point grid
BGNBD_PENALIZERS = [float(v) for v in np.logspace(-4, 0, 9)]
EARLY_STOPPING_ROUNDS = 50

optuna.logging.set_verbosity(optuna.logging.WARNING)

# XGBoost Tweedie is an opt-in candidate. On all-numeric Tier A features
# LightGBM Tweedie matches XGBoost accuracy; enabling adds ~30 Optuna trials.
# Set ENABLE_XGB_CLV=1 to include it in the competition.
_CLV_XGB_ENABLED = os.getenv("ENABLE_XGB_CLV", "0") == "1"


@dataclass
class BgNbdBundle:
    """BG-NBD + Gamma-Gamma fitted on pre-cutoff payments."""

    bgf: BetaGeoFitter
    ggf: GammaGammaFitter | None
    penalizer: float
    horizon_days: int

    def predict_frame(self, rfm: pd.DataFrame) -> pd.DataFrame:
        """Predict expected revenue + p_alive for an RFM summary frame."""

        out = pd.DataFrame({"acc_id": rfm["acc_id"].astype(int)})
        n_purchases = self.bgf.conditional_expected_number_of_purchases_up_to_time(
            self.horizon_days, rfm["frequency"], rfm["recency"], rfm["T"]
        )
        p_alive = self.bgf.conditional_probability_alive(
            rfm["frequency"], rfm["recency"], rfm["T"]
        )
        if self.ggf is not None:
            expected_value = np.where(
                rfm["frequency"] > 0,
                self.ggf.conditional_expected_average_profit(
                    rfm["frequency"], rfm["monetary_value"]
                ),
                rfm["monetary_value"].mean() if len(rfm) else 0.0,
            )
        else:
            expected_value = np.full(len(rfm), float(rfm["monetary_value"].mean() or 0.0))
        out["predicted_clv"] = np.clip(np.asarray(n_purchases) * np.asarray(expected_value), 0, None)
        out["p_alive"] = np.clip(np.asarray(p_alive, dtype=float), 0.0, 1.0)
        return out


@dataclass
class HurdleBundle:
    """2-stage zero-inflated model: LightGBM binary × LightGBM Gamma.

    Stage 1 (classifier): P(revenue > 0) — trained on all rows.
    Stage 2 (regressor):  E[revenue | revenue > 0] — trained on positive-only rows,
                          Gamma objective appropriate for strictly positive right-skewed targets.
    Final prediction: prob_positive × conditional_revenue (expectation by law of total expectation).
    """

    classifier: lgb.LGBMClassifier
    regressor: lgb.LGBMRegressor
    params: dict[str, Any]  # shared structural params (objective field excluded)

    def predict(self, x: "pd.DataFrame") -> np.ndarray:
        prob_positive = np.clip(self.classifier.predict_proba(x)[:, 1], 0.0, 1.0)
        conditional = np.clip(self.regressor.predict(x), 0.0, None)
        return prob_positive * conditional


@dataclass
class ClvTrainResult:
    champion_name: str  # "bgnbd_gamma_gamma" | "lgbm_tweedie" | "xgb_tweedie" | "hurdle"
    bgnbd: BgNbdBundle
    tweedie_model: lgb.LGBMRegressor | None
    tweedie_params: dict[str, Any]
    xgb_model: xgb.XGBRegressor | None
    xgb_params: dict[str, Any]
    hurdle_bundle: HurdleBundle | None
    competition: dict[str, float]
    validation_metrics: dict[str, float]
    test_metrics: dict[str, float]
    baseline_metrics: dict[str, dict[str, dict[str, float]]]
    preprocessor: PreprocessorConfig
    test_ci_json: dict[str, dict[str, float]] = field(default_factory=dict)
    magnitude_slope: float = 1.0
    magnitude_intercept: float = 0.0


def build_rfm_summary(payments: pd.DataFrame, acc_ids: pd.Series, cutoff: pd.Timestamp) -> pd.DataFrame:
    """RFM summary (frequency/recency/T/monetary) from pre-cutoff payments."""

    history = payments[
        payments["acc_id"].notna()
        & payments["payment_date"].notna()
        & (payments["payment_date"] < cutoff)
    ].copy()
    history["acc_id"] = history["acc_id"].astype(int)
    history["amount"] = pd.to_numeric(history["amount"], errors="coerce").fillna(0.0)
    history["day"] = history["payment_date"].dt.normalize()

    daily = history.groupby(["acc_id", "day"], as_index=False)["amount"].sum()
    grouped = daily.groupby("acc_id")
    first = grouped["day"].min()
    last = grouped["day"].max()
    counts = grouped["day"].count()

    rfm = pd.DataFrame({"acc_id": pd.Series(sorted(set(acc_ids.astype(int))))})
    rfm["frequency"] = rfm["acc_id"].map(counts - 1).fillna(0.0).clip(lower=0)
    rfm["recency"] = rfm["acc_id"].map((last - first).dt.days).fillna(0.0)
    rfm["T"] = rfm["acc_id"].map((cutoff.normalize() - first).dt.days).fillna(0.0).clip(lower=0)

    repeat = daily.merge(first.rename("first_day"), on="acc_id")
    repeat = repeat[repeat["day"] > repeat["first_day"]]
    monetary = repeat.groupby("acc_id")["amount"].mean()
    rfm["monetary_value"] = rfm["acc_id"].map(monetary).fillna(0.0).clip(lower=0)
    return rfm


def fit_bgnbd(
    payments: pd.DataFrame,
    train_acc_ids: pd.Series,
    cutoff: pd.Timestamp,
    horizon_days: int,
    penalizer: float,
) -> BgNbdBundle:
    rfm_train = build_rfm_summary(payments, train_acc_ids, cutoff)
    fit_rows = rfm_train[rfm_train["T"] > 0]

    bgf = BetaGeoFitter(penalizer_coef=penalizer)
    bgf.fit(fit_rows["frequency"], fit_rows["recency"], fit_rows["T"])

    gg_rows = fit_rows[(fit_rows["frequency"] > 0) & (fit_rows["monetary_value"] > 0)]
    ggf: GammaGammaFitter | None = None
    if len(gg_rows) >= 50:
        ggf = GammaGammaFitter(penalizer_coef=max(penalizer, 0.001))
        ggf.fit(gg_rows["frequency"], gg_rows["monetary_value"])
    return BgNbdBundle(bgf=bgf, ggf=ggf, penalizer=penalizer, horizon_days=horizon_days)


def train_clv(
    dataset: SplitFrame,
    payments: pd.DataFrame,
    cutoff: pd.Timestamp,
    horizon_days: int,
    preprocessor: PreprocessorConfig,
    *,
    tweedie_trials: int = TWEEDIE_TRIALS,
    xgb_trials: int = XGB_TWEEDIE_TRIALS,
    hurdle_trials: int = HURDLE_TRIALS,
    progress: Callable[[str], None] | None = None,
) -> ClvTrainResult:
    notify = progress or (lambda message: logger.info(message))

    y_train = pd.to_numeric(dataset.labels("train", "future_revenue_6m"), errors="coerce").fillna(0.0)
    y_val = pd.to_numeric(dataset.labels("validation", "future_revenue_6m"), errors="coerce").fillna(0.0)
    y_test = pd.to_numeric(dataset.labels("test", "future_revenue_6m"), errors="coerce").fillna(0.0)

    # ── Candidate 1: BG-NBD + Gamma-Gamma (penalizer grid on validation) ──
    notify("clv: fitting BG-NBD + Gamma-Gamma candidates")
    best_bundle: BgNbdBundle | None = None
    best_bgnbd_spearman = -2.0
    val_acc = dataset.split("validation")["acc_id"]
    for penalizer in BGNBD_PENALIZERS:
        try:
            bundle = fit_bgnbd(payments, dataset.split("train")["acc_id"], cutoff, horizon_days, penalizer)
            predicted = bundle.predict_frame(build_rfm_summary(payments, val_acc, cutoff))
            corr = spearmanr(y_val.to_numpy(), predicted["predicted_clv"].to_numpy()).statistic
            corr = 0.0 if np.isnan(corr) else float(corr)
            if corr > best_bgnbd_spearman:
                best_bgnbd_spearman, best_bundle = corr, bundle
        except Exception as exc:  # noqa: BLE001 - a diverging penalizer must not kill the run.
            logger.warning("BG-NBD penalizer=%s failed: %s", penalizer, exc)
    if best_bundle is None:
        raise RuntimeError("BG-NBD failed to fit for all penalizer values.")

    # ── Candidate 2: LightGBM Tweedie on the Tier A features ──
    notify(f"clv: tuning LightGBM Tweedie with Optuna ({tweedie_trials} trials)")
    x_train = transform_features(dataset.features("train"), preprocessor)
    x_val = transform_features(dataset.features("validation"), preprocessor)
    x_test = transform_features(dataset.features("test"), preprocessor)

    def build_lgbm_params(trial: optuna.Trial) -> dict[str, Any]:
        return {
            "objective": "tweedie",
            "tweedie_variance_power": trial.suggest_float("tweedie_variance_power", 1.1, 1.9),
            "n_estimators": 1500,
            "num_leaves": trial.suggest_int("num_leaves", 16, 128),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "min_child_samples": trial.suggest_int("min_child_samples", 10, 200),
            "feature_fraction": trial.suggest_float("feature_fraction", 0.5, 1.0),
            "bagging_fraction": trial.suggest_float("bagging_fraction", 0.5, 1.0),
            "bagging_freq": 1,
            "lambda_l1": trial.suggest_float("lambda_l1", 1e-8, 10.0, log=True),
            "lambda_l2": trial.suggest_float("lambda_l2", 1e-8, 10.0, log=True),
            "random_state": RANDOM_SEED,
            "n_jobs": -1,
            "verbosity": -1,
        }

    def lgbm_objective(trial: optuna.Trial) -> float:
        model = lgb.LGBMRegressor(**build_lgbm_params(trial))
        model.fit(
            x_train,
            y_train,
            eval_set=[(x_val, y_val)],
            callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False), lgb.log_evaluation(0)],
        )
        predictions = np.clip(model.predict(x_val), 0, None)
        corr = spearmanr(y_val.to_numpy(), predictions).statistic
        return 0.0 if np.isnan(corr) else float(corr)

    lgbm_study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=RANDOM_SEED),
    )
    lgbm_study.optimize(lgbm_objective, n_trials=tweedie_trials, show_progress_bar=False)
    tweedie_params = build_lgbm_params(optuna.trial.FixedTrial(lgbm_study.best_params))
    tweedie = lgb.LGBMRegressor(**tweedie_params)
    tweedie.fit(
        x_train,
        y_train,
        eval_set=[(x_val, y_val)],
        callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)],
    )
    tweedie_val_spearman = float(lgbm_study.best_value)

    # ── Candidate 3: XGBoost Tweedie (opt-in, ENABLE_XGB_CLV=1) ──────
    xgb_model: xgb.XGBRegressor | None = None
    xgb_params: dict[str, Any] = {}
    xgb_val_spearman = -2.0

    if _CLV_XGB_ENABLED:
        notify(f"clv: tuning XGBoost Tweedie with Optuna ({xgb_trials} trials)")

        def build_xgb_params(trial: optuna.Trial) -> dict[str, Any]:
            return {
                "objective": "reg:tweedie",
                "tweedie_variance_power": trial.suggest_float("tweedie_variance_power", 1.1, 1.9),
                "n_estimators": 1500,
                "max_depth": trial.suggest_int("max_depth", 3, 8),
                "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
                "min_child_weight": trial.suggest_int("min_child_weight", 5, 100),
                "subsample": trial.suggest_float("subsample", 0.5, 1.0),
                "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
                "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 10.0, log=True),
                "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 10.0, log=True),
                "random_state": RANDOM_SEED,
                "n_jobs": -1,
                "verbosity": 0,
                "tree_method": "hist",
                "early_stopping_rounds": EARLY_STOPPING_ROUNDS,
            }

        def xgb_objective(trial: optuna.Trial) -> float:
            model = xgb.XGBRegressor(**build_xgb_params(trial))
            model.fit(x_train, y_train, eval_set=[(x_val, y_val)], verbose=False)
            predictions = np.clip(model.predict(x_val), 0, None)
            corr = spearmanr(y_val.to_numpy(), predictions).statistic
            return 0.0 if np.isnan(corr) else float(corr)

        xgb_study = optuna.create_study(
            direction="maximize",
            sampler=optuna.samplers.TPESampler(seed=RANDOM_SEED),
        )
        xgb_study.optimize(xgb_objective, n_trials=xgb_trials, show_progress_bar=False)
        xgb_params = build_xgb_params(optuna.trial.FixedTrial(xgb_study.best_params))
        xgb_model = xgb.XGBRegressor(**xgb_params)
        xgb_model.fit(x_train, y_train, eval_set=[(x_val, y_val)], verbose=False)
        xgb_val_spearman = float(xgb_study.best_value)
    else:
        notify("clv: XGBoost Tweedie skipped (set ENABLE_XGB_CLV=1 to enable)")

    # ── Candidate 4: Hurdle model (binary × Gamma) — tackles zero-inflation directly ──
    notify(f"clv: fitting hurdle model (LightGBM binary + Gamma, {hurdle_trials} trials)")
    hurdle_bundle, hurdle_val_spearman = _fit_hurdle(
        x_train, y_train, x_val, y_val, hurdle_trials=hurdle_trials
    )

    competition = {
        "bgnbd_gamma_gamma": round(best_bgnbd_spearman, 4),
        "lgbm_tweedie": round(tweedie_val_spearman, 4),
        "hurdle": round(hurdle_val_spearman, 4),
    }
    if _CLV_XGB_ENABLED:
        competition["xgb_tweedie"] = round(xgb_val_spearman, 4)
    best_val = max(competition.values())
    if competition["hurdle"] == best_val:
        champion_name = "hurdle"
    elif competition.get("xgb_tweedie") == best_val:
        champion_name = "xgb_tweedie"
    elif competition["lgbm_tweedie"] == best_val:
        champion_name = "lgbm_tweedie"
    else:
        champion_name = "bgnbd_gamma_gamma"
    notify(f"clv: champion = {champion_name} ({competition})")

    def champion_predict(split_name: str, x: pd.DataFrame) -> np.ndarray:
        if champion_name == "lgbm_tweedie":
            return np.clip(tweedie.predict(x), 0, None)
        if champion_name == "xgb_tweedie":
            return np.clip(xgb_model.predict(x), 0, None)
        if champion_name == "hurdle":
            return np.clip(hurdle_bundle.predict(x), 0, None)
        rfm = build_rfm_summary(payments, dataset.split(split_name)["acc_id"], cutoff)
        return best_bundle.predict_frame(rfm)["predicted_clv"].to_numpy()

    val_preds = champion_predict("validation", x_val)
    validation_metrics = clv_metrics(y_val.to_numpy(), val_preds)

    # OLS magnitude calibration: correct systematic scale bias while preserving ranking.
    # Fitted on validation so the slope/intercept are unknown to the test set.
    # Spearman (promotion metric) is unaffected; RMSLE/MAE improve when predictions
    # are systematically too high or too low relative to actuals.
    from sklearn.linear_model import LinearRegression as _LR
    _val_actual = y_val.to_numpy()
    _finite = np.isfinite(val_preds) & np.isfinite(_val_actual)
    if _finite.sum() < 2:
        # Not enough finite (pred, actual) pairs to fit a line — e.g. a BG-NBD
        # champion whose RFM summary produced NaN for a degenerate cohort.
        notify("clv: magnitude calibration skipped — insufficient finite validation pairs; using identity")
        magnitude_slope, magnitude_intercept = 1.0, 0.0
    else:
        _lr = _LR().fit(val_preds[_finite].reshape(-1, 1), _val_actual[_finite])
        _raw_slope = float(_lr.coef_[0])
        if _raw_slope < 0.01:
            # Degenerate: negative or near-zero slope means predictions are anti-correlated
            # with actuals — calibration would flip or collapse magnitudes. Fall back to
            # identity and surface it: a negative slope signals val/test drift or an
            # unstable champion, not a benign no-op.
            notify(
                f"clv: ⚠ magnitude calibration slope={_raw_slope:.4f} ≤ 0.01 "
                "(predictions anti-correlated with actuals) — falling back to identity"
            )
            magnitude_slope, magnitude_intercept = 1.0, 0.0
        else:
            magnitude_slope = float(np.clip(_raw_slope, 0.01, 20.0))
            magnitude_intercept = float(_lr.intercept_)

    test_preds_raw = champion_predict("test", x_test)
    test_preds = np.clip(magnitude_slope * test_preds_raw + magnitude_intercept, 0.0, None)
    test_metrics = clv_metrics(y_test.to_numpy(), test_preds)
    test_ci_json = bootstrap_ci_regression(y_test.to_numpy(), test_preds)

    # ── Baselines (§12) ───────────────────────────────────────────
    segment = ClvSegmentMeanBaseline().fit(dataset.features("train"), y_train)
    baseline_metrics: dict[str, dict[str, dict[str, float]]] = {
        "segment_mean": {
            "validation": clv_metrics(y_val.to_numpy(), segment.predict(dataset.features("validation"))),
            "test": clv_metrics(y_test.to_numpy(), segment.predict(dataset.features("test"))),
        },
        "revenue_180d_carryover": {
            "validation": clv_metrics(y_val.to_numpy(), clv_carryover_scores(dataset.features("validation"))),
            "test": clv_metrics(y_test.to_numpy(), clv_carryover_scores(dataset.features("test"))),
        },
    }

    return ClvTrainResult(
        champion_name=champion_name,
        bgnbd=best_bundle,
        tweedie_model=tweedie if champion_name == "lgbm_tweedie" else None,
        tweedie_params=tweedie_params,
        xgb_model=xgb_model if champion_name == "xgb_tweedie" else None,
        xgb_params=xgb_params,
        hurdle_bundle=hurdle_bundle if champion_name == "hurdle" else None,
        competition=competition,
        validation_metrics=validation_metrics,
        test_metrics=test_metrics,
        baseline_metrics=baseline_metrics,
        preprocessor=preprocessor,
        test_ci_json=test_ci_json,
        magnitude_slope=magnitude_slope,
        magnitude_intercept=magnitude_intercept,
    )


def backtest_clv(
    result: ClvTrainResult,
    dataset: SplitFrame,
    payments: pd.DataFrame,
    cutoff: pd.Timestamp,
    horizon_days: int,
    preprocessor: PreprocessorConfig,
) -> tuple[dict[str, float], dict[str, dict[str, float]]]:
    """Refit champion config at an older cutoff; return (champion, baselines) test metrics."""

    y_train = pd.to_numeric(dataset.labels("train", "future_revenue_6m"), errors="coerce").fillna(0.0)
    y_test = pd.to_numeric(dataset.labels("test", "future_revenue_6m"), errors="coerce").fillna(0.0)

    if result.champion_name in ("lgbm_tweedie", "xgb_tweedie", "hurdle"):
        x_train = transform_features(dataset.features("train"), preprocessor)
        x_val = transform_features(dataset.features("validation"), preprocessor)
        y_val_bt = pd.to_numeric(dataset.labels("validation", "future_revenue_6m"), errors="coerce").fillna(0.0)
        x_test_bt = transform_features(dataset.features("test"), preprocessor)
        if result.champion_name == "lgbm_tweedie":
            model: Any = lgb.LGBMRegressor(**result.tweedie_params)
            model.fit(
                x_train, y_train,
                eval_set=[(x_val, y_val_bt)],
                callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False), lgb.log_evaluation(0)],
            )
            predictions = np.clip(model.predict(x_test_bt), 0, None)
        elif result.champion_name == "xgb_tweedie":
            model = xgb.XGBRegressor(**result.xgb_params)
            model.fit(x_train, y_train, eval_set=[(x_val, y_val_bt)], verbose=False)
            predictions = np.clip(model.predict(x_test_bt), 0, None)
        else:
            # Hurdle: refit both stages from params stored in bundle
            bp = result.hurdle_bundle.params
            y_train_np = y_train.to_numpy()
            y_val_np = y_val_bt.to_numpy()
            pos_tr = y_train_np > 0
            pos_va = y_val_np > 0
            y_tr_pos = np.maximum(y_train_np[pos_tr], 1e-6)
            y_va_pos = np.maximum(y_val_np[pos_va], 1e-6)
            clf = lgb.LGBMClassifier(objective="binary", **bp)
            clf.fit(
                x_train, (y_train_np > 0).astype(float),
                eval_set=[(x_val, (y_val_np > 0).astype(float))],
                callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False), lgb.log_evaluation(0)],
            )
            reg = lgb.LGBMRegressor(objective="gamma", **bp)
            if pos_va.sum() >= 20:
                reg.fit(
                    x_train[pos_tr], y_tr_pos,
                    eval_set=[(x_val[pos_va], y_va_pos)],
                    callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False), lgb.log_evaluation(0)],
                )
            else:
                reg.fit(x_train[pos_tr], y_tr_pos)
            predictions = np.clip(HurdleBundle(clf, reg, bp).predict(x_test_bt), 0, None)
        # Apply training-time magnitude calibration for consistent backtest comparison.
        predictions = np.clip(
            result.magnitude_slope * predictions + result.magnitude_intercept, 0.0, None
        )
    else:
        bundle = fit_bgnbd(
            payments, dataset.split("train")["acc_id"], cutoff, horizon_days, result.bgnbd.penalizer
        )
        rfm = build_rfm_summary(payments, dataset.split("test")["acc_id"], cutoff)
        predictions = bundle.predict_frame(rfm)["predicted_clv"].to_numpy()

    champion_metrics = clv_metrics(y_test.to_numpy(), predictions)

    segment = ClvSegmentMeanBaseline().fit(dataset.features("train"), y_train)
    baseline_metrics = {
        "segment_mean": clv_metrics(y_test.to_numpy(), segment.predict(dataset.features("test"))),
        "revenue_180d_carryover": clv_metrics(
            y_test.to_numpy(), clv_carryover_scores(dataset.features("test"))
        ),
    }
    return champion_metrics, baseline_metrics


def _fit_hurdle(
    x_train: pd.DataFrame,
    y_train: pd.Series,
    x_val: pd.DataFrame,
    y_val: pd.Series,
    *,
    hurdle_trials: int,
) -> tuple[HurdleBundle, float]:
    """Tune and fit a 2-stage hurdle model; return (bundle, val_spearman).

    Stage 1: LightGBM binary classifier — learns which customers will have any revenue.
    Stage 2: LightGBM Gamma regressor on positive-only rows — learns how much revenue.
    Joint optimisation target: Spearman on the full validation set (not just positives).
    """
    y_train_np = np.asarray(y_train, dtype=float)
    y_val_np = np.asarray(y_val, dtype=float)
    y_train_bin = (y_train_np > 0).astype(float)
    y_val_bin = (y_val_np > 0).astype(float)

    pos_tr = y_train_np > 0
    pos_va = y_val_np > 0
    # Gamma requires strictly positive; clip away any float-precision zeros.
    y_tr_pos = np.maximum(y_train_np[pos_tr], 1e-6)
    y_va_pos = np.maximum(y_val_np[pos_va], 1e-6)
    x_tr_pos = x_train[pos_tr]
    x_va_pos = x_val[pos_va]
    use_val_es = int(pos_va.sum()) >= 20  # need enough positive val rows for early stopping

    if int(pos_tr.sum()) < 10:
        # Degenerate dataset — return dummy with score -1 so it never wins
        dummy_clf = lgb.LGBMClassifier(objective="binary", n_estimators=10, random_state=RANDOM_SEED, verbosity=-1)
        dummy_clf.fit(x_train, y_train_bin)
        dummy_reg = lgb.LGBMRegressor(objective="gamma", n_estimators=10, random_state=RANDOM_SEED, verbosity=-1)
        if int(pos_tr.sum()) > 0:
            dummy_reg.fit(x_tr_pos, y_tr_pos)
        return HurdleBundle(classifier=dummy_clf, regressor=dummy_reg, params={}), -1.0

    def build_params(trial: optuna.Trial) -> dict[str, Any]:
        return {
            "n_estimators": 1000,
            "num_leaves": trial.suggest_int("num_leaves", 16, 128),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "min_child_samples": trial.suggest_int("min_child_samples", 10, 200),
            "feature_fraction": trial.suggest_float("feature_fraction", 0.5, 1.0),
            "bagging_fraction": trial.suggest_float("bagging_fraction", 0.5, 1.0),
            "bagging_freq": 1,
            "lambda_l1": trial.suggest_float("lambda_l1", 1e-8, 10.0, log=True),
            "lambda_l2": trial.suggest_float("lambda_l2", 1e-8, 10.0, log=True),
            "random_state": RANDOM_SEED,
            "n_jobs": -1,
            "verbosity": -1,
        }

    def hurdle_objective(trial: optuna.Trial) -> float:
        params = build_params(trial)
        clf = lgb.LGBMClassifier(objective="binary", **params)
        clf.fit(
            x_train, y_train_bin,
            eval_set=[(x_val, y_val_bin)],
            callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False), lgb.log_evaluation(0)],
        )
        reg = lgb.LGBMRegressor(objective="gamma", **params)
        if use_val_es:
            reg.fit(
                x_tr_pos, y_tr_pos,
                eval_set=[(x_va_pos, y_va_pos)],
                callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False), lgb.log_evaluation(0)],
            )
        else:
            reg.fit(x_tr_pos, y_tr_pos)
        prob = np.clip(clf.predict_proba(x_val)[:, 1], 0.0, 1.0)
        cond = np.clip(reg.predict(x_val), 0.0, None)
        corr = spearmanr(y_val_np, prob * cond).statistic
        return 0.0 if np.isnan(corr) else float(corr)

    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=RANDOM_SEED),
    )
    study.optimize(hurdle_objective, n_trials=hurdle_trials, show_progress_bar=False)
    best_params = build_params(optuna.trial.FixedTrial(study.best_params))

    clf_final = lgb.LGBMClassifier(objective="binary", **best_params)
    clf_final.fit(
        x_train, y_train_bin,
        eval_set=[(x_val, y_val_bin)],
        callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False), lgb.log_evaluation(0)],
    )
    reg_final = lgb.LGBMRegressor(objective="gamma", **best_params)
    if use_val_es:
        reg_final.fit(
            x_tr_pos, y_tr_pos,
            eval_set=[(x_va_pos, y_va_pos)],
            callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False), lgb.log_evaluation(0)],
        )
    else:
        reg_final.fit(x_tr_pos, y_tr_pos)
    return HurdleBundle(classifier=clf_final, regressor=reg_final, params=best_params), float(study.best_value)
