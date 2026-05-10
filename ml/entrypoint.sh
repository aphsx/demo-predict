#!/bin/bash
set -e

MODEL_DIR="${MODEL_DIR:-/app/models}"
DATA_DIR="${DATA_DIR:-/data}"

# ── Check environment ──
if [ -n "$DOCKER_BUILD" ]; then
  # Docker mode: train every start
  echo "=== [Docker] Training models on every start ==="
  if [ -f "$DATA_DIR"/*.xlsx ]; then
    DATA_FILE=$(ls $DATA_DIR/*.xlsx | head -1)
    echo "Data: $DATA_FILE"
    python train.py "$DATA_FILE"
    echo "=== Training done ==="
  else
    echo "WARNING: No data in $DATA_DIR — models not trained"
  fi
else
  # Local mode: skip auto-train, check if models exist
  echo "=== [Local] Checking models... ==="
  if [ ! -f "$MODEL_DIR/churn_model.pkl" ]; then
    echo "ERROR: No trained models found at $MODEL_DIR"
    echo "Please train first: python train.py <data_file>"
    echo "Example: python train.py data/1Moby_Data.xlsx"
    exit 1
  fi
  echo "Models found — skipping training"
fi

exec uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload