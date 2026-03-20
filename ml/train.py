#!/usr/bin/env python3
"""
1Moby — Training CLI V2
Trains all 5 models: Churn, CLV, Credit, Win-back, Conversion
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
    from src.models import churn_model, clv_model, credit_model, winback_model, conversion_model
    from src.monitoring import save_baseline
    import json
    from datetime import datetime

    path = sys.argv[1] if len(sys.argv) > 1 else "data/1Moby_Data.xlsx"
    print(f"Training from: {path}")
    print(f"Cutoff: {CUTOFF}")
    print("=" * 60)

    users, payments, usage = load_data(path)
    feat = build_features(users, payments, usage, CUTOFF)
    active_set      = define_active(usage, payments, CUTOFF)
    active_post_set = build_churn_labels(usage, payments, CUTOFF)

    # ── Model 1: Churn (Active Paid) ────────────────────────────
    cr = churn_model.train(feat, active_set, active_post_set, MODELS_DIR)

    # ── Model 2: CLV (BG/NBD + Gamma-Gamma) ─────────────────────
    lv = clv_model.train(payments, CUTOFF, MODELS_DIR)

    # ── Model 3: Credit (Quantile Regression) ────────────────────
    ct = credit_model.train(payments, usage, CUTOFF, MODELS_DIR)

    # ── Model 4: Win-back (Churned customers) ────────────────────
    wb = winback_model.train(users, payments, usage, CUTOFF, MODELS_DIR)

    # ── Model 5: Conversion (Free → Paid) ────────────────────────
    cv = conversion_model.train(users, payments, usage, CUTOFF, MODELS_DIR)

    # ── Save metrics ──────────────────────────────────────────────
    metrics = {
        "generated_at": datetime.now().isoformat(),
        "churn": cr["metrics"],
        "clv": lv["metrics"],
        "credit": ct["metrics"],
        "winback": wb["metrics"],
        "conversion": cv.get("metrics", {}),
    }
    with open(MODELS_DIR / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2, default=str)

    save_baseline(feat, MODELS_DIR / "monitoring_baseline.json")

    print("\n" + "=" * 60)
    print("✅ Training complete! Models trained:")
    print("  1. Churn model      (Active Paid → P(churn))")
    print("  2. CLV model        (Active Paid → predicted revenue)")
    print("  3. Credit model     (Active Paid → days to next purchase)")
    print("  4. Win-back model   (Churned → P(comeback))")
    print("  5. Conversion model (Active Free → P(convert to paid))")
    print(f"\nAll artifacts saved to: {MODELS_DIR}")
