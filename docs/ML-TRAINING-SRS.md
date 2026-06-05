# ML Training System SRS

เอกสารนี้เป็น Software Requirements Specification สำหรับระบบ ML training/prediction ใหม่ของ 1Moby Analytics

Scope ของเอกสารนี้:

- DB ฝั่ง ML training/prediction
- training dataset จาก clean tables
- feature engineering
- label definition
- model training
- model evaluation
- retrain/versioning
- prediction output
- optional per-customer AI explanation

ยังไม่รวม Web/UI implementation

Related documents:

```text
docs/ML-FEATURE-SPEC.md
docs/ML-DB-REBUILD-PLAN.md
docs/ML-TRAINING-QUALITY-GATES.md
docs/ML-EXPERIMENT-PLAN.md
```

## 1. Objective

ระบบต้อง train model จาก clean training dataset แล้วสร้าง model artifacts ที่นำไป predict ลูกค้ารายคนได้

ผลลัพธ์สุดท้ายต้องไม่ใช่แค่ score ของ model แต่ต้องเป็น business output ที่ใช้ action ได้จริง เช่น:

```text
ลูกค้าคนนี้เสี่ยง churn แค่ไหน
ลูกค้านี้มีมูลค่าอนาคตเท่าไร
ควรคาดหวัง usage/credit เท่าไร
ควร follow up เมื่อไร
ควร prioritize ลูกค้าคนนี้แค่ไหน
AI อธิบายเหตุผลรายคนได้ถ้าผู้ใช้ร้องขอ
```

## 2. Existing Assets To Keep

ระบบใหม่ต้องใช้ data foundation ที่ทำไว้แล้ว ไม่ลบทิ้ง

### 2.1 Auth/Login Tables

ต้องเก็บไว้ทั้งหมด:

```text
user
session
account
verification
```

เหตุผล:

- ใช้ Better Auth login/session
- ML records ใหม่ต้องอ้างอิง user ผ่าน `created_by`, `imported_by`, ownership fields

### 2.2 Training Data Import/Clean

ต้องเก็บไว้:

```text
train_data_sources
train_raw_sheet_*
train_clean_customers
train_clean_payments
train_clean_usage
```

สถานะปัจจุบันจาก profiling:

```text
customers: 25,093
payments: 13,882
usage rows: 76,255
customers with payment: 4,381
customers with usage: 4,989
customers with payment + usage: 3,524
```

### 2.3 Prediction Data Import/Clean

ต้องเก็บไว้:

```text
predict_data_sources
predict_raw_sheet_*
predict_clean_customers
predict_clean_payments
predict_clean_usage
```

หมายเหตุ:

- schema มีแล้ว
- predict clean tables อาจยังไม่มี data จนกว่าจะ upload predict dataset

## 3. Existing Assets To Replace

ตาราง/logic เก่าที่ควรถูกแทนที่:

```text
prediction_runs
predictions
model_versions
```

logic/model scope เก่าที่ไม่ใช้ต่อ:

```text
winback model
conversion model
comeback_probability
conversion_probability
```

แนวทาง:

- ไม่ rewrite ทั้ง app
- rewrite เฉพาะ ML core: training, model registry, prediction output
- ใช้ code เก่าเป็น reference เฉพาะ pattern เช่น cutoff, feature ideas, evaluation

## 4. ML Scope

ระบบใหม่มี 4 prediction groups:

```text
1. Lifecycle Engine              rule-based
2. Churn Prediction              ML classifier
3. CLV Prediction                ML/statistical model
4. Credit Forecast               ML regression/forecast model
```

Model หลักจริงคือ:

```text
churn
clv
credit
```

Lifecycle เป็น business/rule layer ไม่ใช่ model หลัก

## 5. Core Principle: Point-In-Time Correctness

ทุก training row ต้องแยกข้อมูลเป็นสองฝั่ง:

```text
features = ข้อมูลก่อน cutoff_date
labels   = ผลลัพธ์หลัง cutoff_date
```

ห้ามใช้ข้อมูลหลัง cutoff เป็น feature เพราะจะทำให้ model แอบเห็นอนาคต

ตัวอย่าง:

```text
cutoff_date = 2025-07-01

ใช้ทำ feature ได้:
  payment ก่อน 2025-07-01
  usage ก่อน 2025-07-01
  customer profile ที่รู้ได้ ณ วันนั้น

ใช้ทำ label:
  payment/usage หลัง 2025-07-01 ถึง horizon
```

## 6. Recommended First Cutoff

จาก profiling script:

```text
cutoff_date: 2025-07-01
horizon_days: 180
active_window_days: 180
active_paid_before: 2,335
churn_positive: 712
churn_negative: 1,623
churn_positive_rate: 30.5%
```

สรุป:

- dataset พร้อมเริ่ม churn baseline
- label balance ใช้ได้
- cutoff แรกที่ควรใช้คือ `2025-07-01`

## 7. Required New DB Tables

### 7.1 `ml_training_runs`

เก็บรอบการ train แต่ละครั้ง

Required fields:

```text
id
source_id
run_type
status
started_at
finished_at
cutoff_date
horizon_days
training_config_json
parent_training_run_id
notes
error_message
created_by
created_at
```

Field meaning:

```text
source_id                FK -> train_data_sources.id
run_type                 initial_train | retrain | backtest | experiment
status                   pending | running | done | failed
cutoff_date              date used for feature/label split
horizon_days             label horizon, e.g. 180
training_config_json     algorithms, feature sets, hyperparameters
parent_training_run_id   link retrain to earlier training run
created_by               FK -> user.id
```

### 7.2 `ml_model_versions`

เก็บ model artifacts และ metrics

Required fields:

```text
id
training_run_id
model_type
version
status
artifact_path
metrics_json
validation_metrics_json
test_metrics_json
feature_names_json
label_definition_json
training_data_snapshot_json
is_active
activated_at
deactivated_at
trained_at
created_at
```

Allowed `model_type`:

```text
churn
clv
credit
```

Allowed `status`:

```text
candidate
active
rejected
archived
failed
```

Rule:

```text
ต้องมี active model ได้สูงสุด 1 version ต่อ model_type
```

### 7.3 `ml_model_activation_history`

เก็บ audit log การ activate/rollback model

Required fields:

```text
id
model_type
previous_model_version_id
new_model_version_id
action
reason
created_by
created_at
```

Allowed `action`:

```text
activate
rollback
deactivate
```

### 7.3.1 `ml_model_aliases`

เก็บ named pointer ไปยัง model version เพื่อให้ prediction code ไม่ต้อง hardcode version id

Required fields:

```text
id
model_type
alias
model_version_id
created_by
created_at
updated_at
```

Allowed `alias`:

```text
champion
challenger
rollback_candidate
```

Rules:

```text
prediction pipeline loads only alias = champion
retrain result can be assigned challenger first
activation means moving champion alias to new version
rollback means moving champion alias back to previous version
```

### 7.3.2 `ml_feature_sets`

เก็บ feature contract ที่ผูกกับ model version

Required fields:

```text
id
name
version
model_type
feature_names_json
feature_schema_json
transform_config_json
feature_code_hash
status
created_at
```

Purpose:

```text
บอกว่า model version นี้ train ด้วย feature columns ไหน
บอก dtype/null/default ของแต่ละ feature
บอก preprocessing/imputation/scaling/encoding config
ใช้ validate ว่า prediction features ตรงกับ training features
```

### 7.3.3 `ml_data_validation_reports`

เก็บ data quality, schema, drift, skew, และ label viability reports

Required fields:

```text
id
source_id
source_kind
training_run_id
prediction_run_id
validation_type
status
row_count
stats_json
anomalies_json
drift_json
created_at
```

Allowed `validation_type`:

```text
schema
profile
drift
train_predict_skew
label_viability
```

Allowed `status`:

```text
passed
warning
failed
```

Training/prediction must be blocked if required schema validation fails.

### 7.3.4 `ml_model_evaluations`

เก็บผลการประเมินโมเดลราย split, ราย cutoff, ราย baseline, และราย experiment

Required fields:

```text
id
model_version_id
training_run_id
model_type
evaluation_type
dataset_split
cutoff_date
horizon_days
baseline_name
feature_set_id
metrics_json
confusion_matrix_json
calibration_json
lift_table_json
feature_importance_json
error_analysis_json
business_metrics_json
artifact_path
created_at
```

Allowed `evaluation_type`:

```text
train
validation
test
backtest
baseline_comparison
calibration
ablation
robustness
```

Purpose:

```text
เก็บ F1/precision/recall/AUC/MAE/RMSE และ metric อื่น ๆ แบบ query ได้
เก็บหลาย cutoff/backtest ต่อ model version
เก็บ baseline comparison เพื่อพิสูจน์ว่า candidate ดีกว่า baseline
เก็บ calibration/lift/error analysis แยกจาก metrics summary
```

Promotion blocker:

```text
ห้าม assign champion alias ถ้า required ml_model_evaluations rows ยังไม่ครบ
```

### 7.4 `ml_prediction_runs`

เก็บรอบการ predict แต่ละครั้ง

Required fields:

```text
id
predict_source_id
status
cutoff_date
started_at
finished_at
total_customers
error_message
created_by
created_at
```

Field meaning:

```text
predict_source_id   FK -> predict_data_sources.id
status              pending | running | done | failed
cutoff_date         date used to build prediction features
```

### 7.5 `ml_prediction_outputs`

ตาราง output หลัก ต่อ customer ต่อ prediction run

Required fields:

```text
id
prediction_run_id
acc_id

lifecycle_stage
sub_stage

churn_probability
churn_risk_level

predicted_clv_6m
customer_value_tier
revenue_at_risk

predicted_credit_usage_30d
predicted_credit_usage_90d
estimated_days_until_topup
credit_urgency_level
recommended_followup_date

usage_trend
days_since_last_activity

n_purchases
total_revenue
avg_transaction_value
ever_paid

priority_score
priority_reason
recommended_action

ai_explanation
ai_reasoning_json
ai_recommended_message
ai_generated_at
ai_model
ai_status

output_status
output_notes
model_eligibility_json

model_versions_json
created_at
```

## 8. Output Requirements

### 8.0 Output Completeness Requirement

Prediction output ต้องมีครบทุก customer ที่อยู่ใน `predict_clean_customers`

Rule:

```text
count(ml_prediction_outputs where prediction_run_id = X)
=
count(predict_clean_customers where source_id = ml_prediction_runs.predict_source_id)
```

ห้ามตัดลูกค้าออกจาก output เพียงเพราะข้อมูลไม่พอสำหรับบาง model

ถ้าลูกค้าบางคนไม่มีข้อมูลพอ:

```text
ยังต้องสร้าง output row
model score ที่ไม่เหมาะสมให้เป็น null หรือ fallback
ต้องมี status/reason อธิบายว่าเหตุผลคืออะไร
```

Required support fields:

```text
output_status
output_notes
model_eligibility_json
```

Allowed `output_status`:

```text
predicted
partial
fallback
insufficient_data
failed
```

ตัวอย่าง `model_eligibility_json`:

```json
{
  "churn": {
    "eligible": false,
    "status": "not_eligible",
    "reason": "Customer has no prior paid activity"
  },
  "clv": {
    "eligible": false,
    "status": "fallback",
    "reason": "No purchase history"
  },
  "credit": {
    "eligible": false,
    "status": "insufficient_data",
    "reason": "No usage or top-up history"
  }
}
```

ตัวอย่าง behavior:

```text
Ghost customer:
  lifecycle_stage = Ghost
  churn_probability = null
  churn_risk_level = Not Eligible
  predicted_clv_6m = 0 or null
  credit_urgency_level = Unknown
  output_status = partial

No payment history:
  ever_paid = false
  n_purchases = 0
  total_revenue = 0
  avg_transaction_value = null
  customer_value_tier = No Purchase History

No usage history:
  usage_trend = Unknown
  predicted_credit_usage_30d = null
  predicted_credit_usage_90d = null
  credit_urgency_level = Unknown
```

### 8.1 Lifecycle Outputs

Purpose:

แบ่งลูกค้าเป็นกลุ่มเพื่อให้ business ตีความง่าย

Fields:

```text
lifecycle_stage
sub_stage
days_since_last_activity
ever_paid
```

Candidate stages:

```text
Ghost
Churned
Active Free
Active Paid
New Customer
Dormant Paid
High Usage Free
Low Usage Free
```

### 8.2 Churn Outputs

Purpose:

ทำนายความเสี่ยงที่ลูกค้าจะหยุดใช้งานหรือไม่กลับมาซื้อ/ใช้งานใน horizon

Fields:

```text
churn_probability
churn_risk_level
```

Risk level rule รอบแรก:

```text
Low      0.00 - 0.30
Medium   0.30 - 0.60
High     0.60 - 1.00
```

### 8.3 CLV Outputs

Purpose:

ทำนายมูลค่าลูกค้าในอนาคต

Fields:

```text
predicted_clv_6m
customer_value_tier
n_purchases
total_revenue
avg_transaction_value
```

Customer value tier rule รอบแรก:

```text
Low Value
Medium Value
High Value
VIP
```

ใช้ quantile จาก `predicted_clv_6m` หรือ `total_revenue`

### 8.4 Revenue Risk Outputs

Purpose:

วัดมูลค่าที่เสี่ยงหายไป

Field:

```text
revenue_at_risk
```

Formula:

```text
revenue_at_risk = churn_probability * predicted_clv_6m
```

### 8.5 Credit Forecast Outputs

Purpose:

คาดการณ์ usage/top-up เพื่อให้ทีม follow up ได้ถูกจังหวะ

Fields:

```text
predicted_credit_usage_30d
predicted_credit_usage_90d
estimated_days_until_topup
credit_urgency_level
recommended_followup_date
```

Credit urgency rule รอบแรก:

```text
Critical   estimated_days_until_topup <= 14
Warning    estimated_days_until_topup <= 30
Monitor    estimated_days_until_topup <= 90
Stable     otherwise
```

### 8.6 Usage/Engagement Outputs

Purpose:

ช่วยอธิบาย churn และ business action

Fields:

```text
usage_trend
days_since_last_activity
```

Candidate `usage_trend`:

```text
Growing
Stable
Declining
Inactive
Unknown
```

### 8.7 Priority/Action Outputs

Purpose:

เปลี่ยน model output ให้เป็น action list

Fields:

```text
priority_score
priority_reason
recommended_action
```

Candidate score components:

```text
churn risk
predicted CLV
revenue at risk
credit urgency
usage trend
days since last activity
```

Candidate actions:

```text
Call immediately
Send retention offer
Send top-up reminder
Upsell/cross-sell
Monitor
No action
```

### 8.8 AI Explanation Outputs

Purpose:

GenAI อธิบายเหตุผลราย customer หลัง ML output พร้อมแล้ว

Fields:

```text
ai_explanation
ai_reasoning_json
ai_recommended_message
ai_generated_at
ai_model
ai_status
```

Allowed `ai_status`:

```text
not_requested
pending
generated
failed
```

Important rule:

```text
AI explanation must not block prediction pipeline.
```

Flow:

```text
1. ML prediction output ถูกสร้างก่อน
2. user ขอ generate AI explanation รายคน
3. API load ml_prediction_outputs row
4. GenAI สร้าง explanation/message
5. update AI fields ใน row เดิม
```

## 9. Feature Engineering Requirements

Feature ต้องสร้างจากข้อมูลก่อน cutoff เท่านั้น

### 9.1 Customer Profile Features

Input:

```text
train_clean_customers
```

Features:

```text
days_since_join
days_until_sms_expire
days_until_email_expire
credit_sms
credit_email
credit_sms_log
credit_email_log
status_sms_is_paid
status_email_is_paid
has_sms_credit
has_email_credit
```

### 9.2 Activity Recency Features

Input:

```text
train_clean_payments
train_clean_usage
```

Features:

```text
days_since_last_payment
days_since_last_usage
days_since_last_activity
last_activity_type
active_in_last_30d
active_in_last_90d
active_in_last_180d
```

### 9.3 Payment Features

Input:

```text
train_clean_payments
```

Features:

```text
payment_count
payment_count_3m
payment_count_6m
total_revenue
total_revenue_3m
total_revenue_6m
avg_transaction_value
median_transaction_value
max_transaction_value
payment_recency_days
payment_tenure_days
avg_days_between_payments
std_days_between_payments
sms_payment_count
email_payment_count
sms_revenue
email_revenue
total_credit_added
sms_credit_added
email_credit_added
```

### 9.4 Usage Features

Input:

```text
train_clean_usage
```

Features:

```text
usage_total
usage_total_1m
usage_total_3m
usage_total_6m
usage_avg_monthly
usage_max_monthly
usage_active_months
usage_recent_3m
usage_prev_3m
usage_change_abs
usage_change_pct
usage_decay_ratio
usage_slope
usage_volatility
```

### 9.5 Channel Features

Input:

```text
train_clean_usage.channel
```

Features:

```text
sms_usage_total
email_usage_total
sms_usage_share
email_usage_share
sms_usage_3m
email_usage_3m
dominant_channel
```

### 9.6 Usage Source Features

Input:

```text
train_clean_usage.usage_source
```

Features:

```text
bc_usage_total
api_usage_total
otp_usage_total
bc_usage_share
api_usage_share
otp_usage_share
bc_usage_3m
api_usage_3m
otp_usage_3m
dominant_usage_source
```

### 9.7 Credit Behavior Features

Features:

```text
credit_balance_total
credit_balance_sms
credit_balance_email
credit_added_total
credit_added_6m
usage_to_credit_ratio
estimated_months_of_credit_remaining
days_until_nearest_credit_expiry
days_until_sms_expire
days_until_email_expire
```

### 9.8 Derived Business Features

Features:

```text
ever_paid
n_purchases
customer_age_days
payment_frequency_per_month
usage_frequency_per_month
revenue_per_usage_unit
engagement_score
```

## 10. Label Definitions

### 10.1 Churn Label

Target:

```text
churn_label
```

Population:

```text
customers active before cutoff
AND customers ever paid before cutoff
```

Definition:

```text
churn_label = 1
ถ้าไม่มี payment และไม่มี usage ใน horizon หลัง cutoff

churn_label = 0
ถ้ามี payment หรือ usage ใน horizon หลัง cutoff
```

Default config:

