"""
1Moby Analytics — Win-back Model
ทำนาย P(comeback) สำหรับลูกค้าที่ churned ไปแล้ว
ใช้ LightGBM + Optuna, features จาก historical behavior ก่อนหยุด
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
    WINBACK_OPTUNA_TRIALS, WINBACK_RANDOM_STATE,
    MODEL_FILES, MODELS_DIR,
)

WINBACK_FEATURES = [
    "days_since_last_activity",
    "ever_paid",
    "total_revenue_log",
    "n_purchases",
    "usage_total_log",
    "usage_months",
    "usage_avg",
    "usage_recent_3m",
    "usage_decay_ratio",
    "credit_remaining_log",
    "days_as_customer",
    "channel_sms",
    "channel_email",
]


def _build_winback_features(
    users: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    churned_ids: set,
    cutoff: pd.Timestamp,
) -> pd.DataFrame:
    """สร้าง features สำหรับลูกค้า churned"""
    p_pre = payments[payments["payment_date"] < cutoff]
    u_pre = usage[(usage["period"] < cutoff) & (usage["usage"] > 0)]

    # Last activity
    last_pay = p_pre.groupby("acc_id")["payment_date"].max()
    last_use = u_pre.groupby("acc_id")["period"].max()

    # Usage stats
    monthly = u_pre.groupby(["acc_id", "period"])["usage"].sum().reset_index()
    recent_cut = cutoff - pd.DateOffset(months=3)
    prev_cut = cutoff - pd.DateOffset(months=6)

    rows = []
    for acc in churned_ids:
        u = users[users["acc_id"] == acc]
        if len(u) == 0:
            continue
        u = u.iloc[0]

        # Last activity
        lp = last_pay.get(acc, pd.NaT)
        lu = last_use.get(acc, pd.NaT)
        la = max(lp, lu) if pd.notna(lp) and pd.notna(lu) else (lp if pd.notna(lp) else lu)
        days_since = (cutoff - la).days if pd.notna(la) else 9999

        # Payment stats
        acc_pay = p_pre[p_pre["acc_id"] == acc]
        total_rev = acc_pay["amount"].sum() if len(acc_pay) > 0 else 0
        n_purch = len(acc_pay)

        # Usage stats
        acc_monthly = monthly[monthly["acc_id"] == acc].sort_values("period")
        vals = acc_monthly["usage"].values
        u_total = vals.sum() if len(vals) > 0 else 0
        u_months = len(vals)
        u_avg = vals.mean() if len(vals) > 0 else 0
        u_recent = acc_monthly[acc_monthly["period"] >= recent_cut]["usage"].sum()
        u_prev = acc_monthly[(acc_monthly["period"] >= prev_cut) & (acc_monthly["period"] < recent_cut)]["usage"].sum()
        decay = float(u_recent / u_prev) if u_prev > 0 else 0.0

        # Credit remaining
        credit_rem = max(0, float(u.get("credit_sms", 0))) + max(0, float(u.get("credit_email", 0)))

        # Tenure
        days_cust = (cutoff - u["join_date"]).days if pd.notna(u["join_date"]) else 0

        # Channel
        acc_use = u_pre[u_pre["acc_id"] == acc]
        ch_sms = 1 if (acc_use["channel"] == "sms").any() else 0
        ch_email = 1 if (acc_use["channel"] == "email").any() else 0

        rows.append({
            "acc_id": acc,
            "days_since_last_activity": days_since,
            "ever_paid": 1 if n_purch > 0 else 0,
            "total_revenue_log": np.log1p(total_rev),
            "n_purchases": n_purch,
            "usage_total_log": np.log1p(u_total),
            "usage_months": u_months,
            "usage_avg": u_avg,
            "usage_recent_3m": u_recent,
            "usage_decay_ratio": decay,
            "credit_remaining_log": np.log1p(credit_rem),
            "days_as_customer": days_cust,
            "channel_sms": ch_sms,
            "channel_email": ch_email,
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
    Train Win-back model
    Label: 1 = comeback (จ่ายเงินหลัง cutoff), 0 = ไม่กลับมา
    """
    print("\n[Win-back] Training...")

    p_pre = payments[payments["payment_date"] < cutoff]
    u_pre = usage[(usage["period"] < cutoff) & (usage["usage"] > 0)]
    p_post = payments[
        (payments["payment_date"] >= cutoff)
        & (payments["payment_date"] < cutoff + pd.DateOffset(months=6))
    ]

    # Define churned: had activity but not in last active_window
    all_ids = set(users["acc_id"])
    pay_accs = set(p_pre["acc_id"])
    use_accs = set(u_pre["acc_id"])
    ever_active = pay_accs | use_accs

    since = cutoff - pd.DateOffset(months=6)
    active_usage = set(u_pre[u_pre["period"] >= since]["acc_id"])
    active_pay = set(p_pre[p_pre["payment_date"] >= since]["acc_id"])
    active_set = active_usage | active_pay

    churned_ids = ever_active - active_set
    comeback_ids = churned_ids & set(p_post["acc_id"])

    print(f"  Churned: {len(churned_ids):,} | Comeback: {len(comeback_ids):,} ({len(comeback_ids)/len(churned_ids):.1%})")

    # Build features
    feat = _build_winback_features(users, payments, usage, churned_ids, cutoff)
    feat["label"] = feat["acc_id"].isin(comeback_ids).astype(int)

    X = feat[WINBACK_FEATURES].fillna(0)
    y = feat["label"]
    print(f"  Comeback rate: {y.mean():.1%}")

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.25, random_state=WINBACK_RANDOM_STATE, stratify=y
    )

    # Optuna
    def objective(trial):
        params = {
            "n_estimators":     trial.suggest_int("n_estimators", 50, 300),
            "max_depth":        trial.suggest_int("max_depth", 3, 7),
            "learning_rate":    trial.suggest_float("lr", 0.01, 0.2, log=True),
            "subsample":        trial.suggest_float("sub", 0.5, 1.0),
            "colsample_bytree": trial.suggest_float("col", 0.5, 1.0),
            "min_child_weight": trial.suggest_int("mcw", 1, 10),
            "random_state": WINBACK_RANDOM_STATE, "verbose": -1,
        }
        m = lgb.LGBMClassifier(**params)
        m.fit(X_tr, y_tr)
        return roc_auc_score(y_te, m.predict_proba(X_te)[:, 1])

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=WINBACK_OPTUNA_TRIALS, show_progress_bar=False)
    best_params = {
        **study.best_params,
        "random_state": WINBACK_RANDOM_STATE,
        "verbose": -1,
    }
    # Rename Optuna keys
    for old, new in [("lr", "learning_rate"), ("sub", "subsample"), ("col", "colsample_bytree"), ("mcw", "min_child_weight")]:
        if old in best_params:
            best_params[new] = best_params.pop(old)

    print(f"  Optuna best AUC: {study.best_value:.4f}")

    # Final model + calibration
    lgb_final = lgb.LGBMClassifier(**best_params)
    lgb_final.fit(X_tr, y_tr)

    cal_model = CalibratedClassifierCV(lgb_final, method="isotonic", cv=5)
    cal_model.fit(X_tr, y_tr)

    p_cal = cal_model.predict_proba(X_te)[:, 1]
    metrics = {
        "auc":       round(roc_auc_score(y_te, p_cal), 4),
        "f1":        round(f1_score(y_te, p_cal > 0.5), 4),
        "precision": round(precision_score(y_te, p_cal > 0.5, zero_division=0), 4),
        "recall":    round(recall_score(y_te, p_cal > 0.5), 4),
        "n_churned": len(churned_ids),
        "n_comeback": len(comeback_ids),
    }
    print(f"  Final: AUC={metrics['auc']} F1={metrics['f1']} Prec={metrics['precision']} Rec={metrics['recall']}")

    # Feature importance
    imp = pd.Series(lgb_final.feature_importances_, index=WINBACK_FEATURES).sort_values(ascending=False)
    print("\n  Feature importance:")
    for f, v in imp.head(8).items():
        print(f"    {f}: {v}")

    # Save
    with open(out_dir / MODEL_FILES["winback_model"], "wb") as f:
        dill.dump({
            "model": cal_model,
            "features": WINBACK_FEATURES,
            "best_params": best_params,
        }, f)

    _save_plots(y_te, p_cal, imp, out_dir)
    return {"metrics": metrics}


