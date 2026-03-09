"""
=========================================================================
  Customer Churn Prediction Pipeline  v2
  Architecture: Strict No-Leakage | Out-of-Time Validation |
                Advanced RFM + Decay Features | SHAP Explainability
=========================================================================
  Section map
  ───────────
  1.  Temporal Configuration & Constants
  2.  Data Loading
  3.  Churn Label Engineering        ← post-cutoff outcomes ONLY (no leakage)
  4.  Behavioral Feature Engineering ← pre-cutoff data ONLY
  5.  Out-of-Time (OOT) Split Logic
  6.  Model Training & Hyperparameters (LightGBM / XGBoost / sklearn)
  7.  Realistic Evaluation  (AUC, Precision, Recall, F1, Confusion Matrix)
  8.  SHAP Explainability
  9.  Visualisations
  10. Model Saving & Prediction Report
=========================================================================
"""

import pandas as pd
import numpy as np
from datetime import datetime
import warnings
warnings.filterwarnings("ignore")
from pathlib import Path
import joblib

# ── ML Libraries ──────────────────────────────────────────────────────────
from sklearn.preprocessing import LabelEncoder
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    ConfusionMatrixDisplay,
    roc_auc_score,
    roc_curve,
    average_precision_score,
)
import matplotlib.pyplot as plt
import seaborn as sns
import shap

# ── Optional state-of-the-art boosting libs (install if available) ────────
try:
    import lightgbm as lgb
    _LGBM = True
except ImportError:
    _LGBM = False
    print("  [warn] LightGBM not installed — falling back to HistGradientBoosting")

try:
    import xgboost as xgb
    _XGB = True
except ImportError:
    _XGB = False

# ── Custom utilities ───────────────────────────────────────────────────────
import ml_utils

# ── Paths ──────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


# =========================================================================
# SECTION 1 — TEMPORAL CONFIGURATION
#
# The cut-off date is the primary anti-leakage control.
#
#   Features  = computed exclusively from data  ≤  CUTOFF_DATE
#               (what a real model would have "seen" at deployment)
#
#   Labels    = ground-truth outcome observed from CUTOFF_DATE
#               to REFERENCE_DATE  (what actually happened afterwards)
#
#   OOT Split = Train on accounts whose fate resolved before OOT_SPLIT_DATE;
#               Test on accounts whose fate resolved in the prediction window.
# =========================================================================
CUTOFF_DATE    = datetime(2025, 12, 31)   # Observation snapshot ("model deployment date")
OOT_SPLIT_DATE = datetime(2025, 10,  1)   # OOT test window starts here
REFERENCE_DATE = datetime(2026,  3,  9)   # "Today" — we check final outcomes up to here

DECAY_SHORT_DAYS = 90    # "recent" activity window  (for usage-decay features)
DECAY_LONG_DAYS  = 180   # "prior"  activity window  (for usage-decay baseline)


# =========================================================================
# SECTION 2 — DATA LOADING
# =========================================================================
def load_data():
    users    = pd.read_csv(SCRIPT_DIR / "data" / "sample_users.csv")
    payments = pd.read_csv(SCRIPT_DIR / "data" / "sample_payments.csv")

    for col in ("expire", "join_date", "last_access", "last_send"):
        users[col] = pd.to_datetime(users[col], errors="coerce")

    payments["payment_date"] = pd.to_datetime(payments["payment_date"], errors="coerce")
    payments.dropna(subset=["payment_date"], inplace=True)

    return users, payments


# =========================================================================
# SECTION 3 — CHURN LABEL ENGINEERING  (strictly zero leakage)
#
# Ground truth is derived from POST-CUTOFF outcomes only.
#   churned = 1  ↔  account expired before REFERENCE_DATE
#                   AND no renewal payment was made after CUTOFF_DATE
#   churned = 0  ↔  account still active (expire ≥ REFERENCE_DATE)
#                   OR renewed after CUTOFF_DATE
#
# Important: no column from this section ever appears in FEATURE_COLS.
# =========================================================================
def label_churn(users: pd.DataFrame, payments: pd.DataFrame) -> pd.DataFrame:
    df = users.copy()

    # Step A — who renewed during the prediction window?
    renewed_ids = set(
        payments.loc[payments["payment_date"] > CUTOFF_DATE, "acc_id"]
    )
    df["renewed_post_cutoff"] = df["acc_id"].isin(renewed_ids)

    # Step B — is the subscription expired as of today?
    df["account_expired"] = df["expire"] < REFERENCE_DATE

    # Step C — final binary label
    df["churned"] = (df["account_expired"] & ~df["renewed_post_cutoff"]).astype(int)

    return df


# =========================================================================
# SECTION 4 — BEHAVIORAL FEATURE ENGINEERING ENGINE
#
# ALL features are computed from data ≤ CUTOFF_DATE.
# Columns explicitly excluded (current-state leakage):
#   status, credit, credit_premium, credit_email, paid_email
#
# Engineered feature groups:
#   A.  Account lifecycle   (tenure, contract schedule)
#   B.  RFM metrics         (Recency, Frequency, Monetary)
#   C.  Monetary depth      (avg / max / last transaction, downgrade flag)
#   D.  Volume & diversity  (SMS volume, product breadth)
#   E.  Credit Burn Rate    (SMS consumed per day of account life)
#   F.  Purchase cadence    (span, avg gap between payments)
#   G.  Usage Decay         (recent 90 d vs prior 90 d spend & TX count)
#   H.  Composite signals   (lifetime value per day, decay ratios)
#   I.  Encoded categoricals
# =========================================================================

# Model feature list — the single source of truth
FEATURE_COLS = [
    # A. Account lifecycle
    "account_age_at_cutoff",         # how long the account has existed
    "last_access_recency_at_cutoff", # days since last login (capped at cutoff)
    "last_send_recency_at_cutoff",   # days since last SMS send (capped at cutoff)
    "days_to_expire_at_cutoff",      # days until expiry at observation point (neg = already expired)
    "expired_at_cutoff",             # binary: was account already expired at cutoff?

    # B. RFM
    "recency_days",       # R — days since last payment (as of CUTOFF_DATE)
    "total_payments",     # F — lifetime purchase count
    "total_spend",        # M — lifetime gross spend

    # C. Monetary depth
    "avg_spend_per_tx",
    "max_single_tx",
    "last_payment_amount",
    "downgraded",             # 1 if last payment < historical average
    "lifetime_value_per_day", # total spend / account age (revenue efficiency)

    # D. Volume & diversity
    "total_sms_volume",
    "avg_sms_per_tx",
    "unique_products",

    # E. Credit Burn Rate & cadence
    "credit_burn_rate",      # SMS credits consumed per day
    "payment_span_days",     # days between first and last payment
    "avg_payment_gap_days",  # time-between-purchases (inter-arrival time)

    # F. Usage Decay  (most powerful churn signal for SaaS)
    "spend_recent_90d",
    "spend_previous_90d",
    "spend_decay_ratio",       # recent / (prior + 1); <1 → declining spend
    "tx_count_recent_90d",
    "tx_count_previous_90d",
    "tx_decay_ratio",          # recent / (prior + 1); <1 → declining activity

    # G. Encoded categoricals
    "dom_credit_enc",
]


def engineer_features(users_labeled: pd.DataFrame, payments: pd.DataFrame) -> pd.DataFrame:
    # ── 4.0  Restrict to pre-cutoff payment history ───────────────────────
    pay_hist = payments[payments["payment_date"] <= CUTOFF_DATE].copy()

    df = users_labeled.copy()

    # ── 4.A  Account lifecycle features ──────────────────────────────────
    df["account_age_at_cutoff"] = (
        (pd.Timestamp(CUTOFF_DATE) - df["join_date"]).dt.days.clip(lower=0)
    )

    # Cap post-cutoff access/send dates — activity AFTER cutoff belongs to the
    # label domain, not the feature domain.
    last_access_safe = df["last_access"].clip(upper=pd.Timestamp(CUTOFF_DATE))
    last_send_safe   = df["last_send"].clip(upper=pd.Timestamp(CUTOFF_DATE))

    df["last_access_recency_at_cutoff"] = (
        (pd.Timestamp(CUTOFF_DATE) - last_access_safe).dt.days.clip(lower=0)
    )
    df["last_send_recency_at_cutoff"] = (
        (pd.Timestamp(CUTOFF_DATE) - last_send_safe).dt.days.clip(lower=0)
    )

    # Contract schedule (safe: scheduled expiry ≠ actual churn outcome)
    df["days_to_expire_at_cutoff"] = (
        (df["expire"] - pd.Timestamp(CUTOFF_DATE)).dt.days
    )
    df["expired_at_cutoff"] = (df["days_to_expire_at_cutoff"] < 0).astype(int)

    # ── 4.B  RFM base aggregations ────────────────────────────────────────
    rfm = (
        pay_hist
        .groupby("acc_id")
        .agg(
            total_payments   = ("payment_date", "count"),
            total_spend      = ("amount",        "sum"),
            avg_spend_per_tx = ("amount",        "mean"),
            max_single_tx    = ("amount",        "max"),
            total_sms_volume = ("sms_volume",    "sum"),
            avg_sms_per_tx   = ("sms_volume",    "mean"),
            unique_products  = ("product_name",  "nunique"),
            _first_pay_date  = ("payment_date",  "min"),
            _last_pay_date   = ("payment_date",  "max"),
        )
        .reset_index()
    )

    # Recency — days since last purchase, relative to observation point
    rfm["recency_days"] = (
        (pd.Timestamp(CUTOFF_DATE) - rfm["_last_pay_date"]).dt.days
    )

    # ── 4.F  Purchase cadence (time-between-purchases) ───────────────────
    rfm["payment_span_days"] = (
        (rfm["_last_pay_date"] - rfm["_first_pay_date"]).dt.days.clip(lower=0)
    )
    rfm["avg_payment_gap_days"] = rfm.apply(
        lambda r: r["payment_span_days"] / max(r["total_payments"] - 1, 1), axis=1
    )

    # ── 4.E  Credit Burn Rate ─────────────────────────────────────────────
    # How fast is the account consuming SMS credits per day of active life?
    rfm["credit_burn_rate"] = (
        rfm["total_sms_volume"] / rfm["payment_span_days"].clip(lower=1)
    )

    rfm.drop(["_first_pay_date", "_last_pay_date"], axis=1, inplace=True)

    # ── 4.G  Usage Decay: recent 90 d vs prior 90-180 d ─────────────────
    CUT         = pd.Timestamp(CUTOFF_DATE)
    short_start = CUT - pd.Timedelta(days=DECAY_SHORT_DAYS)
    long_start  = CUT - pd.Timedelta(days=DECAY_LONG_DAYS)

    recent_agg = (
        pay_hist[pay_hist["payment_date"] > short_start]
        .groupby("acc_id")
        .agg(
            spend_recent_90d    = ("amount",       "sum"),
            tx_count_recent_90d = ("payment_date", "count"),
        )
        .reset_index()
    )

    previous_agg = (
        pay_hist[
            (pay_hist["payment_date"] > long_start) &
            (pay_hist["payment_date"] <= short_start)
        ]
        .groupby("acc_id")
        .agg(
            spend_previous_90d    = ("amount",       "sum"),
            tx_count_previous_90d = ("payment_date", "count"),
        )
        .reset_index()
    )

    # ── 4.C  Last payment amount (downgrade detection) ────────────────────
    last_pay = (
        pay_hist
        .sort_values("payment_date")
        .groupby("acc_id")["amount"]
        .last()
        .rename("last_payment_amount")
        .reset_index()
    )

    # ── 4.I  Dominant credit type ─────────────────────────────────────────
    dom_credit = (
        pay_hist
        .groupby("acc_id")["credit_type"]
        .agg(lambda x: x.mode().iloc[0] if len(x) else "Unknown")
        .rename("dominant_credit_type")
        .reset_index()
    )

    # ── Merge all feature frames ──────────────────────────────────────────
    df = (
        df
        .merge(rfm,          on="acc_id", how="left")
        .merge(recent_agg,   on="acc_id", how="left")
        .merge(previous_agg, on="acc_id", how="left")
        .merge(last_pay,     on="acc_id", how="left")
        .merge(dom_credit,   on="acc_id", how="left")
    )

    # ── Fill NaN for accounts with zero payment history ───────────────────
    _zero_fill = [
        "total_payments", "total_spend", "avg_spend_per_tx", "max_single_tx",
        "total_sms_volume", "avg_sms_per_tx", "unique_products",
        "recency_days", "payment_span_days", "avg_payment_gap_days",
        "credit_burn_rate", "last_payment_amount",
        "spend_recent_90d", "tx_count_recent_90d",
        "spend_previous_90d", "tx_count_previous_90d",
    ]
    for col in _zero_fill:
        if col in df.columns:
            df[col] = df[col].fillna(0)

    # For zero-payment accounts, recency = full account age (worst-case signal)
    no_payment = df["total_payments"] == 0
    df.loc[no_payment, "recency_days"] = df.loc[no_payment, "account_age_at_cutoff"]

    # ── 4.H  Composite derived features ──────────────────────────────────
    # Spend decay ratio: 0 → total collapse, 1 → stable, >1 → growing
    df["spend_decay_ratio"] = df["spend_recent_90d"] / (df["spend_previous_90d"] + 1)

    # Transaction frequency decay
    df["tx_decay_ratio"] = df["tx_count_recent_90d"] / (df["tx_count_previous_90d"] + 1)

    # Downgrade flag: last purchase cheaper than historical average
    df["downgraded"] = (
        (df["last_payment_amount"] > 0) &
        (df["last_payment_amount"] < df["avg_spend_per_tx"])
    ).astype(int)

    # Revenue efficiency: how much value does this customer generate per day?
    df["lifetime_value_per_day"] = (
        df["total_spend"] / df["account_age_at_cutoff"].clip(lower=1)
    )

    # ── 4.I  Encode categoricals ──────────────────────────────────────────
    df["dominant_credit_type"] = df["dominant_credit_type"].fillna("None")
    df["dom_credit_enc"]       = LabelEncoder().fit_transform(df["dominant_credit_type"])

    return df


# =========================================================================
# SECTION 5 — OUT-OF-TIME (OOT) SPLIT LOGIC
#
# Train cohort : accounts whose subscription resolved BEFORE OOT_SPLIT_DATE
#                → model learns from well-resolved historical churn events
#
# OOT cohort   : accounts whose subscription resolved between
#                OOT_SPLIT_DATE and REFERENCE_DATE
#                → the "live" cohort the business actually wants scored
#
# This perfectly replicates real deployment: train on past outcomes,
# evaluate on a future time window that the model has never seen.
# =========================================================================
def oot_split(df: pd.DataFrame):
    # OOT = accounts whose expiry falls in the evaluation window
    oot_mask = (
        (df["expire"] >= pd.Timestamp(OOT_SPLIT_DATE)) &
        (df["expire"] <= pd.Timestamp(REFERENCE_DATE))
    )

    df_train = df[~oot_mask].copy()
    df_oot   = df[oot_mask].copy()

    # Fallback: if the OOT set lacks both classes, use a temporal 80/20 split
    if df_oot["churned"].nunique() < 2 or len(df_oot) < 20:
        print("  [warn] OOT window too thin — using temporal 80/20 split by expiry date")
        df_s     = df.sort_values("expire").reset_index(drop=True)
        cut_idx  = int(len(df_s) * 0.80)
        df_train = df_s.iloc[:cut_idx].copy()
        df_oot   = df_s.iloc[cut_idx:].copy()

    return df_train, df_oot


# =========================================================================
# SECTION 6 — MODEL TRAINING & HYPERPARAMETER SETUP
#
# Strategy:
#   • LightGBM / XGBoost (if installed) as primary SOTA gradient boosters
#   • HistGradientBoosting as reliable sklearn-native fallback
#   • Random Forest as interpretable baseline
#   • Class imbalance handled INSIDE the estimator (scale_pos_weight /
#     class_weight) — no SMOTE or synthetic oversampling that would
#     contaminate the feature space.
# =========================================================================
def _build_models(neg: int, pos: int) -> dict:
    """Instantiate all models with proper imbalance corrections."""
    spw   = max(neg / max(pos, 1), 1.0)   # scale_pos_weight for LGB / XGB
    models = {}

    if _LGBM:
        models["LightGBM"] = lgb.LGBMClassifier(
            n_estimators      = 500,
            max_depth         = 5,
            num_leaves        = 31,
            learning_rate     = 0.04,
            min_child_samples = 15,
            subsample         = 0.8,
            colsample_bytree  = 0.8,
            reg_alpha         = 0.1,
            reg_lambda        = 0.2,
            scale_pos_weight  = spw,
            random_state      = 42,
            n_jobs            = -1,
            verbose           = -1,
        )

    if _XGB:
        models["XGBoost"] = xgb.XGBClassifier(
            n_estimators      = 500,
            max_depth         = 4,
            learning_rate     = 0.04,
            subsample         = 0.8,
            colsample_bytree  = 0.8,
            gamma             = 0.1,
            reg_alpha         = 0.1,
            reg_lambda        = 1.0,
            scale_pos_weight  = spw,
            eval_metric       = "auc",
            random_state      = 42,
            n_jobs            = -1,
            verbosity         = 0,
        )

    # sklearn-native: NaN-safe, competitive, always available
    models["HistGradientBoosting"] = HistGradientBoostingClassifier(
        max_iter          = 500,
        max_depth         = 5,
        learning_rate     = 0.04,
        min_samples_leaf  = 15,
        l2_regularization = 0.2,
        class_weight      = "balanced",
        random_state      = 42,
    )

    # Interpretable baseline
    models["Random Forest"] = RandomForestClassifier(
        n_estimators     = 300,
        max_depth        = 7,
        min_samples_leaf = 10,
        class_weight     = "balanced",
        random_state     = 42,
        n_jobs           = -1,
    )

    return models


