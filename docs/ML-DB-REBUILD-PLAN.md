# ML DB Rebuild Plan

แผนนี้เป็นแนวทางการล้าง DB ฝั่ง ML/output เก่า และสร้าง schema ใหม่สำหรับ training + prediction output โดยยังเก็บ pipeline data import/clean ชุดใหม่ที่ทำไปแล้ว

Related documents:

```text
docs/ML-TRAINING-SRS.md
docs/ML-FEATURE-SPEC.md
docs/ML-TRAINING-QUALITY-GATES.md
```

## Goal

สร้างฐานข้อมูลฝั่ง ML ใหม่ให้รองรับ flow นี้:

```text
Excel upload
  -> raw tables
  -> clean tables
  -> training dataset
  -> trained model artifacts
  -> prediction run
  -> prediction output tables
```

ยังไม่รวม web/UI ใน scope นี้ โฟกัสเฉพาะ DB, training model, และ output ที่ต้อง persist

ระบบต้องรองรับ retrain ตั้งแต่แรก:

```text
train ครั้งแรก
retrain จาก dataset ใหม่หรือ cutoff ใหม่
compare metrics กับ active model
activate model version ใหม่
rollback ไป version เก่าได้ถ้าจำเป็น
```

## Non-ML Tables Must Stay

ตารางที่เกี่ยวกับ login/auth/user/session ไม่อยู่ใน scope การลบ DB รอบนี้ ต้องเก็บไว้ทั้งหมด

```text
user
session
account
verification
```

เหตุผล:

- เป็น Better Auth schema สำหรับ login/session
- ไม่เกี่ยวกับ ML output เก่า
- ML tables ใหม่ยังต้องอ้างอิง user ผ่าน `created_by`, `imported_by`, หรือ ownership fields

ถ้าต้องแก้ schema ฝั่ง auth ให้ทำเป็นงานแยก ไม่รวมกับ ML DB rebuild

## Keep

ตารางชุดใหม่เหล่านี้ให้เก็บไว้ เพราะเป็น data foundation ที่ทำแล้วและถูกทาง:

```text
train_data_sources
train_raw_sheet_*
train_clean_customers
train_clean_payments
train_clean_usage

predict_data_sources
predict_raw_sheet_*
predict_clean_customers
predict_clean_payments
predict_clean_usage
```

เหตุผล:

- แยก train กับ predict data ชัดเจน
- มี `source_id` สำหรับ trace กลับไปยังไฟล์ที่ import
- มี raw lineage ผ่าน `raw_row_id` และ `excel_row`
- clean tables เป็น typed schema แล้ว
- เหมาะเป็น input ให้ Python training/prediction pipeline

## Remove Or Replace

ตาราง/output เก่าที่ควรลบหรือเลิกใช้ใน rebuild รอบนี้:

```text
predictions
prediction_runs
model_versions
```

หมายเหตุ:

- ถ้ายังมี Better Auth tables ให้เก็บไว้ ไม่เกี่ยวกับ ML rebuild
- ถ้ายังมี `explanations` ที่ผูกกับ `prediction_runs` เก่า ให้ย้ายไป phase หลัง หรือ drop พร้อม old prediction schema
- การลบจริงต้องทำผ่าน Alembic migration ไม่ใช้ Drizzle generate/push
- `prediction_runs` เก่าจะถูกแทนด้วย run schema ใหม่ ไม่ใช่การลบ concept ของ run ออก

Current status:

```text
apps/ml/alembic/versions/2026_06_05_0006_drop_legacy_ml_tables.py
```

Legacy `prediction_runs`, `predictions`, `model_versions`, and old `explanations` are dropped by Alembic `0006`.
Runtime/UI references to win-back/conversion outputs have been removed from the active app. Alembic baseline history still contains old columns because migration history must remain replayable.

## Run Model In New System

ระบบใหม่ยังต้องมี "run" แยกตามจุดประสงค์ แต่จะออกแบบใหม่ให้ชัดกว่าเดิม:

```text
ml_training_runs     = รอบการ train model จาก train dataset
ml_prediction_runs   = รอบการ predict จาก predict dataset
```

แนวคิด:

- ทุก training รอบต้อง trace ได้ว่าใช้ `train_data_sources.id` ไหน
- ทุก prediction รอบต้อง trace ได้ว่าใช้ `predict_data_sources.id` ไหน
- ทุก output row ต้องรู้ว่า generated จาก prediction run ไหน
- ทุก model artifact ต้องรู้ว่าเกิดจาก training run ไหน
- ownership/user tracking ต้องคงไว้ผ่าน `created_by` หรือ field ที่ผูกกับ Better Auth user
- read access เป็น shared internal: authenticated users อ่าน runs/data sources ได้ทุกอัน
- write/mutation access ค่อยจำกัด owner/importer หรือ admin role ในอนาคต

ดังนั้นเราจะไม่ทิ้ง run concept แต่จะลบ schema run เก่าแล้วสร้างใหม่ให้ตรงกับ training/prediction pipeline ใหม่

## New Model Scope

ระบบใหม่มี prediction group 4 กลุ่ม:

```text
1. Lifecycle Engine              rule-based
2. Churn Prediction              ML model
3. CLV Prediction                ML/statistical model
4. Credit Forecast               ML model
```

Model หลักจริงคือข้อ 2, 3, 4

ตัดออกจาก scope ใหม่:

```text
Win-back Prediction
Conversion Prediction
comeback_probability
conversion_probability
```

Runtime cleanup status:

```text
apps/ml/src/models/winback_model.py      removed
apps/ml/src/models/conversion_model.py   removed
tracked __pycache__ artifacts            removed
web win-back/conversion UI references    removed
```

## Proposed New Tables

### 1. `ml_training_runs`

เก็บ 1 record ต่อการ train model batch หนึ่งครั้ง

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

ความหมาย:

- `source_id` FK ไปที่ `train_data_sources.id`
- `run_type` เช่น `initial_train`, `retrain`, `backtest`, `experiment`
- `cutoff_date` คือวันที่ใช้แบ่ง feature/label
- `horizon_days` เช่น 180 วัน สำหรับ churn/CLV 6 เดือน
- `status` เช่น `pending`, `running`, `done`, `failed`
- `training_config_json` เก็บ config ที่ใช้ train เช่น feature set, algorithm, hyperparameters, cutoff strategy
- `parent_training_run_id` ใช้ link retrain กลับไปยัง training run ก่อนหน้า ถ้ามี

### 2. `ml_model_versions`

เก็บ model artifact และ metrics แยกตาม model type

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

`model_type` ที่ใช้:

```text
churn
clv
credit
```

ตัวอย่าง `metrics_json`:

```json
{
  "auc": 0.82,
  "f1": 0.71,
  "mae": 1200.5,
  "rmse": 2500.9
}
```

สำหรับ retrain ต้องเก็บข้อมูลพอสำหรับเปรียบเทียบ version:

```text
validation_metrics_json
test_metrics_json
training_data_snapshot_json
activated_at
deactivated_at
```

`training_data_snapshot_json` ตัวอย่าง:

```json
{
  "source_id": "uuid",
  "customer_count": 25093,
  "payment_rows": 13882,
  "usage_rows": 76255,
  "cutoff_date": "2025-07-01",
  "horizon_days": 180,
  "positive_label_rate": 0.34
}
```

Active model rule:

```text
ต้องมี active model ได้สูงสุด 1 version ต่อ model_type
```

เมื่อ activate version ใหม่:

```text
1. deactivate active version เก่าของ model_type นั้น
2. set is_active = true ให้ version ใหม่
3. set activated_at
4. เก็บ old version ไว้ rollback ได้
```

### 2.1 `ml_model_activation_history`

แนะนำให้มี table สำหรับ audit การ activate/rollback model

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

`action`:

```text
activate
rollback
deactivate
```

ใช้ตอบคำถามว่า model version ไหนถูกใช้จริงเมื่อไร และใครเป็นคนเปลี่ยน

### 2.2 `ml_model_aliases`

เพิ่ม alias layer แบบ model registry สมัยใหม่ เพื่อไม่ให้ prediction code ผูกกับ version id ตรง ๆ

```text
id
model_type
alias
model_version_id
created_by
created_at
updated_at
```

Allowed aliases:

```text
champion
challenger
rollback_candidate
```

ความหมาย:

```text
champion            model version ที่ prediction pipeline ใช้จริง
challenger          candidate ที่ผ่าน train แล้วแต่ยังไม่ใช้ production prediction
rollback_candidate  version เก่าที่ rollback ได้เร็ว
```

Rule:

```text
แต่ละ model_type มี alias เดียวกันได้แค่ 1 row
prediction pipeline ต้องโหลด model ผ่าน alias = champion
ห้าม hardcode model_version_id ใน prediction code
```

### 2.3 `ml_feature_sets`

เก็บ contract ของ feature set ที่ model version ใช้

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

Hash metadata:

```text
feature_code_hash = stored in ml_feature_sets.feature_code_hash
lifecycle_code_hash = stored in transform_config_json.metadata.lifecycle_code_hash
```

เหตุผล:

- model ต้องรู้ว่า train ด้วย feature list ไหน
- predict ต้องสร้าง feature columns ให้ตรงกับตอน train
- ถ้า feature code เปลี่ยน ต้อง trace ได้ว่า model version ไหนใช้ feature code version ไหน

### 2.4 `ml_data_validation_reports`

เก็บ report ของ data quality, schema check, drift, และ train/predict skew

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

Allowed `source_kind`:

```text
train
predict
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

ใช้สำหรับ block training/prediction ถ้า schema หรือ feature quality ผิดรุนแรง

### 2.5 `ml_model_evaluations`

เก็บผลการประเมินโมเดลแบบละเอียด แยกจาก `ml_model_versions`

เหตุผล:

```text
model version หนึ่งตัวต้องมี evaluation ได้หลายชุด:
  train split
  validation split
  test split
  temporal backtest แต่ละ cutoff
  baseline comparison
  calibration report
  ablation report
```

ถ้าเก็บทั้งหมดใน `ml_model_versions.metrics_json` อย่างเดียว จะ query/compare ยาก

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

Allowed `dataset_split`:

```text
train
validation
test
backtest_<cutoff_date>
calibration
```

ตัวอย่าง metrics ต่อ model:

```text
churn:
  metrics_json: ROC-AUC, PR-AUC, precision, recall, F1, Brier, log loss
  confusion_matrix_json: TP, FP, TN, FN by threshold
  calibration_json: bins, predicted probability, observed rate
  lift_table_json: decile lift, recall@top-k
  business_metrics_json: revenue_at_risk captured@top-k

clv:
  metrics_json: MAE, RMSE, SMAPE, Spearman
  error_analysis_json: error by value tier, outlier impact
  business_metrics_json: top-decile revenue capture

credit:
  metrics_json: MAE, RMSE, SMAPE
  error_analysis_json: error by usage tier/channel
  business_metrics_json: urgency bucket quality, followup date error
