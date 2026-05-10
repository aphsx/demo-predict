#!/bin/bash
set -e

MODEL_DIR="${MODEL_DIR:-/app/models}"
DATA_DIR="${DATA_DIR:-/data}"

# ── Docker mode: train only if no models exist ──
if [ -n "$DOCKER_BUILD" ]; then
  if [ ! -f "$MODEL_DIR/churn_model.pkl" ]; then
    echo "=== [Docker] No models found — training ==="
    if [ -f "$DATA_DIR"/*.xlsx ]; then
      DATA_FILE=$(ls $DATA_DIR/*.xlsx | head -1)
      echo "Data: $DATA_FILE"
      python train.py "$DATA_FILE"
      echo "=== Training complete ==="
    else
      echo "ERROR: No data in $DATA_DIR — cannot train"
      exit 1
    fi
  else
    echo "=== [Docker] Models found — skipping training ==="
    echo "To retrain: docker-compose exec ml python train.py /data/<filename>"
  fi
else
  # Local mode: check models exist
  echo "=== [Local] Checking models... ==="
  if [ ! -f "$MODEL_DIR/churn_model.pkl" ]; then
    echo "ERROR: No trained models found at $MODEL_DIR"
    echo "Please train first: python train.py <data_file>"
    exit 1
  fi
  echo "Models found"
fi

exec uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload