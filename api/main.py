"""
Churn CRM — FastAPI Backend
Endpoints:
  GET  /api/stats                → KPI summary
  GET  /api/predictions          → all customers with churn data
  GET  /api/predictions/{acc_id} → single customer detail
  POST /api/predict              → score a new customer record live
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
import pandas as pd
import numpy as np
import joblib
import json
import os

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

app = FastAPI(title="Churn CRM API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Paths ─────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent.parent
TRAIN_DIR   = BASE_DIR / "train"
PRED_CSV    = TRAIN_DIR / "output" / "churn_predictions.csv"
USERS_CSV   = TRAIN_DIR / "data" / "sample_users.csv"
PAY_CSV     = TRAIN_DIR / "data" / "sample_payments.csv"
MODEL_PKL   = TRAIN_DIR / "output" / "churn_model.pkl"
MODEL_H5    = TRAIN_DIR / "output" / "churn_model_keras.h5"

# ── Feature columns (must match training order) ───────────
FEATURE_COLS = [
    "status_enc", "credit_enc",
    "days_since_last_access", "days_since_last_send",
    "days_until_expire", "account_age_days",
    "total_payments", "total_amount_paid", "avg_amount_per_tx",
    "total_sms_volume", "avg_sms_volume", "unique_products",
    "last_payment_recency", "avg_payment_gap_days",
    "last_payment_amount", "downgraded", "dom_credit_enc",
]

REFERENCE_DATE = pd.Timestamp("2026-03-06")

# ── Load assets at startup ────────────────────────────────
_predictions: pd.DataFrame = pd.DataFrame()
_model = None
_keras_model = None

@app.on_event("startup")
def load_assets():
    global _predictions, _model, _keras_model
    if PRED_CSV.exists():
        _predictions = pd.read_csv(PRED_CSV)
        # normalise risk_tier emojis for JSON safety
        _predictions["risk_tier"] = _predictions["risk_tier"].astype(str)
    if MODEL_PKL.exists():
        _model = joblib.load(MODEL_PKL)
    if MODEL_H5.exists():
        try:
            from tensorflow import keras
            _keras_model = keras.models.load_model(str(MODEL_H5))
            print("✅ Keras H5 model loaded")
        except Exception as e:
            print(f"⚠️  Keras model load failed: {e}")


# ── Helpers ───────────────────────────────────────────────
def df_to_records(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.to_json(orient="records"))

def risk_label(prob: float) -> str:
    if prob >= 0.6:  return "High"
    if prob >= 0.3:  return "Medium"
    return "Low"


# ══════════════════════════════════════════════════════════
# GET /api/stats
# ══════════════════════════════════════════════════════════
@app.get("/api/stats")
def get_stats():
    if _predictions.empty:
        raise HTTPException(404, "No prediction data found")

    df = _predictions
    total  = len(df)
    churned = int(df["churned"].sum())
    high    = int((df["churn_probability"] >= 0.6).sum())
    medium  = int(((df["churn_probability"] >= 0.3) & (df["churn_probability"] < 0.6)).sum())
    low     = int((df["churn_probability"] < 0.3).sum())

    # avg spend for active vs churned
    avg_spend_active  = round(float(df[df["churned"]==0]["total_amount_paid"].mean()), 2)
    avg_spend_churned = round(float(df[df["churned"]==1]["total_amount_paid"].mean()), 2)

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
        "model_name":        "Random Forest",
        "model_auc":         1.0,
    }


# ══════════════════════════════════════════════════════════
# GET /api/predictions
# ══════════════════════════════════════════════════════════
@app.get("/api/predictions")
def get_predictions(
    risk: Optional[str] = None,         # High | Medium | Low
    status: Optional[str] = None,       # paid | trial
    search: Optional[str] = None,
    sort_by: str = "churn_probability",
    order: str = "desc",
    page: int = 1,
    page_size: int = 50,
):
    if _predictions.empty:
        raise HTTPException(404, "No prediction data found")

    df = _predictions.copy()

    # Add computed risk column (clean string)
    def _risk(p):
        if p >= 0.6:   return "High"
        if p >= 0.3:   return "Medium"
        return "Low"
    df["risk"] = df["churn_probability"].apply(_risk)

    # Filters
    if risk:
        df = df[df["risk"].str.lower() == risk.lower()]
    if status:
        df = df[df["status"].str.lower() == status.lower()]
    if search:
        mask = df["acc_id"].str.contains(search, case=False, na=False)
        df = df[mask]

    # Sort
    valid_sorts = {"churn_probability", "total_amount_paid",
                   "days_since_last_access", "total_payments"}
    if sort_by not in valid_sorts:
        sort_by = "churn_probability"
    df = df.sort_values(sort_by, ascending=(order == "asc"))

    total_count = len(df)
    start = (page - 1) * page_size
    end   = start + page_size
    page_df = df.iloc[start:end]

    return {
        "total":       total_count,
        "page":        page,
        "page_size":   page_size,
        "total_pages": max(1, -(-total_count // page_size)),
        "data":        df_to_records(page_df),
    }


# ══════════════════════════════════════════════════════════
# GET /api/predictions/{acc_id}
# ══════════════════════════════════════════════════════════
@app.get("/api/predictions/{acc_id}")
def get_customer(acc_id: str):
    if _predictions.empty:
        raise HTTPException(404, "No prediction data")
    row = _predictions[_predictions["acc_id"] == acc_id]
    if row.empty:
        raise HTTPException(404, f"Account {acc_id} not found")

    # Enrich with payment summary
    record = row.iloc[0].to_dict()

    # Payment trend from original CSV
    if PAY_CSV.exists():
        pays = pd.read_csv(PAY_CSV, parse_dates=["payment_date"])
        cust_pays = pays[pays["acc_id"] == acc_id].sort_values("payment_date")
        record["payment_history"] = json.loads(
            cust_pays[["payment_date", "amount", "sms_volume", "product_name"]]
            .assign(payment_date=lambda d: d["payment_date"].astype(str))
            .to_json(orient="records")
        )
    else:
        record["payment_history"] = []

    record["risk"] = risk_label(record.get("churn_probability", 0))
    return record


# ══════════════════════════════════════════════════════════
# POST /api/predict  — live prediction via .pkl model
# ══════════════════════════════════════════════════════════
class PredictRequest(BaseModel):
    status: str              # "paid" | "trial"
    credit: str              # "SMS" | "Email"
    expire: str              # "YYYY-MM-DD"
    join_date: str           # "YYYY-MM-DD"
    last_access: str         # "YYYY-MM-DD"
    last_send: str           # "YYYY-MM-DD"
    # Payment-derived features (set 0 if unknown)
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
    if _model is None:
        raise HTTPException(503, "Model not loaded — run churn_model.py first")

    # Build feature vector
    exp  = pd.Timestamp(req.expire)
    join = pd.Timestamp(req.join_date)
    la   = pd.Timestamp(req.last_access)
    ls   = pd.Timestamp(req.last_send)

    status_enc = 1 if req.status.lower() == "trial" else 0
    credit_map = {"sms": 0, "email": 1}
    credit_enc = credit_map.get(req.credit.lower(), 0)
    dom_credit_map = {"email": 0, "none": 1, "sms": 2}
    dom_credit_enc = dom_credit_map.get(req.dominant_credit_type.lower(), 1)

    row = {
        "status_enc":            status_enc,
        "credit_enc":            credit_enc,
        "days_since_last_access":(REFERENCE_DATE - la).days,
        "days_since_last_send":  (REFERENCE_DATE - ls).days,
        "days_until_expire":     (exp - REFERENCE_DATE).days,
        "account_age_days":      (REFERENCE_DATE - join).days,
        "total_payments":        req.total_payments,
        "total_amount_paid":     req.total_amount_paid,
        "avg_amount_per_tx":     req.avg_amount_per_tx,
        "total_sms_volume":      req.total_sms_volume,
        "avg_sms_volume":        req.avg_sms_volume,
        "unique_products":       req.unique_products,
        "last_payment_recency":  req.last_payment_recency,
        "avg_payment_gap_days":  req.avg_payment_gap_days,
        "last_payment_amount":   req.last_payment_amount,
        "downgraded":            req.downgraded,
        "dom_credit_enc":        dom_credit_enc,
    }

    X = pd.DataFrame([row])[FEATURE_COLS]
    prob = float(_model.predict_proba(X)[0, 1])

    return {
        "churn_probability": round(prob, 4),
        "churn_predicted":   int(prob >= 0.5),
        "risk":              risk_label(prob),
        "features_used":     row,
    }


# ══════════════════════════════════════════════════════════
# GET /api/top-risk   — top N at-risk accounts
# ══════════════════════════════════════════════════════════
@app.get("/api/top-risk")
def top_risk(n: int = 10):
    if _predictions.empty:
        raise HTTPException(404, "No prediction data")
    top = _predictions.nlargest(n, "churn_probability")
    top = top.copy()
    top["risk"] = top["churn_probability"].apply(risk_label)
    return df_to_records(top)


# ══════════════════════════════════════════════════════════
# GET /api/model-info
# ══════════════════════════════════════════════════════════
@app.get("/api/model-info")
def model_info():
    feature_importance = {}
    if _model is not None:
        clf = _model.named_steps.get("classifier")
        if clf and hasattr(clf, "feature_importances_"):
            fi = clf.feature_importances_
            feature_importance = dict(zip(FEATURE_COLS, [round(float(v), 5) for v in fi]))
            feature_importance = dict(sorted(feature_importance.items(),
                                             key=lambda x: x[1], reverse=True))
    return {
        "model_type":    "sklearn Pipeline (SimpleImputer → StandardScaler → Random Forest)",
        "classifier":    "RandomForestClassifier",
        "n_estimators":  200,
        "max_depth":     6,
        "n_features":    len(FEATURE_COLS),
        "features":      FEATURE_COLS,
        "test_auc":      1.0,
        "cv_auc":        1.0,
        "feature_importance": feature_importance,
        "keras_available": _keras_model is not None,
        "keras_h5_path": str(MODEL_H5) if MODEL_H5.exists() else None,
    }


# ══════════════════════════════════════════════════════════
# POST /api/predict-keras  — live prediction via Keras H5
# ══════════════════════════════════════════════════════════
@app.post("/api/predict-keras")
def predict_keras(req: PredictRequest):
    """Score a customer using the Keras neural network (.h5 model)."""
    if _keras_model is None:
        raise HTTPException(503, "Keras H5 model not loaded — run churn_model.py first or install TensorFlow")
    if _model is None:
        raise HTTPException(503, "sklearn pipeline not loaded (needed for preprocessing)")

    exp  = pd.Timestamp(req.expire)
    join = pd.Timestamp(req.join_date)
    la   = pd.Timestamp(req.last_access)
    ls   = pd.Timestamp(req.last_send)

    status_enc     = 1 if req.status.lower() == "trial" else 0
    credit_map     = {"sms": 0, "email": 1}
    credit_enc     = credit_map.get(req.credit.lower(), 0)
    dom_credit_map = {"email": 0, "none": 1, "sms": 2}
    dom_credit_enc = dom_credit_map.get(req.dominant_credit_type.lower(), 1)

    row = {
        "status_enc":             status_enc,
        "credit_enc":             credit_enc,
        "days_since_last_access": (REFERENCE_DATE - la).days,
        "days_since_last_send":   (REFERENCE_DATE - ls).days,
        "days_until_expire":      (exp - REFERENCE_DATE).days,
        "account_age_days":       (REFERENCE_DATE - join).days,
        "total_payments":         req.total_payments,
        "total_amount_paid":      req.total_amount_paid,
        "avg_amount_per_tx":      req.avg_amount_per_tx,
        "total_sms_volume":       req.total_sms_volume,
        "avg_sms_volume":         req.avg_sms_volume,
        "unique_products":        req.unique_products,
        "last_payment_recency":   req.last_payment_recency,
        "avg_payment_gap_days":   req.avg_payment_gap_days,
        "last_payment_amount":    req.last_payment_amount,
        "downgraded":             req.downgraded,
        "dom_credit_enc":         dom_credit_enc,
    }

    X_raw = pd.DataFrame([row])[FEATURE_COLS]

    # Reuse sklearn pipeline's imputer + scaler for preprocessing
    imputer = _model.named_steps["imputer"]
    scaler  = _model.named_steps["scaler"]
    X_scaled = scaler.transform(imputer.transform(X_raw))

    prob = float(_keras_model.predict(X_scaled, verbose=0).flatten()[0])

    return {
        "churn_probability": round(prob, 4),
        "churn_predicted":   int(prob >= 0.5),
        "risk":              risk_label(prob),
        "model":             "Keras Neural Network (H5)",
        "features_used":     row,
    }
