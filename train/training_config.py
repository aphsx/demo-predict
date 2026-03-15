# =========================================================================
#  Training Configuration  —  v4  (single source of truth)
#
#  churn_model.py imports constants and FEATURE_COLS from here.
#  Change values in this file to adjust training behaviour globally.
# =========================================================================

# ── Temporal offsets (days) ────────────────────────────────────────────────
# Dates are derived automatically from the data at runtime.
# Only the *offsets* are configured here.
CUTOFF_LOOKBACK_DAYS  = 90    # CUTOFF_DATE  = latest data date − N days
OOT_LOOKBACK_DAYS     = 90    # OOT_SPLIT_DATE = CUTOFF_DATE − N days
DECAY_SHORT_DAYS      = 90    # "recent" spend/tx window
DECAY_LONG_DAYS       = 180   # "prior"  spend/tx baseline window
MIN_OBSERVE_DAYS      = 21    # drop accounts whose fate resolved < N days before
                               # REFERENCE_DATE (insufficient observation window)

# ── Model selection & calibration ─────────────────────────────────────────
N_CV_FOLDS           = 5      # stratified k-fold for unbiased model selection
FBETA_BETA           = 2.0    # F-beta β — >1 favors recall (catching churners is
                               # more valuable than avoiding false alarms for most
                               # retention programmes).  β=1 → balanced F1.
IMPORTANCE_THRESHOLD = 0.005  # drop features with mean importance below this

# ── Feature columns (single definition — mirrored in churn_model.py) ──────
FEATURE_COLS = [
    # A. Account lifecycle
    "account_age_at_cutoff",          # days since join_date (≤ CUTOFF_DATE)
    "last_access_recency_at_cutoff",  # days since last login (capped at cutoff)
    "last_send_recency_at_cutoff",    # days since last SMS send (capped at cutoff)
    "days_to_expire_at_cutoff",       # +days = time left; negative = already expired
    "expired_at_cutoff",              # binary convenience flag

    # B. RFM
    "recency_days",                   # R — days since last payment at cutoff
    "total_payments",                 # F — lifetime purchase count
    "total_spend",                    # M — lifetime gross spend

    # C. Monetary depth
    "avg_spend_per_tx",
    "max_single_tx",
    "last_payment_amount",
    "downgraded",                     # last payment < historical avg (downgrade flag)
    "lifetime_value_per_day",         # total_spend / account_age

    # D. Volume & diversity
    "total_sms_volume",
    "avg_sms_per_tx",
    "unique_products",

    # E. Credit burn rate & cadence
    "credit_burn_rate",               # SMS credits consumed per active day
    "payment_span_days",              # days between first and last payment
    "avg_payment_gap_days",           # expected payment interval

    # F. Usage decay (most powerful SaaS churn signals)
    "spend_recent_90d",
    "spend_previous_90d",
    "spend_decay_ratio",              # recent / (prior + 1); <1 = declining
    "tx_count_recent_90d",
    "tx_count_previous_90d",
    "tx_decay_ratio",                 # recent / (prior + 1); <1 = declining

    # G. NEW v4 — Payment volatility
    "payment_amount_std",             # std dev of payment amounts; high = unstable

    # H. NEW v4 — Missed renewal cycles
    "missed_renewal_cycles",          # recency_days / avg_payment_gap (gaps missed)

    # I. NEW v4 — Compound risk interaction
    "compound_risk",                  # recency_days × expired_at_cutoff

    # J. Encoded categoricals
    "dom_credit_enc",
]

# ── Hyperparameters (static, data-independent settings only) ──────────────
# scale_pos_weight / class_weight are data-dependent and set dynamically in
# churn_model._build_models() — do not define them here.
MODEL_PARAMS = {
    "LightGBM": {
        "n_estimators"      : 300,
        "max_depth"         : 4,
        "num_leaves"        : 20,
        "learning_rate"     : 0.05,
        "min_child_samples" : 30,
        "subsample"         : 0.75,
        "colsample_bytree"  : 0.75,
        "reg_alpha"         : 0.3,
        "reg_lambda"        : 1.0,
        "random_state"      : 42,
        "n_jobs"            : -1,
        "verbose"           : -1,
    },
    "XGBoost": {
        "n_estimators"      : 300,
        "max_depth"         : 3,
        "learning_rate"     : 0.05,
        "subsample"         : 0.75,
        "colsample_bytree"  : 0.75,
        "gamma"             : 0.3,
        "reg_alpha"         : 0.3,
        "reg_lambda"        : 2.0,
        "min_child_weight"  : 10,
        "eval_metric"       : "auc",
        "random_state"      : 42,
        "n_jobs"            : -1,
        "verbosity"         : 0,
    },
    "HistGradientBoosting": {
        "max_iter"          : 200,
        "max_depth"         : 4,
        "learning_rate"     : 0.05,
        "min_samples_leaf"  : 30,
        "l2_regularization" : 1.0,
        "max_features"      : 0.75,
        "random_state"      : 42,
    },
    "Random Forest": {
        "n_estimators"      : 200,
        "max_depth"         : 5,
        "min_samples_leaf"  : 20,
        "max_features"      : "sqrt",
        "random_state"      : 42,
        "n_jobs"            : -1,
    },
}