```text
active_window_days = 180
horizon_days = 180
cutoff_date = 2025-07-01
```

### 10.2 CLV Label

Target:

```text
future_revenue_6m
```

Population:

```text
customers active before cutoff
```

Definition:

```text
future_revenue_6m = sum(payment.amount)
where payment_date >= cutoff
and payment_date < cutoff + 180 days
```

Recommended modeling approach:

```text
two-stage model
```

Stage 1:

```text
predict probability of future purchase
```

Stage 2:

```text
predict revenue amount if purchase
```

Final:

```text
predicted_clv_6m = purchase_probability * expected_revenue_if_purchase
```

### 10.3 Credit Usage Labels

Targets:

```text
future_credit_usage_30d
future_credit_usage_90d
```

Definition:

```text
future_credit_usage_30d = sum(usage)
where period >= cutoff
and period < cutoff + 30 days

future_credit_usage_90d = sum(usage)
where period >= cutoff
and period < cutoff + 90 days
```

### 10.4 Top-Up Timing Label

Target:

```text
days_until_next_topup
```

Definition:

```text
days_until_next_topup = next payment_date after cutoff - cutoff_date
```

Notes:

- This target is censored if no future payment is observed
- Start as secondary target after credit usage forecast works

## 11. Model Training Requirements

All model experiments must follow:

```text
docs/ML-EXPERIMENT-PLAN.md
```

This experiment plan is the source of truth for:

```text
baseline models
candidate models
feature-set ablations
calibration experiments
business metrics
champion selection
model card requirements
```

### 11.1 Churn Model

Type:

```text
binary classifier
```

Candidate algorithms:

```text
Logistic Regression baseline
Random Forest baseline
LightGBM
XGBoost
CatBoost if dependency is approved
```

Primary metric:

```text
PR-AUC
```

Secondary metrics:

```text
ROC-AUC
F1
precision
recall
recall@top10%
lift@top10%
calibration error
```

Required output:

```text
churn_probability
churn_risk_level
```

Required evaluation rows:

```text
train
validation
test
backtest
baseline_comparison
calibration
```

### 11.2 CLV Model

Type:

```text
regression / two-stage model
```

Candidate algorithms:

```text
LightGBM regressor
XGBoost regressor
Tweedie regression
Gamma regression
BG/NBD + Gamma-Gamma as benchmark
```

Primary metric:

```text
MAE
```

Secondary metrics:

```text
RMSE
MAPE or SMAPE
Spearman rank correlation
top-decile revenue capture
```

Required output:

```text
predicted_clv_6m
customer_value_tier
```

Required evaluation rows:

```text
train
validation
test
backtest
baseline_comparison
ablation
```

### 11.3 Credit Forecast Model

Type:

```text
regression / quantile regression
```

Candidate algorithms:

```text
LightGBM regressor
XGBoost regressor
LightGBM quantile regression
survival/time-to-event model for top-up timing
```

Targets:

```text
predicted_credit_usage_30d
predicted_credit_usage_90d
estimated_days_until_topup
```

Primary metrics:

```text
MAE
RMSE
quantile coverage if using quantiles
```

Required output:

```text
predicted_credit_usage_30d
predicted_credit_usage_90d
estimated_days_until_topup
credit_urgency_level
recommended_followup_date
```

Required evaluation rows:

```text
train
validation
test
backtest
baseline_comparison
ablation
```

## 12. Validation Requirements

Validation must be temporal, not random-only

Training and prediction must follow:

```text
docs/ML-TRAINING-QUALITY-GATES.md
```

This gate document is the source of truth for:

```text
data readiness checks
schema/data quality checks
label viability checks
leakage checks
feature contract checks
preprocessing safety checks
baseline comparison
promotion gate
prediction readiness checks
post-prediction monitoring
```

Recommended approach:

```text
train cutoff 1: 2024-07-01
validation cutoff 2: 2024-10-01
validation cutoff 3: 2025-01-01
test cutoff 4: 2025-04-01 or 2025-07-01
```

Why:

- Random split can leak customer time behavior
- Real prediction always predicts future from a cutoff

Minimum checks before accepting model:

```text
label balance is usable
no future data used as feature
metrics better than baseline
top-k lift useful for business
calibration acceptable
feature importance makes business sense
```

### 12.1 Data Quality Validation

Before training:

```text
validate train_clean_customers schema
validate train_clean_payments schema
validate train_clean_usage schema
validate row counts are non-zero
validate required columns have acceptable null rates
validate date ranges support cutoff + horizon
validate label viability
```

Before prediction:

```text
validate predict_clean_customers schema
validate predict_clean_payments schema
validate predict_clean_usage schema
validate predict source has at least customers
validate active champion models exist
validate prediction feature columns match model feature set
```

