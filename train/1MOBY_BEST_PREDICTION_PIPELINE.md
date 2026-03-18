# 1Moby Predictive Customer Analytics — "The Best Prediction" Pipeline

---

## สูตรสำเร็จ: เลือกสิ่งที่ดีที่สุดจากทุกไฟล์

เพื่อให้ได้ระบบที่ทำนายดีที่สุด โดยไม่เสียเวลากับสิ่งไร้ประโยชน์ ให้ผสมผสานดังนี้:

| ส่วนประกอบ | เลือกใช้ | เหตุผล |
|---|---|---|
| Churn Model | **FINAL (LightGBM)** | AUC 0.991 สูงพอแล้ว Survival Analysis ไม่คุ้ม effort |
| CLV Model | **FINAL (BG/NBD) + ENTERPRISE (Bootstrap CI)** | ใช้โครงสร้างเดิม แต่เพิ่มช่วงความเชื่อมั่นสำหรับรายงาน |
| Credit Model | **ENTERPRISE (Quantile Regression)** | สำคัญที่สุด — การรู้ช่วงความไม่แน่นอนช่วย Sales ได้มากกว่าค่าเดียว |
| Monitoring | **ENTERPRISE (Drift Detection)** | จำเป็นเพื่อให้ระบบคงความ "Best" ในระยะยาว |
| Pipeline | **FINAL (Script-based)** | รวดเร็ว แก้ไขง่าย เหมาะกับขนาดข้อมูล |

---

## ลักษณะธุรกิจที่ต้องเข้าใจก่อนออกแบบ

Thaibulksms / Thaibulkmail เป็นธุรกิจแบบ **Credit Base (Pay-Per-Use)**:

- ลูกค้าซื้อเครดิต SMS หรือ Email ล่วงหน้า
- ใช้เครดิตเพื่อส่งข้อความ
- เมื่อเครดิตหมดหรือหมดอายุ ต้องซื้อเพิ่ม
- ไม่มีสัญญา subscription → ไม่มี "cancel" event ชัดเจน
- Churn ในธุรกิจนี้คือ **หยุดซื้อ + หยุดใช้** → ต้องนิยามจากพฤติกรรมจริง

เพราะธุรกิจไม่ได้ระบุสถานะ Churn (0, 1) มาให้โดยตรง ระบบจึงต้องออกแบบให้สร้าง Label ขึ้นมาเองจากข้อมูลพฤติกรรม

---

## หลักการออกแบบ (Design Principles)

### 1. Point-in-Time Correctness — ป้องกัน Data Leakage

ทุก feature ต้องคำนวณจากข้อมูลที่ **มีอยู่จริง ณ วันที่ทำนาย** เท่านั้น ห้ามใช้ข้อมูลจากอนาคตรั่วเข้ามา

```
cutoff_date = 2025-07-01

feature ใช้ได้:   ข้อมูลทุกอย่างก่อน 2025-07-01
feature ใช้ไม่ได้: อะไรก็ตามที่เกิดหลัง 2025-07-01

label ใช้ได้:     event ที่เกิดหลัง 2025-07-01 เท่านั้น (สิ่งที่ต้อง predict)
```

ถ้าไม่ทำ point-in-time → model จะ "เห็นคำตอบตอน train" → ผลลัพธ์สวยแต่ใช้งานจริงไม่ได้

### 2. Predict the Future, Not the Past

Label ต้องเป็นสิ่งที่ **ยังไม่เกิด** ณ วันที่ทำนาย:

- Churn: "ลูกค้าที่ยัง active อยู่วันนี้ จะหยุดใช้งานภายใน 6 เดือนข้างหน้าไหม"
- CLV: "ลูกค้าคนนี้จะสร้าง revenue เท่าไหร่ใน 6 เดือนข้างหน้า"
- Credit: "ลูกค้าคนนี้จะกลับมาซื้อเครดิตเพิ่มอีกเมื่อไหร่"

Model ต้องทำงานได้กับลูกค้าที่ยัง active เท่านั้น — ลูกค้าที่หยุดใช้ไปแล้ว ไม่ต้องใช้ ML ทำนาย ระบบบอกได้ทันทีด้วย business rule

### 3. Model Selection via Competition

ไม่เลือก algorithm ล่วงหน้า แต่ให้หลาย models แข่งกันบน validation set เดียวกัน แล้วเลือกตัวที่ดีที่สุด:

```
ผู้เข้าแข่งขัน:
  1. Logistic Regression    (baseline, interpretable)
  2. Random Forest           (ensemble, non-linear)
  3. XGBoost                 (gradient boosting)
  4. LightGBM                (gradient boosting, histogram-based)

ตัดสินด้วย: AUC-ROC เป็นหลัก + F1, Precision, Recall ประกอบ
ผู้ชนะ: ถูก tune hyperparameters ด้วย Optuna (50 trials)
       → calibrate probability ด้วย Isotonic Regression
```

### 4. Two-Layer Architecture — Rule + ML

ข้อมูลจริงของ 1Moby มีลูกค้า 78% ที่ credit = 0 อยู่แล้ว คนพวกนี้ไม่ต้องใช้ ML ทำนาย ระบบจึงแบ่งเป็น 2 ชั้น:

```
ชั้นที่ 1 — Business Rule (ไม่ใช้ ML):
  ลูกค้าที่ credit = 0 + ไม่มี activity > 6 เดือน
  → ระบบบอกเลย: "Already Churned"
  → Action: Win-back campaign หรือ Stop investing

ชั้นที่ 2 — ML Model:
  ลูกค้าที่ยัง active (มี usage หรือ payment ใน 6 เดือนที่ผ่านมา)
  → Churn probability 0-100% จาก ML
  → CLV จาก BG/NBD + Gamma-Gamma + Bootstrap CI
  → Credit forecast จาก LightGBM Quantile Regression

Web Dashboard รวมทั้ง 2 ชั้น: ทุกลูกค้ามีคะแนน แค่ที่มาต่างกัน
```

### 5. Per-Customer Explainability

ระบบต้องตอบได้ว่า "ทำไม **ลูกค้าคนนี้** ถึงเสี่ยง" ไม่ใช่แค่ "feature ไหนสำคัญโดยรวม"

- ใช้ **SHAP values** (SHapley Additive exPlanations) ระดับรายลูกค้า
- ให้ TreeExplainer สำหรับ tree-based models (exact, เร็ว)
- รองรับ **What-If Analysis**: "ถ้าลูกค้าทำ X จะลดความเสี่ยงได้ไหม"

---

## ข้อมูลที่ใช้ (Data)

### แหล่งข้อมูล

| Source | Records | ใช้ทำอะไร |
|---|---|---|
| Users + User_profile | 25,093 customers | Account attributes, credit status, access recency |
| Backend_payment | 13,882 transactions (4,495 customers) | Purchase history → RFM, CLV, credit patterns |
| SMS_usage (BC / API / OTP) | ~72,760 records | SMS sending behavior, engagement signals |
| Email_usage (BC / API / OTP) | ~3,495 records | Email sending behavior, cross-channel activity |

### สถิติสำคัญ

- ลูกค้า 25,093 คน แต่เพียง **4,413 คน** มี activity ใน 6 เดือนที่ผ่านมา (active population)
- เพียง **4,495 คน** (17.5%) เคยซื้อเครดิต มีเพียง **1,501 คน** ที่ซื้อซ้ำมากกว่า 1 ครั้ง
- Payment data ครอบคลุม Jan 2024 – Jan 2026 (2 ปี)
- Usage data ครอบคลุม Jan 2024 – Dec 2025 (2 ปี)

### Data Pipeline

```
Raw Excel (8 sheets)
  │
  ├─ load_data()
  │    ├─ อ่านทุก sheet
  │    ├─ Clean column names (strip whitespace)
  │    ├─ Parse dates ให้เป็น datetime
  │    ├─ Tag usage แต่ละ row ว่ามาจาก channel ไหน (sms/email)
  │    └─ Tag source (BC / API / OTP)
  │
  ├─ build_features_at_cutoff(cutoff_date)
  │    ├─ คำนวณ User features (account age, access recency, credit status)
  │    ├─ Aggregate Payment features (RFM, intervals, overdue)  ← ใช้ data < cutoff เท่านั้น
  │    ├─ Aggregate Usage features (total, trend, decay, channel split) ← ใช้ data < cutoff เท่านั้น
  │    ├─ Log-transform skewed features
  │    └─ Fill missing values (0 สำหรับลูกค้าที่ไม่มี payment/usage)
  │
  └─ Output: customer_features (1 row per acc_id, 30 features)
```

---

## Feature Set (30 features)

### User Features (9 features)

| Feature | คำอธิบาย | ที่มา |
|---|---|---|
| days_since_join | อายุบัญชี (วัน) | join_date |
| days_since_last_access | จำนวนวันที่ไม่ login | last_access |
| days_since_last_send | จำนวนวันที่ไม่ส่งข้อความ | last_send |
| days_until_sms_expire | เครดิต SMS จะหมดอายุอีกกี่วัน | expire_sms |
| days_until_email_expire | เครดิต Email จะหมดอายุอีกกี่วัน | expire_email |
| credit_sms_log | log(1 + credit_sms) | credit_sms |
| credit_email_log | log(1 + credit_email) | credit_email |
| is_paid_sms | สถานะ PAID (1) หรือ TRIAL (0) | status_sms |
| is_paid_email | สถานะ PAID (1) หรือ TRIAL (0) | status_email |

### Payment Features (10 features)

| Feature | คำอธิบาย |
|---|---|
| pay_recency_days | จำนวนวันตั้งแต่ซื้อครั้งล่าสุด |
| pay_frequency | จำนวน transactions ทั้งหมด |
| pay_monetary_log | log(1 + ยอดเงินรวม) |
| pay_avg_amount | ยอดเงินเฉลี่ยต่อ transaction (฿) |
| pay_total_credits | จำนวนเครดิตที่ซื้อรวม |
| pay_avg_interval | ระยะเวลาเฉลี่ยระหว่าง transactions (วัน) |
| pay_overdue_ratio | recency ÷ avg_interval — ถ้า > 1 แปลว่าเกินรอบซื้อปกติ |
| pay_n_sms | จำนวนครั้งที่ซื้อ SMS credits |
| pay_n_email | จำนวนครั้งที่ซื้อ Email credits |
| pay_tenure_days | จำนวนวันตั้งแต่ซื้อครั้งแรก |

### Usage Features (11 features)

| Feature | คำอธิบาย |
|---|---|
| usage_total_log | log(1 + จำนวนข้อความที่ส่งทั้งหมด) |
| usage_months | จำนวนเดือนที่มี activity |
| usage_avg | ปริมาณใช้งานเฉลี่ยต่อเดือน |
| usage_max | เดือนที่ใช้งานสูงสุด (peak) |
| usage_std | ความผันผวนของ monthly usage |
| usage_recent_3m | ปริมาณใช้งานรวม 3 เดือนล่าสุด |
| usage_prev_3m | ปริมาณใช้งานรวม 3 เดือนก่อนหน้า |
| usage_decay_ratio | recent_3m ÷ prev_3m — ถ้า < 1 แปลว่าใช้งานลดลง (สัญญาณ pre-churn) |
| usage_slope | ความชันของ linear regression บน monthly usage (ลบ = ใช้น้อยลงเรื่อยๆ) |
| usage_sms_total | จำนวน SMS ที่ส่งทั้งหมด |
| usage_email_total | จำนวน Email ที่ส่งทั้งหมด |

---

## Model 1: Churn Prediction — LightGBM + Calibration

> **ที่มา: FINAL** | เหตุผล: AUC 0.991 สูงพอแล้ว ไม่จำเป็นต้อง Survival Analysis ซึ่งซับซ้อนกว่ามากแต่ performance ไม่ต่างกันมากสำหรับ dataset ขนาดนี้

### โจทย์

ทำนายว่าลูกค้าที่ **ยัง active อยู่ตอนนี้** จะหยุดใช้งานภายใน 6 เดือนข้างหน้าหรือไม่ เพื่อให้ฝ่าย Marketing ส่งแคมเปญรักษาลูกค้าได้ทันท่วงที

### Population

เทรนเฉพาะ **active customers** เท่านั้น — ลูกค้าที่มี usage หรือ payment อย่างน้อย 1 ครั้งใน 6 เดือนก่อน cutoff date

```
Active customers ณ cutoff 2025-07-01: 4,413 คน
  ├─ จะ churn ภายใน 6 เดือน: 2,138 คน (48.4%)
  └─ ยัง active หลัง 6 เดือน: 2,275 คน (51.6%)
```

Class ratio ~50/50 สมจริงสำหรับ pay-per-use business

### Label Definition

```python
def create_churn_label(cutoff='2025-07-01', window=6):
    """
    สำหรับลูกค้าแต่ละคนที่ active ณ cutoff:
    
    Churn = 1 ถ้า: ไม่มี usage + ไม่มี payment เลย
                    ในช่วง 6 เดือนหลัง cutoff
    Churn = 0 ถ้า: มี usage หรือ payment อย่างน้อย 1 ครั้ง
                    ในช่วง 6 เดือนหลัง cutoff
    
    ไม่ได้ใช้ credit = 0 เป็นเงื่อนไข
    เพราะลูกค้าบางคน credit หมดแต่กลับมาซื้อใหม่
    """
```

### Algorithm Selection: Competition Result

ให้ 4 models แข่งกัน → เลือกตัวที่ดีที่สุด:

| Model | AUC-ROC | F1-Score | Precision | Recall |
|---|---|---|---|---|
| Logistic Regression | 0.945 | 0.789 | 0.729 | 0.860 |
| Random Forest | 0.990 | 0.940 | 0.950 | 0.930 |
| XGBoost | 0.991 | 0.939 | 0.961 | 0.919 |
| **LightGBM (winner)** | **0.992** | **0.944** | **0.977** | **0.914** |

LightGBM ชนะ: AUC สูงสุด + Precision 97.7% (ทำนายว่า churn แล้วถูกเกือบทุกครั้ง)

### Hyperparameters (Tuned ด้วย Optuna 50 trials)

```
n_estimators = 126
max_depth = 9
learning_rate = 0.045
subsample = 0.632
colsample_bytree = 0.868
min_child_weight = 1
scale_pos_weight = auto (จาก class ratio)
```

หลัง tune แล้ว calibrate probability ด้วย **Isotonic Regression** เพื่อให้ค่าที่ model บอก "70% จะ churn" หมายถึง 70% ของลูกค้ากลุ่มนี้ churn จริง

### Final Performance

| Metric | Score |
|---|---|
| AUC-ROC | 0.991 |
| F1-Score | 0.948 |
| Precision | 0.966 |
| Recall | 0.930 |
| Accuracy | 0.970 |

```
Confusion Matrix (test set 625 คน):

                  Predicted
                  Active    Churn
Actual Active  [  434        6  ]    → False Positive 6 คน (เสียแค่ค่า campaign)
       Churn   [   13      172  ]    → False Negative 13 คน (สูญเสีย revenue)
```

### SHAP — ปัจจัยที่สำคัญที่สุด

| อันดับ | Feature | SHAP Impact | ความหมาย |
|---|---|---|---|
| 1 | days_since_last_send | 2.50 | **สำคัญที่สุด** — ไม่ส่งข้อความนาน = สัญญาณ churn ชัดเจน |
| 2 | usage_recent_3m | 0.66 | ใช้งานน้อยใน 3 เดือนล่าสุด |
| 3 | days_since_last_access | 0.58 | ไม่ login นาน |
| 4 | usage_months | 0.55 | เคย active น้อยเดือน |
| 5 | days_until_sms_expire | 0.41 | เครดิตใกล้หมดอายุ |
| 6 | days_since_join | 0.19 | สมัครมานานแต่ไม่ใช้ |
| 7 | usage_decay_ratio | 0.18 | ใช้งานลดลงเมื่อเทียบกับก่อนหน้า |
| 8 | pay_recency_days | 0.16 | ไม่ซื้อเครดิตนาน |
| 9 | usage_email_total | 0.15 | ใช้ email น้อย |
| 10 | usage_prev_3m | 0.12 | usage ในช่วง 3-6 เดือนก่อนหน้า |

Insight หลัก: Model เรียนรู้ **pre-churn behavior** จริงๆ — สัญญาณเตือนอันดับ 1 คือ "หยุดส่งข้อความ" ตามด้วย "ใช้งานลดลง" และ "ไม่ login" ซึ่งตรงกับสิ่งที่ business คาดหวัง

### Output ต่อลูกค้า

```
Customer acc_id = 12345:
  ├─ churn_probability: 0.78 (High risk)
  ├─ churn_risk: "High"
  ├─ top_risk_factors:
  │    1. "ไม่ส่งข้อความมา 95 วัน" (days_since_last_send = 95)
  │    2. "ไม่มี usage เลยใน 3 เดือนล่าสุด" (usage_recent_3m = 0)
  │    3. "ไม่ login มา 72 วัน" (days_since_last_access = 72)
  └─ recommended_action: "โทรสอบถามปัญหาการใช้งาน + เสนอ special offer"
```

### What-If Analysis

```
คำถาม: "ถ้าลูกค้า 12345 กลับมา login วันนี้ จะลด churn risk ไหม?"

วิธี: เปลี่ยน days_since_last_access จาก 72 → 0 แล้ว predict ใหม่

ผลลัพธ์:
  Original churn_prob: 0.78
  Modified churn_prob: 0.42
  Risk reduction: -0.36 (ลดลง 36%)
  → ถ้าฝ่ายขายกระตุ้นให้ลูกค้ากลับมาใช้งาน จะลด risk ได้มาก
```

---

## Model 2: Customer Lifetime Value (CLV) — BG/NBD + Gamma-Gamma + Bootstrap CI

> **ที่มา: FINAL (โครงสร้าง BG/NBD) + ENTERPRISE (Bootstrap Confidence Interval)**
> เหตุผล: ใช้โครงสร้างเดิมที่ทำงานได้ดีอยู่แล้ว แต่เพิ่ม Bootstrap CI เพื่อให้รายงานมีช่วงความเชื่อมั่น — Sales/BD ตัดสินใจด้วยข้อมูลที่สมบูรณ์กว่า

### โจทย์

ทำนาย revenue ที่ลูกค้าแต่ละคนจะสร้างใน 6 เดือนข้างหน้า **พร้อมช่วงความเชื่อมั่น 95%** เพื่อให้ Sales จัดลำดับความสำคัญ — ลูกค้า CLV สูงควรได้รับการดูแลก่อน

### Algorithm: BG/NBD + Gamma-Gamma (Industry Gold Standard)

ใช้ **BG/NBD (Beta-Geometric / Negative Binomial Distribution)** ร่วมกับ **Gamma-Gamma Model** ซึ่งเป็น industry gold standard สำหรับธุรกิจ non-contractual เช่น Thaibulksms

ทำไมถึงเหมาะกว่า XGBoost regression:

1. **ออกแบบมาเฉพาะสำหรับ pay-per-use** — model พฤติกรรมการซื้อซ้ำโดยตรง
2. **แยก 2 คำถามออกจากกัน:**
   - BG/NBD: "ลูกค้ายัง active ไหม? จะกลับมาซื้ออีกกี่ครั้ง?"
   - Gamma-Gamma: "แต่ละครั้งที่ซื้อ จะซื้อเท่าไหร่?"
3. **ให้ P(alive)** — ความน่าจะเป็นที่ลูกค้ายัง "มีชีวิต" ซึ่ง regression ปกติให้ไม่ได้
4. **ใช้ข้อมูลน้อยก็ทำงานได้** — ต้องการแค่ Recency, Frequency, T, Monetary

### BG/NBD Model

```
Library: lifetimes (Python)

Input ต่อลูกค้า:
  - frequency: จำนวน repeat purchases (ไม่นับครั้งแรก)
  - recency: วันระหว่าง first purchase ถึง last purchase
  - T: วันระหว่าง first purchase ถึง observation date

สมมติฐาน:
  - ลูกค้าแต่ละคนมี "อัตราการซื้อ" (λ) เฉพาะตัว → กระจายเป็น Gamma
  - ลูกค้ามีโอกาส "หายไป" หลังทุก transaction (p) → กระจายเป็น Beta

Output ต่อลูกค้า:
  - P(alive): ความน่าจะเป็นที่ยัง active (0-1)
  - E[purchases in next 180 days]: จำนวน transactions ที่คาดหวัง
```

### Gamma-Gamma Model

```
Library: lifetimes (Python)

Input ต่อลูกค้า:
  - frequency: จำนวน repeat purchases
  - monetary_value: ยอดเงินเฉลี่ยต่อ transaction

Prerequisite: frequency กับ monetary_value ต้องไม่ correlate กันมาก (|r| < 0.3)

Output: E[average transaction value] ต่อลูกค้า
```

### Combined CLV

```
CLV = E[purchases in next 180 days] × E[average transaction value]
```

### ผลลัพธ์จริง

```
ลูกค้าที่มี repeat purchase: 1,501 คน
Avg predicted purchases (6m): 1.39 ครั้ง

BG/NBD + Gamma-Gamma Performance:
  MAE: ฿141,813
  R²:  0.716 (อธิบาย revenue จริงได้ 71.6%)
```

### XGBoost Regression เสริม

BG/NBD ใช้แค่ RFM 4 ตัว → ไม่เห็น features อื่นเช่น usage pattern, credit status, engagement ดังนั้นเทรน XGBoost regression เพิ่มเพื่อจับ signal ที่ BG/NBD พลาด:

```
Features: 23 features (user + payment + usage)
Target: actual revenue หลัง cutoff (log-transformed)
Train/Test: 3,827 / 957

Performance:
  MAE: ฿34,560
  R²:  0.176

การใช้งานจริง:
  Final CLV = BG/NBD prediction + XGBoost residual correction
```

### Bootstrap Confidence Interval (เพิ่มจาก ENTERPRISE)

**ทำไมต้องเพิ่ม CI:**

CLV ที่ได้จาก BG/NBD เป็น point estimate ค่าเดียว เช่น "฿45,000" — แต่ business ต้องการรู้ว่า "มั่นใจแค่ไหน" เพื่อ:
- Sales ตัดสินใจว่าคุ้มไหมที่จะลงทุน retain ลูกค้าคนนี้
- BD ประเมิน revenue at risk ได้ทั้ง best case และ worst case
- รายงานมี credibility มากขึ้น ไม่ใช่ค่าเดียวลอยๆ

**วิธีทำ Bootstrap CI:**

