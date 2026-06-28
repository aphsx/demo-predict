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

from src.constants import (
    LifecycleStage,
    OutputStatus,
    RiskLevel,
    RunStatus,
    Segment,
    SubStage,
    UrgencyLevel,
    ValueTier,
)
from src.training import repository
from src.training.artifacts import load_artifacts
from src.training.data import database_url, load_predict_clean
from src.training.drift import (
    compute_feature_drift,
    drift_anomalies,
    drift_report_status,
)
from src.training.features import (
    build_all_features,
    feature_code_hash,
)
from src.training.preprocessing import transform_features
from src.training.registry import current_champion, version_for_serving
from src.training.validation import (
    ValidationReport,
    check_predict_feature_leakage,
    check_predict_schema_quality,
    check_predict_source_readiness,
)

logger = logging.getLogger(__name__)

_UNSET = object()  # sentinel — distinguishes "not supplied" from None in _update_run

# Priority score weights (OUTPUT-CONTRACT §5.2) — single source of truth.
# Priority ranking key. priority_score ranks by expected money at risk
# (revenue_at_risk = churn_probability × predicted_clv_6m), log-rescaled to
# 0..100 for display. Credit urgency stays a separate timing signal
# (credit_urgency_level), not part of this score. No text reason is produced —
# explanation text is the AI layer's job.
TOPUP_CAP_DAYS = 365
INSERT_CHUNK = 1000

# CLV hybrid tail correction (REMEDIATION-PLAN P1). All relative/scale-free.
CLV_TAIL_QUANTILE = 0.90  # only the top-decile whales may borrow the BG/NBD estimate
CLV_TAIL_MIN_POPULATION = 50  # below this, percentile tail detection is unreliable
CLV_TAIL_MIN_FREQUENCY = 2.0  # never blend single-payment customers


def _features_for_bundle(frame: pd.DataFrame, bundle: dict[str, Any]) -> pd.DataFrame:
    feature_names = list(bundle["preprocessor"].feature_names)
    missing = [
        feature_name
        for feature_name in feature_names
        if feature_name not in frame.columns
    ]
    if missing:
        raise RuntimeError(
            f"Prediction features missing columns required by artifact: {missing}"
        )
    return frame[feature_names]


def _feature_contract_guard(
    model_type: str, bundle: dict[str, Any], frame: pd.DataFrame
) -> None:
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


# Eligibility column scored by each model — drift is measured on the population
# that is actually being predicted, not the whole upload.
_DRIFT_ELIGIBILITY = {"churn": "el_churn", "clv": "el_clv", "credit": "el_credit"}


def _run_drift_checks(
    prediction_run_id: str,
    source_id: str,
    champions: dict[str, dict[str, Any]],
    frame: pd.DataFrame,
) -> set[str]:
    """Score PSI drift per model and persist one drift report each.

    Returns the set of model_types with major drift (PSI > 0.25 on ≥1 feature).
    Major drift surfaces as output_status=PARTIAL for affected customers.
    Champions trained before drift monitoring shipped carry no baseline and
    are skipped (not counted as drifted).
    """

    major_drift_models: set[str] = set()
    for model_type, champion in champions.items():
        bundle = champion["bundle"]
        baseline = bundle.get("feature_baseline")
        if not baseline:
            logger.info(
                "drift: %s champion has no feature baseline — skipping", model_type
            )
            continue

        feature_names = list(bundle["preprocessor"].feature_names)
        mask = frame[_DRIFT_ELIGIBILITY[model_type]].to_numpy()
        scored = frame.loc[mask, feature_names]
        if scored.empty:
            logger.info(
                "drift: %s has no eligible rows to score — skipping", model_type
            )
            continue

        drift = compute_feature_drift(scored, baseline, model_type=model_type)
        status = drift_report_status(drift)
        if drift["overall_status"] != "stable":
            logger.warning(
                "drift: %s %s — %d minor / %d major drifted features (consider retraining)",
                model_type,
                drift["overall_status"],
                drift["minor_drift_count"],
                drift["major_drift_count"],
            )
        if drift.get("major_drift_count", 0) > 0:
            major_drift_models.add(model_type)

        report = ValidationReport(
            source_id=source_id,
            source_kind="predict",
            validation_type="drift",
            status=status,
            row_count=int(len(scored)),
            stats={"model_type": model_type, "overall_status": drift["overall_status"]},
            anomalies=drift_anomalies(drift),
            checks=[],
            drift=drift,
        )
        repository.save_validation_report(report, prediction_run_id=prediction_run_id)

    return major_drift_models


def run_prediction(prediction_run_id: str) -> None:
    try:
        _run_prediction_inner(prediction_run_id)
    except Exception as exc:  # noqa: BLE001 - §6.8: never leave a run in_progress.
        logger.exception("prediction run %s failed", prediction_run_id)
        _update_run(
            prediction_run_id,
            status=RunStatus.FAILED,
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

    _update_run(prediction_run_id, status=RunStatus.IN_PROGRESS, mark_started=True)
    progress("load data", 5)

    # ── Models: production champion by default, or a per-run override ─────
    # `model_overrides_json` maps model_type → version_id. A missing/None entry
    # (or an invalid one) falls back to the production champion for that type.
    overrides = run.get("model_overrides_json") or {}
    if not isinstance(overrides, dict):
        overrides = {}
    champions: dict[str, dict[str, Any]] = {}
    for model_type in ("churn", "clv", "credit"):
        selected = None
        override_id = overrides.get(model_type)
        if override_id:
            selected = version_for_serving(model_type, str(override_id))
            if selected is None:
                raise RuntimeError(
                    f"Selected {model_type} model version {override_id} not found "
                    "or has no artifact — pick another version or use the champion."
                )
            logger.info("[%s] %s using override version %s", prediction_run_id[:8], model_type, selected["version"])
        else:
            selected = current_champion(model_type)
            if selected is None:
                raise RuntimeError(
                    f"No production model for '{model_type}' — train and promote first."
                )
        champions[model_type] = {
            **selected,
            "bundle": load_artifacts(selected["artifact_path"]),
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
            "Predict source failed gates: "
            + ", ".join(r.validation_type for r in failed)
        )

    customers, payments, usage = load_predict_clean(source_id)

    progress("features", 20)
    feature_result = build_all_features(customers, payments, usage, cutoff)
    # lifecycle_df carries its own days_since_last_activity (same definition
    # as the feature) — drop it so the merge keeps the plain feature column.
    lifecycle_df = feature_result.lifecycle_df.drop(
        columns=["days_since_last_activity"]
    )
    frame = lifecycle_df.merge(feature_result.feature_df, on="acc_id", how="left")
    frame["acc_id"] = frame["acc_id"].astype(int)

    # Eligibility matrix per OUTPUT-CONTRACT §2 (overrides features.py flags
    # for Churned/Ghost on clv + credit).
    stage = frame["lifecycle_stage"]
    frame["el_churn"] = stage.eq(LifecycleStage.ACTIVE_PAID)
    frame["el_clv"] = stage.isin(list(LifecycleStage.ACTIVE))
    frame["el_credit"] = stage.isin(list(LifecycleStage.ACTIVE))

    for model_type, champion in champions.items():
        _feature_contract_guard(model_type, champion["bundle"], frame)

    # ── Feature drift monitoring (PSI vs training baseline) ───────
    progress("drift monitoring", 30)
    major_drift_models = _run_drift_checks(
        prediction_run_id, source_id, champions, frame
    )

    # ── Churn (calibrated probability + SHAP factors) ─────────────
    progress("churn model", 35)
    churn_bundle = champions["churn"]["bundle"]
    churn_features = _features_for_bundle(frame, churn_bundle)
    thresholds = churn_bundle.get("thresholds")
    if not thresholds:
        # Fail loud: a churn champion without its trained risk thresholds is a
        # broken artifact. Guessing with defaults would silently mislabel risk.
        raise RuntimeError(
            "Churn champion is missing risk thresholds (thresholds.json); "
            "refusing to guess — retrain/repromote the churn model."
        )
    churn_prob = np.full(len(frame), np.nan)
    churn_mask = frame["el_churn"].to_numpy()
    if churn_mask.any():
        x_churn = transform_features(
            churn_features[churn_mask], churn_bundle["preprocessor"]
        )
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
    # Drop duplicates on acc_id — the unique constraint on (prediction_run_id, acc_id)
    # requires one row per customer. A fan-out from an upstream merge could in theory
    # produce duplicates; keep the last occurrence so the most-derived values win.
    frame = frame.drop_duplicates(subset=["acc_id"], keep="last")
    rows = _build_output_rows(
        prediction_run_id, frame, model_versions, major_drift_models
    )
    _replace_outputs(prediction_run_id, rows)

    # ── Gate 15 post-check (§6.7) ─────────────────────────────────
    progress("post-checks", 95)
    post_check = _post_check(prediction_run_id, frame)
    _save_postcheck_report(prediction_run_id, source_id, post_check)
    if not post_check["passed"]:
        raise RuntimeError(f"Output post-check failed: {post_check['failures']}")

    _update_run(
        prediction_run_id,
        status=RunStatus.COMPLETED,
        error_message=None,
        total_customers=int(len(frame)),
        model_versions=model_versions,
        progress={"step": "completed", "pct": 100},
        mark_finished=True,
    )
    logger.info(
        "prediction run %s completed (%d customers)", prediction_run_id, len(frame)
    )


# ── Model application helpers ────────────────────────────────────


def _risk_level(probability: float, thresholds: dict[str, float]) -> str | None:
    if probability is None or (
        isinstance(probability, float) and math.isnan(probability)
    ):
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
        elif hasattr(model, "feature_importances_"):
            # Tree champion (LightGBM / XGBoost / RandomForest): TreeExplainer is
            # exact and fast enough to run on the full eligible population.
            import shap

            explainer = shap.TreeExplainer(model)
            values = explainer.shap_values(x)
            if isinstance(values, list):
                values = values[1]
            if getattr(values, "ndim", 2) == 3:
                values = values[:, :, 1]
        else:
            # Opaque champion (e.g. TabICL foundation model): no tree structure
            # for TreeExplainer, and KernelExplainer is far too slow to run per
            # customer at serve scale. Emit no per-row factors rather than
            # fabricate directions — global permutation importance is still
            # available in the model card for population-level explanation.
            logger.warning(
                "churn champion %s is not SHAP-explainable at serve time; "
                "per-customer churn_factors will be null (see model_card feature_importance)",
                type(model).__name__,
            )
            return factors
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


def _blend_clv_tail(
    tweedie_pred: np.ndarray,
    *,
    bg_clv: np.ndarray,
    freq: np.ndarray,
    revenue: np.ndarray,
    tail_quantile: float = CLV_TAIL_QUANTILE,
) -> np.ndarray:
    """Lift the whale tail of a Tweedie CLV with BG/NBD (REMEDIATION-PLAN P1).

    The Tweedie tree cannot isolate the few very high-frequency / high-revenue
    payers into pure leaves, so it pools them down and under-predicts whales.
    BG/NBD scales with monetary value (no ceiling), so for the top-decile tail
    take the higher of the two. Kept tight (top decile) because BG/NBD
    over-predicts the body. Tail is defined relatively (quantiles), so it adapts
    to any dataset scale; skipped on tiny runs where percentiles are unreliable.
    `tail_quantile` can be overridden via the model card's `clv_tail_quantile` field.
    """

    if len(tweedie_pred) < CLV_TAIL_MIN_POPULATION:
        return tweedie_pred

    tail = np.zeros(len(tweedie_pred), dtype=bool)
    fok = freq[np.isfinite(freq)]
    if fok.size:
        cut = max(float(np.quantile(fok, tail_quantile)), CLV_TAIL_MIN_FREQUENCY)
        tail |= np.nan_to_num(freq, nan=0.0) >= cut
    rok = revenue[np.isfinite(revenue)]
    if rok.size:
        tail |= np.nan_to_num(revenue, nan=0.0) >= float(
            np.quantile(rok, tail_quantile)
        )

    blended = tweedie_pred.copy()
    blended[tail] = np.maximum(tweedie_pred[tail], bg_clv[tail])
    return blended


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
        champion = model_object["champion"]
        if champion in ("lgbm_tweedie", "xgb_tweedie", "hurdle"):
            x = transform_features(features_raw[clv_mask], clv_bundle["preprocessor"])
            ml_obj = (
                model_object["tweedie"]
                if champion == "lgbm_tweedie"
                else model_object["xgb"]
                if champion == "xgb_tweedie"
                else model_object.get("hurdle")
            )
            if ml_obj is None:
                logger.warning(
                    "CLV champion is %s but model object is None; falling back to BG-NBD.",
                    champion,
                )
            else:
                ml_pred = np.clip(ml_obj.predict(x), 0, None)
                if bgnbd is not None and champion != "hurdle":
                    # BG-NBD tail blend only for point estimators — hurdle already models zeros.
                    # tail_quantile is configurable via model_card so future runs can tighten/widen.
                    tail_q = float(
                        clv_bundle.get("model_card", {}).get(
                            "clv_tail_quantile", CLV_TAIL_QUANTILE
                        )
                    )
                    ml_pred = _blend_clv_tail(
                        ml_pred,
                        bg_clv=eligible_acc.map(bg_pred["predicted_clv"])
                        .fillna(0.0)
                        .to_numpy(),
                        freq=pd.to_numeric(
                            features_raw["payment_count_all"], errors="coerce"
                        ).to_numpy()[clv_mask],
                        revenue=pd.to_numeric(
                            features_raw["total_revenue_all"], errors="coerce"
                        ).to_numpy()[clv_mask],
                        tail_quantile=tail_q,
                    )
                elif bgnbd is None and champion != "hurdle":
                    logger.warning(
                        "CLV champion is %s without a BG/NBD bundle; "
                        "high-value tail will be under-predicted (no hybrid correction).",
                        champion,
                    )
                # Apply OLS magnitude calibration: corrects systematic scale bias fitted on
                # validation at training time. Preserves ranking; improves RMSLE/MAE.
                mag_slope = float(model_object.get("magnitude_slope", 1.0))
                mag_intercept = float(model_object.get("magnitude_intercept", 0.0))
                ml_pred = np.clip(mag_slope * ml_pred + mag_intercept, 0.0, None)
                predicted[clv_mask] = ml_pred

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
        q30 = horizons[30].predict_quantiles(
            x, credit_anchor_log(features_raw[credit_mask], 30)
        )
        q90 = horizons[90].predict_quantiles(
            x, credit_anchor_log(features_raw[credit_mask], 90)
        )
        # The 30d and 90d quantiles come from independent heads, so a longer
        # horizon can occasionally fall below a shorter one. Cumulative usage is
        # non-decreasing in time, so enforce 90d >= 30d per quantile (cheap,
        # removes the ~3% cross-horizon inversions seen in the audit).
        p50_30 = np.asarray(q30[0.50], dtype=float)
        p10_30 = np.asarray(q30[0.10], dtype=float)
        p90_30 = np.asarray(q30[0.90], dtype=float)
        frame.loc[credit_mask, "predicted_credit_usage_30d"] = p50_30
        frame.loc[credit_mask, "predicted_credit_usage_90d"] = np.maximum(
            q90[0.50], p50_30
        )
        frame.loc[credit_mask, "credit_p10_30d"] = p10_30
        frame.loc[credit_mask, "credit_p90_30d"] = p90_30
        frame.loc[credit_mask, "credit_p10_90d"] = np.maximum(q90[0.10], p10_30)
        frame.loc[credit_mask, "credit_p90_90d"] = np.maximum(q90[0.90], p90_30)
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
        frame["n_purchases"] > 0,
        frame["total_revenue"] / frame["n_purchases"].clip(lower=1),
        np.nan,
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
    snapshot_source = customers.sort_values("acc_id").drop_duplicates(
        "acc_id", keep="last"
    )
    snapshot_source = snapshot_source.set_index(snapshot_source["acc_id"].astype(int))
    share_columns = [
        "sms_usage_share",
        "email_usage_share",
        "bc_usage_share",
        "api_usage_share",
        "otp_usage_share",
    ]

    # Dict lookup + records iteration instead of iterrows()/.loc per row (perf).
    snap_map = snapshot_source.to_dict("index")
    snapshot_cols = ["acc_id", "customer_age_days", "usage_total_180d", *share_columns]
    snapshots: list[dict[str, Any]] = []
    for row in frame[snapshot_cols].to_dict("records"):
        customer = snap_map.get(int(row["acc_id"]))
        snapshots.append(
            {
                "join_date": _date_or_none(customer["join_date"])
                if customer is not None
                else None,
                "customer_age_days": _int_or_none(row.get("customer_age_days")),
                "status_sms": _str_or_none(customer["status_sms"])
                if customer is not None
                else None,
                "status_email": _str_or_none(customer["status_email"])
                if customer is not None
                else None,
                "credit_sms": _float_or_zero(customer["credit_sms"])
                if customer is not None
                else 0.0,
                "credit_email": _float_or_zero(customer["credit_email"])
                if customer is not None
                else 0.0,
                "expire_sms": _date_or_none(customer["expire_sms"])
                if customer is not None
                else None,
                "expire_email": _date_or_none(customer["expire_email"])
                if customer is not None
                else None,
                "last_access": _date_or_none(customer["last_access"])
                if customer is not None
                else None,
                "last_send": _date_or_none(customer["last_send"])
                if customer is not None
                else None,
                **{
                    column: round(_float_or_zero(row.get(column)), 4)
                    for column in share_columns
                },
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
    active_mask = frame["lifecycle_stage"].isin(list(LifecycleStage.ACTIVE))
    clv = pd.to_numeric(frame["predicted_clv_6m"], errors="coerce")
    tier = pd.Series(ValueTier.NONE, index=frame.index, dtype="object")
    pool = active_mask & clv.notna() & (clv > 0)
    if pool.any():
        rank = clv[pool].rank(pct=True)
        tier.loc[pool] = np.select(
            [rank >= 0.90, rank >= 0.50],
            [ValueTier.HIGH, ValueTier.MID],
            default=ValueTier.LOW,
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
    credit_balance = pd.to_numeric(
        frame["credit_balance_total"], errors="coerce"
    ).fillna(0.0)
    heuristic_days = np.where(
        daily_burn > 0,
        np.minimum(np.ceil(credit_balance / daily_burn), TOPUP_CAP_DAYS),
        np.nan,
    )
    model_days = pd.to_numeric(frame["estimated_days_until_topup"], errors="coerce")
    days = np.where(model_days.notna(), model_days, heuristic_days)
    frame["estimated_days_until_topup"] = days

    urgency = pd.Series([None] * len(frame), index=frame.index, dtype="object")
    credit_eligible = frame["el_credit"]
    urgency.loc[credit_eligible] = UrgencyLevel.STABLE
    with_days = credit_eligible & pd.Series(days, index=frame.index).notna()
    days_series = pd.Series(days, index=frame.index)
    urgency.loc[with_days & (days_series <= 90)] = UrgencyLevel.MONITOR
    urgency.loc[with_days & (days_series <= 30)] = UrgencyLevel.WARNING
    urgency.loc[with_days & (days_series <= 14)] = UrgencyLevel.CRITICAL
    frame["credit_urgency_level"] = urgency

    # priority score (§5.2) — rank by expected money at risk. revenue_at_risk
    # (= churn × CLV) is the ranking key; the 0..100 priority_score is just a
    # log rescale of it for display, so sorting by priority_score equals sorting
    # by revenue_at_risk. No text reason is generated here — the numeric score is
    # the only priority signal; any human-readable "why" is produced by the AI
    # explanation from the underlying numbers/SHAP factors.
    var = (
        pd.to_numeric(frame["revenue_at_risk"], errors="coerce")
        .fillna(0.0)
        .clip(lower=0.0)
    )
    frame["priority_score"] = _display_score(var)

    # needs_review (§5.3) — surface the churn/p_alive disagreement. A valuable
    # customer whose recent usage has collapsed and whose p_alive is near zero
    # is at risk even when the churn score is low (it leans on long payment
    # history). Flag = high churn risk OR (valuable AND p_alive low AND usage
    # declining), so a human looks before we treat the low churn score as safe.
    risk_level = frame["churn_risk_level"].astype("object")
    p_alive = pd.to_numeric(frame["p_alive"], errors="coerce")
    usage_change = pd.to_numeric(frame.get("usage_change_90d_pct"), errors="coerce")
    valuable = frame["customer_value_tier"].isin([ValueTier.HIGH, ValueTier.MID])
    churn_at_risk = risk_level.isin([RiskLevel.HIGH, RiskLevel.CRITICAL])
    silent_decline = valuable & (p_alive < 0.20) & (usage_change < -0.10)
    needs_review = (churn_at_risk | silent_decline) & active_mask
    frame["needs_review"] = needs_review.fillna(False).astype(bool)

    frame = _apply_segments(frame)
    return frame


# Prioritization segments — value × health + sales-timing, see
# docs/CUSTOMER-SEGMENTS.md. Names/order are the single source in src.constants.


def _apply_segments(frame: pd.DataFrame) -> pd.DataFrame:
    """Assign a descriptive segment + a global priority_rank per customer (§5.4)."""

    tier = frame["customer_value_tier"]
    risk = frame["churn_risk_level"].astype("object")
    p_alive = pd.to_numeric(frame["p_alive"], errors="coerce")
    change = pd.to_numeric(frame.get("usage_change_90d_pct"), errors="coerce").fillna(
        0.0
    )

    stage = frame["lifecycle_stage"]
    sub_stage = frame["sub_stage"]
    valuable = tier.isin([ValueTier.HIGH, ValueTier.MID])
    at_risk = risk.isin([RiskLevel.HIGH, RiskLevel.CRITICAL]) | (p_alive < 0.20)
    watch = ~at_risk & (risk.eq(RiskLevel.MEDIUM) | (p_alive < 0.50))
    growing = change > 0.10

    is_churned = stage.eq(LifecycleStage.CHURNED)
    # Conditions are evaluated in priority order (first match wins). The
    # lifecycle checks come first, so churned/ghost rows never fall through to
    # the active value/health tiers below.
    conditions = [
        stage.eq(LifecycleStage.GHOST),
        is_churned & sub_stage.eq(SubStage.CHURNED_PAID),
        is_churned,
        valuable & at_risk,
        valuable & watch,
        valuable,
        at_risk,
        watch,
        growing,
    ]
    choices = [
        Segment.GHOST,
        Segment.REACTIVATE,
        Segment.DORMANT,
        Segment.PROTECT,
        Segment.STABILIZE,
        Segment.GROW,
        Segment.SALVAGE_LOW,
        Segment.WATCH_LOW,
        Segment.DEVELOP,
    ]
    frame["segment"] = np.select(conditions, choices, default=Segment.MAINTAIN)

    # Global priority_rank: by segment priority, then by money inside each segment
    # (revenue-at-risk for at-risk segments, forward CLV for stable/growth segments).
    seg_rank = frame["segment"].map({s: i for i, s in enumerate(Segment.ORDER)})
    rar = pd.to_numeric(frame["revenue_at_risk"], errors="coerce").fillna(0.0)
    clv = pd.to_numeric(frame["predicted_clv_6m"], errors="coerce").fillna(0.0)
    money = np.where(frame["segment"].isin(Segment.RETENTION), rar, clv)
    order = pd.DataFrame(
        {"seg": seg_rank.to_numpy(), "money": -money}, index=frame.index
    )
    ranked = order.sort_values(["seg", "money"]).index
    frame["priority_rank"] = pd.Series(range(1, len(frame) + 1), index=ranked).reindex(
        frame.index
    )
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
    major_drift_models: set[str] | None = None,
) -> list[dict[str, Any]]:
    major_drift_models = major_drift_models or set()
    _eligibility_col_map = {"churn": "el_churn", "clv": "el_clv", "credit": "el_credit"}
    model_versions_json = json.dumps(model_versions, ensure_ascii=False)
    rows: list[dict[str, Any]] = []
    # records iteration instead of iterrows() — same values, no per-row Series.
    for row in frame.to_dict("records"):
        eligibility = _eligibility_json(row)
        eligibility_dict = json.loads(eligibility)

        predicted_models = [
            model
            for model in eligibility_dict.values()
            if model["status"] == "predicted"
        ]
        eligible_unpredicted_models = [
            model
            for model in eligibility_dict.values()
            if model["eligible"] and model["status"] != "predicted"
        ]
        # Major PSI drift on a model that processed this customer → downgrade to PARTIAL
        # so downstream consumers know predictions may be unreliable.
        customer_drift_models = [
            mt
            for mt in major_drift_models
            if bool(row.get(_eligibility_col_map.get(mt, ""), False))
        ]
        has_major_drift = bool(customer_drift_models)

        if not predicted_models:
            output_status = OutputStatus.INSUFFICIENT_DATA
        elif eligible_unpredicted_models or has_major_drift:
            output_status = OutputStatus.PARTIAL
        else:
            output_status = OutputStatus.PREDICTED
        base_notes = _output_notes(eligibility_dict)
        drift_notes = [
            f"{mt}: major feature drift detected (PSI > 0.25) — predictions may be unreliable"
            for mt in sorted(customer_drift_models)
        ]
        all_note_parts = [
            n for n in ([base_notes] if base_notes else []) + drift_notes if n
        ]
        output_notes = "; ".join(all_note_parts) if all_note_parts else None

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
                "lifecycle_stage": _str_or_none(row["lifecycle_stage"]),
                "sub_stage": _str_or_none(row["sub_stage"]),
                "churn_probability": _round_or_none(row["churn_probability"], 4),
                "churn_risk_level": _str_or_none(row["churn_risk_level"]),
                "churn_factors_json": json.dumps(
                    row["churn_factors"], ensure_ascii=False
                )
                if row["churn_factors"] is not None
                else None,
                "predicted_clv_6m": _round_or_none(row["predicted_clv_6m"], 2),
                "p_alive": _round_or_none(row["p_alive"], 4),
                "customer_value_tier": _str_or_none(row["customer_value_tier"]),
                "revenue_at_risk": _round_or_none(row["revenue_at_risk"], 2),
                "predicted_credit_usage_30d": _round_or_none(
                    row["predicted_credit_usage_30d"], 2
                ),
                "predicted_credit_usage_90d": _round_or_none(
                    row["predicted_credit_usage_90d"], 2
                ),
                "credit_forecast_interval_json": interval,
                "estimated_days_until_topup": _int_or_none(
                    row["estimated_days_until_topup"]
                ),
                "credit_urgency_level": _str_or_none(row["credit_urgency_level"]),
                "usage_trend": _str_or_none(row["usage_trend"]),
                "days_since_last_activity": _int_or_none(
                    row["days_since_last_activity"]
                ),
                "n_purchases": int(row["n_purchases"]),
                "total_revenue": _round_or_none(row["total_revenue"], 2) or 0.0,
                "avg_transaction_value": _round_or_none(
                    row["avg_transaction_value"], 2
                ),
                "ever_paid": bool(row["ever_paid"]),
                "priority_score": _round_or_none(row["priority_score"], 2) or 0.0,
                "segment": _str_or_none(row.get("segment")),
                "priority_rank": _int_or_none(row.get("priority_rank")),
                "needs_review": bool(row.get("needs_review", False)),
                "output_status": output_status,
                "output_notes": output_notes,
                "model_eligibility_json": eligibility,
                "model_versions_json": model_versions_json,
                "profile_snapshot_json": json.dumps(
                    row["profile_snapshot"], ensure_ascii=False
                ),
            }
        )
    return rows


def _eligibility_json(row: dict[str, Any]) -> str:
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
        if (
            eligible
            and predicted_value is not None
            and not (isinstance(predicted_value, float) and math.isnan(predicted_value))
        ):
            return {"eligible": True, "status": "predicted", "reason": reason}
        if eligible:
            return {
                "eligible": True,
                "status": "insufficient_data",
                "reason": "ข้อมูลไม่พอประเมิน",
            }
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
    "prediction_run_id",
    "acc_id",
    "lifecycle_stage",
    "sub_stage",
    "churn_probability",
    "churn_risk_level",
    "churn_factors_json",
    "predicted_clv_6m",
    "p_alive",
    "customer_value_tier",
    "revenue_at_risk",
    "predicted_credit_usage_30d",
    "predicted_credit_usage_90d",
    "credit_forecast_interval_json",
    "estimated_days_until_topup",
    "credit_urgency_level",
    "usage_trend",
    "days_since_last_activity",
    "n_purchases",
    "total_revenue",
    "avg_transaction_value",
    "ever_paid",
    "priority_score",
    "segment",
    "priority_rank",
    "needs_review",
    "output_status",
    "output_notes",
    "model_eligibility_json",
    "model_versions_json",
    "profile_snapshot_json",
]


def _replace_outputs(prediction_run_id: str, rows: list[dict[str, Any]]) -> None:
    # Contract guard: every key built per row must be persisted, and every
    # persisted column must be built. This catches the silent class of bug where
    # a derived field (e.g. segment/priority_rank/needs_review) is computed but
    # missing from OUTPUT_COLUMNS, so it never reaches the table.
    if rows:
        produced = set(rows[0].keys())
        declared = set(OUTPUT_COLUMNS)
        missing = sorted(declared - produced)
        dropped = sorted(produced - declared)
        if missing or dropped:
            raise RuntimeError(
                "Output column contract drift — "
                f"declared but not produced: {missing}; "
                f"produced but not persisted: {dropped}"
            )
    placeholders = ", ".join(
        f":{column}"
        if column
        not in (
            "prediction_run_id",
            "churn_factors_json",
            "credit_forecast_interval_json",
            "model_eligibility_json",
            "model_versions_json",
            "profile_snapshot_json",
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
    upsert_set = ", ".join(
        f"{col} = EXCLUDED.{col}"
        for col in OUTPUT_COLUMNS
        if col not in ("prediction_run_id", "acc_id")
    )
    insert_sql = text(
        f"INSERT INTO ml_prediction_outputs ({', '.join(OUTPUT_COLUMNS)}) VALUES ({placeholders})"
        f" ON CONFLICT (prediction_run_id, acc_id) DO UPDATE SET {upsert_set}"
    )
    with create_engine(database_url()).begin() as conn:
        conn.execute(
            text(
                "DELETE FROM ml_prediction_outputs WHERE prediction_run_id = CAST(:id AS UUID)"
            ),
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
        row = (
            conn.execute(
                text(
                    """
                SELECT id::text, predict_source_id::text, status, cutoff_date, created_by,
                       model_overrides_json
                FROM ml_prediction_runs WHERE id = CAST(:id AS UUID)
                """
                ),
                {"id": prediction_run_id},
            )
            .mappings()
            .first()
        )
    if row is None:
        raise RuntimeError(f"Prediction run {prediction_run_id} not found")
    return dict(row)


def _update_run(
    prediction_run_id: str,
    *,
    status: str | None = None,
    progress: dict[str, Any] | None = None,
    error_message: str | None = _UNSET,  # type: ignore[assignment]
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
    if error_message is not _UNSET:
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
            text(
                f"UPDATE ml_prediction_runs SET {', '.join(sets)} WHERE id = CAST(:id AS UUID)"
            ),
            params,
        )


# ── Scalar helpers ───────────────────────────────────────────────


def _round_or_none(value: Any, digits: int) -> float | None:
    if (
        value is None
        or (isinstance(value, float) and math.isnan(value))
        or pd.isna(value)
    ):
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
        return (
            round(value.item(), 4) if isinstance(value, np.floating) else value.item()
        )
    if isinstance(value, float):
        return round(value, 4)
    return value
