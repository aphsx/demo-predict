"""
1Moby Analytics — Customer Lifetime Value Model
BG/NBD + Gamma-Gamma + Empirical Residual PI (FIX V3)
"""

import dill
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path
from scipy.stats import spearmanr
from lifetimes import BetaGeoFitter, GammaGammaFitter
from lifetimes.utils import summary_data_from_transaction_data

from src.config import (
    CUTOFF, CLV_HORIZON_DAYS, CLV_PENALIZER, CLV_PI_DECILES,
    MODEL_FILES, MODELS_DIR,
)
from src.rfm import rfm_quintile_score


def train(payments: pd.DataFrame, cutoff: pd.Timestamp = CUTOFF,
          out_dir: Path = MODELS_DIR) -> dict:
    """
    Fit BG/NBD + Gamma-Gamma, คำนวณ Residual PI, RFM segments
    Save: ltv_bgnbd.pkl, ltv_gg.pkl, rfm_segments.csv
    Returns: metrics dict
    """
    print("\n[CLV] Training BG/NBD + Gamma-Gamma...")

    p_pre = payments[payments["payment_date"] < cutoff].copy()

    # ── RFM summary ───────────────────────────────────────────────
    rfm = summary_data_from_transaction_data(
        p_pre, "acc_id", "payment_date",
        monetary_value_col="amount",
        observation_period_end=cutoff,
    )
    rfm_fit = rfm[(rfm["frequency"] > 0) & (rfm["monetary_value"] > 0)].copy()
    print(f"  Repeat buyers for fitting: {len(rfm_fit):,}")

    # ── BG/NBD ────────────────────────────────────────────────────
    bgf = BetaGeoFitter(penalizer_coef=CLV_PENALIZER)
    bgf.fit(rfm_fit["frequency"], rfm_fit["recency"], rfm_fit["T"])
    print(f"  BG/NBD: r={bgf.params_['r']:.4f} alpha={bgf.params_['alpha']:.4f} "
          f"a={bgf.params_['a']:.4f} b={bgf.params_['b']:.4f}")

    # ── Gamma-Gamma ───────────────────────────────────────────────
    corr = rfm_fit[["frequency", "monetary_value"]].corr().iloc[0, 1]
    print(f"  Freq-Monetary corr: {corr:.3f} {'[OK]' if abs(corr) < 0.3 else '[FAIL]'} (need < 0.3)")

    ggf = GammaGammaFitter(penalizer_coef=CLV_PENALIZER)
    ggf.fit(rfm_fit["frequency"], rfm_fit["monetary_value"])

    # ── CLV predictions ───────────────────────────────────────────
    rfm_fit["p_alive"]            = bgf.conditional_probability_alive(
        rfm_fit["frequency"], rfm_fit["recency"], rfm_fit["T"])
    rfm_fit["expected_purchases"] = bgf.conditional_expected_number_of_purchases_up_to_time(
        CLV_HORIZON_DAYS, rfm_fit["frequency"], rfm_fit["recency"], rfm_fit["T"])
    rfm_fit["avg_revenue"]        = ggf.conditional_expected_average_profit(
        rfm_fit["frequency"], rfm_fit["monetary_value"])
    rfm_fit["predicted_clv_6m"]   = rfm_fit["expected_purchases"] * rfm_fit["avg_revenue"]

    # ── Residual PI per decile (FIX V3) ───────────────────────────
    post_end = cutoff + pd.DateOffset(months=6)
    actual   = payments[(payments["payment_date"] >= cutoff) &
                        (payments["payment_date"] < post_end)
                        ].groupby("acc_id")["amount"].sum()
    rfm_eval = rfm_fit.merge(actual.rename("actual_6m"), on="acc_id", how="inner")
    decile_stats = _compute_decile_stats(rfm_eval)

    cov95, cov80 = _evaluate_coverage(rfm_eval, decile_stats)
    spear        = float(spearmanr(rfm_eval["predicted_clv_6m"], rfm_eval["actual_6m"])[0])
    top10_lift   = (_nlargest_revenue(rfm_eval, 0.10) / rfm_eval["actual_6m"].sum())
    mae          = float(np.abs(rfm_eval["actual_6m"] - rfm_eval["predicted_clv_6m"]).mean())
    medae        = float(np.abs(rfm_eval["actual_6m"] - rfm_eval["predicted_clv_6m"]).median())

    metrics = {
        "spearman":         round(spear, 4),
        "top_decile_lift":  round(float(top10_lift), 4),
        "mae":              round(mae, 2),
        "medae":            round(medae, 2),
        "avg_p_alive":      round(float(rfm_fit["p_alive"].mean()), 4),
        "avg_clv_6m":       round(float(rfm_fit["predicted_clv_6m"].mean()), 2),
        "median_clv_6m":    round(float(rfm_fit["predicted_clv_6m"].median()), 2),
        "coverage_95":      round(float(cov95), 4),
        "coverage_80":      round(float(cov80), 4),
    }
    print(f"\n  CLV Metrics:")
    for k, v in metrics.items():
        print(f"    {k}: {v}")

    # ── RFM Segmentation (all buyers) ─────────────────────────────
    rfm_full = summary_data_from_transaction_data(
        p_pre, "acc_id", "payment_date",
        monetary_value_col="amount",
        observation_period_end=cutoff,
    ).reset_index()
    rfm_full["p_alive"] = bgf.conditional_probability_alive(
        rfm_full["frequency"], rfm_full["recency"], rfm_full["T"])
    rfm_full["predicted_clv_6m"] = (
        bgf.conditional_expected_number_of_purchases_up_to_time(
            CLV_HORIZON_DAYS, rfm_full["frequency"],
            rfm_full["recency"], rfm_full["T"])
        * ggf.conditional_expected_average_profit(
            rfm_full["frequency"].clip(lower=1),
            rfm_full["monetary_value"].fillna(0))
    )
    rfm_full = rfm_quintile_score(rfm_full)

    # ── Plots ─────────────────────────────────────────────────────
    _save_plots(rfm_fit, rfm_eval, rfm_full, out_dir)

    # ── Save artifacts ────────────────────────────────────────────
    with open(out_dir / MODEL_FILES["ltv_bgnbd"], "wb") as f:
        dill.dump({"model": bgf, "decile_stats": decile_stats}, f)
    with open(out_dir / MODEL_FILES["ltv_gg"], "wb") as f:
        dill.dump(ggf, f)
    rfm_full.to_csv(out_dir / MODEL_FILES["rfm_segments"], index=False)

    return {"metrics": metrics, "rfm_full": rfm_full}


def predict(payments: pd.DataFrame, cutoff: pd.Timestamp = CUTOFF,
            models_dir: Path = MODELS_DIR) -> pd.DataFrame:
    """
    คืน DataFrame: acc_id, predicted_clv_6m, ci_95_lo, ci_95_hi,
                   ci_80_lo, ci_80_hi, p_alive
    """
    bgf_art = _load_bgf(models_dir)
    bgf     = bgf_art["model"]
    ds      = bgf_art["decile_stats"]
    ggf     = _load_ggf(models_dir)

    p_pre = payments[payments["payment_date"] < cutoff]
    rfm   = summary_data_from_transaction_data(
        p_pre, "acc_id", "payment_date",
        monetary_value_col="amount",
        observation_period_end=cutoff,
    ).reset_index()

    rfm["p_alive"] = bgf.conditional_probability_alive(
        rfm["frequency"], rfm["recency"], rfm["T"])
    rfm["expected_purchases"] = bgf.conditional_expected_number_of_purchases_up_to_time(
        CLV_HORIZON_DAYS, rfm["frequency"], rfm["recency"], rfm["T"])
    rfm["avg_revenue"]      = ggf.conditional_expected_average_profit(
        rfm["frequency"].clip(lower=1), rfm["monetary_value"].fillna(0))
    rfm["predicted_clv_6m"] = rfm["expected_purchases"] * rfm["avg_revenue"]

    # Assign decile and compute PI
    rfm["decile"] = pd.qcut(rfm["predicted_clv_6m"], CLV_PI_DECILES,
                             labels=False, duplicates="drop").fillna(0).astype(int)
    fallback = ds.get(5, {"p2_5": 0, "p10": 0, "p90": 0, "p97_5": 0})

    lo95, hi95, lo80, hi80 = [], [], [], []
    for _, row in rfm.iterrows():
        stat = ds.get(int(row["decile"]), fallback)
        lo95.append(max(0, row["predicted_clv_6m"] + stat["p2_5"]))
        hi95.append(max(0, row["predicted_clv_6m"] + stat["p97_5"]))
        lo80.append(max(0, row["predicted_clv_6m"] + stat["p10"]))
        hi80.append(max(0, row["predicted_clv_6m"] + stat["p90"]))

    rfm["ci_95_lo"] = lo95; rfm["ci_95_hi"] = hi95
    rfm["ci_80_lo"] = lo80; rfm["ci_80_hi"] = hi80

    rfm = rfm_quintile_score(rfm)
    return rfm[["acc_id", "predicted_clv_6m", "ci_95_lo", "ci_95_hi",
                "ci_80_lo", "ci_80_hi", "p_alive"]].copy()


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def _compute_decile_stats(rfm_eval: pd.DataFrame) -> dict:
    """FIX V3: Empirical quantile PI แทน Gaussian"""
    rfm_eval = rfm_eval.copy()
    rfm_eval["decile"] = pd.qcut(rfm_eval["predicted_clv_6m"],
                                  CLV_PI_DECILES, labels=False, duplicates="drop").fillna(0).astype(int)
    global_resids = rfm_eval["actual_6m"] - rfm_eval["predicted_clv_6m"]
    fallback = {
        "p2_5": float(global_resids.quantile(0.025)),
        "p10":  float(global_resids.quantile(0.10)),
        "p90":  float(global_resids.quantile(0.90)),
        "p97_5":float(global_resids.quantile(0.975)),
    }
    stats = {}
    for d, grp in rfm_eval.groupby("decile"):
        resids = grp["actual_6m"] - grp["predicted_clv_6m"]
        if len(resids) < 4:
            stats[int(d)] = fallback
        else:
            stats[int(d)] = {
                "p2_5":  float(resids.quantile(0.025)),
                "p10":   float(resids.quantile(0.10)),
                "p90":   float(resids.quantile(0.90)),
                "p97_5": float(resids.quantile(0.975)),
            }
    if 5 not in stats:
        stats[5] = fallback
    return stats


