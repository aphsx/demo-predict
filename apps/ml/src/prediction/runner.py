"""Prediction run executor (ML-V2-OUTPUT-CONTRACT §6).

Loads `predict_clean_*`, runs the production champions (churn / clv / credit)
through the same feature contract used at training time, computes derived
business fields, and batch-inserts exactly one row per customer into
`ml_prediction_outputs`. Every failure ends with the run marked `failed`.
"""

from __future__ import annotations

import json
import logging
import math
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

from src.training import repository
from src.training.artifacts import load_artifacts
from src.training.data import database_url, load_predict_clean
from src.training.features import (
    build_all_features,
    feature_code_hash,
)
from src.training.preprocessing import transform_features
from src.training.registry import current_champion
from src.training.validation import (
    check_predict_feature_leakage,
    check_predict_schema_quality,
    check_predict_source_readiness,
)

logger = logging.getLogger(__name__)

# Priority score weights (OUTPUT-CONTRACT §5.2) — single source of truth.
# Priority ranking key. priority_score ranks by expected money at risk
# (revenue_at_risk = churn_probability × predicted_clv_6m), log-rescaled to
# 0..100 for display. Credit urgency stays a separate timing signal
# (credit_urgency_level), not part of this score. No text reason is produced —
# explanation text is the AI layer's job.
TOPUP_CAP_DAYS = 365
INSERT_CHUNK = 1000

DEFAULT_THRESHOLDS = {"medium": 0.30, "high": 0.60, "critical": 0.85}


def _features_for_bundle(frame: pd.DataFrame, bundle: dict[str, Any]) -> pd.DataFrame:
    feature_names = list(bundle["preprocessor"].feature_names)
    missing = [feature_name for feature_name in feature_names if feature_name not in frame.columns]
    if missing:
        raise RuntimeError(f"Prediction features missing columns required by artifact: {missing}")
    return frame[feature_names]


def _feature_contract_guard(model_type: str, bundle: dict[str, Any], frame: pd.DataFrame) -> None:
    """Validate required columns; allow legacy compatible hashes.

    Feature hashes are now model-specific. Existing churn/CLV champions were
    trained on the original 24-feature contract, while credit uses the extended
    27-feature contract. If an older artifact's hash differs but all of its
    serialized preprocessor columns are present, prediction remains safe.
    """

    features = _features_for_bundle(frame, bundle)
    card = bundle["model_card"]
    trained_hash = card.get("feature_code_hash")
    current_hash = feature_code_hash(list(features.columns))
    if trained_hash and trained_hash != current_hash:
        logger.warning(
            "Feature hash mismatch for %s champion %s, allowing compatible artifact columns.",
            model_type,
            card.get("version"),
        )


def run_prediction(prediction_run_id: str) -> None:
    try:
        _run_prediction_inner(prediction_run_id)
    except Exception as exc:  # noqa: BLE001 - §6.8: never leave a run in_progress.
        logger.exception("prediction run %s failed", prediction_run_id)
        _update_run(
            prediction_run_id,
            status="failed",
            error_message=f"{type(exc).__name__}: {exc}",
            progress={"step": "failed", "pct": 100},
            mark_finished=True,
        )
        raise


