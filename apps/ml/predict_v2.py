#!/usr/bin/env python3
"""Compatibility shim — CLI entrypoint moved to src/cli/predict.py.

Prefer: python -m src.cli.predict --prediction-run-id <uuid>
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.cli.predict import main  # noqa: E402

if __name__ == "__main__":
    main()
