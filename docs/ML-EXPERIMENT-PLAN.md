# ML Experiment Plan

เอกสารนี้กำหนดวิธีทดลอง model อย่างเป็นระบบ เพื่อเลือก champion model จากหลักฐาน ไม่ใช่เลือกจากความรู้สึก

ใช้คู่กับ:

```text
docs/ML-TRAINING-SRS.md
docs/ML-FEATURE-SPEC.md
docs/ML-TRAINING-QUALITY-GATES.md
docs/ML-DB-REBUILD-PLAN.md
docs/MODEL-HEALTH-DASHBOARD.md
```

## 1. Goal

เป้าหมายของ experiment ไม่ใช่แค่หา model ที่ metric สูงสุด แต่ต้องหา model ที่:

```text
1. ไม่ leak
2. generalize ข้าม cutoff ได้
3. ดีกว่า baseline
4. probability calibrated พอใช้กับ business threshold
5. rank ลูกค้าที่ควร action ได้ดี
6. output stable และ explainable
7. deploy/retrain/rollback ได้
```

## 2. Experiment Principles

### 2.1 Use Temporal Backtesting

ห้ามตัดสิน model จาก random split อย่างเดียว

Recommended cutoff design:

```text
train/eval folds:
  2024-07-01
  2024-10-01
  2025-01-01
  2025-04-01
  2025-07-01
```

Pattern:

```text
train on older cutoff(s)
validate on newer cutoff
test on newest cutoff
```

เหตุผล:

```text
prediction จริงคือใช้ข้อมูลอดีตทำนายอนาคต
temporal backtest จับ model ที่แม่นเฉพาะอดีตแต่พังกับข้อมูลใหม่
```

### 2.2 Always Compare To Baseline

ทุก model ต้องชนะ baseline ก่อนเป็น champion

ถ้า model ซับซ้อนไม่ชนะ baseline:

```text
reject
```

### 2.3 Separate Ranking Quality From Probability Quality

สำหรับ churn:

```text
ranking quality = ใครเสี่ยงสุด
probability quality = 0.70 แปลว่าเสี่ยงจริงประมาณ 70% ไหม
```

ต้องวัดทั้งสองแบบ

### 2.4 Prefer Business Metrics For Final Selection

Metric เทคนิคอย่าง AUC สำคัญ แต่ final champion ควรดู business impact:

```text
recall@top10%
lift@top10%
revenue_at_risk captured@top10%
expected retention value
```

## 3. Churn Experiments

### 3.1 Label

```text
population:
  active before cutoff
  ever paid before cutoff

positive:
  no payment and no usage in horizon after cutoff

negative:
  payment or usage exists in horizon after cutoff
```

Default:

```text
active_window_days = 180
horizon_days = 180
```

### 3.2 Baselines

Train and log these first:

```text
baseline_churn_recency:
  rank by days_since_last_activity

baseline_churn_rfm:
  simple RFM score from payment/usage recency, frequency, monetary

baseline_churn_logistic:
  Logistic Regression on Tier A features
```

Purpose:

```text
ถ้า LightGBM/XGBoost ไม่ชนะ baseline พวกนี้ แปลว่า feature/model design ยังไม่ดีพอ
```

### 3.3 Candidate Models

```text
Logistic Regression
Random Forest
LightGBM
XGBoost
Calibrated LightGBM
Calibrated XGBoost
```

CatBoost:

```text
optional later if dependency approved
```

### 3.4 Feature Set Experiments

```text
churn_A_safe_history:
  Tier A payment/usage/activity features only

churn_B_safe_plus_profile:
  Tier A + customer_age + safe profile fields

churn_C_with_snapshot_credit:
  Tier A + Tier B credit/status/expiry fields
```

Rules:

```text
If C improves too much suspiciously, run leakage audit.
If C collapses on latest cutoff, reject snapshot fields for historical training.
```

### 3.5 Metrics

Required:

```text
ROC-AUC
PR-AUC
precision
recall
F1
Brier score
log loss
calibration curve
recall@top5%
recall@top10%
lift@top10%
revenue_at_risk captured@top10%
confusion matrix at chosen thresholds
```

Business ranking metrics:

```text
top_decile_lift
lift_index
revenue_at_risk_captured_top_k
expected_retention_value_top_k
```

### 3.6 Calibration

Churn probability must be calibrated before user-facing use

Candidates:

```text
uncalibrated
sigmoid / Platt scaling
isotonic regression
```

Rules:

```text
calibration must fit on validation/calibration split only
do not calibrate on test split
isotonic requires enough calibration samples; otherwise prefer sigmoid
```

Selection:

```text
pick model by ranking + calibration:
  PR-AUC / lift@top10 for ranking
  Brier/log loss/calibration curve for probability quality
```

## 4. CLV Experiments

### 4.1 Label

```text
future_revenue_6m = sum(payment.amount in horizon after cutoff)
```

### 4.2 Baselines

```text
baseline_clv_zero:
  predict 0 for everyone

baseline_clv_historical_avg:
  avg historical monthly revenue * 6

baseline_clv_rfm_segment:
  average future revenue by RFM segment

baseline_clv_bgnbd_gamma_gamma:
  BG/NBD + Gamma-Gamma if assumptions viable
```

### 4.3 Candidate Models

```text
LightGBM Regressor
XGBoost Regressor
Tweedie Regressor
two-stage LightGBM:
  stage 1 future_purchase_flag
  stage 2 revenue_if_purchase
```

### 4.4 Metrics

Required:

```text
MAE
RMSE
SMAPE
Spearman rank correlation
top-decile revenue capture
revenue-weighted MAE
prediction quantiles vs actual quantiles
```

Why rank metrics matter:

```text
CLV ใช้จัด priority ลูกค้า ดังนั้นเรียง high-value ให้ถูกสำคัญพอ ๆ กับ error เฉลี่ย
```

### 4.5 Special Checks

```text
zero-heavy target report
outlier impact report
top 1% revenue share
correlation between frequency and monetary value before using Gamma-Gamma
```

## 5. Credit Forecast Experiments

### 5.1 Targets

Start with:

```text
future_credit_usage_30d
future_credit_usage_90d
```

Then add:

```text
days_until_next_topup
```

### 5.2 Baselines

```text
baseline_usage_last_30d:
  predict last 30d usage

baseline_usage_moving_avg_90d:
  predict 90d moving average

baseline_topup_median_interval:
  predict historical median payment interval
```

### 5.3 Candidate Models

```text
LightGBM Regressor
XGBoost Regressor
LightGBM Quantile Regressor
two-stage top-up model:
  probability of top-up in horizon
  days/amount if top-up
```

Survival/time-to-event model:

```text
later, if top-up censoring is high and baseline timing is weak
```

### 5.4 Metrics

Usage forecast:

```text
MAE
RMSE
SMAPE
MAE by channel
MAE by usage volume tier
```

Top-up timing:

```text
MAE days
median absolute error
coverage if quantile
urgent bucket precision/recall
```

Business metric:

```text
credit_urgency_accuracy
followup_date_error_days
```

## 6. Champion Selection Policy

### 6.1 Churn Champion

Primary:

```text
PR-AUC
lift@top10%
revenue_at_risk captured@top10%
```

Required:

```text
Brier score acceptable
calibration curve not severely over/under confident
latest cutoff performance within tolerance
beats recency/RFM baseline
```

### 6.2 CLV Champion

Primary:

```text
MAE
Spearman rank correlation
top-decile revenue capture
```

Required:

```text
beats historical average baseline
does not overpredict extreme outliers too badly
high-value tier is stable across cutoffs
```

### 6.3 Credit Champion

Primary:

```text
MAE / SMAPE for usage forecast
urgent bucket quality
```

Required:

```text
beats moving average baseline
does not produce negative forecasts
works for low-history customers via fallback
```

## 7. Threshold Policy

Thresholds should be learned from validation, not guessed

### 7.1 Churn Risk Levels

Initial:

```text
Low < 0.30
Medium 0.30 - 0.60
High >= 0.60
```

But final thresholds should be selected by:

```text
precision/recall tradeoff
retention team capacity
expected retention value
```

### 7.2 Priority Score

Initial formula is acceptable, but weights should be tuned by:

```text
top-k revenue_at_risk capture
business review
retention capacity
```

## 8. Ablation Studies

Run ablation to prove feature groups help

Churn ablation:

```text
payment only
usage only
payment + usage
payment + usage + channel/source
payment + usage + channel/source + profile snapshot
```

CLV ablation:

```text
payment only
payment + usage
payment + usage + profile
RFM/BG-NBD benchmark vs ML regressors
```

Credit ablation:

```text
usage only
payment only
usage + payment
usage + payment + credit balance snapshot
```

Reject a feature group if:

```text
it adds leakage risk but no stable validation gain
it improves one cutoff but hurts newer cutoff
it dominates feature importance suspiciously
```

## 9. Model Card Requirement

Every champion model must have a model card artifact

Required sections:

```text
model_type
model_version_id
alias
intended use
not intended use
training data source
cutoff/horizon
feature set version
label definition
algorithm
preprocessing
metrics
baseline comparison
known limitations
data leakage checks
calibration notes
drift/skew notes
owner/created_at
```

Artifact:

```text
model_card.md
model_card.json
```

Promotion blocker:

```text
champion alias cannot be assigned if model card is missing
```

## 10. Experiment Reports

Each experiment run should write:

```text
experiment_summary.json
dataset_profile.json
label_viability.json
feature_set.json
metrics.json
calibration_report.json
baseline_comparison.json
ablation_report.json
model_card.json
```

Store links/paths in:

```text
ml_training_runs.training_config_json
ml_model_versions.metrics_json
ml_model_versions.training_data_snapshot_json
ml_model_evaluations
```

`ml_model_evaluations` is the required queryable store for model assessment.

The Model Health UI contract is defined in:

```text
docs/MODEL-HEALTH-DASHBOARD.md
```

The UI must show split-aware metrics, baseline/champion comparison, calibration/threshold details, backtest stability, segment robustness, artifact completeness, and promotion blockers. It must not show a single unqualified score as proof that a model is production-ready.

Required rows:

```text
churn:
  train
  validation
  test
  backtest
  baseline_comparison
  calibration
  ablation

clv:
  train
  validation
  test
  backtest
  baseline_comparison
  ablation

credit:
  train
  validation
  test
  backtest
  baseline_comparison
  ablation
```

Example row usage:

```text
F1 score:
  ml_model_evaluations.metrics_json.f1

confusion matrix:
  ml_model_evaluations.confusion_matrix_json

calibration bins:
  ml_model_evaluations.calibration_json

top decile lift:
  ml_model_evaluations.lift_table_json

revenue-at-risk capture:
  ml_model_evaluations.business_metrics_json
```

## 11. What Not To Do Initially

Avoid:

```text
deep learning sequence models before strong tabular baselines
large hyperparameter sweeps before label/feature correctness
automatic retrain on every predict upload
promoting by ROC-AUC only
using random split as final proof
using snapshot last_access/last_send in first baseline
optimizing for accuracy
```

Why:

```text
These make offline numbers look good while increasing leakage and operational risk.
```

## 12. Immediate Experiment Order

Do this order:

```text
1. build churn training dataframe for 2025-07-01
2. train recency/RFM/logistic baselines
3. train LightGBM/XGBoost churn candidates
4. calibrate best churn candidate
5. run temporal backtest across cutoffs
6. write churn model card
7. only then move to CLV experiments
8. then credit forecast experiments
```

Reason:

```text
Churn has viable labels now and is the backbone for revenue_at_risk and priority_score.
```