```python
def bootstrap_clv(bgf, ggf, rfm_data, n_bootstrap=200, periods=180):
    """
    Bootstrap Confidence Interval สำหรับ CLV
    
    วิธี:
    1. Resample ข้อมูล 200 ครั้ง (sample with replacement)
    2. Fit BG/NBD + Gamma-Gamma ใหม่ทุกครั้ง
    3. Predict CLV จากทุก bootstrap sample
    4. เอา percentile 2.5 และ 97.5 → 95% CI
    
    Output ต่อลูกค้า:
    - predicted_clv: ค่ากลาง (median ของ bootstrap)
    - clv_lower_95: ขอบล่าง 95% CI
    - clv_upper_95: ขอบบน 95% CI
    """
    from lifetimes import BetaGeoFitter, GammaGammaFitter
    import numpy as np
    
    all_clv_predictions = []
    
    for i in range(n_bootstrap):
        # Resample
        idx = np.random.choice(len(rfm_data), size=len(rfm_data), replace=True)
        boot_data = rfm_data.iloc[idx]
        
        # Refit BG/NBD
        bgf_boot = BetaGeoFitter(penalizer_coef=0.001)
        bgf_boot.fit(boot_data["frequency"], boot_data["recency"], boot_data["T"])
        
        # Predict CLV using refitted BG/NBD + original Gamma-Gamma
        clv_boot = ggf.customer_lifetime_value(
            bgf_boot,
            rfm_data["frequency"],
            rfm_data["recency"],
            rfm_data["T"],
            rfm_data["monetary_value"],
            time=periods / 30  # months
        )
        all_clv_predictions.append(clv_boot.values)
    
    all_clv_predictions = np.array(all_clv_predictions)
    
    results = pd.DataFrame(index=rfm_data.index)
    results["predicted_clv"] = np.median(all_clv_predictions, axis=0)
    results["clv_lower_95"] = np.percentile(all_clv_predictions, 2.5, axis=0)
    results["clv_upper_95"] = np.percentile(all_clv_predictions, 97.5, axis=0)
    results["clv_ci_width"] = results["clv_upper_95"] - results["clv_lower_95"]
    
    return results
```

### RFM Segmentation

ใช้ Recency, Frequency, Monetary แบ่ง quintile (1-5) แล้วจัดกลุ่มตาม rule:

| Segment | จำนวน | เงื่อนไข | Action สำหรับ Sales/MKT |
|---|---|---|---|
| Champions | 714 | R สูง + F สูง | Upsell, VIP program, loyalty reward |
| Loyal Customers | 876 | R ปานกลาง+ + F ปานกลาง+ | Cross-sell email package, maintain |
| At Risk | 602 | R ต่ำ + F สูง | Win-back campaign, special offer ด่วน |
| Hibernating | 859 | R ต่ำ + F ต่ำ | Re-activation หรือ stop investing |
| New Customers | 329 | R สูง + F ต่ำ | Onboarding, first purchase incentive |
| Need Attention | 181 | ปานกลาง | Send reminder, gentle follow-up |
| Potential Loyalists | 92 | R สูง + M ปานกลาง+ | Encourage higher spend (bundles) |

### Output ต่อลูกค้า (เพิ่ม CI จาก ENTERPRISE)

```
Customer acc_id = 12345:
  ├─ p_alive: 0.72
  ├─ expected_purchases_6m: 2.3
  ├─ avg_transaction_value: ฿18,500
  ├─ predicted_clv_6m: ฿38,850
  ├─ clv_lower_95: ฿22,000                    ← NEW: ขอบล่าง 95% CI
  ├─ clv_upper_95: ฿61,000                    ← NEW: ขอบบน 95% CI
  ├─ rfm_segment: "Loyal Customers"
  ├─ ltv_tier: "Very High"
  └─ recommended_action: "Cross-sell email package, schedule quarterly review"
```

### Evaluation Metrics (เพิ่ม CI metrics จาก ENTERPRISE)

| Metric | คืออะไร | Target |
|---|---|---|
| MAE / RMSE | ค่าคลาดเคลื่อนเฉลี่ย | วัดความแม่นของ point estimate |
| R² | อธิบาย variance ได้กี่ % | > 0.70 ถือว่าดี |
| Spearman Rank Correlation | ลำดับถูกไหม | > 0.70 (สำคัญกว่า MAE สำหรับ priority ranking) |
| Top-decile Lift | Top 10% ที่ model เลือก capture revenue จริงกี่ % | > 50% revenue → model ใช้ได้ |
| P(alive) Calibration | P(alive) = 0.7 มีจริง 70% ที่ยัง active ไหม | เส้นตรง 45° |
| **Coverage (CI)** | **95% CI ครอบคลุมค่าจริง 95% ไหม** | **88-95% (ใกล้ 95%)** ← NEW |
| **CI Width** | **ช่วง CI กว้างแค่ไหน** | **ยิ่งแคบยิ่งดี โดยรักษา coverage** ← NEW |

---

## Model 3: Credit Consumption Forecast — LightGBM Quantile Regression

> **ที่มา: ENTERPRISE (Quantile Regression)** ผสมกับ **FINAL (Transaction-Pair Learning)**
> เหตุผล: **สำคัญที่สุด** — การรู้ช่วงความไม่แน่นอนช่วย Sales ได้มากกว่าค่าเดียว เช่น "ลูกค้าจะซื้อใน 22-85 วัน" ดีกว่า "ลูกค้าจะซื้อใน 52 วัน" เพราะ Sales วางแผน follow-up ได้เหมาะสมกว่า

### โจทย์

ทำนายว่าลูกค้าจะกลับมาซื้อเครดิตเพิ่มอีก **กี่วันข้างหน้า พร้อมช่วงความไม่แน่นอน** เพื่อให้ Sales ติดต่อเสนอแพ็กเกจได้ก่อนที่ลูกค้าจะเปลี่ยนใจไปใช้เจ้าอื่น

### ทำไม Quantile Regression ถึงสำคัญที่สุดสำหรับ Model นี้

XGBoost regression ปกติให้ค่าเดียว: "52 วัน" → Sales ไม่รู้ว่าควรโทรวันไหน

Quantile Regression ให้ 5 ค่า → Sales วางแผนได้:

```
ลูกค้า A:
  P10 = 22 วัน  → "เร็วสุดที่อาจซื้อ"     → เริ่ม warm up ได้
  P25 = 35 วัน  → "ช่วงที่ควรเริ่มโทร"    → ★ ALERT TRIGGER ★
  P50 = 52 วัน  → "best guess"            → target date
  P75 = 68 วัน  → "อาจช้ากว่าที่คิด"
  P90 = 85 วัน  → "ช้าสุดที่คาดได้"       → ถ้าเกินนี้ = เสี่ยง churn

ลูกค้า B:
  P10 = 45 วัน, P90 = 48 วัน → CI แคบ = มั่นใจสูง = ซื้อทุกเดือนครึ่งแน่นอน

ลูกค้า C:
  P10 = 10 วัน, P90 = 200 วัน → CI กว้าง = ไม่แน่นอน = ซื้อไม่สม่ำเสมอ
```

