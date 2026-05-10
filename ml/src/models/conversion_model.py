"""
1Moby Analytics — Free-to-Paid Conversion Model
ทำนาย P(convert) สำหรับ active free users
ใช้ LightGBM + Optuna, features จาก usage behavior
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
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score, f1_score, precision_score, recall_score
import lightgbm as lgb

from src.config import (
    CONVERSION_OPTUNA_TRIALS, CONVERSION_RANDOM_STATE,
    MODEL_FILES, MODELS_DIR,
)

CONVERSION_FEATURES = [
    "usage_total_log",
    "usage_months",
    "usage_avg",
    "usage_max",
    "usage_std",
    "usage_recent_3m",
    "usage_prev_3m",
    "usage_decay_ratio",
    "usage_slope",
    "usage_sms_total_log",
    "usage_email_total_log",
    "days_since_join",
    "days_since_last_send",
    "credit_sms_log",
    "credit_email_log",
    "channel_count",
    "source_count",
]


def _build_conversion_features(
    users: pd.DataFrame,
    usage: pd.DataFrame,
    free_ids: set,
    cutoff: pd.Timestamp,
) -> pd.DataFrame:
    """สร้าง features สำหรับ free users"""
    u_pre = usage[usage["period"] < cutoff]
    recent_cut = cutoff - pd.DateOffset(months=3)
    prev_cut = cutoff - pd.DateOffset(months=6)

    monthly = u_pre.groupby(["acc_id", "period"])["usage"].sum().reset_index()

    rows = []
    for acc in free_ids:
        u = users[users["acc_id"] == acc]
        if len(u) == 0:
            continue
        u = u.iloc[0]

        acc_monthly = monthly[monthly["acc_id"] == acc].sort_values("period")
        vals = acc_monthly["usage"].values

        u_total = vals.sum() if len(vals) > 0 else 0
        u_months = len(vals)
        u_avg = vals.mean() if len(vals) > 0 else 0
        u_max = vals.max() if len(vals) > 0 else 0
        u_std = vals.std() if len(vals) > 1 else 0
        u_recent = acc_monthly[acc_monthly["period"] >= recent_cut]["usage"].sum()
        u_prev = acc_monthly[(acc_monthly["period"] >= prev_cut) & (acc_monthly["period"] < recent_cut)]["usage"].sum()
        decay = float(u_recent / u_prev) if u_prev > 0 else 0.0
        slope = float(np.polyfit(np.arange(len(vals)), vals, 1)[0]) if len(vals) >= 2 else 0.0

        # Channel breakdown
        acc_use = u_pre[u_pre["acc_id"] == acc]
        sms_total = acc_use[acc_use["channel"] == "sms"]["usage"].sum()
        email_total = acc_use[acc_use["channel"] == "email"]["usage"].sum()
        channel_count = acc_use["channel"].nunique()
        source_count = acc_use["source"].nunique()

        # Last send (usage-based)
        last_use = u_pre[(u_pre["acc_id"] == acc) & (u_pre["usage"] > 0)]["period"].max()
        days_since_send = (cutoff - last_use).days if pd.notna(last_use) else 9999

        days_join = (cutoff - u["join_date"]).days if pd.notna(u["join_date"]) else 0

        rows.append({
            "acc_id": acc,
            "usage_total_log": np.log1p(u_total),
            "usage_months": u_months,
            "usage_avg": u_avg,
            "usage_max": u_max,
            "usage_std": u_std,
            "usage_recent_3m": u_recent,
            "usage_prev_3m": u_prev,
            "usage_decay_ratio": decay,
            "usage_slope": slope,
            "usage_sms_total_log": np.log1p(sms_total),
            "usage_email_total_log": np.log1p(email_total),
            "days_since_join": days_join,
            "days_since_last_send": days_since_send,
            "credit_sms_log": np.log1p(max(0, float(u.get("credit_sms", 0)))),
            "credit_email_log": np.log1p(max(0, float(u.get("credit_email", 0)))),
            "channel_count": channel_count,
            "source_count": source_count,
        })

    return pd.DataFrame(rows)


def train(
    users: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff: pd.Timestamp,
    out_dir: Path = MODELS_DIR,
) -> dict:
    """
    Train Conversion model
    Label: 1 = converted (จ่ายเงินหลัง cutoff), 0 = ไม่จ่าย
    """
    print("\n[Conversion] Training...")

    p_pre = payments[payments["payment_date"] < cutoff]
    u_pre = usage[(usage["period"] < cutoff) & (usage["usage"] > 0)]
    p_post = payments[
        (payments["payment_date"] >= cutoff)
        & (payments["payment_date"] < cutoff + pd.DateOffset(months=6))
    ]

    # Active free users
    pay_accs = set(p_pre["acc_id"])
    since = cutoff - pd.DateOffset(months=6)
    active_usage = set(u_pre[u_pre["period"] >= since]["acc_id"])
    active_pay = set(p_pre[p_pre["payment_date"] >= since]["acc_id"])
    active_set = active_usage | active_pay
    free_ids = active_set - pay_accs

    converted_ids = free_ids & set(p_post["acc_id"])
    print(f"  Active Free: {len(free_ids):,} | Converted: {len(converted_ids):,} ({len(converted_ids)/max(1,len(free_ids)):.1%})")

    feat = _build_conversion_features(users, usage, free_ids, cutoff)
    if len(feat) == 0:
        print("  No free users — skipping conversion model")
        return {"metrics": {}}

    feat["label"] = feat["acc_id"].isin(converted_ids).astype(int)
    X = feat[CONVERSION_FEATURES].fillna(0)
    y = feat["label"]

    if y.sum() < 5:
        print(f"  Only {y.sum()} conversions — too few to train, skipping")
        return {"metrics": {"skipped": True, "n_converted": int(y.sum())}}

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.25, random_state=CONVERSION_RANDOM_STATE, stratify=y,
    )

    # Optuna
    def objective(trial):
        params = {
            "n_estimators":     trial.suggest_int("n_estimators", 50, 300),
            "max_depth":        trial.suggest_int("max_depth", 3, 6),
            "learning_rate":    trial.suggest_float("lr", 0.01, 0.2, log=True),
            "subsample":        trial.suggest_float("sub", 0.5, 1.0),
            "colsample_bytree": trial.suggest_float("col", 0.5, 1.0),
            "min_child_weight": trial.suggest_int("mcw", 1, 20),
            "scale_pos_weight": trial.suggest_float("spw", 1.0, 20.0),
            "random_state": CONVERSION_RANDOM_STATE, "verbose": -1,
        }
        m = lgb.LGBMClassifier(**params)
        m.fit(X_tr, y_tr)
        return roc_auc_score(y_te, m.predict_proba(X_te)[:, 1])

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=CONVERSION_OPTUNA_TRIALS, show_progress_bar=False)
    best_params = {
        **study.best_params,
        "random_state": CONVERSION_RANDOM_STATE,
        "verbose": -1,
    }
    for old, new in [("lr", "learning_rate"), ("sub", "subsample"), ("col", "colsample_bytree"), ("mcw", "min_child_weight"), ("spw", "scale_pos_weight")]:
        if old in best_params:
            best_params[new] = best_params.pop(old)

    print(f"  Optuna best AUC: {study.best_value:.4f}")

    lgb_final = lgb.LGBMClassifier(**best_params)
    lgb_final.fit(X_tr, y_tr)

    cal_model = CalibratedClassifierCV(lgb_final, method="isotonic", cv=3)
    cal_model.fit(X_tr, y_tr)

    p_cal = cal_model.predict_proba(X_te)[:, 1]
    metrics = {
        "auc":       round(roc_auc_score(y_te, p_cal), 4),
        "f1":        round(f1_score(y_te, p_cal > 0.5), 4),
        "precision": round(precision_score(y_te, p_cal > 0.5, zero_division=0), 4),
        "recall":    round(recall_score(y_te, p_cal > 0.5), 4),
        "n_free":    len(free_ids),
        "n_converted": len(converted_ids),
    }
    print(f"  Final: AUC={metrics['auc']} F1={metrics['f1']} Prec={metrics['precision']} Rec={metrics['recall']}")

    # Feature importance
    imp = pd.Series(lgb_final.feature_importances_, index=CONVERSION_FEATURES).sort_values(ascending=False)
    print("\n  Feature importance:")
    for f, v in imp.head(8).items():
        print(f"    {f}: {v}")

    with open(out_dir / MODEL_FILES["conversion_model"], "wb") as f:
        dill.dump({
            "model": cal_model,
            "features": CONVERSION_FEATURES,
            "best_params": best_params,
        }, f)

    _save_plots(y_te, p_cal, imp, out_dir)
    return {"metrics": metrics}


def predict(
    users: pd.DataFrame,
    usage: pd.DataFrame,
    free_ids: set,
    cutoff: pd.Timestamp,
    models_dir: Path = MODELS_DIR,
) -> pd.DataFrame:
    """
    คืน DataFrame: acc_id, conversion_probability
    """
    with open(_resolve(models_dir, MODEL_FILES["conversion_model"]), "rb") as f:
        art = dill.load(f)

    feat = _build_conversion_features(users, usage, free_ids, cutoff)
    if len(feat) == 0:
        return pd.DataFrame()

    X = feat[art["features"]].fillna(0)
    probs = art["model"].predict_proba(X)[:, 1]

    out = feat[["acc_id"]].copy()
    out["conversion_probability"] = probs
    return out


def _resolve(models_dir: Path, filename: str) -> Path:
    p = Path(models_dir) / filename
    if p.exists():
        return p
    local = Path(__file__).resolve().parents[2] / "models" / filename
    if local.exists():
        return local
    raise FileNotFoundError(f"Conversion model not found: {filename}")


def _save_plots(y_te, p_cal, imp, out_dir: Path):
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    from sklearn.metrics import roc_curve
    fpr, tpr, _ = roc_curve(y_te, p_cal)
    axes[0].plot(fpr, tpr, label=f"AUC={roc_auc_score(y_te, p_cal):.3f}")
    axes[0].plot([0, 1], [0, 1], "k--")
    axes[0].set_title("Conversion ROC Curve")
    axes[0].legend()
    imp.head(10).plot.barh(ax=axes[1])
    axes[1].set_title("Feature Importance (Conversion)")
    axes[1].invert_yaxis()
    plt.tight_layout()
    plt.savefig(out_dir / "conversion_eval.png", dpi=120)
    plt.close()
