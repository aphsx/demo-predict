# 1Moby Predictive Analytics — Enterprise ML Pipeline Design

## เอกสารนี้คืออะไร

เอกสารนี้ออกแบบ ML pipeline ทั้งหมดสำหรับ 1Moby (Thaibulksms / Thaibulkmail) โดยอ้างอิงจากวิธีที่บริษัทระดับโลก (Spotify, Netflix, Stripe, Shopify, Uber) ใช้จริงใน production สำหรับ 3 โจทย์:

1. **Churn Prediction** — ลูกค้าคนไหนกำลังจะหยุดใช้งาน
2. **Customer Lifetime Value (CLV)** — ลูกค้าแต่ละคนจะสร้าง revenue เท่าไหร่ใน 6 เดือนข้างหน้า
3. **Credit Consumption Forecast** — เครดิตจะหมดเมื่อไหร่ ควรแจ้ง Sales ให้โทรติดต่อเมื่อไหร่

---

## ปัญหาของ Pipeline เดิม (V1) — ทำไมต้องทำใหม่

Pipeline V1 มีปัญหาพื้นฐานที่ทำให้ใช้งานจริงไม่ได้:

**1. Data Leakage รุนแรง**
- Churn label สร้างจาก rule: `credit = 0 → churn = 1`
- แล้วใส่ `credit_sms` เป็น feature → model แค่เรียนรู้ว่า "credit = 0 คือ churn"
- ผลคือ AUC = 0.9999 ซึ่งไม่ได้แปลว่าแม่น แปลว่า **label รั่ว**
- เปรียบเทียบ: เหมือนให้ข้อสอบนักเรียนดูก่อนสอบ แล้วบอกว่าเด็กเก่ง
- Credit model ก็มีปัญหาเดียวกัน: target = `credit / burn_rate` แล้วใส่ `burn_rate` เป็น feature → R² = 0.99 เพราะ model แค่หาร

**2. ไม่ได้ Predict อนาคต แค่บอกสิ่งที่เกิดแล้ว**
- 80.7% ของ dataset เป็น churn อยู่แล้ว (credit = 0 มานานแล้ว)
- Model ไม่ได้ทำนาย "ใครจะ churn" แต่บอก "ใคร churn ไปแล้ว"
- ไม่มีประโยชน์ทาง business เพราะไม่สามารถ intervene ล่วงหน้าได้

**3. Validation ผิดวิธี**
- Random 80/20 split → ข้อมูลปี 2025 ปนใน training set
- ทำให้ model เห็นอนาคตตอน train → performance สูงเกินจริง
- Production จริงไม่มีทางรู้อนาคต ต้องใช้ temporal split เท่านั้น

**4. ไม่มี Model Comparison**
- V1 ใช้ XGBoost ตัวเดียว ไม่เปรียบเทียบกับ algorithm อื่น
- ไม่มี hyperparameter tuning
- ไม่มี SHAP explainability ระดับรายลูกค้า

---

## หลักการออกแบบ (Design Principles)

### 1. Point-in-Time Correctness

ทุก feature ต้องคำนวณจากข้อมูลที่ **มีอยู่จริง ณ วันที่ทำนาย** เท่านั้น

```
observation_date = 2025-07-01 (cutoff date)

feature ใช้ได้:  ข้อมูลตั้งแต่อดีตจนถึง 2025-06-30
feature ใช้ไม่ได้: อะไรก็ตามหลัง 2025-07-01

label ใช้ได้:    event ที่เกิดหลัง 2025-07-01 (อนาคตที่ต้อง predict)
```

ถ้าไม่ทำ point-in-time → **ทุก model จะมี data leakage**

### 2. Predict the Future, Not the Past

Label ต้องเป็นสิ่งที่ **ยังไม่เกิด** ณ วันที่ทำนาย:
- Churn: "ลูกค้าที่ยัง active อยู่วันนี้ จะหยุดใช้งานภายใน 6 เดือนข้างหน้าไหม"
- CLV: "ลูกค้าคนนี้จะสร้าง revenue เท่าไหร่ใน 6 เดือนข้างหน้า"
- Credit: "ลูกค้าคนนี้จะซื้อเครดิตเพิ่มอีกเมื่อไหร่"

### 3. Temporal Validation

Train บนอดีต → test บนอนาคต → **ไม่มีข้อมูลอนาคตรั่วเข้า training**

```
Pipeline ใช้ cutoff = 2025-07-01:

Features: คำนวณจากข้อมูลก่อน 2025-07-01 เท่านั้น
Labels:   ดูจาก event ที่เกิดหลัง 2025-07-01

Train/Test: Stratified split จาก population ที่ active ณ cutoff
```

### 4. Per-Customer Explainability (SHAP)

ไม่ใช่แค่ "feature importance รวมทั้ง model" แต่ต้องตอบได้ว่า:
- "ทำไม **ลูกค้าคนนี้** ถึงเสี่ยง?" (SHAP per-customer)
- "ถ้าเขาทำ X จะลดความเสี่ยงได้ไหม?" (what-if analysis)

