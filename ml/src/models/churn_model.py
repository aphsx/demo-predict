"""
1Moby Analytics — Churn Prediction Model
LightGBM + Isotonic Calibration
60/20/20 split, Optuna บน val set, leakage audit
"""

import dill
import json
import shap
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
import optuna
optuna.logging.set_verbosity(optuna.logging.WARNING)

from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    roc_auc_score, f1_score, precision_score,
    recall_score, confusion_matrix, roc_curve,
)
import lightgbm as lgb
import xgboost as xgb

from src.config import (
    CHURN_THRESHOLDS, CHURN_OPTUNA_TRIALS, CHURN_RANDOM_STATE,
    LEAK_SUSPECT_FEATURES, MODEL_FILES, MODELS_DIR,
)


FEAT_COLS_CACHE: list[str] = []


def train(feat_df: pd.DataFrame, active_set: set,
          active_post_set: set, out_dir: Path = MODELS_DIR) -> dict:
    """
    Train Churn model และ save artifacts

    Parameters
    ----------
    feat_df        : output จาก features.build_features()
    active_set     : set ของ acc_id ที่ active ก่อน cutoff
    active_post_set: set ของ acc_id ที่ active หลัง cutoff (label=0 ถ้าอยู่ใน set)

    Returns
    -------
    metrics dict
    """
    print("\n[Churn] Training...")

    df = feat_df[feat_df["acc_id"].isin(active_set)].copy()
    df["label"] = (~df["acc_id"].isin(active_post_set)).astype(int)

    global FEAT_COLS_CACHE
    FEAT_COLS_CACHE = [c for c in df.columns if c not in ["acc_id", "label"]]
    X = df[FEAT_COLS_CACHE]
    y = df["label"]
    print(f"  Population: {len(df):,} | Churn rate: {y.mean():.1%}")

    # ── FIX V3: 60/20/20 split ───────────────────────────────────
    X_tr, X_tmp, y_tr, y_tmp = train_test_split(
        X, y, test_size=0.40, random_state=CHURN_RANDOM_STATE, stratify=y)
    X_val, X_te, y_val, y_te = train_test_split(
        X_tmp, y_tmp, test_size=0.50, random_state=CHURN_RANDOM_STATE, stratify=y_tmp)
    print(f"  Split: train={len(X_tr):,} val={len(X_val):,} test={len(X_te):,}")

    scaler  = StandardScaler()
    X_tr_s  = scaler.fit_transform(X_tr)
    X_val_s = scaler.transform(X_val)
    X_te_s  = scaler.transform(X_te)

    # ── Model competition (eval บน val) ──────────────────────────
    competition = _run_competition(X_tr, X_tr_s, y_tr, X_val, X_val_s, y_val)
    _print_competition(competition)

    # ── Optuna — eval บน val เท่านั้น ────────────────────────────
    def objective(trial):
        params = {
            "n_estimators":     trial.suggest_int("n_estimators", 50, 300),
            "max_depth":        trial.suggest_int("max_depth", 3, 8),
            "learning_rate":    trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "subsample":        trial.suggest_float("subsample", 0.5, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
            "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
            "random_state": CHURN_RANDOM_STATE, "verbose": -1,
        }
        m = lgb.LGBMClassifier(**params)
        m.fit(X_tr, y_tr)
        return roc_auc_score(y_val, m.predict_proba(X_val)[:, 1])

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=CHURN_OPTUNA_TRIALS, show_progress_bar=False)
    best_params = {**study.best_params, "random_state": CHURN_RANDOM_STATE, "verbose": -1}
    print(f"  Optuna best AUC (val): {study.best_value:.4f}")

    # ── Final model: fit บน train+val ────────────────────────────
    X_trainval = pd.concat([X_tr, X_val])
    y_trainval = pd.concat([y_tr, y_val])
    lgb_tuned  = lgb.LGBMClassifier(**best_params)
    lgb_tuned.fit(X_trainval, y_trainval)

    cal_model = CalibratedClassifierCV(lgb_tuned, method="isotonic", cv=5)
    cal_model.fit(X_trainval, y_trainval)

    # ── Leakage audit ─────────────────────────────────────────────
    leakage = _leakage_audit(lgb_tuned, X_trainval, y_trainval, X_te, y_te, FEAT_COLS_CACHE)

    # ── Final metrics on test (never seen) ───────────────────────
    p_cal = cal_model.predict_proba(X_te)[:, 1]
    metrics = {
        "auc":       round(roc_auc_score(y_te, p_cal), 4),
        "f1":        round(f1_score(y_te, p_cal > 0.5), 4),
        "precision": round(precision_score(y_te, p_cal > 0.5, zero_division=0), 4),
        "recall":    round(recall_score(y_te, p_cal > 0.5), 4),
        **leakage,
    }
    cm = confusion_matrix(y_te, p_cal > 0.5)
    print(f"\n  Final (test set): AUC={metrics['auc']} F1={metrics['f1']} "
          f"Prec={metrics['precision']} Rec={metrics['recall']}")
    print(f"  CM: TN={cm[0,0]} FP={cm[0,1]} FN={cm[1,0]} TP={cm[1,1]}")

    # ── SHAP ─────────────────────────────────────────────────────
    explainer  = shap.TreeExplainer(lgb_tuned)
    shap_vals  = explainer.shap_values(X_te)
    if isinstance(shap_vals, list):
        shap_vals = shap_vals[1]
    shap_mean  = np.abs(shap_vals).mean(axis=0)
    shap_df    = pd.DataFrame({"feature": FEAT_COLS_CACHE, "shap": shap_mean}).sort_values("shap", ascending=False)
    print("\n  SHAP Top 10:")
    print(shap_df.head(10).to_string(index=False))

    # ── Save plots ────────────────────────────────────────────────
    _save_plots(y_te, p_cal, cm, out_dir)
    _save_shap_plot(shap_df, out_dir)

    # ── Save model artifacts ──────────────────────────────────────
    with open(out_dir / MODEL_FILES["churn_model"], "wb") as f:
        dill.dump({"model": cal_model, "scaler": scaler, "features": FEAT_COLS_CACHE,
                   "best_params": best_params}, f)
    with open(out_dir / MODEL_FILES["churn_scaler"], "wb") as f:
        dill.dump(scaler, f)

    return {"metrics": metrics, "competition": competition, "shap": shap_df.head(10).to_dict("records")}


def predict(feat_df: pd.DataFrame, models_dir: Path = MODELS_DIR) -> pd.DataFrame:
    """
    คืน DataFrame: acc_id, churn_probability
    """
    artifact   = _load_artifact(models_dir)
    model      = artifact["model"]
    feat_cols  = artifact["features"]

    X     = feat_df[feat_cols].fillna(0)
    probs = model.predict_proba(X)[:, 1]

    out   = feat_df[["acc_id"]].copy()
    out["churn_probability"] = probs
    return out


def explain(acc_id: int, feat_df: pd.DataFrame,
            models_dir: Path = MODELS_DIR, top_n: int = 3) -> dict:
    """
    SHAP explanation สำหรับลูกค้า 1 คน
    Returns: {"acc_id", "churn_probability", "top_risk_factors": [str]}
    """
    artifact  = _load_artifact(models_dir)
    feat_cols = artifact["features"]
    lgb_model = artifact["model"].calibrated_classifiers_[0].estimator

    row = feat_df[feat_df["acc_id"] == acc_id][feat_cols].fillna(0)
    if len(row) == 0:
        return {"acc_id": acc_id, "error": "not found"}

    prob      = artifact["model"].predict_proba(row)[:, 1][0]
    explainer = shap.TreeExplainer(lgb_model)
    sv        = explainer.shap_values(row)
    if isinstance(sv, list):
        sv = sv[1]

    sv_series = pd.Series(sv[0], index=feat_cols).sort_values(key=abs, ascending=False)
    reasons   = [_shap_to_text(feat, sv_series[feat], float(row[feat].iloc[0]))
                 for feat in sv_series.head(top_n).index]

    return {"acc_id": acc_id, "churn_probability": round(float(prob), 4),
            "top_risk_factors": reasons}