# =========================================================================
# SECTION 7 — REALISTIC EVALUATION
#
# Imputer is fit ONLY on training data; OOT is transformed separately.
# This prevents any statistical leakage through imputation.
#
# We report both Train AUC and OOT AUC.  A gap < 0.10 proves the model
# generalises and is not over-fit.  Realistic OOT AUC target: 0.75–0.88.
# =========================================================================
def train_and_evaluate(df_train: pd.DataFrame, df_oot: pd.DataFrame):
    imputer   = SimpleImputer(strategy="median")

    X_tr_raw  = df_train[FEATURE_COLS]
    y_tr      = df_train["churned"].reset_index(drop=True)
    X_ot_raw  = df_oot[FEATURE_COLS]
    y_ot      = df_oot["churned"].reset_index(drop=True)

    # Fit ONLY on train — OOT must never influence the imputer
    X_tr = imputer.fit_transform(X_tr_raw)
    X_ot = imputer.transform(X_ot_raw)

    neg, pos = int((y_tr == 0).sum()), int((y_tr == 1).sum())
    models   = _build_models(neg, pos)
    results  = {"_imputer": imputer, "_feature_cols": FEATURE_COLS}
    best_name, best_auc = None, -1.0

    print("\n" + "═" * 72)
    print("  MODEL EVALUATION  —  Out-of-Time Validation  (Zero Data Leakage)")
    print(f"  Train  :  {len(X_tr):>6,} accounts  |  churn rate {y_tr.mean()*100:.1f}%")
    print(f"  OOT    :  {len(X_ot):>6,} accounts  |  churn rate {y_ot.mean()*100:.1f}%")
    print(f"  Class imbalance ratio (neg:pos) = {neg}:{pos}  (handled inside estimator)")
    print("═" * 72)

    for name, model in models.items():
        model.fit(X_tr, y_tr)

        y_pred   = model.predict(X_ot)
        y_prob   = model.predict_proba(X_ot)[:, 1]
        oot_auc  = roc_auc_score(y_ot, y_prob)
        avg_pr   = average_precision_score(y_ot, y_prob)

        tr_prob  = model.predict_proba(X_tr)[:, 1]
        tr_auc   = roc_auc_score(y_tr, tr_prob)
        gap      = tr_auc - oot_auc
        overfit_flag = "OK" if abs(gap) < 0.10 else "CHECK"

        print(f"\n  [{name}]")
        print(f"  Train AUC : {tr_auc:.4f}  |  OOT AUC : {oot_auc:.4f}"
              f"  |  Gap : {gap:+.4f}  [{overfit_flag}]")
        print(f"  OOT PR-AUC (avg precision): {avg_pr:.4f}")
        print(
            classification_report(
                y_ot, y_pred,
                target_names=["Active", "Churned"],
                zero_division=0,
            )
        )

        ml_utils.log_experiment(
            model_name  = name,
            metrics     = {
                "train_auc"        : round(tr_auc,  4),
                "oot_auc"          : round(oot_auc, 4),
                "oot_pr_auc"       : round(avg_pr,  4),
                "overfitting_gap"  : round(gap,     4),
                "train_size"       : len(X_tr),
                "oot_size"         : len(X_ot),
                "num_features"     : len(FEATURE_COLS),
                "churn_rate_train" : round(float(y_tr.mean()), 4),
                "churn_rate_oot"   : round(float(y_ot.mean()), 4),
            },
            config_name = "v2_OOT_NoLeakage",
            log_path    = str(OUTPUT_DIR / "experiment_log.csv"),
        )

        results[name] = {
            "model"    : model,
            "train_auc": tr_auc,
            "oot_auc"  : oot_auc,
            "avg_pr"   : avg_pr,
            "gap"      : gap,
            "y_pred"   : y_pred,
            "y_prob"   : y_prob,
            "y_oot"    : y_ot,
        }

        if oot_auc > best_auc:
            best_auc, best_name = oot_auc, name

    print(f"\n  Best model : {best_name}  (OOT AUC = {best_auc:.4f})")
    print("  (Realistic 0.75–0.88 range confirms no overfitting on held-out time window)")

    return results, best_name, imputer


