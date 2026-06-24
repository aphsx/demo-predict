"""End-to-end training run orchestrator (TRAINING-PIPELINE §2).

One call = one row in `ml_training_runs` driven to completed/failed:
gates → labels/features → split → baselines + candidates (Optuna) →
calibration → evaluation → leakage suite → multi-cutoff backtest →
promotion gate → artifacts + registry + production alias.
"""

from __future__ import annotations

import io
import json
import logging
from contextlib import redirect_stdout
from typing import Any, Callable

import numpy as np
import pandas as pd

from src.training import promotion
from src.training import repository
from src.training.artifacts import save_artifacts, verify_artifact_load
from src.training.baselines import (
    CHURN_BASELINE_NAMES,
    CLV_BASELINE_NAMES,
    CREDIT_BASELINE_NAMES,
)
from src.training.churn_trainer import (
    finalize_churn_candidate,
    refit_for_backtest,
    train_churn_candidates,
)
from src.training.clv_trainer import backtest_clv, train_clv
from src.training.credit_trainer import backtest_credit, train_credit
from src.training.data import load_train_clean
from src.training.drift import build_feature_baseline
from src.training.datasets import (
    CutoffDatasets,
    adaptive_backtest_cutoffs,
    build_cutoff_datasets,
    month_start,
    pool_train_rows,
)
from src.training.features import build_feature_set_contract
from src.training.labels import LabelConfig
from src.training.leakage import run_leakage_suite, run_regression_leakage_suite
from src.training.metrics import churn_metrics, round_metrics
from src.training.preprocessing import fit_preprocessor
from src.training.registry import (
    current_champion,
    insert_evaluation,
    insert_model_version,
    next_version,
    promote_model_version,
    update_training_run,
    load_training_run,
)
from src.training.validation import (
    ValidationCheck,
    ValidationReport,
    check_train_cutoff_feasibility,
    check_train_feature_leakage,
    check_train_label_viability,
    check_train_schema_quality,
    check_train_source_readiness,
)

logger = logging.getLogger(__name__)

ECE_LIMIT = 0.05
# Two-stage churn promotion (promotion.py). Ranking (PR-AUC) is the primary
# objective; calibration is a guardrail — a loose SAFETY ceiling (egregious
# miscalibration is rejected) plus a soft penalty above the desired target, NOT
# a hairline veto. So the best-ranking, recalibrated candidate wins instead of
# being knocked out by a noise-sized ECE miss.
CHURN_PROMOTION_CONFIG = promotion.PromotionConfig(
    primary_metric="pr_auc",
    higher_is_better=True,
    champion_margin=0.0,
    stability_max_rel_drop=0.30,
    calibration_ceiling=0.10,
    calibration_target=ECE_LIMIT,
    calibration_penalty=1.0,
)
CLV_PROMOTION_CONFIG = promotion.PromotionConfig(
    primary_metric="spearman",
    higher_is_better=True,
    champion_margin=0.0,
    stability_max_rel_drop=0.30,
    calibration_ceiling=None,
    calibration_target=None,
)
# Coverage must be in (0.75, 0.90]. calibration_error = max(0, coverage − 0.90):
#   if coverage ≤ 0.90 → calibration_error = 0.0 → passes the safety ceiling
#   if coverage > 0.90 → calibration_error > 0 > CEILING (0.001) → rejected
# The lower bound (0.75) is enforced via baseline_validation in CandidateEval.
CREDIT_PROMOTION_CONFIG = promotion.PromotionConfig(
    primary_metric="coverage_p10_p90",
    higher_is_better=True,
    champion_margin=0.0,
    stability_max_rel_drop=0.25,
    calibration_ceiling=0.001,
    calibration_target=None,
    calibration_penalty=0.0,
)
COVERAGE_RANGE = (0.75, 0.90)
BACKTEST_COVERAGE_RANGE = (0.70, 0.92)
CREDIT_MAE_TOLERANCE = 1.10
BACKTEST_STEP_MONTHS = 2
# Backtest count adapts to the uploaded data span (§3): every step-month
# cutoff with ≥MIN_BACKTEST_HISTORY_DAYS of history and a full label window
# is used, capped at MAX_BACKTESTS for runtime.
MAX_BACKTESTS = 6
MIN_BACKTEST_HISTORY_DAYS = 365
# Credit labels need only 30/90d of post-cutoff data, so credit trains at its
# own fresher month-aligned cutoff instead of wasting the newest months on the
# churn/CLV 180d horizon.
CREDIT_LABEL_WINDOW_DAYS = 90


def _activity_range(payments: pd.DataFrame, usage: pd.DataFrame) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Min/max activity dates (payments + positive usage), matching the label
    definition of activity in labels.py."""

    dates = pd.concat(
        [
            payments.loc[payments["payment_date"].notna(), "payment_date"],
            usage.loc[(usage["usage"] > 0) & usage["period"].notna(), "period"],
        ],
        ignore_index=True,
    )
    if dates.empty:
        raise RuntimeError("No payment or usage activity found for this source")
    return pd.Timestamp(dates.min()), pd.Timestamp(dates.max())


def run_training(training_run_id: str) -> None:
    """Execute one full training run; never leaves the row `in_progress`."""

    log_buffer = io.StringIO()
    try:
        with redirect_stdout(log_buffer):
            _run_training_inner(training_run_id, log_buffer)
    except Exception as exc:  # noqa: BLE001 - §2: every failure ends at status=failed.
        logger.exception("training run %s failed", training_run_id)
        update_training_run(
            training_run_id,
            status="failed",
            error_message=f"{type(exc).__name__}: {exc}",
            progress={"phase": "failed", "pct": 100},
            mark_finished=True,
        )
        raise


def _run_training_inner(training_run_id: str, log_buffer: io.StringIO) -> None:
    run = load_training_run(training_run_id)
    source_id = run["source_id"]
    cutoff = pd.Timestamp(run["cutoff_date"])
    if cutoff != month_start(cutoff):
        raise ValueError(
            f"cutoff_date {cutoff.date()} ไม่ตรงต้นเดือน — usage มี granularity รายเดือน "
            "cutoff กลางเดือนทำให้ feature เห็น usage หลัง cutoff (leak) — "
            "ใช้ suggested cutoff จาก API หรือ snap เป็นวันที่ 1 ของเดือน"
        )
    horizon_days = int(run["horizon_days"])
    created_by = run.get("created_by")
    label_config = LabelConfig(cutoff_date=cutoff, horizon_days=horizon_days)

    def progress(phase: str, pct: int) -> None:
        print(f"[progress] {pct:3d}% {phase}")
        update_training_run(training_run_id, progress={"phase": phase, "pct": pct})

    update_training_run(
        training_run_id,
        status="in_progress",
        mark_started=True,
        training_config={
            "cutoff_date": str(cutoff.date()),
            "horizon_days": horizon_days,
            "seed": 42,
            "backtest_step_months": BACKTEST_STEP_MONTHS,
            "max_backtests": MAX_BACKTESTS,
        },
    )
    progress("gates", 3)

    # ── Gates 1–5 (§2 steps 3–5) ──────────────────────────────────
    gate_reports = [
        check_train_source_readiness(source_id),
        check_train_schema_quality(source_id),
        check_train_cutoff_feasibility(source_id, label_config),
        check_train_label_viability(source_id, label_config),
        check_train_feature_leakage(source_id, cutoff),
    ]
    for report in gate_reports:
        repository.save_validation_report(report, training_run_id=training_run_id)
    failed_gates = [r for r in gate_reports if r.status == "failed"]
    if failed_gates:
        names = ", ".join(f"{r.validation_type}" for r in failed_gates)
        raise RuntimeError(f"Quality gates failed: {names}")
    print(f"Gates 1–5 passed ({len(gate_reports)} reports)")

    # ── Data + datasets (§2 steps 2, 6–7) ─────────────────────────
    progress("features", 8)
    customers, payments, usage = load_train_clean(source_id)
    activity_min, activity_max = _activity_range(payments, usage)
    datasets_c1 = build_cutoff_datasets(customers, payments, usage, cutoff, horizon_days)
    print(
        f"C1={cutoff.date()} churn n={len(datasets_c1.churn.frame)} "
        f"clv n={len(datasets_c1.clv.frame)} credit n={len(datasets_c1.credit.frame)}"
    )

    progress("backtest datasets", 12)
    backtest_dates = adaptive_backtest_cutoffs(
        cutoff,
        activity_min,
        activity_max,
        label_window_days=horizon_days,
        step_months=BACKTEST_STEP_MONTHS,
        max_backtests=MAX_BACKTESTS,
        min_history_days=MIN_BACKTEST_HISTORY_DAYS,
    )
    if not backtest_dates:
        print(
            "WARNING: data span supports no backtest cutoffs — model stability "
            "across time is unverified for this run."
        )
    backtest_sets: list[CutoffDatasets] = []
    for old_cutoff in backtest_dates:
        try:
            backtest_sets.append(
                build_cutoff_datasets(customers, payments, usage, old_cutoff, horizon_days)
            )
        except Exception as exc:  # noqa: BLE001 - an infeasible old cutoff shrinks the backtest.
            print(f"backtest cutoff {old_cutoff.date()} skipped: {exc}")

    # ── Credit datasets at credit's own fresher cutoff ────────────
    credit_cutoff = month_start(activity_max - pd.Timedelta(days=CREDIT_LABEL_WINDOW_DAYS))
    datasets_credit = datasets_c1
    credit_backtest_sets = backtest_sets
    if credit_cutoff > cutoff:
        try:
            datasets_credit = build_cutoff_datasets(
                customers, payments, usage, credit_cutoff, horizon_days
            )
            credit_backtest_sets = []
            for old_cutoff in adaptive_backtest_cutoffs(
                credit_cutoff,
                activity_min,
                activity_max,
                label_window_days=CREDIT_LABEL_WINDOW_DAYS,
                step_months=BACKTEST_STEP_MONTHS,
                max_backtests=MAX_BACKTESTS,
                min_history_days=MIN_BACKTEST_HISTORY_DAYS,
            ):
                try:
                    credit_backtest_sets.append(
                        build_cutoff_datasets(customers, payments, usage, old_cutoff, horizon_days)
                    )
                except Exception as exc:  # noqa: BLE001 - infeasible old cutoff shrinks the backtest.
                    print(f"credit backtest cutoff {old_cutoff.date()} skipped: {exc}")
            print(f"credit C1={credit_cutoff.date()} n={len(datasets_credit.credit.frame)}")
        except Exception as exc:  # noqa: BLE001 - fall back to the shared cutoff.
            print(f"credit cutoff {credit_cutoff.date()} infeasible ({exc}); using shared C1")
            datasets_credit = datasets_c1
            credit_backtest_sets = backtest_sets
            credit_cutoff = cutoff
    else:
        credit_cutoff = cutoff

    from src.training.churn_trainer import _resolve_candidates
    update_training_run(
        training_run_id,
        training_config={
            "cutoff_date": str(cutoff.date()),
            "horizon_days": horizon_days,
            "seed": 42,
            "backtest_step_months": BACKTEST_STEP_MONTHS,
            "max_backtests": MAX_BACKTESTS,
            "min_backtest_history_days": MIN_BACKTEST_HISTORY_DAYS,
            "activity_range": [str(activity_min.date()), str(activity_max.date())],
            "backtest_cutoffs": [str(b.cutoff_date.date()) for b in backtest_sets],
            "credit_cutoff_date": str(credit_cutoff.date()),
            "credit_backtest_cutoffs": [str(b.cutoff_date.date()) for b in credit_backtest_sets],
            "churn_candidates": _resolve_candidates(None),
        },
    )

    results: list[dict[str, Any]] = []

    # ── Churn ─────────────────────────────────────────────────────
    results.append(
        _train_and_register_churn(
            training_run_id, datasets_c1, backtest_sets, horizon_days, created_by, progress
        )
    )

    # ── CLV ───────────────────────────────────────────────────────
    results.append(
        _train_and_register_clv(
            training_run_id, datasets_c1, backtest_sets, payments, horizon_days, created_by, progress
        )
    )

    # ── Credit ────────────────────────────────────────────────────
    results.append(
        _train_and_register_credit(
            training_run_id, datasets_credit, credit_backtest_sets, horizon_days, created_by, progress
        )
    )

    progress("completed", 100)
    update_training_run(
        training_run_id,
        status="completed",
        results=results,
        mark_finished=True,
    )
    print("Training run completed.")


# ── Churn ────────────────────────────────────────────────────────


def _train_and_register_churn(
    training_run_id: str,
    datasets: CutoffDatasets,
    backtest_sets: list[CutoffDatasets],
    horizon_days: int,
    created_by: str | None,
    progress: Callable[[str, int], None],
) -> dict[str, Any]:
    progress("churn: baselines + candidates (Optuna)", 15)
    dataset = datasets.churn
    preprocessor = fit_preprocessor(
        dataset.features("train"), _feature_schema_for_dataset(datasets, dataset)
    )
    training = train_churn_candidates(dataset, preprocessor, progress=lambda m: print(m), candidates=None)
    source_id = source_id_of(training_run_id)

    # ── Evaluate EVERY candidate, then apply the two-stage promotion policy ──
    # (promotion.py) §8: Stage 1 safety gates decide eligibility (leakage,
    # beats trivial baselines, beats incumbent on aggregate, stability,
    # calibration safety ceiling); Stage 2 picks the best ELIGIBLE candidate by
    # a ranking-first composite. No early break — the champion is the best model
    # on quality, not the first that squeaks past a hairline threshold.
    progress("churn: evaluate candidates + promotion policy", 35)
    incumbent_backtests = _incumbent_backtests("churn")
    attempts: list[dict[str, Any]] = []
    for attempt_index, candidate in enumerate(training.candidates):
        print(f"churn: evaluating candidate {candidate.name} (#{attempt_index + 1})")
        result = finalize_churn_candidate(training, candidate, progress=lambda m: print(m))
        leakage = run_leakage_suite(
            dataset, preprocessor, candidate, result.validation_metrics["roc_auc"]
        )
        backtest_rows: list[dict[str, Any]] = []
        for bt in backtest_sets:
            bt_preproc = fit_preprocessor(
                bt.churn.features("train"), _feature_schema_for_dataset(bt, bt.churn)
            )
            y_test, probs, raw_scores, high_thr = refit_for_backtest(candidate, bt.churn, bt_preproc)
            backtest_rows.append(
                {
                    "cutoff_date": str(bt.cutoff_date.date()),
                    "metrics": round_metrics(
                        churn_metrics(y_test, probs, threshold=high_thr, ranking_scores=raw_scores)
                    ),
                    "baselines": _churn_backtest_baselines(bt, bt_preproc, high_thr),
                }
            )
        attempts.append(
            {
                "candidate": candidate,
                "result": result,
                "leakage": leakage,
                "backtest_rows": backtest_rows,
            }
        )

    by_name = {a["candidate"].name: a for a in attempts}
    decision = promotion.decide(
        [_churn_candidate_eval(a, incumbent_backtests) for a in attempts],
        CHURN_PROMOTION_CONFIG,
    )

    selection_log = [
        {
            "candidate": d.name,
            "cv_pr_auc": training.competition[d.name],
            "test_pr_auc": by_name[d.name]["result"].test_metrics["pr_auc"],
            "ece": by_name[d.name]["result"].test_metrics["ece"],
            "eligible": d.eligible,
            "composite": round(d.composite, 4),
            # gate_passed = passed the safety gate (eligible). The champion is the
            # best eligible candidate (is_champion); both surface on the web.
            "gate_passed": d.eligible,
            "is_champion": d.name == decision.winner,
            "reason": (
                "🏆 champion — " + decision.summary
                if d.name == decision.winner
                else ("ผ่าน safety gate (แต่ไม่ใช่ตัวที่ดีที่สุด)" if d.eligible else "ไม่ผ่าน: " + "; ".join(d.reasons))
            ),
        }
        for d in decision.candidates
    ]
    for entry in selection_log:
        print(f"churn: {entry['candidate']} eligible={entry['eligible']} champion={entry['is_champion']} — {entry['reason']}")

    # Winner = best eligible candidate. If none is eligible, keep the incumbent
    # champion but still record the strongest candidate as a non-promoted version.
    if decision.winner is not None:
        selected = by_name[decision.winner]
    else:
        best = max(decision.candidates, key=lambda d: d.composite)
        selected = by_name[best.name]

    result = selected["result"]
    leakage = selected["leakage"]
    backtest_rows = selected["backtest_rows"]
    _save_leakage_report(
        training_run_id, source_id, datasets.cutoff_date, "churn",
        int(len(dataset.frame)), leakage,
    )

    progress("churn: artifacts + registry", 48)
    # Headline baseline = best baseline of a DIFFERENT algorithm. When the
    # champion is the LR candidate, comparing it against the LR baseline reads
    # as "model loses to baseline" when they are the same model class.
    comparable = [
        name for name in CHURN_BASELINE_NAMES if name != result.champion.name
    ] or CHURN_BASELINE_NAMES
    baseline_best_test = max(
        result.baseline_metrics[name]["test"]["pr_auc"] for name in comparable
    )
    baseline_best_name = max(
        comparable, key=lambda name: result.baseline_metrics[name]["test"]["pr_auc"]
    )

    version = next_version("churn")
    feature_contract = build_feature_set_contract(
        datasets.feature_result,
        name="tier_a_24",
        version="v1",
        model_type="churn",
        feature_names=dataset.feature_names,
    )
    feature_set_id = repository.save_feature_set_contract(feature_contract)

    model_card = {
        "model_type": "churn",
        "version": version,
        "method": "LightGBM + calibration + SHAP" if result.champion.name == "lightgbm" else result.champion.name,
        "algorithm": result.champion.name,
        "cutoff_date": str(datasets.cutoff_date.date()),
        "horizon_days": horizon_days,
        "dataset_rows": int(len(dataset.frame)),
        "positive_rate": result.test_metrics["positive_rate"],
        "feature_set": f"{feature_contract.name}/{feature_contract.version}",
        "feature_code_hash": feature_contract.feature_code_hash,
        "params": _plain(result.champion.params),
        "candidate_competition_cv_pr_auc": result.competition,
        "candidate_selection": selection_log,
        "calibration_method": result.calibrator.method,
        "calibration_ece_test": result.test_metrics["ece"],
        "thresholds": result.thresholds,
        "primary_metric": {
            "name": "PR-AUC",
            "value": result.test_metrics["pr_auc"],
            "baseline": baseline_best_test,
            "baseline_name": baseline_best_name,
        },
        "backtests": backtest_rows,
        "leakage": leakage,
        "limitations": "ใช้ได้กับลูกค้า Active Paid เท่านั้น (กลุ่มอื่น not eligible ตาม contract)",
        "trained_by": created_by,
    }

    artifact_path, checksum = save_artifacts(
        model_type="churn",
        version=version,
        model_object=result.champion.model,
        preprocessor=preprocessor,
        feature_names=dataset.feature_names,
        metrics={
            "validation": result.validation_metrics,
            "test": result.test_metrics,
            "backtests": backtest_rows,
            "baselines": result.baseline_metrics,
        },
        model_card=model_card,
        calibrator=result.calibrator,
        thresholds=result.thresholds,
        feature_baseline=build_feature_baseline(
            dataset.features("train"), dataset.feature_names, datasets.cutoff_date
        ),
    )

    version_id = insert_model_version(
        training_run_id=training_run_id,
        feature_set_id=feature_set_id,
        model_type="churn",
        version=version,
        artifact_path=artifact_path,
        artifact_checksum=checksum,
        metrics=round_metrics(result.test_metrics),
        validation_metrics=round_metrics(result.validation_metrics),
        test_metrics=round_metrics(result.test_metrics),
        feature_names=dataset.feature_names,
        label_definition={
            "label": "churned = no payment and no positive usage in horizon",
            "population": "Active Paid at cutoff",
            "horizon_days": horizon_days,
        },
        training_data_snapshot={
            "rows": int(len(dataset.frame)),
            "splits": {s: int((dataset.frame["split"] == s).sum()) for s in ("train", "validation", "test")},
            "positive_rate": result.test_metrics["positive_rate"],
        },
        model_card=model_card,
    )

    # Evaluations: champion holdout + backtests, baselines per split
    insert_evaluation(
        model_version_id=version_id, training_run_id=training_run_id, model_type="churn",
        evaluation_type="holdout", dataset_split="validation",
        metrics=round_metrics(result.validation_metrics),
        cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
        feature_set_id=feature_set_id,
    )
    # Flatten bootstrap CIs for key metrics into the test metrics dict so they
    # are persisted without a schema change. Full CI dict lives in test_ci_json.
    test_metrics_persisted = dict(round_metrics(result.test_metrics))
    if result.test_ci_json:
        for _k in ("pr_auc", "roc_auc", "brier", "bss", "log_loss"):
            if _k in result.test_ci_json:
                _ci = result.test_ci_json[_k]
                test_metrics_persisted[f"{_k}_ci_lower"] = _ci["ci_lower"]
                test_metrics_persisted[f"{_k}_ci_upper"] = _ci["ci_upper"]

    # Extend calibration JSON with Hosmer-Lemeshow result (no schema change needed).
    calibration_persisted = {
        **result.calibration_json,
        **({"hosmer_lemeshow": result.hosmer_lemeshow_json} if result.hosmer_lemeshow_json else {}),
    }

    insert_evaluation(
        model_version_id=version_id, training_run_id=training_run_id, model_type="churn",
        evaluation_type="holdout", dataset_split="test",
        metrics=test_metrics_persisted,
        cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
        feature_set_id=feature_set_id,
        confusion_matrix=result.confusion_json,
        calibration=calibration_persisted,
        lift_table=result.lift_table_json,
        feature_importance=result.feature_importance,
    )
    for row in backtest_rows:
        insert_evaluation(
            model_version_id=version_id, training_run_id=training_run_id, model_type="churn",
            evaluation_type="backtest", dataset_split="backtest",
            metrics=row["metrics"], cutoff_date=row["cutoff_date"], horizon_days=horizon_days,
            feature_set_id=feature_set_id,
        )
        for baseline_name, metrics in row["baselines"].items():
            insert_evaluation(
                model_version_id=version_id, training_run_id=training_run_id, model_type="churn",
                evaluation_type="baseline", dataset_split="backtest",
                metrics=round_metrics(metrics), cutoff_date=row["cutoff_date"],
                horizon_days=horizon_days, baseline_name=baseline_name,
            )
    for baseline_name, splits in result.baseline_metrics.items():
        for split_name, metrics in splits.items():
            insert_evaluation(
                model_version_id=version_id, training_run_id=training_run_id, model_type="churn",
                evaluation_type="baseline", dataset_split=split_name,
                metrics=round_metrics(metrics), cutoff_date=str(datasets.cutoff_date.date()),
                horizon_days=horizon_days, baseline_name=baseline_name,
            )

    # Artifact load is the final safety gate — verified only for the chosen
    # winner (we don't serialize losing candidates). A winner whose artifact
    # can't reload is unsafe: do not promote, keep the incumbent.
    artifact_ok = verify_artifact_load(artifact_path, dataset.features("test").head(5))
    promote = decision.winner is not None and artifact_ok
    if decision.winner is not None and not artifact_ok:
        reason = "ไม่ promote — artifact load test ไม่ผ่าน (safety gate)"
    else:
        reason = decision.summary
    if promote:
        promote_model_version(
            model_type="churn", model_version_id=version_id, reason=reason, created_by=created_by
        )
    print(f"churn: promoted={promote} — {reason}")

    return {
        "model_type": "churn",
        "primary_metric_name": "PR-AUC",
        "primary_metric_value": result.test_metrics["pr_auc"],
        "baseline_name": baseline_best_name,
        "baseline_value": baseline_best_test,
        "calibration_ece": result.test_metrics["ece"],
        "leakage_passed": bool(leakage["passed"]),
        "promoted": promote,
        "promote_reason": reason,
        "new_version": version if promote else None,
    }


def _incumbent_backtests(model_type: str) -> dict[str, float] | None:
    """The current champion's per-cutoff backtest PR-AUC, for apples-to-apples
    comparison. None when there is no incumbent or no stored backtests."""

    champion = current_champion(model_type)
    if champion is None:
        return None
    card = champion.get("model_card_json") or {}
    if isinstance(card, str):
        card = json.loads(card)
    rows = card.get("backtests", []) or []
    out = {
        row["cutoff_date"]: row["metrics"]["pr_auc"]
        for row in rows
        if isinstance(row.get("metrics"), dict) and "pr_auc" in row["metrics"]
    }
    return out or None


def _incumbent_backtests_by_metric(model_type: str, metric_key: str) -> dict[str, float] | None:
    """Per-cutoff backtest metric for the current champion, keyed by cutoff date string.

    Parallel to _incumbent_backtests() but parameterised on metric_key so it works
    for any model type (CLV → spearman, Credit → coverage_p10_p90).
    """
    champion = current_champion(model_type)
    if champion is None:
        return None
    card = champion.get("model_card_json") or {}
    if isinstance(card, str):
        card = json.loads(card)
    rows = card.get("backtests", []) or []
    out = {
        row["cutoff_date"]: row["metrics"][metric_key]
        for row in rows
        if isinstance(row.get("metrics"), dict) and metric_key in row["metrics"]
    }
    return out or None


def _churn_candidate_eval(
    attempt: dict[str, Any],
    incumbent_backtests: dict[str, float] | None,
) -> promotion.CandidateEval:
    """Build a promotion.CandidateEval from one finalized churn candidate.

    Baselines compared against EXCLUDE the same-named baseline (a candidate
    cannot be required to strictly beat itself — e.g. the logistic candidate vs
    the logistic baseline)."""

    candidate = attempt["candidate"]
    result = attempt["result"]
    backtest_rows = attempt["backtest_rows"]
    comparable = [name for name in CHURN_BASELINE_NAMES if name != candidate.name]

    def baseline_best(split: str) -> float:
        return max(result.baseline_metrics[name][split]["pr_auc"] for name in comparable)

    primary_backtests = {row["cutoff_date"]: row["metrics"]["pr_auc"] for row in backtest_rows}
    baseline_backtests = {
        row["cutoff_date"]: max(
            row["baselines"][name]["pr_auc"] for name in comparable if name in row["baselines"]
        )
        for row in backtest_rows
    }
    # Extract bootstrap CI on the primary (PR-AUC) test metric if available.
    test_ci: tuple[float, float] | None = None
    if result.test_ci_json and "pr_auc" in result.test_ci_json:
        ci = result.test_ci_json["pr_auc"]
        test_ci = (float(ci["ci_lower"]), float(ci["ci_upper"]))

    return promotion.CandidateEval(
        name=candidate.name,
        leakage_ok=bool(attempt["leakage"]["passed"]),
        artifact_ok=True,  # the winner's artifact is verified post-write
        primary_validation=result.validation_metrics["pr_auc"],
        primary_test=result.test_metrics["pr_auc"],
        baseline_validation=baseline_best("validation"),
        baseline_test=baseline_best("test"),
        primary_backtests=primary_backtests,
        baseline_backtests=baseline_backtests,
        champion_backtests=incumbent_backtests,
        calibration_error=result.test_metrics["ece"],
        primary_test_ci=test_ci,
    )


def _churn_backtest_baselines(
    bt: CutoffDatasets,
    preprocessor: Any,
    threshold: float,
) -> dict[str, dict[str, float]]:
    from src.training.baselines import (
        ChurnLogisticBaseline,
        churn_recency_rule_scores,
        churn_rfm_quartile_scores,
    )

    dataset = bt.churn
    y_train = np.asarray(dataset.labels("train", "churn_label"), dtype=int)
    y_test = np.asarray(dataset.labels("test", "churn_label"), dtype=int)
    test_features = dataset.features("test")
    logistic = ChurnLogisticBaseline(preprocessor).fit(dataset.features("train"), pd.Series(y_train))
    scores = {
        "recency_rule_90d": churn_recency_rule_scores(test_features),
        "rfm_quartile": churn_rfm_quartile_scores(test_features),
        "logistic_regression": logistic.predict_proba(test_features),
    }
    return {
        name: round_metrics(churn_metrics(y_test, score, threshold=threshold))
        for name, score in scores.items()
    }


# ── CLV ──────────────────────────────────────────────────────────


def _train_and_register_clv(
    training_run_id: str,
    datasets: CutoffDatasets,
    backtest_sets: list[CutoffDatasets],
    payments: pd.DataFrame,
    horizon_days: int,
    created_by: str | None,
    progress: Callable[[str, int], None],
) -> dict[str, Any]:
    progress("clv: candidates (BG-NBD vs Tweedie)", 55)
    dataset = datasets.clv
    preprocessor = fit_preprocessor(
        dataset.features("train"), _feature_schema_for_dataset(datasets, dataset)
    )
    result = train_clv(
        dataset, payments, datasets.cutoff_date, horizon_days, preprocessor,
        progress=lambda m: print(m),
    )

    progress("clv: backtests", 65)
    backtest_rows: list[dict[str, Any]] = []
    for bt in backtest_sets:
        bt_preproc = fit_preprocessor(
            bt.clv.features("train"), _feature_schema_for_dataset(bt, bt.clv)
        )
        champion_metrics, baseline_metrics = backtest_clv(
            result, bt.clv, payments, bt.cutoff_date, horizon_days, bt_preproc
        )
        backtest_rows.append(
            {
                "cutoff_date": str(bt.cutoff_date.date()),
                "metrics": round_metrics(champion_metrics),
                "baselines": baseline_metrics,
            }
        )
        print(f"clv backtest {bt.cutoff_date.date()}: spearman {champion_metrics['spearman']}")

    progress("clv: leakage tests", 68)
    leakage = run_regression_leakage_suite(dataset, preprocessor, ["future_revenue_6m"])
    _save_leakage_report(
        training_run_id, source_id_of(training_run_id), datasets.cutoff_date, "clv",
        int(len(dataset.frame)), leakage,
    )
    print(f"clv: leakage suite passed={leakage['passed']}")

    baseline_best_test = max(
        result.baseline_metrics[name]["test"]["spearman"] for name in CLV_BASELINE_NAMES
    )
    baseline_best_name = max(
        CLV_BASELINE_NAMES, key=lambda name: result.baseline_metrics[name]["test"]["spearman"]
    )

    # ── CLV promotion gate (two-stage safety/quality policy) ──────
    _clv_test_ci: tuple[float, float] | None = None
    if result.test_ci_json and "spearman" in result.test_ci_json:
        _ci = result.test_ci_json["spearman"]
        _clv_test_ci = (float(_ci["ci_lower"]), float(_ci["ci_upper"]))
    _clv_primary_backtests = {row["cutoff_date"]: row["metrics"]["spearman"] for row in backtest_rows}
    _clv_baseline_backtests = {
        row["cutoff_date"]: max(b["spearman"] for b in row["baselines"].values())
        for row in backtest_rows
    }
    clv_eval = promotion.CandidateEval(
        name=result.champion_name,
        leakage_ok=bool(leakage["passed"]),
        artifact_ok=True,
        primary_validation=result.validation_metrics["spearman"],
        primary_test=result.test_metrics["spearman"],
        baseline_validation=max(
            result.baseline_metrics[n]["validation"]["spearman"] for n in CLV_BASELINE_NAMES
        ),
        baseline_test=baseline_best_test,
        primary_backtests=_clv_primary_backtests,
        baseline_backtests=_clv_baseline_backtests,
        champion_backtests=_incumbent_backtests_by_metric("clv", "spearman"),
        calibration_error=None,
        primary_test_ci=_clv_test_ci,
    )
    clv_decision = promotion.decide([clv_eval], CLV_PROMOTION_CONFIG)
    clv_selection_log = [
        {
            "candidate": result.champion_name,
            "internal_competition": result.competition,
            "test_spearman": result.test_metrics["spearman"],
            "eligible": clv_decision.candidates[0].eligible,
            "composite": round(clv_decision.candidates[0].composite, 4),
            "is_champion": clv_decision.winner == result.champion_name,
            "reason": (
                "🏆 champion — " + clv_decision.summary
                if clv_decision.winner == result.champion_name
                else "ไม่ผ่าน: " + "; ".join(clv_decision.candidates[0].reasons)
            ),
        }
    ]
    for entry in clv_selection_log:
        print(f"clv: {entry['candidate']} eligible={entry['eligible']} — {entry['reason']}")

    progress("clv: artifacts + registry", 70)
    version = next_version("clv")
    feature_contract = build_feature_set_contract(
        datasets.feature_result,
        name="tier_a_24",
        version="v1",
        model_type="clv",
        feature_names=dataset.feature_names,
    )
    feature_set_id = repository.save_feature_set_contract(feature_contract)

    model_card = {
        "model_type": "clv",
        "version": version,
        "method": "BG-NBD + Gamma-Gamma vs LightGBM Tweedie vs XGBoost Tweedie vs LightGBM Hurdle",
        "algorithm": result.champion_name,
        "cutoff_date": str(datasets.cutoff_date.date()),
        "horizon_days": horizon_days,
        "dataset_rows": int(len(dataset.frame)),
        "feature_set": f"{feature_contract.name}/{feature_contract.version}",
        "feature_code_hash": feature_contract.feature_code_hash,
        "params": (
            _plain(result.tweedie_params) if result.champion_name == "lgbm_tweedie"
            else _plain(result.xgb_params) if result.champion_name == "xgb_tweedie"
            else {"stage1": "lgbm_binary", "stage2": "lgbm_gamma", **_plain(result.hurdle_bundle.params)} if result.champion_name == "hurdle"
            else {"penalizer": result.bgnbd.penalizer}
        ),
        "candidate_competition_val_spearman": result.competition,
        "candidate_selection": clv_selection_log,
        "primary_metric": {
            "name": "Spearman",
            "value": result.test_metrics["spearman"],
            "baseline": baseline_best_test,
            "baseline_name": baseline_best_name,
        },
        "test_ci": result.test_ci_json,
        "backtests": backtest_rows,
        "p_alive_source": "bgnbd",
        "limitations": "CLV เป็น forecast 180 วัน — เทียบ value tier ข้าม run ตรง ๆ ไม่ได้",
        "trained_by": created_by,
    }

    model_object = {
        "kind": "clv_bundle",
        "champion": result.champion_name,
        "bgnbd": result.bgnbd,
        "tweedie": result.tweedie_model,
        "tweedie_params": result.tweedie_params,
        "xgb": result.xgb_model,
        "xgb_params": result.xgb_params,
        "hurdle": result.hurdle_bundle,
        "horizon_days": horizon_days,
        "magnitude_slope": result.magnitude_slope,
        "magnitude_intercept": result.magnitude_intercept,
    }
    artifact_path, checksum = save_artifacts(
        model_type="clv",
        version=version,
        model_object=model_object,
        preprocessor=preprocessor,
        feature_names=dataset.feature_names,
        metrics={
            "validation": result.validation_metrics,
            "test": result.test_metrics,
            "backtests": backtest_rows,
            "baselines": result.baseline_metrics,
        },
        model_card=model_card,
        feature_baseline=build_feature_baseline(
            dataset.features("train"), dataset.feature_names, datasets.cutoff_date
        ),
    )

    version_id = insert_model_version(
        training_run_id=training_run_id,
        feature_set_id=feature_set_id,
        model_type="clv",
        version=version,
        artifact_path=artifact_path,
        artifact_checksum=checksum,
        metrics=round_metrics(result.test_metrics),
        validation_metrics=round_metrics(result.validation_metrics),
        test_metrics=round_metrics(result.test_metrics),
        feature_names=dataset.feature_names,
        label_definition={
            "label": "future_revenue_6m = sum(amount) in horizon",
            "population": "Active at cutoff",
            "horizon_days": horizon_days,
        },
        training_data_snapshot={
            "rows": int(len(dataset.frame)),
            "splits": {s: int((dataset.frame["split"] == s).sum()) for s in ("train", "validation", "test")},
        },
        model_card=model_card,
    )

    insert_evaluation(
        model_version_id=version_id, training_run_id=training_run_id, model_type="clv",
        evaluation_type="holdout", dataset_split="validation",
        metrics=round_metrics(result.validation_metrics),
        cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
        feature_set_id=feature_set_id,
    )
    # Flatten bootstrap CIs for key metrics into the test metrics dict.
    clv_test_metrics_persisted = dict(round_metrics(result.test_metrics))
    if result.test_ci_json:
        for _k in ("spearman", "rmsle", "top_decile_capture"):
            if _k in result.test_ci_json:
                _ci = result.test_ci_json[_k]
                clv_test_metrics_persisted[f"{_k}_ci_lower"] = _ci["ci_lower"]
                clv_test_metrics_persisted[f"{_k}_ci_upper"] = _ci["ci_upper"]
    insert_evaluation(
        model_version_id=version_id, training_run_id=training_run_id, model_type="clv",
        evaluation_type="holdout", dataset_split="test",
        metrics=clv_test_metrics_persisted,
        cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
        feature_set_id=feature_set_id,
    )
    for row in backtest_rows:
        insert_evaluation(
            model_version_id=version_id, training_run_id=training_run_id, model_type="clv",
            evaluation_type="backtest", dataset_split="backtest", metrics=row["metrics"],
            cutoff_date=row["cutoff_date"], horizon_days=horizon_days, feature_set_id=feature_set_id,
        )
        for baseline_name, metrics in row["baselines"].items():
            insert_evaluation(
                model_version_id=version_id, training_run_id=training_run_id, model_type="clv",
                evaluation_type="baseline", dataset_split="backtest", metrics=round_metrics(metrics),
                cutoff_date=row["cutoff_date"], horizon_days=horizon_days, baseline_name=baseline_name,
            )
    for baseline_name, splits in result.baseline_metrics.items():
        for split_name, metrics in splits.items():
            insert_evaluation(
                model_version_id=version_id, training_run_id=training_run_id, model_type="clv",
                evaluation_type="baseline", dataset_split=split_name, metrics=round_metrics(metrics),
                cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
                baseline_name=baseline_name,
            )

    artifact_ok = verify_artifact_load(artifact_path, dataset.features("test").head(5))
    promote = clv_decision.winner is not None and artifact_ok
    if clv_decision.winner is not None and not artifact_ok:
        reason = "ไม่ promote — artifact load test ไม่ผ่าน (safety gate)"
    else:
        reason = clv_decision.summary
    if promote:
        promote_model_version(
            model_type="clv", model_version_id=version_id, reason=reason, created_by=created_by
        )
    print(f"clv: promoted={promote} — {reason}")

    return {
        "model_type": "clv",
        "primary_metric_name": "Spearman",
        "primary_metric_value": result.test_metrics["spearman"],
        "baseline_name": baseline_best_name,
        "baseline_value": baseline_best_test,
        "calibration_ece": None,
        "leakage_passed": bool(leakage["passed"]),
        "promoted": promote,
        "promote_reason": reason,
        "new_version": version if promote else None,
    }


# ── Credit ───────────────────────────────────────────────────────


def _train_and_register_credit(
    training_run_id: str,
    datasets: CutoffDatasets,
    backtest_sets: list[CutoffDatasets],
    horizon_days: int,
    created_by: str | None,
    progress: Callable[[str, int], None],
) -> dict[str, Any]:
    progress("credit: quantile models (Optuna)", 75)
    # Multi-cutoff pooling: older-cutoff rows join the train split (validation/
    # test stay at the latest cutoff) so the model sees the same customers in
    # different behavioural regimes instead of one static snapshot.
    dataset = pool_train_rows(datasets.credit, [bt.credit for bt in backtest_sets])
    print(
        f"credit: pooled train rows {int((dataset.frame['split'] == 'train').sum())} "
        f"from {1 + len(backtest_sets)} cutoffs"
    )
    preprocessor = fit_preprocessor(
        dataset.features("train"), _feature_schema_for_dataset(datasets, dataset)
    )
    result = train_credit(
        dataset, preprocessor, topup_censor_days=float(horizon_days), progress=lambda m: print(m)
    )

    progress("credit: backtests", 85)
    backtest_rows: list[dict[str, Any]] = []
    for bt in backtest_sets:
        older = [b.credit for b in backtest_sets if b.cutoff_date < bt.cutoff_date]
        bt_pooled = pool_train_rows(bt.credit, older)
        bt_preproc = fit_preprocessor(
            bt_pooled.features("train"), _feature_schema_for_dataset(bt, bt_pooled)
        )
        champion_metrics, baseline_metrics = backtest_credit(result, bt_pooled, bt_preproc)
        backtest_rows.append(
            {
                "cutoff_date": str(bt.cutoff_date.date()),
                "metrics": round_metrics(champion_metrics),
                "baselines": {k: v["test"] for k, v in baseline_metrics.items()},
            }
        )
        print(f"credit backtest {bt.cutoff_date.date()}: coverage {champion_metrics['coverage_p10_p90']}")

    progress("credit: leakage tests", 88)
    leakage = run_regression_leakage_suite(
        dataset, preprocessor, ["future_credit_usage_30d", "future_credit_usage_90d"]
    )
    _save_leakage_report(
        training_run_id, source_id_of(training_run_id), datasets.cutoff_date, "credit",
        int(len(dataset.frame)), leakage,
    )
    print(f"credit: leakage suite passed={leakage['passed']}")

    # Gate per TRAINING §11: credit PRIMARY metric is interval coverage.
    # Baselines are point forecasts with no interval → MAE comparison used as a
    # separate gate outside promotion.decide(). Coverage range (0.75, 0.90]:
    # lower bound enforced via baseline_validation in CandidateEval; upper bound
    # encoded as calibration_error = max(0, coverage − 0.90) with ceiling = 0.001.
    coverage = result.test_metrics["coverage_p10_p90"]
    best_baseline_mae30 = min(
        result.baseline_metrics[name]["test"]["mae_30d"] for name in CREDIT_BASELINE_NAMES
    )
    best_baseline_mae90 = min(
        result.baseline_metrics[name]["test"]["mae_90d"] for name in CREDIT_BASELINE_NAMES
    )
    beats_baselines = (
        result.test_metrics["mae_30d"] <= best_baseline_mae30 * CREDIT_MAE_TOLERANCE
        and result.test_metrics["mae_90d"] <= best_baseline_mae90 * CREDIT_MAE_TOLERANCE
    )

    # ── Credit promotion gate (two-stage safety/quality policy) ───
    _credit_test_ci: tuple[float, float] | None = None
    if result.test_ci_json and "coverage_p10_p90" in result.test_ci_json:
        _ci = result.test_ci_json["coverage_p10_p90"]
        _credit_test_ci = (float(_ci["ci_lower"]), float(_ci["ci_upper"]))
    _credit_primary_backtests = {
        row["cutoff_date"]: row["metrics"]["coverage_p10_p90"] for row in backtest_rows
    }
    _credit_baseline_backtests = {
        row["cutoff_date"]: BACKTEST_COVERAGE_RANGE[0] for row in backtest_rows
    }
    credit_eval = promotion.CandidateEval(
        name="quantile_champion",
        leakage_ok=bool(leakage["passed"]),
        artifact_ok=True,
        primary_validation=result.validation_metrics["coverage_p10_p90"],
        primary_test=coverage,
        baseline_validation=COVERAGE_RANGE[0],
        baseline_test=COVERAGE_RANGE[0],
        primary_backtests=_credit_primary_backtests,
        baseline_backtests=_credit_baseline_backtests,
        champion_backtests=_incumbent_backtests_by_metric("credit", "coverage_p10_p90"),
        calibration_error=max(0.0, coverage - COVERAGE_RANGE[1]),
        primary_test_ci=_credit_test_ci,
    )
    credit_decision = promotion.decide([credit_eval], CREDIT_PROMOTION_CONFIG)
    credit_selection_log = [
        {
            "candidate": "quantile_champion",
            "test_coverage": coverage,
            "eligible": credit_decision.candidates[0].eligible,
            "composite": round(credit_decision.candidates[0].composite, 4),
            "is_champion": credit_decision.winner is not None,
            "reason": (
                "🏆 champion — " + credit_decision.summary
                if credit_decision.winner is not None
                else "ไม่ผ่าน: " + "; ".join(credit_decision.candidates[0].reasons)
            ),
        }
    ]
    for entry in credit_selection_log:
        print(f"credit: {entry['candidate']} eligible={entry['eligible']} — {entry['reason']}")

    progress("credit: artifacts + registry", 92)
    version = next_version("credit")
    feature_contract = build_feature_set_contract(
        datasets.feature_result,
        name="tier_a_27",
        version="v1",
        model_type="credit",
        feature_names=dataset.feature_names,
    )
    feature_set_id = repository.save_feature_set_contract(feature_contract)

    baseline_best_name = min(
        CREDIT_BASELINE_NAMES, key=lambda name: result.baseline_metrics[name]["test"]["mae_30d"]
    )
    model_card = {
        "model_type": "credit",
        "version": version,
        "method": "LightGBM quantile regression (p10–p90, 30d/90d)",
        "algorithm": "lightgbm_quantile",
        "cutoff_date": str(datasets.cutoff_date.date()),
        "horizon_days": horizon_days,
        "dataset_rows": int(len(dataset.frame)),
        "feature_set": f"{feature_contract.name}/{feature_contract.version}",
        "feature_code_hash": feature_contract.feature_code_hash,
        "params": {str(h): _plain(p) for h, p in result.params_by_horizon.items()},
        "cqr_q_hat": {
            str(h): result.horizons[h].cqr_q_hat for h in result.horizons
        },
        "model_family": {
            str(h): result.horizons[h].model_family for h in result.horizons
        },
        "correction_shrinkage": {
            str(h): result.horizons[h].correction_shrinkage for h in result.horizons
        },
        "topup_model": (
            {
                "algorithm": "xgboost_aft",
                "distribution": result.topup_model.distribution,
                "scale": result.topup_model.scale,
                "censor_days": result.topup_model.censor_days,
                "day_scale": result.topup_model.day_scale,
                "urgent_day_threshold_raw": result.topup_model.urgent_day_threshold_raw,
                "urgent_topup_precision_test": result.test_metrics.get("urgent_topup_precision"),
                "urgent_topup_recall_test": result.test_metrics.get("urgent_topup_recall"),
                "topup_mae_days_observed_test": result.test_metrics.get("topup_mae_days_observed"),
            }
            if result.topup_model
            else None
        ),
        "pooled_cutoffs": [str(datasets.cutoff_date.date())]
        + [str(bt.cutoff_date.date()) for bt in backtest_sets],
        "candidate_selection": credit_selection_log,
        "primary_metric": {
            "name": "Coverage p10–p90",
            "value": coverage,
            "baseline": 0.0,
            "baseline_name": baseline_best_name,
        },
        "test_ci": result.test_ci_json,
        "backtests": backtest_rows,
        "limitations": "ทำนายเฉพาะลูกค้าที่มีประวัติใช้งาน/จ่ายเงิน — ลูกค้า Ghost ไม่มี forecast",
        "trained_by": created_by,
    }

    model_object = {
        "kind": "credit_bundle",
        "horizons": result.horizons,
        "topup_model": result.topup_model,
    }
    artifact_path, checksum = save_artifacts(
        model_type="credit",
        version=version,
        model_object=model_object,
        preprocessor=preprocessor,
        feature_names=dataset.feature_names,
        metrics={
            "validation": result.validation_metrics,
            "test": result.test_metrics,
            "backtests": backtest_rows,
            "baselines": result.baseline_metrics,
        },
        model_card=model_card,
        feature_baseline=build_feature_baseline(
            dataset.features("train"), dataset.feature_names, datasets.cutoff_date
        ),
    )

    version_id = insert_model_version(
        training_run_id=training_run_id,
        feature_set_id=feature_set_id,
        model_type="credit",
        version=version,
        artifact_path=artifact_path,
        artifact_checksum=checksum,
        metrics=round_metrics(result.test_metrics),
        validation_metrics=round_metrics(result.validation_metrics),
        test_metrics=round_metrics(result.test_metrics),
        feature_names=dataset.feature_names,
        label_definition={
            "label": "future_credit_usage_30d/90d = sum(usage) in horizon windows",
            "population": "customers with activity history",
        },
        training_data_snapshot={
            "rows": int(len(dataset.frame)),
            "splits": {s: int((dataset.frame["split"] == s).sum()) for s in ("train", "validation", "test")},
        },
        model_card=model_card,
    )

    insert_evaluation(
        model_version_id=version_id, training_run_id=training_run_id, model_type="credit",
        evaluation_type="holdout", dataset_split="validation",
        metrics=round_metrics(result.validation_metrics),
        cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
        feature_set_id=feature_set_id,
    )
    # Flatten bootstrap CIs for key metrics into the test metrics dict.
    credit_test_metrics_persisted = dict(round_metrics(result.test_metrics))
    if result.test_ci_json:
        for _k in ("coverage_p10_p90", "mae_30d", "mae_90d", "pinball_composite_30d", "pinball_composite_90d"):
            if _k in result.test_ci_json:
                _ci = result.test_ci_json[_k]
                credit_test_metrics_persisted[f"{_k}_ci_lower"] = _ci["ci_lower"]
                credit_test_metrics_persisted[f"{_k}_ci_upper"] = _ci["ci_upper"]
    insert_evaluation(
        model_version_id=version_id, training_run_id=training_run_id, model_type="credit",
        evaluation_type="holdout", dataset_split="test",
        metrics=credit_test_metrics_persisted,
        cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
        feature_set_id=feature_set_id,
    )
    for row in backtest_rows:
        insert_evaluation(
            model_version_id=version_id, training_run_id=training_run_id, model_type="credit",
            evaluation_type="backtest", dataset_split="backtest", metrics=row["metrics"],
            cutoff_date=row["cutoff_date"], feature_set_id=feature_set_id,
        )
        for baseline_name, metrics in row["baselines"].items():
            insert_evaluation(
                model_version_id=version_id, training_run_id=training_run_id, model_type="credit",
                evaluation_type="baseline", dataset_split="backtest", metrics=round_metrics(metrics),
                cutoff_date=row["cutoff_date"], baseline_name=baseline_name,
            )
    for baseline_name, splits in result.baseline_metrics.items():
        for split_name, metrics in splits.items():
            insert_evaluation(
                model_version_id=version_id, training_run_id=training_run_id, model_type="credit",
                evaluation_type="baseline", dataset_split=split_name, metrics=round_metrics(metrics),
                cutoff_date=str(datasets.cutoff_date.date()), baseline_name=baseline_name,
            )

    artifact_ok = verify_artifact_load(artifact_path, dataset.features("test").head(5))
    promote = credit_decision.winner is not None and beats_baselines and artifact_ok
    if credit_decision.winner is not None and not artifact_ok:
        reason = "ไม่ promote — artifact load test ไม่ผ่าน (safety gate)"
    elif credit_decision.winner is not None and not beats_baselines:
        reason = f"ไม่ promote — MAE เกิน tolerance {CREDIT_MAE_TOLERANCE}× baseline (gate ข้อ 3)"
    else:
        reason = credit_decision.summary
    if promote:
        promote_model_version(
            model_type="credit", model_version_id=version_id, reason=reason, created_by=created_by
        )
    print(f"credit: promoted={promote} — {reason}")

    return {
        "model_type": "credit",
        "primary_metric_name": "Coverage p10–p90",
        "primary_metric_value": coverage,
        "baseline_name": baseline_best_name,
        "baseline_value": 0.0,
        "calibration_ece": None,
        "leakage_passed": bool(leakage["passed"]),
        "promoted": promote,
        "promote_reason": reason,
        "new_version": version if promote else None,
    }


# ── Shared helpers ───────────────────────────────────────────────


def _feature_schema_for_dataset(
    cutoff_datasets: CutoffDatasets,
    dataset: Any,
) -> dict[str, dict[str, Any]]:
    return {
        feature_name: cutoff_datasets.feature_result.feature_schema[feature_name]
        for feature_name in dataset.feature_names
    }


def _promotion_decision(
    *,
    beats_baselines: bool,
    leakage_passed: bool,
    calibration_ok: bool,
    calibration_label: str,
    artifact_ok: bool,
    champion_check: tuple[bool, str],
) -> tuple[bool, str]:
    champion_ok, champion_reason = champion_check
    failures: list[str] = []
    if not beats_baselines:
        failures.append("แพ้ baseline บน primary metric อย่างน้อย 1 split/cutoff (gate ข้อ 3)")
    if not leakage_passed:
        failures.append("leakage test suite ไม่ผ่าน (gate ข้อ 2)")
    if not calibration_ok:
        failures.append(f"calibration ไม่ผ่าน: {calibration_label} (gate ข้อ 5)")
    if not artifact_ok:
        failures.append("artifact load test ไม่ผ่าน (gate ข้อ 6)")
    if not champion_ok:
        failures.append(champion_reason)
    if failures:
        return False, "ไม่ promote — " + "; ".join(failures)
    return True, (
        f"ชนะ baseline ทุกตัวทุก cutoff, {calibration_label}, leakage ผ่าน, "
        f"artifact load ผ่าน — {champion_reason}"
    )


def _beats_existing_champion(
    model_type: str,
    metric_key: str,
    backtest_rows: list[dict[str, Any]],
    tolerance: bool = False,
) -> tuple[bool, str]:
    """Promotion gate №4 — compare against the stored champion's backtests.

    The previous champion's model card stores its own backtest metrics under
    the same protocol, so an apples-to-apples comparison reads them from there.
    """

    champion = current_champion(model_type)
    if champion is None:
        return True, "ไม่มี champion เดิม (รุ่นแรก)"
    card = champion.get("model_card_json") or {}
    if isinstance(card, str):
        card = json.loads(card)
    old_rows = {row["cutoff_date"]: row["metrics"] for row in card.get("backtests", [])}
    if not old_rows or not backtest_rows:
        return True, f"เทียบ champion เดิม {champion['version']} ไม่ได้ (ไม่มี backtest ร่วม) — ยอมให้ผ่าน"

    wins, comparisons = 0, 0
    for row in backtest_rows:
        old = old_rows.get(row["cutoff_date"])
        if old is None or metric_key not in old:
            continue
        comparisons += 1
        new_value = row["metrics"][metric_key]
        old_value = old[metric_key]
        if tolerance:
            if abs(new_value - 0.80) <= abs(old_value - 0.80) + 1e-9:
                wins += 1
        elif new_value >= old_value - 1e-9:
            wins += 1
    if comparisons == 0:
        return True, f"ไม่มี backtest cutoff ร่วมกับ champion เดิม {champion['version']} — ยอมให้ผ่าน"
    if wins == comparisons:
        return True, f"ชนะ/เสมอ champion เดิม {champion['version']} ทุก backtest cutoff"
    return False, f"แพ้ champion เดิม {champion['version']} บน backtest {comparisons - wins}/{comparisons} cutoff (gate ข้อ 4)"


def source_id_of(training_run_id: str) -> str:
    return load_training_run(training_run_id)["source_id"]


def _save_leakage_report(
    training_run_id: str,
    source_id: str,
    cutoff_date: pd.Timestamp,
    model_type: str,
    row_count: int,
    leakage: dict[str, Any],
) -> None:
    checks = [
        ValidationCheck(
            name=check["name"],
            severity="blocker" if check["severity"] == "fail" else "warning",
            passed=bool(check["passed"]),
            message=check["message"],
            details=check.get("details"),
        )
        for check in leakage["checks"]
    ]
    report = ValidationReport(
        source_id=source_id,
        source_kind="train",
        validation_type="leakage",
        status="passed" if leakage["passed"] else "failed",
        row_count=row_count,
        stats={"cutoff_date": str(cutoff_date.date()), "model_type": model_type},
        anomalies=[
            {"check": check["name"], "message": check["message"]}
            for check in leakage["checks"]
            if not check["passed"]
        ],
        checks=checks,
    )
    repository.save_validation_report(report, training_run_id=training_run_id)


def _plain(params: dict[str, Any]) -> dict[str, Any]:
    plain: dict[str, Any] = {}
    for key, value in params.items():
        if isinstance(value, (np.floating, np.integer)):
            plain[key] = value.item()
        elif isinstance(value, (str, int, float, bool)) or value is None:
            plain[key] = value
        else:
            plain[key] = str(value)
    return plain
