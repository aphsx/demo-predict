"""
1Moby Analytics — RFM Segmentation
Quintile scoring (1–5 per R/F/M) → 6 segments
"""

import pandas as pd
import numpy as np


def rfm_quintile_score(rfm_df: pd.DataFrame) -> pd.DataFrame:
    """
    รับ DataFrame ที่มี columns: acc_id, recency, frequency, monetary_value
    คืน DataFrame เดิม + r_score, f_score, m_score, rfm_total, rfm_segment

    Scoring:
        R score: recency ต่ำ = ดี → quintile 5=ดีสุด, 1=แย่สุด
        F score: frequency สูง = ดี → quintile 5=ดีสุด
        M score: monetary สูง = ดี → quintile 5=ดีสุด
    """
    out = rfm_df.copy()

    # R score — invert labels (เล็ก = ดี)
    try:
        out["r_score"] = pd.qcut(out["recency"], 5,
                                  labels=[5, 4, 3, 2, 1],
                                  duplicates="drop")
    except Exception:
        out["r_score"] = 3

    # F score — use rank to handle many ties
    try:
        out["f_score"] = pd.qcut(out["frequency"].rank(method="first"), 5,
                                  labels=[1, 2, 3, 4, 5],
                                  duplicates="drop")
    except Exception:
        out["f_score"] = 3

    # M score
    try:
        out["m_score"] = pd.qcut(out["monetary_value"].rank(method="first"), 5,
                                  labels=[1, 2, 3, 4, 5],
                                  duplicates="drop")
    except Exception:
        out["m_score"] = 3

    out["rfm_total"] = (
        out["r_score"].astype(float) +
        out["f_score"].astype(float) +
        out["m_score"].astype(float)
    )

    out["rfm_segment"] = out.apply(_assign_segment, axis=1)
    return out


def _assign_segment(row: pd.Series) -> str:
    r   = float(row["r_score"])
    tot = float(row["rfm_total"])

    if tot >= 13:
        return "Champions"
    elif tot >= 10 and r >= 3:
        return "Loyal"
    elif r >= 4 and tot < 10:
        return "Promising"
    elif r <= 2 and tot >= 8:
        return "Cannot Lose"
    elif r <= 2:
        return "At Risk"
    else:
        return "Need Attention"


SEGMENT_ACTIONS = {
    "Champions":     "Reward & upsell — เสนอ premium package",
    "Loyal":         "Cross-sell — เสนอ Email ถ้าใช้แค่ SMS",
    "Promising":     "Onboarding — ช่วยให้ใช้งานได้เต็มที่",
    "Cannot Lose":   "Win-back ด่วน — โทรหา offer พิเศษ",
    "At Risk":       "Re-engage — ส่ง reminder + discount",
    "Need Attention":"Monitor — schedule follow-up รายเดือน",
}


def get_segment_action(segment: str) -> str:
    return SEGMENT_ACTIONS.get(segment, "Monitor")
