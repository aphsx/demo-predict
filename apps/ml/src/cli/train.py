#!/usr/bin/env python3
"""ML v2 training CLI.

Usage (from apps/ml/):
  python -m src.cli.train --training-run-id <uuid>

The run row in `ml_training_runs` must already exist (created by the Elysia
API or inserted manually). The runner drives it to completed/failed.
"""
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one ML v2 training run")
    parser.add_argument("--training-run-id", required=True)
    args = parser.parse_args()

    from src.training.runner import run_training

    run_training(args.training_run_id)


if __name__ == "__main__":
    main()
