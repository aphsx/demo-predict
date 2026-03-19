#!/usr/bin/env python3
"""
1Moby Analytics — Training Pipeline CLI

Usage:
    python train.py data/1Moby_Data.xlsx
    python train.py data/1Moby_Data.xlsx --cutoff 2025-07-01
"""

import sys
import json
import argparse
import warnings
warnings.filterwarnings("ignore")

import pandas as pd
from pathlib import Path
from datetime import datetime

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from src.config import CUTOFF, MODELS_DIR, MODEL_FILES
from src.data_loader import load_data, define_active, build_churn_labels
from src.features import build_features
from src.monitoring import save_baseline
from src.models import churn_model, clv_model, credit_model


def main():
    parser = argparse.ArgumentParser(description="1Moby ML Training Pipeline")
    parser.add_argument("data_path", help="Path to Excel data file")
    parser.add_argument("--cutoff", default=str(CUTOFF.date()),
                        help="Point-in-time cutoff date (YYYY-MM-DD)")
    parser.add_argument("--out_dir", default=str(MODELS_DIR),
                        help="Output directory for model artifacts")
    args = parser.parse_args()

    cutoff  = pd.Timestamp(args.cutoff)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(exist_ok=True)

    print("=" * 60)
    print("1MOBY ANALYTICS PIPELINE V3")
    print(f"  Data:    {args.data_path}")
    print(f"  Cutoff:  {cutoff.date()}")
    print(f"  Output:  {out_dir}")
    print("=" * 60)

    # ── Layer 1: Load data ────────────────────────────────────────
    print("\n[1/4] Loading data...")
    users, payments, usage = load_data(args.data_path)

    # ── Layer 1: Build features ───────────────────────────────────
    print("\n[2/4] Building features...")
    feat_df = build_features(users, payments, usage, cutoff)

    # Tier 1: Business rule — who is already churned
    active_set      = define_active(usage, payments, cutoff)
    active_post_set = build_churn_labels(usage, payments, cutoff)

    n_active   = len(active_set)
    n_churned  = len(feat_df) - n_active
    churn_rate = 1 - len(active_set & active_post_set) / max(len(active_set), 1)
    print(f"\n  Active (6m): {n_active:,}  |  Already churned: {n_churned:,}")
    print(f"  Churn rate in active set: {churn_rate:.1%}")

    # ── Layer 3a: Churn model ─────────────────────────────────────
    churn_result = churn_model.train(feat_df, active_set, active_post_set, out_dir)

    # ── Layer 3b: CLV model ───────────────────────────────────────
    clv_result = clv_model.train(payments, cutoff, out_dir)

    # ── Layer 3c: Credit model ────────────────────────────────────
    credit_result = credit_model.train(payments, usage, cutoff, out_dir)

    # ── Layer 4: Save metrics + baseline ─────────────────────────
    print("\n[4/4] Saving artifacts...")

    all_metrics = {
        "generated_at": datetime.now().isoformat(),
        "cutoff":        str(cutoff.date()),
        "population": {
            "total_customers":   len(feat_df),
            "active_customers":  n_active,
            "already_churned":   n_churned,
        },
        "churn_model":   churn_result["metrics"],
        "churn_competition": churn_result["competition"],
        "clv_model":     clv_result["metrics"],
        "credit_model":  credit_result["metrics"],
    }
    with open(out_dir / MODEL_FILES["metrics"], "w") as f:
        json.dump(all_metrics, f, indent=2)

    save_baseline(feat_df, out_dir / MODEL_FILES["monitoring"])

    # ── Summary ───────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)
    print(f"\nOutput files in {out_dir}/:")
    for fp in sorted(out_dir.iterdir()):
        print(f"  {fp.name:<40} {fp.stat().st_size / 1024:>8.1f} KB")

    cm = churn_result["metrics"]
    cv = clv_result["metrics"]
    cr = credit_result["metrics"]
    print(f"""
Key results:
  Churn  AUC      : {cm['auc']}    Precision: {cm['precision']}
  CLV    Spearman : {cv['spearman']}    95% coverage: {cv['coverage_95']:.1%}
  Credit P50 MAE  : {cr['p50_mae']} d  MedAE: {cr['p50_medae']} d
  Credit Coverage : P10-P90={cr['coverage_p10_p90_after']:.1%}  P25-P75={cr['coverage_p25_p75_after']:.1%}
""")


if __name__ == "__main__":
    main()
