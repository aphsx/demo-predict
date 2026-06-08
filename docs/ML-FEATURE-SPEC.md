# ML Feature Specification

เอกสารนี้เป็น feature catalog สำหรับ training/prediction pipeline ใหม่ของ 1Moby Analytics

เป้าหมาย:

- ระบุ feature ที่ต้องสร้างแบบรายตัว
- ระบุ source table
- ระบุสูตรหรือแนวคิดการคำนวณ
- ระบุ model ที่ใช้ feature นั้น
- ระบุ point-in-time risk
- แยก feature ที่ใช้ได้ทันที ออกจาก feature ที่ต้องระวัง

เอกสารนี้ใช้คู่กับ:

```text
docs/ML-TRAINING-SRS.md
docs/ML-DB-REBUILD-PLAN.md
```

## 1. Feature Design Principles

### 1.1 Point-In-Time Safety

ทุก feature สำหรับ training ต้องใช้ข้อมูลก่อน `cutoff_date` เท่านั้น

```text
feature window: date < cutoff_date
label window:   cutoff_date <= date < cutoff_date + horizon
```

ห้ามใช้ข้อมูลหลัง cutoff เป็น feature

### 1.2 Feature Must Be Reusable

feature builder ต้องใช้ร่วมกันได้ทั้ง:

```text
training: train_clean_*
prediction: predict_clean_*
```

ต่างกันแค่:

```text
training มี label
prediction ไม่มี label
```

### 1.3 Feature Must Be Auditable

ทุก feature ต้องรู้:

```text
source table
source columns
lookback window
formula
null handling
model usage
```

### 1.4 Customer Snapshot Warning

`train_clean_customers` เป็น snapshot จากไฟล์ Excel ไม่ใช่ historical slowly changing dimension

ดังนั้น fields เหล่านี้อาจสะท้อนสถานะล่าสุดของลูกค้า ณ วันที่ export ไม่ใช่สถานะ ณ historical cutoff:

```text
status_sms
status_email
credit_sms
credit_email
expire_sms
expire_email
last_access
last_send
```

แนวทาง:

- ใช้ payment/usage history เป็น feature หลักสำหรับ training
- ใช้ customer snapshot fields เป็น secondary features หรือ audit features
- หลีกเลี่ยง `last_access` / `last_send` จาก profile ใน historical training ถ้าคำนวณจาก usage/payment history ได้
- สำหรับ prediction ปัจจุบัน customer snapshot ใช้ได้มากกว่า เพราะมันสะท้อนสถานะล่าสุดของ uploaded dataset

## 2. Feature Tiers

### Tier A: Use Now

Feature ที่ปลอดภัยกว่า เพราะสร้างจาก event history:

```text
payment recency/frequency/monetary
payment intervals
usage volume windows
usage trend
channel/source mix
activity recency from payment/usage
future labels from payment/usage after cutoff
```

### Tier B: Use With Caution

Feature จาก customer snapshot:

```text
status_sms
status_email
credit_sms
credit_email
expire_sms
expire_email
join_date
```

ใช้ได้ แต่ต้อง monitor ว่าเพิ่ม leakage หรือไม่

### Tier C: Avoid For Historical Training Unless Proven Safe

```text
last_access
last_send
```

เหตุผล:

- profile อาจเก็บค่าวันล่าสุดจริง ณ export date
- ถ้า cutoff ย้อนหลัง อาจเป็นข้อมูลอนาคต

ให้คำนวณใหม่จาก `train_clean_usage.period` และ `train_clean_payments.payment_date` แทน

## 2.1 Feature Rationale Summary

Feature design นี้อ้างอิงจาก pattern ที่ใช้กันทั่วไปใน churn/CLV/feature-store systems:

```text
RFM / customer behavior forecasting:
  Recency, Frequency, Monetary are standard behavioral signals for churn, CLV, segmentation

Time-varying behavior:
  rolling windows and trend features capture behavior change before churn

BG/NBD + Gamma-Gamma / CLV:
  frequency, recency, customer age (T), monetary value are standard CLV inputs

Feature store pattern:
  feature definitions should be reusable and point-in-time correct between training and serving

Model registry pattern:
  model versions should be selected through aliases such as champion/challenger

Data validation pattern:
  schema, missing rate, drift, and train/predict skew should be checked before training/scoring
```

References:

```text
RFM/churn:
  - RFM measures are widely used as churn/customer behavior features.
  - Time-varying RFM captures recent behavior changes before churn.

CLV:
  - BG/NBD uses frequency, recency, and customer age/T.
  - Gamma-Gamma uses monetary value and requires checking monetary/frequency relationship.

Feature consistency:
  - Feast uses entity + event_timestamp to create point-in-time correct feature sets.
  - scikit-learn Pipeline/ColumnTransformer prevents train/test/predict preprocessing mismatch.

Model lifecycle:
  - MLflow aliases decouple prediction code from exact model version ids.
```

### 1.5 Feature Set Contract

ทุก model ต้องผูกกับ feature set version ที่ชัดเจน

Feature set ต้องระบุ:

```text
feature_set_name
feature_set_version
model_type
feature_names
feature_dtypes
nullable rules
default/fallback values
categorical allowed values
numeric sanity bounds
transform config
feature code hash
```

เหตุผล:

- train และ predict ต้องได้ feature columns เหมือนกัน
- retrain ต้องรู้ว่าใช้ feature code/version ไหน
- prediction ต้อง validate feature schema ก่อน scoring
- ถ้า feature เปลี่ยน ต้องสร้าง feature set version ใหม่ ไม่แก้เงียบ ๆ

### 1.6 Preprocessing Pipeline Contract

Preprocessing ที่เรียนรู้จาก training data ต้องถูก save ไปกับ model artifact

Examples:

```text
imputation values
category vocabulary
scaler parameters
feature order
selected feature list
target transform
```

Rules:

```text
fit preprocessing only on training split
transform validation/test/predict using fitted preprocessing only
never refit preprocessing on predict data
save preprocessing object/config with model artifact
```

Recommended implementation:

```text
use sklearn Pipeline/ColumnTransformer when practical
or implement equivalent fit/transform object with serialized config
```

This prevents train/predict mismatch and leakage from validation/test/predict data.

### 1.7 Data Quality And Drift Contract

Before training or prediction, generate and store feature/data statistics

Required statistics:

```text
row count
distinct acc_id count
missing rate per feature
zero rate per feature
min/max/mean/std for numeric features
p01/p05/p25/p50/p75/p95/p99 for numeric features
category counts for categorical features
date range coverage
eligibility counts per model
```

Drift/skew checks:

```text
prediction features vs champion training features
new training source vs previous training source
new retrain candidate vs champion model training data
```

Suggested metrics:

```text
PSI
Jensen-Shannon divergence
L-infinity distance for categorical shares
missing-rate delta
new category count
```

Store report in:

```text
ml_data_validation_reports
```

## 3. Common Feature Windows

Default windows:

```text
lookback_30d
lookback_90d
lookback_180d
lookback_365d
all_history_before_cutoff
```

Training cutoff แรก:

```text
cutoff_date = 2025-07-01
horizon_days = 180
active_window_days = 180
```

## 4. Entity And Eligibility Fields

Fields เหล่านี้ใช้สำหรับ join/filter/debug ไม่ควรใช้เป็น model feature โดยตรง

```text
acc_id
source_id
cutoff_date
lifecycle_stage
sub_stage
ever_paid
active_in_window
has_activity_history
days_since_last_activity
eligible_for_churn
eligible_for_clv
eligible_for_credit
output_status
output_notes
model_eligibility_json
```

Important separation:

```text
observed lifecycle/status != model prediction
```

`lifecycle_stage`, `sub_stage`, `ever_paid`, `active_in_window`,
`has_activity_history`, and `days_since_last_activity` are observed/rule-based fields
computed from pre-cutoff activity. They explain current state at the prediction cutoff.

`churn_probability`, `predicted_clv_6m`, and credit forecasts are future predictions.
Do not present observed lifecycle fields as ML scores, and do not feed output/status fields
back into model features.

Hashing contract:

```text
feature_code_hash    = feature_df/model input contract only
lifecycle_code_hash  = observed lifecycle/status contract only
```

`ml_feature_sets.feature_code_hash` must not change only because lifecycle/status rules change.
If lifecycle logic changes without feature changes, record it separately in reports/model metadata.

Eligibility:

```text
eligible_for_churn = active before cutoff AND ever paid before cutoff
eligible_for_clv = active before cutoff
eligible_for_credit = has usage or payment history before cutoff
```

Output completeness rule:

```text
ทุก acc_id ใน predict_clean_customers ต้องได้ output row
```

Eligibility ไม่ได้มีไว้ตัดลูกค้าออกจาก output แต่มีไว้บอกว่า model ไหน predict ได้จริง model ไหนต้องใช้ null/fallback

Example:

```json
{
  "churn": {
    "eligible": false,
    "status": "not_eligible",
    "reason": "Customer is Ghost and has no paid activity"
  },
  "clv": {
    "eligible": false,
    "status": "fallback",
    "reason": "No purchase history"
  },
  "credit": {
    "eligible": false,
    "status": "insufficient_data",
    "reason": "No usage history"
  }
}
```

Allowed output status:

```text
predicted
partial
fallback
insufficient_data
failed
```

## 5. Customer Profile Features

Source:

```text
train_clean_customers
predict_clean_customers
```

Rationale:

```text
Customer profile features capture static/customer-state context:
  - account age tells whether behavior is mature or still onboarding
  - status/credit/expiry can explain operational risk
  - credit balance and expiry are especially relevant for credit urgency

Use with caution in historical training because this table is a snapshot, not a full history.
```

### 5.1 Customer Age

```text
customer_age_days = cutoff_date - join_date
customer_age_months = customer_age_days / 30.4375
is_new_customer_30d = customer_age_days <= 30
is_new_customer_90d = customer_age_days <= 90
```

Models:

```text
churn
clv
credit
lifecycle
```

PIT risk:

```text
low, if join_date is original signup date
```

### 5.2 Account Status

```text
status_sms_paid = status_sms == "PAID"
status_email_paid = status_email == "PAID"
status_any_paid = status_sms_paid OR status_email_paid
status_both_paid = status_sms_paid AND status_email_paid
```

Models:

```text
churn
clv
credit
lifecycle
```

PIT risk:

```text
medium, because status may be latest snapshot
```

### 5.3 Credit Balance

```text
credit_sms_raw = credit_sms
credit_email_raw = credit_email
credit_total = credit_sms + credit_email
credit_sms_log = log1p(max(credit_sms, 0))
credit_email_log = log1p(max(credit_email, 0))
credit_total_log = log1p(max(credit_total, 0))
has_sms_credit = credit_sms > 0
has_email_credit = credit_email > 0
has_any_credit = credit_total > 0
```

Models:

```text
churn
credit
priority
```

PIT risk:

```text
medium/high for historical training, useful for current prediction
```

### 5.4 Credit Expiry

```text
days_until_sms_expire = expire_sms - cutoff_date
days_until_email_expire = expire_email - cutoff_date
days_until_nearest_expire = min(days_until_sms_expire, days_until_email_expire)
sms_expired = days_until_sms_expire < 0
email_expired = days_until_email_expire < 0
any_credit_expired = sms_expired OR email_expired
credit_expiring_30d = days_until_nearest_expire BETWEEN 0 AND 30
credit_expiring_90d = days_until_nearest_expire BETWEEN 0 AND 90
```

Models:

```text
churn
credit
recommended_action
```

PIT risk:

```text
medium/high for historical training, useful for current prediction
```

## 6. Payment Features

Source:

```text
train_clean_payments
predict_clean_payments
```

Filter:

```text
payment_date < cutoff_date
```

Rationale:

```text
Payment features are the Monetary and Frequency backbone of RFM:
  - recency tells how long since the customer last paid
  - frequency tells purchase habit and loyalty
  - monetary value separates high-value customers from low-value customers
  - intervals help predict top-up timing and overdue behavior

These are core features for churn, CLV, and credit forecast.
```

### 6.1 Payment Recency

```text
last_payment_date = max(payment_date)
days_since_last_payment = cutoff_date - last_payment_date
has_payment_30d = any payment in last 30 days
has_payment_90d = any payment in last 90 days
has_payment_180d = any payment in last 180 days
```

Models:

```text
churn
clv
credit
lifecycle
```

Why important:

```text
Long payment recency is often a churn warning sign.
Recent payment usually means stronger engagement and lower immediate churn risk.
```

### 6.2 Payment Frequency

```text
payment_count_all
payment_count_30d
payment_count_90d
payment_count_180d
payment_count_365d
payment_frequency_per_month = payment_count_all / payment_tenure_months
```

Models:

```text
churn
clv
credit
```

Why important:

```text
Frequent repeat purchase behavior is a strong CLV and retention signal.
Low or declining frequency can indicate churn risk.
```

### 6.3 Payment Monetary

```text
total_revenue_all = sum(amount)
total_revenue_30d = sum(amount in last 30 days)
total_revenue_90d = sum(amount in last 90 days)
total_revenue_180d = sum(amount in last 180 days)
total_revenue_365d = sum(amount in last 365 days)
avg_transaction_value = mean(amount)
median_transaction_value = median(amount)
max_transaction_value = max(amount)
min_transaction_value = min(amount)
std_transaction_value = std(amount)
revenue_log = log1p(total_revenue_all)
```

Models:

```text
churn
clv
priority
```

Why important:

```text
Monetary value is needed to prioritize churn risk.
High churn probability matters more when predicted/customer revenue is high.
```

### 6.4 Payment Tenure

```text
first_payment_date = min(payment_date)
last_payment_date = max(payment_date)
payment_tenure_days = last_payment_date - first_payment_date
days_since_first_payment = cutoff_date - first_payment_date
```

Models:

```text
clv
credit
```

### 6.5 Payment Intervals

Only for customers with 2+ payments before cutoff

```text
payment_interval_mean_days
payment_interval_median_days
payment_interval_std_days
payment_interval_min_days
payment_interval_max_days
payment_interval_last_days
payment_interval_cv = std / mean
payment_overdue_ratio = days_since_last_payment / payment_interval_mean_days
```

Models:

```text
churn
credit
```

Why important:

```text
Payment intervals describe customer top-up cadence.
They are essential for estimated_days_until_topup and credit urgency.
```

Null handling:

```text
if fewer than 2 payments:
  interval features = null or sentinel
  has_payment_interval = false
```

### 6.6 Payment Trend

```text
revenue_recent_90d
revenue_prev_90d
revenue_change_90d_abs = revenue_recent_90d - revenue_prev_90d
revenue_change_90d_pct = revenue_change_90d_abs / max(revenue_prev_90d, epsilon)
payment_count_recent_90d
payment_count_prev_90d
payment_count_change_90d
```

Models:

```text
churn
clv
priority
```

Why important:

```text
Recent revenue decline is a stronger churn signal than lifetime revenue alone.
Trend features detect behavior change before the customer fully disappears.
```

### 6.7 Credit Type Payment Mix

```text
sms_payment_count
email_payment_count
sms_payment_share
email_payment_share
sms_revenue
email_revenue
sms_revenue_share
email_revenue_share
dominant_payment_type = sms | email | mixed | none
```

Models:

```text
churn
clv
credit
```

### 6.8 Credit Added

```text
total_credit_added_all = sum(credit_add)
credit_added_30d
credit_added_90d
credit_added_180d
credit_added_365d
avg_credit_added
median_credit_added
max_credit_added
credit_added_sms
credit_added_email
credit_added_log = log1p(total_credit_added_all)
```

Models:

```text
credit
clv
```

## 7. Usage Features

Source:

```text
train_clean_usage
predict_clean_usage
```

Filter:

```text
period < cutoff_date
usage > 0 for active-month counts
```

Rationale:

```text
Usage features capture engagement with the product:
  - volume shows current consumption
  - recency shows whether the customer is still active
  - trend shows whether engagement is growing or shrinking
  - volatility helps separate stable usage from irregular usage

For messaging SaaS, usage is often the clearest leading indicator before churn or top-up.
```

### 7.1 Usage Recency

```text
last_usage_period = max(period where usage > 0)
days_since_last_usage = cutoff_date - last_usage_period
has_usage_30d
has_usage_90d
has_usage_180d
```

Models:

```text
churn
credit
lifecycle
priority
```

Why important:

```text
If the customer has not sent/used recently, churn risk usually increases.
This is safer than using snapshot last_send because it is derived point-in-time from usage history.
```

### 7.2 Usage Volume

```text
usage_total_all
usage_total_30d
usage_total_90d
usage_total_180d
usage_total_365d
usage_avg_monthly
usage_median_monthly
usage_max_monthly
usage_min_positive_monthly
usage_log = log1p(usage_total_all)
```

Models:

```text
churn
clv
credit
```

### 7.3 Usage Active Months

```text
usage_active_months_all
usage_active_months_90d
usage_active_months_180d
usage_active_months_365d
usage_zero_months_180d
usage_consistency_ratio = active_months_180d / possible_months_180d
```

Models:

```text
churn
credit
```

### 7.4 Usage Trend

```text
usage_recent_90d
usage_prev_90d
usage_change_90d_abs = usage_recent_90d - usage_prev_90d
usage_change_90d_pct = usage_change_90d_abs / max(usage_prev_90d, epsilon)
usage_decay_ratio = usage_recent_90d / max(usage_prev_90d, epsilon)
usage_slope_6m = linear slope of monthly usage over last 6 months
usage_slope_all = linear slope of monthly usage over all pre-cutoff months
```

Models:

```text
churn
credit
priority
```

Why important:

```text
Declining usage can appear before payment stops.
Growing usage can signal expansion/upsell or upcoming top-up need.
```

### 7.5 Usage Volatility

```text
usage_std_monthly
usage_cv_monthly = std / mean
usage_spike_count = count months usage > p75 historical usage
usage_drop_count = count months usage < p25 historical usage
```

Models:

```text
churn
credit
```

### 7.6 Usage Momentum Buckets

Derived category:

```text
usage_trend =
  Growing    if usage_change_90d_pct >= 0.25
  Stable     if -0.25 < usage_change_90d_pct < 0.25
  Declining  if usage_change_90d_pct <= -0.25
  Inactive   if usage_recent_90d == 0
  Unknown    if insufficient history
```

Use as:

```text
business output
optional encoded model feature
```

## 8. Channel Features

Source:

```text
train_clean_usage.channel
```

Allowed values:

```text
sms
email
```

Rationale:

```text
SMS and Email can have different behavior patterns, margins, cadence, and churn risk.
Channel split prevents the model from treating all usage as identical.
```

### 8.1 Channel Volume

```text
sms_usage_total_all
email_usage_total_all
sms_usage_90d
email_usage_90d
sms_usage_180d
email_usage_180d
```

Models:

```text
churn
clv
credit
```

### 8.2 Channel Share

```text
sms_usage_share = sms_usage_total_all / total_usage_all
email_usage_share = email_usage_total_all / total_usage_all
dominant_usage_channel = sms | email | mixed | none
is_multi_channel_user = sms_usage_total_all > 0 AND email_usage_total_all > 0
```

Models:

```text
churn
clv
credit
```

### 8.3 Channel Trend

```text
sms_usage_change_90d_pct
email_usage_change_90d_pct
sms_usage_slope_6m
email_usage_slope_6m
```

Models:

```text
churn
credit
```

## 9. Usage Source Features

Source:

```text
train_clean_usage.usage_source
```

Allowed values:

```text
bc
api
otp
```

Rationale:

```text
BC/API/OTP usage sources represent different product use cases:
  - BC can represent campaign/broadcast behavior
  - API can represent integrated/system usage
  - OTP can represent transactional/authentication usage

Customers using API/OTP may have stickier operational dependency than campaign-only users.
```

### 9.1 Source Volume

```text
bc_usage_total_all
api_usage_total_all
otp_usage_total_all
bc_usage_90d
api_usage_90d
otp_usage_90d
```

Models:

```text
churn
clv
credit
```

### 9.2 Source Share

```text
bc_usage_share
api_usage_share
otp_usage_share
dominant_usage_source = bc | api | otp | mixed | none
is_api_user = api_usage_total_all > 0
is_otp_user = otp_usage_total_all > 0
is_bc_user = bc_usage_total_all > 0
```

Models:

```text
churn
clv
credit
```

### 9.3 Source Trend

```text
bc_usage_change_90d_pct
api_usage_change_90d_pct
otp_usage_change_90d_pct
bc_usage_slope_6m
api_usage_slope_6m
otp_usage_slope_6m
```

Models:

```text
churn
credit
```

## 10. Activity Features

Combine payment and usage events

Rationale:

```text
Activity features combine all observable customer interactions into one behavioral timeline.
This supports lifecycle assignment and ensures every customer can be classified even if only payment or only usage exists.
```

### 10.1 Last Activity

```text
last_activity_date = max(last_payment_date, last_usage_period)
days_since_last_activity = cutoff_date - last_activity_date
last_activity_type = payment | usage | both | none
```

Models:

```text
churn
lifecycle
priority
```

### 10.2 Activity Flags

```text
active_30d = payment or usage in last 30d
active_90d = payment or usage in last 90d
active_180d = payment or usage in last 180d
active_365d = payment or usage in last 365d
```

Models:

```text
churn
lifecycle
```

### 10.3 Activity Intensity

```text
activity_months_180d
activity_months_365d
activity_events_180d
activity_events_365d
activity_consistency_ratio
```

Models:

```text
churn
credit
```

## 11. Ratio And Interaction Features

These features combine payment, usage, and credit behavior

Rationale:

```text
Interaction features capture business conditions that single features miss:
  - high usage but no recent payment can imply top-up risk
  - high revenue plus declining usage can imply high-value churn risk
  - credit added per usage helps estimate consumption efficiency
```

### 11.1 Revenue Per Usage

```text
revenue_per_usage_all = total_revenue_all / total_usage_all
revenue_per_usage_180d = total_revenue_180d / usage_total_180d
```

Models:

```text
clv
churn
```

### 11.2 Credit Added Per Usage

```text
credit_added_per_usage_all = total_credit_added_all / total_usage_all
credit_added_per_usage_180d = credit_added_180d / usage_total_180d
```

Models:

```text
credit
```

### 11.3 Usage Versus Payment Momentum

```text
usage_growing_revenue_declining
usage_declining_revenue_declining
usage_growing_no_recent_payment
high_usage_low_credit_balance
```

Models:

```text
churn
credit
priority
```

### 11.4 Value And Risk Interactions

```text
high_revenue_declining_usage
high_revenue_long_inactive
high_frequency_recent_drop
high_value_credit_expiring
```

Models:

```text
churn
priority
recommended_action
```

## 12. Lifecycle Features And Outputs

Lifecycle should be rule-based

Rationale:

```text
Lifecycle is not a model score. It is a business interpretation layer.
It guarantees every customer gets a meaningful state even when ML models are not eligible.
```

Implemented contract:

```text
build_lifecycle_outputs(customers, payments, usage, cutoff)
```

Output lives in `FeatureBuildResult.lifecycle_df`, separate from `feature_df`.
`feature_df` contains only model input features. `lifecycle_df` contains observed state
and prediction eligibility metadata.

### 12.1 Lifecycle Inputs

```text
ever_paid
active_180d
has_usage_all
has_payment_all
customer_age_days
days_since_last_activity
usage_total_all
```

### 12.2 Lifecycle Output

```text
lifecycle_stage
sub_stage
ever_paid
has_activity_history
active_in_window
days_since_last_activity
eligible_for_churn
eligible_for_clv
eligible_for_credit
model_eligibility_json
output_status
output_notes
```

Candidate rules:

```text
Ghost:
  no payment and no usage ever

Churned:
  had payment or usage before
  not active in active_window_days

Active Free:
  active in active_window_days
  no payment before cutoff

Active Paid:
  active in active_window_days
  has payment before cutoff
```

Initial verified train-source counts for `cutoff_date = 2025-07-01`:

```text
Ghost:       20,309
Active Paid:  2,335
Churned:      1,782
Active Free:    667
```

Sub-stage examples:

```text
New Signup
Warm Ghost
Dead Ghost
Churned Paid
Churned Free
High Usage Free
Low Usage Free
Active Paid
```

## 13. Churn Model Feature Set

Target:

```text
churn_label
```

Rationale:

```text
Churn feature set prioritizes behavioral change:
  - recency detects inactivity
  - frequency detects habit
  - monetary value detects customer importance
  - usage trend detects early decline
  - channel/source mix captures product dependency

This follows the common RFM + usage behavior pattern used in churn modeling.
```

Population:

```text
active before cutoff
ever paid before cutoff
```

Primary features:

```text
days_since_last_activity
days_since_last_payment
days_since_last_usage
payment_count_all
payment_count_180d
total_revenue_all
total_revenue_180d
avg_transaction_value
payment_interval_mean_days
payment_overdue_ratio
usage_total_180d
usage_recent_90d
usage_prev_90d
usage_change_90d_pct
usage_decay_ratio
usage_slope_6m
usage_active_months_180d
usage_consistency_ratio
sms_usage_share
email_usage_share
api_usage_share
otp_usage_share
customer_age_days
```

Secondary cautious features:

```text
status_sms_paid
status_email_paid
credit_total_log
days_until_nearest_expire
credit_expiring_30d
```

Baseline feature set should start with Tier A only, then compare Tier A+B.

## 14. CLV Model Feature Set

Target:

```text
future_revenue_6m
```

Rationale:

```text
CLV feature set prioritizes future purchasing power:
  - frequency and tenure indicate repeat behavior
  - recency indicates whether value is still alive
  - monetary features estimate spend level
  - usage features add product engagement signal beyond payments

This aligns with RFM and BG/NBD/Gamma-Gamma style CLV modeling.
```

Recommended modeling:

```text
two-stage model
```

Stage 1 target:

```text
future_purchase_flag = future_revenue_6m > 0
```

Stage 2 target:

```text
future_revenue_6m among customers with future_purchase_flag = true
```

Primary features:

```text
payment_count_all
payment_count_180d
payment_frequency_per_month
total_revenue_all
total_revenue_180d
avg_transaction_value
median_transaction_value
max_transaction_value
revenue_recent_90d
revenue_prev_90d
revenue_change_90d_pct
payment_tenure_days
days_since_first_payment
days_since_last_payment
payment_interval_mean_days
payment_interval_cv
sms_revenue_share
email_revenue_share
usage_total_all
usage_total_180d
usage_avg_monthly
usage_change_90d_pct
sms_usage_share
email_usage_share
api_usage_share
customer_age_days
```

Output:

```text
predicted_clv_6m
customer_value_tier
```

## 15. Credit Forecast Feature Set

Targets:

```text
future_credit_usage_30d
future_credit_usage_90d
days_until_next_topup
```

Rationale:

```text
Credit forecast needs both consumption and purchase cadence:
  - usage windows predict future consumption
  - payment intervals predict top-up timing
  - credit-added history estimates package size
  - channel/source split captures different consumption rhythms
```

Primary features for usage forecast:

```text
usage_total_30d
usage_total_90d
usage_total_180d
usage_avg_monthly
usage_recent_90d
usage_prev_90d
usage_change_90d_pct
usage_slope_6m
usage_std_monthly
usage_active_months_180d
sms_usage_90d
email_usage_90d
bc_usage_90d
api_usage_90d
otp_usage_90d
sms_usage_share
email_usage_share
api_usage_share
otp_usage_share
```

Primary features for top-up timing:

```text
days_since_last_payment
payment_count_all
payment_count_180d
payment_interval_mean_days
payment_interval_last_days
payment_overdue_ratio
credit_added_180d
avg_credit_added
total_credit_added_all
usage_total_90d
usage_total_180d
credit_added_per_usage_180d
```

Secondary cautious features:

```text
credit_total
credit_sms_raw
credit_email_raw
days_until_nearest_expire
credit_expiring_30d
credit_expiring_90d
```

Output:

```text
predicted_credit_usage_30d
predicted_credit_usage_90d
estimated_days_until_topup
credit_urgency_level
recommended_followup_date
```

## 16. Business Output Features

These are not necessarily model inputs. They are computed after model prediction.

Rationale:

```text
Business output features translate model scores into action.
They exist because internal users need priority, reason, and recommendation, not only raw probabilities.
```

### 16.1 Churn Risk Level

```text
Low = churn_probability < 0.30
Medium = 0.30 <= churn_probability < 0.60
High = churn_probability >= 0.60
```

### 16.2 Customer Value Tier

Start with percentile-based tiers from predicted CLV:

```text
VIP = top 5%
High Value = top 20%
Medium Value = middle 50%
Low Value = bottom 30%
```

### 16.3 Revenue At Risk

```text
revenue_at_risk = churn_probability * predicted_clv_6m
```

### 16.4 Credit Urgency

```text
Critical = estimated_days_until_topup <= 14
Warning = estimated_days_until_topup <= 30
Monitor = estimated_days_until_topup <= 90
Stable = otherwise
Unknown = no estimate
```

### 16.5 Recommended Follow-Up Date

```text
recommended_followup_date = prediction_cutoff_date + max(estimated_days_until_topup - 7, 0)
```

For critical customers:

```text
recommended_followup_date = prediction_cutoff_date
```

### 16.6 Priority Score

Initial formula:

```text
priority_score =
  0.35 * normalized_churn_probability +
  0.30 * normalized_predicted_clv_6m +
  0.20 * normalized_revenue_at_risk +
  0.10 * credit_urgency_score +
  0.05 * usage_decline_score
```

Score range:

```text
0 - 10
```

### 16.7 Priority Reason

Generate from deterministic rules first:

```text
High churn risk
High predicted CLV
High revenue at risk
Credit top-up likely soon
Usage declining
Long time since last activity
```

### 16.8 Recommended Action

Rules:

```text
High churn + VIP/High Value:
  Call immediately with retention offer

High churn + usage declining:
  Investigate usage drop and offer support

Credit Critical:
  Send top-up reminder today

Active Free + high usage:
  Offer paid package

Low risk + high value:
  Upsell/cross-sell

Otherwise:
  Monitor
```

## 17. AI Explanation Input Contract

AI should receive only model/business outputs and selected raw-derived summaries.

Allowed inputs:

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
top_reason_features
```

AI must not:

```text
change model predictions
invent hidden customer facts
claim certainty beyond model outputs
```

## 18. Feature Implementation Plan

### Step 1: Build Shared Data Loader

File:

```text
apps/ml/src/training/data.py
```

Functions:

```text
load_train_clean(source_id) -> customers, payments, usage
load_predict_clean(source_id) -> customers, payments, usage
```

Important:

```text
Shared loader means shared code, not shared dataset.
```

Train import และ predict import ต้องเป็น independent flows:

```text
load_train_clean(source_id)
  ใช้เฉพาะ training/retraining
  อ่านจาก train_data_sources + train_clean_*

