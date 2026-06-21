#!/usr/bin/env python3
"""Verify the two-stage champion promotion policy (src/training/promotion.py).

Read-only, no DB. Asserts the policy makes the right call across the scenarios
the old hard-threshold gate got wrong or right, so the behaviour is pinned:

  1. best ranker with a marginal, recoverable calibration miss   -> promoted
  2. best ranker but egregiously miscalibrated (safety ceiling)  -> rejected
  3. best ranker but unstable across backtest cutoffs            -> rejected
  4. best ranker but loses to the incumbent champion (aggregate) -> rejected
  5. no candidate clears the safety gate                         -> keep incumbent
  6. two clean candidates                                        -> best ranker wins

Exit code 0 when all scenarios pass, 1 otherwise.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.training.promotion import CandidateEval, PromotionConfig, decide

CHURN = PromotionConfig(
    primary_metric="pr_auc",
    higher_is_better=True,
    calibration_ceiling=0.10,
    calibration_target=0.05,
    calibration_penalty=1.0,
    champion_margin=0.0,
    stability_max_rel_drop=0.30,
)
CUTS = ["2025-01-01", "2025-03-01", "2025-05-01"]


def _bt(*values: float) -> dict[str, float]:
    return dict(zip(CUTS, values))


def _candidate(name: str, **overrides) -> CandidateEval:
    spec = dict(
        name=name,
        leakage_ok=True,
        artifact_ok=True,
        primary_validation=0.78,
        primary_test=0.72,
        baseline_validation=0.62,
        baseline_test=0.60,
        primary_backtests=_bt(0.74, 0.73, 0.75),
        baseline_backtests=_bt(0.61, 0.60, 0.62),
        champion_backtests=_bt(0.71, 0.70, 0.72),
        calibration_error=0.04,
    )
    spec.update(overrides)
    return CandidateEval(**spec)


SCENARIOS = [
    (
        "best ranker w/ marginal miscalibration is promoted",
        [
            _candidate("tabicl", primary_test=0.748, primary_backtests=_bt(0.76, 0.75, 0.77), calibration_error=0.061),
            _candidate("logistic", primary_test=0.708, primary_backtests=_bt(0.73, 0.72, 0.74), calibration_error=0.042),
        ],
        "tabicl",
    ),
    (
        "egregious miscalibration is rejected (safety ceiling)",
        [
            _candidate("tabicl", primary_test=0.748, primary_backtests=_bt(0.76, 0.75, 0.77), calibration_error=0.20),
            _candidate("logistic", primary_test=0.708, primary_backtests=_bt(0.73, 0.72, 0.74), calibration_error=0.042),
        ],
        "logistic",
    ),
    (
        "unstable model (one cutoff collapses) is rejected",
        [
            _candidate("tabicl", primary_test=0.748, primary_backtests=_bt(0.77, 0.30, 0.76)),
            _candidate("logistic", primary_test=0.708, primary_backtests=_bt(0.73, 0.72, 0.74), calibration_error=0.042),
        ],
        "logistic",
    ),
    (
        "loses to incumbent champion on aggregate is rejected",
        [
            _candidate("tabicl", primary_test=0.748, primary_backtests=_bt(0.66, 0.65, 0.67)),
            _candidate("logistic", primary_test=0.708, primary_backtests=_bt(0.73, 0.72, 0.74), calibration_error=0.042),
        ],
        "logistic",
    ),
    (
        "no eligible candidate -> keep incumbent",
        [
            _candidate("tabicl", primary_test=0.50, baseline_test=0.60),
            _candidate("logistic", primary_test=0.55, baseline_test=0.60),
        ],
        None,
    ),
    (
        "two clean candidates -> best ranker wins on quality",
        [
            _candidate("tabicl", primary_test=0.75, primary_backtests=_bt(0.76, 0.75, 0.77), calibration_error=0.03),
            _candidate("xgboost", primary_test=0.72, primary_backtests=_bt(0.71, 0.72, 0.73), calibration_error=0.03),
        ],
        "tabicl",
    ),
]


def main() -> int:
    passed = 0
    for title, candidates, expected in SCENARIOS:
        result = decide(candidates, CHURN)
        ok = result.winner == expected
        passed += ok
        print(f"{'PASS' if ok else 'FAIL'}  {title}")
        print(f"      winner={result.winner} expected={expected} :: {result.summary}")
        for c in result.candidates:
            tag = "eligible" if c.eligible else "OUT: " + "; ".join(c.reasons)
            print(f"        {c.name:18} composite={c.composite:.4f} [{tag}]")
    print(f"\n{passed}/{len(SCENARIOS)} scenarios passed")
    return 0 if passed == len(SCENARIOS) else 1


if __name__ == "__main__":
    raise SystemExit(main())
