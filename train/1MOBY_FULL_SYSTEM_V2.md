# 1Moby Predictive Customer Analytics — Full System (V2 Final)

---

## ระบบนี้คืออะไร

ระบบ ML ที่รับข้อมูลลูกค้าดิบจาก 1Moby (Thaibulksms / Thaibulkmail) แล้วสร้าง 3 models ตอบ 3 คำถาม:

| คำถาม | Model | Output |
|---|---|---|
| ลูกค้าคนไหนกำลังจะหยุดใช้บริการ? | Churn Prediction | ความน่าจะเป็น 0-100% + สาเหตุ + คำแนะนำ |
| ลูกค้าแต่ละคนมีมูลค่าเท่าไหร่? | Customer Lifetime Value | มูลค่า 6 เดือน + ช่วงความเชื่อมั่น + segment |
| ลูกค้าจะกลับมาซื้อเครดิตเมื่อไหร่? | Credit Purchase Forecast | ช่วงวันที่คาดว่าจะซื้อ + ระดับความเร่งด่วน |

---

## ลักษณะธุรกิจ

Thaibulksms / Thaibulkmail เป็นธุรกิจ **Credit Base (Pay-Per-Use)** — ลูกค้าซื้อเครดิต SMS/Email ล่วงหน้า ใช้เครดิตส่งข้อความ หมดก็ซื้อเพิ่ม ไม่มีสัญญา subscription ไม่มี "cancel" event ชัดเจน Churn = หยุดซื้อ + หยุดใช้ → ต้องนิยามจากพฤติกรรม

---

## ข้อมูลที่ใช้ (Excel 8 sheets)

| Sheet | Records | คำอธิบาย |
|---|---|---|
| Users + User_profile | 25,093 | บัญชีลูกค้า — credit, status, join date, last access, last send |
| Backend_payment | 13,882 txns (4,495 ลูกค้า) | ธุรกรรมซื้อเครดิต ม.ค. 2024 – ม.ค. 2026 |
| SMS_usage (BC) | 25,308 | SMS ส่งรายเดือน (Broadcast) |
| SMS_usage (API) | 23,726 | SMS ส่งรายเดือน (API) |
| SMS_usage (OTP) | 23,726 | SMS ส่งรายเดือน (OTP) |
| Email_usage (BC) | 2,370 | Email ส่งรายเดือน (Broadcast) |
| Email_usage (API) | 869 | Email ส่งรายเดือน (API) |
| Email_usage (OTP) | 256 | Email ส่งรายเดือน (OTP) |

### สถิติจากการรันจริง

```
ลูกค้าทั้งหมด:            25,093 คน
ลูกค้าที่ active (6 เดือน): 5,562 คน  (22%)
ลูกค้าที่ไม่ active แล้ว:   19,531 คน (78%) ← "ลูกค้าผี"
ลูกค้าที่เคยซื้อเครดิต:     4,495 คน  (17.9%)
ลูกค้าที่ซื้อซ้ำ > 1 ครั้ง:  1,501 คน  (6.0%)
```

---

## สถาปัตยกรรม

```
Raw Excel (8 sheets)
    │
    ▼
┌───────────────────────────────────────────────┐
│  LAYER 1: DATA PIPELINE                       │
│                                               │
│  load_data()                                  │
│    ├─ อ่านทุก sheet                            │
│    ├─ Clean columns, parse dates               │
│    └─ Tag channel (sms/email) + source         │
│                                               │
│  build_features_at_cutoff('2025-07-01')        │
│    ├─ User features (9 ตัว)                    │
│    ├─ Payment features (10 ตัว)                │
│    ├─ Usage features (11 ตัว)                  │
│    └─ Point-in-time: ใช้ data < cutoff เท่านั้น  │
│                                               │
│  Output: 30 features × 25,093 ลูกค้า           │
└──────────────────┬────────────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────────────┐
│  LAYER 2: TWO-TIER CLASSIFICATION             │
│                                               │
│  Tier 1 — Business Rule (ไม่ใช้ ML):           │
│    credit = 0 + ไม่มี activity > 6 เดือน       │
│    → "Already Churned" (19,531 คน)             │
│                                               │
│  Tier 2 — ML Models (5,562 คน):               │
│    → Churn + CLV + Credit                     │
└──────────────────┬────────────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────────────┐
│  LAYER 3: THREE ML MODELS                     │
│                                               │
│  Model 1: Churn    (LightGBM + Calibration)   │
│  Model 2: CLV      (BG/NBD + Gamma-Gamma)     │
│  Model 3: Credit   (LightGBM Quantile × 5)    │
│                                               │
│  + SHAP per-customer explanation               │
│  + Monitoring baseline for drift detection     │
└──────────────────┬────────────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────────────┐
│  LAYER 4: OUTPUT                              │
│                                               │
│  .pkl models     → Web API (FastAPI)          │
│  .json metrics   → Dashboard                  │
│  .png charts     → Report                     │
│  .csv segments   → Sales team                 │
│                                               │
│  ทุกลูกค้าได้: priority score + action         │
└───────────────────────────────────────────────┘
```

---

## หลักการออกแบบ

### 1. Point-in-Time Correctness

```
cutoff_date = 2025-07-01

features: ใช้ข้อมูลก่อน 2025-07-01 เท่านั้น
labels:   ดู event หลัง 2025-07-01 เท่านั้น
```

ถ้าไม่ทำ → model เห็นอนาคตตอน train → AUC สวยแต่ production พัง

### 2. Predict the Future, Not the Past

ใช้เฉพาะลูกค้า active เท่านั้น ลูกค้า 78% ที่หยุดไปแล้วระบบบอกสถานะได้เลยด้วย business rule ไม่ต้องใช้ ML

### 3. Model Competition

ไม่เลือก algorithm ล่วงหน้า ให้ 4 models แข่งกัน → เลือกตัวที่ชนะ → tune ด้วย Optuna → calibrate

### 4. Per-Customer Explainability

SHAP ตอบว่า "ทำไมลูกค้า **คนนี้** เสี่ยง" ไม่ใช่แค่ "feature ไหนสำคัญโดยรวม"

### 5. Uncertainty Quantification

ทุก prediction มีช่วงความเชื่อมั่น — CLV ใช้ Residual-based PI, Credit ใช้ Quantile Regression + Conformal Calibration

---

## Feature Set (30 features)

### User Features (9 ตัว)

| # | Feature | คำอธิบาย |
|---|---|---|
| 1 | days_since_join | อายุบัญชี (วัน) |
| 2 | days_since_last_access | ไม่ login กี่วัน |
| 3 | days_since_last_send | ไม่ส่งข้อความกี่วัน |
| 4 | days_until_sms_expire | เครดิต SMS จะหมดอายุอีกกี่วัน |
| 5 | days_until_email_expire | เครดิต Email จะหมดอายุอีกกี่วัน |
| 6 | credit_sms_log | log(1 + credit SMS คงเหลือ) |
| 7 | credit_email_log | log(1 + credit Email คงเหลือ) |
| 8 | is_paid_sms | สถานะ PAID=1, TRIAL=0 |
| 9 | is_paid_email | สถานะ PAID=1, TRIAL=0 |

### Payment Features (10 ตัว)

| # | Feature | คำอธิบาย |
|---|---|---|
| 10 | pay_recency_days | วันตั้งแต่ซื้อล่าสุด |
| 11 | pay_frequency | จำนวน transactions ทั้งหมด |
| 12 | pay_monetary_log | log(1 + ยอดเงินรวม) |
| 13 | pay_avg_amount | ยอดเฉลี่ยต่อ transaction (฿) |
| 14 | pay_total_credits | จำนวนเครดิตที่ซื้อรวม |
| 15 | pay_avg_interval | ระยะเฉลี่ยระหว่าง transactions (วัน) |
| 16 | pay_overdue_ratio | recency ÷ avg_interval (>1 = เกินรอบปกติ) |
| 17 | pay_n_sms | จำนวนครั้งที่ซื้อ SMS |
| 18 | pay_n_email | จำนวนครั้งที่ซื้อ Email |
| 19 | pay_tenure_days | วันตั้งแต่ซื้อครั้งแรก |

### Usage Features (11 ตัว)

