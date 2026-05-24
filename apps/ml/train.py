#!/usr/bin/env python3
"""
1Moby -- Training CLI V2
Trains all 5 models, saves metrics + detailed training log + model version to DB
Usage: python train.py data/1Moby_Data.xlsx
"""
import sys, io, os
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
    import asyncio
    import asyncpg
    from datetime import datetime

    path = sys.argv[1] if len(sys.argv) > 1 else os.getenv("DATA_DIR", "data") + "/1Moby_Data.xlsx"

    # Optional second arg overrides config/env (e.g. python train.py data.xlsx 2026-01-01)
    if len(sys.argv) > 2:
        CUTOFF = pd.Timestamp(sys.argv[2])
    print(f"Training from: {path}")
    print(f"Cutoff: {CUTOFF}")
    print("=" * 60)

    # Capture stdout for training log
    class TeeOutput:
        def __init__(self):
            self.log = []
            self.stdout = sys.stdout
        def write(self, text):
            self.log.append(text)
            self.stdout.write(text)
        def flush(self):
            self.stdout.flush()
        def get_log(self):
            return "".join(self.log)

    tee = TeeOutput()
    sys.stdout = tee

    users, payments, usage = load_data(path)
    feat = build_features(users, payments, usage, CUTOFF)
    active_set      = define_active(usage, payments, CUTOFF)
    active_post_set = build_churn_labels(usage, payments, CUTOFF)

    # Data summary
    print(f"\n--- Data Summary ---")
    print(f"  Total users: {len(users):,}")
    print(f"  Total payments: {len(payments):,}")
    print(f"  Total usage rows: {len(usage):,}")
    print(f"  Active (before cutoff): {len(active_set):,}")
    print(f"  Active (after cutoff): {len(active_post_set):,}")
    print(f"  Features: {feat.shape[1] - 1}")

    cr = churn_model.train(feat, active_set, active_post_set, MODELS_DIR)
    lv = clv_model.train(payments, CUTOFF, MODELS_DIR)
    ct = credit_model.train(payments, usage, CUTOFF, MODELS_DIR)
    wb = winback_model.train(users, payments, usage, CUTOFF, MODELS_DIR)
    cv = conversion_model.train(users, payments, usage, CUTOFF, MODELS_DIR)

    sys.stdout = tee.stdout

    # Save metrics
    metrics = {
        "generated_at": datetime.now().isoformat(),
        "cutoff_date": str(CUTOFF.date()),
        "data_summary": {
            "total_users": len(users),
            "total_payments": len(payments),
            "total_usage_rows": len(usage),
            "active_before_cutoff": len(active_set),
            "active_after_cutoff": len(active_post_set),
            "n_features": feat.shape[1] - 1,
        },
        "churn": cr["metrics"],
        "churn_competition": cr.get("competition", {}),
        "churn_shap_top10": cr.get("shap", []),
        "clv": lv["metrics"],
        "credit": ct["metrics"],
        "winback": wb["metrics"],
        "conversion": cv.get("metrics", {}),
    }
    with open(MODELS_DIR / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2, default=str)

    # Save full training log as text
    with open(MODELS_DIR / "training_log.txt", "w") as f:
        f.write(tee.get_log())

    save_baseline(feat, MODELS_DIR / "monitoring_baseline.json")

    # ── Register model versions in DB ─────────────────────────────
    import asyncpg

    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://moby:moby1234@localhost:5433/moby")

    async def _register():
        conn = await asyncpg.connect(DATABASE_URL)
        model_entries = [
            ("churn",      "churn_model.pkl",      cr.get("metrics", {})),
            ("clv",        "ltv_bgnbd.pkl",         lv.get("metrics", {})),
            ("credit",     "credit_q50.pkl",        ct.get("metrics", {})),
            ("winback",    "winback_model.pkl",     wb.get("metrics", {})),
            ("conversion", "conversion_model.pkl", cv.get("metrics", {})),
        ]
        for model_type, file_path, model_metrics in model_entries:
            version = datetime.now().strftime("%Y%m%d_%H%M%S")
            metrics_json = json.dumps(model_metrics, default=str)
            model_path = str(MODELS_DIR / file_path)
            await conn.execute("""
                UPDATE model_versions SET is_active = FALSE
                WHERE model_type = $1 AND is_active = TRUE
            """, model_type)
            await conn.execute("""
                INSERT INTO model_versions (model_type, version, metrics_json, model_file_path, is_active)
                VALUES ($1, $2, $3::jsonb, $4, TRUE)
            """, model_type, version, metrics_json, model_path)
        await conn.close()

    asyncio.run(_register())
    print("Model versions registered in DB.")

    # Upload artifacts to R2 if configured (no-op on local filesystem)
    from src.storage import upload_models
    upload_models(MODELS_DIR)

    print("\n" + "=" * 60)
    print("Training complete. Models trained:")
    print("  1. Churn model      (Active Paid -> P(churn))")
    print("  2. CLV model        (Active Paid -> predicted revenue)")
    print("  3. Credit model     (Active Paid -> days to next purchase)")
    print("  4. Win-back model   (Churned -> P(comeback))")
    print("  5. Conversion model (Active Free -> P(convert to paid))")
    print(f"\nArtifacts saved to: {MODELS_DIR}")