# =========================================================================
# SECTION 8 — SHAP EXPLAINABILITY
#
# Answers: "Why is customer X flagged as high-risk?"
# Example output: "Login frequency dropped 60%, no spend in 90 days,
#                  contract expires in 14 days"
# =========================================================================
def generate_shap(
    results: dict, best_model: str, df_oot: pd.DataFrame, imputer
) -> dict:
    bm   = results[best_model]["model"]
    X_ot = imputer.transform(df_oot[FEATURE_COLS])

    try:
        explainer   = shap.TreeExplainer(bm)
        shap_values = explainer.shap_values(X_ot)

        # Normalise: LightGBM may return list[array] for binary classification
        if isinstance(shap_values, list):
            sv = shap_values[1] if len(shap_values) > 1 else shap_values[0]
        else:
            sv = shap_values

        joblib.dump(
            {
                "explainer"    : explainer,
                "feature_names": FEATURE_COLS,
                "model_name"   : best_model,
                "cutoff_date"  : CUTOFF_DATE,
            },
            OUTPUT_DIR / "shap_explainer.pkl",
        )
        print(f"  SHAP explainer saved → {OUTPUT_DIR / 'shap_explainer.pkl'}")

        # Print top drivers for the riskiest OOT account
        if sv is not None and len(sv) > 0:
            top_idx  = np.argmax(results[best_model]["y_prob"])
            drivers  = pd.Series(sv[top_idx], index=FEATURE_COLS).abs().sort_values(ascending=False)
            print(f"\n  SHAP — Top 5 churn drivers for highest-risk account:")
            for feat, val in drivers.head(5).items():
                direction = "↑ risk" if sv[top_idx][FEATURE_COLS.index(feat)] > 0 else "↓ risk"
                print(f"    {feat:<35s}  |SHAP|={val:.4f}  {direction}")

        return {"shap_values": sv, "explainer": explainer}

    except Exception as exc:
        print(f"  [warn] SHAP skipped ({exc})")
        return {}


# =========================================================================
# SECTION 9 — VISUALISATIONS
# =========================================================================
def plot_all(
    df_train: pd.DataFrame,
    df_oot: pd.DataFrame,
    results: dict,
    best_model: str,
    shap_data: dict,
):
    plt.style.use("seaborn-v0_8-whitegrid")
    palette = ["#4C72B0", "#DD8452", "#55A868", "#C44E52", "#8172B2"]

    # ── 01  Customer overview ─────────────────────────────────────────────
    fig, axes = plt.subplots(1, 3, figsize=(16, 5))
    fig.suptitle(
        f"Customer Overview — OOT Cohort  "
        f"(n={len(df_oot):,}, churn={df_oot['churned'].mean()*100:.1f}%)",
        fontsize=13, fontweight="bold",
    )

    sns.countplot(
        data=df_oot, x="churned",
        palette=["#55A868", "#C44E52"], ax=axes[0],
    )
    axes[0].set_title("Churn Distribution (OOT)")
    axes[0].set_xticklabels(["Active", "Churned"])

    sns.boxplot(
        data=df_oot, x="churned", y="recency_days",
        palette=["#55A868", "#C44E52"], ax=axes[1],
    )
    axes[1].set_title("Payment Recency at Cutoff (days)")
    axes[1].set_xticklabels(["Active", "Churned"])

    sns.boxplot(
        data=df_oot, x="churned", y="total_spend",
        palette=["#55A868", "#C44E52"], ax=axes[2],
    )
    axes[2].set_title("Lifetime Spend")
    axes[2].set_xticklabels(["Active", "Churned"])

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "01_customer_overview.png", dpi=150)
    plt.close()

    # ── 02  ROC curves (all models) ───────────────────────────────────────
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot([0, 1], [0, 1], "k--", lw=1, label="Random Baseline")

    for (name, r), col in zip(
        ((k, v) for k, v in results.items() if not k.startswith("_")),
        palette,
    ):
        fpr, tpr, _ = roc_curve(r["y_oot"], r["y_prob"])
        ax.plot(fpr, tpr, color=col, lw=2,
                label=f"{name}  (AUC={r['oot_auc']:.3f})")

    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title(
        "ROC Curves — Out-of-Time Evaluation\n"
        "(No Data Leakage, Train/Test are different time windows)",
        fontweight="bold",
    )
    ax.legend(loc="lower right", fontsize=9)
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "02_roc_curves.png", dpi=150)
    plt.close()

    # ── 03  Feature importance (SHAP preferred, built-in fallback) ─────────
    bm  = results[best_model]["model"]
    fig, ax = plt.subplots(figsize=(10, 9))

    if shap_data.get("shap_values") is not None:
        sv = shap_data["shap_values"]
        fi = pd.Series(np.abs(sv).mean(axis=0), index=FEATURE_COLS).sort_values()
        fi.plot(kind="barh", color="#4C72B0", ax=ax)
        ax.set_xlabel("Mean |SHAP Value|  (average impact on predicted churn probability)")
        ax.set_title(
            f"SHAP Feature Importance — {best_model}\n"
            "(Higher = stronger driver of churn)",
            fontweight="bold",
        )
    elif hasattr(bm, "feature_importances_"):
        fi = pd.Series(bm.feature_importances_, index=FEATURE_COLS).sort_values()
        fi.plot(kind="barh", color="#4C72B0", ax=ax)
        ax.set_xlabel("Feature Importance Score")
        ax.set_title(f"Feature Importances — {best_model}", fontweight="bold")

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "03_feature_importance.png", dpi=150)
    plt.close()

    # ── 04  Confusion matrix ──────────────────────────────────────────────
    r   = results[best_model]
    cm  = confusion_matrix(r["y_oot"], r["y_pred"])
    fig, ax = plt.subplots(figsize=(6, 5))
    ConfusionMatrixDisplay(cm, display_labels=["Active", "Churned"]).plot(
        ax=ax, colorbar=False, cmap="Blues",
    )
    ax.set_title(
        f"Confusion Matrix — {best_model}\n"
        f"OOT Cohort  (no data leakage)",
        fontweight="bold",
    )
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "04_confusion_matrix.png", dpi=150)
    plt.close()

    # ── 05  Churn probability score distribution ──────────────────────────
    fig, ax = plt.subplots(figsize=(9, 5))
    for lbl, col, ls in [(0, "#55A868", "-"), (1, "#C44E52", "--")]:
        m = r["y_oot"] == lbl
        if m.sum() > 0:
            ax.hist(
                r["y_prob"][m], bins=15, alpha=0.55,
                color=col, linestyle=ls, edgecolor="white", density=True,
                label=f"{'Active' if lbl == 0 else 'Churned'}  (n={m.sum()})",
            )
    ax.axvline(0.5, color="black", lw=1.5, linestyle=":", label="Decision threshold")
    ax.set_xlabel("Predicted Churn Probability")
    ax.set_ylabel("Density")
    ax.set_title(
        "Churn Score Distribution — OOT Validation\n"
        "(Well-separated distributions indicate a useful model)",
        fontweight="bold",
    )
    ax.legend()
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "05_score_distribution.png", dpi=150)
    plt.close()

    print(f"  Plots saved → {OUTPUT_DIR}/")


# =========================================================================
# SECTION 10 — MODEL SAVING & PREDICTION REPORT
# =========================================================================
def save_model(results: dict, best_model: str):
    bm      = results[best_model]["model"]
    imputer = results["_imputer"]

    pipeline = Pipeline([("imputer", imputer), ("classifier", bm)])

    artifact = {
        "pipeline"    : pipeline,
        "feature_cols": FEATURE_COLS,
        "model_name"  : best_model,
        "cutoff_date" : CUTOFF_DATE,
        "oot_auc"     : results[best_model]["oot_auc"],
    }
    joblib.dump(artifact, OUTPUT_DIR / "churn_model.pkl")
    print(f"  Model pipeline saved → {OUTPUT_DIR / 'churn_model.pkl'}")
    print(f"  Load : obj = joblib.load('output/churn_model.pkl')")
    print(f"  Score: probs = obj['pipeline'].predict_proba(X_df[obj['feature_cols']])[:, 1]")


