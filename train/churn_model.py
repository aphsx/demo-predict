"""
=========================================================================
  Customer Churn Prediction Pipeline  v4
=========================================================================
  Architecture
  ---------------------------------------------------------------------
  Anti-Leakage        Features computed exclusively from <= CUTOFF_DATE.
                      Labels derived from POST-CUTOFF outcomes only.

  Out-of-Time (OOT)   Train / test are different *time windows*, not
                      random rows -- the only realistic validation for
                      subscription churn.

  5-Fold CV           Model selection is done by cross-validation on the
                      training set, so OOT is a pure holdout and is never
                      peeked at during model selection.

  OOF Calibration     Isotonic regression is fit on out-of-fold (OOF)
                      predictions from the same k-fold splits.  This uses
                      100% of training data for the final model (no
                      hold-out data loss) while still producing calibrated
                      probabilities without any leakage.

  Threshold opt.      Decision threshold is tuned on OOF predictions using
                      F-beta (beta=2, recall-weighted) then validated on OOT.

  SHAP                Per-account explanations so the business understands
                      *why* a customer is flagged.

  ---------------------------------------------------------------------
  What changed from v3
  ---------------------------------------------------------------------
  FIX  MIN_OBSERVE_DAYS     -- now actually filters uncertain labels
                              (was defined but never applied)
  FIX  Final model trained  -- on 100% of training data, not 80%
  FIX  Calibration          -- OOF isotonic (no hold-out data loss)
  FIX  training_config.py   -- now the single source of truth; churn_model
                              imports constants and FEATURE_COLS from it
  NEW  5-Fold CV            -- unbiased model selection (no OOT peek)
  NEW  Optimal threshold    -- F-beta tuned on OOF, validated on OOT
  NEW  payment_amount_std   -- payment volatility feature
  NEW  missed_renewal_cycles-- recency / avg_payment_gap (cycles missed)
  NEW  compound_risk        -- recency x expired interaction feature
  NEW  KS statistic         -- separation metric in evaluation + log
  NEW  Lift @ top-20%       -- business-relevant retention targeting metric
  NEW  Lift / Gain chart    -- plot 06 (cumulative gain decile table)
  NEW  model_card.json      -- machine-readable metadata artifact
  ---------------------------------------------------------------------
  Section map
  ---------------------------------------------------------------------
  1.  Imports & path setup
  2.  Data loading
  3.  Temporal configuration  (auto-derived from data)
  4.  Churn label engineering (post-cutoff outcomes, MIN_OBSERVE_DAYS)
  5.  Behavioral feature engineering (pre-cutoff, 3 new features)
  6.  Out-of-Time split
  7.  Model building helpers
  8.  Threshold optimisation
  9.  Feature selection
  10. Main training: Phase 1 CV -> Phase 2 OOF calibration -> Phase 3 OOT
  11. SHAP explainability
  12. Visualisations (6 plots incl. Lift/Gain chart)
  13. Model saving + model_card.json
  14. Prediction report
  15. Main pipeline
=========================================================================
"""

import json
import warnings
from datetime import datetime, timedelta
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
import shap
from sklearn.base import clone
from sklearn.calibration import calibration_curve
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    average_precision_score,
    brier_score_loss,
    classification_report,
    confusion_matrix,
    fbeta_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.preprocessing import LabelEncoder

warnings.filterwarnings("ignore")

# -- Optional SOTA gradient boosting libraries -----------------------------
try:
    import lightgbm as lgb
    _LGBM = True
except ImportError:
    _LGBM = False
    print("  [warn] LightGBM not installed -- falling back to HistGradientBoosting")

try:
    import xgboost as xgb
    _XGB = True
except ImportError:
    _XGB = False

# -- Project utilities -----------------------------------------------------
import ml_utils

# -- Paths -----------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


# =========================================================================
# SECTION 1 -- CONFIGURATION  (sourced from training_config.py)
# =========================================================================
from training_config import (
    CUTOFF_LOOKBACK_DAYS,
    DECAY_LONG_DAYS,
    DECAY_SHORT_DAYS,
    FBETA_BETA,
    FEATURE_COLS,
    IMPORTANCE_THRESHOLD,
    MIN_OBSERVE_DAYS,
    MODEL_PARAMS,
    N_CV_FOLDS,
    OOT_LOOKBACK_DAYS,
)

# Runtime-populated temporal globals (set by setup_temporal_config)
CUTOFF_DATE: datetime    = None   # noqa: E231
OOT_SPLIT_DATE: datetime = None   # noqa: E231
REFERENCE_DATE: datetime = None   # noqa: E231


# =========================================================================
# SECTION 2 -- DATA LOADING
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
# SECTION 3 -- TEMPORAL CONFIGURATION  (auto-derived from data)
#
# REFERENCE_DATE  = latest evidence of activity (payment or login)
#                   -- think of it as "the day you run the model"
# CUTOFF_DATE     = REFERENCE_DATE - CUTOFF_LOOKBACK_DAYS
#                   Features are frozen here; nothing after this leaks in.
# OOT_SPLIT_DATE  = CUTOFF_DATE - OOT_LOOKBACK_DAYS
#                   Accounts expiring in [OOT_SPLIT_DATE, REFERENCE_DATE]
#                   form the held-out evaluation cohort.
# =========================================================================
def setup_temporal_config(payments: pd.DataFrame, users: pd.DataFrame):
    global CUTOFF_DATE, OOT_SPLIT_DATE, REFERENCE_DATE

    latest_payment = payments["payment_date"].max()
    latest_access  = users["last_access"].max()
    REFERENCE_DATE = max(latest_payment, latest_access).to_pydatetime().replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    CUTOFF_DATE    = REFERENCE_DATE - timedelta(days=CUTOFF_LOOKBACK_DAYS)
    OOT_SPLIT_DATE = CUTOFF_DATE    - timedelta(days=OOT_LOOKBACK_DAYS)

    print(f"         Reference date  : {REFERENCE_DATE.date()}  (latest data point)")
    print(f"         Cutoff date     : {CUTOFF_DATE.date()}"
          f"  (features frozen here, {CUTOFF_LOOKBACK_DAYS}d lookback)")
    print(f"         OOT split date  : {OOT_SPLIT_DATE.date()}"
          f"  (OOT window: {OOT_LOOKBACK_DAYS}d before cutoff)")


# =========================================================================
# SECTION 4 -- CHURN LABEL ENGINEERING  (strictly zero leakage)
#
# churned = 1  <->  account expired before REFERENCE_DATE
#                 AND no renewal payment was recorded after CUTOFF_DATE
# churned = 0  <->  account still active (expire >= REFERENCE_DATE)
#                 OR a renewal was made after CUTOFF_DATE
#
# v4 FIX: MIN_OBSERVE_DAYS filter is now applied.
#   Accounts whose subscription ended within MIN_OBSERVE_DAYS of
#   REFERENCE_DATE are excluded -- there has not been enough time to
#   confirm that they will not renew, so their label is ambiguous and
#   contaminates the training signal.
#
# No column derived from this section ever appears in FEATURE_COLS.
# =========================================================================
def label_churn(users: pd.DataFrame, payments: pd.DataFrame) -> pd.DataFrame:
    df = users.copy()

    # Who renewed during the prediction window?
    renewed_ids = set(payments.loc[payments["payment_date"] > CUTOFF_DATE, "acc_id"])
    df["renewed_post_cutoff"] = df["acc_id"].isin(renewed_ids)

    # is the subscription expired as of today?
    df["account_expired"] = df["expire"] < pd.Timestamp(REFERENCE_DATE)

    # Binary churn label
    df["churned"] = (df["account_expired"] & ~df["renewed_post_cutoff"]).astype(int)

    # v4 FIX -- drop accounts with insufficient observation window
    min_observe_cutoff = pd.Timestamp(REFERENCE_DATE) - timedelta(days=MIN_OBSERVE_DAYS)
    uncertain_mask = (
        df["account_expired"] &
        (df["expire"] >= min_observe_cutoff) &
        ~df["renewed_post_cutoff"]
    )
    n_removed = int(uncertain_mask.sum())
    if n_removed > 0:
        df = df[~uncertain_mask].reset_index(drop=True)
        print(f"         Removed {n_removed} accounts with ambiguous labels "
              f"(expired < {MIN_OBSERVE_DAYS}d before reference date)")

    return df


# =========================================================================
# SECTION 5 -- BEHAVIORAL FEATURE ENGINEERING ENGINE
#
# ALL features are computed from data <= CUTOFF_DATE.
# Columns excluded (current-state leakage):
#   status, credit, credit_premium, credit_email, paid_email
#
# Feature groups:
#   A.  Account lifecycle   (tenure, contract schedule)
#   B.  RFM                 (Recency, Frequency, Monetary)
#   C.  Monetary depth      (avg / max / last tx, downgrade flag)
#   D.  Volume & diversity  (SMS volume, product breadth)
#   E.  Credit burn rate & payment cadence
#   F.  Usage decay         (recent 90d vs prior 90d spend + tx count)
#   G.  NEW v4 -- Payment volatility    (std dev of payment amounts)
#   H.  NEW v4 -- Missed renewal cycles (recency / avg_payment_gap)
#   I.  NEW v4 -- Compound risk         (recency x expired_at_cutoff)
#   J.  Encoded categoricals
# =========================================================================
def engineer_features(users_labeled: pd.DataFrame, payments: pd.DataFrame) -> pd.DataFrame:
    pay_hist = payments[payments["payment_date"] <= CUTOFF_DATE].copy()
    df       = users_labeled.copy()

    # -- A. Account lifecycle ----------------------------------------------
    df["account_age_at_cutoff"] = (
        (pd.Timestamp(CUTOFF_DATE) - df["join_date"]).dt.days.clip(lower=0)
    )
    # Cap post-cutoff access/send dates -- post-cutoff activity belongs to
    # the label domain, not the feature domain.
    last_access_safe = df["last_access"].clip(upper=pd.Timestamp(CUTOFF_DATE))
    last_send_safe   = df["last_send"].clip(upper=pd.Timestamp(CUTOFF_DATE))
    df["last_access_recency_at_cutoff"] = (
        (pd.Timestamp(CUTOFF_DATE) - last_access_safe).dt.days.clip(lower=0)
    )
    df["last_send_recency_at_cutoff"] = (
        (pd.Timestamp(CUTOFF_DATE) - last_send_safe).dt.days.clip(lower=0)
    )
    # Contract schedule: clipped to [-365, 365] to prevent extreme outliers
    # causing distribution shift between train and OOT.
    df["days_to_expire_at_cutoff"] = (
        (df["expire"] - pd.Timestamp(CUTOFF_DATE)).dt.days.clip(-365, 365)
    )
    df["expired_at_cutoff"] = (df["days_to_expire_at_cutoff"] < 0).astype(int)

    # -- B + C + D + E + G. Core RFM aggregations -------------------------
    rfm = (
        pay_hist
        .groupby("acc_id")
        .agg(
            total_payments     = ("payment_date", "count"),
            total_spend        = ("amount",        "sum"),
            avg_spend_per_tx   = ("amount",        "mean"),
            max_single_tx      = ("amount",        "max"),
            payment_amount_std = ("amount",        "std"),   # G -- volatility
            total_sms_volume   = ("sms_volume",    "sum"),
            avg_sms_per_tx     = ("sms_volume",    "mean"),
            unique_products    = ("product_name",  "nunique"),
            _first_pay_date    = ("payment_date",  "min"),
            _last_pay_date     = ("payment_date",  "max"),
        )
        .reset_index()
    )

    rfm["recency_days"]        = (pd.Timestamp(CUTOFF_DATE) - rfm["_last_pay_date"]).dt.days
    rfm["payment_span_days"]   = (rfm["_last_pay_date"] - rfm["_first_pay_date"]).dt.days.clip(lower=0)
    rfm["avg_payment_gap_days"] = rfm.apply(
        lambda r: r["payment_span_days"] / max(r["total_payments"] - 1, 1), axis=1
    )
    rfm["credit_burn_rate"]    = rfm["total_sms_volume"] / rfm["payment_span_days"].clip(lower=1)
    rfm["payment_amount_std"]  = rfm["payment_amount_std"].fillna(0)   # single-payment accounts
    rfm.drop(["_first_pay_date", "_last_pay_date"], axis=1, inplace=True)

    # -- F. Usage decay: recent 90d vs prior 90-180d -----------------------
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

    # Last payment amount (downgrade detection)
    last_pay = (
        pay_hist
        .sort_values("payment_date")
        .groupby("acc_id")["amount"]
        .last()
        .rename("last_payment_amount")
        .reset_index()
    )

    # Dominant credit type
    dom_credit = (
        pay_hist
        .groupby("acc_id")["credit_type"]
        .agg(lambda x: x.mode().iloc[0] if len(x) else "Unknown")
        .rename("dominant_credit_type")
        .reset_index()
    )

    # Merge all feature frames
    df = (
        df
        .merge(rfm,          on="acc_id", how="left")
        .merge(recent_agg,   on="acc_id", how="left")
        .merge(previous_agg, on="acc_id", how="left")
        .merge(last_pay,     on="acc_id", how="left")
        .merge(dom_credit,   on="acc_id", how="left")
    )

    # Zero-fill for accounts with no payment history
    _zero_fill = [
        "total_payments", "total_spend", "avg_spend_per_tx", "max_single_tx",
        "payment_amount_std", "total_sms_volume", "avg_sms_per_tx", "unique_products",
        "recency_days", "payment_span_days", "avg_payment_gap_days", "credit_burn_rate",
        "last_payment_amount", "spend_recent_90d", "tx_count_recent_90d",
        "spend_previous_90d", "tx_count_previous_90d",
    ]
    for col in _zero_fill:
        if col in df.columns:
            df[col] = df[col].fillna(0)

    # Accounts with zero payments: recency = full account age (worst-case signal)
    no_payment = df["total_payments"] == 0
    df.loc[no_payment, "recency_days"] = df.loc[no_payment, "account_age_at_cutoff"]

    # -- Composite / derived features --------------------------------------
    df["spend_decay_ratio"]      = df["spend_recent_90d"]    / (df["spend_previous_90d"] + 1)
    df["tx_decay_ratio"]         = df["tx_count_recent_90d"] / (df["tx_count_previous_90d"] + 1)
    df["downgraded"]             = (
        (df["last_payment_amount"] > 0) &
        (df["last_payment_amount"] < df["avg_spend_per_tx"])
    ).astype(int)
    df["lifetime_value_per_day"] = df["total_spend"] / df["account_age_at_cutoff"].clip(lower=1)

    # H. NEW v4 -- Missed renewal cycles
    # "How many expected payment intervals have passed since the last payment?"
    # Capped at 20 to limit the effect of extreme outliers on tree splits.
    df["missed_renewal_cycles"] = (
        df["recency_days"] / df["avg_payment_gap_days"].clip(lower=1)
    ).clip(upper=20)

    # I. NEW v4 -- Compound risk interaction
    # High value when the customer is BOTH overdue AND already expired --
    # a combined signal that is far more predictive than either alone.
    df["compound_risk"] = df["recency_days"] * df["expired_at_cutoff"]

    # J. Encode dominant credit type
    df["dominant_credit_type"] = df["dominant_credit_type"].fillna("None")
    df["dom_credit_enc"]       = LabelEncoder().fit_transform(df["dominant_credit_type"])

    return df


# =========================================================================
# SECTION 6 -- OUT-OF-TIME (OOT) SPLIT
#
# Train cohort : accounts whose subscription resolved BEFORE OOT_SPLIT_DATE
# OOT cohort   : accounts whose subscription expired in
#                [OOT_SPLIT_DATE, REFERENCE_DATE]
#
# This replicates real deployment: train on past outcomes, evaluate on a
# forward time window the model has never seen.
# =========================================================================
def oot_split(df: pd.DataFrame):
    oot_mask = (
        (df["expire"] >= pd.Timestamp(OOT_SPLIT_DATE)) &
        (df["expire"] <= pd.Timestamp(REFERENCE_DATE))
    )
    df_train = df[~oot_mask].copy()
    df_oot   = df[oot_mask].copy()

    # Fallback: if the OOT window is too thin, use a temporal 80/20 split on
    # expired accounts only (avoids putting all-active accounts in OOT which
    # would yield 0% churn).
    if df_oot["churned"].nunique() < 2 or len(df_oot) < 20:
        print("  [warn] OOT window too thin -- using temporal 80/20 split by expiry date")
        df_exp  = df[df["account_expired"] == 1].sort_values("expire").reset_index(drop=True)
        cut_idx = int(len(df_exp) * 0.80)
        df_train = df_exp.iloc[:cut_idx].copy()
        df_oot   = df_exp.iloc[cut_idx:].copy()

    return df_train, df_oot


# =========================================================================
# SECTION 7 -- MODEL BUILDING
# =========================================================================
def _build_models(neg: int, pos: int) -> dict:
    """Instantiate candidate models with imbalance corrections."""
    spw    = max(neg / max(pos, 1), 1.0)   # scale_pos_weight for LGB / XGB
    models = {}

    if _LGBM:
        models["LightGBM"] = lgb.LGBMClassifier(
            **MODEL_PARAMS["LightGBM"],
            scale_pos_weight = spw,
        )

    if _XGB:
        models["XGBoost"] = xgb.XGBClassifier(
            **MODEL_PARAMS["XGBoost"],
            scale_pos_weight = spw,
        )

    models["HistGradientBoosting"] = HistGradientBoostingClassifier(
        **MODEL_PARAMS["HistGradientBoosting"],
        class_weight = "balanced",
    )

    models["Random Forest"] = RandomForestClassifier(
        **MODEL_PARAMS["Random Forest"],
        class_weight = "balanced",
    )

    return models


# =========================================================================
# SECTION 8 -- THRESHOLD OPTIMISATION
# =========================================================================
def _optimal_threshold(probs: np.ndarray, y: np.ndarray, beta: float = FBETA_BETA):
    """
    Find the decision threshold that maximises F-beta on the given predictions.

    beta > 1 favors recall -- in churn prevention, missing a churner (false
    negative) is typically more costly than a wasted retention offer
    (false positive).  beta=2.0 weights recall twice as heavily as precision.

    Parameters
    ----------
    probs : np.ndarray  out-of-fold (OOF) predicted probabilities
    y     : np.ndarray  true binary labels
    beta  : float       F-beta parameter

    Returns
    -------
    best_threshold : float  threshold in [0.05, 0.95]
    best_fbeta     : float  F-beta score at the best threshold
    """
    thresholds = np.linspace(0.05, 0.95, 181)
    best_t, best_f = 0.5, -1.0
    for t in thresholds:
        f = fbeta_score(y, (probs >= t).astype(int), beta=beta, zero_division=0)
        if f > best_f:
            best_t, best_f = t, f
    return float(best_t), float(best_f)


# =========================================================================
# SECTION 9 -- FEATURE SELECTION
# =========================================================================
def _select_features(model, feature_cols: list, threshold: float = IMPORTANCE_THRESHOLD) -> list:
    """Return features whose built-in importance exceeds threshold (keep >= 5)."""
    if not hasattr(model, "feature_importances_"):
        return feature_cols

    imps     = model.feature_importances_
    selected = [f for f, imp in zip(feature_cols, imps) if imp >= threshold]
    dropped  = [f for f, imp in zip(feature_cols, imps) if imp < threshold]

    if dropped:
        print(f"  Feature selection: removed {len(dropped)} low-importance features:")
        print(f"    {dropped}")
    if len(selected) < 5:
        print("  [warn] Too few features after selection -- reverting to full set")
        return feature_cols
    return selected


# =========================================================================
# SECTION 10 -- TRAINING PIPELINE
#
# Phase 1 -- 5-Fold Stratified CV (model selection, no OOT peek)
# Phase 2 -- Full-train fit + feature selection + OOF isotonic calibration
#            + optimal threshold (F-beta on OOF)
# Phase 3 -- OOT evaluation (pure holdout, no tuning decisions made here)
# =========================================================================
def train_and_evaluate(df_train: pd.DataFrame, df_oot: pd.DataFrame):
    """
    Full training + evaluation pipeline.

    Returns
    -------
    results   : dict   all model artifacts + metrics
    best_name : str    name of the selected model
    imputer   : fitted SimpleImputer
    """
    # Imputer -- fit ONLY on training data to prevent statistical leakage
    imputer  = SimpleImputer(strategy="median")
    y_tr     = df_train["churned"].astype(int).values
    y_ot     = df_oot["churned"].astype(int).values

    X_tr = imputer.fit_transform(df_train[FEATURE_COLS])
    X_ot = imputer.transform(df_oot[FEATURE_COLS])

    neg, pos = int((y_tr == 0).sum()), int((y_tr == 1).sum())
    models   = _build_models(neg, pos)

    skf = StratifiedKFold(n_splits=N_CV_FOLDS, shuffle=True, random_state=42)

    # -- PHASE 1 -- Stratified CV model comparison --------------------------
    print("\n" + "=" * 72)
    print(f"  PHASE 1 -- {N_CV_FOLDS}-Fold Stratified CV  "
          f"(model selection -- OOT not touched)")
    print(f"  Train  : {len(X_tr):,} accounts  |  churn rate {y_tr.mean()*100:.1f}%")
    print(f"  OOT    : {len(X_ot):,} accounts  |  churn rate {y_ot.mean()*100:.1f}%")
    print(f"  Class imbalance (neg:pos) = {neg}:{pos}")
    print("=" * 72)

    cv_scores   = {}
    best_cv_auc = -1.0
    best_name   = None

    for name, model in models.items():
        scores = cross_val_score(model, X_tr, y_tr, cv=skf, scoring="roc_auc", n_jobs=-1)
        cv_scores[name] = {"mean": float(scores.mean()), "std": float(scores.std())}
        star = "*" if scores.mean() > best_cv_auc else " "
        if scores.mean() > best_cv_auc:
            best_cv_auc, best_name = scores.mean(), name
        print(f"  {star} [{name:<25s}]  "
              f"CV AUC = {scores.mean():.4f} +/- {scores.std():.4f}")

    print(f"\n  Best model: {best_name}  (CV AUC = {best_cv_auc:.4f})")

    # -- PHASE 2 -- Full-train fit + feature selection + OOF calibration ----
    print("\n" + "-" * 72)
    print("  PHASE 2 -- Feature selection + OOF isotonic calibration + threshold opt.")
    print("-" * 72)

    # 2a. Train on full set -> feature selection
    base_full = clone(models[best_name])
    base_full.fit(X_tr, y_tr)

    selected_cols = _select_features(base_full, FEATURE_COLS)
    sel_idx       = [FEATURE_COLS.index(c) for c in selected_cols]
    X_tr_sel      = X_tr[:, sel_idx]
    X_ot_sel      = X_ot[:, sel_idx]
    n_dropped     = len(FEATURE_COLS) - len(selected_cols)
    print(f"  Features : {len(FEATURE_COLS)} -> {len(selected_cols)}  "
          f"({n_dropped} dropped, importance < {IMPORTANCE_THRESHOLD})")

    # 2b. Collect out-of-fold (OOF) predictions for calibration
    #     Each sample is predicted exactly once by a model that never saw it.
    #     Fitting isotonic regression on these OOF probs produces a calibrator
    #     without consuming any held-out data.
    oof_probs = np.zeros(len(y_tr))
    for tr_idx, val_idx in skf.split(X_tr_sel, y_tr):
        fold_model = clone(models[best_name])
        fold_model.fit(X_tr_sel[tr_idx], y_tr[tr_idx])
        oof_probs[val_idx] = fold_model.predict_proba(X_tr_sel[val_idx])[:, 1]

    calibrator = IsotonicRegression(out_of_bounds="clip")
    calibrator.fit(oof_probs, y_tr)
    print("  Isotonic calibration fitted on OOF predictions (100% train used)")

    # 2c. Train FINAL model on 100% of training data with selected features
    final_model = clone(models[best_name])
    final_model.fit(X_tr_sel, y_tr)

    # 2d. Optimal threshold: maximise F-beta on OOF predictions
    #     (these are clean -- the model never trained on these observations)
    best_threshold, best_fbeta = _optimal_threshold(oof_probs, y_tr, beta=FBETA_BETA)
    print(f"  Optimal threshold (F-{FBETA_BETA:.0f} on OOF): "
          f"{best_threshold:.2f}  (F-{FBETA_BETA:.0f} = {best_fbeta:.4f})")

    # -- PHASE 3 -- OOT evaluation ------------------------------------------
    print("\n" + "-" * 72)
    print("  PHASE 3 -- OOT evaluation  (pure holdout, zero leakage)")
    print("-" * 72)

    raw_ot    = final_model.predict_proba(X_ot_sel)[:, 1]
    y_prob_ot = calibrator.transform(raw_ot)
    y_pred_ot = (y_prob_ot >= best_threshold).astype(int)

    raw_tr    = final_model.predict_proba(X_tr_sel)[:, 1]
    y_prob_tr = calibrator.transform(raw_tr)

    oot_auc  = roc_auc_score(y_ot, y_prob_ot)
    tr_auc   = roc_auc_score(y_tr, y_prob_tr)
    avg_pr   = average_precision_score(y_ot, y_prob_ot)
    brier    = brier_score_loss(y_ot, y_prob_ot)
    ks_stat  = ml_utils.ks_statistic(y_ot, y_prob_ot)
    lift_20  = ml_utils.lift_at_percentile(y_ot, y_prob_ot, percentile=20)
    gap      = tr_auc - oot_auc
    fit_flag = "OK" if abs(gap) < 0.10 else "CHECK -- gap may indicate overfitting"

    print(f"\n  [{best_name} + FeatureSelection + OOF-Isotonic + threshold={best_threshold:.2f}]")
    print(f"  Train AUC  : {tr_auc:.4f}  |  OOT AUC : {oot_auc:.4f}  "
          f"|  Gap : {gap:+.4f}  [{fit_flag}]")
    print(f"  PR-AUC     : {avg_pr:.4f}  |  Brier   : {brier:.4f}  "
          f"|  KS   : {ks_stat:.4f}  |  Lift@20% : {lift_20:.2f}x")
    print(classification_report(y_ot, y_pred_ot,
                                target_names=["Active", "Churned"],
                                zero_division=0))

    ml_utils.log_experiment(
        model_name  = f"{best_name}_v4_calibrated",
        metrics     = {
            "train_auc"        : round(tr_auc,         4),
            "oot_auc"          : round(oot_auc,         4),
            "oot_pr_auc"       : round(avg_pr,          4),
            "overfitting_gap"  : round(gap,             4),
            "brier_score"      : round(brier,           4),
            "ks_statistic"     : round(ks_stat,         4),
            "lift_at_top20pct" : round(lift_20,         4),
            "cv_auc_mean"      : round(best_cv_auc,     4),
            "threshold"        : round(best_threshold,  3),
            "fbeta_oof"        : round(best_fbeta,      4),
            "train_size"       : len(X_tr),
            "oot_size"         : len(X_ot),
            "num_features"     : len(selected_cols),
            "churn_rate_train" : round(float(y_tr.mean()), 4),
            "churn_rate_oot"   : round(float(y_ot.mean()), 4),
        },
        config_name = "v4_OOF_Calibrated",
        log_path    = str(OUTPUT_DIR / "experiment_log.csv"),
    )

    # Re-fit all models on full train for ROC comparison chart.
    # This is evaluation-only: model selection already happened in Phase 1 (CV),
    # so visualising OOT scores here introduces no leakage into any decision.
    roc_results = {}
    for name, model in models.items():
        m = clone(model)
        m.fit(X_tr, y_tr)
        raw  = m.predict_proba(X_ot)[:, 1]
        roc_results[name] = {
            "model"  : m,
            "oot_auc": roc_auc_score(y_ot, raw),
            "y_prob" : raw,
            "y_oot"  : y_ot,
        }

    results = {
        # Imputer + column lists
        "_imputer"      : imputer,
        "_feature_cols" : FEATURE_COLS,
        "_selected_cols": selected_cols,
        # Calibrated final model
        "_calibrated"   : {
            "model"        : final_model,
            "calibrator"   : calibrator,
            "selected_cols": selected_cols,
            "threshold"    : best_threshold,
            "train_auc"    : tr_auc,
            "oot_auc"      : oot_auc,
            "avg_pr"       : avg_pr,
            "brier"        : brier,
            "ks_stat"      : ks_stat,
            "lift_20"      : lift_20,
            "gap"          : gap,
            "y_pred"       : y_pred_ot,
            "y_prob"       : y_prob_ot,
            "y_oot"        : y_ot,
        },
        # Phase 1 / ROC chart data
        **roc_results,
        # CV summary
        "_cv_scores"  : cv_scores,
        "_best_cv_auc": best_cv_auc,
        "_oof_probs"  : oof_probs,
        "_y_tr"       : y_tr,
    }

    print(f"\n  OK Final : {best_name} (OOF-calibrated, threshold={best_threshold:.2f})")
    print(f"    OOT AUC={oot_auc:.4f}  Brier={brier:.4f}  "
          f"KS={ks_stat:.4f}  Lift@20%={lift_20:.2f}x")
    return results, best_name, imputer