def _evaluate_coverage(rfm_eval: pd.DataFrame, decile_stats: dict) -> tuple:
    rfm_eval = rfm_eval.copy()
    rfm_eval["decile"] = pd.qcut(rfm_eval["predicted_clv_6m"],
                                  CLV_PI_DECILES, labels=False, duplicates="drop").fillna(0).astype(int)
    fallback = decile_stats.get(5, {"p2_5": 0, "p10": 0, "p90": 0, "p97_5": 0})
    in95, in80 = [], []
    for _, row in rfm_eval.iterrows():
        s  = decile_stats.get(int(row["decile"]), fallback)
        a  = row["actual_6m"]
        p  = row["predicted_clv_6m"]
        in95.append((p + s["p2_5"]) <= a <= (p + s["p97_5"]))
        in80.append((p + s["p10"])  <= a <= (p + s["p90"]))
    return float(np.mean(in95)), float(np.mean(in80))


def _nlargest_revenue(rfm_eval: pd.DataFrame, frac: float) -> float:
    n = max(1, int(len(rfm_eval) * frac))
    return rfm_eval.nlargest(n, "predicted_clv_6m")["actual_6m"].sum()


def _load_bgf(models_dir: Path) -> dict:
    with open(_resolve_model_file(models_dir, MODEL_FILES["ltv_bgnbd"]), "rb") as f:
        return dill.load(f)


def _load_ggf(models_dir: Path) -> GammaGammaFitter:
    with open(_resolve_model_file(models_dir, MODEL_FILES["ltv_gg"]), "rb") as f:
        return dill.load(f)


def _resolve_model_file(models_dir: Path, filename: str) -> Path:
    requested = Path(models_dir) / filename
    local_default = Path(__file__).resolve().parents[2] / "models" / filename
    candidates = [requested]
    if local_default != requested:
        candidates.append(local_default)

    for candidate in candidates:
        if candidate.exists():
            return candidate

    searched = "\n".join(f"- {p}" for p in candidates)
    raise FileNotFoundError(
        f"Model artifact not found: {filename}\n"
        f"Searched:\n{searched}\n"
        "Train models first with: python train.py data/1Moby_Data.xlsx"
    )


def _save_plots(rfm_fit, rfm_eval, rfm_full, out_dir: Path) -> None:
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    axes[0].hist(rfm_fit["p_alive"], bins=30, edgecolor="k")
    axes[0].set_title("P(alive) distribution")
    if len(rfm_eval) > 0:
        axes[1].scatter(rfm_eval["predicted_clv_6m"], rfm_eval["actual_6m"], alpha=0.3, s=10)
        axes[1].set_xlabel("Predicted CLV"); axes[1].set_ylabel("Actual revenue")
        axes[1].set_title("Predicted vs Actual CLV")
    rfm_full["rfm_segment"].value_counts().plot.bar(ax=axes[2])
    axes[2].set_title("RFM Segments"); plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig(out_dir / "clv_eval.png", dpi=120)
    plt.close()
