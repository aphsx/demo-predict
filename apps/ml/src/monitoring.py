"""
1Moby Analytics — Model Monitoring
PSI + KS test + drift alerts
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path
from scipy.stats import ks_2samp


def compute_psi(expected: np.ndarray, actual: np.ndarray,
                bins: int = 10) -> float:
    """
    Population Stability Index — วัดว่า feature distribution เปลี่ยนไปแค่ไหน
    PSI < 0.10  -> normal
    PSI 0.10-0.25 -> warning
    PSI > 0.25  -> retrain
    """
    eps = 1e-8
    breakpoints = np.linspace(0, 100, bins + 1)
    exp_pcts = np.percentile(expected, breakpoints)
    exp_pcts = np.unique(exp_pcts)

    exp_counts = np.histogram(expected, bins=exp_pcts)[0]
    act_counts = np.histogram(actual,   bins=exp_pcts)[0]

    exp_pct = (exp_counts / len(expected)) + eps
    act_pct = (act_counts / len(actual))   + eps

    psi = np.sum((act_pct - exp_pct) * np.log(act_pct / exp_pct))
    return float(psi)


def check_feature_drift(baseline: dict, current_df: pd.DataFrame,
                         psi_threshold: float = 0.25) -> dict:
    """
    ตรวจ PSI ทุก feature เทียบกับ baseline
    Returns: {feature: {"psi": float, "alert": bool}}
    """
    results = {}
    for col, stats in baseline["features"].items():
        if col not in current_df.columns:
            continue
        current_vals  = current_df[col].dropna().values
        baseline_vals = np.random.normal(stats["mean"], stats["std"] + 1e-8, 1000)
        psi = compute_psi(baseline_vals, current_vals)
        results[col] = {
            "psi":   round(psi, 4),
            "alert": psi > psi_threshold,
        }
    alert_count = sum(1 for v in results.values() if v["alert"])
    print(f"  Feature drift: {alert_count}/{len(results)} features flagged (PSI > {psi_threshold})")
    return results


def check_prediction_drift(baseline_probs: np.ndarray,
                            new_probs: np.ndarray,
                            p_threshold: float = 0.05) -> dict:
    """
    KS test บน churn probability distribution
    Returns: {"ks_stat": float, "p_value": float, "alert": bool}
    """
    stat, p = ks_2samp(baseline_probs, new_probs)
    alert   = p < p_threshold
    if alert:
        print(f"  [WARN]  Prediction drift detected: KS={stat:.4f} p={p:.4f}")
    else:
        print(f"  Prediction drift: OK (KS={stat:.4f} p={p:.4f})")
    return {"ks_stat": round(float(stat), 4), "p_value": round(float(p), 4), "alert": alert}


def save_baseline(feat_df: pd.DataFrame, out_path: Path) -> None:
    """
    บันทึก feature distribution เป็น baseline สำหรับ drift detection
    """
    feat_num = feat_df.select_dtypes(include=np.number).drop(columns=["acc_id"], errors="ignore")
    baseline = {
        "cutoff":   str(feat_df.get("cutoff", ["unknown"])[0]) if "cutoff" in feat_df else "unknown",
        "n_customers": len(feat_df),
        "features": {
            col: {
                "mean": round(float(feat_num[col].mean()), 4),
                "std":  round(float(feat_num[col].std()),  4),
                "p50":  round(float(feat_num[col].median()), 4),
                "p95":  round(float(feat_num[col].quantile(0.95)), 4),
            }
            for col in feat_num.columns
        }
    }
    with open(out_path, "w") as f:
        json.dump(baseline, f, indent=2)
    print(f"  Monitoring baseline saved -> {out_path}")


def load_baseline(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def run_weekly_checks(feat_df: pd.DataFrame, churn_probs: np.ndarray,
                      baseline_path: Path) -> dict:
    """
    รัน weekly monitoring checks ทั้งหมด
    """
    baseline = load_baseline(baseline_path)
    drift    = check_feature_drift(baseline, feat_df)
    pred_dr  = check_prediction_drift(
        np.array([v["mean"] for v in baseline["features"].values() if "mean" in v]),
        churn_probs
    )
    return {"feature_drift": drift, "prediction_drift": pred_dr}