```

Promotion rule:

```text
champion alias cannot be assigned if required ml_model_evaluations rows are missing
```

### 3. `ml_prediction_runs`

เก็บ 1 record ต่อการ run prediction บน predict dataset หนึ่งชุด

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

ความหมาย:

- `predict_source_id` FK ไปที่ `predict_data_sources.id`
- ใช้แทน `prediction_runs` เก่า
- สถานะเช่น `pending`, `running`, `done`, `failed`

### 4. `ml_prediction_outputs`

ตาราง output หลัก ต่อ customer ต่อ prediction run

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

`model_versions_json` ใช้เก็บว่า output row นี้ generated จาก model version ไหนบ้าง:

```json
{
  "churn": "uuid",
  "clv": "uuid",
  "credit": "uuid"
}
```

AI fields เป็น optional และจะถูกเติมหลังจาก ML prediction เสร็จแล้วเท่านั้น:

```text
ai_explanation
ai_reasoning_json
ai_recommended_message
ai_generated_at
ai_model
ai_status
```

แนวคิดคือ ML pipeline สร้างตัวเลขและ business signals ก่อน จากนั้นถ้าผู้ใช้ต้องการ generate explanation ราย customer ค่อยเรียก GenAI มาเติม field เหล่านี้

ตัวอย่าง:

```text
ai_status = pending | generated | failed
ai_explanation = "ลูกค้ารายนี้มีความเสี่ยงสูง เพราะ usage ลดลง 68% ใน 3 เดือนล่าสุด และไม่มีการเติมเครดิตมา 120 วัน"
ai_recommended_message = "แนะนำติดต่อภายใน 7 วัน พร้อมเสนอแพ็กเกจเติมเครดิตสำหรับ SMS bulk"
ai_model = gemini-...
ai_generated_at = 2026-06-04T15:30:00Z
```

`ai_reasoning_json` ใช้เก็บ structured explanation ที่ UI หรือ report เอาไปใช้ต่อได้:

```json
{
  "summary": "High churn risk with declining usage",
  "main_reasons": [
    "Usage dropped in recent months",
    "Long time since last activity",
    "High historical revenue"
  ],
  "suggested_actions": [
    "Call within 7 days",
    "Offer retention package",
    "Check if SMS campaign volume moved to another provider"
  ],
  "confidence_note": "Based on ML output and customer history available at prediction time"
}
```

สำคัญ: GenAI ต้องไม่ถูกใช้แทน model prediction หลัก แต่ใช้เพื่ออธิบายและแปลงผล ML ให้เป็นภาษาคนอ่าน

Output completeness rule:

```text
ทุก customer ใน predict_clean_customers ต้องมี row ใน ml_prediction_outputs
```

ถ้าบาง model predict ไม่ได้เพราะข้อมูลไม่พอ ให้ยังสร้าง row และเติม:

```text
output_status
output_notes
model_eligibility_json
```

ตัวอย่าง `model_eligibility_json`:

```json
{
  "churn": {
    "eligible": true,
    "status": "predicted",
    "reason": null
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

## Output Field Groups

### Lifecycle

```text
lifecycle_stage
sub_stage
days_since_last_activity
ever_paid
```

### Churn

```text
churn_probability
churn_risk_level
```

### CLV

```text
predicted_clv_6m
customer_value_tier
n_purchases
total_revenue
avg_transaction_value
```

### Revenue Risk

```text
revenue_at_risk
```

คำนวณจาก:

```text
churn_probability * predicted_clv_6m
```

### Credit Forecast

```text
predicted_credit_usage_30d
predicted_credit_usage_90d
estimated_days_until_topup
credit_urgency_level
recommended_followup_date
```

### Usage / Engagement

```text
usage_trend
days_since_last_activity
```

### Business Action

```text
priority_score
priority_reason
recommended_action
```

### AI Explanation

Fields กลุ่มนี้เป็น optional per-customer explanation หลังจาก prediction output มีแล้ว:

```text
ai_explanation
ai_reasoning_json
ai_recommended_message
ai_generated_at
ai_model
ai_status
```

ใช้เมื่อผู้ใช้ต้องการให้ AI สรุปเหตุผลรายคน เช่น:

```text
ทำไมลูกค้าคนนี้ churn risk สูง
ควรติดต่อด้วยข้อความแบบไหน
เหตุผลหลักที่ priority score สูงคืออะไร
ควรเสนอ action อะไรกับลูกค้ารายนี้
```

AI explanation ต้องอ้างอิงจาก fields ที่ ML/business layer สร้างไว้แล้ว เช่น:

```text
lifecycle_stage
churn_probability
predicted_clv_6m
revenue_at_risk
usage_trend
days_since_last_activity
credit_urgency_level
priority_score
recommended_action
```

## Training Pipeline Plan

### Step 1: Load Clean Train Data

Python loader ต้องอ่านจาก:

```text
train_clean_customers
train_clean_payments
train_clean_usage
```

โดย filter ด้วย `source_id`

### Step 2: Build Features

สร้าง feature จากข้อมูลก่อน `cutoff_date` เท่านั้น

Feature groups:

```text
customer profile
payment recency/frequency/monetary
usage volume and trend
credit balance and expiry
channel mix sms/email
usage source mix bc/api/otp
```

### Step 3: Build Labels

Labels ใช้ข้อมูลหลัง `cutoff_date`

```text
churn_label
future_revenue_6m
future_credit_usage_30d
future_credit_usage_90d
days_until_next_topup
```

### Step 4: Train Models

Train model หลัก 3 ตัว:

```text
churn_model
clv_model
credit_model
```

Baseline รอบแรกควรทำให้เรียบง่ายก่อน:

```text
churn: LightGBM/XGBoost classifier
clv: LightGBM/XGBoost regressor หรือ BG/NBD + Gamma-Gamma
credit: LightGBM/XGBoost regressor
```

### Step 5: Evaluate

Metrics ที่ต้องเก็บ:

```text
churn: AUC, F1, precision, recall, calibration
clv: MAE, RMSE, MAPE, Spearman correlation
credit: MAE, RMSE, quantile coverage if applicable
```

### Step 6: Save Artifacts

Save model files ลง `models/` และ insert metadata ลง `ml_model_versions`

### Step 7: Activate Model Versions

หลัง evaluate ผ่าน threshold แล้ว set:

```text
ml_model_versions.is_active = true
```

ควรมี active model ได้ 1 ตัวต่อ `model_type`

### Step 8: Retrain Flow

Retrain คือ training run ใหม่ที่ใช้ dataset/cutoff/config ใหม่ แล้วสร้าง model version ใหม่โดยไม่ทับของเดิม

Flow:

```text
1. create ml_training_runs row with run_type = retrain
2. load train_clean_* จาก source_id ที่เลือก
3. build features/labels ด้วย config ที่บันทึกใน training_config_json
4. train churn/clv/credit model versions ใหม่
5. evaluate เทียบกับ active model version ปัจจุบัน
6. save artifacts และ metrics
7. ถ้าผ่าน threshold ให้ activate version ใหม่
8. ถ้าไม่ผ่าน ให้เก็บ version ไว้แต่ไม่ activate
```

Retrain ไม่ควร overwrite:

```text
artifact file เก่า
metrics เก่า
active model เก่า
prediction outputs เก่า
```

ทุกอย่างต้อง versioned เพื่อ audit และ rollback ได้

### Step 9: Model Comparison Before Activation

ก่อน activate retrained model ต้อง compare กับ active model เดิมอย่างน้อย:

```text
churn:
  AUC ต้องไม่แย่ลงเกิน threshold
  recall/precision สำหรับ high-risk segment ต้องรับได้
  calibration ต้องไม่แย่ลงมาก

clv:
  MAE/RMSE ต้องดีขึ้นหรือไม่แย่ลงมาก
  rank correlation ต้องรับได้

credit:
  MAE/RMSE หรือ quantile coverage ต้องรับได้
```

ถ้า model ใหม่ไม่ผ่าน:

```text
ml_model_versions.status = rejected
ml_model_versions.is_active = false
```

ถ้าผ่าน:

```text
ml_model_versions.status = active
ml_model_versions.is_active = true
```

### Step 10: Rollback Flow

ต้อง rollback active model ได้โดยไม่ต้อง retrain ใหม่

Flow:

```text
1. select previous ml_model_versions row
2. deactivate current active model
3. activate selected previous version
4. insert ml_model_activation_history action = rollback
```

## Prediction Pipeline Plan

Prediction pipeline ต้อง independent จาก training pipeline

```text
ผู้ใช้สามารถ upload predict dataset แล้ว run prediction ได้เลย
ถ้ามี active model versions พร้อมอยู่แล้ว
```

Prediction run ไม่ควร trigger training/retraining อัตโนมัติ

ก่อน prediction ต้อง validate:

```text
predict_source_id มี predict_clean_* พร้อม
active churn model exists
active clv model exists
active credit model exists
```

ถ้าไม่มี active model:

```text
ml_prediction_runs.status = failed
ml_prediction_runs.error_message = "No active <model_type> model version available"
```

Train import และ predict import จึงเป็นคนละ use case:

```text
train_data_sources + train_clean_*       -> train/retrain
predict_data_sources + predict_clean_*   -> predict only
```

### Step 1: Load Predict Clean Data

อ่านจาก:

```text
predict_clean_customers
predict_clean_payments
predict_clean_usage
```

โดย filter ด้วย `predict_source_id`

### Step 2: Build Features

ใช้ logic เดียวกับ training feature builder แต่ไม่มี label

### Step 3: Assign Lifecycle

คำนวณ:

```text
lifecycle_stage
sub_stage
days_since_last_activity
ever_paid
```

### Step 4: Run Active Models

โหลด active model versions:

```text
churn
clv
credit
```

แล้ว predict output ต่อ customer

### Step 5: Calculate Derived Outputs

คำนวณ:

```text
revenue_at_risk
customer_value_tier
credit_urgency_level
recommended_followup_date
priority_score
priority_reason
recommended_action
```

### Step 6: Insert Output

insert ลง:

```text
ml_prediction_outputs
```

และ update:

```text
ml_prediction_runs.status = done
```

ถ้า error:

```text
ml_prediction_runs.status = failed
ml_prediction_runs.error_message = <message>
```

### Optional Step 7: Generate AI Explanation Per Customer

หลังจาก ML output ถูก insert แล้ว ผู้ใช้สามารถ generate explanation ราย customer ได้

Flow:

```text
1. user requests AI explanation for one customer
2. API loads ml_prediction_outputs row
3. API builds prompt from ML/business fields
4. GenAI returns explanation/message/structured reasons
5. API updates same ml_prediction_outputs row
```

Update fields:

```text
ai_status
ai_explanation
ai_reasoning_json
ai_recommended_message
ai_generated_at
ai_model
```

ถ้า generate fail:

```text
ai_status = failed
```

ไม่ควรให้ AI generation block prediction pipeline หลัก เพราะ prediction output ควรใช้ได้ทันทีแม้ยังไม่มี AI explanation

## Migration Order

ทำเป็น migration ตามลำดับนี้:

```text
1. Create new ml_training_runs
2. Create new ml_model_versions
3. Create new ml_model_aliases
4. Create new ml_model_activation_history
5. Create new ml_feature_sets
6. Create new ml_data_validation_reports
7. Create new ml_model_evaluations
8. Create new ml_prediction_runs
9. Create new ml_prediction_outputs
10. Wire Python training to new tables
11. Implement required quality gate reports
12. Verify first training output
13. Verify retrain creates new versions without overwriting old versions
14. Wire prediction to champion model aliases
15. Verify prediction output
16. Drop old prediction/model tables
```

คำแนะนำ: อย่า drop old tables ก่อน verify new training + prediction pipeline ได้ผลครบ

Auth/login tables must not be dropped in this migration sequence.

## Immediate Next Tasks

```text
1. Lock output fields ของ ml_prediction_outputs
2. Lock label definitions ของ churn, CLV, credit
3. Lock feature set contract + feature schema
4. เขียน Alembic migration สำหรับ new ML tables
5. เขียน Python DB loader จาก train_clean_*
6. เขียน feature builder + label builder
7. เพิ่ม data validation/profile report ก่อน train
8. เพิ่ม leakage check + feature contract validation
9. Train baseline churn model ก่อน
10. Train baseline CLV model
11. Train baseline credit model
12. Insert model metadata ลง ml_model_versions
13. assign champion/challenger aliases
14. ทำ prediction run แล้ว insert ml_prediction_outputs
15. เพิ่ม optional per-customer AI explanation fields
16. เพิ่ม retrain flow ที่สร้าง model version ใหม่และ compare metrics
17. เพิ่ม activate/rollback model version
```

## Current Decision

สรุป decision ปัจจุบัน:

```text
Keep:
  train_data_sources
  train_raw_sheet_*
  train_clean_*
  predict_data_sources
  predict_raw_sheet_*
  predict_clean_*

Replace:
  prediction_runs
  predictions
  model_versions

Remove from model scope:
  winback
  conversion

Build new:
  ml_training_runs
  ml_model_versions
  ml_model_aliases
  ml_model_activation_history
  ml_feature_sets
  ml_data_validation_reports
  ml_model_evaluations
  ml_prediction_runs
  ml_prediction_outputs

Keep auth/login:
  user
  session
  account
  verification
```
