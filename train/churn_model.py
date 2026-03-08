"""
=======================================================
  Customer Churn Prediction Model
=======================================================
  Features:
  - Loads sample_users.csv & sample_payments.csv
  - Engineers churn label based on expiry + last_access
  - Builds rich behavioral features from payment history
  - Trains & evaluates multiple ML classifiers
  - Saves best sklearn model as output/churn_model.pkl
  - Saves SHAP TreeExplainer as output/shap_explainer.pkl
======================================================="""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings("ignore")
from pathlib import Path

# Resolve paths relative to this script file so it works from any CWD
SCRIPT_DIR = Path(__file__).parent

# ── ML Libraries ──────────────────────────────────────
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import (RandomForestClassifier, HistGradientBoostingClassifier,
                               ExtraTreesClassifier)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (classification_report, confusion_matrix,
                             roc_auc_score, roc_curve, ConfusionMatrixDisplay)
import matplotlib.pyplot as plt
import seaborn as sns
import joblib
import shap
from pathlib import Path

# ── Config ────────────────────────────────────────────
REFERENCE_DATE = datetime(2026, 3, 6)          # "today" for computing recency
CHURN_DAYS     = 90                             # inactive > 90 d since expire → churned
PAID_THRESHOLD = 7                             # days before expiry to flag at-risk trial

OUTPUT_DIR = SCRIPT_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# ══════════════════════════════════════════════════════
# 1. LOAD DATA
# ══════════════════════════════════════════════════════
def load_data():
    users    = pd.read_csv(SCRIPT_DIR / "data" / "sample_users.csv")
    payments = pd.read_csv(SCRIPT_DIR / "data" / "sample_payments.csv")

    # Parse dates
    date_cols_u = ["expire", "join_date", "last_access", "last_send"]
    for c in date_cols_u:
        users[c] = pd.to_datetime(users[c])

    payments["payment_date"] = pd.to_datetime(payments["payment_date"])
    return users, payments


# ══════════════════════════════════════════════════════
# 2. LABEL CHURN
# ══════════════════════════════════════════════════════
def label_churn(users: pd.DataFrame) -> pd.DataFrame:
    """
    Churn = 1 if:
      - Account expired AND last_access was > CHURN_DAYS before today, OR
      - Trial account expired (expire < today) with no payment conversion
    """
    df = users.copy()
    df["days_since_last_access"] = (REFERENCE_DATE - df["last_access"]).dt.days
    df["days_since_last_send"]   = (REFERENCE_DATE - df["last_send"]).dt.days
    df["days_until_expire"]      = (df["expire"] - REFERENCE_DATE).dt.days
    df["account_age_days"]       = (REFERENCE_DATE - df["join_date"]).dt.days

    # Churn rule
    expired      = df["expire"] < REFERENCE_DATE
    long_inactive = df["days_since_last_access"] > CHURN_DAYS
    df["churned"] = ((expired) & (long_inactive)).astype(int)

    return df


# ══════════════════════════════════════════════════════
# 3. PAYMENT FEATURE ENGINEERING
# ══════════════════════════════════════════════════════
def payment_features(payments: pd.DataFrame) -> pd.DataFrame:
    """Aggregate payment history into per-account features."""
    pf = payments.copy()
    pf["payment_recency_days"] = (REFERENCE_DATE - pf["payment_date"]).dt.days

    agg = pf.groupby("acc_id").agg(
        total_payments        = ("payment_date",    "count"),
        total_amount_paid     = ("amount",           "sum"),
        avg_amount_per_tx     = ("amount",           "mean"),
        total_sms_volume      = ("sms_volume",       "sum"),
        avg_sms_volume        = ("sms_volume",       "mean"),
        unique_products       = ("product_name",     "nunique"),
        last_payment_recency  = ("payment_recency_days", "min"),   # most recent
        first_payment_recency = ("payment_recency_days", "max"),   # oldest
        payment_span_days     = ("payment_recency_days", lambda x: x.max() - x.min()),
    ).reset_index()

    # Avg days between payments (purchase frequency)
    agg["avg_payment_gap_days"] = agg.apply(
        lambda r: r["payment_span_days"] / max(r["total_payments"] - 1, 1), axis=1
    )

    # Flag downgraded (last amount < average)
    last_amt = pf.sort_values("payment_date").groupby("acc_id").last()["amount"]
    agg = agg.merge(last_amt.rename("last_payment_amount"), on="acc_id", how="left")
    agg["downgraded"] = (agg["last_payment_amount"] < agg["avg_amount_per_tx"]).astype(int)

    # Dominant credit type
    dom_credit = pf.groupby("acc_id")["credit_type"].agg(
        lambda x: x.mode()[0] if not x.empty else "Unknown"
    ).rename("dominant_credit_type")
    agg = agg.merge(dom_credit, on="acc_id", how="left")

    return agg


