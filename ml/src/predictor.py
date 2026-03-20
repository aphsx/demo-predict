"""
1Moby Analytics — MobyPredictor V2
ครอบคลุมทุก Lifecycle Stage:
  Ghost        → rule-based action
  Churned      → Win-back model (P(comeback))
  Active Free  → Conversion model (P(convert))
  Active Paid  → Churn + CLV + Credit models
"""

import numpy as np
import pandas as pd
from pathlib import Path
from datetime import date

from src.config import CUTOFF, MODELS_DIR, PRIORITY_WEIGHTS, URGENCY_SCORE_MAP
from src.lifecycle import assign_lifecycle_stage
from src.models import churn_model, clv_model, credit_model, winback_model, conversion_model


class MobyPredictor:
    """
    Usage:
        predictor = MobyPredictor()
        predictor.load_data(users, feat_df, payments, usage)
        predictor.run_all_predictions()
        df = predictor.predict_batch()
    """

    def __init__(self, models_dir: Path = MODELS_DIR,
                 cutoff: pd.Timestamp = CUTOFF):
        self.models_dir = Path(models_dir)
        self.cutoff     = cutoff
        self._users    = None
        self._feat_df  = None
        self._payments = None
        self._usage    = None
        self._lifecycle = None
        self._churn_out = None
        self._clv_out = None
        self._credit_out = None
        self._winback_out = None
        self._conversion_out = None
        print(f"[MobyPredictor V2] initialized (models_dir={models_dir})")

    def load_data(self, users, feat_df, payments, usage):
        self._users    = users
        self._feat_df  = feat_df
        self._payments = payments
        self._usage    = usage
        return self

    def run_all_predictions(self):
        if self._users is None:
            raise RuntimeError("Call load_data() first")

        # Step 1: Lifecycle staging
        print("\n[Predict] Step 1: Assigning lifecycle stages...")
        self._lifecycle = assign_lifecycle_stage(
            self._users, self._payments, self._usage, self.cutoff)

        active_paid_ids = set(
            self._lifecycle[self._lifecycle["lifecycle_stage"] == "Active Paid"]["acc_id"])
        active_free_ids = set(
            self._lifecycle[self._lifecycle["lifecycle_stage"] == "Active Free"]["acc_id"])
        churned_ids = set(
            self._lifecycle[self._lifecycle["lifecycle_stage"] == "Churned"]["acc_id"])

        # Step 2: Churn model (Active Paid)
        print("\n[Predict] Step 2: Churn model (Active Paid)...")
        active_feat = self._feat_df[self._feat_df["acc_id"].isin(active_paid_ids)]
        if len(active_feat) > 0:
            self._churn_out = churn_model.predict(active_feat, self.models_dir)
        else:
            self._churn_out = pd.DataFrame(columns=["acc_id", "churn_probability", "churn_tier"])

        # Step 3: CLV model
        print("[Predict] Step 3: CLV model...")
        self._clv_out = clv_model.predict(self._payments, self.cutoff, self.models_dir)

        # Step 4: Credit model
        print("[Predict] Step 4: Credit model...")
        self._credit_out = credit_model.predict(
            self._payments, self._usage, self.cutoff, self.models_dir)

        # Step 5: Win-back model (Churned)
        print("[Predict] Step 5: Win-back model (Churned)...")
        if len(churned_ids) > 0:
            try:
                self._winback_out = winback_model.predict(
                    self._users, self._payments, self._usage,
                    churned_ids, self.cutoff, self.models_dir)
            except FileNotFoundError:
                print("  Win-back model not trained yet — skipping")
                self._winback_out = pd.DataFrame()
        else:
            self._winback_out = pd.DataFrame()

        # Step 6: Conversion model (Active Free)
        print("[Predict] Step 6: Conversion model (Active Free)...")
        if len(active_free_ids) > 0:
            try:
                self._conversion_out = conversion_model.predict(
                    self._users, self._usage,
                    active_free_ids, self.cutoff, self.models_dir)
            except FileNotFoundError:
                print("  Conversion model not trained yet — skipping")
                self._conversion_out = pd.DataFrame()
        else:
            self._conversion_out = pd.DataFrame()

        print("\n[Predict] All models done.")
        return self

    def predict_batch(self, acc_ids=None):
        self._ensure_predictions()
        merged = self._merge_all()
        if acc_ids:
            merged = merged[merged["acc_id"].isin(acc_ids)]
        return merged

    def predict_all(self, acc_id):
        self._ensure_predictions()
        merged = self._merge_all()
        row = merged[merged["acc_id"] == acc_id]
        if len(row) == 0:
            return {"acc_id": acc_id, "error": "not found"}
        r = row.iloc[0].to_dict()
        for k in ["churn_probability", "p_alive", "predicted_clv_6m",
                   "revenue_at_risk", "priority_score",
                   "p10", "p25", "p50", "p75", "p90",
                   "comeback_probability", "conversion_probability"]:
            if k in r and r[k] is not None and pd.notna(r.get(k)):
                r[k] = round(float(r[k]), 4)
        return r

    def explain(self, acc_id):
        if self._feat_df is None:
            raise RuntimeError("Call load_data() first")
        return churn_model.explain(acc_id, self._feat_df, self.models_dir)

    def what_if(self, acc_id, feature, new_value):
        if self._feat_df is None:
            raise RuntimeError("Call load_data() first")
        return churn_model.what_if(acc_id, feature, new_value, self._feat_df, self.models_dir)

    def _ensure_predictions(self):
        if self._lifecycle is None:
            self.run_all_predictions()

    def _merge_all(self):
        merged = self._lifecycle.copy()

        # Merge churn
        if self._churn_out is not None and len(self._churn_out) > 0:
            merged = merged.merge(
                self._churn_out[["acc_id", "churn_probability", "churn_tier"]],
                on="acc_id", how="left")
        else:
            merged["churn_probability"] = np.nan
            merged["churn_tier"] = None

        # Merge CLV
        if self._clv_out is not None and len(self._clv_out) > 0:
            merged = merged.merge(
                self._clv_out[["acc_id", "predicted_clv_6m", "p_alive",
                                "ci_95_lo", "ci_95_hi", "ci_80_lo", "ci_80_hi",
                                "rfm_segment"]],
                on="acc_id", how="left")
        else:
            for c in ["predicted_clv_6m", "p_alive", "ci_95_lo", "ci_95_hi",
                       "ci_80_lo", "ci_80_hi"]:
                merged[c] = np.nan
            merged["rfm_segment"] = None

        # Merge Credit
        if self._credit_out is not None and len(self._credit_out) > 0:
            merged = merged.merge(
                self._credit_out[["acc_id", "p10", "p25", "p50", "p75", "p90",
                                   "urgency", "alert_date"]],
                on="acc_id", how="left")
        else:
            for c in ["p10", "p25", "p50", "p75", "p90"]:
                merged[c] = np.nan
            merged["urgency"] = None
            merged["alert_date"] = None

        # Merge Win-back
        if self._winback_out is not None and len(self._winback_out) > 0:
            merged = merged.merge(
                self._winback_out[["acc_id", "comeback_probability",
                                    "winback_tier", "winback_action"]],
                on="acc_id", how="left")
        else:
            merged["comeback_probability"] = np.nan
            merged["winback_tier"] = None
            merged["winback_action"] = None

        # Merge Conversion
        if self._conversion_out is not None and len(self._conversion_out) > 0:
            merged = merged.merge(
                self._conversion_out[["acc_id", "conversion_probability",
                                       "conversion_tier", "conversion_action"]],
                on="acc_id", how="left")
        else:
            merged["conversion_probability"] = np.nan
            merged["conversion_tier"] = None
            merged["conversion_action"] = None

        # Set labels for non Active Paid
        # Convert categorical to string to allow custom labels
        if "churn_tier" in merged.columns:
            merged["churn_tier"] = merged["churn_tier"].astype(str)
        ghost_mask = merged["lifecycle_stage"] == "Ghost"
        churned_mask = merged["lifecycle_stage"] == "Churned"
        free_mask = merged["lifecycle_stage"] == "Active Free"
        paid_mask = merged["lifecycle_stage"] == "Active Paid"

        merged.loc[ghost_mask, "churn_tier"] = "Ghost"
        merged.loc[churned_mask, "churn_tier"] = "Already Churned"
        merged.loc[free_mask, "churn_tier"] = "Free User"

        # Sub-stage for Active Paid
        high_churn = paid_mask & (merged["churn_probability"].fillna(0) >= 0.30)
        merged.loc[paid_mask & ~high_churn, "sub_stage"] = "Healthy"
        merged.loc[paid_mask & high_churn, "sub_stage"] = "At Risk"

        # Priority score
        merged["priority_score"] = _compute_priority(merged)

        # Revenue at risk (Active Paid only)
        merged["revenue_at_risk"] = np.where(
            paid_mask,
            merged["churn_probability"].fillna(0) * merged["predicted_clv_6m"].fillna(0),
            0,
        )

        # Recommended action
        merged["recommended_action"] = merged.apply(_recommend_action, axis=1)

        return merged


def _normalize(series):
    mn, mx = series.min(), series.max()
    return (series - mn) / (mx - mn + 1e-9)


def _compute_priority(df):
    score = pd.Series(np.nan, index=df.index)
    paid = df["lifecycle_stage"] == "Active Paid"
    urgency_score = df["urgency"].map(URGENCY_SCORE_MAP).fillna(0.0)

    if paid.sum() > 0:
        paid_df = df[paid]
        s = (
            PRIORITY_WEIGHTS["churn_probability"] * _normalize(paid_df["churn_probability"].fillna(0)) +
            PRIORITY_WEIGHTS["predicted_clv_6m"]  * _normalize(paid_df["predicted_clv_6m"].fillna(0)) +
            PRIORITY_WEIGHTS["urgency_score"]     * urgency_score[paid] +
            PRIORITY_WEIGHTS["recency_score"]     * 0.5
        ) * 10
        score[paid] = s

    churned = df["lifecycle_stage"] == "Churned"
    if churned.sum() > 0:
        score[churned] = (df.loc[churned, "comeback_probability"].fillna(0) * 10).round(2)

    free = df["lifecycle_stage"] == "Active Free"
    if free.sum() > 0:
        score[free] = (df.loc[free, "conversion_probability"].fillna(0) * 10).round(2)

    return score.round(4)


def _recommend_action(row):
    stage = row.get("lifecycle_stage", "")
    sub   = row.get("sub_stage", "")

    if stage == "Ghost":
        if sub == "New Signup":
            return "ส่ง onboarding email + welcome offer"
        elif sub == "Warm Ghost":
            return "ส่ง reminder + free trial"
        return "Archive — ไม่ต้องทำอะไร"

    elif stage == "Churned":
        action = row.get("winback_action")
        if pd.notna(action):
            return str(action)
        if sub == "Churned Paid":
            return "Win-back: โทรหา + special offer"
        return "Win-back: ส่ง promo campaign"

    elif stage == "Active Free":
        action = row.get("conversion_action")
        if pd.notna(action):
            return str(action)
        return "Engagement campaign — เพิ่ม usage"

    elif stage == "Active Paid":
        churn_p = row.get("churn_probability", 0) or 0
        urgency = row.get("urgency", "")
        rfm = row.get("rfm_segment", "")
        if churn_p >= 0.6 and urgency == "Critical":
            return "รีบโทรทันที — High churn + หมดเครดิตเร็ว"
        elif churn_p >= 0.6:
            return "โทรสอบถาม + เสนอ special offer"
        elif urgency == "Critical":
            return "ส่ง reminder ซื้อเครดิตด่วน"
        elif rfm in ("Champions", "Loyal"):
            return "Cross-sell / Upsell — ดูแลรักษา"
        elif churn_p >= 0.3:
            return "Monitor closely — ส่ง engagement email"
        return "ดูแลปกติ — ลูกค้า healthy"

    return "Monitor"