Validation output must be saved to:

```text
ml_data_validation_reports
```

### 12.2 Feature Schema Validation

Each feature set must define:

```text
feature name
dtype
nullable
default/fallback value
allowed categorical values
min/max sanity bounds for numeric features
source group
PIT risk tier
```

Prediction must fail before scoring if:

```text
required feature missing
feature dtype cannot be coerced
feature order cannot be aligned to model feature_names_json
categorical value is unsupported and no fallback exists
```

### 12.3 Train/Predict Skew And Drift

For every prediction run, compare prediction feature statistics to the champion model's training feature statistics

Required checks:

```text
numeric feature distribution shift
categorical value distribution shift
missing rate change
new unseen category values
row count and coverage changes
```

Initial metrics:

```text
PSI for numeric features
Jensen-Shannon divergence for numeric/categorical distributions
L-infinity distance for categorical shares
missing-rate delta
```

Behavior:

```text
severe schema issue -> fail prediction before scoring
moderate drift/skew -> allow prediction but write warning report
severe drift/skew -> allow only if explicitly configured, otherwise block
```

## 13. Retrain Requirements

Retrain must be supported from the beginning

Retrain behavior:

```text
1. create new ml_training_runs row
2. build training data from selected source_id/cutoff/config
3. train new candidate model versions
4. evaluate against champion active model
5. save artifacts without overwriting old files
6. assign challenger alias if metrics are acceptable
7. move champion alias only after activation approval/rule passes
8. keep previous champion as rollback_candidate
```

Do not overwrite:

```text
old model artifact
old metrics
old training run
old prediction output
```

Rollback behavior:

```text
1. select old ml_model_versions row
2. deactivate current active model
3. activate selected version
4. insert ml_model_activation_history row
```

## 14. Artifact Requirements

Artifacts should be versioned by training run and model type

Suggested structure:

```text
models/
  training_runs/
    <training_run_id>/
      churn/
        model.pkl
        feature_names.json
        metrics.json
      clv/
        model.pkl
        feature_names.json
        metrics.json
      credit/
        model.pkl
        feature_names.json
        metrics.json
      training_report.json
```

Each model artifact must include:

```text
model object
feature list
preprocessing config
label definition
training metadata
created_at
```

## 15. Training Pipeline Flow

## 15.0 Train/Predict Flow Independence

Training import และ prediction import เป็นคนละ flow กัน

```text
Train import:
  train_data_sources
  train_clean_*
  ใช้สำหรับ initial train หรือ retrain

Predict import:
  predict_data_sources
  predict_clean_*
  ใช้สำหรับ run prediction ด้วย active models
```

ระบบต้องรองรับ:

```text
1. import train data แล้ว train/retrain
2. import predict data แล้ว predict โดยไม่ train ใหม่
3. import predict data ก่อนหรือหลัง retrain ก็ได้
4. retrain model ใหม่โดยไม่ overwrite prediction outputs เก่า
```

Prediction must not trigger training automatically.

ก่อน prediction ต้อง validate:

```text
predict_clean_customers exists for predict_source_id
active churn model exists
active clv model exists
active credit model exists
```

ถ้า active model ไม่ครบ:

```text
ml_prediction_runs.status = failed
ml_prediction_runs.error_message = "No active <model_type> model version available"
```

Shared feature code หมายถึงใช้ function เดียวกัน ไม่ใช่ dataset เดียวกัน:

```text
training:
  load_train_clean(source_id)
  build_all_features(...)
  build_labels(...)

prediction:
  load_predict_clean(source_id)
  build_all_features(...)
  no labels
```

## 15.1 Training Pipeline Flow

### Step 1: Dataset Profiling

Already started with:

```text
apps/ml/scripts/profile_training_dataset.py
```

Output:

```text
models/training_dataset_profile.json
```

Purpose:

```text
ตรวจว่า dataset รองรับ label ไหน
หา cutoff ที่เหมาะ
ดู churn positive/negative balance
ดู CLV future revenue viability
ดู credit usage/top-up target viability
```

### Step 2: Build Feature Builder

Create reusable module:

```text
apps/ml/src/training/features.py
```

Responsibilities:

```text
load clean dataframes
filter pre-cutoff data
create feature dataframe per acc_id
return feature_names
ensure no future leakage
```

### Step 3: Build Label Builder

Create module:

```text
apps/ml/src/training/labels.py
```

Responsibilities:

```text
build churn_label
build future_revenue_6m
build future_credit_usage_30d
build future_credit_usage_90d
build days_until_next_topup
```

### Step 4: Build Training Dataset

Create module:

```text
apps/ml/src/training/dataset.py
```

Responsibilities:

```text
combine features + labels
filter eligible population per model
return train/validation/test frames
write dataset summary
```

### Step 5: Train Churn Baseline

Create script:

```text
apps/ml/scripts/train_churn_baseline.py
```

Required output:

```text
model artifact
metrics
feature importance
candidate ml_model_versions row
```

### Step 6: Train CLV Baseline

Create script:

```text
apps/ml/scripts/train_clv_baseline.py
```

Required output:

```text
model artifact
metrics
feature importance
candidate ml_model_versions row
```

### Step 7: Train Credit Baseline

Create script:

```text
apps/ml/scripts/train_credit_baseline.py
```

Required output:

```text
model artifact
metrics
feature importance
candidate ml_model_versions row
```

### Step 8: Unified Training Runner

Create script:

```text
apps/ml/scripts/train_models.py
```

Responsibilities:

```text
create ml_training_runs
train churn
train clv
train credit
save artifacts
insert ml_model_versions
optionally activate versions
```

### Step 9: Prediction Runner

Create script/module:

```text
apps/ml/scripts/run_prediction.py
apps/ml/src/prediction/
```

Responsibilities:

```text
load predict_clean_*
load active model versions
build features
assign lifecycle
predict churn/clv/credit
calculate derived outputs
insert ml_prediction_outputs
update ml_prediction_runs status
```

## 16. Prediction Pipeline Flow

Input:

```text
predict_clean_customers
predict_clean_payments
predict_clean_usage
```

Flow:

```text
1. create ml_prediction_runs row
2. load clean predict data
3. build point-in-time features
4. assign lifecycle
5. load champion churn model alias
6. load champion clv model alias
7. load champion credit model alias
8. predict model outputs
9. calculate derived business outputs
10. insert ml_prediction_outputs
11. set ml_prediction_runs.status = done
```

Failure behavior:

```text
ml_prediction_runs.status = failed
ml_prediction_runs.error_message = error message
```

## 17. AI Explanation Flow

AI explanation is optional and per-customer

Input:

```text
ml_prediction_outputs row
```

Prompt context should include:

```text
lifecycle_stage
sub_stage
churn_probability
churn_risk_level
predicted_clv_6m
customer_value_tier
revenue_at_risk
predicted_credit_usage_30d
predicted_credit_usage_90d
estimated_days_until_topup
credit_urgency_level
usage_trend
days_since_last_activity
n_purchases
total_revenue
avg_transaction_value
priority_score
priority_reason
recommended_action
```

Output:

```text
ai_explanation
ai_reasoning_json
ai_recommended_message
ai_generated_at
ai_model
ai_status
```

AI must not:

```text
change model scores
invent data not present in prediction output
block prediction run
```

## 18. Implementation Order

### Phase 1: Requirements And Profiling

```text
1. finalize this SRS
2. keep ML-DB-REBUILD-PLAN.md updated
3. run profile_training_dataset.py
4. lock first cutoff/horizon
5. implement ML-TRAINING-QUALITY-GATES.md reports
```

Status:

```text
profile script done
recommended first cutoff = 2025-07-01
```

### Phase 2: New DB Schema

```text
1. create Alembic migration for ml_training_runs
2. create Alembic migration for ml_model_versions
3. create Alembic migration for ml_model_activation_history
4. create Alembic migration for ml_prediction_runs
5. create Alembic migration for ml_prediction_outputs
6. update Drizzle schema for query builder
```

### Phase 3: Churn Model First

```text
1. build training data loader from train_clean_*
2. build feature builder
3. build churn label builder
4. train simple baseline
5. train LightGBM/XGBoost candidate
6. evaluate temporal metrics
7. save artifact
8. insert ml_training_runs + ml_model_versions
```

### Phase 4: CLV Model

```text
1. build future_revenue_6m label
2. train baseline regressor
3. test two-stage model
4. evaluate revenue ranking
5. save artifact + metrics
```

### Phase 5: Credit Model

```text
1. build future_credit_usage_30d
2. build future_credit_usage_90d
3. build days_until_next_topup if viable
4. train baseline regressors
5. evaluate MAE/RMSE
6. save artifact + metrics
```

### Phase 6: Prediction Output

```text
1. create prediction runner
2. load active model versions
3. predict on predict_clean_*
4. calculate business outputs
5. insert ml_prediction_outputs
```

### Phase 7: Retrain And Activation

```text
1. add retrain run_type
2. compare candidate vs active
3. activate new model
4. rollback old model
5. record activation history
```

### Phase 8: AI Explanation

```text
1. add endpoint/script to generate explanation per customer
2. update AI fields in ml_prediction_outputs
3. do not block main prediction flow
```

## 19. Acceptance Criteria

### DB Acceptance

```text
new ML tables exist
auth tables untouched
train/predict clean tables untouched
old prediction tables not dropped until new flow works
model aliases exist for champion/challenger
feature sets and data validation reports are persisted
```

### Training Acceptance

```text
can create ml_training_runs row
can create ml_data_validation_reports before training
can train churn model from train_clean_*
can save model artifact
can insert ml_model_versions row
can insert ml_model_evaluations rows for required splits/reports
can assign challenger/champion aliases
can retrain without overwriting old model
```

### Prediction Acceptance

```text
can create ml_prediction_runs row
can load champion models by alias
can validate predict data and feature schema before scoring
can generate output per customer
output row count equals predict_clean_customers count
customers with insufficient data still get output rows
model_eligibility_json explains null/fallback scores
can insert ml_prediction_outputs
can update status done/failed correctly
```

### Model Acceptance

```text
churn model beats baseline
CLV model provides useful rank ordering
credit model gives usable 30d/90d forecasts
metrics are saved
evaluation rows are saved in ml_model_evaluations
feature names are saved
label definitions are saved
```

### AI Acceptance

```text
AI explanation can be generated per customer
AI output is saved in ml_prediction_outputs
AI failure does not fail prediction run
AI does not modify model scores
```

## 20. Immediate Next Step

Next implementation task:

```text
Build churn training dataframe for cutoff_date = 2025-07-01
```

Required deliverables:

```text
features dataframe
churn_label
dataset summary
positive/negative label count
train/validation/test split
baseline churn metrics
```

Suggested file:

```text
apps/ml/scripts/build_churn_training_dataset.py
```

After this works, proceed to:

```text
train_churn_baseline.py
```

## 21. Design References And Rationale

เอกสารนี้ไม่ได้ออกแบบจากศูนย์ทั้งหมด แต่ดึง pattern จาก ML/open-source practices ที่ใช้กันทั่วไป

### 21.1 RFM For Churn And Customer Behavior

Rationale:

```text
Recency, Frequency, Monetary features are standard customer behavior signals.
They explain how recently, how often, and how much a customer engages/spends.
```

ใช้ในระบบนี้:

```text
payment recency
payment frequency
payment monetary value
usage recency
usage frequency/volume
usage trend
```

Why:

```text
churn มักเกิดหลัง recency ยาวขึ้น, frequency ลดลง, usage/revenue ลดลง
```

### 21.2 CLV Modeling

Rationale:

```text
CLV commonly uses purchase frequency, recency, customer age/tenure, and monetary value.
BG/NBD + Gamma-Gamma style models use these concepts directly.
```

ใช้ในระบบนี้:

```text
future_revenue_6m
payment_count
payment_tenure_days
days_since_last_payment
avg_transaction_value
total_revenue
```

Why:

```text
CLV ไม่ควรวัดจาก total revenue อย่างเดียว ต้องดูว่าลูกค้ายัง active และมี repeat behavior หรือไม่
```

### 21.3 Feature Store Pattern

Rationale:

```text
Feast-style feature stores emphasize point-in-time joins and consistent feature definitions between training and serving.
```

ใช้ในระบบนี้:

```text
cutoff_date as event timestamp
shared build_all_features(...)
ml_feature_sets
feature_schema_json
feature_code_hash
```

Why:

```text
กัน train/predict feature ไม่ตรงกัน และกัน future leakage
```

### 21.4 Preprocessing Pipeline Pattern

Rationale:

```text
scikit-learn Pipeline/ColumnTransformer pattern prevents preprocessing leakage and train/predict mismatch.
```

ใช้ในระบบนี้:

```text
fit preprocessing on train split only
transform validation/test/predict only
save preprocessing config with artifact
```

Why:

```text
imputer/scaler/category vocabulary ต้องมาจาก training data ไม่ใช่ refit จาก predict data
```

### 21.5 Model Registry Pattern

Rationale:

```text
MLflow-style model aliases decouple serving code from exact model version ids.
```

ใช้ในระบบนี้:

```text
ml_model_versions
ml_model_aliases
champion
challenger
rollback_candidate
ml_model_activation_history
```

Why:

```text
prediction pipeline โหลด champion เสมอ
retrain สร้าง challenger ก่อน
promotion/rollback เปลี่ยน alias ไม่ต้องแก้ prediction code
```

### 21.6 Data Validation Pattern

Rationale:

```text
TFDV-style validation checks schema, anomalies, drift, and train/predict skew.
```

ใช้ในระบบนี้:

```text
ml_data_validation_reports
schema validation
missing-rate validation
drift/skew validation
label viability validation
```

Why:

```text
โมเดลที่ดีจะพังได้ถ้า predict dataset distribution เปลี่ยนหรือ schema ผิด
```
