# ML Training Quality Gates

เอกสารนี้เป็น checklist/gate สำหรับกันไม่ให้ training pipeline สร้าง model ที่เพี้ยน, leak, หรือดูแม่นเฉพาะ offline แต่ใช้จริงไม่ได้

เป้าหมาย:

- ไม่ train จาก data ที่ยังไม่พร้อม
- ไม่สร้าง label ที่หลอกตัวเอง
- ไม่ให้ข้อมูลอนาคต leak เข้า feature
- ไม่ให้ train/predict feature ไม่ตรงกัน
- ไม่ promote model ที่แพ้ baseline หรือแย่กว่า champion เดิม
- ไม่ block ด้วย process ที่ over-engineer เกินจำเป็น

## 1. Gate Summary

Pipeline ต้องผ่าน gate ตามลำดับนี้:

```text
Gate 1: Data Source Readiness
Gate 2: Schema And Data Quality
Gate 3: Cutoff And Horizon Feasibility
Gate 4: Label Viability
Gate 5: Point-In-Time / Leakage Check
Gate 6: Feature Set Contract
Gate 7: Split Correctness
Gate 8: Preprocessing Safety
Gate 9: Baseline Comparison
Gate 10: Model Evaluation
Gate 11: Model Robustness
Gate 12: Artifact And Metadata Completeness
Gate 13: Promotion / Champion Gate
Gate 14: Prediction Readiness Gate
Gate 15: Post-Prediction Monitoring Gate
```

## 2. Gate Severity

ทุก check ต้องมี severity:

```text
blocker  = ห้ามไปต่อ
warning  = ไปต่อได้ แต่ต้องบันทึก report
info     = ใช้เพื่อ audit/debug
```

Default behavior:

```text
blocker -> fail training/prediction run
warning -> continue but save ml_data_validation_reports
info -> continue and save report
```

## 3. Gate 1: Data Source Readiness

Purpose:

ยืนยันว่า dataset import/clean สำเร็จก่อนเริ่ม train หรือ predict

Training checks:

```text
train_data_sources.id exists
train_data_sources.import_status = ready
train_clean_customers row_count > 0
train_clean_payments row_count > 0
train_clean_usage row_count > 0
clean_manifest exists
clean_manifest.warnings is empty or acceptable
```

Prediction checks:

```text
predict_data_sources.id exists
predict_data_sources.import_status = ready
predict_clean_customers row_count > 0
predict_clean_payments may be 0
predict_clean_usage may be 0
clean_manifest exists
```

Blocker:

```text
source not ready
customers row_count = 0
required clean table missing
```

Warning:

```text
predict payments = 0
predict usage = 0
```

เหตุผล:

Prediction ต้องออก output ให้ครบทุก customer แม้บางคน/บาง dataset ไม่มี payment หรือ usage แต่ training ต้องมี behavioral data พอสำหรับ model

## 4. Gate 2: Schema And Data Quality

Purpose:

ตรวจว่า data shape ตรงกับที่ feature builder ต้องการ

Required columns:

```text
customers:
  acc_id
  status_sms
  credit_sms
  credit_email
  expire_sms
  expire_email
  status_email
  join_date
  last_access
  last_send

payments:
  acc_id
  payment_date
  amount
  credit_add
  credit_type

usage:
  acc_id
  year
  month
  usage
  channel
  usage_source
```

Checks:

```text
required columns exist
acc_id can be parsed as integer
payment_date can be parsed as timestamp
year/month can form valid period
amount >= 0 or negative amount explicitly allowed
credit_add >= 0 or negative credit explicitly allowed
usage >= 0
channel in sms/email
usage_source in bc/api/otp
credit_type in sms/email/null
```

Blocker:

```text
missing required column
invalid acc_id rate > 0
invalid payment_date rate > threshold
invalid usage period rate > threshold
negative usage exists
```

Warning:

```text
unexpected category value
high null rate in non-critical snapshot fields
orphan payment/usage acc_id not found in customers
duplicate customer acc_id
```

Initial thresholds:

```text
invalid payment_date rate <= 0.5%
invalid usage period rate <= 0.5%
orphan activity acc_id warning if > 1%
duplicate customer acc_id blocker if unresolved
```

Output:

```text
ml_data_validation_reports.validation_type = schema
```

## 5. Gate 3: Cutoff And Horizon Feasibility

Purpose:

ยืนยันว่า data มีอดีตพอสร้าง feature และมีอนาคตพอสร้าง label

Checks:

```text
min(payment_date or usage period) < cutoff_date - active_window_days
max(payment_date or usage period) >= cutoff_date + horizon_days
active_window_days > 0
horizon_days > 0
```

Blocker:

```text
no historical activity before cutoff
no future window after cutoff for labels
cutoff_date outside data range
```

Warning:

```text
history before cutoff < 180 days
future label coverage barely passes
```

Current recommended first config:

```text
cutoff_date = 2025-07-01
active_window_days = 180
horizon_days = 180
```

## 6. Gate 4: Label Viability

Purpose:

กันไม่ให้ train model จาก label ที่ sample น้อยหรือ imbalance หนักเกินไป

### 6.1 Churn Label

Checks:

```text
eligible_for_churn count >= 500
churn_positive count >= 100
churn_negative count >= 100
positive_rate between 5% and 80%
```

Current dataset profile:

```text
cutoff_date = 2025-07-01
eligible active paid = 2,335
churn_positive = 712
churn_negative = 1,623
positive_rate = 30.5%
```

Status:

```text
pass
```

### 6.2 CLV Label

Checks:

```text
eligible_for_clv count >= 500
future_revenue_6m non-zero count >= 100
future_revenue_6m has variance
top 1% revenue does not dominate total future revenue excessively
```

Warning:

```text
zero-heavy target
extreme revenue outliers
```

Recommended response:

```text
use two-stage CLV model:
  purchase probability
  revenue amount if purchase
```

### 6.3 Credit Usage Labels

Checks:

```text
future_credit_usage_30d non-zero count >= 500
future_credit_usage_90d non-zero count >= 500
target has variance
```

### 6.4 Top-Up Timing Label

Checks:

```text
days_until_next_topup observed count >= 500
censored/no-next-topup rate reported
median and p90 are reasonable
```

Warning:

```text
high censoring rate
few repeat purchasers
```

Recommended response:

```text
start with usage forecast
add top-up timing after baseline works
consider survival model later if censoring is high
```

Output:

```text
ml_data_validation_reports.validation_type = label_viability
```

## 7. Gate 5: Point-In-Time / Leakage Check

Purpose:

ป้องกัน future data leak เข้า feature

Hard rules:

```text
feature payment rows must satisfy payment_date < cutoff_date
feature usage rows must satisfy period < cutoff_date
label payment/usage rows must satisfy cutoff_date <= date < cutoff_date + horizon
profile last_access/last_send must not be used in first historical baseline
snapshot credit/expiry features must be Tier B experiment, not first baseline
```

Checks:

```text
feature builder logs max event date used per feature group
max feature payment_date < cutoff_date
max feature usage period < cutoff_date
label rows do not enter feature dataframe
observed lifecycle/status fields do not enter feature dataframe
feature names marked PIT risk Tier A/B/C
```

Blocker:

```text
any feature uses payment_date >= cutoff_date
any feature uses usage period >= cutoff_date
label column included in feature matrix
target-derived feature included
lifecycle_stage/output_status/model_eligibility_json included in model feature matrix
```

Warning:

```text
snapshot feature used in historical training
feature importance dominated by Tier B/C field
offline metric suspiciously high
```

Suspicious metric trigger:

```text
churn ROC-AUC > 0.95 on first baseline
churn PR-AUC extremely high relative to baseline
validation/test gap too large
```

## 8. Gate 6: Feature Set Contract

Purpose:

ทำให้ train/predict feature ตรงกัน 100%

Required artifact:

```text
ml_feature_sets row
feature_names_json
feature_schema_json
transform_config_json
feature_code_hash
```

Checks:

```text
feature_names are deterministic
feature order is deterministic
feature dtypes are known
nullable/default values are known
categorical vocabularies are known
feature count matches model expectation
feature_schema distinguishes contract nullable rules from observed nullable stats
lifecycle/status fields are stored outside feature_names_json
```

Blocker:

```text
missing feature in prediction
extra feature cannot be ignored safely
feature dtype mismatch cannot be coerced
feature order mismatch
feature_code_hash mismatch without new feature_set_version
model feature set includes output/status/eligibility metadata
```

Hash boundary:

```text
feature_code_hash changes only when feature_df/model input logic changes
lifecycle_code_hash changes when observed lifecycle/status logic changes
```

Do not force a new feature set version only because rule-based lifecycle output changed.
Persist lifecycle hash in `transform_config_json.metadata.lifecycle_code_hash` for audit.

Warning:

```text
new categorical value handled by fallback
missing rate drift exceeds threshold
```

## 9. Gate 7: Split Correctness

Purpose:

กัน validation หลอกตัวเอง

Required:

```text
temporal split by cutoff or time
no future cutoff in train if validating on past cutoff
customer leakage handled if same acc_id appears across folds
```

Recommended for this dataset:

```text
train cutoffs:
  2024-07-01
  2024-10-01
  2025-01-01

validation cutoff:
  2025-04-01

test cutoff:
  2025-07-01
```

Blocker:

```text
random split only used as final evaluation
test cutoff used in preprocessing fit
test labels used in feature selection
```

Allowed:

```text
random split may be used for quick local sanity check only
```

## 10. Gate 8: Preprocessing Safety

Purpose:

กัน leakage จาก imputation/scaling/encoding

Rules:

```text
fit imputer/scaler/encoder on train split only
validation/test use transform only
prediction use transform only
save fitted preprocessing object/config with model artifact
```

Blocker:

```text
preprocessor fit on all data before split
prediction refits preprocessor
category vocabulary not saved
feature order not saved
```

Recommended implementation:

```text
sklearn Pipeline / ColumnTransformer
or equivalent fit/transform object
```

Current implementation:

```text
apps/ml/src/training/preprocessing.py
fit_preprocessor(train_df, feature_schema)
transform_features(feature_df, fitted_preprocessor)
save_preprocessor(path)
load_preprocessor(path)
```

Verified smoke:

```text
features: 24
train_rows: 20,038
holdout_rows: 5,055
status: passed
```

## 11. Gate 9: Baseline Comparison

Purpose:

ห้าม promote model ที่ไม่ได้ชนะวิธีง่าย ๆ

### 11.1 Churn Baselines

Baseline candidates:

```text
recency-only baseline
RFM score baseline
logistic regression baseline
```

Candidate model must beat baseline on:

```text
PR-AUC
recall@top10%
lift@top10%
calibration
```

### 11.2 CLV Baselines

Baseline candidates:

```text
historical average revenue
RFM segment average
last 6m revenue projected forward
BG/NBD + Gamma-Gamma benchmark if viable
```

Candidate model must beat baseline on:

```text
MAE
Spearman rank correlation
top-decile revenue capture
```

### 11.3 Credit Baselines

Baseline candidates:

```text
last 30d usage repeated
last 90d moving average
median days between top-ups
```

Candidate model must beat baseline on:

```text
MAE
RMSE
urgency bucket quality
```

Blocker for champion promotion:

```text
candidate loses to baseline on primary metric
```

## 12. Gate 10: Model Evaluation

Purpose:

บันทึกความแม่นยำและคุณภาพ model แบบตรวจย้อนหลังได้

### 12.1 Churn Metrics

Required:

```text
ROC-AUC
PR-AUC
precision
recall
F1
confusion matrix
recall@top5%
recall@top10%
lift@top10%
calibration curve
Brier score
```

### 12.2 CLV Metrics

Required:

```text
MAE
RMSE
SMAPE
Spearman correlation
top-decile revenue capture
prediction quantiles
actual quantiles
outlier impact report
```

### 12.3 Credit Metrics

Required:

```text
MAE
RMSE
SMAPE
coverage if quantile model
urgency bucket confusion/quality
days_until_topup error distribution
```

Output:

```text
metrics_json
validation_metrics_json
test_metrics_json
training_data_snapshot_json
ml_model_evaluations rows
```

Every evaluation must be persisted to `ml_model_evaluations`, not only embedded in `ml_model_versions.metrics_json`.

The Model Health dashboard must read from the same evaluation contract described in:

```text
docs/MODEL-HEALTH-DASHBOARD.md
```

It must surface blocker status before detailed metric tables. A model with missing required evaluation rows, missing calibration report for churn, failed artifact load test, feature schema mismatch, or missing model card cannot be shown as healthy.

## 13. Gate 11: Model Robustness

Purpose:

ดูว่า model ไม่พังกับ cutoff หรือ feature set อื่น

Checks:

```text
metrics across multiple cutoffs
train/validation/test gap
feature importance stability
performance by lifecycle stage
performance by channel dominant type
performance by high/low value segment
```

Warning:

```text
model works only on one cutoff
model performance collapses on latest cutoff
feature importance unstable
```

Blocker:

```text
latest test cutoff fails minimum threshold
```

## 14. Gate 12: Artifact And Metadata Completeness

Purpose:

ทำให้ model reproducible และ rollback ได้

Required per model version:

```text
model artifact file
preprocessing artifact/config
feature_names_json
feature_schema_json
label_definition_json
metrics_json
validation_metrics_json
test_metrics_json
training_data_snapshot_json
artifact checksum
code version/hash
model_card.json
model_card.md
created_at
training_run_id
```

Blocker:

```text
artifact missing
feature list missing
metrics missing
label definition missing
model card missing for champion promotion
cannot load artifact after save
```

## 15. Gate 13: Promotion / Champion Gate

Purpose:

กันไม่ให้ model candidate กลายเป็น champion โดยไม่มีหลักฐาน

Promotion checks:

```text
all blocker gates passed
candidate beats baseline
candidate not worse than current champion beyond tolerance
data validation status not failed
leakage check passed
artifact load test passed
feature schema saved
model card generated
required ml_model_evaluations rows exist
activation history will be recorded
```

Promotion flow:

```text
1. train candidate model
2. assign challenger alias
3. compare with champion
4. if pass, move champion alias to candidate
5. set previous champion as rollback_candidate
6. insert ml_model_activation_history
```

Tolerance examples:

```text
churn PR-AUC cannot drop more than 2%
churn recall@top10 cannot drop more than 3%
CLV MAE cannot worsen more than 5%
credit MAE cannot worsen more than 5%
```

## 16. Gate 14: Prediction Readiness Gate

Purpose:

กัน prediction ที่ใช้ model ผิด version หรือ feature ผิด schema

Checks:

```text
predict_data_sources.status = ready
predict_clean_customers row_count > 0
champion churn model alias exists
champion clv model alias exists
champion credit model alias exists
model artifact files load successfully
feature builder produces required feature_names
feature schema matches champion model feature_set
preprocessor transform succeeds
```

Blocker:

```text
no champion model for required model_type
feature schema mismatch
artifact load failure
preprocessor transform failure
```

Warning:

```text
predict payments row_count = 0
predict usage row_count = 0
many customers not eligible for one or more models
```

## 17. Gate 15: Post-Prediction Monitoring Gate

Purpose:

ตรวจว่า prediction output ดูสมเหตุสมผลหลัง scoring

Checks:

```text
output row count equals predict_clean_customers row count
null rates by output field
model_eligibility_json populated
churn_probability between 0 and 1
predicted_clv_6m >= 0
predicted_credit_usage_30d >= 0
predicted_credit_usage_90d >= 0
priority_score between 0 and 10
distribution drift vs training predictions
top priority customers are explainable
```

Blocker:

```text
output row count mismatch
invalid score ranges
missing model_eligibility_json
```

Warning:

```text
unexpectedly high null rate
prediction distribution very different from training/test distribution
too many fallback outputs
```

## 18. Minimal Implementation To Avoid Over-Engineering

Do first:

```text
schema/data quality validation
label viability validation
PIT leakage check
feature set contract
preprocessing fit/transform safety
baseline comparison
metrics logging
artifact completeness
champion alias
prediction output completeness
```

Do later:

```text
full automated CI/CD model promotion
shadow deployment
online feature store
advanced survival modeling
deep learning sequence models
automated hyperparameter sweeps at large scale
```

Rationale:

```text
The first group prevents wrong models.
The second group improves maturity later but is not required to start safely.
```

## 19. Required Reports

Each training run should produce:

```text
training_dataset_profile.json
label_viability_report.json
feature_validation_report.json
leakage_check_report.json
model_metrics_report.json
baseline_comparison_report.json
artifact_manifest.json
```

Each model version should insert `ml_model_evaluations` rows for:

```text
train
validation
test
backtest
baseline_comparison
calibration if classifier
ablation if feature-set comparison was run
robustness if segment/cutoff stability was run
```

Each prediction run should produce:

```text
prediction_data_validation_report.json
feature_schema_validation_report.json
drift_skew_report.json
prediction_output_quality_report.json
```

These reports should be persisted in:

```text
ml_data_validation_reports
ml_training_runs.training_config_json
ml_model_versions.metrics_json
ml_model_versions.training_data_snapshot_json
```

## 20. Current Dataset Gate Status

From current profiling:

```text
train source: ready
customers: 25,093
payments: 13,882
usage rows: 76,255
recommended cutoff: 2025-07-01
eligible active paid: 2,335
churn positives: 712
churn negatives: 1,623
churn positive rate: 30.5%
```

Current status:

```text
Gate 1 Data Source Readiness: pass for train
Gate 3 Cutoff/Horizon Feasibility: pass for recommended cutoff
Gate 4 Churn Label Viability: pass
```

Not yet implemented:

```text
schema validation report
leakage check report
feature set contract
preprocessing safety
baseline comparison
model evaluation
promotion gate
prediction readiness gate
```

## 21. Acceptance Definition

A model can become champion only if:

```text
all blocker gates pass
required reports are saved
required ml_model_evaluations rows are saved
candidate beats baseline
candidate passes temporal test cutoff
artifact can be loaded and used for prediction
feature schema is reproducible
activation history is recorded
```

If any blocker gate fails:

```text
training_run.status = failed
model_version.status = failed or rejected
do not update champion alias
write error_message and validation report
```
