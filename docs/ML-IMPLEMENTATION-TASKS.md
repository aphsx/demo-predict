# ML Implementation Task Plan

เอกสารนี้เป็นแผนลงมือทำแบบทีละ task สำหรับ rebuild ML training/prediction system

หลักการ:

```text
ทำทีละชั้น
verify แต่ละชั้นก่อนข้ามไปชั้นถัดไป
ห้ามทำ training + DB + prediction + web พร้อมกันในรอบเดียว
```

## Required Reading Before Implementation

ก่อนเริ่ม task ใด ๆ ต้องอ่านเอกสารเหล่านี้:

```text
docs/ML-TRAINING-SRS.md
docs/ML-FEATURE-SPEC.md
docs/ML-TRAINING-QUALITY-GATES.md
docs/ML-EXPERIMENT-PLAN.md
docs/ML-DB-REBUILD-PLAN.md
```

ถ้า task นั้นเกี่ยวกับ feature/model/evaluation ต้องเช็คเอกสารที่เกี่ยวข้องก่อนแก้โค้ด

## Implementation Rule

แต่ละ task ต้องมี:

```text
goal
files to touch
acceptance criteria
verification command/report
```

ห้ามเริ่ม task ถัดไปถ้า task ก่อนหน้ายัง verify ไม่ผ่าน

## Phase 0: Confirm Current Foundation

### Task 0.1: Confirm Clean Data State

Goal:

```text
ยืนยันว่า train clean DB พร้อมใช้ และ predict clean schema ยังไม่พัง
```

Files to touch:

```text
none
```

Verify:

```text
query train_data_sources
query train_clean_customers/payments/usage counts
query predict_clean_* counts
```

Acceptance:

```text
train_data_sources has at least one ready source
train_clean_customers row_count > 0
train_clean_payments row_count > 0
train_clean_usage row_count > 0
```

Current known status:

```text
train source ready: yes
customers: 25,093
payments: 13,882
usage: 76,255
```

### Task 0.2: Keep Dataset Profiling Script

Goal:

```text
ใช้ profile_training_dataset.py เป็น first sanity check ก่อน training
```

Existing file:

```text
apps/ml/scripts/profile_training_dataset.py
```

Acceptance:

```text
script runs against current DB
writes models/training_dataset_profile.json
recommends cutoff or reports why no cutoff is viable
```

## Phase 1: New ML DB Schema

### Task 1.1: Add Alembic Migration For New ML Tables

Goal:

```text
สร้าง DB tables ใหม่ โดยยังไม่ drop old tables
```

Read first:

```text
docs/ML-DB-REBUILD-PLAN.md
```

Tables:

```text
ml_training_runs
ml_model_versions
ml_model_aliases
ml_model_activation_history
ml_feature_sets
ml_data_validation_reports
ml_model_evaluations
ml_prediction_runs
ml_prediction_outputs
```

Files to touch:

```text
apps/ml/alembic/versions/<new_migration>.py
```

Do not touch:

```text
user
session
account
verification
train_data_sources
train_raw_sheet_*
train_clean_*
predict_data_sources
predict_raw_sheet_*
predict_clean_*
```

Acceptance:

```text
alembic migration applies cleanly
new tables exist
old auth/import/clean tables still exist
no old prediction tables dropped yet
```

### Task 1.2: Update Drizzle Schema

Goal:

```text
ให้ TypeScript API query new ML tables ได้
```

Files to touch:

```text
apps/api/src/db/schema.ts
```

Acceptance:

```text
schema exports new ML tables
no drizzle migration generated
TypeScript types compile
```

## Phase 2: Python Data Access Layer

### Task 2.1: Build Shared Clean Data Loader

Goal:

```text
โหลด train_clean_* และ predict_clean_* ด้วย code pattern เดียวกัน แต่คนละ dataset
```

Read first:

```text
docs/ML-FEATURE-SPEC.md
section: Build Shared Data Loader
```

Files to add:

```text
apps/ml/src/training/data.py
```

Functions:

```text
load_train_clean(source_id) -> customers, payments, usage
load_predict_clean(source_id) -> customers, payments, usage
```

Acceptance:

```text
load_train_clean returns 3 DataFrames
date columns parsed
numeric columns parsed
usage has period column
predict loader works even if payments/usage are empty
```

### Task 2.2: Add Data Source Readiness Checks

Goal:

```text
implement Gate 1 checks
```

Read first:

```text
docs/ML-TRAINING-QUALITY-GATES.md
Gate 1
```

Files to add:

```text
apps/ml/src/training/validation.py
```

Acceptance:

```text
ready train source passes
missing/not-ready source fails with clear message
report object can be saved later to ml_data_validation_reports
```

## Phase 3: Data Validation And Label Viability

### Task 3.1: Implement Schema/Data Quality Validation

Goal:

```text
implement Gate 2 checks
```

Read first:

```text
docs/ML-TRAINING-QUALITY-GATES.md
Gate 2
```

Files to touch:

```text
apps/ml/src/training/validation.py
```

Acceptance:

```text
required columns checked
invalid dates reported
unexpected categories reported
duplicate customer acc_id reported
orphan activity acc_id reported
```

### Task 3.2: Persist Data Validation Reports

Goal:

```text
save validation result to ml_data_validation_reports
```

Files to touch:

```text
apps/ml/src/training/validation.py
apps/ml/src/training/repository.py
```

Acceptance:

```text
schema/profile/label_viability reports insert into DB
status = passed/warning/failed
anomalies_json populated when issues exist
```

### Task 3.3: Implement Label Viability Report

Goal:

```text
ตรวจว่าชุดข้อมูล train churn/CLV/credit ได้จริง
```

Read first:

```text
docs/ML-TRAINING-QUALITY-GATES.md
Gate 4
```

Files to add/touch:

```text
apps/ml/src/training/labels.py
apps/ml/scripts/profile_training_dataset.py
```

Acceptance:

```text
reports churn positive/negative counts
reports future revenue non-zero count
reports future credit usage counts
reports days_until_next_topup observed count
blocks training if required label viability fails
```

## Phase 4: Feature Builder

### Task 4.1: Implement Tier A Feature Builder

Goal:

```text
สร้าง feature safe set จาก payment/usage/activity history ก่อน cutoff
```

Read first:

```text
docs/ML-FEATURE-SPEC.md
Tier A
Minimum Feature Set For First Churn Baseline
```

Files to add:

```text
apps/ml/src/training/features.py
```

Feature groups:

```text
payment recency/frequency/monetary
payment intervals
usage recency/volume/trend
channel/source shares
activity features
```

Acceptance:

```text
build_all_features(customers, payments, usage, cutoff) works
feature rows include every customer
feature columns deterministic
no post-cutoff payment/usage used
feature_stats generated
```

### Task 4.2: Implement Feature Schema Contract

Goal:

```text
save feature names/dtypes/defaults as ml_feature_sets
```

Read first:

```text
docs/ML-FEATURE-SPEC.md
Feature Set Contract
```

Files to add/touch:

```text
apps/ml/src/training/features.py
apps/ml/src/training/repository.py
```

Acceptance:

```text
feature_schema generated
feature_code_hash generated
ml_feature_sets row inserted
prediction can validate against feature_schema
```

### Task 4.3: Implement PIT/Leakage Checks

Goal:

```text
implement Gate 5
```

Read first:

```text
docs/ML-TRAINING-QUALITY-GATES.md
Gate 5
```

Acceptance:

```text
max feature payment_date < cutoff
max feature usage period < cutoff
label window not used in feature builder
Tier B/C features excluded from first churn baseline
leakage_check_report generated
```

## Phase 5: Preprocessing Pipeline

### Task 5.1: Build Preprocessor

Goal:

```text
fit preprocessing on train split only and reuse on validation/test/predict
```

Read first:

```text
docs/ML-FEATURE-SPEC.md
Preprocessing Pipeline Contract
docs/ML-TRAINING-QUALITY-GATES.md
Gate 8
```

Files to add:

```text
apps/ml/src/training/preprocessing.py
```

Acceptance:

```text
fit on train split only
transform validation/test/predict only
feature order preserved
preprocessor can be saved/loaded
```

## Phase 6: Churn First

### Task 6.1: Build Churn Training Dataset

Goal:

```text
สร้าง dataframe สำหรับ churn baseline จาก cutoff 2025-07-01
```

Read first:

```text
docs/ML-EXPERIMENT-PLAN.md
Churn Experiments
```

Files to add:

```text
apps/ml/src/training/datasets.py
apps/ml/scripts/build_churn_training_dataset.py
```

Acceptance:

```text
eligible population matches label viability report
churn_label exists
positive/negative counts reported
feature matrix excludes label columns
dataset summary saved
```

### Task 6.2: Train Churn Baselines

Goal:

```text
train recency/RFM/logistic baselines before advanced models
```

Files to add:

```text
apps/ml/scripts/train_churn_baseline.py
apps/ml/src/models_v2/churn.py
```

Acceptance:

```text
baseline metrics saved
ml_training_runs row created
ml_model_versions candidate row created if applicable
ml_model_evaluations rows inserted
```

### Task 6.3: Train Churn Candidates

Goal:

```text
train LightGBM/XGBoost candidates and compare against baselines
```

Acceptance:

```text
candidate beats baseline on required metrics
calibration report generated
backtest report generated
model card generated
no champion alias assigned unless gates pass
```

### Task 6.4: Promote Churn Champion

Goal:

```text
assign champion alias only after quality gates pass
```

Acceptance:

```text
required ml_model_evaluations rows exist
model_card exists
artifact load test passes
ml_model_aliases champion points to selected churn model
activation history inserted
```

## Phase 7: CLV

### Task 7.1: Build CLV Dataset

Goal:

```text
future_revenue_6m label + feature matrix
```

Acceptance:

```text
zero-heavy target report generated
outlier impact report generated
future revenue non-zero count passes gate or task stops
```

### Task 7.2: Train CLV Baselines And Candidates

Goal:

```text
compare historical average/RFM/BG-NBD benchmark vs ML regressors/two-stage model
```

Acceptance:

```text
ml_model_evaluations saved for train/validation/test/backtest/baseline_comparison
champion only if beats baseline and gates pass
```

## Phase 8: Credit Forecast

### Task 8.1: Build Credit Dataset

Goal:

```text
future_credit_usage_30d/90d first, days_until_next_topup second
```

Acceptance:

```text
usage target viability passes
top-up timing viability reported
fallback strategy documented for low-history customers
```

### Task 8.2: Train Credit Baselines And Candidates

Goal:

```text
compare moving average/last-period baseline vs ML regressors
```

Acceptance:

```text
credit model beats baseline
negative forecasts prevented
urgency bucket quality measured
champion alias assigned only after gates pass
```

## Phase 9: Prediction Pipeline

### Task 9.1: Build Prediction Runner

Goal:

```text
predict using champion models on predict_clean_*
```

Read first:

```text
docs/ML-TRAINING-SRS.md
Prediction Pipeline Flow
docs/ML-TRAINING-QUALITY-GATES.md
Gate 14 and Gate 15
```

Files to add:

```text
apps/ml/scripts/run_prediction.py
apps/ml/src/prediction/
```

Acceptance:

```text
requires champion churn/clv/credit aliases
loads predict_clean_*
builds same feature schema
inserts one ml_prediction_outputs row per predict_clean_customers row
model_eligibility_json populated
```

### Task 9.2: Derived Outputs

Goal:

```text
calculate lifecycle, revenue_at_risk, priority_score, recommended_action
```

Acceptance:

```text
all customers receive lifecycle_stage
null/fallback outputs explain reason
priority_score between 0 and 10
output_status populated
```

## Phase 10: AI Explanation

### Task 10.1: Add Per-Customer AI Explanation Writer

Goal:

```text
generate AI explanation only after ML output exists
```

Acceptance:

```text
AI generation does not block prediction run
AI updates ai_* fields on selected output row
AI cannot change model scores
ai_status = generated or failed
```

## Phase 11: Remove Old ML Output Schema

### Task 11.1: Verify New Flow End-To-End

Goal:

```text
prove new training + prediction output works before dropping old tables
```

Acceptance:

```text
churn champion exists
clv champion exists
credit champion exists
prediction run writes outputs
quality reports exist
evaluation rows exist
```

### Task 11.2: Drop Old Tables

Goal:

```text
drop/retire old prediction_runs, predictions, model_versions only after replacement is verified
```

Files to touch:

```text
apps/ml/alembic/versions/<drop_old_ml_tables>.py
apps/api/src/db/schema.ts
```

Acceptance:

```text
auth tables untouched
train/predict import/clean tables untouched
new ML flow still works
```

## Current Next Task

Start with:

```text
Task 1.1: Add Alembic Migration For New ML Tables
```

Do not start model training implementation until:

```text
new DB tables exist
Drizzle schema updated
data validation report path exists
```
