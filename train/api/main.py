"""
1Moby Analytics — FastAPI Server
7 endpoints, model loaded once at startup via lifespan

Run:
    uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
"""

from contextlib import asynccontextmanager
from pathlib import Path
import json
import pandas as pd

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import CUTOFF, MODELS_DIR, MODEL_FILES
from src.data_loader import load_data, define_active
from src.features import build_features
from src.predictor import MobyPredictor


# ─── App state ────────────────────────────────────────────────────
_predictor: MobyPredictor | None = None
_metrics: dict = {}

DATA_PATH = Path("data/1Moby_Data.xlsx")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """โหลด models ครั้งเดียวตอน startup"""
    global _predictor, _metrics

    print("[API] Loading data and models...")
    users, payments, usage = load_data(DATA_PATH)
    feat_df = build_features(users, payments, usage, CUTOFF)

    _predictor = MobyPredictor(MODELS_DIR, CUTOFF)
    _predictor.load_data(feat_df, payments, usage)
    _predictor.run_all_predictions()

    metrics_path = MODELS_DIR / MODEL_FILES["metrics"]
    if metrics_path.exists():
        with open(metrics_path) as f:
            _metrics = json.load(f)

    print("[API] Ready.")
    yield
    print("[API] Shutdown.")


app = FastAPI(
    title="1Moby Customer Analytics API",
    version="3.0",
    lifespan=lifespan,
)


# ─── Request / Response schemas ───────────────────────────────────

class PredictRequest(BaseModel):
    acc_id: int

class WhatIfRequest(BaseModel):
    acc_id:    int
    feature:   str
    new_value: float


# ─── Endpoints ────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Model version, training date, drift status"""
    return {
        "status":        "ok",
        "model_version": "v3",
        "cutoff":        str(CUTOFF.date()),
        "trained_at":    _metrics.get("generated_at", "unknown"),
        "population":    _metrics.get("population", {}),
        "model_metrics": {
            "churn_auc":         _metrics.get("churn_model", {}).get("auc"),
            "clv_spearman":      _metrics.get("clv_model", {}).get("spearman"),
            "credit_p50_mae":    _metrics.get("credit_model", {}).get("p50_mae"),
        },
    }


@app.post("/predict/churn")
def predict_churn(req: PredictRequest):
    """
    คืน churn_probability + tier + top risk factors (SHAP)
    """
    _check_ready()
    batch = _predictor.predict_batch([req.acc_id])
    if len(batch) == 0:
        raise HTTPException(404, f"acc_id {req.acc_id} not found")

    row     = batch.iloc[0]
    explain = _predictor.explain(req.acc_id)
    return {
        "acc_id":            req.acc_id,
        "churn_probability": _f(row.get("churn_probability")),
        "churn_tier":        str(row.get("churn_tier", "Unknown")),
        "top_risk_factors":  explain.get("top_risk_factors", []),
    }


@app.post("/predict/clv")
def predict_clv(req: PredictRequest):
    """
    คืน predicted_clv_6m + 95%/80% CI + p_alive + rfm_segment
    """
    _check_ready()
    batch = _predictor.predict_batch([req.acc_id])
    if len(batch) == 0:
        raise HTTPException(404, f"acc_id {req.acc_id} not found")

    row = batch.iloc[0]
    return {
        "acc_id":           req.acc_id,
        "predicted_clv_6m": _f(row.get("predicted_clv_6m")),
        "ci_95":            [_f(row.get("ci_95_lo")), _f(row.get("ci_95_hi"))],
        "ci_80":            [_f(row.get("ci_80_lo")), _f(row.get("ci_80_hi"))],
        "p_alive":          _f(row.get("p_alive")),
        "rfm_segment":      str(row.get("rfm_segment", "Unknown")),
    }