### 5. Model Selection via Competition

ไม่ใช่เลือก algorithm ล่วงหน้า แต่ให้หลาย models แข่งกัน แล้วเลือกตัวที่ดีที่สุดบน validation set:

```
ผู้เข้าแข่งขัน:
  1. Logistic Regression   (baseline, interpretable)
  2. Random Forest          (ensemble, non-linear)
  3. XGBoost                (boosting, state-of-the-art)
  4. LightGBM               (boosting, faster, histogram-based)

แข่งด้วย: AUC-ROC, F1-Score, Precision, Recall
ผู้ชนะ: ถูก tune hyperparameters ด้วย Optuna → calibrate probabilities
```

---

## Data Layer

### ข้อมูลที่ได้รับจาก 1Moby

| Source | Records | ใช้ทำอะไร |
|---|---|---|
| Users + User_profile | 25,093 | Customer attributes, account age, credit status |
| Backend_payment | 13,882 txns (4,495 customers) | Purchase history → RFM, CLV labels |
| SMS_usage (BC/API/OTP) | ~72,760 | Usage patterns, engagement signals |
| Email_usage (BC/API/OTP) | ~3,495 | Usage patterns, engagement signals |

### ข้อมูลสำคัญที่ต้องเข้าใจ

- **78.2%** ของลูกค้ามี SMS credit = 0 → คนพวกนี้คือ "already churned" **ไม่ควรอยู่ใน churn prediction**
- เพียง **17.5%** (4,495 คน) เคยซื้อเครดิต → CLV model ใช้ได้กับกลุ่มนี้เท่านั้น ที่เหลือ CLV = 0
- **39.3%** ไม่เคย login, **74.8%** ไม่เคยส่งข้อความ → ลูกค้าส่วนใหญ่ไม่เคย engage เลย
- Business model เป็น **Credit Base (Pay-Per-Use)** → ไม่มี subscription → ไม่มี label สำเร็จรูป

### ลักษณะธุรกิจ Thaibulksms / Thaibulkmail

```
ธุรกิจแบบ Credit Base (Pay-Per-Use):
- ลูกค้าซื้อเครดิต SMS/Email ล่วงหน้า
- ใช้เครดิตเพื่อส่งข้อความ
- เมื่อเครดิตหมด ต้องซื้อเพิ่ม
- ไม่มีสัญญา subscription → ไม่มี "cancel" event
- Churn = หยุดซื้อ + หยุดใช้ → ต้องนิยามเอง
```

### Data Pipeline

```
Raw Excel (8 sheets)
  │
  ├─ load_data()
  │    ├─ Read ทุก sheet
  │    ├─ Clean column names
  │    ├─ Parse dates
  │    └─ Tag usage source + channel
  │
  ├─ build_features_at_cutoff(cutoff_date)
  │    ├─ User features (account age, access recency, credit status)
  │    ├─ Payment features (RFM, intervals, overdue)
  │    ├─ Usage features (total, trend, decay, channel split)
  │    └─ Point-in-time enforcement: ใช้ข้อมูล < cutoff เท่านั้น
  │
  └─ Output: customer_features table (1 row per customer, 30+ features)
```

### Feature Set (30 features จริงที่ใช้)

**User Features:**

| Feature | คำอธิบาย | ที่มา |
|---|---|---|
| days_since_join | จำนวนวันตั้งแต่สมัคร | join_date |
| days_since_last_access | จำนวนวันที่ไม่ login | last_access |
| days_since_last_send | จำนวนวันที่ไม่ส่งข้อความ | last_send |
| days_until_sms_expire | เครดิต SMS จะหมดอายุในอีกกี่วัน | expire_sms |
| days_until_email_expire | เครดิต Email จะหมดอายุในอีกกี่วัน | expire_email |
| credit_sms_log | log(1 + credit_sms) เพื่อลด skewness | credit_sms |
| credit_email_log | log(1 + credit_email) | credit_email |
| is_paid_sms | สถานะ PAID / TRIAL (0/1) | status_sms |
| is_paid_email | สถานะ PAID / TRIAL (0/1) | status_email |

**Payment Features (RFM-based):**

| Feature | คำอธิบาย |
|---|---|
| pay_recency_days | จำนวนวันตั้งแต่ซื้อครั้งล่าสุด |
| pay_frequency | จำนวน transactions ทั้งหมด |
| pay_monetary_log | log(1 + ยอดเงินรวม) |
| pay_avg_amount | ยอดเงินเฉลี่ยต่อ transaction |
| pay_total_credits | จำนวนเครดิตที่ซื้อรวม |
| pay_avg_interval | ระยะเวลาเฉลี่ยระหว่าง transactions (วัน) |
| pay_overdue_ratio | recency ÷ avg_interval (> 1 = เกินรอบซื้อปกติ) |
| pay_n_sms | จำนวนครั้งที่ซื้อ SMS credits |
| pay_n_email | จำนวนครั้งที่ซื้อ Email credits |
| pay_tenure_days | จำนวนวันตั้งแต่ซื้อครั้งแรก |

**Usage Features:**

| Feature | คำอธิบาย |
|---|---|
| usage_total_log | log(1 + จำนวนข้อความรวมทั้งหมด) |
| usage_months | จำนวนเดือนที่มี activity |
| usage_avg | ปริมาณใช้งานเฉลี่ยต่อเดือน |
| usage_max | เดือนที่ใช้งานสูงสุด |
| usage_std | ความผันผวนของ monthly usage |
| usage_recent_3m | ปริมาณใช้งาน 3 เดือนล่าสุด |
| usage_prev_3m | ปริมาณใช้งาน 3 เดือนก่อนหน้า |
| usage_decay_ratio | recent_3m ÷ prev_3m (< 1 = ใช้งานลดลง) |
| usage_slope | ความชันของ linear regression บน monthly usage |
| usage_sms_total | จำนวน SMS ที่ส่งทั้งหมด |
| usage_email_total | จำนวน Email ที่ส่งทั้งหมด |

---

## Model 1: Churn Prediction

### โจทย์

ทำนายว่าลูกค้าที่ **ยัง active อยู่ตอนนี้** จะหยุดใช้งานภายใน 6 เดือนข้างหน้าหรือไม่

### สิ่งที่ V2 ทำ vs สิ่งที่ V1 ทำ

| เรื่อง | V1 (ปัญหา) | V2 (แก้ไข) |
|---|---|---|
| Population | ลูกค้าทั้งหมด 25,093 คน (78% credit=0) | เฉพาะ **active customers** ที่มี activity ใน 6 เดือนก่อน cutoff |
| Label | Rule-based: credit=0 → churn | Observation-based: active ณ cutoff แล้วหยุดใช้งานจริงภายใน 6 เดือน |
| Class balance | 80.7% churn (เกือบทุกคน = churn) | **48.4% churn** (สมจริง) |
| Algorithm | XGBoost ตัวเดียว | **4 models แข่งกัน** + Optuna tuning + Probability Calibration |
| Validation | Random split | **Temporal cutoff**: features ก่อน 2025-07-01, labels หลัง |
| Explain | Global feature importance (gain) | **SHAP per-customer**: "ทำไมคนนี้เสี่ยง" |

### Population: ใครควรอยู่ใน Churn Model

```
ลูกค้าทั้งหมด: 25,093 คน
  │
  ├─ Already churned (ไม่มี activity > 6 เดือน): ~20,680 คน
  │    → ไม่เข้า model (churn ไปแล้ว ไม่ต้อง predict)
  │    → Web app บอกเลยว่า "Already Churned" ด้วย business rule
  │
  └─ Active customers (มี usage หรือ payment ใน 6 เดือนก่อน cutoff): 4,413 คน
       → เข้า model ← focus ที่นี่
       │
       ├─ จะ churn ใน 6 เดือน: 2,138 คน (48.4%)
       └─ ยัง active หลัง 6 เดือน: 2,275 คน (51.6%)
```

### Label Creation

```python
def create_churn_label(observation_date='2025-07-01', window_months=6):
    """
    สำหรับลูกค้าที่ active ณ observation_date:
    
    Active = มี usage หรือ payment อย่างน้อย 1 ครั้ง
             ใน 6 เดือนก่อน observation_date
    
    Churn = ไม่มี usage + ไม่มี payment เลย
            ในช่วง 6 เดือนหลัง observation_date
    
    ไม่ได้ใช้ credit = 0 เป็นเงื่อนไข
    เพราะลูกค้าบางคน credit หมดแต่กลับมาซื้อใหม่
    ต้องดู actual behavior หลัง cutoff เท่านั้น
    """
```

### Model Competition — ผลจริงจากการเทรน

เปรียบเทียบ 4 algorithms บน dataset เดียวกัน (3,124 samples, 30 features):

| Model | AUC-ROC | F1-Score | Precision | Recall |
|---|---|---|---|---|
| Logistic Regression | 0.9446 | 0.7891 | 0.7294 | 0.8595 |
| Random Forest | 0.9898 | 0.9399 | 0.9503 | 0.9297 |
| XGBoost | 0.9905 | 0.9392 | 0.9605 | 0.9189 |
| **LightGBM** | **0.9923** | **0.9441** | **0.9769** | **0.9135** |

**ผู้ชนะ: LightGBM** — AUC สูงสุด, Precision สูงมาก (97.7%)

### Optuna Hyperparameter Tuning

```
จำนวน trials: 50
Best AUC จาก tuning: 0.9929
Best parameters:
  n_estimators = 126
  max_depth = 9
  learning_rate = 0.045
  subsample = 0.632
  colsample_bytree = 0.868
  min_child_weight = 1
```

### Probability Calibration

หลัง tune แล้ว ใช้ **Isotonic Regression** calibrate probability เพื่อให้ค่าที่ model บอก "70% จะ churn" หมายถึง 70% ของลูกค้ากลุ่มนี้ churn จริง — ไม่ใช่แค่ relative score

### Final Model Performance (Tuned + Calibrated)

| Metric | Score |
|---|---|
| AUC-ROC | **0.991** |
| F1-Score | **0.948** |
| Precision | **0.966** |
| Recall | **0.930** |
| Accuracy | **0.970** |

```
Confusion Matrix:
                  Predicted
                  Active    Churn
Actual Active  [  434        6  ]
       Churn   [   13      172  ]

False Positives: 6 คน (บอกว่า churn แต่ไม่ churn) → เสียแค่ค่า retention campaign
False Negatives: 13 คน (ไม่บอก แต่ churn จริง) → สูญเสีย revenue
```

### SHAP Explainability — ผลจริง

Top 15 features ที่สำคัญที่สุด (จาก SHAP values เฉลี่ย):

| อันดับ | Feature | SHAP Impact | ความหมาย |
|---|---|---|---|
| 1 | days_since_last_send | 2.50 | ไม่ส่งข้อความนาน → churn สูงมาก |
| 2 | usage_recent_3m | 0.66 | ใช้งานน้อย 3 เดือนล่าสุด → เสี่ยง |
| 3 | days_since_last_access | 0.58 | ไม่ login → เสี่ยง |
| 4 | usage_months | 0.55 | เคย active น้อยเดือน → เสี่ยง |
| 5 | days_until_sms_expire | 0.41 | เครดิตใกล้หมดอายุ → เสี่ยง |
| 6 | days_since_join | 0.19 | สมัครมานานแต่ไม่ใช้ → เสี่ยง |
| 7 | usage_decay_ratio | 0.18 | ใช้งานลดลง → สัญญาณเตือน |
| 8 | pay_recency_days | 0.16 | ไม่ซื้อเครดิตนาน → เสี่ยง |
| 9 | usage_email_total | 0.15 | ใช้ email น้อย → channel engagement ต่ำ |
| 10 | usage_prev_3m | 0.12 | ใช้งานน้อยใน period ก่อนหน้า |

### Per-Customer Explanation ตัวอย่าง

```
Customer acc_id = 12345 (Churn probability = 0.78):

ปัจจัยที่เพิ่มความเสี่ยง (push toward churn):
  1. days_since_last_send = 95   → "ไม่ส่งข้อความมา 95 วัน"
  2. usage_recent_3m = 0          → "ไม่มี usage เลยใน 3 เดือนล่าสุด"
  3. days_since_last_access = 72  → "ไม่ login มา 72 วัน"

ปัจจัยที่ลดความเสี่ยง (push toward active):
  1. pay_monetary_log = 12.3      → "เคยใช้จ่ายสูง"
  2. usage_months = 18            → "เคย active มานาน"

Recommended action: "โทรสอบถามปัญหาการใช้งาน + เสนอ special offer"
```

### What-If Analysis

```
คำถาม: "ถ้าลูกค้า 12345 กลับมา login วันนี้ จะลด churn risk ไหม?"

วิธี: เปลี่ยน days_since_last_access จาก 72 → 0 แล้ว predict ใหม่

ผลลัพธ์:
  - Original churn_prob: 0.78
  - Modified churn_prob: 0.42
  - Risk reduction: -0.36 (ลดลง 36%)
  → สรุป: ถ้าฝ่ายขายกระตุ้นให้ลูกค้ากลับมาใช้งาน จะลด risk ได้มาก
```

---

## Model 2: Customer Lifetime Value (CLV) + RFM

### โจทย์

ทำนายว่าลูกค้าแต่ละคนจะสร้าง revenue เท่าไหร่ใน 6 เดือนข้างหน้า เพื่อให้ Sales จัดลำดับความสำคัญ

### สิ่งที่ V2 ทำ vs สิ่งที่ V1 ทำ

| เรื่อง | V1 (ปัญหา) | V2 (แก้ไข) |
|---|---|---|
| Algorithm | XGBoost regression อย่างเดียว | **BG/NBD + Gamma-Gamma** (probabilistic, gold standard) + XGBoost |
| P(alive) | ไม่มี | **BG/NBD ให้ P(alive)** → ลูกค้ายัง "มีชีวิต" ไหม |
| Segmentation | Static RFM quintile | **Dynamic: P(alive) + CLV-based** |
| Who gets CLV | ลูกค้าทุกคน | เฉพาะลูกค้าที่ **เคยซื้อซ้ำ** (1,501 คน) |
| Validation | Random split (data leak) | **Temporal: train ก่อน cutoff, test ด้วย actual revenue หลัง cutoff** |

### Approach: BG/NBD + Gamma-Gamma

นี่คือ standard ที่ Shopify, HubSpot, และบริษัท SaaS ใช้กัน

**ทำไม BG/NBD + Gamma-Gamma ถึงดีกว่า XGBoost regression:**