load_predict_clean(source_id)
  ใช้เฉพาะ prediction
  อ่านจาก predict_data_sources + predict_clean_*
```

ระบบต้องรองรับกรณีเหล่านี้:

```text
1. user import train data แล้ว train/retrain model
2. user import predict data แล้ว predict ด้วย active model ที่มีอยู่
3. user import predict data โดยไม่ได้ train ใหม่
4. user retrain model ภายหลัง โดยไม่กระทบ prediction outputs เก่า
```

Prediction ไม่ควร trigger training อัตโนมัติ

ก่อน run prediction ต้องเช็ค:

```text
predict_clean_* มี data สำหรับ predict_source_id
active churn model exists
active clv model exists
active credit model exists
```

ถ้าไม่มี active model ที่จำเป็น:

```text
prediction run ต้อง blocked/failed ด้วย error เช่น
"No active churn model version available"
```

Feature builder ยัง reuse ได้เหมือนเดิม:

```text
build_all_features(customers, payments, usage, cutoff)
```

แต่ caller เป็นคนเลือกว่าจะส่ง train clean หรือ predict clean เข้าไป

### Step 2: Build Feature Builder

File:

```text
apps/ml/src/training/features.py
```

Functions:

```text
build_profile_features(customers, cutoff)
build_payment_features(payments, cutoff)
build_usage_features(usage, cutoff)
build_channel_features(usage, cutoff)
build_source_features(usage, cutoff)
build_activity_features(payments, usage, cutoff)
build_interaction_features(feature_df)
build_all_features(customers, payments, usage, cutoff)
```

Feature builder output must include:

```text
feature_df
feature_names
feature_schema
feature_stats
eligibility_df
```

`feature_schema` must be stable and saved as part of `ml_feature_sets`.

### Step 2.1: Build Preprocessing Pipeline

File:

```text
apps/ml/src/training/preprocessing.py
```

Functions/classes:

```text
build_preprocessor(feature_schema)
fit_preprocessor(feature_df_train)
transform_features(feature_df)
save_preprocessor(path)
load_preprocessor(path)
```

Requirements:

```text
train split: fit_transform
validation/test split: transform only
prediction: transform only
```

Preprocessing config must be saved with each model artifact.

### Step 3: Build Label Builder

File:

```text
apps/ml/src/training/labels.py
```

Functions:

```text
build_churn_labels(payments, usage, cutoff, horizon_days, active_window_days)
build_clv_labels(payments, cutoff, horizon_days)
build_credit_usage_labels(usage, cutoff)
build_topup_timing_labels(payments, cutoff)
```

### Step 4: Build Dataset Builders

File:

```text
apps/ml/src/training/datasets.py
```

Functions:

```text
build_churn_dataset(...)
build_clv_dataset(...)
build_credit_dataset(...)
```

### Step 5: Train And Compare Feature Sets

For each model compare:

```text
Tier A only
Tier A + safe Tier B
Tier A + all Tier B
```

Reject feature set if:

```text
validation metrics look suspiciously high
feature importance dominated by snapshot/leaky fields
performance collapses on later cutoff
```

## 19. Minimum Feature Set For First Churn Baseline

Start with this compact safe set:

```text
customer_age_days
days_since_last_activity
days_since_last_payment
days_since_last_usage
payment_count_all
payment_count_180d
total_revenue_all
total_revenue_180d
avg_transaction_value
payment_interval_mean_days
payment_overdue_ratio
usage_total_180d
usage_recent_90d
usage_prev_90d
usage_change_90d_pct
usage_decay_ratio
usage_slope_6m
usage_active_months_180d
usage_consistency_ratio
sms_usage_share
email_usage_share
bc_usage_share
api_usage_share
otp_usage_share
```

Do not include in first baseline:

```text
last_access from customer profile
last_send from customer profile
current credit balance
current expire dates
```

Add those only in a second experiment and compare.

## 20. Open Questions

Before final training:

```text
1. Should customer snapshot credit fields be allowed in historical training?
2. Should churn label require no usage only, no payment only, or no activity either?
3. Should CLV population be active paid only or all active customers?
4. Should credit model prioritize usage forecast or top-up timing?
5. Should top-up timing handle censored customers with survival modeling?
6. Should thresholds for risk/value/urgency be fixed or percentile-based?
```

Current recommended answers:

```text
1. Use snapshot credit fields only after leakage audit
2. Churn = no payment and no usage in horizon
3. CLV = active customers, with paid/free handled by features
4. Start with usage forecast, add top-up timing second
5. Start simple, survival later
6. Start fixed for churn/urgency, percentile-based for value
```
