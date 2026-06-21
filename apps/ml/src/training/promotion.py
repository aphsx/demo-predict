"""Champion promotion policy — separates SAFETY from QUALITY.

Why this exists
---------------
The original gate collapsed two very different questions into one boolean with
hard hairline thresholds (e.g. ``ECE < 0.05``):

  1. "Is this model SAFE to deploy at all?"  (binary, non-negotiable)
  2. "Is this model the BEST of the candidates?"  (relative, pick-best)

Mixing them meant the best-ranking model could be *vetoed* by a marginal,
noise-sized, and **recoverable** calibration miss (ECE 0.061 vs a 0.05 line),
while a clearly weaker ranker was promoted. That is the wrong trade for churn,
where ranking who is at risk is the primary job and calibration is fixed by
post-hoc recalibration.

The policy
----------
Stage 1 — SAFETY (binary). A candidate is ELIGIBLE only if it is safe to ship:
  * no leakage, artifact loads & predicts;
  * adds value over the trivial rule baselines (every split + cutoff);
  * beats the incumbent champion on the AGGREGATE primary metric (noise-robust,
    not "win every single cutoff");
  * is STABLE — no backtest cutoff collapses far below the others;
  * (if applicable) calibration is within a loose SAFETY ceiling AFTER
    recalibration — egregious miscalibration is still rejected.

Stage 2 — QUALITY (relative). Among eligible candidates, pick the one that
maximizes a composite: the primary objective minus a soft penalty for residual
calibration error above target. Calibration is a guardrail, not a veto.

If nothing is eligible, keep the incumbent champion.

The module is metric-agnostic (``higher_is_better``) so churn (PR-AUC + ECE) and
CLV (Spearman, no calibration) share one implementation; credit keeps its
domain-specific coverage-band gate but follows the same Safety/Quality split.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from typing import Iterable


@dataclass(frozen=True)
class PromotionConfig:
    primary_metric: str
    higher_is_better: bool = True
    # Beat the incumbent champion's aggregate primary by at least this margin.
    champion_margin: float = 0.0
    # Reject if the worst backtest cutoff drops more than this fraction below the
    # median backtest (relative). Guards against a model that looks good on
    # average but collapses in some regime.
    stability_max_rel_drop: float = 0.30
    # Calibration (optional — None disables). Above the ceiling ⇒ unsafe (Stage 1);
    # between target and ceiling ⇒ soft penalty in the Stage 2 composite.
    calibration_ceiling: float | None = None
    calibration_target: float | None = None
    calibration_penalty: float = 1.0


@dataclass(frozen=True)
class CandidateEval:
    name: str
    leakage_ok: bool
    artifact_ok: bool
    primary_validation: float
    primary_test: float
    baseline_validation: float
    baseline_test: float
    # Keyed by cutoff date so candidate / baseline / champion align by regime.
    primary_backtests: dict[str, float] = field(default_factory=dict)
    baseline_backtests: dict[str, float] = field(default_factory=dict)
    champion_backtests: dict[str, float] | None = None
    calibration_error: float | None = None


@dataclass(frozen=True)
class CandidateDecision:
    name: str
    eligible: bool
    quality: float
    composite: float
    reasons: list[str]  # why it failed Stage 1 (empty when eligible)


@dataclass(frozen=True)
class PromotionDecision:
    winner: str | None
    keep_incumbent: bool
    candidates: list[CandidateDecision]
    summary: str

    def decision_for(self, name: str) -> CandidateDecision | None:
        return next((c for c in self.candidates if c.name == name), None)


def decide(candidates: list[CandidateEval], config: PromotionConfig) -> PromotionDecision:
    """Run the two-stage policy and pick a champion (or keep the incumbent)."""

    decisions = [_evaluate(c, config) for c in candidates]
    eligible = [d for d in decisions if d.eligible]
    if not eligible:
        return PromotionDecision(
            winner=None,
            keep_incumbent=True,
            candidates=decisions,
            summary="ไม่มี candidate ผ่าน safety gate — คง champion เดิมไว้",
        )

    winner = max(eligible, key=lambda d: d.composite)
    runner_up = sorted((d for d in eligible if d.name != winner.name), key=lambda d: -d.composite)
    margin_note = (
        f" (composite {winner.composite:.4f}; รองลงมา {runner_up[0].name} {runner_up[0].composite:.4f})"
        if runner_up
        else f" (composite {winner.composite:.4f})"
    )
    return PromotionDecision(
        winner=winner.name,
        keep_incumbent=False,
        candidates=decisions,
        summary=f"เลือก {winner.name} — ดีที่สุดในกลุ่มที่ผ่าน safety gate{margin_note}",
    )


def _evaluate(c: CandidateEval, config: PromotionConfig) -> CandidateDecision:
    better = _better(config.higher_is_better)
    reasons: list[str] = []

    # ── Stage 1: SAFETY ───────────────────────────────────────────
    if not c.leakage_ok:
        reasons.append("leakage test ไม่ผ่าน")
    if not c.artifact_ok:
        reasons.append("artifact load test ไม่ผ่าน")

    if not better(c.primary_validation, c.baseline_validation):
        reasons.append("แพ้ baseline บน validation")
    if not better(c.primary_test, c.baseline_test):
        reasons.append("แพ้ baseline บน test")
    lost_cutoffs = [
        cutoff
        for cutoff, value in c.primary_backtests.items()
        if cutoff in c.baseline_backtests and not better(value, c.baseline_backtests[cutoff])
    ]
    if lost_cutoffs:
        reasons.append(f"แพ้ baseline บน backtest {len(lost_cutoffs)}/{len(c.primary_backtests)} cutoff")

    champion_gap = _champion_gap(c, config)
    if champion_gap is not None and champion_gap < config.champion_margin:
        reasons.append("แพ้ champion เดิมบนค่าเฉลี่ย backtest")

    instability = _instability(c, config.higher_is_better)
    if instability is not None and instability > config.stability_max_rel_drop:
        reasons.append(
            f"ไม่เสถียรข้าม backtest (worst ต่ำกว่า median {instability * 100:.0f}% > เกณฑ์ {config.stability_max_rel_drop * 100:.0f}%)"
        )

    if (
        config.calibration_ceiling is not None
        and c.calibration_error is not None
        and c.calibration_error > config.calibration_ceiling
    ):
        reasons.append(
            f"calibration เกิน safety ceiling (ECE {c.calibration_error:.3f} > {config.calibration_ceiling})"
        )

    # ── Stage 2: QUALITY composite ────────────────────────────────
    quality = _quality(c)
    penalty = _calibration_penalty(c, config)
    # Maximize composite: flip sign when lower-is-better so `max` still works.
    oriented = quality if config.higher_is_better else -quality
    composite = oriented - penalty

    return CandidateDecision(
        name=c.name,
        eligible=not reasons,
        quality=quality,
        composite=composite,
        reasons=reasons,
    )


def _better(higher_is_better: bool):
    return (lambda a, b: a > b) if higher_is_better else (lambda a, b: a < b)


def _quality(c: CandidateEval) -> float:
    """Robust primary: holdout test blended with backtest cutoffs."""

    values = [c.primary_test, *c.primary_backtests.values()]
    return statistics.fmean(values) if values else c.primary_test


def _calibration_penalty(c: CandidateEval, config: PromotionConfig) -> float:
    if config.calibration_target is None or c.calibration_error is None:
        return 0.0
    return config.calibration_penalty * max(0.0, c.calibration_error - config.calibration_target)


def _champion_gap(c: CandidateEval, config: PromotionConfig) -> float | None:
    """Candidate minus incumbent on shared backtest cutoffs (sign-oriented).

    Positive means the candidate is ahead by the policy's definition of better.
    Returns None when there is no incumbent or no shared cutoff to compare.
    """

    if not c.champion_backtests:
        return None
    shared = [k for k in c.primary_backtests if k in c.champion_backtests]
    if not shared:
        return None
    cand = statistics.fmean(c.primary_backtests[k] for k in shared)
    champ = statistics.fmean(c.champion_backtests[k] for k in shared)
    return (cand - champ) if config.higher_is_better else (champ - cand)


def _instability(c: CandidateEval, higher_is_better: bool) -> float | None:
    """Relative drop of the worst backtest cutoff below the median (>=0)."""

    values = list(c.primary_backtests.values())
    if len(values) < 2:
        return None
    median = statistics.median(values)
    if median == 0:
        return None
    worst = min(values) if higher_is_better else max(values)
    drop = (median - worst) if higher_is_better else (worst - median)
    return drop / abs(median)
