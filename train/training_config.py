# Configuration for Churn Prediction Training

# ── Feature Selection ──────────────────────────────────
# Removing potential leaking features for a more realistic model
# (e.g., features derived from 'expire' that the model might 'cheat' with)
FEATURE_COLS = [
    "status_enc", "credit_enc",
    "days_since_last_send",
    "account_age_days",
    "total_payments", "total_amount_paid", "avg_amount_per_tx",
    "total_sms_volume", "avg_sms_volume", "unique_products",
    "last_payment_recency", "avg_payment_gap_days",
    "last_payment_amount", "downgraded", "dom_credit_enc",
]

# ── Hyperparameters ────────────────────────────────────
MODEL_PARAMS = {
    "Random Forest": {
        "n_estimators": 200, 
        "max_depth": 6,
        "random_state": 42, 
        "class_weight": "balanced"
    },
    "Hist Gradient Boosting": {
        "max_iter": 150, 
        "max_depth": 4,
        "learning_rate": 0.08,
        "random_state": 42
    },
    "Extra Trees": {
        "n_estimators": 200, 
        "max_depth": 6,
        "random_state": 42, 
        "class_weight": "balanced"
    },
}

# ── Paths ──────────────────────────────────────────────
EXPERIMENT_LOG_PATH = "output/experiment_log.csv"
