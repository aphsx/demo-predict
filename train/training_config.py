# =========================================================================
#  Training Configuration  —  v2  (aligned with churn_model.py v2)
# =========================================================================
#  NOTE: FEATURE_COLS and MODEL_PARAMS are defined here for reference
#  and external tooling. churn_model.py v2 is self-contained and uses
#  its own internal FEATURE_COLS list (the single source of truth).
# =========================================================================

# ── Feature columns (mirrors churn_model.py FEATURE_COLS) ─────────────────
# ALL features are pre-cutoff; zero leaky current-state columns.
FEATURE_COLS = [
    # A. Account lifecycle
    "account_age_at_cutoff",
    "last_access_recency_at_cutoff",
    "last_send_recency_at_cutoff",
    "days_to_expire_at_cutoff",
    "expired_at_cutoff",

    # B. RFM
    "recency_days",
    "total_payments",
    "total_spend",

    # C. Monetary depth
    "avg_spend_per_tx",
    "max_single_tx",
    "last_payment_amount",
    "downgraded",
    "lifetime_value_per_day",

    # D. Volume & diversity
    "total_sms_volume",
    "avg_sms_per_tx",
    "unique_products",

    # E. Credit burn rate & cadence
    "credit_burn_rate",
    "payment_span_days",
    "avg_payment_gap_days",

    # F. Usage decay
    "spend_recent_90d",
    "spend_previous_90d",
    "spend_decay_ratio",
    "tx_count_recent_90d",
    "tx_count_previous_90d",
    "tx_decay_ratio",

    # G. Categoricals
    "dom_credit_enc",
]

# ── Hyperparameters (reference; actual training uses churn_model.py) ───────
MODEL_PARAMS = {
    "LightGBM": {
        "n_estimators"     : 500,
        "max_depth"        : 5,
        "num_leaves"       : 31,
        "learning_rate"    : 0.04,
        "min_child_samples": 15,
        "subsample"        : 0.8,
        "colsample_bytree" : 0.8,
        "reg_alpha"        : 0.1,
        "reg_lambda"       : 0.2,
        "random_state"     : 42,
    },
    "XGBoost": {
        "n_estimators"    : 500,
        "max_depth"       : 4,
        "learning_rate"   : 0.04,
        "subsample"       : 0.8,
        "colsample_bytree": 0.8,
        "gamma"           : 0.1,
        "reg_alpha"       : 0.1,
        "reg_lambda"      : 1.0,
        "random_state"    : 42,
    },
    "HistGradientBoosting": {
        "max_iter"         : 500,
        "max_depth"        : 5,
        "learning_rate"    : 0.04,
        "min_samples_leaf" : 15,
        "l2_regularization": 0.2,
        "random_state"     : 42,
    },
    "Random Forest": {
        "n_estimators"    : 300,
        "max_depth"       : 7,
        "min_samples_leaf": 10,
        "random_state"    : 42,
    },
}

# ── Temporal constants (mirrors churn_model.py) ────────────────────────────
CUTOFF_DATE    = "2025-12-31"   # Observation point (features ≤ this date)
OOT_SPLIT_DATE = "2025-10-01"   # OOT test window starts here
REFERENCE_DATE = "2026-03-09"   # Ground-truth check date
