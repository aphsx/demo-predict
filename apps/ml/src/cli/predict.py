#!/usr/bin/env python3
"""ML v2 prediction CLI.

Usage (from apps/ml/):
  python -m src.cli.predict --prediction-run-id <uuid>

The run row in `ml_prediction_runs` must already exist. The runner drives it
to completed/failed and writes one output row per customer.
"""
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one ML v2 prediction run")
    parser.add_argument("--prediction-run-id", required=True)
    args = parser.parse_args()

    from src.prediction.runner import run_prediction

    run_prediction(args.prediction_run_id)


if __name__ == "__main__":
    main()