| # | Feature | คำอธิบาย |
|---|---|---|
| 20 | usage_total_log | log(1 + ข้อความที่ส่งทั้งหมด) |
| 21 | usage_months | จำนวนเดือนที่มี activity |
| 22 | usage_avg | usage เฉลี่ยต่อเดือน |
| 23 | usage_max | เดือนที่ใช้สูงสุด |
| 24 | usage_std | ความผันผวนของ monthly usage |
| 25 | usage_recent_3m | usage รวม 3 เดือนล่าสุด |
| 26 | usage_prev_3m | usage รวม 3 เดือนก่อนหน้า |
| 27 | usage_decay_ratio | recent_3m ÷ prev_3m (<1 = ใช้ลดลง) |
| 28 | usage_slope | ความชัน linear regression บน monthly usage |
| 29 | usage_sms_total | SMS ที่ส่งทั้งหมด |
| 30 | usage_email_total | Email ที่ส่งทั้งหมด |

---

## Model 1: Churn Prediction

### ใช้อะไร

| รายการ | รายละเอียด |
|---|---|
| Algorithm | **LightGBM** (ชนะจากการแข่ง 4 models) |
| Calibration | **Isotonic Regression** (ให้ probability เชื่อถือได้) |
| Tuning | **Optuna** 30 trials |
| Explainability | **SHAP TreeExplainer** |
| Population | 5,562 active customers |
| Label | ไม่มี usage + ไม่มี payment ใน 6 เดือนหลัง cutoff = Churn (1) |

### Model Competition (ผลจริง)

| Model | AUC-ROC | F1 | Precision | Recall |
|---|---|---|---|---|
| Logistic Regression | 0.815 | 0.644 | 0.702 | 0.595 |
| Random Forest | 0.971 | 0.898 | 0.946 | 0.855 |
| XGBoost | 0.978 | 0.903 | 0.937 | 0.871 |
| **LightGBM (winner)** | **0.978** | **0.899** | **0.934** | **0.867** |

### Tuned Hyperparameters (Optuna)

```
n_estimators:    155
max_depth:       6
learning_rate:   0.049
subsample:       0.619
colsample_bytree: 0.716
min_child_weight: 1
```

### ผลลัพธ์สุดท้าย (LightGBM + Isotonic Calibration)

| Metric | Score |
|---|---|
| **AUC-ROC** | **0.977** |
| **F1-Score** | **0.909** |
| **Precision** | **0.940** |
| **Recall** | **0.881** |

```
Confusion Matrix (test 1,113 คน):

                  Predicted
                  Active    Churn
Actual Active  [   662       24  ]   FP: 24 (เสียแค่ค่า campaign)
       Churn   [    51      376  ]   FN: 51 (สูญเสีย revenue)
```

### SHAP Top 10 (ผลจริง)

| อันดับ | Feature | SHAP | ความหมาย |
|---|---|---|---|
| 1 | **days_since_last_send** | **2.08** | สำคัญสุด — หยุดส่งข้อความ = สัญญาณ #1 |
| 2 | days_until_sms_expire | 0.78 | เครดิตใกล้หมดอายุ |
| 3 | usage_recent_3m | 0.75 | ใช้งานน้อยใน 3 เดือนล่าสุด |
| 4 | days_since_last_access | 0.68 | ไม่ login มานาน |
| 5 | usage_months | 0.56 | เคย active น้อยเดือน |
| 6 | usage_prev_3m | 0.29 | usage 3-6 เดือนก่อน (ดู trend) |
| 7 | days_since_join | 0.24 | สมัครนานแต่ไม่ใช้ |
| 8 | pay_total_credits | 0.16 | ซื้อเครดิตน้อย |
| 9 | usage_avg | 0.14 | ค่าเฉลี่ย usage ต่ำ |
| 10 | credit_sms_log | 0.14 | เครดิตเหลือน้อย |

### What-If Analysis

```
คำถาม: "ถ้าลูกค้า 12345 กลับมา login วันนี้ จะลด churn risk ไหม?"
วิธี:   เปลี่ยน days_since_last_access จาก 72 → 0 แล้ว predict ใหม่
ผล:    churn_prob 0.78 → 0.42 (ลดลง 36%)
→ ถ้ากระตุ้นให้กลับมาใช้งาน จะลด risk ได้มาก
```

### Output ต่อลูกค้า

```
Customer acc_id = 12345:
  ├─ churn_probability: 0.78 (High)
  ├─ top_risk_factors:
  │    1. "ไม่ส่งข้อความมา 95 วัน"
  │    2. "ไม่มี usage ใน 3 เดือนล่าสุด"
  │    3. "ไม่ login มา 72 วัน"
  └─ action: "โทรสอบถาม + เสนอ special offer"
```

### ความเห็น

- AUC 0.977 ดีมาก ไม่สูงจน leakage (0.999 คือ leakage, 0.977 คือ real signal)
- SHAP ยืนยัน "หยุดส่งข้อความ" = signal #1 ตรงกับ business logic
- Gap ระหว่าง LogReg (0.815) กับ LightGBM (0.978) = non-linear patterns สำคัญจริง
- **พร้อม deploy ได้เลย**

---

## Model 2: Customer Lifetime Value (CLV)

### ใช้อะไร

| รายการ | รายละเอียด |
|---|---|
| Algorithm หลัก | **BG/NBD** (purchase frequency + alive probability) |
| Algorithm เสริม | **Gamma-Gamma** (monetary value per transaction) |
| Confidence Interval | **Residual-based Prediction Interval** |
| Segmentation | **RFM Quintile** |
| Library | lifetimes (Python) |
| Population | 3,652 ลูกค้าที่เคยซื้อ (1,501 ซื้อซ้ำ) |

### ทำไม BG/NBD + Gamma-Gamma

เป็น gold standard สำหรับ non-contractual business (Shopify, HubSpot ใช้):

1. ออกแบบมาเฉพาะสำหรับ pay-per-use
2. แยก 2 คำถาม — BG/NBD: "ยัง active ไหม? ซื้ออีกกี่ครั้ง?" / Gamma-Gamma: "ซื้อเท่าไหร่?"
3. ให้ **P(alive)** ซึ่ง regression ให้ไม่ได้
4. ใช้ข้อมูลน้อย (แค่ Recency, Frequency, T, Monetary)

### BG/NBD Parameters (ผลจริง)

```
r = 0.2042   α = 21.8379   a = 0.2128   b = 0.6476

Gamma-Gamma prerequisite:
  Frequency-Monetary correlation = 0.088 (ต้อง < 0.3 → ✓ ผ่าน)
```

### ผลลัพธ์สุดท้าย

| Metric | Score | หมายเหตุ |
|---|---|---|
| **Spearman Rank** | **0.773** | จัดลำดับลูกค้าถูก 77% → ใช้ ranking ได้ |
| **Top-decile Lift** | **64.8%** | Top 10% ที่ model เลือก สร้าง revenue 65% |
| MAE | ฿140,397 | สูงเพราะ revenue skewed (outlier หลักล้าน) |
| Median AE | ฿22,352 | robust กว่า MAE → ลูกค้าครึ่งหนึ่งคลาดเคลื่อน < ฿22K |
| Avg P(alive) | 0.839 | ลูกค้าที่เคยซื้อส่วนใหญ่ยัง active |
| Avg CLV (6m) | ฿110,264 | ค่าเฉลี่ย (ถูกดึงโดย outlier) |
| Median CLV (6m) | ฿10,163 | ค่ากลาง (สะท้อนลูกค้าส่วนใหญ่) |

### Confidence Interval — Residual-based Prediction Interval

**ปัญหาเดิม:** Bootstrap CI ได้ coverage แค่ 1% เพราะจับแค่ parameter uncertainty

**วิธีแก้:** เทียบ predicted vs actual → คำนวณ residual distribution แยกตาม CLV decile → ลูกค้า CLV สูงได้ CI กว้างกว่า (ถูกต้อง เพราะ variance สูงกว่า)

| Metric | Bootstrap (เดิม) | Residual PI (ใหม่) |
|---|---|---|
| **95% PI Coverage** | **1.0%** (พัง) | **94.8%** ✅ |
| **80% PI Coverage** | ไม่มี | **79.1%** ✅ |

### RFM Segments (ผลจริง)

| Segment | จำนวน | Action |
|---|---|---|
| At Risk | 1,461 | Win-back campaign ด่วน |
| New | 1,461 | Onboarding, first purchase incentive |
| Loyal | 730 | Cross-sell, maintain |

### Output ต่อลูกค้า

```
Customer acc_id = 12345:
  ├─ p_alive: 0.72
  ├─ expected_purchases_6m: 2.3 ครั้ง
  ├─ predicted_clv_6m: ฿38,850
  ├─ clv_95_CI: [฿12,000 — ฿185,000]
  ├─ clv_80_CI: [฿18,000 — ฿95,000]
  ├─ rfm_segment: "Loyal"
  └─ action: "Cross-sell email package"
```

### ความเห็น

- **Spearman 0.773 + Top-decile Lift 64.8%** = ใช้จัดลำดับ priority ได้ดีมาก
- **ใช้สำหรับ ranking** (ใครสำคัญกว่าใคร) ไม่ใช่ทำนายตัวเลขแม่น
- Residual PI แก้ปัญหา Bootstrap CI ได้สมบูรณ์ — coverage 94.8% ใกล้ target 95%

---

## Model 3: Credit Purchase Forecast

### ใช้อะไร

| รายการ | รายละเอียด |
|---|---|
| Algorithm | **LightGBM Quantile Regression** × 5 models (P10, P25, P50, P75, P90) |
| Approach | **Transaction-Pair Learning** |
| Target transform | **Log-transform** (FIX 1) |
| Outlier handling | **Remove > 99th percentile** (FIX 2) |
| Data | **ใช้ทั้งหมด 8,439 pairs** ไม่ sample (FIX 3) |
| Features | **20 features** (14 เดิม + 6 ใหม่) (FIX 4+8) |
| Tuning | **Optuna 15 trials per quantile** (FIX 5) |
| Calibration | **Conformal coverage calibration** (FIX 6) |

### ทำไม Quantile Regression ไม่ใช่ XGBoost ค่าเดียว

XGBoost ปกติให้ค่าเดียว "52 วัน" → Sales ไม่รู้ว่าควรโทรวันไหน

Quantile Regression ให้ 5 ค่า → Sales วางแผนได้:

```
P10 = 16 วัน   "เร็วสุดที่อาจซื้อ"         → เริ่ม warm up
P25 = 33 วัน   "ช่วงที่ควรเริ่มโทร"        → ★ ALERT TRIGGER
P50 = 60 วัน   "best guess"               → target date
P75 = 93 วัน   "อาจช้ากว่าที่คิด"
P90 = 123 วัน  "ช้าสุดที่คาดได้"           → ถ้าเกินนี้ → เสี่ยง churn
```

### Transaction-Pair Learning

```
โจทย์: "ลูกค้าซื้อเครดิตครั้งนี้ จะกลับมาซื้ออีกกี่วัน?"

ลูกค้า A:
  ซื้อ 2024-03-15 → ซื้ออีก 2024-05-01 → target = 47 วัน
  ซื้อ 2024-05-01 → ซื้ออีก 2024-07-20 → target = 80 วัน

Total pairs: 8,525 → หลัง remove outliers: 8,439
```

### Feature Set (20 features per transaction)

| # | Feature | คำอธิบาย | หมายเหตุ |
|---|---|---|---|
| 1 | current_amount_log | log(ยอดเงินที่ซื้อครั้งนี้) | FIX 8: log-transform |
| 2 | current_credits_log | log(จำนวนเครดิตที่ซื้อ) | FIX 8: log-transform |
| 3 | credit_type_sms | ซื้อ SMS=1, Email=0 | |
| 4 | n_prev | จำนวนครั้งที่ซื้อก่อนหน้า | |
| 5 | avg_prev_amount_log | log(ยอดเฉลี่ยก่อนหน้า) | FIX 8: log-transform |
| 6 | max_prev_amount_log | log(ยอดสูงสุดที่เคยซื้อ) | FIX 8: log-transform |
| 7 | total_prev_amount_log | log(ยอดสะสมทั้งหมด) | FIX 8: log-transform |
| 8 | avg_interval | ระยะเฉลี่ยระหว่าง transactions (วัน) | |
| 9 | std_interval | ความผันผวนของ interval | |
| 10 | last_interval | ระยะระหว่าง 2 transactions ล่าสุด | |
| 11 | days_since_prev | กี่วันตั้งแต่ซื้อครั้งก่อน | |
| 12 | usage_total_log | log(usage รวมก่อน transaction) | |
| 13 | usage_avg_monthly | usage เฉลี่ยต่อเดือน | |
| 14 | usage_recent_avg | usage เฉลี่ย 3 เดือนล่าสุด | |
| 15 | **cv_interval** | **CoV ของ purchase intervals (ความสม่ำเสมอ)** | **FIX 4: ใหม่** |
| 16 | **min_interval** | **ช่วงสั้นสุดระหว่างการซื้อ** | **FIX 4: ใหม่** |
| 17 | **max_interval** | **ช่วงยาวสุดระหว่างการซื้อ** | **FIX 4: ใหม่** |
| 18 | **amount_ratio** | **ยอดครั้งนี้ ÷ ค่าเฉลี่ย (ซื้อเยอะ/น้อยกว่าปกติ)** | **FIX 4: ใหม่** |
| 19 | **usage_slope** | **แนวโน้ม usage (ลบ = ใช้ลดลง)** | **FIX 4: ใหม่** |
| 20 | **usage_recent_total** | **usage รวม 3 เดือนล่าสุด** | **FIX 4: ใหม่** |

### 8 Fixes ที่ Apply ทั้งหมด

| Fix | ทำอะไร | ทำไม |
|---|---|---|
| **FIX 1** | Log-transform target | Target skewed มาก (Mean 75d vs Med 28d) → log ทำให้ใกล้ normal |
| **FIX 2** | Remove outliers > 459 วัน (99th pct) | ลูกค้าหายไป 400+ วันแล้วกลับมา = anomaly ไม่ใช่ pattern ปกติ |
| **FIX 3** | ใช้ data ทั้งหมด 8,439 pairs | เดิม sample แค่ 5,000 → model เห็นข้อมูลมากขึ้น |
| **FIX 4** | เพิ่ม 6 features ใหม่ | cv_interval, min/max interval, amount_ratio, usage_slope, usage_recent_total |
| **FIX 5** | Optuna 15 trials per quantile | P10 กับ P90 มี loss function ต่างกัน ควรได้ params ต่างกัน |
| **FIX 6** | Conformal coverage calibration | ขยาย band ด้วย multiplier จน coverage ถึง target |
| **FIX 7** | CLV: Residual-based PI | Bootstrap CI coverage 1% → Residual PI coverage 94.8% |
| **FIX 8** | Log-transform monetary features | ลด influence ของ outlier (ลูกค้าที่ซื้อหลักแสน) |

### ผลลัพธ์สุดท้าย — เทียบ V1 vs V2

| Metric | V1 (ก่อนแก้) | V2 (หลังแก้) | เปลี่ยน |
|---|---|---|---|
| **P50 MAE** | 46.7 วัน | **38.8 วัน** | **↓ ลด 17%** |
| **P50 Median AE** | ไม่มี | **10.9 วัน** | ลูกค้าครึ่งหนึ่งคลาดเคลื่อนแค่ 11 วัน |
| **P50 R²** | 0.415 | **0.499** | **↑ เพิ่ม 20%** |
| **Coverage P10-P90** | 67.5% | **80.2%** | **↑ ถึง target 80%** |
| **Coverage P25-P75** | 41.1% | **50.9%** | **↑ ถึง target 50%** |
| Band width P10-P90 | 125.6 วัน | 122.4 วัน | แคบลงเล็กน้อย |
| Band width P25-P75 | ไม่มี | 72.2 วัน | ใหม่ |

### Quantile Performance (ผลจริงทุก quantile)

| Quantile | MAE (วัน) | MedAE (วัน) | Mean Prediction |
|---|---|---|---|
| P10 | 58.0 | 14.4 | 15.6 วัน |
| P25 | 46.1 | 11.1 | 33.1 วัน |
| **P50** | **38.8** | **10.9** | **59.5 วัน** |
| P75 | 46.5 | 16.1 | 93.3 วัน |
| P90 | 65.1 | 31.0 | 122.6 วัน |

### เทียบ XGBoost (point) vs LightGBM Quantile (ทั้งคู่ log-transform)

| Model | MAE | R² | MedAE |
|---|---|---|---|
| XGBoost (point estimate) | 40.2 วัน | 0.455 | 11.5 วัน |
| **LightGBM Q50 (quantile)** | **38.8 วัน** | **0.499** | **10.9 วัน** |

LightGBM Quantile ชนะทุก metric + ให้ confidence band ด้วย

### Conformal Calibration Detail

```
BEFORE calibration:
  P10-P90 coverage: 72.4% (target 80%)
  P25-P75 coverage: 42.4% (target 50%)

Conformal multiplier:
  80% band: ×1.15 (ขยาย band 15%)
  50% band: ×1.20 (ขยาย band 20%)

AFTER calibration:
  P10-P90 coverage: 80.2% ✅
  P25-P75 coverage: 50.9% ✅
```

### Alert Logic สำหรับ Sales

```
ใช้ P25 เป็น alert trigger (เผื่อเวลาให้ Sales เตรียมตัว)

Critical:  P10 < 14 วัน  → "รีบโทรเลย!"
Warning:   P10 < 30 วัน  → "เตรียมติดต่อ ส่ง reminder"
Monitor:   P10 < 90 วัน  → "schedule follow-up"
Stable:    P10 > 90 วัน  → "ปกติ"
```