1. **Designed for the problem** — ออกแบบมาเฉพาะสำหรับ "non-contractual customer behavior" ซึ่งตรงกับ Thaibulksms ที่เป็น pay-per-use
2. **แยก 2 คำถามออกจากกัน:**
   - BG/NBD ตอบ: "ลูกค้าคนนี้ยัง active ไหม? จะกลับมาซื้ออีกกี่ครั้ง?"
   - Gamma-Gamma ตอบ: "แต่ละครั้งที่ซื้อ จะซื้อเท่าไหร่?"
3. **P(alive)** — ให้ probability ว่าลูกค้ายัง "มีชีวิต" อยู่ไหม ซึ่ง XGBoost ให้ไม่ได้
4. **ใช้ข้อมูลน้อยก็ทำงานได้** — ต้องการแค่ Recency, Frequency, T, Monetary

**BG/NBD Model:**

```
ใช้ library: lifetimes (Python)

Input ต่อลูกค้า:
  - frequency: จำนวน repeat purchases (ไม่นับครั้งแรก)
  - recency: วันระหว่าง first purchase ถึง last purchase
  - T: วันระหว่าง first purchase ถึง observation_date

Output ต่อลูกค้า:
  - P(alive): ความน่าจะเป็นที่ยัง active (0-1)
  - E[purchases in next 180 days]: จำนวน transactions ที่คาดว่าจะเกิด

ผลจริง: ลูกค้าที่ repeat purchase 1,501 คน
         Avg predicted purchases (6m): 1.39 ครั้ง
```

**Gamma-Gamma Model:**

```
ใช้ library: lifetimes (Python)

Input ต่อลูกค้า:
  - frequency: จำนวน repeat purchases
  - monetary_value: ยอดเงินเฉลี่ยต่อ transaction

Output: E[average transaction value] ต่อลูกค้า
```

**Combined CLV:**

```
CLV = E[purchases in next 180 days] × E[average transaction value]
```

### ผล BG/NBD + Gamma-Gamma จริง

| Metric | Score |
|---|---|
| MAE | ฿141,813 |
| R² | **0.716** |
| จำนวนลูกค้าที่ evaluate | 1,501 คน (repeat purchasers) |

R² = 0.716 หมายความว่า model อธิบาย revenue จริงได้ 71.6% — ถือว่าดีสำหรับ probabilistic model ที่ใช้แค่ RFM 4 ตัว

### XGBoost Regression (Feature-based approach เสริม)

นอกจาก BG/NBD แล้ว ยังเทรน XGBoost regression เพื่อใช้ features เพิ่มเติม (usage, credit, engagement):

| Metric | Score |
|---|---|
| MAE | ฿34,560 |
| RMSE | ฿361,138 |
| R² | 0.176 |
| Features | 23 features |
| Train/Test | 3,827 / 957 |

R² = 0.176 ดูน้อย เพราะ revenue ของลูกค้า 1Moby มี variance สูงมาก (บางคนซื้อ ฿0, บางคน ฿4M) — แต่ MAE ฿34,560 ถือว่าใช้ได้ดี

**การใช้งานจริงควรรวมทั้ง 2 วิธี:**

```
Final CLV = BG/NBD + Gamma-Gamma prediction (probabilistic base)
          + XGBoost residual correction (feature-based adjustment)
```

### RFM Segmentation — ผลจริง

| Segment | จำนวนลูกค้า | คำอธิบาย | Action |
|---|---|---|---|
| Champions | 714 | ซื้อบ่อย ซื้อเยอะ ล่าสุด | Upsell, VIP program |
| Loyal Customers | 876 | ซื้อบ่อย สม่ำเสมอ | Cross-sell, maintain |
| At Risk | 602 | เคยซื้อเยอะ แต่เงียบไปนาน | Win-back campaign |
| New Customers | 329 | เพิ่งเริ่มซื้อ | Onboarding, first incentive |
| Need Attention | 181 | ซื้อปานกลาง เริ่มลดลง | Send reminder, special offer |
| Potential Loyalists | 92 | ซื้อไม่บ่อย แต่ล่าสุดซื้อ | Encourage repeat purchase |
| Hibernating | 859 | เคยซื้อ แต่หยุดนานมาก | Re-activation หรือ stop invest |

### Output ต่อลูกค้า

```
Customer acc_id = 12345:
  ├─ p_alive: 0.72
  ├─ expected_purchases_6m: 2.3
  ├─ avg_transaction_value: ฿18,500
  ├─ predicted_clv_6m: ฿38,850
  ├─ rfm_segment: "Loyal Customers"
  ├─ ltv_tier: "Very High"
  └─ recommended_action: "Cross-sell email package"
```

---

## Model 3: Credit Consumption Prediction

### โจทย์

ทำนายว่าลูกค้าจะซื้อเครดิตเพิ่มอีกเมื่อไหร่ (จำนวนวันจนถึงการซื้อครั้งถัดไป) เพื่อให้ Sales ติดต่อก่อนที่ลูกค้าจะหนีไปใช้เจ้าอื่น

### สิ่งที่ V2 ทำ vs สิ่งที่ V1 ทำ

| เรื่อง | V1 (ปัญหา) | V2 (แก้ไข) |
|---|---|---|
| Target | credit / burn_rate (คำนวณจาก feature ที่ใส่เข้าไป) | **จำนวนวันจริง** ระหว่างการซื้อครั้งนี้กับครั้งถัดไป |
| Features | ใส่ burn_rate เป็น feature (= คำตอบ) | **Lag features, purchase history, usage context** |
| Data | 3,697 samples (1 per customer) | **8,141 transaction pairs** (ทุก purchase → next purchase) |
| R² | 0.991 (ปลอม — data leak) | **0.478 (จริง)** |
| MAE | 7 วัน (ปลอม) | **34.2 วัน (จริง)** |

### Approach: Transaction-Pair Learning

แทนที่จะ predict "เครดิตหมดเมื่อไหร่" (ซึ่งแค่หาร credit/rate) เราเปลี่ยนโจทย์เป็น:

**"เมื่อลูกค้าซื้อเครดิตครั้งนี้ จะกลับมาซื้ออีกกี่วันข้างหน้า?"**

```
สร้าง training data จากทุก transaction pair:

Transaction 1 (2024-03-15, ฿10,500)  → next buy = 2024-05-01 → target = 47 วัน
Transaction 2 (2024-05-01, ฿30,000)  → next buy = 2024-07-20 → target = 80 วัน
Transaction 3 (2024-07-20, ฿10,500)  → next buy = 2024-09-10 → target = 52 วัน

Total: 8,141 transaction pairs จากลูกค้า 4,495 คน
```

### Feature Set (14 features per transaction)

| Feature | คำอธิบาย |
|---|---|
| current_amount | ยอดเงินที่ซื้อครั้งนี้ |
| current_credits | จำนวนเครดิตที่ซื้อครั้งนี้ |
| credit_type_sms | ซื้อ SMS (1) หรือ Email (0) |
| n_prev_purchases | จำนวนครั้งที่ซื้อมาก่อน ณ เวลานี้ |
| avg_prev_amount | ยอดเงินเฉลี่ยของ transactions ก่อนหน้า |
| max_prev_amount | ยอดเงินสูงสุดที่เคยซื้อ |
| total_prev_amount | ยอดเงินรวมตั้งแต่เริ่มเป็นลูกค้า |
| avg_interval | ระยะเฉลี่ยระหว่าง transactions ก่อนหน้า (วัน) |
| std_interval | ความผันผวนของระยะระหว่าง transactions |
| last_interval | ระยะระหว่าง 2 transactions ล่าสุด (วัน) |
| days_since_prev | กี่วันตั้งแต่ซื้อครั้งก่อน |
| usage_total_before_log | log(1 + usage รวมก่อน transaction นี้) |
| usage_avg_monthly | ปริมาณใช้งานเฉลี่ยต่อเดือน ก่อน transaction นี้ |
| usage_recent_avg | ปริมาณใช้งานเฉลี่ย 3 เดือนล่าสุด |

### Model Competition — ผลจริง

| Model | MAE (วัน) | R² |
|---|---|---|
| **XGBoost** | **34.2** | **0.478** |
| LightGBM | 34.6 | 0.469 |
| Random Forest | 35.0 | 0.461 |

**ผู้ชนะ: XGBoost** — MAE ต่ำสุด, R² สูงสุด

### ทำไม R² 0.478 ถึง "ดี" ทั้งที่ดูน้อย

R² = 0.478 หมายความว่า model อธิบายความแปรปรวนได้ 47.8% ซึ่ง:

1. **โจทย์ยาก**: ทำนาย "เมื่อไหร่จะซื้อ" จากพฤติกรรมอดีต ไม่ใช่การหารตัวเลข
2. **ไม่มี data leak**: V1 ได้ R² = 0.99 เพราะใส่คำตอบเป็น feature
3. **MAE 34 วัน** ยังมีประโยชน์: ถ้าลูกค้าปกติซื้อทุก 60 วัน model จะบอกว่า "น่าจะซื้ออีกใน 50-70 วัน" → Sales ตั้ง reminder ได้

### Alert Logic สำหรับ Sales

```
predicted_days_to_next = model.predict(transaction_features)

Urgency levels:
  Critical:  predicted < 14 วัน  → "ลูกค้าน่าจะซื้อเร็วๆ นี้ รีบโทร!"
  Warning:   predicted < 30 วัน  → "เตรียมติดต่อลูกค้า"
  Monitor:   predicted < 90 วัน  → "schedule follow-up"
  Stable:    predicted > 90 วัน  → "ปกติ ยังไม่ต้องทำอะไร"
```

### Output ต่อลูกค้า

