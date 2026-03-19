"""
Churn CRM â€” FastAPI Backend
Endpoints:
  GET  /api/stats                â†’ KPI summary (incl. revenue_at_risk)
  GET  /api/predictions          â†’ all customers with churn data
  GET  /api/predictions/{acc_id} â†’ single customer detail + key_reason
  GET  /api/top-risk             â†’ top N at-risk accounts
  GET  /api/export               â†’ download CSV of filtered predictions
  GET  /api/model-info           â†’ model metadata + feature importance
  GET  /api/explain/{acc_id}     â†’ SHAP values for a customer
  POST /api/predict              â†’ score a new customer record live
"""

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
import io
import os
import asyncpg
import pandas as pd
import numpy as np
import joblib
import json
import shap
from sqlalchemy import text
from sklearn.preprocessing import LabelEncoder

from database import AsyncSessionLocal

app = FastAPI(title="Churn CRM API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# â”€â”€ Paths â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
BASE_DIR   = Path(__file__).parent.parent.parent
ML_DIR     = Path(__file__).parent.parent
USERS_CSV    = ML_DIR / "data" / "sample_users.csv"   # kept as fallback only
PAY_CSV      = ML_DIR / "data" / "sample_payments.csv" # kept as fallback only
MODEL_PKL    = ML_DIR / "models" / "churn_model.pkl"
SHAP_PKL     = ML_DIR / "models" / "shap_explainer.pkl"

# â”€â”€ DB DSN (asyncpg native, no +asyncpg prefix) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_DB_DSN = os.getenv(
    "DATABASE_URL_ASYNCPG",
    "postgresql://crm_user:crm_secret@localhost:5432/churn_crm",
)

# â”€â”€ Feature columns (must match training order) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    # E. Credit Burn Rate & cadence
    "credit_burn_rate",
    "payment_span_days",
    "avg_payment_gap_days",

    # F. Usage Decay
    "spend_recent_90d",
    "spend_previous_90d",
    "spend_decay_ratio",
    "tx_count_recent_90d",
    "tx_count_previous_90d",
    "tx_decay_ratio",

    # G. Encoded categoricals
    "dom_credit_enc",
]

# The training script defines CUTOFF_DATE relative to the data. 
# For the API, we use the current time as the reference.
REFERENCE_DATE = pd.Timestamp.now().normalize()
DECAY_SHORT_DAYS = 90
DECAY_LONG_DAYS = 180


class PlattCalibrated:
    """Thin wrapper applying manual Platt scaling to a base classifier.
    Must be defined for joblib to load the model.
    """
    def __init__(self, base, scaler):
        self._base   = base
        self._scaler = scaler

    def predict_proba(self, X):
        raw = self._base.predict_proba(X)[:, 1].reshape(-1, 1)
        p1  = self._scaler.predict_proba(raw)[:, 1]
        return np.column_stack([1 - p1, p1])

    def predict(self, X):
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


# Inject into __main__ so pickle can find it
import sys
sys.modules['__main__'].PlattCalibrated = PlattCalibrated


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# HELPER FUNCTIONS
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

def risk_label(prob: float) -> str:
    if prob >= 0.6:  return "High"
    if prob >= 0.3:  return "Medium"
    return "Low"


def _rfm_segment(days_inactive: float, total_payments: float, total_amount: float) -> str:
    """Classify customer into RFM segment based on Recency, Frequency, Monetary."""
    r = 5 if days_inactive < 30 else 4 if days_inactive < 60 else 3 if days_inactive < 90 else 2 if days_inactive < 180 else 1
    f = 5 if total_payments > 20 else 4 if total_payments > 10 else 3 if total_payments > 5 else 2 if total_payments > 1 else 1
    m = 5 if total_amount > 100_000 else 4 if total_amount > 50_000 else 3 if total_amount > 10_000 else 2 if total_amount > 1_000 else 1
    score = r + f + m
    if score >= 13:              return "Champions"
    if score >= 10:              return "Loyal"
    if r >= 3:                   return "Potential"
    if r <= 2 and f >= 3:       return "At Risk"
    if r <= 1 and f <= 2:       return "Lost"
    return "Low Spender"


def _risk_factor(row: pd.Series) -> str:
    """Generate human-readable risk factor text from feature values."""
    reasons = []
    days_expire = row.get("days_to_expire_at_cutoff", 0)
    days_inactive = row.get("last_access_recency_at_cutoff", 0)
    recency_days = row.get("recency_days", 0)
    total_pay = row.get("total_payments", 0)
    downgraded = row.get("downgraded", 0)
    decay = row.get("spend_decay_ratio", 1.0)

    if days_expire < 0:
        reasons.append("à¹€à¸„à¸£à¸”à¸´à¸•à¸«à¸¡à¸”à¸­à¸²à¸¢à¸¸à¹à¸¥à¹‰à¸§")
    elif days_expire < 7:
        reasons.append(f"à¹€à¸„à¸£à¸”à¸´à¸•à¸ˆà¸°à¸«à¸¡à¸”à¹ƒà¸™ {int(days_expire)} à¸§à¸±à¸™")

    if days_inactive > 90:
        reasons.append(f"à¹„à¸¡à¹ˆà¹ƒà¸Šà¹‰à¸‡à¸²à¸™ {int(days_inactive)} à¸§à¸±à¸™")
    elif days_inactive > 30:
        reasons.append(f"à¹ƒà¸Šà¹‰à¸‡à¸²à¸™à¸™à¹‰à¸­à¸¢à¸¥à¸‡ ({int(days_inactive)} à¸§à¸±à¸™)")

    if downgraded == 1:
        reasons.append("Downgrade Package")

    if recency_days > 90:
        reasons.append("à¹„à¸¡à¹ˆà¹€à¸•à¸´à¸¡à¹€à¸„à¸£à¸”à¸´à¸• > 90 à¸§à¸±à¸™")
    
    if decay < 0.5:
        reasons.append("à¸¢à¸­à¸”à¸‹à¸·à¹‰à¸­à¸¥à¸”à¸¥à¸‡à¸¡à¸²à¸")

    if total_pay == 0:
        reasons.append("à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹€à¸„à¸¢à¸‹à¸·à¹‰à¸­à¹€à¸„à¸£à¸”à¸´à¸•")

    return " Â· ".join(reasons) if reasons else "à¸›à¸à¸•à¸´"