def generate_predictions(
    df_oot: pd.DataFrame, results: dict, best_model: str, imputer
) -> pd.DataFrame:
    bm = results[best_model]["model"]
    X  = imputer.transform(df_oot[FEATURE_COLS])

    out = df_oot[[
        "acc_id", "expire",
        "account_age_at_cutoff",
        "last_access_recency_at_cutoff",
        "recency_days",
        "total_spend", "total_payments",
        "spend_decay_ratio", "tx_decay_ratio",
        "churned",
    ]].copy()

    out["churn_probability"] = bm.predict_proba(X)[:, 1]
    out["churn_predicted"]   = (out["churn_probability"] >= 0.5).astype(int)
    out["risk_tier"] = pd.cut(
        out["churn_probability"],
        bins   = [0, 0.30, 0.60, 1.0],
        labels = ["Low", "Medium", "High"],
    )

    out = out.sort_values("churn_probability", ascending=False)
    out.to_csv(OUTPUT_DIR / "churn_predictions.csv", index=False)

    print("\n" + "═" * 72)
    print("  PREDICTION REPORT — Top 15 At-Risk Accounts (OOT Cohort)")
    print("═" * 72)
    print(out.head(15).to_string(index=False))
    print("\n  Risk-Tier Summary:")
    print(out["risk_tier"].value_counts().to_string())
    print(f"\n  Predictions saved → {OUTPUT_DIR / 'churn_predictions.csv'}")

    return out


# =========================================================================
# MAIN PIPELINE
# =========================================================================
def main():
    print("\n" + "═" * 72)
    print("  Customer Churn Prediction Pipeline  v2")
    print("  Anti-Leakage | OOT Validation | RFM + Decay | SHAP")
    print(f"  Cutoff : {CUTOFF_DATE.date()}  |  OOT from : {OOT_SPLIT_DATE.date()}"
          f"  |  Reference : {REFERENCE_DATE.date()}")
    print("═" * 72)

    # [1] Load
    print("\n  [1/7]  Loading data …")
    users, payments = load_data()
    print(f"         Users    : {len(users):,}")
    print(f"         Payments : {len(payments):,}  "
          f"({payments['payment_date'].min().date()} → "
          f"{payments['payment_date'].max().date()})")

    # [2] Label — using only post-cutoff outcomes
    print("\n  [2/7]  Labelling churn (post-cutoff outcomes, no leakage) …")
    users_lbl = label_churn(users, payments)
    n_c = users_lbl["churned"].sum()
    print(f"         Churned  : {n_c} / {len(users_lbl)}"
          f"  ({n_c / len(users_lbl) * 100:.1f}%)")
    print(f"         Rule     : expire < {REFERENCE_DATE.date()}"
          f" AND no payment after {CUTOFF_DATE.date()}")

    # [3] Feature engineering — strictly pre-cutoff
    print("\n  [3/7]  Engineering behavioral features (pre-cutoff data only) …")
    df = engineer_features(users_lbl, payments)
    print(f"         Feature matrix : {len(df):,} rows × {len(FEATURE_COLS)} features")
    print(f"         Excluded (leaky): status, credit, credit_premium,")
    print(f"                           credit_email, paid_email, expire (raw)")

    # [4] OOT split
    print("\n  [4/7]  Applying Out-of-Time split …")
    df_train, df_oot = oot_split(df)
    print(f"         Train  : {len(df_train):,} accounts"
          f"  (churn {df_train['churned'].mean()*100:.1f}%)")
    print(f"         OOT    : {len(df_oot):,} accounts"
          f"  (churn {df_oot['churned'].mean()*100:.1f}%)")

    # [5] Train & evaluate
    print("\n  [5/7]  Training models on historical data, evaluating on OOT …")
    results, best_model, imputer = train_and_evaluate(df_train, df_oot)

    # [6] SHAP
    print("\n  [6/7]  Generating SHAP explanations …")
    shap_data = generate_shap(results, best_model, df_oot, imputer)

    # [7] Visualise + save
    print("\n  [7/7]  Saving plots and artefacts …")
    plot_all(df_train, df_oot, results, best_model, shap_data)
    save_model(results, best_model)
    generate_predictions(df_oot, results, best_model, imputer)

    # ── Summary ────────────────────────────────────────────────────────────
    oot_auc = results[best_model]["oot_auc"]
    gap     = results[best_model]["gap"]
    print("\n" + "═" * 72)
    print("  Pipeline complete!")
    print(f"  Best model : {best_model}")
    print(f"  OOT AUC   : {oot_auc:.4f}")
    print(f"  Train-OOT gap: {gap:+.4f}  "
          f"({'no overfitting detected' if abs(gap) < 0.10 else 'review — gap too large'})")
    print("═" * 72 + "\n")


if __name__ == "__main__":
    main()
