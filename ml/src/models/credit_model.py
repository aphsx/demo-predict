"""
1Moby Analytics — Credit Purchase Forecast Model
LightGBM Quantile Regression × 5 + Conformal Calibration
"""

import dill
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import optuna
optuna.logging.set_verbosity(optuna.logging.WARNING)
from pathlib import Path
from sklearn.model_selection import train_test_split
import lightgbm as lgb
import xgboost as xgb

from src.config import (
    CUTOFF, CREDIT_QUANTILES, CREDIT_OPTUNA_TRIALS,
    CREDIT_OUTLIER_PCTILE, CREDIT_RANDOM_STATE,
    CONFORMAL_MULT_80, CONFORMAL_MULT_50,
    CREDIT_URGENCY_DAYS, MODEL_FILES, MODELS_DIR,
)
from src.features import build_transaction_pairs, build_latest_transaction_features

CREDIT_FEAT_COLS = [
    "current_amount_log", "current_credits_log", "credit_type_sms",
    "n_prev", "avg_prev_amount_log", "max_prev_amount_log",
    "total_prev_amount_log", "avg_interval", "std_interval",
    "last_interval", "days_since_prev", "cv_interval",
    "min_interval", "max_interval", "amount_ratio",
    "usage_total_log", "usage_avg_monthly", "usage_recent_avg",
    "usage_slope", "usage_recent_total",
]