### Approach: Transaction-Pair + Quantile Regression

**Step 1: สร้าง Training Data แบบ Transaction-Pair (จาก FINAL)**

โจทย์ของ model: "เมื่อลูกค้าซื้อเครดิตครั้งนี้ จะกลับมาซื้ออีกกี่วันข้างหน้า?"

```
ลูกค้า A:
  ซื้อ 2024-03-15 (฿10,500)  → next buy = 2024-05-01 → target = 47 วัน
  ซื้อ 2024-05-01 (฿30,000)  → next buy = 2024-07-20 → target = 80 วัน
  ซื้อ 2024-07-20 (฿10,500)  → next buy = 2024-09-10 → target = 52 วัน

Total training samples: 8,141 transaction pairs
จากลูกค้า 4,495 คน
```

**Step 2: Feature Set (14 features per transaction)**

แต่ละ feature คำนวณ ณ เวลาที่เกิด transaction นั้น — ไม่ใช้ข้อมูลจากอนาคต:

| Feature | คำอธิบาย |
|---|---|
| current_amount | ยอดเงินที่ซื้อครั้งนี้ |
| current_credits | จำนวนเครดิตที่ซื้อครั้งนี้ |
| credit_type_sms | ซื้อ SMS (1) หรือ Email (0) |
| n_prev_purchases | จำนวนครั้งที่ซื้อก่อนหน้า ณ เวลานี้ |
| avg_prev_amount | ยอดเงินเฉลี่ยของ transactions ก่อนหน้า |
| max_prev_amount | ยอดเงินสูงสุดที่เคยซื้อ |
| total_prev_amount | ยอดเงินสะสมตั้งแต่เริ่มเป็นลูกค้า |
| avg_interval | ระยะเฉลี่ยระหว่าง transactions ก่อนหน้า (วัน) |
| std_interval | ความผันผวนของ purchase interval |
| last_interval | ระยะระหว่าง 2 transactions ล่าสุดก่อนครั้งนี้ (วัน) |
| days_since_prev | กี่วันตั้งแต่ซื้อครั้งก่อน |
| usage_total_before_log | log(1 + usage รวมก่อน transaction นี้) |
| usage_avg_monthly | ปริมาณใช้งานเฉลี่ยต่อเดือน ก่อน transaction นี้ |
| usage_recent_avg | ปริมาณใช้งานเฉลี่ย 3 เดือนล่าสุด ก่อน transaction นี้ |

**Step 3: LightGBM Quantile Regression (จาก ENTERPRISE)**

แทนที่จะ train XGBoost regression 1 ตัว (ได้ค่าเดียว) → train LightGBM 5 ตัว (ได้ confidence band):

```python
import lightgbm as lgb

quantiles = [0.10, 0.25, 0.50, 0.75, 0.90]
models = {}

for q in quantiles:
    model = lgb.LGBMRegressor(
        objective="quantile",
        alpha=q,                    # ← quantile ที่ต้องการ
        n_estimators=500,
        max_depth=8,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_samples=20,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42
    )
    model.fit(X_train, y_train)
    models[q] = model
```

**ทำไม LightGBM ไม่ใช่ XGBoost:**
- LightGBM มี built-in `objective="quantile"` → ง่าย ไม่ต้อง customize
- เร็วกว่า XGBoost 2-5x บน dataset ขนาดนี้
- Memory efficient กว่า (histogram-based)
- Performance ใกล้เคียงหรือดีกว่า XGBoost บน tabular data

### Alert Logic สำหรับ Sales (ปรับจาก ENTERPRISE)

```
predicted_p25 = models[0.25].predict(transaction_features)

Alert timing: ใช้ P25 ไม่ใช่ P50
เพราะต้องเผื่อเวลาให้ Sales เตรียมตัว + ลูกค้าตัดสินใจ

Urgency levels (ใช้ P10 เป็นตัว trigger):
  Critical:  P10 < 14 วัน  → "ลูกค้าน่าจะซื้อเร็วๆ นี้ รีบโทร!"
  Warning:   P10 < 30 วัน  → "เตรียมติดต่อลูกค้า ส่ง reminder"
  Monitor:   P10 < 90 วัน  → "schedule follow-up"
  Stable:    P10 > 90 วัน  → "ปกติ ยังไม่ต้องทำอะไร"
```

### Output ต่อลูกค้า

```
Customer acc_id = 12345:
  ├─ last_purchase_date: 2025-11-01
  ├─ last_purchase_amount: ฿10,500
  ├─ predicted_days_p10: 22 วัน  (optimistic)
  ├─ predicted_days_p25: 35 วัน  (alert trigger)
  ├─ predicted_days_p50: 52 วัน  (best guess)
  ├─ predicted_days_p75: 68 วัน
  ├─ predicted_days_p90: 85 วัน  (pessimistic)
  ├─ confidence_width: 63 วัน (P90 - P10)
  ├─ expected_next_purchase: ~2025-12-23 (จาก P50)
  ├─ alert_date: ~2025-12-06 (จาก P25)
  ├─ urgency: "Monitor"
  └─ recommended_action: "Schedule follow-up ต้น ธ.ค. เสนอแพ็กเกจ SMS 10,000 credits"
```

### Evaluation Metrics

| Metric | คืออะไร | Target |
|---|---|---|
| MAE (P50) | ค่าคลาดเคลื่อนเฉลี่ยของ median prediction | < 35 วัน |
| Pinball Loss | Metric เฉพาะ quantile regression (ยิ่งต่ำยิ่งดี) | ต่ำที่สุด |
| Coverage @80% | ค่าจริงอยู่ระหว่าง P10-P90 กี่ % | 78-82% (ใกล้ 80%) |
| Interval Width | P90 - P10 เฉลี่ย | แคบที่สุดเท่าที่จะทำได้โดยรักษา coverage |
| R² (P50) | อธิบาย variance ได้กี่ % | > 0.45 |

---

## Model Monitoring — Drift Detection

> **ที่มา: ENTERPRISE** | เหตุผล: จำเป็นเพื่อให้ระบบคงความ "Best" ในระยะยาว — model ที่ไม่ monitor จะเน่าตามเวลา

### ทำไม Monitoring ถึงจำเป็น

Model ที่ train วันนี้จะ degrade ตามเวลา เพราะ:
- พฤติกรรมลูกค้าเปลี่ยน (เช่น มีคู่แข่งใหม่ → ลูกค้า churn เร็วขึ้น)
- Distribution ของ features เปลี่ยน (เช่น มีลูกค้ากลุ่มใหม่ที่ต่างจากเดิม)
- ฤดูกาล (เช่น campaign ปลายปีทำให้ usage พุ่ง)

ถ้าไม่ monitor → model อาจให้คำตอบผิดโดยไม่มีใครรู้

### Monitoring Framework

```
Run weekly (automated):

1. Data Drift Detection — PSI (Population Stability Index) per feature
   ├─ PSI < 0.1:   No drift → OK
   ├─ PSI 0.1-0.25: Moderate drift → investigate (flag ใน dashboard)
   └─ PSI > 0.25:  Significant drift → trigger alert + schedule retrain

2. Prediction Drift — KS test บน distribution ของ predictions
   ├─ เทียบ predictions สัปดาห์นี้ vs baseline (เดือนแรกหลัง deploy)
   ├─ p-value < 0.05 → drift detected
   └─ ดูว่า distribution เลื่อนไปทางไหน (ทำนาย churn สูงขึ้นหมดเลย?)

3. Performance Monitoring (เมื่อมี ground truth)
   ├─ ทุก quarter: เทียบ predictions vs actual outcomes
   ├─ Churn: AUC ลดลง > 5% → retrain
   ├─ CLV: MAE เพิ่มขึ้น > 20% → retrain
   └─ Credit: Coverage ของ CI เบี่ยงเบนจาก target > 5% → retrain
```

### PSI Calculation

```python
def compute_psi(reference, current, bins=10):
    """
    Population Stability Index:
    เทียบ distribution ของ feature ระหว่าง 2 ช่วงเวลา
    
    PSI = Σ (current% - reference%) × ln(current% / reference%)
    
    PSI < 0.1:   ไม่มีการเปลี่ยนแปลง
    PSI 0.1-0.25: เปลี่ยนแปลงบ้าง ควรตรวจสอบ
    PSI > 0.25:  เปลี่ยนแปลงมาก ต้อง retrain
    """
    import numpy as np
    
    ref_pct = np.histogram(reference, bins=bins)[0] / len(reference)
    cur_pct = np.histogram(current, bins=bins)[0] / len(current)
    
    # Avoid division by zero
    ref_pct = np.clip(ref_pct, 0.001, None)
    cur_pct = np.clip(cur_pct, 0.001, None)
    
    psi = np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct))
    return psi
```

### Retrain Schedule

```
Automatic monthly:
  1. ดึงข้อมูลล่าสุด
  2. Build features ด้วย cutoff_date ใหม่
  3. Retrain ทั้ง 3 models
  4. เทียบ performance กับ model เก่า
  5. ถ้าดีกว่า → deploy model ใหม่
  6. ถ้าแย่กว่า → keep model เก่า + investigate

Triggered (เมื่อ drift detected):
  → เหมือน automatic แต่ไม่รอถึงรอบเดือน

Full rebuild (quarterly):
  → Re-tune hyperparameters ด้วย Optuna ใหม่
  → ตรวจสอบว่า feature set ยังเหมาะสมไหม
  → ตรวจสอบว่า label definition ยังสมเหตุสมผลไหม
```

---

## Combined Business Output — สิ่งที่ Web Dashboard แสดง

### สำหรับลูกค้า 1 คน (Customer 360 Profile)

```
Customer acc_id = 12345:

═══ CHURN (LightGBM + Calibration) ═══
  churn_probability: 0.41 (Medium risk)
  top_risk_factors:
    1. "ไม่ส่งข้อความมา 45 วัน"
    2. "Usage ลดลง 30% ใน 3 เดือนล่าสุด"
    3. "เกินรอบซื้อปกติ 1.5 เท่า"
  
═══ CLV (BG/NBD + Gamma-Gamma + Bootstrap CI) ═══
  predicted_clv_6m: ฿38,850 [฿22,000 - ฿61,000]        ← มี CI แล้ว
  p_alive: 0.72
  rfm_segment: "Loyal Customers"

═══ CREDIT (LightGBM Quantile) ═══
  predicted_days: 52 วัน [22 - 85 วัน]                  ← มี CI แล้ว
  alert_date: 2025-12-06 (จาก P25)
  urgency: "Monitor"

═══ COMBINED ═══
  revenue_at_risk: ฿15,929 (= CLV × churn_probability)
  priority_score: 7.2 / 10
  recommended_action: "โทรติดต่อเสนอแพ็กเกจก่อนเครดิตหมด"
```

### Priority Score

```
priority_score (1-10) =
    0.35 × normalize(churn_probability)       # ยิ่งเสี่ยง churn → ยิ่งต้องรีบ
  + 0.35 × normalize(predicted_clv)           # ยิ่ง CLV สูง → ยิ่งคุ้มค่า save
  + 0.15 × normalize(credit_urgency)          # ใกล้จะซื้อเพิ่ม → timing ดี
  + 0.15 × normalize(engagement_recency)      # เพิ่ง active → โอกาสสำเร็จสูง
```

### Zone 1: Executive Summary (สำหรับ BD)

```
Total Revenue at Risk:  ฿X,XXX,XXX (รวม CLV × churn_prob ของทุกลูกค้า High Risk)
Upcoming Top-up Opportunities: ฿X,XXX,XXX (รวมลูกค้าที่ credit urgency = Critical/Warning)
Active Customers: X,XXX คน
High Churn Risk: XXX คน
Model Health: ✅ All models healthy (no drift detected)      ← NEW
```

### Zone 2: Action Lists (สำหรับ Sales)

```
ตาราง A: "Urgent Top-up List" — ลูกค้าที่ต้องโทรเสนอแพ็กเกจ
  [acc_id | last_purchase | predicted_P25 | predicted_P50 | confidence_band | urgency | action]

ตาราง B: "Retention Alert List" — ลูกค้าที่เสี่ยง churn
  [acc_id | churn_prob | CLV [CI] | rfm_segment | top_risk_factor | action]
```

---

## Production Architecture

### API Endpoints

```
POST /predict/churn       → churn_probability + risk_tier + risk_factors
POST /predict/clv         → predicted_clv + CI + p_alive + segment
POST /predict/credit      → quantile predictions + urgency + alert_date
POST /predict/all         → combined results + priority_score + action
POST /explain/{acc_id}    → SHAP explanation สำหรับลูกค้า 1 คน
POST /what-if/{acc_id}    → "ถ้าเปลี่ยน feature X จะเป็นอย่างไร"
GET  /health              → model version, last retrain date, drift status
GET  /monitoring/drift     → PSI report per feature + prediction drift    ← NEW
```

### การเรียกใช้จาก Web App

```python
from prediction_api_best import PredictiveAnalytics

analytics = PredictiveAnalytics('models_best')

# Predict ทุก model พร้อมกัน
results = analytics.predict_all(customer_features_df)

# อธิบาย churn สำหรับลูกค้า 1 คน
factors = analytics.explain_churn(features_df, acc_id=12345)

# ตรวจสอบ model health
drift_report = analytics.check_drift(current_features_df)
```

---

## Files Output

```
models_best/
├── churn_lgbm_calibrated.pkl        # LightGBM Calibrated Classifier
├── churn_scaler.pkl                 # StandardScaler
├── churn_model_info.json            # Features, metrics, SHAP importance, tuned params
├── churn_evaluation.png             # ROC curves (4 models), PR curve, Confusion Matrix
├── churn_shap.png                   # SHAP summary plot
│
├── ltv_bgnbd.pkl                    # BG/NBD fitted model
├── ltv_gammagamma.pkl               # Gamma-Gamma fitted model
├── ltv_xgb_residual.pkl             # XGBoost residual correction
├── ltv_scaler.pkl                   # StandardScaler
├── ltv_model_info.json              # Metrics (BG/NBD + XGBoost + Bootstrap CI)
├── ltv_evaluation.png               # Actual vs Predicted, CI coverage, RFM segments
│
├── credit_lgbm_q10.pkl              # LightGBM quantile P10
├── credit_lgbm_q25.pkl              # LightGBM quantile P25
├── credit_lgbm_q50.pkl              # LightGBM quantile P50
├── credit_lgbm_q75.pkl              # LightGBM quantile P75
├── credit_lgbm_q90.pkl              # LightGBM quantile P90
├── credit_model_info.json           # Metrics, coverage, pinball loss
├── credit_evaluation.png            # Prediction bands, coverage plot
│
├── monitoring_baseline.pkl          # Reference distributions for drift detection  ← NEW
├── rfm_segments.csv                 # RFM scores + segment per customer
├── prediction_api_best.py           # Python class สำหรับ web app
└── pipeline_best.py                 # Full pipeline — run ครั้งเดียวได้ทุกอย่าง
```

---

## วิธี Run

```bash
# Install dependencies
pip install xgboost lightgbm scikit-learn lifetimes shap optuna scipy pandas numpy matplotlib seaborn dill

# Run full pipeline (load data → train 3 models → export .pkl)
python3 pipeline_best.py path/to/1Moby_Data.xlsx

# Output: models_best/ directory with all .pkl, .json, .png, .csv files
```

---

## Python Dependencies

```
# Core ML
xgboost>=2.0               # XGBoost residual model for CLV
lightgbm>=4.0              # Churn model + Credit quantile regression
scikit-learn>=1.3          # Preprocessing, metrics, calibration

# Probabilistic CLV
lifetimes>=0.11            # BG/NBD + Gamma-Gamma

# Explainability
shap>=0.44                 # SHAP TreeExplainer

# Tuning
optuna>=3.0                # Bayesian hyperparameter optimization

# Data & Utilities
pandas>=2.0
numpy>=1.24
scipy>=1.11                # KS test for drift detection
dill>=0.3                  # Serialize BG/NBD model

# Visualization
matplotlib>=3.7
seaborn>=0.12

# API (for web app)
fastapi>=0.104
uvicorn>=0.24
```

---

## สรุป: ทำไมสูตรนี้ถึง "Best"

| ส่วนประกอบ | ที่มา | ทำไมถึงเลือก |
|---|---|---|
| **Churn: LightGBM** | FINAL | AUC 0.991 + Precision 97.7% + Optuna tuned + Isotonic calibration — สูงพอแล้ว ไม่ต้องเพิ่ม complexity ของ Survival Analysis |
| **CLV: BG/NBD + Bootstrap CI** | FINAL + ENTERPRISE | BG/NBD เป็น gold standard ที่ทำงานได้ดี + เพิ่ม Bootstrap CI ให้รายงานมี credibility มากขึ้น |
| **Credit: LightGBM Quantile** | ENTERPRISE | **เปลี่ยนจริง** — Quantile Regression ให้ confidence band ที่ช่วย Sales วางแผนได้ดีกว่าค่าเดียวมาก |
| **Monitoring: Drift Detection** | ENTERPRISE | **เพิ่มใหม่** — PSI + KS test ทำให้รู้ว่า model เริ่มเน่าเมื่อไหร่ + auto-retrain |
| **Pipeline: Script-based** | FINAL | รวดเร็ว แก้ไขง่าย เหมาะกับ dataset 25K records ไม่ต้อง over-engineer |
