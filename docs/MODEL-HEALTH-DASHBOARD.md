# Model Metrics Dashboard

เอกสารนี้เป็น contract ของหน้า `Model Metrics` (`/model-performance`) สำหรับดูว่าแต่ละ model แม่นยำแค่ไหน วัดด้วย metric อะไร และผล train/validation/test/backtest เป็นอย่างไร

ใช้คู่กับ:

```text
docs/ML-EXPERIMENT-PLAN.md
docs/ML-TRAINING-QUALITY-GATES.md
docs/ML-TRAINING-SRS.md
docs/ML-DB-REBUILD-PLAN.md
```

## 1. Goal

หน้า Model Metrics ต้องตอบคำถามเหล่านี้ได้ในหน้าเดียว:

```text
1. churn / CLV / credit model ใช้ metric อะไรเป็น primary และ secondary
2. metric ล่าสุดของแต่ละ model เป็นเท่าไร
3. validation, test, backtest ต่างกันแค่ไหน
4. candidate/champion model ชนะ baseline เท่าไร
5. classification threshold และ confusion matrix ของ churn เป็นอย่างไร
6. calibration, ranking, segment และ cutoff stability มีปัญหาหรือไม่
7. ค่า metric แต่ละตัวอยู่ที่เท่าไร โดยไม่ปนกับ release status หรือคำอธิบายที่ไม่ใช่ค่าวัด
```

## 1.1 Model Method Rationale

หน้า UI ต้องบอกสั้น ๆ ว่าแต่ละ output ใช้วิธีอะไร และเอกสารนี้ต้องเก็บเหตุผลไว้เพื่อไม่ให้ทีมเอา metric ผิดประเภทไปใช้กับ model ผิดประเภท

```text
Lifecycle Engine:
  method: rule-based classification
  model: deterministic rules
  why: lifecycle stage เป็นนิยาม business จากประวัติ activity/payment ไม่ใช่สิ่งที่ต้องเรียนรู้จาก label
  output: Ghost / Churned / Active Free / Active Paid
  metrics: rule coverage, unknown rate, rule conflicts

Churn:
  method: ML classification
  model: calibrated LightGBM as target champion candidate
  compare against: recency baseline, RFM baseline, logistic regression, XGBoost
  why: label เป็นเหตุการณ์ yes/no ว่าลูกค้าจะ churn ภายใน horizon หรือไม่
  output: churn_probability, churn tier, ranking of at-risk customers
  metrics: F1, precision, recall, PR-AUC, lift@top10%

CLV:
  method: regression + ranking
  model: BG-NBD + Gamma-Gamma baseline plus ML regressors
  compare against: historical average, RFM segment average, LightGBM Regressor, XGBoost Regressor, Tweedie/two-stage regressors
  why: target เป็นมูลค่าอนาคตต่อ customer ไม่ใช่ class label
  output: predicted_clv_6m, value ranking
  metrics: MAE, SMAPE, Spearman, top-decile revenue capture

Credit Forecast:
  method: forecasting regression
  model: LightGBM quantile regressor as target champion candidate
  compare against: last-30d usage, 90d moving average, XGBoost Regressor, two-stage top-up model
  why: target เป็นจำนวน credit usage ในอนาคตตาม horizon 30/90 วัน
  output: credit forecast and urgency signals
  metrics: SMAPE 30d/90d, MAE 90d, coverage, urgent recall
```

ห้ามใช้ metric แบบ classification เช่น F1 กับ CLV หรือ Credit เป็น primary metric เพราะ output ไม่ใช่ yes/no class label

หน้า UI สามารถแสดง `model` เป็น target/current champion ได้ แต่ต้องไม่สื่อว่า champion ถูกเลือกแล้วถ้า `ml_model_aliases` ยังไม่มี champion จริง หลัง backend พร้อม ค่า model name ควรมาจาก model registry ไม่ใช่ hardcode

## 1.2 Where Metrics Come From

Metric บนหน้านี้ไม่ได้เป็นค่าที่ library รับรองให้เอง และไม่ควร hardcode เป็นตัวเลขถาวรใน production

Source of truth ต้องมาจาก historical evaluation/backtest ของข้อมูล 1Moby:

```text
1. ใช้ข้อมูลก่อน cutoff_date เป็น features
2. ใช้ผลลัพธ์หลัง cutoff_date + horizon เป็น label/actual
3. ให้ model ทำนายจากข้อมูลก่อน cutoff เท่านั้น
4. เทียบ prediction กับ actual เพื่อคำนวณ metric
5. เก็บผล evaluation ลง `ml_model_evaluations`
```

Library เช่น scikit-learn, LightGBM, XGBoost หรือ lifetimes เป็นเพียงเครื่องมือสำหรับ train model และคำนวณ metric เท่านั้น ความน่าเชื่อถือของ metric มาจาก:

```text
point-in-time correctness
temporal train/eval split
baseline comparison
multiple cutoff backtests
leakage checks
```

ตัวอย่าง mapping:

```text
Churn F1/precision/recall:
  compare predicted churn vs actual churn observed after cutoff

CLV MAE/SMAPE/Spearman:
  compare predicted future value vs actual payment amount after cutoff

Credit SMAPE/MAE/coverage:
  compare forecast credit usage vs actual usage after cutoff

Lifecycle coverage/conflict:
  validate deterministic rules assign every customer to exactly one lifecycle stage
```

## 1.3 Evaluation Standard

มาตรฐานที่ต้องใช้กับ production-quality ML ของโปรเจกต์นี้คือ:

```text
point-in-time temporal backtesting
+ baseline comparison
+ model registry / champion selection
+ persisted evaluation evidence
```

นี่คือมาตรฐานหลัก ไม่ใช่การเลือก library หรือ algorithm ตัวใดตัวหนึ่งแล้วถือว่าถูกต้องโดยอัตโนมัติ

### Required Protocol

ทุก model ที่จะถูกแสดงเป็น production/champion ต้องผ่าน protocol นี้:

```text
1. Data readiness gate
   train_data_sources ต้อง ready และ clean tables ต้องมีข้อมูลพอ

2. Point-in-time dataset
   features ใช้เฉพาะข้อมูลก่อน cutoff_date
   labels/actual ใช้เฉพาะข้อมูลหลัง cutoff_date ภายใน horizon

3. Temporal split / backtest
   train บนอดีต
   validate/test บนช่วงเวลาที่ใหม่กว่า
   backtest หลาย cutoff ถ้าข้อมูลพอ

4. Baseline first
   train baseline ง่าย ๆ ก่อนเสมอ
   candidate model ต้องชนะ baseline ถึงจะมีสิทธิ์เป็น champion

5. Candidate comparison
   ทดลอง model family ที่เหมาะกับโจทย์
   เลือกจาก metric หลัก + business metric + stability ไม่ใช่ metric เดียว

6. Leakage and preprocessing safety
   ห้ามใช้ข้อมูลหลัง cutoff เป็น feature
   preprocessing ต้อง fit บน train split เท่านั้น

7. Persist evidence
   metrics ต้องถูกบันทึกใน ml_model_evaluations
   artifact/config/model metadata ต้องถูกบันทึกใน model registry

8. Champion gate
   ห้ามตั้ง ml_model_aliases champion ถ้า required evaluation rows, artifact, และ metadata ยังไม่ครบ
```

### Standard By Model

```text
Lifecycle:
  standard: deterministic rule contract
  pass condition: every customer maps to exactly one stage, rules are versioned/auditable

Churn:
  standard: calibrated classifier with ranking evaluation
  pass condition: beats recency/RFM/logistic baselines, stable PR-AUC/lift@top10, calibration acceptable

CLV:
  standard: value regression plus ranking evaluation
  pass condition: beats historical/RFM/BG-NBD baseline, MAE acceptable, high-value ranking stable

Credit:
  standard: forecasting regression with urgency quality
  pass condition: beats moving-average baseline, SMAPE/MAE acceptable, no negative forecasts, urgency recall usable
```

ถ้ายังไม่มี protocol นี้ครบ หน้า UI ต้องถือว่าเป็น mock/evaluation preview เท่านั้น ไม่ใช่หลักฐานว่า model พร้อมใช้งานจริง

## 1.4 Metric Calculation Standard

เครื่องมือวัดต้องเป็นมาตรฐานและ reproducible โดยให้ backend evaluation เป็นผู้คำนวณ ไม่ใช่ UI คำนวณเอง

หน้านี้ต้องแยก 2 เรื่องออกจากกัน:

```text
metric standard = สูตร/ค่าวัดที่คนทั่วไปใช้กัน เช่น F1, precision, recall, MAE, SMAPE
metric value    = ผลลัพธ์จริงจาก backtest ของข้อมูลเรา
```

ห้ามสร้างเลข metric เองเพื่อให้ UI ดูสมบูรณ์ เช่น 0.91, 0.87, 33.7% ถ้ายังไม่มี evaluation จริงใน `ml_model_evaluations`

ไม่มี threshold สากลที่บอกว่า `F1 = 0.91` หรือ `PR-AUC = 0.80` คือดีเสมอ เพราะขึ้นกับ label balance, data quality, horizon, และ business capacity สิ่งที่เป็นมาตรฐานคือใช้ metric ที่ถูกประเภท และเปรียบเทียบกับ baseline/backtest อย่างถูกต้อง

ใช้ library มาตรฐานเมื่อมี metric ตรงตัว:

```text
scikit-learn:
  classification:
    precision_score
    recall_score
    f1_score
    roc_auc_score
    average_precision_score  # PR-AUC
    log_loss
    brier_score_loss
    confusion_matrix

  regression:
    mean_absolute_error
    mean_squared_error
    mean_absolute_percentage_error only if denominator behavior is acceptable

scipy / pandas:
  ranking:
    spearmanr or pandas rank correlation

lifetimes:
  CLV statistical model fitting/evaluation support for BG-NBD / Gamma-Gamma
```

ใช้ custom metric function ของโปรเจกต์เมื่อ library ไม่มีนิยามที่ตรง business:

```text
custom:
  SMAPE
  lift@top10%
  recall@top5% / recall@top10%
  top-decile revenue capture
  revenue_at_risk captured@top10%
  quantile coverage P10-P90
  urgent precision / urgent recall
  lifecycle rule coverage
  lifecycle unknown/conflict rate
```

ข้อบังคับ:

```text
1. ทุก custom metric ต้องอยู่ใน evaluation module กลาง ห้ามเขียนซ้ำใน script/UI
2. ทุก metric ต้องมี unit test หรือ fixture test ด้วย input/output ที่ตรวจได้
3. ทุก metric ต้องระบุ population, cutoff_date, horizon_days, sample_count
4. ทุก metric value ที่โชว์ใน UI ต้องมาจาก `ml_model_evaluations`
5. UI ห้ามคำนวณ metric เอง ยกเว้น formatting เท่านั้น
```

ดังนั้น “มาตรฐาน” ของเครื่องมือวัดคือ:

```text
use scikit-learn/scipy/lifetimes for standard metrics
use project-owned tested functions for business metrics
persist all outputs to ml_model_evaluations
```

## 2. Metric-Only UI Rule

หน้าแรกของ `Model Metrics` ต้องแสดงเฉพาะข้อมูลที่ช่วยอ่านคุณภาพ model ได้เร็ว:

```text
model name
model method
model algorithm/family
metric name
metric value
short helper text
```

สำหรับ `Lifecycle Engine` ซึ่งเป็น rule-based ต้องแสดง rule summary สั้น ๆ ด้วย เพราะความถูกต้องไม่ได้มาจาก F1/MAE แต่จากนิยาม rule ว่าแต่ละ stage ถูกจัดอย่างไร

ไม่ควรแสดงในหน้าแรก:

```text
health status
pass/watch/fail badge
promotion status
artifact/model-card checklist
long notes
narrative explanation
```

เกณฑ์ target, promotion blocker, artifact readiness และ model card สามารถอยู่ในหน้า/section อื่นภายหลังได้ แต่ไม่ใช่ scope ของ metric-first mock นี้

## 3. Data Source

แหล่งข้อมูลหลักของหน้า:

```text
ml_model_aliases
ml_model_versions
ml_model_evaluations
ml_feature_sets
ml_data_validation_reports
ml_training_runs
```

Page API ในอนาคตควรรวมข้อมูลเป็น response เดียว:

```text
GET /model-metrics
```

หรือ resource equivalent ใน Elysia:

```text
GET /model-metrics/summary
GET /model-metrics/:model_type
```

ใน ML v2 source of truth ต้องมาจาก `ml_model_evaluations` ไม่ใช่ legacy metrics artifact

## 4. Required Page Sections

หน้า `/model-performance` ต้องเป็นหน้าเดียว ไม่มี tab เพราะจุดประสงค์คือดูค่าวัดเร็ว

### 4.1 Metric Summary

ด้านบนของหน้าต้องเป็นตัวเลข metric summary ไม่ใช่ champion card, health card, status card หรือ release readiness card

```text
model_type
primary_metric_name
primary_metric_value
secondary_metric_name
secondary_metric_value
baseline_delta_pct
```

ตัวอย่าง:

```text
churn: PR-AUC, ROC-AUC, F1, precision, recall, recall@top10%, lift@top10%
clv: MAE, RMSE, SMAPE, Spearman, top-decile revenue capture
credit: MAE 30d/90d, RMSE 30d/90d, SMAPE 30d/90d, quantile coverage, urgent precision/recall
```

### 4.2 Model Metric Matrix

ต้องมี matrix เปรียบเทียบ metric หลักของทุก model:

```text
model_type
split
primary_metric
secondary_metric
baseline_delta_pct
```

Allowed splits:

```text
train
validation
test
latest_backtest
baseline_comparison
```

### 4.3 Evaluation Matrix

ต้องแสดงว่า evaluation rows สำคัญครบหรือไม่:

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

หน้านี้แสดงว่ามี split ใดบ้างผ่านตัวเลข metric แต่ไม่ต้องแสดง blocker ใน UI metric-first

### 4.4 Per-Model Metric Details

Metric details ต้องแยกตาม model type และ dataset split:

```text
validation
test
latest_backtest
baseline_comparison
```

UI ต้องไม่โชว์ค่าเดียวแบบไม่มี split เพราะจะทำให้เข้าใจผิดว่าเป็น production quality ทั้งหมด แต่หน้าแรกสามารถโชว์ latest test metric เป็น summary ได้ถ้าระบุ split ชัดเจน

Metric details ทั้งหมดควรอยู่ในหน้าเดียวกัน แยกด้วย section เท่านั้น ห้ามซ่อน metric หลักไว้หลัง tab/dropdown ในเวอร์ชันแรก

### 4.5 Calibration And Thresholds

สำหรับ churn ต้องโชว์:

```text
threshold_source
selected_threshold
precision_at_threshold
recall_at_threshold
f1_at_threshold
brier_score
log_loss
expected_calibration_error
```

Threshold ต้องมาจาก validation/calibration split เท่านั้น ห้ามเลือกจาก test split

### 4.6 Backtest Stability

ต้องโชว์ metric ต่อ cutoff:

```text
cutoff_date
horizon_days
primary_metric_value
secondary_metric_value
baseline_delta
```

ถ้า latest cutoff ตกเกิน tolerance = blocker หรือ watch ตาม severity

### 4.7 Segment Robustness

ต้องโชว์ performance แยก segment อย่างน้อย:

```text
lifecycle_stage
dominant_channel
value_tier
history_depth
```

ตัวอย่าง checks:

```text
churn recall gap between high-value and low-value segment
CLV MAE by value tier
credit MAE by usage volume tier
```

## 5. Metric Contract

### 5.1 Common Keys

ทุก `ml_model_evaluations.metrics_json` ควรมี:

```json
{
  "sample_count": 2335,
  "eligible_count": 2335,
  "positive_count": 712,
  "negative_count": 1623,
  "primary_metric_name": "pr_auc",
  "primary_metric_value": 0.712,
  "baseline_delta_pct": 8.4
}
```

### 5.2 Churn Metrics

Required keys:

```json
{
  "roc_auc": 0.842,
  "pr_auc": 0.712,
  "precision": 0.681,
  "recall": 0.744,
  "f1": 0.711,
  "recall_at_top_5_pct": 0.214,
  "recall_at_top_10_pct": 0.382,
  "lift_at_top_10_pct": 3.12,
  "brier_score": 0.143,
  "log_loss": 0.421,
  "expected_calibration_error": 0.036,
  "selected_threshold": 0.41,
  "threshold_source": "validation"
}
```

Confusion matrix:

```json
{
  "threshold": 0.41,
  "tp": 530,
  "fp": 248,
  "tn": 1375,
  "fn": 182
}
```

Calibration:

```json
{
  "method": "isotonic",
  "fit_split": "validation",
  "bins": [
    {
      "bin": 1,
      "predicted_mean": 0.08,
      "observed_rate": 0.10,
      "count": 210
    }
  ]
}
```

### 5.3 CLV Metrics

Required keys:

```json
{
  "mae": 1180.5,
  "rmse": 2840.2,
  "smape": 0.318,
  "spearman": 0.57,
  "top_decile_revenue_capture": 0.44,
  "revenue_weighted_mae": 1620.3,
  "zero_actual_rate": 0.49,
  "outlier_top_1_pct_revenue_share": 0.31
}
```

### 5.4 Credit Metrics

Required keys:

```json
{
  "mae_30d": 920.4,
  "rmse_30d": 2310.8,
  "smape_30d": 0.284,
  "mae_90d": 2380.2,
  "rmse_90d": 5020.7,
  "smape_90d": 0.337,
  "quantile_coverage_p10_p90": 0.79,
  "urgent_bucket_precision": 0.68,
  "urgent_bucket_recall": 0.73,
  "followup_date_mae_days": 4.8
}
```

## 6. Initial Thresholds For Evaluation Logic

These thresholds are for backend evaluation logic and promotion decisions. They should not be shown as primary UI content on the metric-first page.

```text
churn:
  PR-AUC must beat best baseline
  recall@top10% must beat best baseline
  Brier score must not be worse than baseline by more than 5%
  latest backtest PR-AUC must not drop more than 10% from validation

clv:
  MAE must beat historical average baseline
  Spearman must be positive and stable across cutoffs
  top-decile revenue capture must beat baseline
  latest backtest MAE must not worsen more than 10% from validation

credit:
  MAE/SMAPE must beat moving average baseline
  quantile coverage should be within +/- 5pp of target if quantile model is used
  urgent bucket precision and recall must both be reported
  negative forecasts are blocker
```

Champion comparison tolerance:

```text
churn PR-AUC cannot drop more than 2% vs current champion
churn recall@top10 cannot drop more than 3% vs current champion
CLV MAE cannot worsen more than 5% vs current champion
credit MAE cannot worsen more than 5% vs current champion
```

## 7. Mock UI Requirement

Before backend API is ready, `/model-performance` should use static mock data with the same shape expected from future `/model-metrics`.

The mock must include:

```text
single-page layout with no tabs
model metric summary
model metric matrix by split
churn threshold/calibration details
backtest stability
baseline delta
```

The mock must not pretend that real ML v2 evaluation is already complete.

## 8. Promotion Blockers Shown In UI

UI must surface blockers before detailed metrics:

```text
missing champion alias
missing required ml_model_evaluations rows
candidate loses to baseline on primary metric
latest test/backtest cutoff fails minimum threshold
calibration report missing for churn
artifact load test failed
feature schema mismatch
model card missing
```

If any blocker exists, primary action should be:

```text
Do not promote
```

not:

```text
Use model
```

## 9. Acceptance

The Model Metrics page is acceptable when:

```text
1. it separates prediction business output from model quality output
2. the top section is numeric model metrics, not champion/health/status cards
3. it is a single page with no tabs for the initial version
4. it shows split-aware metrics, not a single unqualified score
5. it shows calibration/threshold details for churn
6. it shows backtest stability in compact form
7. it avoids artifact/model-card/release evidence on this page
8. it is backed by `ml_model_evaluations` once backend is available
```