def train(payments: pd.DataFrame, usage: pd.DataFrame,
          cutoff: pd.Timestamp = CUTOFF, out_dir: Path = MODELS_DIR) -> dict:
    """
    Train LightGBM Quantile × 5, calibrate coverage, save pkl
    """
    print("\n[Credit] Training Quantile Regression × 5...")

    pairs = build_transaction_pairs(payments, usage, cutoff, CREDIT_OUTLIER_PCTILE)
    if len(pairs) == 0:
        raise ValueError("No transaction pairs found")

    X = pairs[CREDIT_FEAT_COLS].fillna(0)
    y = pairs["target_log"]
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.20,
                                                random_state=CREDIT_RANDOM_STATE)

    # XGBoost baseline
    xgb_m = xgb.XGBRegressor(n_estimators=200, random_state=CREDIT_RANDOM_STATE, verbosity=0)
    xgb_m.fit(X_tr, y_tr)
    pred_xgb  = np.expm1(xgb_m.predict(X_te))
    actual_te = np.expm1(y_te.values)
    mae_xgb   = float(np.abs(actual_te - pred_xgb).mean())
    r2_xgb    = 1 - np.sum((actual_te - pred_xgb) ** 2) / np.sum((actual_te - actual_te.mean()) ** 2)
    print(f"  XGBoost baseline: MAE={mae_xgb:.1f}d R²={r2_xgb:.3f}")

    # LightGBM Quantile × 5 with Optuna per quantile
    q_models = {}
    q_preds  = {}
    for q in CREDIT_QUANTILES:
        def objective(trial, _q=q):
            p = {
                "n_estimators":      trial.suggest_int("n_estimators", 50, 300),
                "max_depth":         trial.suggest_int("max_depth", 3, 7),
                "learning_rate":     trial.suggest_float("lr", 0.01, 0.2, log=True),
                "subsample":         trial.suggest_float("sub", 0.5, 1.0),
                "colsample_bytree":  trial.suggest_float("col", 0.5, 1.0),
                "min_child_samples": trial.suggest_int("mcs", 5, 30),
            }
            m = lgb.LGBMRegressor(objective="quantile", alpha=_q, verbose=-1, **p)
            m.fit(X_tr, y_tr)
            pred = m.predict(X_te)
            return float(np.mean(np.where(y_te >= pred, _q * (y_te - pred), (1 - _q) * (pred - y_te))))

        study = optuna.create_study(direction="minimize")
        study.optimize(objective, n_trials=CREDIT_OPTUNA_TRIALS, show_progress_bar=False)
        bp = study.best_params
        m  = lgb.LGBMRegressor(
            objective="quantile", alpha=q, verbose=-1,
            n_estimators=bp["n_estimators"], max_depth=bp["max_depth"],
            learning_rate=bp["lr"], subsample=bp["sub"],
            colsample_bytree=bp["col"], min_child_samples=bp["mcs"],
        )
        m.fit(X_tr, y_tr)
        q_models[q] = m
        q_preds[q]  = np.expm1(m.predict(X_te))

    # Conformal calibration
    mult_80, mult_50 = _find_multipliers(q_preds, actual_te)
    cov_before_80, cov_after_80 = _coverage(q_preds[0.10], q_preds[0.90], actual_te, mult_80)
    cov_before_50, cov_after_50 = _coverage(q_preds[0.25], q_preds[0.75], actual_te, mult_50)

    # Final metrics
    p50   = q_preds[0.50]
    mae50 = float(np.abs(actual_te - p50).mean())
    med50 = float(np.median(np.abs(actual_te - p50)))
    r2_50 = 1 - np.sum((actual_te - p50) ** 2) / np.sum((actual_te - actual_te.mean()) ** 2)

    print(f"  LightGBM Q50: MAE={mae50:.1f}d MedAE={med50:.1f}d R²={r2_50:.3f}")
    print(f"  Coverage P10-P90: {cov_before_80:.1%} → {cov_after_80:.1%} (×{mult_80:.2f})")
    print(f"  Coverage P25-P75: {cov_before_50:.1%} → {cov_after_50:.1%} (×{mult_50:.2f})")

    print("\n  Per-quantile:")
    for q in CREDIT_QUANTILES:
        p   = q_preds[q]
        mae = float(np.abs(actual_te - p).mean())
        med = float(np.median(np.abs(actual_te - p)))
        print(f"    P{int(q*100):02d}: MAE={mae:.1f}d MedAE={med:.1f}d mean={p.mean():.1f}d")

    metrics = {
        "p50_mae":                    round(mae50, 2),
        "p50_medae":                  round(med50, 2),
        "p50_r2":                     round(float(r2_50), 4),
        "xgb_baseline_mae":           round(mae_xgb, 2),
        "coverage_p10_p90_before":    round(cov_before_80, 4),
        "coverage_p10_p90_after":     round(cov_after_80, 4),
        "coverage_p25_p75_before":    round(cov_before_50, 4),
        "coverage_p25_p75_after":     round(cov_after_50, 4),
        "conformal_mult_80":          round(mult_80, 3),
        "conformal_mult_50":          round(mult_50, 3),
    }

    _save_plots(q_preds, actual_te, mult_80, mult_50, q_models, out_dir)

    for q in CREDIT_QUANTILES:
        fname = f"credit_q{int(q * 100):02d}.pkl"
        with open(out_dir / fname, "wb") as f:
            dill.dump({
                "model": q_models[q], "features": CREDIT_FEAT_COLS,
                "mult_80": mult_80, "mult_50": mult_50,
            }, f)

    return {"metrics": metrics}


def predict(payments: pd.DataFrame, usage: pd.DataFrame,
            cutoff: pd.Timestamp = CUTOFF, models_dir: Path = MODELS_DIR,
            min_purchases: int = 2) -> pd.DataFrame:
    """
    คืน DataFrame: acc_id, p10, p25, p50, p75, p90, urgency, alert_date,
                   n_purchases, forecast_confidence

    FIX: กรองเฉพาะลูกค้าที่มี >= min_purchases ก่อนส่งเข้า model
         ลูกค้าที่ซื้อครั้งแรกครั้งเดียวไม่มี interval history
         -> model เดาไม่ได้ -> P10 ต่ำมาก -> urgency Critical ทั้งหมด

    ลูกค้าที่ซื้อแค่ 1 ครั้ง: urgency = "New Customer" แยกออกมาชัดเจน
    """
    artifacts = _load_all(models_dir)
    mult_80   = artifacts[0.10]["mult_80"]
    mult_50   = artifacts[0.25]["mult_50"]

    p_pre = payments[payments["payment_date"] < cutoff]

    # FIX: นับจำนวน purchases ต่อลูกค้า
    purchase_counts = p_pre.groupby("acc_id").size().rename("n_purchases")
    repeat_buyers   = purchase_counts[purchase_counts >= min_purchases].index
    single_buyers   = purchase_counts[purchase_counts <  min_purchases].index

    print(f"  Credit predict: {len(repeat_buyers):,} repeat buyers (>={min_purchases}x) | "
          f"{len(single_buyers):,} single buyers -> urgency='New Customer'")

    # Predict สำหรับ repeat buyers เท่านั้น
    p_repeat = payments[payments["acc_id"].isin(repeat_buyers)]
    X_pred   = build_latest_transaction_features(p_repeat, usage, cutoff)

    if len(X_pred) == 0:
        return pd.DataFrame()

    X_feat = X_pred[CREDIT_FEAT_COLS].fillna(0)
    for q in CREDIT_QUANTILES:
        X_pred[f"p{int(q*100):02d}_raw"] = np.expm1(artifacts[q]["model"].predict(X_feat))

    # Apply conformal calibration
    for lo_raw, hi_raw, lo_cal, hi_cal, mult in [
        ("p10_raw", "p90_raw", "p10", "p90", mult_80),
        ("p25_raw", "p75_raw", "p25", "p75", mult_50),
    ]:
        mid  = (X_pred[lo_raw] + X_pred[hi_raw]) / 2
        half = (X_pred[hi_raw] - X_pred[lo_raw]) / 2 * mult
        X_pred[lo_cal] = (mid - half).clip(lower=0)
        X_pred[hi_cal] = (mid + half).clip(lower=0)

    X_pred["p50"] = X_pred["p50_raw"]

    # Urgency + confidence
    X_pred["urgency"]             = X_pred["p10"].apply(_urgency_label)
    X_pred["forecast_confidence"] = X_pred["acc_id"].map(
        purchase_counts.clip(upper=10).div(10)
    ).fillna(0).round(2)
    X_pred["alert_date"]  = (cutoff + pd.to_timedelta(
        X_pred["p25"].astype(int), unit="D")).dt.date
    X_pred["n_purchases"] = X_pred["acc_id"].map(purchase_counts).fillna(0).astype(int)

    repeat_out = X_pred[["acc_id", "p10", "p25", "p50", "p75", "p90",
                          "urgency", "alert_date",
                          "n_purchases", "forecast_confidence"]].copy()

    # New/single buyers — urgency ที่บอกชัดว่าไม่มี history
    if len(single_buyers) > 0:
        single_out = pd.DataFrame({
            "acc_id":               single_buyers,
            "p10":                  np.nan,
            "p25":                  np.nan,
            "p50":                  np.nan,
            "p75":                  np.nan,
            "p90":                  np.nan,
            "urgency":              "New Customer",
            "alert_date":           None,
            "n_purchases":          purchase_counts.reindex(single_buyers).values,
            "forecast_confidence":  0.0,
        })
        return pd.concat([repeat_out, single_out], ignore_index=True)

    return repeat_out


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def _coverage_raw(lo, hi, actual) -> float:
    return float(np.mean((actual >= lo) & (actual <= hi)))


def _coverage(lo_raw, hi_raw, actual, mult) -> tuple[float, float]:
    before = _coverage_raw(lo_raw, hi_raw, actual)
    mid    = (lo_raw + hi_raw) / 2
    half   = (hi_raw - lo_raw) / 2 * mult
    after  = _coverage_raw(mid - half, mid + half, actual)
    return before, after