def _run_prediction_inner(prediction_run_id: str) -> None:
    run = _load_run(prediction_run_id)
    source_id = run["predict_source_id"]
    cutoff = pd.Timestamp(run["cutoff_date"])

    def progress(step: str, pct: int) -> None:
        logger.info("[%s] %d%% %s", prediction_run_id[:8], pct, step)
        _update_run(prediction_run_id, progress={"step": step, "pct": pct})

    _update_run(prediction_run_id, status="in_progress", mark_started=True)
    progress("load data", 5)

    # ── Champions (alias `production` only) ───────────────────────
    champions: dict[str, dict[str, Any]] = {}
    for model_type in ("churn", "clv", "credit"):
        champion = current_champion(model_type)
        if champion is None:
            raise RuntimeError(f"No production model for '{model_type}' — train and promote first.")
        champions[model_type] = {
            **champion,
            "bundle": load_artifacts(champion["artifact_path"]),
        }

    # ── Gates on the predict source ───────────────────────────────
    progress("quality gates", 10)
    gate_reports = [
        check_predict_source_readiness(source_id),
        check_predict_schema_quality(source_id),
        check_predict_feature_leakage(source_id, cutoff),
    ]
    for report in gate_reports:
        repository.save_validation_report(report, prediction_run_id=prediction_run_id)
    failed = [r for r in gate_reports if r.status == "failed"]
    if failed:
        raise RuntimeError(
            "Predict source failed gates: " + ", ".join(r.validation_type for r in failed)
        )

    customers, payments, usage = load_predict_clean(source_id)

    progress("features", 20)
    feature_result = build_all_features(customers, payments, usage, cutoff)
    # lifecycle_df carries its own days_since_last_activity (same definition
    # as the feature) — drop it so the merge keeps the plain feature column.
    lifecycle_df = feature_result.lifecycle_df.drop(columns=["days_since_last_activity"])
    frame = lifecycle_df.merge(feature_result.feature_df, on="acc_id", how="left")
    frame["acc_id"] = frame["acc_id"].astype(int)

    # Eligibility matrix per OUTPUT-CONTRACT §2 (overrides features.py flags
    # for Churned/Ghost on clv + credit).
    stage = frame["lifecycle_stage"]
    frame["el_churn"] = stage.eq("Active Paid")
    frame["el_clv"] = stage.isin(["Active Paid", "Active Free"])
    frame["el_credit"] = stage.isin(["Active Paid", "Active Free"])

    for model_type, champion in champions.items():
        _feature_contract_guard(model_type, champion["bundle"], frame)

    # ── Churn (calibrated probability + SHAP factors) ─────────────
    progress("churn model", 35)
    churn_bundle = champions["churn"]["bundle"]
    churn_features = _features_for_bundle(frame, churn_bundle)
    thresholds = churn_bundle.get("thresholds") or DEFAULT_THRESHOLDS
    churn_prob = np.full(len(frame), np.nan)
    churn_mask = frame["el_churn"].to_numpy()
    if churn_mask.any():
        x_churn = transform_features(churn_features[churn_mask], churn_bundle["preprocessor"])
        raw_scores = churn_bundle["model"].predict_proba(x_churn)[:, 1]
        calibrator = churn_bundle["calibrator"]
        churn_prob[churn_mask] = (
            calibrator.transform(raw_scores) if calibrator is not None else raw_scores
        )
    frame["churn_probability"] = np.clip(churn_prob, 0.0, 1.0)
    frame["churn_risk_level"] = [
        _risk_level(p, thresholds) for p in frame["churn_probability"]
    ]

    progress("churn explanations (SHAP)", 45)
    frame["churn_factors"] = _churn_shap_factors(
        churn_bundle, churn_features, frame, churn_mask
    )

    # ── CLV + p_alive ─────────────────────────────────────────────
    progress("clv model", 55)
    clv_bundle = champions["clv"]["bundle"]
    clv_features = _features_for_bundle(frame, clv_bundle)
    frame = _apply_clv(frame, clv_bundle, clv_features, payments, cutoff)

    # ── Credit quantiles ─────────────────────────────────────────
    progress("credit model", 65)
    credit_bundle = champions["credit"]["bundle"]
    credit_features = _features_for_bundle(frame, credit_bundle)
    frame = _apply_credit(frame, credit_bundle, credit_features)

    # ── Descriptive + profile snapshot (§3.3) ─────────────────────
    progress("derived fields", 75)
    frame = _apply_descriptive(frame, customers, payments, cutoff)

    # ── Derived business fields (§5) ──────────────────────────────
    frame = _apply_derived(frame, cutoff)

    model_versions = {
        model_type: champions[model_type]["version"] for model_type in champions
    }

    # ── Batch insert (§6.6) ───────────────────────────────────────
    progress("insert outputs", 85)
    rows = _build_output_rows(prediction_run_id, frame, model_versions)
    _replace_outputs(prediction_run_id, rows)

    # ── Gate 15 post-check (§6.7) ─────────────────────────────────
    progress("post-checks", 95)
    post_check = _post_check(prediction_run_id, frame)
    _save_postcheck_report(prediction_run_id, source_id, post_check)
    if not post_check["passed"]:
        raise RuntimeError(f"Output post-check failed: {post_check['failures']}")

    _update_run(
        prediction_run_id,
        status="completed",
        total_customers=int(len(frame)),
        model_versions=model_versions,
        progress={"step": "completed", "pct": 100},
        mark_finished=True,
    )
    logger.info("prediction run %s completed (%d customers)", prediction_run_id, len(frame))


# ── Model application helpers ────────────────────────────────────


def _risk_level(probability: float, thresholds: dict[str, float]) -> str | None:
    if probability is None or (isinstance(probability, float) and math.isnan(probability)):
        return None
    if probability >= thresholds["critical"]:
        return "critical"
    if probability >= thresholds["high"]:
        return "high"
    if probability >= thresholds["medium"]:
        return "medium"
    return "low"


def _churn_shap_factors(
    churn_bundle: dict[str, Any],
    features_raw: pd.DataFrame,
    frame: pd.DataFrame,
    churn_mask: np.ndarray,
) -> list[list[dict[str, Any]] | None]:
    """Top-5 SHAP factors per eligible customer (§3.4)."""

    factors: list[list[dict[str, Any]] | None] = [None] * len(frame)
    if not churn_mask.any():
        return factors
    try:
        x = transform_features(features_raw[churn_mask], churn_bundle["preprocessor"])
        model = churn_bundle["model"]
        if hasattr(model, "coef_"):
            # Linear champion: SHAP of a linear model on standardized features
            # is exactly coef_j × x_ij (relative to the feature mean).
            values = np.asarray(x) * np.asarray(model.coef_[0])
        else:
            import shap

            explainer = shap.TreeExplainer(model)
            values = explainer.shap_values(x)
            if isinstance(values, list):
                values = values[1]
            if getattr(values, "ndim", 2) == 3:
                values = values[:, :, 1]
    except Exception as exc:  # noqa: BLE001 - explainability failure must not block the run.
        logger.warning("SHAP factors unavailable: %s", exc)
        return factors

    feature_names = list(x.columns)
    raw_values = features_raw[churn_mask].reset_index(drop=True)
    mask_positions = np.flatnonzero(churn_mask)
    for row_index, frame_position in enumerate(mask_positions):
        row_shap = values[row_index]
        top = np.argsort(-np.abs(row_shap))[:5]
        factors[frame_position] = [
            {
                "feature": feature_names[j],
                "value": _json_scalar(raw_values.iloc[row_index][feature_names[j]]),
                "direction": "up" if row_shap[j] > 0 else "down",
                "impact": round(float(abs(row_shap[j])), 4),
            }
            for j in top
        ]
    return factors


def _apply_clv(
    frame: pd.DataFrame,
    clv_bundle: dict[str, Any],
    features_raw: pd.DataFrame,
    payments: pd.DataFrame,
    cutoff: pd.Timestamp,
) -> pd.DataFrame:
    from src.training.clv_trainer import build_rfm_summary

    model_object = clv_bundle["model"]
    clv_mask = frame["el_clv"].to_numpy()
    predicted = np.full(len(frame), np.nan)
    p_alive = np.full(len(frame), np.nan)

    if clv_mask.any():
        eligible_acc = frame.loc[clv_mask, "acc_id"]
        rfm = build_rfm_summary(payments, eligible_acc, cutoff)
        bgnbd = model_object.get("bgnbd")
        if bgnbd is not None:
            bg_pred = bgnbd.predict_frame(rfm).set_index("acc_id")
            p_alive[clv_mask] = (
                eligible_acc.map(bg_pred["p_alive"]).fillna(np.nan).to_numpy()
            )
            if model_object["champion"] == "bgnbd_gamma_gamma":
                predicted[clv_mask] = (
                    eligible_acc.map(bg_pred["predicted_clv"]).fillna(0.0).to_numpy()
                )
        if model_object["champion"] == "lgbm_tweedie":
            x = transform_features(features_raw[clv_mask], clv_bundle["preprocessor"])
            predicted[clv_mask] = np.clip(model_object["tweedie"].predict(x), 0, None)

    frame["predicted_clv_6m"] = predicted
    frame["p_alive"] = np.clip(p_alive, 0.0, 1.0)
    return frame


def _apply_credit(
    frame: pd.DataFrame,
    credit_bundle: dict[str, Any],
    features_raw: pd.DataFrame,
) -> pd.DataFrame:
    horizons = credit_bundle["model"]["horizons"]
    topup_model = credit_bundle["model"].get("topup_model")
    credit_mask = frame["el_credit"].to_numpy()
    columns = {
        "predicted_credit_usage_30d": np.nan,
        "predicted_credit_usage_90d": np.nan,
        "credit_p10_30d": np.nan,
        "credit_p90_30d": np.nan,
        "credit_p10_90d": np.nan,
        "credit_p90_90d": np.nan,
        "estimated_days_until_topup": np.nan,
    }
    for name, default in columns.items():
        frame[name] = default

    if credit_mask.any():
        from src.training.credit_trainer import credit_anchor_log

        x = transform_features(features_raw[credit_mask], credit_bundle["preprocessor"])
        q30 = horizons[30].predict_quantiles(x, credit_anchor_log(features_raw[credit_mask], 30))
        q90 = horizons[90].predict_quantiles(x, credit_anchor_log(features_raw[credit_mask], 90))
        frame.loc[credit_mask, "predicted_credit_usage_30d"] = q30[0.50]
        frame.loc[credit_mask, "predicted_credit_usage_90d"] = q90[0.50]
        frame.loc[credit_mask, "credit_p10_30d"] = q30[0.10]
        frame.loc[credit_mask, "credit_p90_30d"] = q30[0.90]
        frame.loc[credit_mask, "credit_p10_90d"] = q90[0.10]
        frame.loc[credit_mask, "credit_p90_90d"] = q90[0.90]
        if topup_model is not None:
            # AFT model trained on the censored days_until_next_topup label —
            # replaces the balance/burn heuristic (kept as fallback for older
            # artifacts without the model, see _apply_derived).
            days = topup_model.predict_days(x)
            frame.loc[credit_mask, "estimated_days_until_topup"] = np.minimum(
                np.ceil(days), TOPUP_CAP_DAYS
            )
    return frame


def _apply_descriptive(
    frame: pd.DataFrame,
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    cutoff: pd.Timestamp,
) -> pd.DataFrame:
    history = payments[
        payments["acc_id"].notna()
        & payments["payment_date"].notna()
        & (payments["payment_date"] < cutoff)
    ].copy()
    history["acc_id"] = history["acc_id"].astype(int)
    history["amount"] = pd.to_numeric(history["amount"], errors="coerce").fillna(0.0)
    grouped = history.groupby("acc_id")
    n_purchases = grouped.size()
    total_revenue = grouped["amount"].sum()

    frame["n_purchases"] = frame["acc_id"].map(n_purchases).fillna(0).astype(int)
    frame["total_revenue"] = frame["acc_id"].map(total_revenue).fillna(0.0)
    frame["avg_transaction_value"] = np.where(
        frame["n_purchases"] > 0, frame["total_revenue"] / frame["n_purchases"].clip(lower=1), np.nan
    )

    # usage_trend (§3.3) from usage_change_90d_pct
    change = pd.to_numeric(frame["usage_change_90d_pct"], errors="coerce").fillna(0.0)
    total_180 = pd.to_numeric(frame["usage_total_180d"], errors="coerce").fillna(0.0)
    frame["usage_trend"] = np.select(
        [total_180 <= 0, change > 0.10, change < -0.10],
        ["no_usage", "increasing", "declining"],
        default="stable",
    )

    # profile snapshot (§3.3) — snapshot fields are display-only Tier B data.
    snapshot_source = customers.sort_values("acc_id").drop_duplicates("acc_id", keep="last")
    snapshot_source = snapshot_source.set_index(snapshot_source["acc_id"].astype(int))
    share_columns = [
        "sms_usage_share",
        "email_usage_share",
        "bc_usage_share",
        "api_usage_share",
        "otp_usage_share",
    ]

    snapshots: list[dict[str, Any]] = []
    for _, row in frame.iterrows():
        acc_id = int(row["acc_id"])
        customer = snapshot_source.loc[acc_id] if acc_id in snapshot_source.index else None
        snapshots.append(
            {
                "join_date": _date_or_none(customer["join_date"]) if customer is not None else None,
                "customer_age_days": _int_or_none(row.get("customer_age_days")),
                "status_sms": _str_or_none(customer["status_sms"]) if customer is not None else None,
                "status_email": _str_or_none(customer["status_email"]) if customer is not None else None,
                "credit_sms": _float_or_zero(customer["credit_sms"]) if customer is not None else 0.0,
                "credit_email": _float_or_zero(customer["credit_email"]) if customer is not None else 0.0,
                "expire_sms": _date_or_none(customer["expire_sms"]) if customer is not None else None,
                "expire_email": _date_or_none(customer["expire_email"]) if customer is not None else None,
                "last_access": _date_or_none(customer["last_access"]) if customer is not None else None,
                "last_send": _date_or_none(customer["last_send"]) if customer is not None else None,
                **{column: round(_float_or_zero(row.get(column)), 4) for column in share_columns},
                "usage_total_180d": _float_or_zero(row.get("usage_total_180d")),
            }
        )
    frame["profile_snapshot"] = snapshots
    frame["credit_balance_total"] = [
        (snapshot["credit_sms"] or 0.0) + (snapshot["credit_email"] or 0.0)
        for snapshot in snapshots
    ]
    return frame


