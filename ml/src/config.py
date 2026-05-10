"""
1Moby Analytics — Central Configuration
ค่าคงที่ทั้งระบบอยู่ที่นี่ที่เดียว ทุก module import จากที่นี่
"""

from pathlib import Path
import pandas as pd

# ─── Paths ───────────────────────────────────────────────────────
ROOT_DIR   = Path(__file__).parent.parent
MODELS_DIR = ROOT_DIR / "models"
DATA_DIR   = ROOT_DIR / "data"
MODELS_DIR.mkdir(exist_ok=True)

# ─── Point-in-Time Cutoff ────────────────────────────────────────
CUTOFF = pd.Timestamp("2025-07-01")

# ─── Active Definition ───────────────────────────────────────────
ACTIVE_WINDOW_MONTHS  = 6   # ดู activity ย้อนหลังกี่เดือน
CHURN_LABEL_MONTHS    = 6   # ดู label หลัง cutoff กี่เดือน

# ─── Churn Model ─────────────────────────────────────────────────
CHURN_TRAIN_SIZE  = 0.60
CHURN_VAL_SIZE    = 0.20
CHURN_TEST_SIZE   = 0.20
CHURN_OPTUNA_TRIALS = 30
CHURN_RANDOM_STATE  = 42

CHURN_THRESHOLDS = {
    "Low":    (0.00, 0.30),
    "Medium": (0.30, 0.60),
    "High":   (0.60, 1.01),
}

# features ที่ถูก flag ว่าอาจ leak (ใช้ audit เท่านั้น ไม่ drop จริง)
LEAK_SUSPECT_FEATURES = [
    "days_since_last_send",
    "usage_recent_3m",
    "usage_prev_3m",
    "usage_decay_ratio",
    "usage_slope",
]

# ─── CLV Model ───────────────────────────────────────────────────
CLV_HORIZON_DAYS   = 180   # 6 เดือน
CLV_PENALIZER      = 0.01
CLV_PI_DECILES     = 10    # แบ่งกี่ decile สำหรับ residual PI

# ─── Credit Model ────────────────────────────────────────────────
CREDIT_QUANTILES       = [0.10, 0.25, 0.50, 0.75, 0.90]
CREDIT_OPTUNA_TRIALS   = 15
CREDIT_OUTLIER_PCTILE  = 99    # ตัด outlier > percentile นี้ออก
CREDIT_RANDOM_STATE    = 42

# conformal multipliers (จากการ calibrate จริง)
CONFORMAL_MULT_80 = 1.06
CONFORMAL_MULT_50 = 1.15

# alert urgency (ใช้ P10 เป็น trigger)
CREDIT_URGENCY_DAYS = {
    "Critical": 14,
    "Warning":  30,
    "Monitor":  90,
}

# ─── RFM Segmentation ────────────────────────────────────────────
RFM_SEGMENT_RULES = {
    # (rfm_total_min, r_score_min) → segment name
    "Champions":     {"total_min": 13, "r_min": 0},
    "Loyal":         {"total_min": 10, "r_min": 3},
    "Promising":     {"total_min": 0,  "r_min": 4, "total_max": 10},
    "Cannot Lose":   {"total_min": 8,  "r_max": 2},
    "At Risk":       {"total_min": 0,  "r_max": 2},
    "Need Attention": {},   # fallback
}

# ─── Priority Score Weights ───────────────────────────────────────
PRIORITY_WEIGHTS = {
    "churn_probability": 0.35,
    "predicted_clv_6m":  0.35,
    "urgency_score":     0.15,
    "recency_score":     0.15,
}

URGENCY_SCORE_MAP = {
    "Critical": 1.00,
    "Warning":  0.75,
    "Monitor":  0.50,
    "Stable":   0.25,
    None:       0.00,
}

# ─── Lifecycle Stages ─────────────────────────────────────────────
LIFECYCLE_STAGES = {
    "Ghost":          "สมัครแล้วไม่เคยใช้",
    "Churned":        "เคยใช้แต่หยุดไปแล้ว",
    "Active Free":    "ใช้งานอยู่แต่ไม่เคยจ่าย",
    "Active Paid":    "จ่ายเงินและใช้งานอยู่",
}

# Ghost account sub-stages thresholds
GHOST_NEW_DAYS = 30          # สมัครใหม่ ≤ 30 วัน
GHOST_WARM_DAYS = 180        # 30–180 วัน = ยังพอ activate ได้

# Active Free usage quantile threshold for sub-stage categorization
FREE_USAGE_QUANTILE = 0.75   # ใช้งานสูงกว่า quantile นี้ = High Usage Free

# ─── Win-back Model ───────────────────────────────────────────────
WINBACK_OPTUNA_TRIALS = 20
WINBACK_RANDOM_STATE  = 42

# ─── Conversion Model ────────────────────────────────────────────
CONVERSION_OPTUNA_TRIALS = 20
CONVERSION_RANDOM_STATE  = 42

# ─── Monitoring Thresholds ────────────────────────────────────────
PSI_ALERT_THRESHOLD          = 0.25
KS_PVALUE_THRESHOLD          = 0.05
CHURN_AUC_DROP_THRESHOLD     = 0.05
CLV_MAE_INCREASE_THRESHOLD   = 0.20
CREDIT_COVERAGE_DRIFT        = 0.05

# ─── Model file names ─────────────────────────────────────────────
MODEL_FILES = {
    "churn_model":   "churn_model.pkl",
    "churn_scaler":  "churn_scaler.pkl",
    "ltv_bgnbd":     "ltv_bgnbd.pkl",
    "ltv_gg":        "ltv_gg.pkl",
    "credit_q10":    "credit_q10.pkl",
    "credit_q25":    "credit_q25.pkl",
    "credit_q50":    "credit_q50.pkl",
    "credit_q75":    "credit_q75.pkl",
    "credit_q90":    "credit_q90.pkl",
    "metrics":       "metrics.json",
    "monitoring":    "monitoring_baseline.json",
    "rfm_segments":  "rfm_segments.csv",
    "customer_360":  "customer_360.csv",
    "churn_eval":    "churn_eval.png",
    "winback_model": "winback_model.pkl",
    "conversion_model": "conversion_model.pkl",
}
