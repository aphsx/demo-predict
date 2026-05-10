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

from src.config import CUTOFF, MODELS_DIR
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
                self._churn_out[["acc_id", "churn_probability"]],
                on="acc_id", how="left")
        else:
            merged["churn_probability"] = np.nan

        # Merge CLV
        if self._clv_out is not None and len(self._clv_out) > 0:
            merged = merged.merge(
                self._clv_out[["acc_id", "predicted_clv_6m", "p_alive",
                                "ci_95_lo", "ci_95_hi", "ci_80_lo", "ci_80_hi"]],
                on="acc_id", how="left")
        else:
            for c in ["predicted_clv_6m", "p_alive", "ci_95_lo", "ci_95_hi",
                       "ci_80_lo", "ci_80_hi"]:
                merged[c] = np.nan

        # Merge Credit
        if self._credit_out is not None and len(self._credit_out) > 0:
            merged = merged.merge(
                self._credit_out[["acc_id", "p10", "p25", "p50", "p75", "p90"]],
                on="acc_id", how="left")
        else:
            for c in ["p10", "p25", "p50", "p75", "p90"]:
                merged[c] = np.nan

        # Merge Win-back
        if self._winback_out is not None and len(self._winback_out) > 0:
            merged = merged.merge(
                self._winback_out[["acc_id", "comeback_probability"]],
                on="acc_id", how="left")
        else:
            merged["comeback_probability"] = np.nan

        # Merge Conversion
        if self._conversion_out is not None and len(self._conversion_out) > 0:
            merged = merged.merge(
                self._conversion_out[["acc_id", "conversion_probability"]],
                on="acc_id", how="left")
        else:
            merged["conversion_probability"] = np.nan

        # Derived metrics (business layer)
        merged["revenue_at_risk"] = (
            merged["predicted_clv_6m"].fillna(0) * merged["churn_probability"].fillna(0)
        ).round(2)
        has_revenue = merged["n_purchases"].fillna(0) > 0
        merged["avg_transaction_value"] = np.where(
            has_revenue,
            (merged["total_revenue"].fillna(0) / merged["n_purchases"].fillna(1)).round(2),
            np.nan
        )

        return merged
