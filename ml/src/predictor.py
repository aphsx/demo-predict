"""
1Moby Analytics — MobyPredictor
ประตูเดียวสำหรับทุก prediction
โหลด models ครั้งเดียวตอน __init__ แล้ว reuse ทุก call
"""

import numpy as np
import pandas as pd
from pathlib import Path
from datetime import date

from src.config import CUTOFF, MODELS_DIR, PRIORITY_WEIGHTS, URGENCY_SCORE_MAP
from src.models import churn_model, clv_model, credit_model


class MobyPredictor:
    """
    Usage:
        predictor = MobyPredictor()
        result    = predictor.predict_all(acc_id=12345)
        df        = predictor.predict_batch(users_df)
        explain   = predictor.explain(acc_id=12345)
        what_if   = predictor.what_if(acc_id=12345, feature="days_since_last_access", new_value=0)
    """

    def __init__(self, models_dir: Path = MODELS_DIR,
                 cutoff: pd.Timestamp = CUTOFF):
        self.models_dir = Path(models_dir)
        self.cutoff     = cutoff
        self._feat_df: pd.DataFrame | None = None
        self._payments: pd.DataFrame | None = None
        self._usage: pd.DataFrame | None = None
        self._churn_out: pd.DataFrame | None = None
        self._clv_out: pd.DataFrame | None = None
        self._credit_out: pd.DataFrame | None = None
        print(f"[MobyPredictor] initialized (models_dir={models_dir})")

    # ─────────────────────────────────────────────────────────────
    # Data loading (call once before predict)
    # ─────────────────────────────────────────────────────────────

    def load_data(self, feat_df: pd.DataFrame,
                  payments: pd.DataFrame, usage: pd.DataFrame) -> "MobyPredictor":
        """
        โหลด DataFrames จาก pipeline เข้า predictor
        ต้องเรียกก่อน predict_all / predict_batch
        """
        self._feat_df  = feat_df
        self._payments = payments
        self._usage    = usage
        return self

    def run_all_predictions(self) -> "MobyPredictor":
        """
        รัน 3 models พร้อมกัน เก็บผลไว้ใน cache
        """
        if self._feat_df is None:
            raise RuntimeError("Call load_data() before run_all_predictions()")

        print("[Predict] Running churn model...")
        self._churn_out = churn_model.predict(self._feat_df, self.models_dir)

        print("[Predict] Running CLV model...")
        self._clv_out = clv_model.predict(self._payments, self.cutoff, self.models_dir)

        print("[Predict] Running credit model...")
        self._credit_out = credit_model.predict(
            self._payments, self._usage, self.cutoff, self.models_dir)

        print("[Predict] All models done.")
        return self

    # ─────────────────────────────────────────────────────────────
    # Customer 360
    # ─────────────────────────────────────────────────────────────

    def predict_all(self, acc_id: int) -> dict:
        """
        คืน Customer 360 สำหรับลูกค้า 1 คน (16 fields)
        """
        self._ensure_predictions()
        row = self._build_360_row(acc_id)
        return row

    def predict_batch(self, acc_ids: list[int] | None = None) -> pd.DataFrame:
        """
        คืน Customer 360 DataFrame สำหรับทุกคน (หรือกลุ่มที่ระบุ)
        """
        self._ensure_predictions()
        merged = self._merge_all()
        if acc_ids:
            merged = merged[merged["acc_id"].isin(acc_ids)]
        return merged

    # ─────────────────────────────────────────────────────────────
    # Explain & What-If
    # ─────────────────────────────────────────────────────────────

    def explain(self, acc_id: int) -> dict:
        """
        SHAP explanation สำหรับลูกค้า 1 คน
        """
        if self._feat_df is None:
            raise RuntimeError("Call load_data() before explain()")
        return churn_model.explain(acc_id, self._feat_df, self.models_dir)

    def what_if(self, acc_id: int, feature: str, new_value: float) -> dict:
        """
        ถ้าเปลี่ยน feature นี้เป็น new_value churn prob จะเป็นเท่าไหร่?
        """
        if self._feat_df is None:
            raise RuntimeError("Call load_data() before what_if()")
        return churn_model.what_if(acc_id, feature, new_value, self._feat_df, self.models_dir)

    # ─────────────────────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────────────────────

    def _ensure_predictions(self) -> None:
        if self._churn_out is None:
            self.run_all_predictions()

    def _merge_all(self) -> pd.DataFrame:
        merged = self._feat_df[["acc_id"]].copy()
        merged = merged.merge(self._churn_out, on="acc_id", how="left")
        merged["churn_tier"] = merged["churn_tier"].astype(str)

        merged = merged.merge(
            self._clv_out[["acc_id", "predicted_clv_6m", "p_alive",
                            "ci_95_lo", "ci_95_hi", "ci_80_lo", "ci_80_hi",
                            "rfm_segment"]],
            on="acc_id", how="left"
        )
        merged = merged.merge(
            self._credit_out[["acc_id", "p10", "p25", "p50", "p75", "p90",
                               "urgency", "alert_date"]],
            on="acc_id", how="left"
        )

        # Mark already churned
        if self._payments is not None:
            from src.data_loader import define_active
            active_set = define_active(self._usage, self._payments, self.cutoff)
            merged["is_active"] = merged["acc_id"].isin(active_set).astype(int)
            mask = merged["is_active"] == 0
            merged.loc[mask, "churn_probability"] = 1.0
            merged.loc[mask, "churn_tier"]        = "Already Churned"

        # Priority score
        merged["priority_score"] = _compute_priority(merged)
        merged["revenue_at_risk"] = (
            merged["churn_probability"].fillna(0) *
            merged["predicted_clv_6m"].fillna(0)
        )
        return merged

    def _build_360_row(self, acc_id: int) -> dict:
        merged = self._merge_all()
        row    = merged[merged["acc_id"] == acc_id]
        if len(row) == 0:
            return {"acc_id": acc_id, "error": "not found"}
        r = row.iloc[0].to_dict()

        # Format CI as list
        r["clv_95_CI"] = [round(r.pop("ci_95_lo", 0), 2), round(r.pop("ci_95_hi", 0), 2)]
        r["clv_80_CI"] = [round(r.pop("ci_80_lo", 0), 2), round(r.pop("ci_80_hi", 0), 2)]

        # Round floats
        for k in ["churn_probability", "p_alive", "predicted_clv_6m",
                  "revenue_at_risk", "priority_score",
                  "p10", "p25", "p50", "p75", "p90"]:
            if k in r and r[k] is not None:
                r[k] = round(float(r[k]), 4)
        return r


# ─────────────────────────────────────────────────────────────────
# Priority Score
# ─────────────────────────────────────────────────────────────────

def _normalize(series: pd.Series) -> pd.Series:
    mn, mx = series.min(), series.max()
    return (series - mn) / (mx - mn + 1e-9)


def _compute_priority(df: pd.DataFrame) -> pd.Series:
    active = df["is_active"] == 1 if "is_active" in df.columns else pd.Series(True, index=df.index)

    urgency_score = df["urgency"].map(URGENCY_SCORE_MAP).fillna(0.0)
    recency_score = pd.Series(0.0, index=df.index)
    if "days_since_last_access" in df.columns:
        recency_score = 1.0 - (df["days_since_last_access"].fillna(365) / 365).clip(0, 1)

    score = (
        PRIORITY_WEIGHTS["churn_probability"] * _normalize(df["churn_probability"].fillna(0)) +
        PRIORITY_WEIGHTS["predicted_clv_6m"]  * _normalize(df["predicted_clv_6m"].fillna(0)) +
        PRIORITY_WEIGHTS["urgency_score"]      * urgency_score +
        PRIORITY_WEIGHTS["recency_score"]      * recency_score
    ) * 10

    result = pd.Series(np.nan, index=df.index)
    result[active] = score[active]
    return result.round(4)