def predict(
    users: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    churned_ids: set,
    cutoff: pd.Timestamp,
    models_dir: Path = MODELS_DIR,
) -> pd.DataFrame:
    """
    คืน DataFrame: acc_id, comeback_probability, winback_tier, winback_action
    """
    with open(_resolve(models_dir, MODEL_FILES["winback_model"]), "rb") as f:
        art = dill.load(f)

    feat = _build_winback_features(users, payments, usage, churned_ids, cutoff)
    if len(feat) == 0:
        return pd.DataFrame()

    X = feat[art["features"]].fillna(0)
    probs = art["model"].predict_proba(X)[:, 1]

    out = feat[["acc_id"]].copy()
    out["comeback_probability"] = probs
    out["winback_tier"] = pd.cut(
        probs, bins=[0, 0.10, 0.25, 1.01],
        labels=["Low", "Medium", "High"], right=False,
    )
    out["winback_action"] = out.apply(
        lambda r: _action(r["winback_tier"], feat[feat["acc_id"] == r["acc_id"]].iloc[0]),
        axis=1,
    )
    return out


def _action(tier: str, row: pd.Series) -> str:
    ever_paid = row.get("ever_paid", 0)
    days = row.get("days_since_last_activity", 9999)
    if tier == "High" and ever_paid:
        return "โทรหาทันที — เสนอ special offer"
    elif tier == "High":
        return "ส่ง promo package + โทรติดตาม"
    elif tier == "Medium" and days < 365:
        return "ส่ง email win-back campaign"
    elif tier == "Medium":
        return "ส่ง SMS reminder + discount code"
    else:
        return "Email campaign เท่านั้น (low priority)"


def _resolve(models_dir: Path, filename: str) -> Path:
    p = Path(models_dir) / filename
    if p.exists():
        return p
    local = Path(__file__).resolve().parents[2] / "models" / filename
    if local.exists():
        return local
    raise FileNotFoundError(f"Win-back model not found: {filename}")


def _save_plots(y_te, p_cal, imp, out_dir: Path):
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    from sklearn.metrics import roc_curve
    fpr, tpr, _ = roc_curve(y_te, p_cal)
    axes[0].plot(fpr, tpr, label=f"AUC={roc_auc_score(y_te, p_cal):.3f}")
    axes[0].plot([0, 1], [0, 1], "k--")
    axes[0].set_title("Win-back ROC Curve")
    axes[0].legend()
    imp.head(10).plot.barh(ax=axes[1])
    axes[1].set_title("Feature Importance (Win-back)")
    axes[1].invert_yaxis()
    plt.tight_layout()
    plt.savefig(out_dir / "winback_eval.png", dpi=120)
    plt.close()