@app.post("/predict/credit")
def predict_credit(req: PredictRequest):
    """
    คืน P10–P90 + urgency + alert_date
    """
    _check_ready()
    batch = _predictor.predict_batch([req.acc_id])
    if len(batch) == 0:
        raise HTTPException(404, f"acc_id {req.acc_id} not found")

    row = batch.iloc[0]
    if pd.isna(row.get("p50")):
        return {"acc_id": req.acc_id, "message": "No purchase history — credit forecast unavailable"}

    return {
        "acc_id":     req.acc_id,
        "p10":        _f(row.get("p10")),
        "p25":        _f(row.get("p25")),
        "p50":        _f(row.get("p50")),
        "p75":        _f(row.get("p75")),
        "p90":        _f(row.get("p90")),
        "band_80CI":  f"{_f(row.get('p10'))}–{_f(row.get('p90'))} วัน",
        "band_50CI":  f"{_f(row.get('p25'))}–{_f(row.get('p75'))} วัน",
        "urgency":    str(row.get("urgency", "Stable")),
        "alert_date": str(row.get("alert_date", "")),
    }


@app.post("/predict/all")
def predict_all(req: PredictRequest):
    """
    Customer 360 — ทุกอย่างในครั้งเดียว พร้อม priority_score + action
    """
    _check_ready()
    result = _predictor.predict_all(req.acc_id)
    if "error" in result:
        raise HTTPException(404, result["error"])

    churn_prob = result.get("churn_probability", 0) or 0
    clv        = result.get("predicted_clv_6m", 0) or 0
    result["revenue_at_risk"] = round(float(churn_prob) * float(clv), 2)
    result["action"]          = _suggest_action(result)
    return result


@app.post("/explain/{acc_id}")
def explain(acc_id: int):
    """
    SHAP explanation — ทำไมลูกค้าคนนี้ถึงเสี่ยง churn?
    """
    _check_ready()
    return _predictor.explain(acc_id)


@app.post("/what-if/{acc_id}")
def what_if(acc_id: int, req: WhatIfRequest):
    """
    ถ้าเปลี่ยน feature X → จะส่งผลต่อ churn prob อย่างไร?
    """
    _check_ready()
    return _predictor.what_if(acc_id, req.feature, req.new_value)


@app.get("/segments/summary")
def segments_summary():
    """
    สรุป RFM segments ทั้งหมด
    """
    _check_ready()
    batch = _predictor.predict_batch()
    active = batch[batch.get("is_active", 1) == 1] if "is_active" in batch.columns else batch

    return {
        "total_active":    int(len(active)),
        "already_churned": int(len(batch) - len(active)),
        "churn_tiers":     active["churn_tier"].value_counts().to_dict() if "churn_tier" in active else {},
        "rfm_segments":    active["rfm_segment"].value_counts().to_dict() if "rfm_segment" in active else {},
        "urgency":         active["urgency"].value_counts().to_dict() if "urgency" in active else {},
        "revenue_at_risk": round(float(batch["revenue_at_risk"].sum()), 2) if "revenue_at_risk" in batch else 0,
        "avg_clv_6m":      round(float(active["predicted_clv_6m"].mean()), 2) if "predicted_clv_6m" in active else 0,
    }


# ─── Helpers ──────────────────────────────────────────────────────

def _check_ready():
    if _predictor is None:
        raise HTTPException(503, "Models not loaded yet")


def _f(val) -> float | None:
    if val is None:
        return None
    try:
        return round(float(val), 4)
    except (TypeError, ValueError):
        return None


def _suggest_action(result: dict) -> str:
    tier    = result.get("churn_tier", "")
    urgency = result.get("urgency", "Stable")
    segment = result.get("rfm_segment", "")

    if tier == "High" and urgency == "Critical":
        return "รีบโทรทันที — เสี่ยง churn + ใกล้หมดเครดิต"
    elif tier == "High":
        return "โทรสอบถาม + เสนอ special offer"
    elif urgency == "Critical":
        return "ส่ง reminder ซื้อเครดิต — ใกล้ถึงรอบซื้อ"
    elif segment in ("Champions", "Loyal"):
        return "Cross-sell หรือ upsell — ลูกค้า VIP"
    elif tier == "Medium":
        return "Schedule follow-up ภายใน 2 สัปดาห์"
    return "Monitor — ไม่มี action เร่งด่วน"
