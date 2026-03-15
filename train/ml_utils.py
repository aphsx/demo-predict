import os
import pandas as pd
import numpy as np
from datetime import datetime


def log_experiment(model_name, metrics, config_name="Default", log_path=None):
    """
    Lightweight experiment tracker.
    Appends one row per training run to a CSV file for reproducibility.
    """
    log_file = log_path if log_path else "output/experiment_log.csv"
    os.makedirs(os.path.dirname(os.path.abspath(log_file)), exist_ok=True)

    new_entry = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "config"   : config_name,
        "model"    : model_name,
        **metrics,
    }
    df_new = pd.DataFrame([new_entry])

    if os.path.exists(log_file):
        df_old   = pd.read_csv(log_file)
        df_final = pd.concat([df_old, df_new], ignore_index=True)
    else:
        df_final = df_new

    df_final.to_csv(log_file, index=False)
    print(f"  [log] Experiment recorded -> {log_file}")


def ks_statistic(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    """
    Kolmogorov-Smirnov (KS) statistic.

    Measures the maximum separation between the cumulative distributions
    of predicted churn scores for churned vs active customers.

    Range : [0, 1] -- higher is better
    Target: KS > 0.40 is considered a good model in credit/churn literature
    """
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)

    pos_scores = np.sort(y_prob[y_true == 1])
    neg_scores = np.sort(y_prob[y_true == 0])

    if len(pos_scores) == 0 or len(neg_scores) == 0:
        return 0.0

    all_thresholds = np.unique(np.concatenate([pos_scores, neg_scores]))
    ks = 0.0
    for t in all_thresholds:
        tpr = (pos_scores >= t).mean()
        fpr = (neg_scores >= t).mean()
        ks  = max(ks, abs(tpr - fpr))
    return float(ks)


def lift_at_percentile(
    y_true: np.ndarray, y_prob: np.ndarray, percentile: int = 20
) -> float:
    """
    Lift at top-N% of scored customers.

    Answers: "If we target the top {percentile}% by risk score, how many
    times MORE churners do we catch compared with random targeting?"

    Lift = (churn rate in top-N%) / (overall churn rate)

    A Lift@20% of 2.5x means targeting the top-20% catches 2.5× as many
    churners per contacted customer as a random outreach campaign.
    """
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)

    n_top = max(1, int(len(y_true) * percentile / 100))
    top_idx = np.argsort(y_prob)[::-1][:n_top]

    top_churn_rate  = y_true[top_idx].mean()
    base_churn_rate = y_true.mean()

    if base_churn_rate == 0:
        return 1.0
    return float(top_churn_rate / base_churn_rate)


def gain_table(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10) -> pd.DataFrame:
    """
    Compute a cumulative gain / lift table decile-by-decile.

    Returns a DataFrame with columns:
        decile, n_customers, n_churners, churn_rate_pct,
        cumulative_pct_customers, cumulative_pct_churners, lift
    """
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)

    order      = np.argsort(y_prob)[::-1]
    y_sorted   = y_true[order]
    n          = len(y_true)
    chunk_size = max(1, n // n_bins)
    base_rate  = y_true.mean()

    rows = []
    cum_customers = 0
    cum_churners  = 0
    for d in range(1, n_bins + 1):
        start = (d - 1) * chunk_size
        end   = d * chunk_size if d < n_bins else n
        chunk = y_sorted[start:end]

        cum_customers += len(chunk)
        cum_churners  += chunk.sum()

        rows.append({
            "decile"                     : d,
            "n_customers"                : len(chunk),
            "n_churners"                 : int(chunk.sum()),
            "churn_rate_pct"             : round(chunk.mean() * 100, 1),
            "cumulative_pct_customers"   : round(cum_customers / n * 100, 1),
            "cumulative_pct_churners"    : round(cum_churners / y_true.sum() * 100, 1),
            "lift"                       : round(
                (cum_churners / cum_customers) / base_rate if base_rate > 0 else 1.0, 2
            ),
        })

    return pd.DataFrame(rows)
