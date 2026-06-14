#!/usr/bin/env python3
"""Contract check: the canonical enum strings in apps/ml/src/constants.py must
match apps/api/src/lib/constants.ts exactly. A drift between the Python writer
and the TypeScript reader is a silent wire-format break, so fail loudly here.

Run: python scripts/verify_constants_sync.py
"""
from __future__ import annotations

import inspect
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src import constants  # noqa: E402

TS_PATH = (
    Path(__file__).resolve().parents[3] / "apps" / "api" / "src" / "lib" / "constants.ts"
)


def python_values() -> set[str]:
    values: set[str] = set()
    for _, cls in inspect.getmembers(constants, inspect.isclass):
        # only attributes defined on the class itself (skip inherited dunders
        # like __module__, which is a non-dunder-valued string)
        for name, attr in vars(cls).items():
            if name.startswith("__"):
                continue
            if isinstance(attr, str):
                values.add(attr)
            elif isinstance(attr, tuple):
                values.update(v for v in attr if isinstance(v, str))
    return values


def ts_values(text: str) -> set[str]:
    # strip block + line comments so comment prose never counts as a value
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//.*", "", text)
    return set(re.findall(r'"([^"]+)"', text))


def main() -> int:
    py = python_values()
    ts = ts_values(TS_PATH.read_text(encoding="utf-8"))
    only_py = sorted(py - ts)
    only_ts = sorted(ts - py)
    if only_py or only_ts:
        print("CONSTANTS OUT OF SYNC between constants.py and constants.ts")
        if only_py:
            print("  only in Python:", only_py)
        if only_ts:
            print("  only in TypeScript:", only_ts)
        return 1
    print(f"constants in sync: {len(py)} values match across Python and TypeScript")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
