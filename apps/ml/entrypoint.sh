#!/bin/bash
set -e

MODEL_DIR="${MODEL_DIR:-/app/models}"

echo "=== Starting ML v2 internal API (health + training/prediction job triggers) ==="

exec uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload