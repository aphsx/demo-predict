#!/usr/bin/env python3
"""
1Moby — Training CLI
Usage: python train.py data/1Moby_Data.xlsx
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

if __name__ == "__main__":
    from src.config import CUTOFF, MODELS_DIR
    import pandas as pd
    from src.data_loader import load_data, define_active, build_churn_labels
    from src.features import build_features
    from src.models import churn_model, clv_model, credit_model
    from src.monitoring import save_baseline
    import json
    from datetime import datetime

    path = sys.argv[1] if len(sys.argv) > 1 else "data/1Moby_Data.xlsx"
    print(f"Training from: {path}")

    users, payments, usage = load_data(path)
    feat = build_features(users, payments, usage, CUTOFF)
    active_set      = define_active(usage, payments, CUTOFF)
    active_post_set = build_churn_labels(usage, payments, CUTOFF)

    cr = churn_model.train(feat, active_set, active_post_set, MODELS_DIR)
    lv = clv_model.train(payments, CUTOFF, MODELS_DIR)
    ct = credit_model.train(payments, usage, CUTOFF, MODELS_DIR)

    metrics = {"generated_at": datetime.now().isoformat(),
               "churn": cr["metrics"], "clv": lv["metrics"], "credit": ct["metrics"]}
    with open(MODELS_DIR / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)

    save_baseline(feat, MODELS_DIR / "monitoring_baseline.json")
    print("✅ Training complete!")
