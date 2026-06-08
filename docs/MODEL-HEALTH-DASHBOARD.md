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

## 2. Metric-Only UI Rule

หน้าแรกของ `Model Metrics` ต้องแสดงเฉพาะ:

```text
model name
split name
metric name
metric value
```

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
