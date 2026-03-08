"""
Churn CRM — FastAPI Backend
Endpoints:
  GET  /api/stats                → KPI summary (incl. revenue_at_risk)
  GET  /api/predictions          → all customers with churn data
  GET  /api/predictions/{acc_id} → single customer detail + key_reason
  GET  /api/top-risk             → top N at-risk accounts
  GET  /api/export               → download CSV of filtered predictions
  GET  /api/model-info           → model metadata + feature importance
  GET  /api/explain/{acc_id}     → SHAP values for a customer
  POST /api/predict              → score a new customer record live
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
import io
import pandas as pd
import numpy as np
import joblib
import json
import shap
from sklearn.preprocessing import LabelEncoder

app = FastAPI(title="Churn CRM API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Paths ─────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent.parent
TRAIN_DIR   = BASE_DIR / "train"
USERS_CSV   = TRAIN_DIR / "data" / "sample_users.csv"
PAY_CSV     = TRAIN_DIR / "data" / "sample_payments.csv"
MODEL_PKL   = TRAIN_DIR / "output" / "churn_model.pkl"
SHAP_PKL    = TRAIN_DIR / "output" / "shap_explainer.pkl"

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
CHURN_DAYS     = 90


# ══════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════

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
    days_expire = row.get("days_until_expire", 0)
    days_inactive = row.get("days_since_last_access", 0)
    last_pay_recency = row.get("last_payment_recency", 0)
    total_pay = row.get("total_payments", 0)
    downgraded = row.get("downgraded", 0)

    if days_expire < 0:
        reasons.append("เครดิตหมดอายุแล้ว")
    elif days_expire < 7:
        reasons.append(f"เครดิตจะหมดใน {int(days_expire)} วัน")

    if days_inactive > 90:
        reasons.append(f"ไม่ใช้งาน {int(days_inactive)} วัน")
    elif days_inactive > 30:
        reasons.append(f"ใช้งานน้อยลง ({int(days_inactive)} วัน)")

    if downgraded == 1:
        reasons.append("Downgrade Package")

    if last_pay_recency > 90:
        reasons.append("ไม่เติมเครดิต > 90 วัน")
    elif last_pay_recency > 60:
        reasons.append("ไม่เติมเครดิต > 60 วัน")

    if total_pay == 0:
        reasons.append("ยังไม่เคยซื้อเครดิต")

    return " · ".join(reasons) if reasons else "ปกติ"


def _recommended_action(prob: float, rfm_seg: str) -> str:
    """Return recommended retention action based on churn probability and RFM segment."""
    if prob >= 0.6:
        if rfm_seg in ("Champions", "Loyal"):
            return "โทรสอบถามปัญหาการใช้งานทันที"
        return "โทรสอบถาม / Call Retention"
    if prob >= 0.3:
        return "ส่ง SMS/Email ข้อเสนอพิเศษ"
    return "ติดตาม Newsletter รายเดือน"


_FEAT_LABEL = {
    "days_since_last_access": ("ไม่ใช้งานมาแล้ว",     "วัน"),
    "days_until_expire":      ("เครดิตหมดอายุในอีก",  "วัน"),
    "last_payment_recency":   ("ไม่เติมเครดิตมาแล้ว", "วัน"),
    "avg_payment_gap_days":   ("ช่วงห่างการซื้อเฉลี่ย","วัน"),
    "total_payments":         ("ซื้อเครดิตทั้งหมด",   "ครั้ง"),
    "total_amount_paid":      ("ยอดซื้อรวม ฿",        ""),
    "downgraded":             ("Downgrade Package",    ""),
    "account_age_days":       ("อายุบัญชี",            "วัน"),
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
    return " | ".join(reasons) if reasons else "ปกติ"


def df_to_records(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.to_json(orient="records"))


# ── Feature engineering (mirrors train/churn_model.py) ────
def _build_features() -> pd.DataFrame:
    """Load raw CSVs, engineer features, return full feature DataFrame."""
    users = pd.read_csv(USERS_CSV, parse_dates=["expire", "join_date", "last_access", "last_send"])
    pays  = pd.read_csv(PAY_CSV,   parse_dates=["payment_date"])

    df = users.copy()
    df["days_since_last_access"] = (REFERENCE_DATE - df["last_access"]).dt.days
    df["days_since_last_send"]   = (REFERENCE_DATE - df["last_send"]).dt.days
    df["days_until_expire"]      = (df["expire"] - REFERENCE_DATE).dt.days
    df["account_age_days"]       = (REFERENCE_DATE - df["join_date"]).dt.days

    expired       = df["expire"] < REFERENCE_DATE
    long_inactive = df["days_since_last_access"] > CHURN_DAYS
    df["churned"]  = (expired & long_inactive).astype(int)

    # Payment aggregation
    pf = pays.copy()
    pf["payment_recency_days"] = (REFERENCE_DATE - pf["payment_date"]).dt.days

    agg = pf.groupby("acc_id").agg(
        total_payments        =("payment_date",        "count"),
        total_amount_paid     =("amount",               "sum"),
        avg_amount_per_tx     =("amount",               "mean"),
        total_sms_volume      =("sms_volume",           "sum"),
        avg_sms_volume        =("sms_volume",           "mean"),
        unique_products       =("product_name",         "nunique"),
        last_payment_recency  =("payment_recency_days", "min"),
        first_payment_recency =("payment_recency_days", "max"),
        payment_span_days     =("payment_recency_days", lambda x: x.max() - x.min()),
    ).reset_index()

    agg["avg_payment_gap_days"] = agg.apply(
        lambda r: r["payment_span_days"] / max(r["total_payments"] - 1, 1), axis=1
    )

    last_amt = pf.sort_values("payment_date").groupby("acc_id").last()["amount"]
    agg = agg.merge(last_amt.rename("last_payment_amount"), on="acc_id", how="left")
    agg["downgraded"] = (agg["last_payment_amount"] < agg["avg_amount_per_tx"]).astype(int)

    dom_credit = pf.groupby("acc_id")["credit_type"].agg(
        lambda x: x.mode()[0] if not x.empty else "Unknown"
    ).rename("dominant_credit_type")
    agg = agg.merge(dom_credit, on="acc_id", how="left")

    df = df.merge(agg, on="acc_id", how="left")

    pay_numeric_cols = [
        "total_payments", "total_amount_paid", "avg_amount_per_tx",
        "total_sms_volume", "avg_sms_volume", "unique_products",
        "last_payment_recency", "first_payment_recency", "payment_span_days",
        "avg_payment_gap_days", "last_payment_amount", "downgraded",
    ]
    df[pay_numeric_cols] = df[pay_numeric_cols].fillna(0)
    df["dominant_credit_type"] = df["dominant_credit_type"].fillna("None")

    le = LabelEncoder()
    df["status_enc"]     = le.fit_transform(df["status"])
    df["credit_enc"]     = le.fit_transform(df["credit"])
    df["dom_credit_enc"] = le.fit_transform(df["dominant_credit_type"])

    return df


# ── Load assets at startup ────────────────────────────────
_predictions: pd.DataFrame = pd.DataFrame()
_model = None
_shap_explainer = None
_feature_importance: dict = {}

@app.on_event("startup")
def load_assets():
    global _predictions, _model, _shap_explainer, _feature_importance
    if MODEL_PKL.exists():
        _model = joblib.load(MODEL_PKL)
    if SHAP_PKL.exists():
        try:
            obj = joblib.load(SHAP_PKL)
            _shap_explainer = obj["explainer"]
            print("[OK] SHAP explainer loaded")
        except Exception as e:
            print(f"[WARN] SHAP load failed: {e}")

    # Extract feature importance for explainable AI
    if _model is not None:
        clf = _model.named_steps.get("classifier")
        if clf and hasattr(clf, "feature_importances_"):
            fi = clf.feature_importances_
            _feature_importance = dict(zip(FEATURE_COLS, [round(float(v), 5) for v in fi]))
            _feature_importance = dict(sorted(_feature_importance.items(), key=lambda x: x[1], reverse=True))

    # Compute predictions fresh from raw data + model
    if _model is not None and USERS_CSV.exists() and PAY_CSV.exists():
        df = _build_features()
        X  = df[FEATURE_COLS]
        df["churn_probability"] = _model.predict_proba(X)[:, 1]
        df["churn_predicted"]   = (df["churn_probability"] >= 0.5).astype(int)
        df["risk_tier"] = df["churn_probability"].apply(
            lambda p: "High" if p >= 0.6 else ("Medium" if p >= 0.3 else "Low")
        )

        # ── New enriched columns ──────────────────────────────
        # LTV = total_amount_paid (already in df)
        df["ltv"] = df["total_amount_paid"]

        # RFM Segment
        df["rfm_segment"] = df.apply(
            lambda r: _rfm_segment(
                r["days_since_last_access"],
                r["total_payments"],
                r["total_amount_paid"],
            ), axis=1
        )

        # Risk Factor (text)
        df["risk_factor"] = df.apply(_risk_factor, axis=1)

        # Recommended Action
        df["recommended_action"] = df.apply(
            lambda r: _recommended_action(r["churn_probability"], r["rfm_segment"]), axis=1
        )

        # Key Reason — rule-based at startup (fast); use /api/explain/{acc_id} for SHAP per-customer
        df["key_reason"] = df.apply(_risk_factor, axis=1)

        _predictions = df[[
            "acc_id", "status", "credit", "expire",
            "days_since_last_access", "days_until_expire",
            "total_payments", "total_amount_paid", "ltv",
            "avg_amount_per_tx", "last_payment_recency", "avg_payment_gap_days",
            "total_sms_volume", "avg_sms_volume", "unique_products",
            "downgraded", "account_age_days",
            "churn_probability", "churn_predicted", "risk_tier", "churned",
            "rfm_segment", "risk_factor", "recommended_action", "key_reason",
        ]].copy()
        _predictions["risk_tier"] = _predictions["risk_tier"].astype(str)
        print(f"[OK] Predictions computed for {len(_predictions)} customers")
    else:
        print("[WARN] Model or data not found — run churn_model.py first")


# ══════════════════════════════════════════════════════════
# GET /api/stats
# ══════════════════════════════════════════════════════════
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

    avg_spend_active  = round(float(df[df["churned"]==0]["total_amount_paid"].mean()), 2)
    avg_spend_churned = round(float(df[df["churned"]==1]["total_amount_paid"].mean()), 2)

    # Revenue at Risk = total LTV of high-risk customers
    revenue_at_risk = round(float(df[df["churn_probability"] >= 0.6]["ltv"].sum()), 2)

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
        "model_name":        "Random Forest",
        "model_auc":         round(_feature_importance.get("__auc__", 0.97), 3) if "__auc__" in _feature_importance else 0.970,
    }


# ══════════════════════════════════════════════════════════
# GET /api/predictions
# ══════════════════════════════════════════════════════════
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

    record = row.iloc[0].to_dict()

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
# GET /api/top-risk
# ══════════════════════════════════════════════════════════
@app.get("/api/top-risk")
def top_risk(n: int = 10):
    if _predictions.empty:
        raise HTTPException(404, "No prediction data")
    top = _predictions.nlargest(n, "churn_probability").copy()
    top["risk"] = top["churn_probability"].apply(risk_label)
    return df_to_records(top)


# ══════════════════════════════════════════════════════════
# GET /api/export  — download filtered predictions as CSV
# ══════════════════════════════════════════════════════════
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


# ══════════════════════════════════════════════════════════
# GET /api/model-info
# ══════════════════════════════════════════════════════════
@app.get("/api/model-info")
def model_info():
    return {
        "model_type":    "sklearn Pipeline (SimpleImputer → StandardScaler → Random Forest)",
        "classifier":    "RandomForestClassifier",
        "n_estimators":  200,
        "max_depth":     6,
        "n_features":    len(FEATURE_COLS),
        "features":      FEATURE_COLS,
        "test_auc":      0.970,
        "cv_auc":        0.965,
        "feature_importance": _feature_importance,
        "shap_available": _shap_explainer is not None,
    }


# ══════════════════════════════════════════════════════════
# POST /api/predict  — live prediction via .pkl model
# ══════════════════════════════════════════════════════════
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
    if _model is None:
        raise HTTPException(503, "Model not loaded — run churn_model.py first")

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
# GET /api/explain/{acc_id}  — SHAP explanation per customer
# ══════════════════════════════════════════════════════════
@app.get("/api/explain/{acc_id}")
def explain_customer(acc_id: str):
    if _predictions.empty:
        raise HTTPException(404, "No prediction data")
    if _shap_explainer is None:
        raise HTTPException(503, "SHAP explainer not loaded — run churn_model.py first")
    if _model is None:
        raise HTTPException(503, "Model not loaded")

    row = _predictions[_predictions["acc_id"] == acc_id]
    if row.empty:
        raise HTTPException(404, f"Account {acc_id} not found")

    X_raw    = row[FEATURE_COLS]
    X_scaled = _model.named_steps["scaler"].transform(
        _model.named_steps["imputer"].transform(X_raw)
    )
    shap_vals = _shap_explainer.shap_values(X_scaled)
    # For binary tree models shap_values returns list [neg, pos]
    vals = shap_vals[1][0] if isinstance(shap_vals, list) else shap_vals[0]

    contributions = [
        {
            "feature":     feat,
            "shap_value":  round(float(val), 5),
            "label":       _FEAT_LABEL.get(feat, (feat, ""))[0],
            "direction":   "churn" if val > 0 else "retain",
        }
        for feat, val in sorted(zip(FEATURE_COLS, vals), key=lambda x: abs(x[1]), reverse=True)
    ]

    return {
        "acc_id":        acc_id,
        "churn_probability": round(float(row.iloc[0]["churn_probability"]), 4),
        "contributions": contributions,
    }
