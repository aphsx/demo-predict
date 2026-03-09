import pandas as pd
import os
from datetime import datetime


def log_experiment(model_name, metrics, config_name="Default", log_path=None):
    """
    Lightweight experiment tracker.
    Writes one row per run to a CSV file.

    Parameters
    ----------
    model_name  : str
    metrics     : dict  — any numeric metrics to record
    config_name : str   — a label for the experiment configuration
    log_path    : str | None
        Absolute or relative path to the CSV log file.
        Defaults to "output/experiment_log.csv" (relative to CWD).
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
    print(f"  [log] Experiment recorded → {log_file}")
