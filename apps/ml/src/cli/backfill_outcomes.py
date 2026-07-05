#!/usr/bin/env python3
"""ML v2 realized-outcome backfill CLI (TRAINING-PIPELINE §15).

Usage (from apps/ml/):
  python -m src.cli.backfill_outcomes                              # every unmeasured completed run
  python -m src.cli.backfill_outcomes --force                      # re-measure already-measured runs
  python -m src.cli.backfill_outcomes --prediction-run-id <uuid>   # one run (always recomputed)

For each eligible run the runner rebuilds the ACTUAL labels from the newest
clean predict data (same label definitions as training) and upserts realized
metrics as ml_model_evaluations rows (evaluation_type='production_holdout').
"""
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill realized outcomes for completed prediction runs"
    )
    parser.add_argument(
        "--prediction-run-id",
        default=None,
        help="Measure one specific completed run (always recomputed).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-measure runs that already have production_holdout evaluations.",
    )
    args = parser.parse_args()

    from src.outcomes.runner import run_outcome_backfill

    run_outcome_backfill(args.prediction_run_id, force=args.force)


if __name__ == "__main__":
    main()
