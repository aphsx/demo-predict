#!/bin/bash
set -e

MODEL_DIR="${MODEL_DIR:-/app/models}"

# ── Apply DB migrations (repairs partial-schema dev volumes) ──
python scripts/migrate_or_repair.py

echo "=== Legacy ML runtime removed; starting ML API for migrations/health only ==="

exec uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload