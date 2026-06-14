"""Priority scoring v2 — expected-value (value-at-risk) ranking.

WHY THIS EXISTS
---------------
The current production score (apps/ml/src/prediction/runner.py) is:

    priority_score = 50 * churn_prob          # raw probability 0..1
                   + 30 * clv_value_rank      # percentile rank 0..1
                   + 20 * credit_proxy        # 1 - days/90, clipped 0..1

Three problems:
  1. The 50/30/20 weights are guessed, never validated against outcomes.
  2. It mixes incompatible units — a raw probability with a percentile rank —
     so a 10x more valuable customer barely moves the value term.
  3. It blends two different *actions* (retain vs. upsell) into one number, so
     the reader cannot tell what to DO with a high-ranked customer.

v2 PRINCIPLE
------------
Rank by money, not by guessed weights:

    value_at_risk (THB) = churn_probability * predicted_clv_6m

That is the expected revenue you lose if you do nothing — a principled,
unit-correct priority with no arbitrary coefficients.

Credit runway becomes a SEPARATE timing flag (it drives an upsell action, not
a retention action), and every customer also gets a value x risk SEGMENT so the
reader knows which play to run.

This module is dependency-light (numpy + pandas) and self-contained so it can be
backtested in isolation before being wired into the real pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

# ── Tunables (documented, not magic) ─────────────────────────────────

# Thresholds that split the value x risk matrix. These ARE business choices,
# but unlike 50/30/20 they map to a concrete, explainable decision boundary and
# can be calibrated from the realized churn rate of past runs.
RISK_HIGH = 0.50            # churn_probability above this = "high risk"
VALUE_HIGH_PERCENTILE = 0.70  # CLV at/above this percentile = "high value"

# Credit urgency is timing, not value. Days-until-topup buckets.
URGENCY_BUCKETS = {"critical": 14, "warning": 30, "monitor": 90}

Segment = Literal[
    "retain_now",      # high value + high risk  -> retention outreach, top priority
    "protect",         # high value + low risk   -> relationship care
    "rescue_or_let_go",  # low value + high risk -> low-cost automated win-back only
    "monitor",         # low value + low risk    -> leave to lifecycle automation
]


@dataclass(frozen=True)
class ScoredCustomer:
    acc_id: int
    value_at_risk: float       # THB — the core ranking key
    priority_score: float      # 0..100 rescaled value_at_risk, for display only
    segment: Segment
    credit_urgency: str        # "critical"/"warning"/"monitor"/"stable"/"n/a"
    reason: str


# ── Core scoring ─────────────────────────────────────────────────────

def value_at_risk(churn_prob: pd.Series, predicted_clv: pd.Series) -> pd.Series:
    """Expected revenue lost if we do nothing = P(churn) * CLV.

    Missing churn is treated as UNKNOWN, not as safe. We fill it with the
    population median churn so a customer with no churn prediction is not
    silently ranked as risk-free (the v1 `fillna(0.0)` bug).
    """
    prob = pd.to_numeric(churn_prob, errors="coerce")
    prob = prob.fillna(prob.median() if prob.notna().any() else 0.0)
    clv = pd.to_numeric(predicted_clv, errors="coerce").fillna(0.0).clip(lower=0.0)
    return (prob.clip(0.0, 1.0) * clv).rename("value_at_risk")


def to_display_score(var_series: pd.Series) -> pd.Series:
    """Map value-at-risk (THB, heavy right tail) to a 0..100 display score.

    Uses log1p then min-max so the dashboard number stays readable while the
    *ordering* remains identical to raw value_at_risk. Ranking always uses the
    raw THB value; this is cosmetic only.
    """
    logged = np.log1p(var_series.clip(lower=0.0))
    lo, hi = float(logged.min()), float(logged.max())
    if hi - lo < 1e-9:
        return pd.Series(0.0, index=var_series.index, name="priority_score")
    return (100.0 * (logged - lo) / (hi - lo)).round(1).rename("priority_score")


def assign_segment(
    churn_prob: pd.Series,
    predicted_clv: pd.Series,
    *,
    risk_high: float = RISK_HIGH,
    value_high_percentile: float = VALUE_HIGH_PERCENTILE,
) -> pd.Series:
    """2-D value x risk segmentation — tells the team which play to run."""
    prob = pd.to_numeric(churn_prob, errors="coerce").fillna(0.0)
    clv = pd.to_numeric(predicted_clv, errors="coerce").fillna(0.0)
    value_cut = clv[clv > 0].quantile(value_high_percentile) if (clv > 0).any() else np.inf

    high_risk = prob >= risk_high
    high_value = clv >= value_cut

    segment = pd.Series("monitor", index=prob.index, dtype="object")
    segment[high_value & high_risk] = "retain_now"
    segment[high_value & ~high_risk] = "protect"
    segment[~high_value & high_risk] = "rescue_or_let_go"
    return segment.rename("segment")


def credit_urgency(days_until_topup: pd.Series, *, eligible: pd.Series | None = None) -> pd.Series:
    """Timing flag, kept OUT of the value ranking on purpose.

    A near-empty credit balance is an upsell trigger (sales), not a churn signal
    (retention). Blending it into one score muddies both actions.
    """
    days = pd.to_numeric(days_until_topup, errors="coerce")
    out = pd.Series("n/a", index=days.index, dtype="object")
    has_days = days.notna()
    out[has_days] = "stable"
    out[has_days & (days <= URGENCY_BUCKETS["monitor"])] = "monitor"
    out[has_days & (days <= URGENCY_BUCKETS["warning"])] = "warning"
    out[has_days & (days <= URGENCY_BUCKETS["critical"])] = "critical"
    if eligible is not None:
        out[~eligible.fillna(False)] = "n/a"
    return out.rename("credit_urgency")


def build_reason(
    var_value: float,
    churn_prob: float,
    clv_value: float,
    segment: str,
    urgency: str,
) -> str:
    """One Thai sentence anchored to the money, plus the urgent timing if any."""
    parts: list[str] = []
    if not pd.isna(churn_prob) and not pd.isna(clv_value) and clv_value > 0:
        parts.append(
            f"เสี่ยงเสียรายได้ ฿{var_value:,.0f} "
            f"(churn {churn_prob * 100:.0f}% × CLV ฿{clv_value:,.0f})"
        )
    elif not pd.isna(clv_value) and clv_value > 0:
        parts.append(f"ลูกค้ามูลค่า ฿{clv_value:,.0f}")
    else:
        parts.append("ยังประเมินมูลค่าไม่ได้")

    if urgency in ("critical", "warning"):
        parts.append(f"เครดิตใกล้หมด ({urgency})")

    seg_label = {
        "retain_now": "→ รีบติดต่อรักษา",
        "protect": "→ ดูแลความสัมพันธ์",
        "rescue_or_let_go": "→ win-back อัตโนมัติต้นทุนต่ำ",
        "monitor": "→ ปล่อยให้ระบบเฝ้าดู",
    }.get(segment, "")
    if seg_label:
        parts.append(seg_label)
    return " ".join(parts)


def score_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Add v2 columns to a frame with churn_probability / predicted_clv_6m /
    estimated_days_until_topup (+ optional eligible_for_credit).

    Returns the frame sorted by value_at_risk (desc) — the recommended order
    for the Top priority table.
    """
    out = frame.copy()
    out["value_at_risk"] = value_at_risk(out["churn_probability"], out["predicted_clv_6m"])
    out["priority_score"] = to_display_score(out["value_at_risk"])
    out["segment"] = assign_segment(out["churn_probability"], out["predicted_clv_6m"])
    out["credit_urgency"] = credit_urgency(
        out.get("estimated_days_until_topup", pd.Series(index=out.index, dtype="float64")),
        eligible=out.get("eligible_for_credit"),
    )
    out["priority_reason"] = [
        build_reason(var, prob, clv, seg, urg)
        for var, prob, clv, seg, urg in zip(
            out["value_at_risk"],
            out["churn_probability"],
            out["predicted_clv_6m"],
            out["segment"],
            out["credit_urgency"],
        )
    ]
    return out.sort_values("value_at_risk", ascending=False).reset_index(drop=True)


# ── v1 reference (for backtests / A-B comparison) ────────────────────

V1_WEIGHTS = {"risk": 50.0, "value": 30.0, "credit": 20.0}


def score_frame_v1(frame: pd.DataFrame) -> pd.DataFrame:
    """Faithful reimplementation of the CURRENT production score, so the two can
    be ranked side by side on identical inputs."""
    out = frame.copy()
    p_risk = pd.to_numeric(out["churn_probability"], errors="coerce").fillna(0.0)
    clv = pd.to_numeric(out["predicted_clv_6m"], errors="coerce")
    pool = clv.notna() & (clv > 0)
    value_rank = pd.Series(0.0, index=out.index)
    if pool.any():
        value_rank.loc[pool] = clv[pool].rank(pct=True)
    days = pd.to_numeric(out.get("estimated_days_until_topup"), errors="coerce")
    p_credit = pd.Series(
        np.where(days.notna(), np.maximum(0.0, 1.0 - days / 90.0), 0.0), index=out.index
    )
    out["priority_score_v1"] = (
        V1_WEIGHTS["risk"] * p_risk
        + V1_WEIGHTS["value"] * value_rank
        + V1_WEIGHTS["credit"] * p_credit
    ).round(2)
    return out.sort_values("priority_score_v1", ascending=False).reset_index(drop=True)
