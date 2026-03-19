"""
Tests: Model outputs
ตรวจ output schema, metric ranges, coverage targets
"""

import pytest
import json
import pandas as pd
import numpy as np
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import CUTOFF, MODELS_DIR, MODEL_FILES

METRICS_PATH = MODELS_DIR / MODEL_FILES["metrics"]
C360_PATH    = MODELS_DIR / MODEL_FILES["customer_360"]


@pytest.fixture(scope="module")
def metrics():
    if not METRICS_PATH.exists():
        pytest.skip("metrics.json not found — run train.py first")
    with open(METRICS_PATH) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def customer_360():
    if not C360_PATH.exists():
        pytest.skip("customer_360.csv not found — run train.py first")
    return pd.read_csv(C360_PATH)


# ─── Churn model tests ────────────────────────────────────────────

def test_churn_auc_acceptable(metrics):
    auc = metrics["churn_model"]["auc"]
    assert auc >= 0.85, f"Churn AUC {auc} < 0.85 (minimum acceptable)"
    assert auc <= 0.999, f"Churn AUC {auc} suspiciously high — check for leakage"


def test_churn_no_significant_leakage(metrics):
    drop = metrics["churn_model"].get("auc_drop_leakage_test", 0)
    assert drop <= 0.05, f"Leakage test: AUC drop={drop} > 0.05 — review features"


def test_churn_precision_recall_balanced(metrics):
    prec = metrics["churn_model"]["precision"]
    rec  = metrics["churn_model"]["recall"]
    assert prec >= 0.70, f"Precision {prec} too low"
    assert rec  >= 0.65, f"Recall {rec} too low"


# ─── CLV model tests ──────────────────────────────────────────────

def test_clv_spearman_acceptable(metrics):
    spear = metrics["clv_model"]["spearman"]
    assert spear >= 0.60, f"Spearman {spear} < 0.60"


def test_clv_coverage_95(metrics):
    cov = metrics["clv_model"]["coverage_95"]
    assert 0.88 <= cov <= 1.00, f"95% PI coverage {cov:.1%} out of range [88%, 100%]"


def test_clv_coverage_80(metrics):
    cov = metrics["clv_model"]["coverage_80"]
    assert 0.70 <= cov <= 0.90, f"80% PI coverage {cov:.1%} out of range [70%, 90%]"


# ─── Credit model tests ───────────────────────────────────────────

def test_credit_coverage_80_target(metrics):
    cov = metrics["credit_model"]["coverage_p10_p90_after"]
    assert cov >= 0.78, f"P10-P90 coverage {cov:.1%} < 78%"


def test_credit_coverage_50_target(metrics):
    cov = metrics["credit_model"]["coverage_p25_p75_after"]
    assert cov >= 0.47, f"P25-P75 coverage {cov:.1%} < 47%"


def test_credit_p50_beats_baseline(metrics):
    lgb_mae = metrics["credit_model"]["p50_mae"]
    xgb_mae = metrics["credit_model"]["xgb_baseline_mae"]
    assert lgb_mae <= xgb_mae * 1.05, \
        f"LightGBM Q50 MAE={lgb_mae} worse than XGBoost baseline={xgb_mae}"


# ─── Customer 360 output tests ────────────────────────────────────

def test_customer_360_columns(customer_360):
    required = ["acc_id", "churn_probability", "churn_tier",
                "predicted_clv_6m", "p_alive", "rfm_segment",
                "priority_score", "revenue_at_risk", "is_active"]
    for col in required:
        assert col in customer_360.columns, f"Missing column: {col}"


def test_churn_probability_range(customer_360):
    probs = customer_360["churn_probability"].dropna()
    assert ((probs >= 0) & (probs <= 1)).all(), "churn_probability out of [0, 1]"


def test_priority_score_range(customer_360):
    active = customer_360[customer_360["is_active"] == 1]
    scores = active["priority_score"].dropna()
    assert ((scores >= 0) & (scores <= 10)).all(), "priority_score out of [0, 10]"


def test_already_churned_prob_is_one(customer_360):
    churned = customer_360[customer_360["churn_tier"] == "Already Churned"]
    assert (churned["churn_probability"] == 1.0).all()


def test_rfm_segments_valid(customer_360):
    valid = {"Champions", "Loyal", "Promising", "Cannot Lose", "At Risk", "Need Attention"}
    actual = set(customer_360["rfm_segment"].dropna().unique())
    invalid = actual - valid - {"nan", "0"}
    assert len(invalid) == 0, f"Invalid RFM segments: {invalid}"