```
Customer acc_id = 12345:
  ├─ last_purchase_date: 2025-11-01
  ├─ last_purchase_amount: ฿10,500
  ├─ predicted_days_to_next: 52 วัน
  ├─ expected_next_purchase: ~2025-12-23
  ├─ urgency: "Monitor"
  └─ recommended_action: "Schedule follow-up call ปลายเดือน ธ.ค."
```

---

## Combined Business Output

### สำหรับฝ่าย Sales — รวม 3 models เข้าด้วยกัน

```
Customer acc_id = 12345:

═══ CHURN PREDICTION (LightGBM + Calibration) ═══
  churn_probability: 0.41 (Medium risk)
  top_risk_factors:
    1. "ไม่ส่งข้อความมา 45 วัน"
    2. "Usage ลดลง 30% ใน 3 เดือนล่าสุด"
    3. "เกินรอบซื้อปกติ 1.5 เท่า"
  
═══ CLV (BG/NBD + Gamma-Gamma) ═══
  predicted_clv_6m: ฿38,850
  p_alive: 0.72
  rfm_segment: "Loyal Customers"

═══ CREDIT CONSUMPTION (XGBoost) ═══
  predicted_days_to_next_purchase: 52 วัน
  urgency: "Monitor"

═══ COMBINED INSIGHTS ═══
  revenue_at_risk: ฿15,929 (= CLV × churn_probability)
  priority_score: 7.2 / 10
  recommended_action: "โทรติดต่อเสนอแพ็กเกจก่อนเครดิตหมด"
```

### Priority Score Formula

```
priority_score (1-10) =
    0.35 × normalize(churn_probability)       # ยิ่งเสี่ยง churn → ยิ่งต้องรีบ
  + 0.35 × normalize(predicted_clv)           # ยิ่ง CLV สูง → ยิ่งคุ้มค่า save
  + 0.15 × normalize(credit_urgency)          # ใกล้จะซื้อเพิ่ม → timing ดี
  + 0.15 × normalize(engagement_recency)      # เพิ่ง active → โอกาสสำเร็จสูง
```

### Web Dashboard Flow

```
ผู้ใช้ Upload CSV/Excel
  │
  ├─ ระบบ check: customer มี credit > 0 หรือ activity ใน 6 เดือน?
  │
  ├─ ถ้าไม่ (Already Churned):
  │    → Churn = 100% (business rule, ไม่ใช้ ML)
  │    → LTV = historical only
  │    → Action: "Win-back campaign" หรือ "Stop investing"
  │
  └─ ถ้าใช่ (Active Customer):
       → Churn = XX% (ML prediction with SHAP explanation)
       → LTV = ฿XX (BG/NBD + Gamma-Gamma)
       → Credit = XX วัน (XGBoost from transaction pairs)
       → Priority Score = X.X / 10
       → Action = recommended based on combined signals
```

---

## Files Output

```
models_v2/
├── churn_model.pkl                  # LightGBM (Calibrated) — 1,694 KB
├── churn_scaler.pkl                 # StandardScaler for churn features
├── churn_model_info.json            # Features, metrics, tuned params, SHAP
├── churn_evaluation_v2.png          # ROC curves (4 models), Confusion Matrix
├── churn_shap.png                   # SHAP summary plot (per-feature impact)
│
├── ltv_xgb_model.pkl               # XGBoost regression for LTV — 724 KB
├── ltv_bgnbd.pkl                    # BG/NBD fitted model — 62 KB
├── ltv_gammagamma.pkl               # Gamma-Gamma fitted model — 38 KB
├── ltv_scaler.pkl                   # StandardScaler for LTV features
├── ltv_model_info.json              # Metrics (BG/NBD + XGBoost)
├── ltv_evaluation_v2.png            # Actual vs Predicted, RFM segments
│
├── credit_model.pkl                 # XGBoost regression — 1,141 KB
├── credit_scaler.pkl                # StandardScaler for credit features
├── credit_model_info.json           # Metrics, model comparison
├── credit_evaluation_v2.png         # Actual vs Predicted, model comparison
│
├── rfm_segments.csv                 # RFM scores + segments per customer
├── prediction_api_v2.py             # Python class สำหรับ web app เรียกใช้
└── pipeline_v2.py                   # Full pipeline (run ครั้งเดียว ได้ทุกอย่าง)
```

---

## วิธีใช้งาน

### Run Pipeline ทั้งหมด

```bash
pip install xgboost lightgbm scikit-learn lifetimes shap optuna scipy pandas numpy matplotlib seaborn dill

python3 pipeline_v2.py path/to/1Moby_Data.xlsx
```

### เรียกใช้ Model จาก Web App

```python
from prediction_api_v2 import PredictiveAnalytics

# โหลด models (ทำครั้งเดียวตอน server start)
analytics = PredictiveAnalytics('models_v2')

# Predict ทั้ง 3 models
results = analytics.predict_all(customer_features_df)
# → ได้: churn_probability, churn_risk, predicted_ltv_6m,
#         ltv_tier, predicted_days_to_purchase, urgency, revenue_at_risk

# อธิบาย churn สำหรับลูกค้า 1 คน (SHAP)
factors = analytics.explain_churn(features_df, acc_id=12345)
# → ได้: dict ของ feature → impact score (+ = เพิ่มเสี่ยง, - = ลดเสี่ยง)
```