def _find_multipliers(q_preds: dict, actual: np.ndarray) -> tuple[float, float]:
    mult_80 = mult_50 = 1.0
    for m in np.arange(1.0, 2.5, 0.01):
        mid  = (q_preds[0.10] + q_preds[0.90]) / 2
        half = (q_preds[0.90] - q_preds[0.10]) / 2 * m
        if _coverage_raw(mid - half, mid + half, actual) >= 0.80:
            mult_80 = m; break
    for m in np.arange(1.0, 2.5, 0.01):
        mid  = (q_preds[0.25] + q_preds[0.75]) / 2
        half = (q_preds[0.75] - q_preds[0.25]) / 2 * m
        if _coverage_raw(mid - half, mid + half, actual) >= 0.50:
            mult_50 = m; break
    return round(mult_80, 3), round(mult_50, 3)


def _urgency_label(p10: float) -> str:
    if p10 < CREDIT_URGENCY_DAYS["Critical"]:
        return "Critical"
    elif p10 < CREDIT_URGENCY_DAYS["Warning"]:
        return "Warning"
    elif p10 < CREDIT_URGENCY_DAYS["Monitor"]:
        return "Monitor"
    return "Stable"


def _load_all(models_dir: Path) -> dict:
    arts = {}
    for q in CREDIT_QUANTILES:
        fname = f"credit_q{int(q * 100):02d}.pkl"
        with open(_resolve_model_file(models_dir, fname), "rb") as f:
            arts[q] = dill.load(f)
    return arts


def _resolve_model_file(models_dir: Path, filename: str) -> Path:
    requested = Path(models_dir) / filename
    local_default = Path(__file__).resolve().parents[2] / "models" / filename
    candidates = [requested]
    if local_default != requested:
        candidates.append(local_default)

    for candidate in candidates:
        if candidate.exists():
            return candidate

    searched = "\n".join(f"- {p}" for p in candidates)
    raise FileNotFoundError(
        f"Model artifact not found: {filename}\n"
        f"Searched:\n{searched}\n"
        "Train models first with: python train.py data/1Moby_Data.xlsx"
    )


def _save_plots(q_preds, actual_te, mult_80, mult_50, q_models, out_dir: Path):
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    idx   = np.argsort(q_preds[0.50])[:200]
    mid80 = (q_preds[0.10] + q_preds[0.90]) / 2
    h80   = (q_preds[0.90] - q_preds[0.10]) / 2 * mult_80
    mid50 = (q_preds[0.25] + q_preds[0.75]) / 2
    h50   = (q_preds[0.75] - q_preds[0.25]) / 2 * mult_50
    axes[0].fill_between(range(200), (mid80-h80)[idx], (mid80+h80)[idx], alpha=0.3, label="80% CI")
    axes[0].fill_between(range(200), (mid50-h50)[idx], (mid50+h50)[idx], alpha=0.4, label="50% CI")
    axes[0].scatter(range(200), actual_te[idx], s=5, color="red", label="Actual", zorder=5)
    axes[0].set_title("Prediction Bands"); axes[0].legend(fontsize=8)

    before80 = _coverage_raw(q_preds[0.10], q_preds[0.90], actual_te)
    after80  = _coverage_raw(mid80 - h80, mid80 + h80, actual_te)
    before50 = _coverage_raw(q_preds[0.25], q_preds[0.75], actual_te)
    after50  = _coverage_raw(mid50 - h50, mid50 + h50, actual_te)
    axes[1].bar(["P10-90 before","P10-90 after","P25-75 before","P25-75 after"],
                [before80, after80, before50, after50])
    axes[1].axhline(0.80, color="r", linestyle="--", label="80%")
    axes[1].axhline(0.50, color="g", linestyle="--", label="50%")
    axes[1].set_title("Coverage"); axes[1].legend(fontsize=7)

    imp = pd.Series(q_models[0.50].feature_importances_,
                    index=CREDIT_FEAT_COLS).sort_values(ascending=False)
    imp.head(15).plot.barh(ax=axes[2]); axes[2].set_title("Feature importance (Q50)"); axes[2].invert_yaxis()
    plt.tight_layout()
    plt.savefig(out_dir / "credit_eval.png", dpi=120)
    plt.close()