def _apply_derived(frame: pd.DataFrame, cutoff: pd.Timestamp) -> pd.DataFrame:
    # value tier (§3.5): percentile of CLV among active customers of the run
    active_mask = frame["lifecycle_stage"].isin(["Active Paid", "Active Free"])
    clv = pd.to_numeric(frame["predicted_clv_6m"], errors="coerce")
    tier = pd.Series("none", index=frame.index, dtype="object")
    pool = active_mask & clv.notna() & (clv > 0)
    if pool.any():
        rank = clv[pool].rank(pct=True)
        tier.loc[pool] = np.select(
            [rank >= 0.90, rank >= 0.50], ["high", "mid"], default="low"
        )
    frame["customer_value_tier"] = tier

    # revenue at risk (§5.1)
    churn_prob = pd.to_numeric(frame["churn_probability"], errors="coerce")
    frame["revenue_at_risk"] = np.where(
        churn_prob.notna() & clv.notna(), (churn_prob * clv).round(2), np.nan
    )

    # estimated days until top-up (§3.6) — primary source is the AFT model
    # (set in _apply_credit); the balance/burn heuristic only fills rows the
    # model left empty (older artifacts without a topup_model).
    p50_30 = pd.to_numeric(frame["predicted_credit_usage_30d"], errors="coerce")
    daily_burn = p50_30 / 30.0
    credit_balance = pd.to_numeric(frame["credit_balance_total"], errors="coerce").fillna(0.0)
    heuristic_days = np.where(
        daily_burn > 0, np.minimum(np.ceil(credit_balance / daily_burn), TOPUP_CAP_DAYS), np.nan
    )
    model_days = pd.to_numeric(frame["estimated_days_until_topup"], errors="coerce")
    days = np.where(model_days.notna(), model_days, heuristic_days)
    frame["estimated_days_until_topup"] = days

    urgency = pd.Series([None] * len(frame), index=frame.index, dtype="object")
    credit_eligible = frame["el_credit"]
    urgency.loc[credit_eligible] = "stable"
    with_days = credit_eligible & pd.Series(days, index=frame.index).notna()
    days_series = pd.Series(days, index=frame.index)
    urgency.loc[with_days & (days_series <= 90)] = "monitor"
    urgency.loc[with_days & (days_series <= 30)] = "warning"
    urgency.loc[with_days & (days_series <= 14)] = "critical"
    frame["credit_urgency_level"] = urgency

    # priority score (§5.2) — rank by expected money at risk. revenue_at_risk
    # (= churn × CLV) is the ranking key; the 0..100 priority_score is just a
    # log rescale of it for display, so sorting by priority_score equals sorting
    # by revenue_at_risk. No text reason is generated here — the numeric score is
    # the only priority signal; any human-readable "why" is produced by the AI
    # explanation from the underlying numbers/SHAP factors.
    var = pd.to_numeric(frame["revenue_at_risk"], errors="coerce").fillna(0.0).clip(lower=0.0)
    frame["priority_score"] = _display_score(var)

    return frame


def _display_score(value_at_risk: pd.Series) -> pd.Series:
    """Map revenue-at-risk (THB, heavy right tail) to a 0..100 display score.

    Ordering is preserved (log1p is monotonic), so ranking by priority_score is
    identical to ranking by revenue_at_risk. Cosmetic only.
    """
    logged = np.log1p(value_at_risk.clip(lower=0.0))
    low, high = float(logged.min()), float(logged.max())
    if high - low < 1e-9:
        return pd.Series(0.0, index=value_at_risk.index)
    return (100.0 * (logged - low) / (high - low)).round(2)