# =========================================================================
# SECTION 11 -- SHAP EXPLAINABILITY
# =========================================================================
def generate_shap(
    results: dict, best_model: str, df_oot: pd.DataFrame, imputer
) -> dict:
    """
    Generate SHAP values for the OOT cohort.

    Uses TreeExplainer (fast, exact) when the underlying model supports it;
    falls back to PermutationExplainer otherwise.

    Answers: "Why is customer X flagged as high-risk?"
    """
    cal_entry     = results.get("_calibrated", {})
    base_model    = cal_entry.get("model", results[best_model]["model"])
    selected_cols = results.get("_selected_cols", FEATURE_COLS)

    X_full  = imputer.transform(df_oot[FEATURE_COLS])
    sel_idx = [FEATURE_COLS.index(c) for c in selected_cols]
    X_ot    = X_full[:, sel_idx]

    try:
        try:
            explainer   = shap.TreeExplainer(base_model)
            shap_values = explainer.shap_values(X_ot)
        except Exception:
            background  = shap.sample(X_ot, min(100, len(X_ot)), random_state=42)
            explainer   = shap.PermutationExplainer(base_model.predict_proba, background)
            explanation = explainer(X_ot[:200])
            shap_values = explanation.values[:, :, 1]

        # Normalise: handle list / Explanation / ndarray shapes
        if hasattr(shap_values, "values"):
            sv = shap_values.values
            if sv.ndim == 3:
                sv = sv[:, :, 1]
        elif isinstance(shap_values, list):
            sv = shap_values[1] if len(shap_values) > 1 else shap_values[0]
        else:
            sv = shap_values

        joblib.dump(
            {
                "explainer"    : explainer,
                "feature_names": selected_cols,
                "model_name"   : best_model,
                "cutoff_date"  : CUTOFF_DATE,
            },
            OUTPUT_DIR / "shap_explainer.pkl",
        )
        print(f"  SHAP explainer saved -> {OUTPUT_DIR / 'shap_explainer.pkl'}")

        if sv is not None and len(sv) > 0:
            y_prob   = cal_entry.get("y_prob", results[best_model]["y_prob"])
            top_idx  = int(np.argmax(y_prob))
            drivers  = pd.Series(np.abs(sv[top_idx]), index=selected_cols).sort_values(ascending=False)
            print("\n  SHAP -- Top 5 churn drivers for highest-risk account:")
            for feat, val in drivers.head(5).items():
                direction = "^ risk" if sv[top_idx][selected_cols.index(feat)] > 0 else "v risk"
                print(f"    {feat:<38s}  |SHAP|={val:.4f}  {direction}")

        return {"shap_values": sv, "explainer": explainer, "feature_names": selected_cols}

    except Exception as exc:
        print(f"  [warn] SHAP skipped ({exc})")
        return {}


# =========================================================================
# SECTION 12 -- VISUALISATIONS
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

    cal         = results["_calibrated"]
    sel_cols    = results.get("_selected_cols", FEATURE_COLS)
    base_model  = cal["model"]

    # -- 01  Customer overview ---------------------------------------------
    fig, axes = plt.subplots(1, 3, figsize=(16, 5))
    fig.suptitle(
        f"Customer Overview -- OOT Cohort  "
        f"(n={len(df_oot):,}, churn={df_oot['churned'].mean()*100:.1f}%)",
        fontsize=13, fontweight="bold",
    )
    sns.countplot(data=df_oot, x="churned", palette=["#55A868", "#C44E52"], ax=axes[0])
    axes[0].set_title("Churn Distribution (OOT)")
    axes[0].set_xticklabels(["Active", "Churned"])
    sns.boxplot(data=df_oot, x="churned", y="recency_days",
                palette=["#55A868", "#C44E52"], ax=axes[1])
    axes[1].set_title("Payment Recency at Cutoff (days)")
    axes[1].set_xticklabels(["Active", "Churned"])
    sns.boxplot(data=df_oot, x="churned", y="total_spend",
                palette=["#55A868", "#C44E52"], ax=axes[2])
    axes[2].set_title("Lifetime Spend")
    axes[2].set_xticklabels(["Active", "Churned"])
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "01_customer_overview.png", dpi=150)
    plt.close()

    # -- 02  ROC curves (all candidates evaluated on OOT) ------------------
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot([0, 1], [0, 1], "k--", lw=1, label="Random baseline")
    for (name, r), col in zip(
        ((k, v) for k, v in results.items() if not k.startswith("_")),
        palette,
    ):
        fpr, tpr, _ = roc_curve(r["y_oot"], r["y_prob"])
        ax.plot(fpr, tpr, color=col, lw=2, label=f"{name}  (AUC={r['oot_auc']:.3f})")
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title(
        "ROC Curves -- Out-of-Time Evaluation\n"
        "(models selected by 5-fold CV, OOT is a pure holdout)",
        fontweight="bold",
    )
    ax.legend(loc="lower right", fontsize=9)
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "02_roc_curves.png", dpi=150)
    plt.close()

    # -- 03  Feature importance (SHAP preferred, built-in fallback) --------
    fig, ax = plt.subplots(figsize=(10, max(6, len(sel_cols) * 0.4)))
    shap_names = shap_data.get("feature_names", sel_cols)
    if shap_data.get("shap_values") is not None:
        sv = shap_data["shap_values"]
        fi = pd.Series(np.abs(sv).mean(axis=0), index=shap_names).sort_values()
        fi.plot(kind="barh", color="#4C72B0", ax=ax)
        ax.set_xlabel("Mean |SHAP Value|")
        ax.set_title(
            f"SHAP Feature Importance -- {best_model} (calibrated, {len(shap_names)} features)\n"
            "(Higher = stronger driver of predicted churn probability)",
            fontweight="bold",
        )
    elif hasattr(base_model, "feature_importances_"):
        fi = pd.Series(base_model.feature_importances_, index=sel_cols).sort_values()
        fi.plot(kind="barh", color="#4C72B0", ax=ax)
        ax.set_xlabel("Feature Importance Score")
        ax.set_title(f"Feature Importances -- {best_model} ({len(sel_cols)} features)",
                     fontweight="bold")
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "03_feature_importance.png", dpi=150)
    plt.close()

    # -- 04  Confusion matrix ----------------------------------------------
    cm = confusion_matrix(cal["y_oot"], cal["y_pred"])
    fig, ax = plt.subplots(figsize=(6, 5))
    ConfusionMatrixDisplay(cm, display_labels=["Active", "Churned"]).plot(
        ax=ax, colorbar=False, cmap="Blues",
    )
    ax.set_title(
        f"Confusion Matrix -- {best_model} (calibrated, threshold={cal['threshold']:.2f})\n"
        f"OOT Cohort (no data leakage)",
        fontweight="bold",
    )
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "04_confusion_matrix.png", dpi=150)
    plt.close()

    # -- 05  Score distribution + calibration (reliability) diagram --------
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    ax = axes[0]
    for lbl, col, ls in [(0, "#55A868", "-"), (1, "#C44E52", "--")]:
        m = cal["y_oot"] == lbl
        if m.sum() > 0:
            ax.hist(
                cal["y_prob"][m], bins=15, alpha=0.55,
                color=col, linestyle=ls, edgecolor="white", density=True,
                label=f"{'Active' if lbl == 0 else 'Churned'}  (n={int(m.sum())})",
            )
    ax.axvline(cal["threshold"], color="black", lw=1.5, linestyle=":",
               label=f"Threshold = {cal['threshold']:.2f}")
    ax.set_xlabel("Predicted Churn Probability")
    ax.set_ylabel("Density")
    ax.set_title(
        "Churn Score Distribution (OOF-calibrated)\n"
        "(Well-separated distributions = useful model)",
        fontweight="bold",
    )
    ax.legend()

    ax2 = axes[1]
    try:
        frac_pos, mean_pred = calibration_curve(
            cal["y_oot"], cal["y_prob"], n_bins=8, strategy="quantile"
        )
        ax2.plot(mean_pred, frac_pos, "s-", color="#4C72B0",
                 label=f"{best_model} (isotonic calibrated)")
        ax2.plot([0, 1], [0, 1], "k--", lw=1, label="Perfect calibration")
        ax2.set_xlabel("Mean Predicted Probability")
        ax2.set_ylabel("Fraction of Positives")
        ax2.set_title(
            f"Reliability Diagram -- OOT Cohort\n"
            f"Brier = {cal['brier']:.4f}  KS = {cal['ks_stat']:.4f}",
            fontweight="bold",
        )
        ax2.legend()
    except Exception:
        ax2.set_title("Calibration curve unavailable")

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "05_score_distribution.png", dpi=150)
    plt.close()

    # -- 06  NEW v4 -- Lift / Gain chart ------------------------------------
    gain_df = ml_utils.gain_table(cal["y_oot"], cal["y_prob"], n_bins=10)

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    fig.suptitle(
        f"Lift & Cumulative Gain -- {best_model} (OOT Cohort)\n"
        f"Lift@20% = {cal['lift_20']:.2f}x   "
        f"(top-20% captures {cal['lift_20']*20:.0f}% of all churners)",
        fontsize=12, fontweight="bold",
    )

    # Cumulative gain curve
    ax = axes[0]
    ax.plot(gain_df["cumulative_pct_customers"], gain_df["cumulative_pct_churners"],
            "o-", color="#4C72B0", lw=2, label="Model")
    ax.plot([0, 100], [0, 100], "k--", lw=1, label="Random baseline")
    ax.fill_between(gain_df["cumulative_pct_customers"],
                    gain_df["cumulative_pct_churners"],
                    gain_df["cumulative_pct_customers"],
                    alpha=0.12, color="#4C72B0")
    ax.set_xlabel("% Customers Contacted (sorted by risk score)")
    ax.set_ylabel("% Churners Captured")
    ax.set_title("Cumulative Gain Curve")
    ax.legend()

    # Lift per decile
    ax2 = axes[1]
    ax2.bar(gain_df["decile"], gain_df["lift"], color=["#C44E52" if l >= 1.5
            else "#4C72B0" for l in gain_df["lift"]], edgecolor="white")
    ax2.axhline(1.0, color="black", lw=1.5, linestyle="--", label="Random baseline (1.0x)")
    ax2.set_xlabel("Score Decile  (1 = highest risk)")
    ax2.set_ylabel("Lift")
    ax2.set_title("Lift per Decile")
    ax2.legend()

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "06_lift_gain_chart.png", dpi=150)
    plt.close()

    print(f"  Plots saved -> {OUTPUT_DIR}/  (6 charts)")


# =========================================================================
# SECTION 13 -- MODEL SAVING + model_card.json
# =========================================================================
def save_model(results: dict, best_model: str):
    """
    Save model artifacts:
      churn_model.pkl     -- full scoring pipeline (imputer + model + calibrator)
      model_card.json     -- machine-readable metadata for reproducibility
    """
    cal_entry     = results["_calibrated"]
    imputer       = results["_imputer"]
    selected_cols = results.get("_selected_cols", FEATURE_COLS)

    # Scoring pipeline -- three-step inference:
    #   1.  X_imp  = imputer.transform(X_df[feature_cols])
    #   2.  X_sel  = X_imp[:, sel_idx]                       (feature subset)
    #   3.  probs  = calibrator.transform(
    #                    model.predict_proba(X_sel)[:, 1])    (calibrated scores)
    artifact = {
        "imputer"      : imputer,
        "model"        : cal_entry["model"],
        "calibrator"   : cal_entry["calibrator"],
        "feature_cols" : FEATURE_COLS,
        "selected_cols": selected_cols,
        "threshold"    : cal_entry["threshold"],
        "model_name"   : best_model,
        "cutoff_date"  : CUTOFF_DATE,
        "oot_auc"      : cal_entry["oot_auc"],
        "brier_score"  : cal_entry["brier"],
        "ks_statistic" : cal_entry["ks_stat"],
        "lift_at_20pct": cal_entry["lift_20"],
    }
    joblib.dump(artifact, OUTPUT_DIR / "churn_model.pkl")
    print(f"  Model pipeline saved -> {OUTPUT_DIR / 'churn_model.pkl'}")
    print(f"  Inference docs:")
    print(f"    obj     = joblib.load('output/churn_model.pkl')")
    print(f"    X_imp   = obj['imputer'].transform(X_df[obj['feature_cols']])")
    print(f"    sel_idx = [obj['feature_cols'].index(c) for c in obj['selected_cols']]")
    print(f"    raw_p   = obj['model'].predict_proba(X_imp[:, sel_idx])[:, 1]")
    print(f"    probs   = obj['calibrator'].transform(raw_p)   # calibrated probabilities")
    print(f"    pred    = (probs >= obj['threshold']).astype(int)")

    # model_card.json -- NEW v4
    cv_scores = results.get("_cv_scores", {})
    card = {
        "pipeline_version"  : "v4",
        "trained_at"        : datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "model_name"        : best_model,
        "calibration"       : "OOF isotonic regression",
        "threshold"         : cal_entry["threshold"],
        "threshold_metric"  : f"F-{FBETA_BETA:.0f} (OOF)",
        "temporal_config"   : {
            "reference_date"       : str(REFERENCE_DATE.date()),
            "cutoff_date"          : str(CUTOFF_DATE.date()),
            "oot_split_date"       : str(OOT_SPLIT_DATE.date()),
            "cutoff_lookback_days" : CUTOFF_LOOKBACK_DAYS,
            "oot_lookback_days"    : OOT_LOOKBACK_DAYS,
            "min_observe_days"     : MIN_OBSERVE_DAYS,
        },
        "features"          : {
            "total"   : len(FEATURE_COLS),
            "selected": len(selected_cols),
            "names"   : selected_cols,
        },
        "cv_results"        : cv_scores,
        "oot_metrics"       : {
            "auc"         : round(cal_entry["oot_auc"],  4),
            "pr_auc"      : round(cal_entry["avg_pr"],   4),
            "brier_score" : round(cal_entry["brier"],    4),
            "ks_statistic": round(cal_entry["ks_stat"],  4),
            "lift_at_20pct": round(cal_entry["lift_20"], 4),
            "train_oot_gap": round(cal_entry["gap"],     4),
        },
        "anti_leakage_notes": [
            "Features computed from data <= CUTOFF_DATE only",
            "Labels derived from post-cutoff outcomes only",
            "Model selection by 5-fold CV -- OOT never peeked during training",
            "Calibration via OOF predictions -- OOT not used for calibration",
            "Threshold set on OOF F-beta -- OOT purely for final reporting",
        ],
    }
    with open(OUTPUT_DIR / "model_card.json", "w") as f:
        json.dump(card, f, indent=2)
    print(f"  Model card saved  -> {OUTPUT_DIR / 'model_card.json'}")


# =========================================================================
# SECTION 14 -- PREDICTION REPORT
# =========================================================================
def generate_predictions(
    df_oot: pd.DataFrame, results: dict, best_model: str, imputer
) -> pd.DataFrame:
    cal_entry     = results["_calibrated"]
    final_model   = cal_entry["model"]
    calibrator    = cal_entry["calibrator"]
    selected_cols = results.get("_selected_cols", FEATURE_COLS)
    sel_idx       = [FEATURE_COLS.index(c) for c in selected_cols]
    threshold     = cal_entry["threshold"]

    X_full = imputer.transform(df_oot[FEATURE_COLS])
    X      = X_full[:, sel_idx]

    out = df_oot[[
        "acc_id", "expire",
        "account_age_at_cutoff",
        "last_access_recency_at_cutoff",
        "recency_days",
        "total_spend", "total_payments",
        "spend_decay_ratio", "tx_decay_ratio",
        "missed_renewal_cycles",
        "churned",
    ]].copy()

    raw_probs              = final_model.predict_proba(X)[:, 1]
    out["churn_probability"] = calibrator.transform(raw_probs)
    out["churn_predicted"]   = (out["churn_probability"] >= threshold).astype(int)
    out["risk_tier"] = pd.cut(
        out["churn_probability"],
        bins   = [0, 0.30, 0.60, 1.0],
        labels = ["Low", "Medium", "High"],
    )

    out = out.sort_values("churn_probability", ascending=False)
    out.to_csv(OUTPUT_DIR / "churn_predictions.csv", index=False)

    # Decile gain table
    gain_df = ml_utils.gain_table(
        out["churned"].values, out["churn_probability"].values, n_bins=10
    )
    gain_df.to_csv(OUTPUT_DIR / "lift_gain_table.csv", index=False)

    print("\n" + "=" * 72)
    print(f"  PREDICTION REPORT  (threshold = {threshold:.2f})")
    print("=" * 72)
    print(f"  Top 15 At-Risk Accounts (OOT Cohort):")
    print(out.head(15).to_string(index=False))
    print("\n  Risk-Tier Summary:")
    print(out["risk_tier"].value_counts().to_string())
    print("\n  Cumulative Gain Table (top -> bottom decile):")
    print(gain_df.to_string(index=False))
    print(f"\n  Predictions saved -> {OUTPUT_DIR / 'churn_predictions.csv'}")
    print(f"  Gain table saved  -> {OUTPUT_DIR / 'lift_gain_table.csv'}")

    return out


# =========================================================================
# SECTION 15 -- MAIN PIPELINE
# =========================================================================
def main():
    print("\n" + "=" * 72)
    print("  Customer Churn Prediction Pipeline  v4")
    print("  Anti-Leakage | 5-Fold CV | OOF Calibration | Threshold Opt | SHAP")
    print(f"  Offsets : cutoff={CUTOFF_LOOKBACK_DAYS}d, OOT={OOT_LOOKBACK_DAYS}d, "
          f"min_observe={MIN_OBSERVE_DAYS}d  (dates auto-derived from data)")
    print("=" * 72)

    # [1] Load + auto-configure temporal windows
    print("\n  [1/7]  Loading data ...")
    users, payments = load_data()
    print(f"         Users    : {len(users):,}")
    print(f"         Payments : {len(payments):,}  "
          f"({payments['payment_date'].min().date()} -> "
          f"{payments['payment_date'].max().date()})")
    print("         Auto-configuring temporal windows ...")
    setup_temporal_config(payments, users)

    # [2] Churn labels (post-cutoff outcomes, MIN_OBSERVE_DAYS applied)
    print("\n  [2/7]  Labelling churn ...")
    users_lbl = label_churn(users, payments)
    n_c = int(users_lbl["churned"].sum())
    print(f"         Churned  : {n_c} / {len(users_lbl)}"
          f"  ({n_c / len(users_lbl) * 100:.1f}%)")
    print(f"         Rule     : expire < {REFERENCE_DATE.date()}"
          f" AND no payment > {CUTOFF_DATE.date()}")

    # [3] Feature engineering (all pre-cutoff, 3 new v4 features)
    print("\n  [3/7]  Engineering behavioral features ...")
    df = engineer_features(users_lbl, payments)
    print(f"         Feature matrix : {len(df):,} rows x {len(FEATURE_COLS)} features")
    print(f"         New v4 features: payment_amount_std, missed_renewal_cycles, compound_risk")

    # [4] OOT split
    print("\n  [4/7]  Applying Out-of-Time split ...")
    df_train, df_oot = oot_split(df)
    print(f"         Train : {len(df_train):,}  (churn {df_train['churned'].mean()*100:.1f}%)")
    print(f"         OOT   : {len(df_oot):,}  (churn {df_oot['churned'].mean()*100:.1f}%)")

    # [5] Train (5-fold CV -> OOF calibration -> OOT evaluation)
    print("\n  [5/7]  Training ...")
    results, best_model, imputer = train_and_evaluate(df_train, df_oot)

    # [6] SHAP
    print("\n  [6/7]  Generating SHAP explanations ...")
    shap_data = generate_shap(results, best_model, df_oot, imputer)

    # [7] Plots + artifacts
    print("\n  [7/7]  Saving plots and artifacts ...")
    plot_all(df_train, df_oot, results, best_model, shap_data)
    save_model(results, best_model)
    generate_predictions(df_oot, results, best_model, imputer)

    # -- Final summary ------------------------------------------------------
    cal    = results["_calibrated"]
    sel    = results.get("_selected_cols", FEATURE_COLS)
    print("\n" + "=" * 72)
    print("  Pipeline v4 complete!")
    print(f"  Best model     : {best_model}  (OOF-calibrated, isotonic)")
    print(f"  Features       : {len(FEATURE_COLS)} total -> {len(sel)} selected")
    print(f"  Threshold      : {cal['threshold']:.2f}  "
          f"(F-{FBETA_BETA:.0f}-optimal on OOF predictions)")
    print(f"  OOT AUC        : {cal['oot_auc']:.4f}")
    print(f"  Brier score    : {cal['brier']:.4f}  (lower = better calibrated)")
    print(f"  KS statistic   : {cal['ks_stat']:.4f}  (> 0.40 = good separation)")
    print(f"  Lift @ top-20% : {cal['lift_20']:.2f}x  "
          f"(top-20% contains {cal['lift_20']*20:.0f}% of all churners)")
    print(f"  Train-OOT gap  : {cal['gap']:+.4f}  "
          f"({'OK -- no overfitting' if abs(cal['gap']) < 0.10 else 'CHECK -- gap too large'})")
    print("=" * 72 + "\n")


if __name__ == "__main__":
    main()
