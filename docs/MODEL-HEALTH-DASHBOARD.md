# Model Health Dashboard

เอกสารนี้เป็น contract ของหน้า `Model Metrics` (`/model-performance`) สำหรับดูว่า model พร้อมใช้งานจริงหรือไม่ ไม่ใช่แค่ดูว่า offline score สูงหรือไม่

ใช้คู่กับ:

```text
docs/ML-EXPERIMENT-PLAN.md
docs/ML-TRAINING-QUALITY-GATES.md
docs/ML-TRAINING-SRS.md
docs/ML-DB-REBUILD-PLAN.md
```

## 1. Goal

หน้า Model Health ต้องตอบคำถามเหล่านี้ได้ในหน้าเดียว:

```text
1. champion model ของ churn / CLV / credit เป็น version ไหน
2. แต่ละ model healthy พอใช้ prediction จริงหรือไม่
3. metric สำคัญผ่าน baseline, champion tolerance, calibration และ backtest หรือไม่
4. มี gate/blocker อะไรที่ห้าม promote หรือห้ามใช้ prediction หรือไม่
5. artifact, feature schema, preprocessing และ model card ครบหรือไม่
6. model performance แย่เฉพาะ segment/cutoff ใดหรือไม่
```

## 2. Health Status

ทุก model ต้องมี status รวม:

```text
healthy
watch
blocked
missing
```

ความหมาย:

```text
healthy = ใช้งานได้ ไม่มี blocker และผ่าน metric gate หลัก
watch   = ใช้งานได้ แต่มี warning ที่ต้องติดตาม เช่น calibration drift หรือ segment gap
blocked = ห้าม promote หรือห้ามใช้ prediction จนกว่า blocker จะถูกแก้
missing = ยังไม่มี champion alias หรือ artifact ที่จำเป็น
```

Portfolio health ของทั้งหน้า:

```text
blocked ถ้ามี model ใดเป็น blocked หรือ missing
watch   ถ้าไม่มี blocked/missing แต่มี model ใดเป็น watch
healthy ถ้าทุก model เป็น healthy
```

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
GET /model-health
```

หรือ resource equivalent ใน Elysia:

```text
GET /model-health/summary
GET /model-health/:model_type
```

ห้ามอ่าน legacy `/model-metrics` เป็น source of truth สำหรับ ML v2 ยกเว้นช่วง mock/transition เท่านั้น

## 4. Required Page Sections

### 4.1 Portfolio Summary

ต้องโชว์:

```text
overall_health_status
champion_count
blocked_count
watch_count
last_training_run_finished_at
latest_cutoff_date
latest_test_cutoff_date
```

### 4.2 Champion Cards

ต้องมี card สำหรับ:

```text
churn
clv
credit
```

แต่ละ card ต้องโชว์:

```text
model_type
health_status
alias = champion
model_version
algorithm
trained_at
cutoff_date
horizon_days
primary_metric_name
primary_metric_value
primary_metric_target
baseline_delta
champion_delta
main_blocker_or_warning
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

Missing required row = blocker สำหรับ champion promotion

### 4.4 Metric Details

Metric details ต้องแยกตาม model type และ dataset split:

```text
validation
test
latest_backtest
baseline_comparison
```

UI ต้องไม่โชว์ค่าเดียวแบบไม่มี split เพราะจะทำให้เข้าใจผิดว่าเป็น production quality ทั้งหมด

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
calibration_status
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
status
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

### 4.8 Artifact And Reproducibility

ต้องโชว์ completeness:

```text
model artifact exists
preprocessor artifact exists
feature set exists
feature_code_hash exists
label definition exists
training data snapshot exists
model_card.json exists
model_card.md exists
artifact load test passed
```

Missing required artifact = blocker

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
  "primary_metric_target": 0.65,
  "baseline_delta_pct": 8.4,
  "champion_delta_pct": 1.2,
  "status": "passed"
}
```

Allowed `status`:

```text
passed
warning
failed
missing
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

## 6. Initial Health Thresholds

These are initial defaults. They should be revisited after real training evidence exists.

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

Before backend API is ready, `/model-performance` should use static mock data with the same shape expected from future `/model-health`.

Mock UI must clearly label itself:

```text
Mock health data
```

The mock must include:

```text
portfolio summary
champion cards
evaluation matrix
churn threshold/calibration details
model comparison against baseline/champion
backtest stability
segment robustness
artifact checklist
open blockers/warnings
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

The Model Health page is acceptable when:

```text
1. it separates prediction business output from model quality output
2. it shows split-aware metrics, not a single unqualified score
3. it makes promotion blockers visible above fold
4. it shows baseline and champion comparison
5. it shows calibration/threshold details for churn
6. it shows backtest and segment stability
7. it shows artifact/model-card completeness
8. it is backed by `ml_model_evaluations` once backend is available
```