### Output ต่อลูกค้า

```
Customer acc_id = 12345:
  ├─ last_purchase: 2025-11-01 (฿10,500)
  ├─ P10: 22 วัน (optimistic)
  ├─ P25: 35 วัน ★ alert trigger
  ├─ P50: 52 วัน (best guess)
  ├─ P75: 68 วัน
  ├─ P90: 85 วัน (pessimistic)
  ├─ band_50CI: "จะซื้อในช่วง 35-68 วัน"
  ├─ urgency: "Monitor"
  └─ action: "Schedule follow-up ต้น ธ.ค."
```

### ความเห็น

- **MedAE 10.9 วัน คือตัวเลขที่ควรโชว์ business** — ลูกค้ากว่าครึ่งหนึ่ง model ทำนายคลาดเคลื่อนแค่ 11 วัน
- MAE 38.8 วันถูกดึงโดย outlier ที่ซื้อ erratic → ดู MedAE แทน
- **Coverage 80.2% ถึง target แล้ว** → confidence band เชื่อถือได้
- Fix ที่ได้ผลสุด: Log-transform (FIX 1) + Optuna per quantile (FIX 5)

---

## Combined Business Output

### Customer 360 Profile

```
Customer acc_id = 12345:

═══ CHURN ═══════════════════════════════════
  churn_probability: 0.41 (Medium)
  top_risk_factors:
    1. "ไม่ส่งข้อความมา 45 วัน"
    2. "Usage ลดลง 30% ใน 3 เดือน"
    3. "เกินรอบซื้อปกติ 1.5 เท่า"

═══ CLV ═════════════════════════════════════
  predicted_clv_6m: ฿38,850
  95% CI: [฿12,000 — ฿185,000]
  p_alive: 0.72
  segment: "Loyal"

═══ CREDIT ══════════════════════════════════
  next_purchase: 52 วัน [35-68 วัน 50%CI]
  urgency: "Monitor"
  alert_date: 2025-12-06

═══ COMBINED ════════════════════════════════
  revenue_at_risk: ฿15,929 (CLV × churn_prob)
  priority_score: 7.2 / 10
  action: "โทรเสนอแพ็กเกจก่อนเครดิตหมด"
```

### Priority Score

```
priority (1-10) =
    0.35 × normalize(churn_probability)
  + 0.35 × normalize(predicted_clv)
  + 0.15 × normalize(credit_urgency)
  + 0.15 × normalize(engagement_recency)
```

### Dashboard Zone 1: Executive Summary (BD)

```
Revenue at Risk:        ฿X,XXX,XXX
Upcoming Opportunities: ฿X,XXX,XXX
Active Customers:       5,562
High Churn Risk:        XXX คน
Model Health:           ✅ No drift
```

### Dashboard Zone 2: Action Lists (Sales)

```
Table A: "Urgent Top-up List"
  [acc_id | last_purchase | P25 | P50 | band | urgency | action]

Table B: "Retention Alert List"
  [acc_id | churn_prob | CLV [CI] | segment | risk_factor | action]
```

---

## Monitoring

```
Weekly (automated):
  1. PSI per feature    → PSI > 0.25 = retrain
  2. Prediction drift   → KS test p < 0.05 = investigate
  
Quarterly (with ground truth):
  3. Churn AUC drop > 5%        → retrain
  4. CLV MAE increase > 20%     → retrain
  5. Credit coverage drift > 5% → retrain

Retrain:
  Monthly automatic + triggered when drift detected
  Quarterly full rebuild (re-tune Optuna + review features)
```

---

## API Endpoints

```
POST /predict/churn       → probability + risk_tier + risk_factors (SHAP)
POST /predict/clv         → predicted_clv + 95%CI + 80%CI + p_alive + segment
POST /predict/credit      → P10/P25/P50/P75/P90 + urgency + alert_date
POST /predict/all         → combined + priority_score + action
POST /explain/{acc_id}    → SHAP explanation per customer
POST /what-if/{acc_id}    → "ถ้าเปลี่ยน feature X จะเป็นอย่างไร"
GET  /health              → model version, drift status, last retrain
```

---

## Files Output

```
models/
├── churn_model.pkl              LightGBM + Isotonic (2.8 MB)
├── churn_scaler.pkl             StandardScaler
├── churn_eval.png               ROC, CM, Calibration plot
├── churn_shap.png               SHAP summary
│
├── ltv_bgnbd.pkl                BG/NBD model (149 KB)
├── ltv_gg.pkl                   Gamma-Gamma model (38 KB)
├── clv_eval.png                 P(alive), Pred vs Actual, Segments
│
├── credit_q10.pkl               LightGBM quantile P10
├── credit_q25.pkl               LightGBM quantile P25
├── credit_q50.pkl               LightGBM quantile P50
├── credit_q75.pkl               LightGBM quantile P75
├── credit_q90.pkl               LightGBM quantile P90
├── credit_eval.png              Bands, coverage, features
│
├── rfm_segments.csv             RFM per customer
├── metrics.json                 All metrics ทั้ง 3 models
└── monitoring_baseline.json     Feature distributions for drift
```

---

## Python Dependencies

```
lightgbm>=4.0          Churn + Credit quantile
xgboost>=2.0           Comparison + CLV residual
scikit-learn>=1.3      Preprocessing, calibration, metrics
lifetimes>=0.11        BG/NBD + Gamma-Gamma
shap>=0.44             SHAP TreeExplainer
optuna>=3.0            Bayesian hyperparameter optimization
pandas>=2.0            Data manipulation
numpy>=1.24            Numerical
scipy>=1.11            KS test, Spearman
dill>=0.3              Serialize BG/NBD
matplotlib>=3.7        Visualization
seaborn>=0.12          Visualization
fastapi>=0.104         API server
uvicorn>=0.24          ASGI server
```

---

## วิธี Run

```bash
pip install lightgbm xgboost scikit-learn lifetimes shap optuna scipy pandas numpy matplotlib seaborn dill

python3 pipeline.py path/to/1Moby_Data.xlsx
```

---

## สรุปผลทั้งระบบ (ตัวเลขจริงจากการรัน)

| Model | Algorithm | Metric หลัก | V1 | V2 | สถานะ |
|---|---|---|---|---|---|
| Churn | LightGBM+Isotonic | AUC-ROC | 0.977 | **0.977** | ✅ ดีมาก |
| Churn | | Precision | 0.940 | **0.940** | ✅ ทำนาย churn ถูก 94% |
| CLV | BG/NBD+GG | Spearman | 0.773 | **0.773** | ✅ ranking ดี |
| CLV | | Top-decile Lift | 64.8% | **64.8%** | ✅ จับ "ลูกค้าทอง" เก่ง |
| CLV | +Residual PI | 95% Coverage | 1.0% | **94.8%** | ✅ แก้แล้ว |
| CLV | | 80% Coverage | N/A | **79.1%** | ✅ ใหม่ |
| Credit | LGBM Quantile | P50 MAE | 46.7d | **38.8d** | ✅ **↓ลด 17%** |
| Credit | | P50 MedAE | N/A | **10.9d** | ✅ แม่นมากสำหรับครึ่งหนึ่ง |
| Credit | | R² | 0.415 | **0.499** | ✅ **↑เพิ่ม 20%** |
| Credit | | P10-P90 Coverage | 67.5% | **80.2%** | ✅ **ถึง target** |
| Credit | | P25-P75 Coverage | 41.1% | **50.9%** | ✅ **ถึง target** |

---

## ข้อค้นพบจากข้อมูลจริง

1. **ลูกค้า 78% ไม่ active** → ธุรกิจมี "ลูกค้าผี" เยอะมาก ลูกค้าจริงๆ มีแค่ 5,562 คน
2. **"หยุดส่งข้อความ" คือ early warning #1** → SHAP ยืนยัน (impact 2.08 สูงกว่าอันดับ 2 ถึง 2.7 เท่า)
3. **Top 10% ลูกค้า CLV สูง สร้าง 65% ของ revenue** → Pareto effect รุนแรง ต้อง protect VIP
4. **MedAE 10.9 วัน** → ลูกค้ากว่าครึ่ง model ทำนายวันซื้อคลาดเคลื่อนแค่ 11 วัน → Sales ใช้วางแผนได้จริง
5. **Confidence band สำคัญกว่า point estimate** → ลูกค้าที่ band แคบ = ซื้อสม่ำเสมอ (มั่นใจสูง) / band กว้าง = erratic (ต้องระวัง)