def what_if(acc_id: int, feature: str, new_value: float,
            feat_df: pd.DataFrame, models_dir: Path = MODELS_DIR) -> dict:
    """
    ถ้าเปลี่ยน feature นี้เป็น new_value จะเกิดอะไร?
    """
    artifact  = _load_artifact(models_dir)
    feat_cols = artifact["features"]
    model     = artifact["model"]

    row = feat_df[feat_df["acc_id"] == acc_id][feat_cols].fillna(0).copy()
    if len(row) == 0:
        return {"acc_id": acc_id, "error": "not found"}
    if feature not in feat_cols:
        return {"acc_id": acc_id, "error": f"feature '{feature}' not found"}

    orig_prob = float(model.predict_proba(row)[:, 1][0])
    row[feature] = new_value
    new_prob  = float(model.predict_proba(row)[:, 1][0])

    return {
        "acc_id": acc_id, "feature": feature, "new_value": new_value,
        "original_probability": round(orig_prob, 4),
        "new_probability":      round(new_prob, 4),
        "delta":                round(new_prob - orig_prob, 4),
    }


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def _load_artifact(models_dir: Path) -> dict:
    path = _resolve_model_file(models_dir, MODEL_FILES["churn_model"])
    with open(path, "rb") as f:
        return dill.load(f)


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


def _run_competition(X_tr, X_tr_s, y_tr, X_val, X_val_s, y_val) -> dict:
    results = {}
    lr = LogisticRegression(max_iter=1000, random_state=CHURN_RANDOM_STATE)
    lr.fit(X_tr_s, y_tr)
    p = lr.predict_proba(X_val_s)[:, 1]
    results["Logistic Regression"] = _score(y_val, p)

    rf = RandomForestClassifier(n_estimators=200, random_state=CHURN_RANDOM_STATE, n_jobs=-1)
    rf.fit(X_tr, y_tr)
    p = rf.predict_proba(X_val)[:, 1]
    results["Random Forest"] = _score(y_val, p)

    xgb_m = xgb.XGBClassifier(n_estimators=200, random_state=CHURN_RANDOM_STATE,
                                eval_metric="logloss", verbosity=0)
    xgb_m.fit(X_tr, y_tr)
    p = xgb_m.predict_proba(X_val)[:, 1]
    results["XGBoost"] = _score(y_val, p)

    lgb_m = lgb.LGBMClassifier(n_estimators=200, random_state=CHURN_RANDOM_STATE, verbose=-1)
    lgb_m.fit(X_tr, y_tr)
    p = lgb_m.predict_proba(X_val)[:, 1]
    results["LightGBM"] = _score(y_val, p)
    return results


def _score(y_true, probs) -> dict:
    return {
        "auc":       round(roc_auc_score(y_true, probs), 4),
        "f1":        round(f1_score(y_true, probs > 0.5), 4),
        "precision": round(precision_score(y_true, probs > 0.5, zero_division=0), 4),
        "recall":    round(recall_score(y_true, probs > 0.5), 4),
    }


def _print_competition(results: dict) -> None:
    print(f"\n  Model competition (val set):")
    print(f"  {'Model':<22} {'AUC':>6} {'F1':>6} {'Prec':>6} {'Rec':>6}")
    for name, r in results.items():
        print(f"  {name:<22} {r['auc']:.3f} {r['f1']:.3f} {r['precision']:.3f} {r['recall']:.3f}")