# ══════════════════════════════════════════════════════
# 4. MERGE & FINAL FEATURE SET
# ══════════════════════════════════════════════════════
def build_features(users_labeled: pd.DataFrame,
                   pay_feats: pd.DataFrame) -> pd.DataFrame:
    df = users_labeled.merge(pay_feats, on="acc_id", how="left")

    # Fill NaN for accounts with no payment (trial never paid)
    pay_numeric_cols = [
        "total_payments", "total_amount_paid", "avg_amount_per_tx",
        "total_sms_volume", "avg_sms_volume", "unique_products",
        "last_payment_recency", "first_payment_recency", "payment_span_days",
        "avg_payment_gap_days", "last_payment_amount", "downgraded"
    ]
    df[pay_numeric_cols] = df[pay_numeric_cols].fillna(0)
    df["dominant_credit_type"] = df["dominant_credit_type"].fillna("None")

    # Encode categoricals
    le = LabelEncoder()
    df["status_enc"]       = le.fit_transform(df["status"])           # trial=1 / paid=0
    df["credit_enc"]       = le.fit_transform(df["credit"])
    df["dom_credit_enc"]   = le.fit_transform(df["dominant_credit_type"])

    return df


# ══════════════════════════════════════════════════════
# 5. TRAIN MODELS
# ══════════════════════════════════════════════════════
FEATURE_COLS = [
    "status_enc", "credit_enc",
    "days_since_last_access", "days_since_last_send",
    "days_until_expire", "account_age_days",
    "total_payments", "total_amount_paid", "avg_amount_per_tx",
    "total_sms_volume", "avg_sms_volume", "unique_products",
    "last_payment_recency", "avg_payment_gap_days",
    "last_payment_amount", "downgraded", "dom_credit_enc",
]

MODELS = {
    "Random Forest":          RandomForestClassifier(n_estimators=200, max_depth=6,
                                                      random_state=42, class_weight="balanced"),
    "Hist Gradient Boosting": HistGradientBoostingClassifier(max_iter=150, max_depth=4,
                                                              learning_rate=0.08,
                                                              random_state=42),  # NaN-native
    "Extra Trees":            ExtraTreesClassifier(n_estimators=200, max_depth=6,
                                                    random_state=42, class_weight="balanced"),
    "Logistic Regression":    LogisticRegression(max_iter=1000, class_weight="balanced",
                                                  C=0.5, random_state=42),
}


def train_and_evaluate(df: pd.DataFrame):
    X = df[FEATURE_COLS]
    y = df["churned"]

    # Impute any remaining NaN before scaling
    imputer = SimpleImputer(strategy="median")
    X_imp  = imputer.fit_transform(X)

    scaler = StandardScaler()
    X_sc   = scaler.fit_transform(X_imp)

    X_tr, X_te, y_tr, y_te = train_test_split(
        X_sc, y, test_size=0.3, random_state=42, stratify=y
    )

    results = {}
    best_model, best_auc = None, -1

    # Store imputer so predictions also go through it
    results["_imputer"] = imputer

    print("\n" + "═" * 60)
    print("  Model Evaluation Summary")
    print("═" * 60)

    for name, model in MODELS.items():
        model.fit(X_tr, y_tr)
        y_pred = model.predict(X_te)
        y_prob = model.predict_proba(X_te)[:, 1]
        auc    = roc_auc_score(y_te, y_prob)

        cv    = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        cv_sc = cross_val_score(model, X_sc, y, cv=cv, scoring="roc_auc")

        print(f"\n  [{name}]")
        print(f"  AUC (test):      {auc:.4f}")
        print(f"  CV AUC (5-fold): {cv_sc.mean():.4f} ± {cv_sc.std():.4f}")
        print(classification_report(y_te, y_pred, target_names=["Active", "Churned"],
                                    zero_division=0))

        results[name] = {
            "model":   model,
            "auc":     auc,
            "cv_mean": cv_sc.mean(),
            "y_pred":  y_pred,
            "y_prob":  y_prob,
            "y_te":    y_te,
        }

        if auc > best_auc:
            best_auc, best_model = auc, name

    print(f"\n  ✅ Best model: {best_model}  (AUC = {best_auc:.4f})")
    return results, best_model, scaler


# ══════════════════════════════════════════════════════
# 6. VISUALISATIONS
# ══════════════════════════════════════════════════════
def plot_all(df, results, best_model):
    plt.style.use("seaborn-v0_8-whitegrid")
    palette = ["#4C72B0", "#DD8452", "#55A868", "#C44E52"]

    # ── Fig 1: Churn distribution ──────────────────────
    fig, axes = plt.subplots(1, 3, figsize=(16, 5))
    fig.suptitle("Customer Overview", fontsize=15, fontweight="bold")

    sns.countplot(data=df, x="churned", hue="status",
                  palette=["#55A868", "#C44E52"], ax=axes[0])
    axes[0].set_title("Churn Count by Status")
    axes[0].set_xticklabels(["Active", "Churned"])

    sns.boxplot(data=df, x="churned", y="days_since_last_access",
                palette=["#55A868", "#C44E52"], ax=axes[1])
    axes[1].set_title("Days Since Last Access")
    axes[1].set_xticklabels(["Active", "Churned"])

    sns.boxplot(data=df, x="churned", y="total_amount_paid",
                palette=["#55A868", "#C44E52"], ax=axes[2])
    axes[2].set_title("Total Amount Paid")
    axes[2].set_xticklabels(["Active", "Churned"])

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "01_customer_overview.png", dpi=150)
    plt.close()

    # ── Fig 2: ROC curves ─────────────────────────────
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot([0, 1], [0, 1], "k--", lw=1, label="Random")
    for (name, r), col in zip(((k, v) for k, v in results.items() if k != "_imputer"), palette):
        fpr, tpr, _ = roc_curve(r["y_te"], r["y_prob"])
        ax.plot(fpr, tpr, color=col, lw=2,
                label=f"{name}  (AUC={r['auc']:.3f})")
    ax.set_xlabel("False Positive Rate"); ax.set_ylabel("True Positive Rate")
    ax.set_title("ROC Curves — All Models", fontweight="bold")
    ax.legend(loc="lower right", fontsize=9)
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "02_roc_curves.png", dpi=150)
    plt.close()

    # ── Fig 3: Feature Importance (best RF / ET / GB) ─
    bm = results[best_model]["model"]
    if hasattr(bm, "feature_importances_"):
        fi = pd.Series(bm.feature_importances_, index=FEATURE_COLS).sort_values()
        fig, ax = plt.subplots(figsize=(9, 6))
        fi.plot(kind="barh", color="#4C72B0", ax=ax)
        ax.set_title(f"Feature Importances — {best_model}", fontweight="bold")
        ax.set_xlabel("Importance")
        plt.tight_layout()
        plt.savefig(OUTPUT_DIR / "03_feature_importance.png", dpi=150)
        plt.close()

    # ── Fig 4: Confusion matrix ───────────────────────
    r   = results[best_model]
    cm  = confusion_matrix(r["y_te"], r["y_pred"])
    disp = ConfusionMatrixDisplay(cm, display_labels=["Active", "Churned"])
    fig, ax = plt.subplots(figsize=(6, 5))
    disp.plot(ax=ax, colorbar=False, cmap="Blues")
    ax.set_title(f"Confusion Matrix — {best_model}", fontweight="bold")
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "04_confusion_matrix.png", dpi=150)
    plt.close()

    # ── Fig 5: Churn probability distribution ─────────
    bm_obj = results[best_model]["model"]
    fig, ax = plt.subplots(figsize=(9, 5))
    for label, color, ls in [(0, "#55A868", "-"), (1, "#C44E52", "--")]:
        mask = r["y_te"] == label
        probs = r["y_prob"][mask]
        ax.hist(probs, bins=12, alpha=0.55, color=color,
                linestyle=ls, label=f"{'Active' if label==0 else 'Churned'} (n={mask.sum()})",
                edgecolor="white", density=True)
    ax.axvline(0.5, color="black", lw=1.5, linestyle=":")
    ax.set_xlabel("Predicted Churn Probability"); ax.set_ylabel("Density")
    ax.set_title("Churn Probability Score Distribution", fontweight="bold")
    ax.legend()
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "05_score_distribution.png", dpi=150)
    plt.close()

    print(f"\n  📊 Plots saved to /{OUTPUT_DIR}/")


# ══════════════════════════════════════════════════════
# 7. SAVE MODELS  →  .pkl  and  .h5
# ══════════════════════════════════════════════════════
def save_sklearn_pkl(results: dict, best_model: str, scaler: StandardScaler):
    """
    Wraps imputer → scaler → best classifier into a sklearn Pipeline
    and serialises it with joblib → churn_output/churn_model.pkl
    """
    bm      = results[best_model]["model"]
    imputer = results["_imputer"]

    pipeline = Pipeline([
        ("imputer",    imputer),
        ("scaler",     scaler),
        ("classifier", bm),
    ])

    pkl_path = OUTPUT_DIR / "churn_model.pkl"
    joblib.dump(pipeline, pkl_path)
    print(f"\n  💾 sklearn Pipeline saved → {pkl_path}")
    print(f"     Load with: model = joblib.load('{pkl_path}')")
    print(f"     Predict  : probs = model.predict_proba(X_new)[:, 1]")
    return pipeline


def save_shap_explainer(results: dict, best_model: str, scaler: StandardScaler, df: pd.DataFrame):
    """
    Builds a SHAP TreeExplainer from the best classifier and saves it.
    The explainer operates on scaled features (post-imputer+scaler).
    """
    bm      = results[best_model]["model"]
    imputer = results["_imputer"]

    X_raw    = df[FEATURE_COLS]
    X_scaled = scaler.transform(imputer.transform(X_raw))

    explainer = shap.TreeExplainer(bm)
    # Compute a background summary for faster API calls later
    background = shap.sample(X_scaled, 100, random_state=42)
    explainer_fast = shap.TreeExplainer(bm, background)

    shap_path = OUTPUT_DIR / "shap_explainer.pkl"
    joblib.dump({"explainer": explainer_fast, "feature_names": FEATURE_COLS}, shap_path)
    print(f"\n  💾 SHAP explainer saved → {shap_path}")
    print(f"     Load with: obj = joblib.load('{shap_path}')")
    print(f"     Explain  : shap_vals = obj['explainer'].shap_values(X_scaled)[1]")
    return explainer_fast


# ══════════════════════════════════════════════════════
# 8. GENERATE PREDICTION REPORT
# ══════════════════════════════════════════════════════
def generate_predictions(df: pd.DataFrame, results: dict,
                          best_model: str, scaler: StandardScaler):
    bm = results[best_model]["model"]
    imputer = results["_imputer"]
    X_raw = df[FEATURE_COLS]
    X_all = scaler.transform(imputer.transform(X_raw))
    df = df.copy()
    df["churn_probability"] = bm.predict_proba(X_all)[:, 1]
    df["churn_predicted"]   = (df["churn_probability"] >= 0.5).astype(int)

    # Risk tier
    df["risk_tier"] = pd.cut(
        df["churn_probability"],
        bins  = [0, 0.3, 0.6, 1.0],
        labels= ["🟢 Low", "🟡 Medium", "🔴 High"],
    )

    report = df[[
        "acc_id", "status", "credit", "expire",
        "days_since_last_access", "total_payments", "total_amount_paid",
        "churn_probability", "churn_predicted", "risk_tier", "churned"
    ]].sort_values("churn_probability", ascending=False)

    report.to_csv(OUTPUT_DIR / "churn_predictions.csv", index=False)

    print("\n" + "═" * 60)
    print("  Churn Prediction Report (Top 15 at-risk accounts)")
    print("═" * 60)
    print(report.head(15).to_string(index=False))

    # Summary stats
    print("\n  Risk-Tier Summary:")
    print(report["risk_tier"].value_counts().to_string())
    print(f"\n  Predictions saved → {OUTPUT_DIR}/churn_predictions.csv")

    return report


# ══════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════
def main():
    print("\n" + "═" * 60)
    print("  🚀  Customer Churn Prediction Pipeline")
    print("═" * 60)

    # 1. Load
    print("\n  [1/5] Loading data …")
    users, payments = load_data()
    print(f"       Users   : {len(users)} rows | Payments: {len(payments)} rows")

    # 2. Label
    print("  [2/5] Labelling churn …")
    users_lbl = label_churn(users)
    churn_count = users_lbl["churned"].sum()
    print(f"       Churned : {churn_count} / {len(users_lbl)} "
          f"({churn_count/len(users_lbl)*100:.1f}%)")

    # 3. Payment features
    print("  [3/5] Engineering payment features …")
    pay_feats = payment_features(payments)

    # 4. Merge
    print("  [4/5] Building feature matrix …")
    df = build_features(users_lbl, pay_feats)
    print(f"       Feature columns: {len(FEATURE_COLS)}")

    # 5. Train & evaluate
    print("  [5/5] Training models …")
    results, best_model, scaler = train_and_evaluate(df)

    # Visualise
    plot_all(df, results, best_model)

    # ── Save models ───────────────────────────────────
    print("\n" + "═" * 60)
    print("  Saving Models")
    print("═" * 60)
    save_sklearn_pkl(results, best_model, scaler)
    save_shap_explainer(results, best_model, scaler, df)

    print("\n  ✅  Pipeline complete!\n")


if __name__ == "__main__":
    main()