### FastAPI Endpoint ตัวอย่าง

```python
from fastapi import FastAPI, UploadFile, File
from pipeline_v2 import load_data, build_features_at_cutoff

app = FastAPI(title="1Moby Predictive Analytics V2")
analytics = PredictiveAnalytics('models_v2')

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    content = await file.read()
    users, payments, usage = parse_uploaded_data(content)
    features = build_features_at_cutoff(users, payments, usage, 'today')
    results = analytics.predict_all(features)
    return {"predictions": results.to_dict(orient="records")}

@app.post("/explain/{acc_id}")
async def explain(acc_id: int):
    explanation = analytics.explain_churn(features_cache, acc_id)
    return {"factors": explanation}

@app.post("/what-if/{acc_id}")
async def what_if(acc_id: int, feature: str, new_value: float):
    # Clone features, change one value, re-predict
    modified = features_cache.copy()
    modified.loc[modified['acc_id'] == acc_id, feature] = new_value
    original = analytics.predict_churn(features_cache[features_cache['acc_id'] == acc_id])
    changed = analytics.predict_churn(modified[modified['acc_id'] == acc_id])
    return {
        "original_churn_prob": float(original['churn_probability'].iloc[0]),
        "modified_churn_prob": float(changed['churn_probability'].iloc[0]),
        "risk_change": float(changed['churn_probability'].iloc[0] - original['churn_probability'].iloc[0])
    }
```

---

## Python Dependencies

```
# Core ML
xgboost>=2.0          # Classification + Regression
lightgbm>=4.0         # Churn model winner
scikit-learn>=1.3     # Preprocessing, metrics, calibration

# Probabilistic CLV
lifetimes>=0.11       # BG/NBD + Gamma-Gamma

# Explainability
shap>=0.44            # SHAP values (TreeExplainer)

# Hyperparameter Tuning
optuna>=3.0           # Bayesian optimization (50 trials)

# Data
pandas>=2.0
numpy>=1.24
scipy>=1.11           # Linear regression for usage trend
dill>=0.3             # Serialize BG/NBD model

# Visualization
matplotlib>=3.7
seaborn>=0.12

# API (สำหรับ web app)
fastapi>=0.104
uvicorn>=0.24
```

---

## สิ่งที่ปรับปรุงได้ต่อ (Future Improvements)

| หัวข้อ | รายละเอียด | ผลที่คาด |
|---|---|---|
| Survival Analysis | ใช้ Cox PH + Random Survival Forest เพื่อตอบ "เมื่อไหร่จะ churn" ไม่ใช่แค่ "ใช่/ไม่" | ได้ survival curve ต่อลูกค้า |
| Quantile Regression | ใช้ LightGBM quantile regression สำหรับ Credit model (5 quantiles) | ได้ confidence interval แทนค่าเดียว |
| Walk-Forward CV | Train หลาย folds ข้ามเวลา (Q1→Q2, Q1-Q2→Q3, ...) | เห็น model degradation |
| Bootstrap CI สำหรับ CLV | Resample 200 ครั้ง → ได้ 95% CI ต่อลูกค้า | CLV = ฿45,000 [฿28,000 - ฿68,000] |
| Feature Store | Rolling windows 30/60/90/180 วัน + versioning | Features ละเอียดกว่า + reproducible |
| Model Monitoring | PSI drift detection + auto-retrain triggers | ตรวจจับ model staleness |
| Neural Network | TabNet หรือ FT-Transformer สำหรับ tabular data | อาจดีกว่า XGBoost ถ้า data เยอะพอ |

---

## สรุป: ทำไมการออกแบบนี้ถึงถูกต้อง

| หลักการ | วิธีที่เราทำ | ผลจริง |
|---|---|---|
| No data leakage | Point-in-time features + temporal cutoff + label จากอนาคตเท่านั้น | AUC 0.991 (จริง ไม่ปลอม) |
| Predict the future | Active customers only + forward-looking labels | 48.4% churn (สมจริง vs 80.7% V1) |
| Right algorithm | 4 models แข่งกัน + LightGBM ชนะ + Optuna tuned | F1 = 0.948, Precision = 0.966 |
| Probabilistic CLV | BG/NBD + Gamma-Gamma (industry standard) | R² = 0.716 |
| Per-customer explanation | SHAP values + what-if analysis | "ทำไมคนนี้เสี่ยง" + "ทำอะไรได้" |
| Real credit prediction | Transaction-pair learning (ไม่หาร credit/rate) | MAE = 34 วัน (จริง) |
| Actionable output | Priority score + recommended action + alert scheduling | ฝ่ายขายใช้ได้จริง |