def _recommended_action(prob: float, rfm_seg: str) -> str:
    """Return recommended retention action based on churn probability and RFM segment."""
    if prob >= 0.6:
        if rfm_seg in ("Champions", "Loyal"):
            return "à¹‚à¸—à¸£à¸ªà¸­à¸šà¸–à¸²à¸¡à¸›à¸±à¸à¸«à¸²à¸à¸²à¸£à¹ƒà¸Šà¹‰à¸‡à¸²à¸™à¸—à¸±à¸™à¸—à¸µ"
        return "à¹‚à¸—à¸£à¸ªà¸­à¸šà¸–à¸²à¸¡ / Call Retention"
    if prob >= 0.3:
        return "à¸ªà¹ˆà¸‡ SMS/Email à¸‚à¹‰à¸­à¹€à¸ªà¸™à¸­à¸žà¸´à¹€à¸¨à¸©"
    return "à¸•à¸´à¸”à¸•à¸²à¸¡ Newsletter à¸£à¸²à¸¢à¹€à¸”à¸·à¸­à¸™"


_FEAT_LABEL = {
    "last_access_recency_at_cutoff": ("à¹„à¸¡à¹ˆà¹ƒà¸Šà¹‰à¸‡à¸²à¸™à¸¡à¸²à¹à¸¥à¹‰à¸§",     "à¸§à¸±à¸™"),
    "days_to_expire_at_cutoff":      ("à¹€à¸„à¸£à¸”à¸´à¸•à¸«à¸¡à¸”à¸­à¸²à¸¢à¸¸à¹ƒà¸™à¸­à¸µà¸",  "à¸§à¸±à¸™"),
    "recency_days":                  ("à¹„à¸¡à¹ˆà¹€à¸•à¸´à¸¡à¹€à¸„à¸£à¸”à¸´à¸•à¸¡à¸²à¹à¸¥à¹‰à¸§", "à¸§à¸±à¸™"),
    "avg_payment_gap_days":          ("à¸Šà¹ˆà¸§à¸‡à¸«à¹ˆà¸²à¸‡à¸à¸²à¸£à¸‹à¸·à¹‰à¸­à¹€à¸‰à¸¥à¸µà¹ˆà¸¢","à¸§à¸±à¸™"),
    "total_payments":                ("à¸‹à¸·à¹‰à¸­à¹€à¸„à¸£à¸”à¸´à¸•à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”",   "à¸„à¸£à¸±à¹‰à¸‡"),
    "total_spend":                   ("à¸¢à¸­à¸”à¸‹à¸·à¹‰à¸­à¸£à¸§à¸¡ à¸¿",        ""),
    "downgraded":                    ("Downgrade Package",    ""),
    "account_age_at_cutoff":         ("à¸­à¸²à¸¢à¸¸à¸šà¸±à¸à¸Šà¸µ",            "à¸§à¸±à¸™"),
    "spend_decay_ratio":             ("à¸­à¸±à¸•à¸£à¸²à¸à¸²à¸£à¸‹à¸·à¹‰à¸­à¸¥à¸”à¸¥à¸‡",      ""),
}


def _key_reason_from_shap(shap_vals_row: np.ndarray) -> str:
    """Generate key reason text from per-row SHAP values (positive = push toward churn)."""
    feat_shap = list(zip(FEATURE_COLS, shap_vals_row))
    # Sort by absolute impact, keep top 3 that push toward churn (positive SHAP)
    top = sorted(feat_shap, key=lambda x: x[1], reverse=True)[:3]
    reasons = []
    for feat, val in top:
        if val <= 0:
            continue
        label, unit = _FEAT_LABEL.get(feat, (feat, ""))
        reasons.append(f"{label}" + (f" {unit}" if unit else ""))
    return " | ".join(reasons) if reasons else "à¸›à¸à¸•à¸´"


def _compute_auc() -> float | None:
    """Compute AUC from current predictions (churned vs churn_probability)."""
    if _predictions.empty or "churned" not in _predictions.columns:
        return None
    from sklearn.metrics import roc_auc_score
    try:
        # Check if we have both classes
        if len(_predictions["churned"].unique()) < 2:
            return None
        return round(float(roc_auc_score(_predictions["churned"], _predictions["churn_probability"])), 4)
    except Exception:
        return None


def df_to_records(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.to_json(orient="records"))


# â”€â”€ Feature engineering (mirrors train/churn_model.py v3) â”€â”€â”€â”€
def _build_features(users_df: pd.DataFrame = None, pays_df: pd.DataFrame = None) -> pd.DataFrame:
    """Engineer features v3 from DataFrames (or fall back to CSV files)."""
    if users_df is None:
        users = pd.read_csv(USERS_CSV, parse_dates=["expire", "join_date", "last_access", "last_send"])
    else:
        users = users_df.copy()
        for col in ["expire", "join_date", "last_access", "last_send"]:
            if col in users.columns:
                users[col] = pd.to_datetime(users[col])
    if pays_df is None:
        pays = pd.read_csv(PAY_CSV, parse_dates=["payment_date"])
    else:
        pays = pays_df.copy()
        pays["payment_date"] = pd.to_datetime(pays["payment_date"])

    # Reference date for API is "now"
    ref = pd.Timestamp.now().normalize()

    df = users.copy()
    
    # â”€â”€ 4.A Account lifecycle features
    df["account_age_at_cutoff"] = (ref - df["join_date"]).dt.days.clip(lower=0)
    
    # In the API (inference), we use the actual last dates (no clipping needed like in training)
    df["last_access_recency_at_cutoff"] = (ref - df["last_access"]).dt.days.clip(lower=0)
    df["last_send_recency_at_cutoff"]   = (ref - df["last_send"]).dt.days.clip(lower=0)
    df["days_to_expire_at_cutoff"]      = (df["expire"] - ref).dt.days.clip(-365, 365)
    df["expired_at_cutoff"]             = (df["days_to_expire_at_cutoff"] < 0).astype(int)

    # â”€â”€ 4.B RFM base aggregations
    rfm = pays.groupby("acc_id").agg(
        total_payments   = ("payment_date", "count"),
        total_spend      = ("amount",        "sum"),
        avg_spend_per_tx = ("amount",        "mean"),
        max_single_tx    = ("amount",        "max"),
        total_sms_volume = ("sms_volume",    "sum"),
        avg_sms_per_tx   = ("sms_volume",    "mean"),
        unique_products  = ("product_name",  "nunique"),
        _first_pay_date  = ("payment_date",  "min"),
        _last_pay_date   = ("payment_date",  "max"),
    ).reset_index()

    rfm["recency_days"] = (ref - rfm["_last_pay_date"]).dt.days
    rfm["payment_span_days"] = (rfm["_last_pay_date"] - rfm["_first_pay_date"]).dt.days.clip(lower=0)
    rfm["avg_payment_gap_days"] = rfm.apply(
        lambda r: r["payment_span_days"] / max(r["total_payments"] - 1, 1), axis=1
    )
    rfm["credit_burn_rate"] = rfm["total_sms_volume"] / rfm["payment_span_days"].clip(lower=1)
    rfm.drop(["_first_pay_date", "_last_pay_date"], axis=1, inplace=True)

    # â”€â”€ 4.G Usage Decay
    short_start = ref - pd.Timedelta(days=DECAY_SHORT_DAYS)
    long_start  = ref - pd.Timedelta(days=DECAY_LONG_DAYS)

    recent_agg = pays[pays["payment_date"] > short_start].groupby("acc_id").agg(
        spend_recent_90d    = ("amount",       "sum"),
        tx_count_recent_90d = ("payment_date", "count"),
    ).reset_index()

    previous_agg = pays[
        (pays["payment_date"] > long_start) & (pays["payment_date"] <= short_start)
    ].groupby("acc_id").agg(
        spend_previous_90d    = ("amount",       "sum"),
        tx_count_previous_90d = ("payment_date", "count"),
    ).reset_index()

    # â”€â”€ 4.C Last payment amount
    last_pay = pays.sort_values("payment_date").groupby("acc_id")["amount"].last().rename("last_payment_amount").reset_index()

    # â”€â”€ 4.I Dominant credit type
    dom_credit = pays.groupby("acc_id")["credit_type"].agg(
        lambda x: x.mode().iloc[0] if not x.empty else "Unknown"
    ).rename("dominant_credit_type").reset_index()

    # â”€â”€ Merge
    df = df.merge(rfm, on="acc_id", how="left") \
           .merge(recent_agg, on="acc_id", how="left") \
           .merge(previous_agg, on="acc_id", how="left") \
           .merge(last_pay, on="acc_id", how="left") \
           .merge(dom_credit, on="acc_id", how="left")

    # â”€â”€ Fill NaNs
    _zero_fill = [
        "total_payments", "total_spend", "avg_spend_per_tx", "max_single_tx",
        "total_sms_volume", "avg_sms_per_tx", "unique_products",
        "recency_days", "payment_span_days", "avg_payment_gap_days",
        "credit_burn_rate", "last_payment_amount",
        "spend_recent_90d", "tx_count_recent_90d",
        "spend_previous_90d", "tx_count_previous_90d",
    ]
    df[_zero_fill] = df[_zero_fill].fillna(0)
    df["dominant_credit_type"] = df["dominant_credit_type"].fillna("None")

    # For zero-pay: recency = account age
    no_pay = df["total_payments"] == 0
    df.loc[no_pay, "recency_days"] = df.loc[no_pay, "account_age_at_cutoff"]

    # â”€â”€ Composite
    df["spend_decay_ratio"] = df["spend_recent_90d"] / (df["spend_previous_90d"] + 1)
    df["tx_decay_ratio"]    = df["tx_count_recent_90d"] / (df["tx_count_previous_90d"] + 1)
    df["downgraded"]        = ((df["last_payment_amount"] > 0) & (df["last_payment_amount"] < df["avg_spend_per_tx"])).astype(int)
    df["lifetime_value_per_day"] = df["total_spend"] / df["account_age_at_cutoff"].clip(lower=1)

    # â”€â”€ Encoded (Mocking LabelEncoder results from training for consistency)
    # Trial status usually = 1 in most LEs if only Trial/Active exist
    df["status_enc"] = (df["status"].str.lower() == "trial").astype(int)
    # dom_credit_enc: we'll use a fixed map if we don't have the original LE
    # But for a robust API, we should ideally load the LE from the pickle if saved.
    # Since churn_model.py v3 doesn't save the LE, we'll use a simple deterministic map.
    credit_map = {"sms": 0, "email": 1, "none": 2, "unknown": 3}
    df["dom_credit_enc"] = df["dominant_credit_type"].str.lower().map(credit_map).fillna(2)

    # Prediction window ground truth (for AUC tracking)
    # In API, "churned" = expired < today AND no payment last 90d
    df["churned"] = ((df["expire"] < ref) & (df["spend_recent_90d"] == 0)).astype(int)

    return df


