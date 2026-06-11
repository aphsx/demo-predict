#!/bin/bash
set -e

MODEL_DIR="${MODEL_DIR:-/app/models}"

# ── Apply DB migrations (repairs partial-schema dev volumes) ──
python scripts/migrate_or_repair.py

echo "=== Starting ML v2 internal API (health + training/prediction job triggers) ==="

exec uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload