import pandas as pd
import os
from datetime import datetime

def log_experiment(model_name, metrics, config_name="Default"):
    """
    Simple experiment tracker that saves results to a CSV file.
    In a real production environment, this would be MLflow or W&B.
    """
    log_file = "output/experiment_log.csv"
    
    # Create directory if not exists
    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    
    new_entry = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "config": config_name,
        "model": model_name,
        **metrics
    }
    
    df_new = pd.DataFrame([new_entry])
    
    if os.path.exists(log_file):
        df_old = pd.read_csv(log_file)
        df_final = pd.concat([df_old, df_new], ignore_index=True)
    else:
        df_final = df_new
        
    df_final.to_csv(log_file, index=False)
    print(f"  📝 Experiment logged to {log_file}")