# â”€â”€ In-memory state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_predictions: pd.DataFrame = pd.DataFrame()
_model_obj = None  # Contains imputer, calibrated, feature_cols, selected_cols
_shap_explainer = None
_feature_importance: dict = {}
_active_run_id: int | None = None  # kept in memory; source of truth is DB


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# DB HELPERS
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async def _load_dfs_from_db() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Read customers + payments from PostgreSQL, return as DataFrames."""
    async with AsyncSessionLocal() as db:
        c_result = await db.execute(text("SELECT * FROM customers"))
        p_result = await db.execute(text("SELECT * FROM payments"))
        users_df = pd.DataFrame(c_result.mappings().all())
        pays_df  = pd.DataFrame(p_result.mappings().all())
    return users_df, pays_df


def _float_or_none(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return float(v)


async def _save_predictions_to_db(df: pd.DataFrame) -> None:
    """Bulk-upsert prediction rows into PostgreSQL predictions table."""
    conn = await asyncpg.connect(_DB_DSN)
    try:
        rows = [
            (
                str(row.acc_id),
                _float_or_none(row.churn_probability),
                bool(row.churn_predicted),
                str(row.risk_tier),
                str(row.rfm_segment),
                str(row.risk_factor),
                str(row.recommended_action),
                _float_or_none(row.last_access_recency_at_cutoff),
                _float_or_none(row.days_to_expire_at_cutoff),
                _float_or_none(row.account_age_at_cutoff),
                _float_or_none(row.total_payments),
                _float_or_none(row.total_spend),
                _float_or_none(row.ltv),
                _float_or_none(row.avg_spend_per_tx),
                _float_or_none(row.recency_days),
                _float_or_none(row.avg_payment_gap_days),
                _float_or_none(row.total_sms_volume),
                _float_or_none(row.avg_sms_per_tx),
                _float_or_none(row.unique_products),
                int(row.downgraded or 0),
                int(row.churned or 0),
            )
            for _, row in df.iterrows()
        ]
        await conn.executemany(
            """
            INSERT INTO predictions (
                acc_id, churn_probability, churn_predicted, risk_tier, rfm_segment,
                risk_factor, recommended_action, days_since_last_access, days_until_expire,
                account_age_days, total_payments, total_amount_paid, ltv, avg_amount_per_tx,
                last_payment_recency, avg_payment_gap_days, total_sms_volume, avg_sms_volume,
                unique_products, downgraded, churned
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
            ON CONFLICT (acc_id) DO UPDATE SET
                churn_probability      = EXCLUDED.churn_probability,
                churn_predicted        = EXCLUDED.churn_predicted,
                risk_tier              = EXCLUDED.risk_tier,
                rfm_segment            = EXCLUDED.rfm_segment,
                risk_factor            = EXCLUDED.risk_factor,
                recommended_action     = EXCLUDED.recommended_action,
                days_since_last_access = EXCLUDED.days_since_last_access,
                days_until_expire      = EXCLUDED.days_until_expire,
                account_age_days       = EXCLUDED.account_age_days,
                total_payments         = EXCLUDED.total_payments,
                total_amount_paid      = EXCLUDED.total_amount_paid,
                ltv                    = EXCLUDED.ltv,
                avg_amount_per_tx      = EXCLUDED.avg_amount_per_tx,
                last_payment_recency   = EXCLUDED.last_payment_recency,
                avg_payment_gap_days   = EXCLUDED.avg_payment_gap_days,
                total_sms_volume       = EXCLUDED.total_sms_volume,
                avg_sms_volume         = EXCLUDED.avg_sms_volume,
                unique_products        = EXCLUDED.unique_products,
                downgraded             = EXCLUDED.downgraded,
                churned                = EXCLUDED.churned,
                computed_at            = NOW()
            """,
            rows,
        )
    finally:
        await conn.close()


def _run_ml_pipeline(df: pd.DataFrame) -> pd.DataFrame:
    """Run feature imputation + model inference on feature DataFrame. Returns enriched df."""
    imputer       = _model_obj["imputer"]
    calibrated    = _model_obj["calibrated"]
    full_cols     = _model_obj["feature_cols"]
    selected_cols = _model_obj["selected_cols"]

    X_full = imputer.transform(df[full_cols])
    sel_idx = [full_cols.index(c) for c in selected_cols]
    X_sel = X_full[:, sel_idx]

    df["churn_probability"] = calibrated.predict_proba(X_sel)[:, 1]
    df["churn_predicted"]   = (df["churn_probability"] >= 0.5).astype(int)

    df["risk_tier"] = df["churn_probability"].apply(
        lambda p: "High" if p >= 0.6 else ("Medium" if p >= 0.3 else "Low")
    )
    df["ltv"] = df["total_spend"]
    df["rfm_segment"] = df.apply(
        lambda r: _rfm_segment(r["last_access_recency_at_cutoff"], r["total_payments"], r["total_spend"]), axis=1
    )
    df["risk_factor"]        = df.apply(_risk_factor, axis=1)
    df["recommended_action"] = df.apply(
        lambda r: _recommended_action(r["churn_probability"], r["rfm_segment"]), axis=1
    )
    df["key_reason"] = df.apply(_risk_factor, axis=1)

    # Legacy aliases for frontend compatibility
    df["total_amount_paid"]      = df["total_spend"]
    df["days_since_last_access"] = df["last_access_recency_at_cutoff"]
    df["days_until_expire"]      = df["days_to_expire_at_cutoff"]
    df["account_age_days"]       = df["account_age_at_cutoff"]
    df["last_payment_recency"]   = df["recency_days"]
    df["avg_amount_per_tx"]      = df["avg_spend_per_tx"]
    df["avg_sms_volume"]         = df["avg_sms_per_tx"]
    return df


_PRED_CACHE_COLS = [
    "acc_id", "status", "expire", "join_date",
    "last_access_recency_at_cutoff", "days_to_expire_at_cutoff",
    "total_payments", "total_spend", "ltv",
    "avg_spend_per_tx", "recency_days", "avg_payment_gap_days",
    "total_sms_volume", "avg_sms_per_tx", "unique_products",
    "downgraded", "account_age_at_cutoff",
    "churn_probability", "churn_predicted", "risk_tier", "churned",
    "rfm_segment", "risk_factor", "recommended_action", "key_reason",
    "total_amount_paid", "days_since_last_access", "days_until_expire",
    "account_age_days", "last_payment_recency", "avg_amount_per_tx", "avg_sms_volume",
]


async def _rebuild_predictions() -> int:
    """Read from DB â†’ feature engineering â†’ ML â†’ save to DB + update memory cache."""
    global _predictions
    if _model_obj is None:
        return 0

    users_df, pays_df = await _load_dfs_from_db()
    if users_df.empty or pays_df.empty:
        return 0

    df = _build_features(users_df=users_df, pays_df=pays_df)
    df = _run_ml_pipeline(df)

    await _save_predictions_to_db(df)

    _predictions = df[[c for c in _PRED_CACHE_COLS if c in df.columns]].copy()
    _predictions["risk_tier"] = _predictions["risk_tier"].astype(str)
    return len(_predictions)


@app.on_event("startup")
async def load_assets():
    global _model_obj, _shap_explainer, _feature_importance, _active_run_id

    if MODEL_PKL.exists():
        try:
            _model_obj = joblib.load(MODEL_PKL)
            print(f"[OK] Model v3 loaded ({_model_obj.get('model_name')})")
        except Exception as e:
            print(f"[ERROR] Failed to load model: {e}")

    if SHAP_PKL.exists():
        try:
            obj = joblib.load(SHAP_PKL)
            _shap_explainer = obj["explainer"]
            print("[OK] SHAP explainer loaded")
        except Exception as e:
            print(f"[WARN] SHAP load failed: {e}")

    if _model_obj is not None:
        calibrated    = _model_obj["calibrated"]
        base          = getattr(calibrated, "_base", calibrated)
        selected_cols = _model_obj["selected_cols"]
        if hasattr(base, "feature_importances_"):
            fi = base.feature_importances_
            _feature_importance = dict(zip(selected_cols, [round(float(v), 5) for v in fi]))
            _feature_importance = dict(sorted(_feature_importance.items(), key=lambda x: x[1], reverse=True))

    # Load predictions + active run from DB
    try:
        async with AsyncSessionLocal() as db:
            # predictions joined with customers (for join_date, expire, status)
            p_result = await db.execute(text("""
                SELECT p.*, c.join_date, c.expire, c.status
                FROM predictions p
                LEFT JOIN customers c ON p.acc_id = c.acc_id
            """))
            rows = p_result.mappings().all()
            if rows:
                global _predictions
                _predictions = pd.DataFrame(rows)
                # Ensure legacy alias columns exist
                if "last_access_recency_at_cutoff" not in _predictions.columns and "days_since_last_access" in _predictions.columns:
                    _predictions["last_access_recency_at_cutoff"] = _predictions["days_since_last_access"]
                if "days_to_expire_at_cutoff" not in _predictions.columns and "days_until_expire" in _predictions.columns:
                    _predictions["days_to_expire_at_cutoff"] = _predictions["days_until_expire"]
                if "account_age_at_cutoff" not in _predictions.columns and "account_age_days" in _predictions.columns:
                    _predictions["account_age_at_cutoff"] = _predictions["account_age_days"]
                if "recency_days" not in _predictions.columns and "last_payment_recency" in _predictions.columns:
                    _predictions["recency_days"] = _predictions["last_payment_recency"]
                if "avg_spend_per_tx" not in _predictions.columns and "avg_amount_per_tx" in _predictions.columns:
                    _predictions["avg_spend_per_tx"] = _predictions["avg_amount_per_tx"]
                if "avg_sms_per_tx" not in _predictions.columns and "avg_sms_volume" in _predictions.columns:
                    _predictions["avg_sms_per_tx"] = _predictions["avg_sms_volume"]
                if "total_spend" not in _predictions.columns and "total_amount_paid" in _predictions.columns:
                    _predictions["total_spend"] = _predictions["total_amount_paid"]
                print(f"[OK] Loaded {len(_predictions)} predictions from DB")
            else:
                print("[INFO] No predictions in DB yet")

            # active run (most recent)
            r_result = await db.execute(
                text("SELECT id FROM prediction_runs ORDER BY id DESC LIMIT 1")
            )
            run_row = r_result.mappings().first()
            if run_row:
                _active_run_id = run_row["id"]
    except Exception as e:
        print(f"[WARN] Could not load from DB on startup: {e}")

    print("[OK] Assets loaded")


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# GET /api/stats
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get("/api/stats")
def get_stats():
    if _predictions.empty:
        raise HTTPException(404, "No prediction data found")

    df = _predictions
    total   = len(df)
    churned = int(df["churned"].sum())
    high    = int((df["churn_probability"] >= 0.6).sum())
    medium  = int(((df["churn_probability"] >= 0.3) & (df["churn_probability"] < 0.6)).sum())
    low     = int((df["churn_probability"] < 0.3).sum())

    avg_spend_active  = round(float(df[df["churned"]==0]["total_spend"].mean()), 2)
    avg_spend_churned = round(float(df[df["churned"]==1]["total_spend"].mean()), 2)

    # Revenue at Risk = total LTV of high-risk customers
    revenue_at_risk = round(float(df[df["churn_probability"] >= 0.6]["ltv"].sum()), 2)

    calibrated = _model_obj.get("calibrated") if _model_obj else None
    base = getattr(calibrated, "_base", calibrated)
    model_name = type(base).__name__ if base else "Unknown"

    return {
        "total_customers":   total,
        "active_customers":  total - churned,
        "churned_customers": churned,
        "churn_rate":        round(churned / total * 100, 2),
        "high_risk":         high,
        "medium_risk":       medium,
        "low_risk":          low,
        "avg_spend_active":  avg_spend_active,
        "avg_spend_churned": avg_spend_churned,
        "revenue_at_risk":   revenue_at_risk,
        "model_name":        model_name,
        "model_auc":         _compute_auc(),
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# GET /api/churn-trend  â€” monthly churn rate by join cohort
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get("/api/churn-trend")
def churn_trend():
    if _predictions.empty:
        raise HTTPException(404, "No prediction data found")

    df = _predictions.copy()
    df["join_month"] = pd.to_datetime(df["join_date"]).dt.to_period("M")
    grouped = df.groupby("join_month").agg(
        total=("acc_id", "count"),
        churned=("churned", "sum"),
    ).reset_index()
    grouped["rate"] = (grouped["churned"] / grouped["total"] * 100).round(1)
    grouped = grouped.sort_values("join_month").tail(6)

    return [
        {"month": str(r["join_month"]), "rate": float(r["rate"]), "total": int(r["total"]), "churned": int(r["churned"])}
        for _, r in grouped.iterrows()
    ]


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# GET /api/retention-trend  â€” monthly churned vs retained
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get("/api/retention-trend")
def retention_trend():
    if _predictions.empty:
        raise HTTPException(404, "No prediction data found")

    df = _predictions.copy()
    df["join_month"] = pd.to_datetime(df["join_date"]).dt.to_period("M")
    grouped = df.groupby("join_month").agg(
        churned=("churned", "sum"),
        total=("acc_id", "count"),
    ).reset_index()
    grouped["retained"] = grouped["total"] - grouped["churned"]
    grouped = grouped.sort_values("join_month").tail(6)

    return [
        {"month": str(r["join_month"]), "churned": int(r["churned"]), "retained": int(r["retained"])}
        for _, r in grouped.iterrows()
    ]


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# GET /api/predictions
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get("/api/predictions")
def get_predictions(
    risk: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "churn_probability",
    order: str = "desc",
    page: int = 1,
    page_size: int = 50,
):
    if _predictions.empty:
        raise HTTPException(404, "No prediction data found")

    df = _predictions.copy()
    df["risk"] = df["churn_probability"].apply(risk_label)

    if risk:
        df = df[df["risk"].str.lower() == risk.lower()]
    if status:
        df = df[df["status"].str.lower() == status.lower()]
    if search:
        df = df[df["acc_id"].str.contains(search, case=False, na=False)]

    valid_sorts = {"churn_probability", "total_amount_paid", "ltv",
                   "days_since_last_access", "total_payments"}
    if sort_by not in valid_sorts:
        sort_by = "churn_probability"
    df = df.sort_values(sort_by, ascending=(order == "asc"))

    total_count = len(df)
    start = (page - 1) * page_size
    page_df = df.iloc[start:start + page_size]

    return {
        "total":       total_count,
        "page":        page,
        "page_size":   page_size,
        "total_pages": max(1, -(-total_count // page_size)),
        "data":        df_to_records(page_df),
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# GET /api/predictions/{acc_id}
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get("/api/predictions/{acc_id}")
async def get_customer(acc_id: str):
    if _predictions.empty:
        raise HTTPException(404, "No prediction data")
    row = _predictions[_predictions["acc_id"] == acc_id]
    if row.empty:
        raise HTTPException(404, f"Account {acc_id} not found")

    record = row.iloc[0].to_dict()

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                text("""
                    SELECT payment_date, amount, sms_volume, product_name
                    FROM payments
                    WHERE acc_id = :acc_id
                    ORDER BY payment_date
                """),
                {"acc_id": acc_id},
            )
            pay_rows = result.mappings().all()
        record["payment_history"] = [
            {**dict(r), "payment_date": str(r["payment_date"])} for r in pay_rows
        ]
    except Exception:
        record["payment_history"] = []

    record["risk"] = risk_label(record.get("churn_probability", 0))
    return record


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# GET /api/top-risk
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get("/api/top-risk")
def top_risk(n: int = 10):
    if _predictions.empty:
        raise HTTPException(404, "No prediction data")
    top = _predictions.nlargest(n, "churn_probability").copy()
    top["risk"] = top["churn_probability"].apply(risk_label)
    return df_to_records(top)


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# GET /api/export  â€” download filtered predictions as CSV
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get("/api/export")
def export_csv(
    risk: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "churn_probability",
    order: str = "desc",
):
    if _predictions.empty:
        raise HTTPException(404, "No prediction data found")

    df = _predictions.copy()
    df["risk"] = df["churn_probability"].apply(risk_label)

    if risk:
        df = df[df["risk"].str.lower() == risk.lower()]
    if status:
        df = df[df["status"].str.lower() == status.lower()]
    if search:
        df = df[df["acc_id"].str.contains(search, case=False, na=False)]

    valid_sorts = {"churn_probability", "total_amount_paid", "ltv",
                   "days_since_last_access", "total_payments"}
    if sort_by not in valid_sorts:
        sort_by = "churn_probability"
    df = df.sort_values(sort_by, ascending=(order == "asc"))

    export_cols = [
        "acc_id", "status", "credit", "expire",
        "churn_probability", "risk", "rfm_segment",
        "ltv", "risk_factor", "recommended_action",
        "days_since_last_access", "total_payments", "total_amount_paid",
    ]
    df_export = df[[c for c in export_cols if c in df.columns]].copy()
    df_export["churn_probability"] = (df_export["churn_probability"] * 100).round(2).astype(str) + "%"

    buf = io.StringIO()
    df_export.to_csv(buf, index=False, encoding="utf-8-sig")
    buf.seek(0)

    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=churn_predictions.csv"},
    )


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# GET /api/model-info
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get("/api/model-info")
def model_info():
    calibrated = _model_obj.get("calibrated") if _model_obj else None
    base = getattr(calibrated, "_base", calibrated)
    classifier_name = type(base).__name__ if base else "Unknown"

    real_auc = _compute_auc()

    return {
        "model_type":    "Pipeline v3 (Calibrated)" if _model_obj else "Not loaded",
        "classifier":    classifier_name,
        "n_estimators":  getattr(base, "n_estimators", "N/A"),
        "max_depth":     getattr(base, "max_depth", "N/A"),
        "n_features":    len(FEATURE_COLS),
        "features":      FEATURE_COLS,
        "test_auc":      real_auc,
        "feature_importance": _feature_importance,
        "shap_available": _shap_explainer is not None,
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# POST /api/predict  â€” live prediction via .pkl model
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
class PredictRequest(BaseModel):
    status: str
    credit: str
    expire: str
    join_date: str
    last_access: str
    last_send: str
    total_payments: float        = 0
    total_amount_paid: float     = 0
    avg_amount_per_tx: float     = 0
    total_sms_volume: float      = 0
    avg_sms_volume: float        = 0
    unique_products: float       = 0
    last_payment_recency: float  = 999
    avg_payment_gap_days: float  = 0
    last_payment_amount: float   = 0
    downgraded: int              = 0
    dominant_credit_type: str    = "None"

@app.post("/api/predict")
def predict(req: PredictRequest):
    if _model_obj is None:
        raise HTTPException(503, "Model not loaded â€” run churn_model.py first")

    # This endpoint mimics the v3 feature engineering for a single record
    # Since v3 uses complex decay features, we'll use a simplified version for live hits
    # or better: we expect the request to eventually match v3 or we map it.
    
    # Deriving v3 features from request
    ref = pd.Timestamp.now().normalize()
    exp = pd.Timestamp(req.expire)
    join = pd.Timestamp(req.join_date)
    la = pd.Timestamp(req.last_access)
    ls = pd.Timestamp(req.last_send)

    # Base features
    row = {
        "account_age_at_cutoff": (ref - join).days,
        "last_access_recency_at_cutoff": (ref - la).days,
        "last_send_recency_at_cutoff": (ref - ls).days,
        "days_to_expire_at_cutoff": (exp - ref).days,
        "expired_at_cutoff": 1 if (exp < ref) else 0,
        "recency_days": req.last_payment_recency,
        "total_payments": req.total_payments,
        "total_spend": req.total_amount_paid,
        "avg_spend_per_tx": req.avg_amount_per_tx,
        "max_single_tx": req.avg_amount_per_tx, # approx
        "last_payment_amount": req.last_payment_amount,
        "downgraded": req.downgraded,
        "lifetime_value_per_day": req.total_amount_paid / max((ref - join).days, 1),
        "total_sms_volume": req.total_sms_volume,
        "avg_sms_per_tx": req.avg_sms_volume,
        "unique_products": req.unique_products,
        "credit_burn_rate": req.total_sms_volume / max(req.avg_payment_gap_days * req.total_payments, 1),
        "payment_span_days": req.avg_payment_gap_days * req.total_payments,
        "avg_payment_gap_days": req.avg_payment_gap_days,
        
        # Decay features (approximated for single hit if not provided)
        "spend_recent_90d": req.total_amount_paid * 0.5, # mock
        "spend_previous_90d": req.total_amount_paid * 0.5, # mock
        "spend_decay_ratio": 1.0,
        "tx_count_recent_90d": req.total_payments * 0.5, # mock
        "tx_count_previous_90d": req.total_payments * 0.5, # mock
        "tx_decay_ratio": 1.0,
        
        "dom_credit_enc": 1 # mock
    }

    # Transform
    X_df = pd.DataFrame([row])
    imputer = _model_obj["imputer"]
    calibrated = _model_obj["calibrated"]
    full_cols = _model_obj["feature_cols"]
    selected_cols = _model_obj["selected_cols"]
    
    # Ensure all columns exist in X_df
    for c in full_cols:
        if c not in X_df.columns:
            X_df[c] = 0
            
    X_imp = imputer.transform(X_df[full_cols])
    sel_idx = [full_cols.index(c) for c in selected_cols]
    X_sel = X_imp[:, sel_idx]
    
    prob = float(calibrated.predict_proba(X_sel)[0, 1])

    return {
        "churn_probability": round(prob, 4),
        "churn_predicted":   int(prob >= 0.5),
        "risk":              risk_label(prob),
        "features_used":     row,
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# GET /api/explain/{acc_id}  â€” SHAP explanation per customer
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.get("/api/explain/{acc_id}")
def explain_customer(acc_id: str):
    if _predictions.empty:
        raise HTTPException(404, "No prediction data")
    if _shap_explainer is None:
        raise HTTPException(503, "SHAP explainer not loaded")
    if _model_obj is None:
        raise HTTPException(503, "Model not loaded")

    row_df = _predictions[_predictions["acc_id"] == acc_id]
    if row_df.empty:
        raise HTTPException(404, f"Account {acc_id} not found")

    imputer = _model_obj["imputer"]
    full_cols = _model_obj["feature_cols"]
    selected_cols = _model_obj["selected_cols"]
    
    X_full = imputer.transform(row_df[full_cols])
    sel_idx = [full_cols.index(c) for c in selected_cols]
    X_sel = X_full[:, sel_idx]

    shap_vals = _shap_explainer.shap_values(X_sel)
    # Binary classifiers might return list [neg, pos]
    vals = shap_vals[1][0] if isinstance(shap_vals, list) else shap_vals[0]
    if hasattr(vals, "values"): vals = vals.values # handle Explanation objects

    contributions = [
        {
            "feature":     feat,
            "shap_value":  round(float(val), 5),
            "label":       _FEAT_LABEL.get(feat, (feat, ""))[0],
            "direction":   "churn" if val > 0 else "retain",
        }
        for feat, val in sorted(zip(selected_cols, vals), key=lambda x: abs(x[1]), reverse=True)
    ]

    return {
        "acc_id":        acc_id,
        "churn_probability": round(float(row_df.iloc[0]["churn_probability"]), 4),
        "contributions": contributions,
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# POST /api/chat  â€” AI Chatbot (Qwen via Ollama + PostgreSQL)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
from chat_service import chat as _chat_service

class ChatRequest(BaseModel):
    message:  str
    history:  list[dict] = []
    run_id:   int | None = None
    run_name: str | None = None

@app.post("/api/chat")
async def api_chat(req: ChatRequest):
    """
    AI chatbot endpoint â€” Text-to-SQL (LLM à¹€à¸‚à¸µà¸¢à¸™ SQL à¹€à¸­à¸‡à¸•à¸²à¸¡à¸„à¸³à¸–à¸²à¸¡)

    Body:
        message  â€” à¸„à¸³à¸–à¸²à¸¡à¸ˆà¸²à¸à¸œà¸¹à¹‰à¹ƒà¸Šà¹‰ (à¸ à¸²à¸©à¸²à¹„à¸—à¸¢à¸«à¸£à¸·à¸­à¸­à¸±à¸‡à¸à¸¤à¸©)
        history  â€” list of {role, content} à¸šà¸—à¸ªà¸™à¸—à¸™à¸²à¸¢à¹‰à¸­à¸™à¸«à¸¥à¸±à¸‡
        run_id   â€” ID à¸‚à¸­à¸‡ Prediction Run (optional)
        run_name â€” à¸Šà¸·à¹ˆà¸­ Prediction Run (optional)

    Returns:
        reply        â€” à¸„à¸³à¸•à¸­à¸šà¸ à¸²à¸©à¸²à¹„à¸—à¸¢
        sql_executed â€” SQL à¸—à¸µà¹ˆ LLM à¸ªà¸£à¹‰à¸²à¸‡à¹à¸¥à¸°à¸£à¸±à¸™à¸ˆà¸£à¸´à¸‡
    """
    if not req.message.strip():
        raise HTTPException(400, "message cannot be empty")

    async with AsyncSessionLocal() as db:
        result = await _chat_service(
            message  = req.message.strip(),
            history  = req.history,
            db       = db,
            run_id   = req.run_id,
            run_name = req.run_name,
        )
    return result



# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# POST /api/import-csv  â€” upload users or payments CSV â†’ PostgreSQL
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
@app.post("/api/import-csv")
async def import_csv(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "à¸à¸£à¸¸à¸“à¸²à¸­à¸±à¸›à¹‚à¸«à¸¥à¸”à¹„à¸Ÿà¸¥à¹Œ .csv à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™")

    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸­à¹ˆà¸²à¸™à¹„à¸Ÿà¸¥à¹Œ CSV à¹„à¸”à¹‰: {e}")

    cols = set(df.columns.str.lower())
    if "acc_id" in cols and "payment_date" in cols:
        kind = "payments"
    elif "acc_id" in cols and ("join_date" in cols or "expire" in cols):
        kind = "users"
    else:
        raise HTTPException(
            400,
            "à¹„à¸¡à¹ˆà¸£à¸¹à¹‰à¸ˆà¸±à¸à¸£à¸¹à¸›à¹à¸šà¸šà¹„à¸Ÿà¸¥à¹Œ â€” à¸•à¹‰à¸­à¸‡à¸¡à¸µà¸„à¸­à¸¥à¸±à¸¡à¸™à¹Œ acc_id à¹à¸¥à¸° (payment_date à¸ªà¸³à¸«à¸£à¸±à¸š payments / join_date à¸ªà¸³à¸«à¸£à¸±à¸š users)"
        )

    # â”€â”€ Upsert into PostgreSQL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    conn = await asyncpg.connect(_DB_DSN)
    try:
        if kind == "users":
            for col in ["expire", "join_date", "last_access", "last_send"]:
                if col in df.columns:
                    df[col] = pd.to_datetime(df[col], errors="coerce")

            # FIX Bug 3: Delete old customers first (cascades to payments + predictions)
            # ensuring each new batch is a clean slate.
            await conn.execute("DELETE FROM customers")

            rows = [
                (
                    str(r.acc_id),
                    str(r.status) if pd.notna(r.get("status", None)) else "trial",
                    int(r.get("credit", 0) or 0),
                    int(r.get("credit_premium", 0) or 0),
                    int(r.get("credit_email", 0) or 0),
                    r["expire"].date()      if "expire"      in df.columns and pd.notna(r["expire"])      else None,
                    r["join_date"].date()   if "join_date"   in df.columns and pd.notna(r["join_date"])   else None,
                    r["last_access"].to_pydatetime() if "last_access" in df.columns and pd.notna(r["last_access"]) else None,
                    r["last_send"].to_pydatetime()   if "last_send"   in df.columns and pd.notna(r["last_send"])   else None,
                    str(r["paid_email"]) if "paid_email" in df.columns and pd.notna(r.get("paid_email")) else None,
                )
                for _, r in df.iterrows()
            ]
            await conn.executemany(
                """
                INSERT INTO customers
                    (acc_id, status, credit, credit_premium, credit_email,
                     expire, join_date, last_access, last_send, paid_email)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (acc_id) DO UPDATE SET
                    status         = EXCLUDED.status,
                    credit         = EXCLUDED.credit,
                    credit_premium = EXCLUDED.credit_premium,
                    credit_email   = EXCLUDED.credit_email,
                    expire         = EXCLUDED.expire,
                    last_access    = EXCLUDED.last_access,
                    last_send      = EXCLUDED.last_send,
                    updated_at     = NOW()
                """,
                rows,
            )

        else:  # payments
            # FIX Bug 1: Payments upload requires customers to exist first (FK constraint).
            # Reject early with a clear error if customers table is empty.
            cust_count = await conn.fetchval("SELECT COUNT(*) FROM customers")
            if not cust_count:
                raise HTTPException(
                    400,
                    "à¸à¸£à¸¸à¸“à¸² import Users CSV à¸à¹ˆà¸­à¸™ â€” à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥ customers à¹ƒà¸™ database"
                )

            df["payment_date"] = pd.to_datetime(df["payment_date"], errors="coerce")
            # FIX Bug 1: Filter to acc_ids that actually exist in customers (avoid FK violation)
            existing_accs = set(
                r["acc_id"] for r in await conn.fetch("SELECT acc_id FROM customers")
            )
            await conn.execute("DELETE FROM payments")
            rows = [
                (
                    str(r.acc_id),
                    r["payment_date"].to_pydatetime(),
                    0.0 if pd.isna(r.get("amount", None)) else float(r.get("amount") or 0),
                    0   if pd.isna(r.get("sms_volume", None)) else int(r.get("sms_volume") or 0),
                    str(r["product_name"]) if "product_name" in df.columns and pd.notna(r.get("product_name")) else None,
                    str(r["credit_type"])  if "credit_type"  in df.columns and pd.notna(r.get("credit_type"))  else None,
                )
                for _, r in df.iterrows()
                if pd.notna(r["payment_date"]) and str(r.acc_id) in existing_accs
            ]
            await conn.executemany(
                """
                INSERT INTO payments (acc_id, payment_date, amount, sms_volume, product_name, credit_type)
                VALUES ($1,$2,$3,$4,$5,$6)
                """,
                rows,
            )
    finally:
        await conn.close()

    # â”€â”€ Update active run upload flags in DB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if _active_run_id is not None:
        col_flag = "users_uploaded" if kind == "users" else "payments_uploaded"
        async with AsyncSessionLocal() as db:
            await db.execute(
                text(f"UPDATE prediction_runs SET {col_flag} = TRUE WHERE id = :rid"),
                {"rid": _active_run_id},
            )
            await db.commit()

    # â”€â”€ Check if both tables have data â†’ rebuild predictions â”€â”€
    rebuilt = 0
    async with AsyncSessionLocal() as db:
        c_count = (await db.execute(text("SELECT COUNT(*) FROM customers"))).scalar()
        p_count = (await db.execute(text("SELECT COUNT(*) FROM payments"))).scalar()
    if c_count and p_count:
        # FIX Bug 2: Catch any rebuild failure and mark run as error
        try:
            rebuilt = await _rebuild_predictions()
        except Exception as e:
            print(f"[ERROR] _rebuild_predictions failed: {e}")
            if _active_run_id is not None:
                async with AsyncSessionLocal() as db:
                    await db.execute(
                        text("UPDATE prediction_runs SET status = 'error' WHERE id = :rid"),
                        {"rid": _active_run_id},
                    )
                    await db.commit()
            raise HTTPException(500, f"à¸à¸²à¸£à¸„à¸³à¸™à¸§à¸“ predictions à¸¥à¹‰à¸¡à¹€à¸«à¸¥à¸§: {e}")

        # If both files uploaded but rebuilt=0, mark as error (e.g. model not loaded)
        if rebuilt == 0 and _active_run_id is not None:
            reason = "à¹‚à¸¡à¹€à¸”à¸¥à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰ train â€” à¸à¸£à¸¸à¸“à¸²à¸£à¸±à¸™ churn_model.py à¸à¹ˆà¸­à¸™" if _model_obj is None else "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸„à¸³à¸™à¸§à¸“ predictions à¹„à¸”à¹‰"
            print(f"[WARN] rebuild returned 0: {reason}")
            async with AsyncSessionLocal() as db:
                await db.execute(
                    text("UPDATE prediction_runs SET status = 'error' WHERE id = :rid"),
                    {"rid": _active_run_id},
                )
                await db.commit()
            raise HTTPException(500, reason)

    # â”€â”€ Mark run as done â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if rebuilt > 0 and _active_run_id is not None:
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("""
                    UPDATE prediction_runs
                    SET status = 'done', completed_at = NOW(), customers_count = :cnt
                    WHERE id = :rid AND status != 'done'
                """),
                {"cnt": rebuilt, "rid": _active_run_id},
            )
            await db.commit()

    inserted = len(rows)
    skipped  = len(df) - inserted if kind == "payments" else 0
    return {
        "message": f"Import {kind} à¸ªà¸³à¹€à¸£à¹‡à¸ˆ {inserted:,} à¹à¸–à¸§ ({file.filename})"
                   + (f" (à¸‚à¹‰à¸²à¸¡ {skipped:,} à¹à¸–à¸§à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸¡à¸µ customer)" if skipped else "")
                   + (f" â€” à¸„à¸³à¸™à¸§à¸“ predictions {rebuilt:,} à¸£à¸²à¸¢à¸à¸²à¸£à¹à¸¥à¹‰à¸§" if rebuilt else " â€” à¸£à¸­ import à¸­à¸µà¸à¹„à¸Ÿà¸¥à¹Œ"),
        "rows":              inserted,
        "rows_skipped":      skipped,
        "type":              kind,
        "predictions_ready": rebuilt > 0,
        "predictions_count": rebuilt,
    }


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# Prediction Run management  (DB-backed)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class RunCreateBody(BaseModel):
    name: str


def _row_to_run(row) -> dict:
    d = dict(row)
    for k in ("created_at", "completed_at"):
        if d.get(k) is not None:
            d[k] = str(d[k])
    return d


@app.post("/api/runs")
async def create_run(body: RunCreateBody):
    global _active_run_id
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "à¸à¸£à¸¸à¸“à¸²à¸£à¸°à¸šà¸¸à¸Šà¸·à¹ˆà¸­ Prediction Run")
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("""
                INSERT INTO prediction_runs (name, status, users_uploaded, payments_uploaded, customers_count)
                VALUES (:name, 'pending', FALSE, FALSE, 0)
                RETURNING *
            """),
            {"name": name},
        )
        await db.commit()
        row = result.mappings().first()
    run = _row_to_run(row)
    _active_run_id = run["id"]
    return run


@app.get("/api/runs")
async def list_runs():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("SELECT * FROM prediction_runs ORDER BY id DESC")
        )
        rows = result.mappings().all()
    return [_row_to_run(r) for r in rows]


@app.get("/api/runs/active")
async def get_active_run():
    if _active_run_id is None:
        return None
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("SELECT * FROM prediction_runs WHERE id = :rid"),
            {"rid": _active_run_id},
        )
        row = result.mappings().first()
    return _row_to_run(row) if row else None


@app.get("/api/runs/{run_id}")
async def get_run(run_id: int):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("SELECT * FROM prediction_runs WHERE id = :rid"),
            {"rid": run_id},
        )
        row = result.mappings().first()
    if not row:
        raise HTTPException(404, f"Run {run_id} not found")
    return _row_to_run(row)


@app.delete("/api/runs/{run_id}")
async def delete_run(run_id: int):
    global _active_run_id
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("DELETE FROM prediction_runs WHERE id = :rid RETURNING id"),
            {"rid": run_id},
        )
        await db.commit()
        deleted = result.fetchone()
    if not deleted:
        raise HTTPException(404, f"Run {run_id} not found")
    if _active_run_id == run_id:
        # Fall back to most recent remaining run
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                text("SELECT id FROM prediction_runs ORDER BY id DESC LIMIT 1")
            )
            row = result.mappings().first()
        _active_run_id = row["id"] if row else None
    return {"ok": True}