def _leakage_audit(model, X_tr, y_tr, X_te, y_te, feat_cols: list) -> dict:
    """FIX: ฝึก m_safe บน train set แล้ววัดผลบน test set (ไม่ใช่ train+eval บน test เดียวกัน)"""
    present = [f for f in LEAK_SUSPECT_FEATURES if f in feat_cols]
    safe    = [c for c in feat_cols if c not in present]
    m_safe  = lgb.LGBMClassifier(n_estimators=200, random_state=CHURN_RANDOM_STATE, verbose=-1)
    m_safe.fit(X_tr[safe], y_tr)
    auc_full  = roc_auc_score(y_te, model.predict_proba(X_te)[:, 1])
    auc_safe  = roc_auc_score(y_te, m_safe.predict_proba(X_te[safe])[:, 1])
    drop      = round(auc_full - auc_safe, 4)
    print(f"\n  Leakage audit: AUC_full={auc_full:.4f} AUC_safe={auc_safe:.4f} drop={drop}")
    if drop > 0.05:
        print("  [WARN]  AUC drop > 0.05 -> investigate leak-suspect features")
    else:
        print("  [OK]  No significant leakage detected")
    return {"auc_without_leak_suspects": round(auc_safe, 4),
            "auc_drop_leakage_test": drop}


def _shap_to_text(feature: str, shap_val: float, feat_value: float) -> str:
    direction = "สูง" if shap_val > 0 else "ต่ำ"
    labels = {
        "days_since_last_send":    f"ไม่ส่งข้อความมา {int(feat_value)} วัน",
        "days_since_last_access":  f"ไม่ login มา {int(feat_value)} วัน",
        "days_until_sms_expire":   f"เครดิตหมดอายุใน {int(feat_value)} วัน",
        "usage_recent_3m":         f"ใช้งาน {int(feat_value):,} ข้อความใน 3 เดือนล่าสุด",
        "usage_months":            f"เคย active {int(feat_value)} เดือน",
        "usage_decay_ratio":       f"Usage ลดลง (ratio={feat_value:.2f})",
        "pay_recency_days":        f"ไม่ซื้อเครดิตมา {int(feat_value)} วัน",
        "pay_overdue_ratio":       f"เกินรอบซื้อปกติ {feat_value:.1f} เท่า",
        "credit_sms_log":          f"เครดิต SMS เหลือน้อย",
    }
    return labels.get(feature, f"{feature} = {feat_value:.2f} ({direction}ผิดปกติ)")


def _save_plots(y_te, p_cal, cm, out_dir: Path) -> None:
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    fpr, tpr, _ = roc_curve(y_te, p_cal)
    axes[0].plot(fpr, tpr, label=f"AUC={roc_auc_score(y_te, p_cal):.3f}")
    axes[0].plot([0, 1], [0, 1], "k--"); axes[0].set_title("ROC Curve"); axes[0].legend()
    sns.heatmap(cm, annot=True, fmt="d", ax=axes[1], cmap="Blues")
    axes[1].set_title("Confusion Matrix")
    prob_true, prob_pred = calibration_curve(y_te, p_cal, n_bins=10)
    axes[2].plot(prob_pred, prob_true, "s-", label="Calibrated LightGBM")
    axes[2].plot([0, 1], [0, 1], "k--"); axes[2].set_title("Calibration Plot"); axes[2].legend()
    plt.tight_layout()
    plt.savefig(out_dir / "churn_eval.png", dpi=120)
    plt.close()


def _save_shap_plot(shap_df: pd.DataFrame, out_dir: Path) -> None:
    fig, ax = plt.subplots(figsize=(8, 6))
    shap_df.head(15).plot.barh(x="feature", y="shap", ax=ax, legend=False)
    ax.set_title("SHAP Feature Importance (Churn)"); ax.invert_yaxis()
    plt.tight_layout()
    plt.savefig(out_dir / "churn_shap.png", dpi=120)
    plt.close()