# ── Persistence ──────────────────────────────────────────────────


def _build_output_rows(
    prediction_run_id: str,
    frame: pd.DataFrame,
    model_versions: dict[str, str],
) -> list[dict[str, Any]]:
    model_versions_json = json.dumps(model_versions, ensure_ascii=False)
    rows: list[dict[str, Any]] = []
    for _, row in frame.iterrows():
        eligibility = _eligibility_json(row)
        interval = None
        if not pd.isna(row["credit_p10_30d"]):
            interval = json.dumps(
                {
                    "p10_30d": round(float(row["credit_p10_30d"]), 2),
                    "p90_30d": round(float(row["credit_p90_30d"]), 2),
                    "p10_90d": round(float(row["credit_p10_90d"]), 2),
                    "p90_90d": round(float(row["credit_p90_90d"]), 2),
                }
            )
        rows.append(
            {
                "prediction_run_id": prediction_run_id,
                "acc_id": int(row["acc_id"]),
                "lifecycle_stage": row["lifecycle_stage"],
                "sub_stage": row["sub_stage"],
                "churn_probability": _round_or_none(row["churn_probability"], 4),
                "churn_risk_level": row["churn_risk_level"],
                "churn_factors_json": json.dumps(row["churn_factors"], ensure_ascii=False)
                if row["churn_factors"] is not None
                else None,
                "predicted_clv_6m": _round_or_none(row["predicted_clv_6m"], 2),
                "p_alive": _round_or_none(row["p_alive"], 4),
                "customer_value_tier": row["customer_value_tier"],
                "revenue_at_risk": _round_or_none(row["revenue_at_risk"], 2),
                "predicted_credit_usage_30d": _round_or_none(row["predicted_credit_usage_30d"], 2),
                "predicted_credit_usage_90d": _round_or_none(row["predicted_credit_usage_90d"], 2),
                "credit_forecast_interval_json": interval,
                "estimated_days_until_topup": _int_or_none(row["estimated_days_until_topup"]),
                "credit_urgency_level": _str_or_none(row["credit_urgency_level"]),
                "usage_trend": row["usage_trend"],
                "days_since_last_activity": _int_or_none(row["days_since_last_activity"]),
                "n_purchases": int(row["n_purchases"]),
                "total_revenue": _round_or_none(row["total_revenue"], 2) or 0.0,
                "avg_transaction_value": _round_or_none(row["avg_transaction_value"], 2),
                "ever_paid": bool(row["ever_paid"]),
                "priority_score": _round_or_none(row["priority_score"], 2) or 0.0,
                "output_status": "predicted" if all(
                    model["eligible"] for model in json.loads(eligibility).values()
                ) else "partial",
                "output_notes": _output_notes(json.loads(eligibility)),
                "model_eligibility_json": eligibility,
                "model_versions_json": model_versions_json,
                "profile_snapshot_json": json.dumps(row["profile_snapshot"], ensure_ascii=False),
            }
        )
    return rows


def _eligibility_json(row: pd.Series) -> str:
    stage = row["lifecycle_stage"]
    churn_reason = {
        "Active Paid": ("eligible", "ลูกค้า Active Paid"),
        "Active Free": ("not_eligible", "never_paid — ไม่เคยจ่ายเงิน ไม่เข้านิยาม churn"),
        "Churned": ("not_eligible", "already_churned — churn ไปแล้ว ไม่ต้องทำนาย"),
        "Ghost": ("not_eligible", "no_history — ไม่มีประวัติพอจะทำนาย"),
    }[stage]
    clv_reason = {
        "Active Paid": ("eligible", "ลูกค้า active"),
        "Active Free": ("eligible", "ทำนายโอกาสเริ่มจ่าย"),
        "Churned": ("not_eligible", "inactive — ไม่ active แล้ว"),
        "Ghost": ("not_eligible", "no_history — ไม่มีประวัติ"),
    }[stage]
    credit_reason = {
        "Active Paid": ("eligible", "มีประวัติใช้งาน"),
        "Active Free": ("eligible", "มีประวัติใช้งาน"),
        "Churned": ("not_eligible", "inactive — ไม่ active แล้ว"),
        "Ghost": ("not_eligible", "no_history — ไม่มีประวัติ"),
    }[stage]

    def block(status_reason: tuple[str, str], predicted_value: Any) -> dict[str, Any]:
        status, reason = status_reason
        eligible = status == "eligible"
        if eligible and predicted_value is not None and not (
            isinstance(predicted_value, float) and math.isnan(predicted_value)
        ):
            return {"eligible": True, "status": "predicted", "reason": reason}
        if eligible:
            return {"eligible": True, "status": "insufficient_data", "reason": "ข้อมูลไม่พอประเมิน"}
        return {"eligible": False, "status": "not_eligible", "reason": reason}

    return json.dumps(
        {
            "churn": block(churn_reason, row["churn_probability"]),
            "clv": block(clv_reason, row["predicted_clv_6m"]),
            "credit": block(credit_reason, row["predicted_credit_usage_30d"]),
        },
        ensure_ascii=False,
    )


def _output_notes(eligibility: dict[str, Any]) -> str | None:
    notes = [
        f"{model_type}: {model['reason']}"
        for model_type, model in eligibility.items()
        if not model["eligible"]
    ]
    return "; ".join(notes) if notes else None


OUTPUT_COLUMNS = [
    "prediction_run_id", "acc_id", "lifecycle_stage", "sub_stage",
    "churn_probability", "churn_risk_level", "churn_factors_json",
    "predicted_clv_6m", "p_alive", "customer_value_tier", "revenue_at_risk",
    "predicted_credit_usage_30d", "predicted_credit_usage_90d",
    "credit_forecast_interval_json", "estimated_days_until_topup",
    "credit_urgency_level", "usage_trend",
    "days_since_last_activity", "n_purchases", "total_revenue",
    "avg_transaction_value", "ever_paid", "priority_score",
    "output_status", "output_notes",
    "model_eligibility_json", "model_versions_json", "profile_snapshot_json",
]


def _replace_outputs(prediction_run_id: str, rows: list[dict[str, Any]]) -> None:
    placeholders = ", ".join(
        f":{column}" if column not in (
            "prediction_run_id", "churn_factors_json", "credit_forecast_interval_json",
            "model_eligibility_json", "model_versions_json", "profile_snapshot_json",
        )
        else {
            "prediction_run_id": "CAST(:prediction_run_id AS UUID)",
            "churn_factors_json": "CAST(:churn_factors_json AS JSONB)",
            "credit_forecast_interval_json": "CAST(:credit_forecast_interval_json AS JSONB)",
            "model_eligibility_json": "CAST(:model_eligibility_json AS JSONB)",
            "model_versions_json": "CAST(:model_versions_json AS JSONB)",
            "profile_snapshot_json": "CAST(:profile_snapshot_json AS JSONB)",
        }[column]
        for column in OUTPUT_COLUMNS
    )
    insert_sql = text(
        f"INSERT INTO ml_prediction_outputs ({', '.join(OUTPUT_COLUMNS)}) VALUES ({placeholders})"
    )
    with create_engine(database_url()).begin() as conn:
        conn.execute(
            text("DELETE FROM ml_prediction_outputs WHERE prediction_run_id = CAST(:id AS UUID)"),
            {"id": prediction_run_id},
        )
        for start in range(0, len(rows), INSERT_CHUNK):
            conn.execute(insert_sql, rows[start : start + INSERT_CHUNK])


def _post_check(prediction_run_id: str, frame: pd.DataFrame) -> dict[str, Any]:
    with create_engine(database_url()).connect() as conn:
        inserted = conn.execute(
            text(
                "SELECT count(*) FROM ml_prediction_outputs WHERE prediction_run_id = CAST(:id AS UUID)"
            ),
            {"id": prediction_run_id},
        ).scalar_one()
        out_of_range = conn.execute(
            text(
                """
                SELECT count(*) FROM ml_prediction_outputs
                WHERE prediction_run_id = CAST(:id AS UUID)
                  AND (churn_probability < 0 OR churn_probability > 1
                       OR p_alive < 0 OR p_alive > 1)
                """
            ),
            {"id": prediction_run_id},
        ).scalar_one()

    eligible_churn = int(frame["el_churn"].sum())
    churn_nulls_in_eligible = int(
        frame.loc[frame["el_churn"], "churn_probability"].isna().sum()
    )
    failures: list[str] = []
    if inserted != len(frame):
        failures.append(f"row count {inserted} != customers {len(frame)}")
    if out_of_range > 0:
        failures.append(f"{out_of_range} rows with scores outside [0,1]")
    if eligible_churn > 0 and churn_nulls_in_eligible / eligible_churn > 0.01:
        failures.append(
            f"churn null rate among eligible too high ({churn_nulls_in_eligible}/{eligible_churn})"
        )
    return {
        "passed": not failures,
        "failures": failures,
        "stats": {
            "rows_inserted": int(inserted),
            "customers": int(len(frame)),
            "eligible_churn": eligible_churn,
            "churn_nulls_in_eligible": churn_nulls_in_eligible,
        },
    }


def _save_postcheck_report(
    prediction_run_id: str,
    source_id: str,
    post_check: dict[str, Any],
) -> None:
    with create_engine(database_url()).begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO ml_data_validation_reports (
                  source_id, source_kind, prediction_run_id, validation_type,
                  status, row_count, stats_json, anomalies_json
                ) VALUES (
                  CAST(:source_id AS UUID), 'predict', CAST(:prediction_run_id AS UUID),
                  'output_postcheck', :status, :row_count,
                  CAST(:stats AS JSONB), CAST(:anomalies AS JSONB)
                )
                """
            ),
            {
                "source_id": source_id,
                "prediction_run_id": prediction_run_id,
                "status": "passed" if post_check["passed"] else "failed",
                "row_count": post_check["stats"]["rows_inserted"],
                "stats": json.dumps(post_check["stats"]),
                "anomalies": json.dumps(
                    [{"message": failure} for failure in post_check["failures"]]
                ),
            },
        )


# ── Run row helpers ──────────────────────────────────────────────


def _load_run(prediction_run_id: str) -> dict[str, Any]:
    with create_engine(database_url()).connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT id::text, predict_source_id::text, status, cutoff_date, created_by
                FROM ml_prediction_runs WHERE id = CAST(:id AS UUID)
                """
            ),
            {"id": prediction_run_id},
        ).mappings().first()
    if row is None:
        raise RuntimeError(f"Prediction run {prediction_run_id} not found")
    return dict(row)


def _update_run(
    prediction_run_id: str,
    *,
    status: str | None = None,
    progress: dict[str, Any] | None = None,
    error_message: str | None = None,
    total_customers: int | None = None,
    model_versions: dict[str, str] | None = None,
    mark_started: bool = False,
    mark_finished: bool = False,
) -> None:
    sets: list[str] = []
    params: dict[str, Any] = {"id": prediction_run_id}
    if status is not None:
        sets.append("status = :status")
        params["status"] = status
    if progress is not None:
        sets.append("progress_json = CAST(:progress AS JSONB)")
        params["progress"] = json.dumps(progress, ensure_ascii=False)
    if error_message is not None:
        sets.append("error_message = :error_message")
        params["error_message"] = error_message
    if total_customers is not None:
        sets.append("total_customers = :total_customers")
        params["total_customers"] = total_customers
    if model_versions is not None:
        sets.append("model_versions_json = CAST(:model_versions AS JSONB)")
        params["model_versions"] = json.dumps(model_versions)
    if mark_started:
        sets.append("started_at = COALESCE(started_at, NOW())")
    if mark_finished:
        sets.append("finished_at = NOW()")
    if not sets:
        return
    with create_engine(database_url()).begin() as conn:
        conn.execute(
            text(f"UPDATE ml_prediction_runs SET {', '.join(sets)} WHERE id = CAST(:id AS UUID)"),
            params,
        )


# ── Scalar helpers ───────────────────────────────────────────────


def _round_or_none(value: Any, digits: int) -> float | None:
    if value is None or (isinstance(value, float) and math.isnan(value)) or pd.isna(value):
        return None
    return round(float(value), digits)


def _int_or_none(value: Any) -> int | None:
    if value is None or pd.isna(value):
        return None
    return int(value)


def _str_or_none(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    return str(value)


def _float_or_zero(value: Any) -> float:
    if value is None or pd.isna(value):
        return 0.0
    return float(value)


def _date_or_none(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    return str(pd.Timestamp(value).date())


def _json_scalar(value: Any) -> Any:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, (np.floating, np.integer)):
        return round(value.item(), 4) if isinstance(value, np.floating) else value.item()
    if isinstance(value, float):
        return round(value, 4)
    return value
