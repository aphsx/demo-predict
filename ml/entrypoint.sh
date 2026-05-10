#!/bin/bash
set -e

MODEL_DIR="${MODEL_DIR:-/app/models}"
DATA_DIR="${DATA_DIR:-/data}"

# Train in background — don't block API startup
if [ -n "$DOCKER_BUILD" ]; then
  echo "=== [Docker] Starting background training ==="
  if [ -f "$DATA_DIR"/*.xlsx ]; then
    DATA_FILE=$(ls $DATA_DIR/*.xlsx | head -1)
    echo "Data: $DATA_FILE"
    python train.py "$DATA_FILE" >> /tmp/train.log 2>&1 &
    echo "Training started in background (PID $!)"
  else
    echo "WARNING: No data in $DATA_DIR"
  fi
else
  # Local mode: fail if no models
  if [ ! -f "$MODEL_DIR/churn_model.pkl" ]; then
    echo "ERROR: No models — run: python train.py <data_file>"
    exit 1
  fi
  echo "Models found"
fi

exec uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload