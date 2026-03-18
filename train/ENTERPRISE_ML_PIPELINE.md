# 1Moby Predictive Analytics — Enterprise ML Pipeline Design

## เอกสารนี้คืออะไร

เอกสารนี้ออกแบบ ML pipeline ใหม่ทั้งหมดตั้งแต่ศูนย์ โดยอ้างอิงจากวิธีที่บริษัทระดับโลก (Spotify, Netflix, Stripe, Shopify, Uber) ใช้จริงใน production สำหรับ 3 โจทย์:

1. **Churn Prediction** — ลูกค้าคนไหนกำลังจะหยุดใช้งาน และ **เมื่อไหร่**
2. **Customer Lifetime Value (CLV)** — ลูกค้าแต่ละคนมีมูลค่าเท่าไหร่ใน 6-12 เดือนข้างหน้า
3. **Credit Consumption Forecast** — เครดิตจะหมดเมื่อไหร่ ควรแจ้งเตือนเมื่อไหร่

---

## ปัญหาของ Pipeline เดิม (V1) — ทำไมต้องทำใหม่

Pipeline V1 มีปัญหาพื้นฐานที่ทำให้ใช้งานจริงไม่ได้:

**1. Data Leakage รุนแรง**
- Churn label สร้างจาก rule: `credit = 0 → churn = 1`
- แล้วใส่ `credit_sms` เป็น feature → model แค่เรียนรู้ว่า "credit = 0 คือ churn"
- ผลคือ AUC = 0.9999 ซึ่งไม่ได้แปลว่าแม่น แปลว่า **label รั่ว**
- เปรียบเทียบ: เหมือนให้ข้อสอบนักเรียนดูก่อนสอบ แล้วบอกว่าเด็กเก่ง

**2. ไม่ได้ Predict อนาคต แค่บอกสิ่งที่เกิดแล้ว**
- 80.7% ของ dataset เป็น churn อยู่แล้ว (credit = 0 มานานแล้ว)
- Model ไม่ได้ทำนาย "ใครจะ churn" แต่บอก "ใคร churn ไปแล้ว"
- ไม่มีประโยชน์ทาง business เพราะไม่สามารถ intervene ล่วงหน้าได้

**3. ไม่มี Uncertainty**
- LTV ได้ค่าเดียว เช่น "฿50,000" → แต่จริงอาจเป็น ฿5,000 หรือ ฿200,000
- Credit model บอก "หมดใน 45 วัน" → แต่จริงอาจ 15 หรือ 90 วัน
- Enterprise ต้องการ confidence interval เพื่อตัดสินใจได้ถูกต้อง

**4. Validation ผิดวิธี**
- Random 80/20 split → ข้อมูลปี 2025 ปนใน training set
- ทำให้ model เห็นอนาคตตอน train → performance สูงเกินจริง
- Production จริงไม่มีทางรู้อนาคต ต้องใช้ temporal split เท่านั้น

---

## หลักการออกแบบ (Design Principles)

ก่อนลงรายละเอียด model ต้องเข้าใจหลักการที่ enterprise ทุกที่ยึดถือ:

### 1. Point-in-Time Correctness

ทุก feature ต้องคำนวณจากข้อมูลที่ **มีอยู่จริง ณ วันที่ทำนาย** เท่านั้น

```
observation_date = 2024-12-31

feature ใช้ได้:  ข้อมูลตั้งแต่อดีตจนถึง 2024-12-31
feature ใช้ไม่ได้: อะไรก็ตามหลัง 2024-12-31

label ใช้ได้:    event ที่เกิดหลัง 2024-12-31 (อนาคตที่ต้อง predict)
```

ถ้าไม่ทำ point-in-time → **ทุก model จะมี data leakage**

### 2. Predict the Future, Not the Past

Label ต้องเป็นสิ่งที่ **ยังไม่เกิด** ณ วันที่ทำนาย:
- Churn: "ลูกค้าที่ยัง active อยู่วันนี้ จะหยุดใช้งานภายใน 90 วันข้างหน้าไหม"
- CLV: "ลูกค้าคนนี้จะสร้าง revenue เท่าไหร่ใน 6 เดือนข้างหน้า"
- Credit: "เครดิตที่เหลืออยู่จะหมดเมื่อไหร่"

### 3. Temporal Validation

Train บนอดีต → test บนอนาคต → **ไม่มีข้อมูลอนาคตรั่วเข้า training**

```
Walk-forward validation:

Fold 1: Train [Jan-Jun 2024]  → Test [Jul-Sep 2024]
Fold 2: Train [Jan-Sep 2024]  → Test [Oct-Dec 2024]
Fold 3: Train [Jan-Dec 2024]  → Test [Jan-Mar 2025]
Fold 4: Train [Jan 2024-Mar 2025] → Test [Apr-Jun 2025]
```

### 4. Uncertainty Quantification

ทุก prediction ต้องมี confidence interval — ไม่ใช่แค่ค่าเดียว

Business ต้องตอบคำถามเช่น:
- "เรามั่นใจแค่ไหนว่าลูกค้าคนนี้จะ churn?"
- "CLV อยู่ในช่วงไหน? worst case คือเท่าไหร่?"
- "ถ้าเราจะส่ง alert ก่อนเครดิตหมด ต้องส่งล่วงหน้ากี่วัน?"

### 5. Per-Customer Explainability

ไม่ใช่แค่ "feature importance รวมทั้ง model" แต่ต้องตอบได้ว่า:
- "ทำไม **ลูกค้าคนนี้** ถึงเสี่ยง?" (SHAP per-customer)
- "ถ้าเขาทำ X จะลดความเสี่ยงได้ไหม?" (what-if analysis)

---

## Data Layer

### ข้อมูลที่มี

| Source | Records | ใช้ทำอะไร |
|---|---|---|
| Users + Profile | 25,093 | Customer attributes, account age, status |
| Backend Payment | 13,882 txns (4,495 customers) | Purchase history → RFM, CLV labels |
| SMS Usage (BC/API/OTP) | ~72,760 | Usage patterns, engagement signals |
| Email Usage (BC/API/OTP) | ~3,495 | Usage patterns, engagement signals |

### ข้อมูลสำคัญ

- 78.2% ของลูกค้ามี SMS credit = 0 → คนพวกนี้คือ "already churned" ไม่ควรอยู่ใน churn prediction
- เพียง 17.5% เคยซื้อเครดิต → CLV model ใช้ได้กับกลุ่มนี้เท่านั้น ที่เหลือ CLV = 0
- 39.3% ไม่เคย login, 74.8% ไม่เคยส่งข้อความ → ลูกค้าส่วนใหญ่ไม่เคย engage เลย

### Data Pipeline

```
Raw Data
  │
  ├─ 00_ingestion.py
  │    ├─ Schema validation (ตรวจ format, type, range ของทุก column)
  │    ├─ Deduplication (เอา duplicate records ออก)
  │    ├─ Date alignment (ทำให้ทุก table ใช้ timezone เดียวกัน)
  │    └─ Quality report (null%, outlier%, distribution ของทุก column)
  │
  ├─ 01_feature_store.py
  │    ├─ Point-in-time feature computation
  │    ├─ Rolling windows: 30 / 60 / 90 / 180 วัน
  │    ├─ Feature registry (document ว่าแต่ละ feature คืออะไร มาจากไหน)
  │    └─ Feature versioning (track ว่า feature set เปลี่ยนเมื่อไหร่)
  │
  └─ Output: customer_features table (1 row per customer per observation_date)
```

### Feature Set (70+ features)

**User Features:**

| Feature | คำอธิบาย | ที่มา |
|---|---|---|
| account_age_days | จำนวนวันตั้งแต่สมัคร | register_date |
| days_since_last_access | จำนวนวันที่ไม่ login | last_access |
| days_since_last_send | จำนวนวันที่ไม่ส่งข้อความ | last_send_date |
| has_sms_credit | มีเครดิตเหลือหรือไม่ (0/1) | credit_sms |
| credit_sms | จำนวนเครดิตคงเหลือ | credit_sms |
| sms_expired | เครดิตหมดอายุหรือยัง (0/1) | sms_expire_date |
| days_until_sms_expire | เครดิตจะหมดอายุในอีกกี่วัน | sms_expire_date |

**Usage Features (Rolling Windows):**

| Feature | คำอธิบาย |
|---|---|
| usage_{N}d_total | จำนวนข้อความรวมใน N วันล่าสุด (N = 30, 60, 90, 180) |
| usage_{N}d_mean | ค่าเฉลี่ยรายเดือนใน N วันล่าสุด |
| usage_{N}d_std | ความผันผวนของ usage ใน N วันล่าสุด |
| usage_trend_slope | ความชันของ linear regression บน monthly usage (ลบ = ใช้น้อยลง) |
| usage_decay_ratio | usage 3 เดือนล่าสุด ÷ usage 3 เดือนก่อนหน้า (< 1 = ลดลง) |
| usage_volatility | Coefficient of Variation ของ monthly usage |
| zero_usage_streak | จำนวนเดือนติดต่อกันที่ไม่มี usage |
| active_months_ratio | สัดส่วนเดือนที่มี usage ÷ อายุบัญชี (เดือน) |
| peak_monthly_usage | เดือนที่ใช้งานสูงสุด |
| sms_to_email_ratio | สัดส่วน SMS ÷ Email usage |

**Payment Features (RFM):**

| Feature | คำอธิบาย |
|---|---|
| recency_days | วันตั้งแต่การซื้อล่าสุด |
| frequency | จำนวน transactions ทั้งหมด |
| monetary_total | ยอดเงินรวมทั้งหมด |
| monetary_mean | ยอดเงินเฉลี่ยต่อ transaction |
| monetary_std | ความผันผวนของยอดซื้อ |
| avg_purchase_interval | ระยะเวลาเฉลี่ยระหว่าง transactions (วัน) |
| purchase_regularity | ความสม่ำเสมอของการซื้อ (1 - CoV of intervals) |
| days_overdue | เกินรอบซื้อปกติกี่วัน |
| overdue_ratio | days_overdue ÷ avg_purchase_interval |
| ever_purchased | เคยซื้อหรือไม่ (0/1) |

**Engagement Composite:**

| Feature | คำอธิบาย |
|---|---|
| engagement_score | Weighted composite: login recency + usage + purchase activity |
| health_score | Overall account health (0-100) |

---

## Model 1: Churn Prediction

### โจทย์

ทำนายว่าลูกค้าที่ **ยัง active อยู่ตอนนี้** จะหยุดใช้งานหรือไม่ และ **เมื่อไหร่**

### สิ่งที่ Enterprise ทำ vs สิ่งที่ V1 ทำ

| เรื่อง | V1 (ปัญหา) | Enterprise (แก้ไข) |
|---|---|---|
| Population | ใช้ลูกค้าทั้งหมด 25,093 คน | ใช้เฉพาะ **active customers** (มีเครดิต > 0 หรือมี activity ใน 90 วัน) |
| Label | Rule-based: credit=0 → churn | Observation-based: ลูกค้าที่ active ณ วันที่ X แล้วหยุดใช้งานจริงภายใน 90-180 วัน |
| Output | Binary: churn yes/no | **Survival curve**: ความน่าจะเป็นที่จะ churn ที่ 30, 60, 90, 120, 180 วัน |
| Algorithm | XGBoost classifier ตัวเดียว | **Survival analysis ensemble**: Cox PH + Random Survival Forest + XGBoost-AFT |
| Validation | Random split | **Temporal split**: train 2024, test 2025 |
| Explain | Global feature importance | **SHAP per-customer**: "ทำไมคนนี้เสี่ยง" |

### Population: ใครควรอยู่ใน Churn Model

```
ลูกค้าทั้งหมด: 25,093 คน
  │
  ├─ Already churned (credit=0, ไม่มี activity > 180 วัน): ~19,000 คน
  │    → ไม่เข้า model (เป็น churn ไปแล้ว ไม่ต้อง predict)
  │
  ├─ Active customers: ~6,000 คน
  │    → เข้า model ← focus ที่นี่
  │    │
  │    ├─ จะ churn ใน 180 วัน: ~1,000 คน (event = 1)
  │    └─ ยัง active หลัง 180 วัน: ~5,000 คน (event = 0, censored)
  │
  └─ ได้ class ratio ที่สมจริง: ~17% churn (ไม่ใช่ 80%)
```

### Label Creation

```python
def create_churn_label(observation_date, outcome_window=180):
    """
    observation_date = วันที่เราทำนาย (เช่น 2024-12-31)
    outcome_window = ดูอนาคตกี่วัน (180 = 6 เดือน)
    
    สำหรับลูกค้าแต่ละคนที่ active ณ observation_date:
    - ถ้าหยุดใช้งานจริงภายใน 180 วัน → event = 1, duration = วันที่หยุด
    - ถ้ายังใช้อยู่หลัง 180 วัน → event = 0, duration = 180 (censored)
    
    นิยาม "หยุดใช้งาน":
    - ไม่ login + ไม่ส่งข้อความ + ไม่ซื้อเครดิต เป็นเวลา 60 วันติดต่อกัน
    - หรือ เครดิตหมด + ไม่ซื้อเพิ่มภายใน 30 วัน
    """
```

### Approach: Survival Analysis

Survival Analysis คือ framework ที่ออกแบบมาเฉพาะสำหรับคำถาม "เมื่อไหร่จะเกิด event" ซึ่งดีกว่า binary classification เพราะ:

1. **ตอบคำถาม "เมื่อไหร่" ได้** — ไม่ใช่แค่ "ใช่หรือไม่"
2. **จัดการ censored data ได้** — ลูกค้าที่ยัง active = "ยังไม่รู้ว่าจะ churn เมื่อไหร่" ไม่ใช่ "จะไม่ churn"
3. **ให้ survival curve** — ดู P(churn) ที่ time point ไหนก็ได้

### Ensemble Architecture

ใช้ 3 models รวมกัน เพราะแต่ละตัวมีจุดแข็งต่างกัน:

**Component 1: Cox Proportional Hazards (Baseline, Interpretable)**

```
ใช้ library: lifelines (Python)
ทำไม: เป็น gold standard ของ survival analysis มา 50+ ปี
จุดแข็ง: Interpretable — ดู hazard ratio ของแต่ละ feature ได้ชัดเจน
         เช่น "ลูกค้าที่ usage ลด 50% มีความเสี่ยง churn สูงกว่า 2.3 เท่า"
จุดอ่อน: สมมติว่า hazard เป็น proportional (linear relationship)
         จับ non-linear interaction ไม่ได้
Regularization: Elastic net (L1 + L2) เพื่อป้องกัน overfitting
```

**Component 2: Random Survival Forest (Non-linear)**

```
ใช้ library: scikit-survival
ทำไม: จับ non-linear patterns และ feature interactions ได้
         เช่น "usage ลดลงพร้อมกับเครดิตเหลือน้อย" → risk สูงกว่าแต่ละตัวแยกกัน
จุดแข็ง: ไม่ต้องสมมติ proportional hazards
         Robust ต่อ outliers
จุดอ่อน: ช้ากว่า, ต้อง tune hyperparameters
Parameters:
  n_estimators = 500
  min_samples_split = 10
  min_samples_leaf = 5
  max_features = "sqrt"
```

**Component 3: XGBoost Discrete-Time Survival (State-of-the-art)**

```
ใช้ library: xgboost
วิธี: แปลง survival problem เป็น binary classification หลายตัว
      - Model_30: จะ churn ภายใน 30 วันไหม?
      - Model_60: จะ churn ภายใน 60 วันไหม?
      - Model_90: จะ churn ภายใน 90 วันไหม?
      - Model_120: จะ churn ภายใน 120 วันไหม?
      - Model_180: จะ churn ภายใน 180 วันไหม?

ทำไม: XGBoost มี performance ดีที่สุดบน tabular data
       discrete-time approach ให้ flexibility สูง
       ทำ SHAP ได้ง่าย (TreeExplainer)
Parameters:
  n_estimators = 300
  max_depth = 6
  learning_rate = 0.05
  subsample = 0.8
  colsample_bytree = 0.8
  scale_pos_weight = auto (จาก class ratio)
  eval_metric = "logloss"
  early_stopping_rounds = 30
```

**Ensemble Combination:**

```
Final survival probability at time t =
  0.2 × Cox_survival(t) +
  0.3 × RSF_survival(t) +
  0.5 × XGB_survival(t)

น้ำหนักได้จาก optimizing C-index บน validation set
```

### Output ต่อลูกค้า

```
Customer acc_id = 12345:
  ├─ churn_prob_30d:  0.08  (8% จะ churn ใน 30 วัน)
  ├─ churn_prob_60d:  0.22  (22% จะ churn ใน 60 วัน)
  ├─ churn_prob_90d:  0.41  (41% จะ churn ใน 90 วัน)
  ├─ churn_prob_180d: 0.65  (65% จะ churn ใน 180 วัน)
  ├─ expected_lifetime_days: 112
  ├─ risk_tier: High
  ├─ top_risk_factors:
  │    1. usage_decay_ratio = 0.3 → "Usage ลดลง 70% ใน 3 เดือน"
  │    2. days_since_last_access = 45 → "ไม่ login มา 45 วัน"
  │    3. overdue_ratio = 2.1 → "เกินรอบซื้อปกติ 2.1 เท่า"
  └─ recommended_action: "Engagement campaign + special offer"
```

### Evaluation Metrics

| Metric | คืออะไร | Target |
|---|---|---|
| C-index (Concordance) | ความสามารถในการจัดอันดับ risk (เทียบเท่า AUC สำหรับ survival) | > 0.75 ดี, > 0.85 ดีมาก |
| Time-dependent AUC @30d | AUC สำหรับการทำนาย churn ภายใน 30 วัน | > 0.80 |
| Time-dependent AUC @90d | AUC สำหรับการทำนาย churn ภายใน 90 วัน | > 0.75 |
| Integrated Brier Score | Calibration + Discrimination (ยิ่งต่ำยิ่งดี) | < 0.20 |
| Calibration plot | Predicted probability ตรงกับ actual rate | เส้นตรง 45° |

**หมายเหตุ:** ถ้า C-index > 0.95 แปลว่ามี data leakage ต้องตรวจสอบ feature set

---

## Model 2: Customer Lifetime Value (CLV)

### โจทย์

ทำนายว่าลูกค้าแต่ละคนจะสร้าง revenue เท่าไหร่ใน 6 เดือนข้างหน้า พร้อม confidence interval

### สิ่งที่ Enterprise ทำ vs สิ่งที่ V1 ทำ

| เรื่อง | V1 (ปัญหา) | Enterprise (แก้ไข) |
|---|---|---|
| Algorithm | XGBoost regression | **BG/NBD + Gamma-Gamma** (probabilistic, industry gold standard) |
| Output | Point estimate: ฿50,000 | **฿50,000 [฿28,000 - ฿78,000] 95% CI** |
| Segmentation | Static RFM quintile | **Dynamic: P(alive) + expected CLV** |
| Who gets CLV | ลูกค้าทุกคน | เฉพาะลูกค้าที่ **เคยซื้อ** (4,495 คน) ที่เหลือ CLV = 0 |
| Validation | Random split | Train 2024, predict 2025, compare actual 2025 revenue |

### Approach: BG/NBD + Gamma-Gamma

นี่คือ standard ที่ Shopify, HubSpot, และบริษัท subscription/SaaS ใช้กัน

**ทำไม BG/NBD + Gamma-Gamma ถึงดีกว่า XGBoost regression:**

1. **Designed for the problem** — ออกแบบมาเฉพาะสำหรับ "contractual/non-contractual customer behavior"
2. **แยก 2 คำถามออกจากกัน:**
   - BG/NBD ตอบ: "ลูกค้าคนนี้ยัง active ไหม? จะกลับมาซื้ออีกกี่ครั้ง?"
   - Gamma-Gamma ตอบ: "แต่ละครั้งที่ซื้อ จะซื้อเท่าไหร่?"
3. **P(alive)** — ให้ probability ว่าลูกค้ายัง "มีชีวิต" อยู่ไหม ซึ่ง XGBoost ให้ไม่ได้
4. **ใช้ข้อมูลน้อยก็ทำงานได้** — ต้องการแค่ Recency, Frequency, T, Monetary

**BG/NBD Model (Purchase Frequency + Alive Probability):**

```
ใช้ library: lifetimes (Python)

Input ต่อลูกค้า:
  - frequency: จำนวน repeat purchases (ไม่นับครั้งแรก)
  - recency: วันระหว่าง first purchase ถึง last purchase
  - T: วันระหว่าง first purchase ถึง observation_date

สมมติฐาน:
  - ลูกค้าแต่ละคนมี "อัตราการซื้อ" (λ) เฉพาะของตัวเอง
  - λ กระจายเป็น Gamma distribution ข้าม population
  - ลูกค้ามีโอกาส "drop off" หลังทุก transaction (p)
  - p กระจายเป็น Beta distribution ข้าม population

Output ต่อลูกค้า:
  - P(alive): ความน่าจะเป็นที่ยัง active (0-1)
  - E[purchases in next T days]: จำนวน transactions ที่คาดว่าจะเกิด
```

**Gamma-Gamma Model (Monetary Value per Transaction):**

```
ใช้ library: lifetimes (Python)

Input ต่อลูกค้า:
  - frequency: จำนวน repeat purchases
  - monetary_value: average spend per transaction

สมมติฐาน:
  - มูลค่าต่อ transaction ของแต่ละคนกระจายเป็น Gamma
  - ข้าม population, parameter ของ Gamma กระจายเป็น Gamma อีกที
  
Prerequisite: frequency กับ monetary_value ต้องไม่ correlate กันมาก (|r| < 0.3)

Output: E[average transaction value] ต่อลูกค้า
```

**Combined CLV:**

```
CLV = E[purchases in next 180 days]
    × E[average transaction value]
    × profit_margin
    × discount_factor

โดย:
  - discount_rate: เช่น 1% ต่อเดือน (time value of money)
  - profit_margin: เช่น 30% (ต้องได้จาก business)
```

### Optional Enhancement: XGBoost Residual Model

```
BG/NBD + Gamma-Gamma ดีแต่ใช้แค่ RFM — ไม่เห็น features อื่น เช่น:
- Usage patterns (ส่ง SMS เยอะ → มีแนวโน้มซื้อเพิ่ม)
- Account age
- Product mix (SMS vs Email)

วิธีเพิ่ม: Train XGBoost บน residual (actual CLV - predicted CLV จาก BG/NBD)
แล้วเอามาบวกเข้าไป:

Final CLV = BG/NBD prediction + XGBoost residual correction

ข้อดี: ได้ทั้ง probabilistic foundation + non-linear feature interactions
```

### Confidence Interval

```
วิธี: Bootstrap
1. Resample ข้อมูล 200 ครั้ง
2. Fit BG/NBD + GG ใหม่ทุกครั้ง
3. Predict CLV จากทุก bootstrap sample
4. เอา percentile 2.5 และ 97.5 เป็น 95% CI

Output: CLV = ฿45,000 [฿28,000 - ฿68,000]
```

### Dynamic Segmentation

แทนที่ static RFM quintile ใช้ P(alive) + CLV ร่วมกัน:

```
| Segment     | เงื่อนไข                              | Action                                |
|-------------|---------------------------------------|---------------------------------------|
| Champion    | P(alive) > 0.8 AND CLV top 20%       | Upsell, loyalty program, VIP          |
| Loyal       | P(alive) > 0.6 AND CLV top 50%       | Cross-sell, maintain relationship     |
| Promising   | P(alive) > 0.8 AND CLV bottom 50%    | Encourage higher spend (bundles)      |
| At Risk     | P(alive) 0.3-0.6                     | Win-back campaign, special offer      |
| Dormant     | P(alive) < 0.3                       | Re-activation or stop investing       |
| New         | T < 90 days                          | Onboarding, first-purchase incentive  |
```

### Output ต่อลูกค้า

```
Customer acc_id = 12345:
  ├─ p_alive: 0.72
  ├─ expected_purchases_6m: 2.3
  ├─ avg_transaction_value: ฿18,500
  ├─ predicted_clv_6m: ฿38,850
  ├─ clv_lower_95: ฿22,000
  ├─ clv_upper_95: ฿61,000
  ├─ segment: "Loyal"
  └─ recommended_action: "Cross-sell email package"
```

### Evaluation Metrics

| Metric | คืออะไร | ทำไมสำคัญ |
|---|---|---|
| MAE / RMSE | ค่าคลาดเคลื่อนเฉลี่ย | วัดความแม่นของ point estimate |
| Spearman Rank Correlation | ลำดับถูกไหม (ลูกค้า CLV สูงจริงๆ ถูก rank สูงไหม) | สำคัญกว่า MAE เพราะ business ต้องการจัด priority |
| Top-decile Lift | Top 10% ที่ model เลือก capture revenue จริงกี่ % | ถ้า top 10% capture > 50% revenue → model ใช้ได้ |
| P(alive) Calibration | ลูกค้าที่ P(alive) = 0.7 มีจริง 70% ที่ยัง active ไหม | ตรวจว่า probability ที่ model ให้ตรงกับ reality |
| Coverage (CI) | 95% CI ครอบคลุมค่าจริง 95% ไหม | ตรวจว่า confidence interval ไม่กว้างหรือแคบเกินไป |

---

## Model 3: Credit Consumption Forecast

### โจทย์

ทำนายว่าเครดิต SMS ที่เหลืออยู่จะหมดเมื่อไหร่ พร้อม confidence band เพื่อส่ง alert ล่วงหน้า

### สิ่งที่ Enterprise ทำ vs สิ่งที่ V1 ทำ

| เรื่อง | V1 (ปัญหา) | Enterprise (แก้ไข) |
|---|---|---|
| Output | "หมดใน 45 วัน" (ค่าเดียว) | **"หมดใน 30-65 วัน (90% CI)"** + alert date |
| Burn rate | ค่าเฉลี่ยรวม | **Per-customer EWMA** (ถ่วงน้ำหนักล่าสุดมากกว่า) |
| Algorithm | XGBoost regression | **LightGBM Quantile Regression** (5 quantiles) |
| Seasonality | ไม่คิด | จับ pattern: วันจันทร์ใช้เยอะ, สิ้นเดือนใช้น้อย |
| Business action | ไม่มี | **Alert date + recommended top-up amount** |

### Approach: LightGBM Quantile Regression

**ทำไม Quantile Regression:**

XGBoost regression ปกติ predict "ค่าเฉลี่ย" → ได้ค่าเดียว
Quantile regression predict **percentile ที่ต้องการ** → ได้หลายค่า = confidence band

```
Train 5 models พร้อมกัน:

  Model_P10:  "90% ของลูกค้าจะหมดช้ากว่านี้"   (optimistic bound)
  Model_P25:  "75% ของลูกค้าจะหมดช้ากว่านี้"   (alert trigger)
  Model_P50:  "best guess"                       (median prediction)
  Model_P75:  "25% ของลูกค้าจะหมดช้ากว่านี้"
  Model_P90:  "10% ของลูกค้าจะหมดช้ากว่านี้"   (pessimistic bound)
```

**ทำไม LightGBM ไม่ใช่ XGBoost:**

- LightGBM มี built-in quantile regression objective → ง่าย ไม่ต้อง customize
- เร็วกว่า XGBoost 2-5x บน dataset ขนาดนี้
- Memory efficient กว่า (histogram-based)
- Performance ใกล้เคียงหรือดีกว่า XGBoost บน tabular data

```
ใช้ library: lightgbm

Parameters per quantile model:
  objective = "quantile"
  alpha = [0.10, 0.25, 0.50, 0.75, 0.90]  (ตาม quantile)
  n_estimators = 500
  max_depth = 8
  learning_rate = 0.05
  subsample = 0.8
  colsample_bytree = 0.8
  min_child_samples = 20
  reg_alpha = 0.1
  reg_lambda = 1.0
```

### Label Creation

```python
def create_credit_label(observation_date):
    """
    สำหรับลูกค้าที่มี credit > 0 ณ observation_date:
    
    y = จำนวนวันจริงจนกว่า credit จะหมด
    
    คำนวณจาก:
    - ดูว่าหลัง observation_date credit ลดลงเรื่อยๆ จนถึง 0 เมื่อไหร่
    - ถ้ามีการซื้อเพิ่มระหว่างทาง → ใช้เฉพาะช่วงก่อนซื้อเพิ่ม
    - ถ้าหมดเวลา observation window แล้ว credit ยังไม่หมด → censored
    """
```

### Feature Set (เพิ่มเติมจาก base features)

```
Credit-specific features:
  - current_credit: เครดิตคงเหลือ ณ ปัจจุบัน
  - ewma_burn_rate: Exponentially Weighted Moving Average ของ daily usage
                    (ถ่วงน้ำหนัก recent usage มากกว่า → จับ trend ได้ดีกว่าค่าเฉลี่ยธรรมดา)
  - credit_velocity: อัตราการลดของเครดิต (Δcredit / Δtime)
  - peak_daily_usage: วันที่ใช้เยอะที่สุด (worst case burn rate)
  - weekday_usage_ratio: สัดส่วน usage วันจันทร์-ศุกร์ vs เสาร์-อาทิตย์
  - month_end_spike: มี pattern ใช้เยอะช่วงสิ้นเดือนไหม
  - last_topup_amount: ซื้อเครดิตล่าสุดเท่าไหร่
  - avg_topup_interval: ซื้อทุกกี่วันโดยเฉลี่ย
```

### Alert Logic

```
alert_date = today + days_to_runout_P25
(ใช้ P25 ไม่ใช่ P50 เพราะต้องเผื่อเวลาให้ลูกค้าตัดสินใจ)

recommended_topup = avg_monthly_usage × 3 เดือน × 1.2 (buffer 20%)

Urgency levels:
  Critical: days_to_runout_P10 ≤ 7 วัน     → send alert ทันที
  Warning:  days_to_runout_P10 ≤ 30 วัน    → send alert + offer
  Monitor:  days_to_runout_P10 ≤ 90 วัน    → schedule follow-up
  Stable:   days_to_runout_P10 > 90 วัน    → ปกติ ไม่ต้องทำอะไร
```

### Output ต่อลูกค้า

```
Customer acc_id = 12345:
  ├─ current_credit: 8,500 SMS
  ├─ days_to_runout_p10: 22  (optimistic)
  ├─ days_to_runout_p25: 31
  ├─ days_to_runout_p50: 45  (best guess)
  ├─ days_to_runout_p75: 58
  ├─ days_to_runout_p90: 71  (pessimistic)
  ├─ confidence_width: 49 วัน (p90 - p10)
  ├─ urgency: "Warning"
  ├─ alert_date: 2025-04-20
  ├─ recommended_topup: 15,000 SMS
  └─ recommended_package: "Package B (฿5,900)"
```

### Evaluation Metrics

| Metric | คืออะไร | Target |
|---|---|---|
| MAE (median) | ค่าคลาดเคลื่อนของ P50 | < 10 วัน |
| Pinball Loss | Metric เฉพาะของ quantile regression | ยิ่งต่ำยิ่งดี |
| Coverage @90% | ค่าจริงอยู่ระหว่าง P10-P90 กี่ % | 88-92% (ใกล้ 90%) |
| Interval Width | P90 - P10 เฉลี่ย | แคบที่สุดเท่าที่จะทำได้โดยยังรักษา coverage |
| Interval Sharpness | Coverage ÷ Width | ยิ่งสูงยิ่งดี (แคบแต่ครอบคลุม) |

---

## Explainability Layer: SHAP

### ทำไม SHAP ถึงจำเป็น

Feature importance ปกติ (gain, split) บอกแค่ว่า "feature ไหนสำคัญ **โดยรวม**" สำหรับทุกลูกค้า
SHAP บอกว่า "feature ไหนทำให้ **ลูกค้าคนนี้** ได้ prediction ค่านี้"

```
ใช้ library: shap

สำหรับ tree-based models (XGBoost, LightGBM):
  → ใช้ TreeExplainer (exact, เร็ว, O(TLD) ต่อ prediction)

สำหรับ survival models (Cox, RSF):
  → ใช้ KernelExplainer (approximate, ช้า แต่ใช้ได้กับทุก model)
```

### Per-Customer Explanation

```
Customer acc_id = 12345 (Churn risk = 0.73):

ปัจจัยที่เพิ่มความเสี่ยง (push toward churn):
  1. usage_decay_ratio = 0.3     → impact: +0.18  "Usage ลดลง 70%"
  2. days_since_last_access = 45 → impact: +0.12  "ไม่ login มา 45 วัน"
  3. overdue_ratio = 2.1         → impact: +0.09  "เกินรอบซื้อ 2 เท่า"

ปัจจัยที่ลดความเสี่ยง (push toward active):
  1. monetary_total = ฿125,000   → impact: -0.08  "เคยใช้จ่ายเยอะ"
  2. account_age_days = 730      → impact: -0.05  "เป็นลูกค้ามานาน"
```

### What-If Analysis

```
คำถาม: "ถ้าลูกค้า 12345 ซื้อเครดิตเพิ่ม 10,000 SMS จะลด churn risk เท่าไหร่?"

วิธี: เปลี่ยน credit_sms จาก 500 → 10,500 แล้ว predict ใหม่

ผลลัพธ์:
  - Original churn_prob_90d: 0.73
  - Modified churn_prob_90d: 0.31
  - Risk reduction: -0.42 (ลดลง 42%)
  → สรุป: ถ้าให้ incentive ให้ซื้อเครดิตเพิ่ม จะลด churn risk ได้มาก
```

---

## Validation Framework

### Walk-Forward Temporal Validation

```
ข้อมูลทั้งหมด: Jan 2024 — Jun 2025

Fold 1: Train [Jan-Jun 2024]        → Test [Jul-Sep 2024]
Fold 2: Train [Jan-Sep 2024]        → Test [Oct-Dec 2024]
Fold 3: Train [Jan-Dec 2024]        → Test [Jan-Mar 2025]
Fold 4: Train [Jan 2024-Mar 2025]   → Test [Apr-Jun 2025]

สำหรับแต่ละ Fold:
  1. Build features using data up to train_end ONLY
  2. Create labels from outcome window after train_end
  3. Train model on training data
  4. Evaluate on test data (ที่ model ไม่เคยเห็น)
  5. Record metrics

Aggregate:
  - Mean ± Std ของ metrics ข้าม folds
  - ตรวจ degradation: performance ลดลงตาม fold ไหม (model staleness)
```

### ทำไมต้อง Temporal Split

| Random Split | Temporal Split |
|---|---|
| ข้อมูล 2025 อาจอยู่ใน train set | Train ใช้แค่ data ก่อน cutoff date |
| Model "เห็นอนาคต" ตอน train | Model ไม่เคยเห็นอนาคต |
| Performance สูงเกินจริง | Performance สะท้อน production จริง |
| ไม่เห็น model degradation | เห็นว่า model เสื่อมตามเวลาไหม |

---

## Production Architecture

### API Design

```
FastAPI server with endpoints:

POST /predict/churn
  Input: customer features (JSON)
  Output: survival probabilities + risk tier + top risk factors

POST /predict/clv
  Input: customer RFM data + features (JSON)
  Output: CLV + confidence interval + segment + P(alive)

POST /predict/credit
  Input: customer features + current credit (JSON)
  Output: days-to-runout quantiles + urgency + alert date + recommended topup

POST /predict/all
  Input: customer data (JSON)
  Output: combined results from all 3 models + priority score + action recommendation

POST /explain/{acc_id}
  Output: SHAP explanation for specific customer across all models

POST /what-if/{acc_id}
  Input: feature name + new value
  Output: how prediction changes if feature changes

GET /health
  Output: model version, last retrain date, data freshness, drift status
```

### Combined Business Output

```
Customer acc_id = 12345:

═══ CHURN (Survival Analysis) ═══
  churn_prob_90d: 0.41 (Medium risk)
  expected_lifetime: 112 days
  
═══ CLV (BG/NBD + Gamma-Gamma) ═══
  predicted_clv_6m: ฿38,850 [฿22,000 - ฿61,000]
  p_alive: 0.72
  segment: Loyal

═══ CREDIT (Quantile Forecast) ═══
  days_to_runout: 45 days [22 - 71 days]
  urgency: Warning
  alert_date: 2025-04-20
  recommended_topup: 15,000 SMS

═══ COMBINED INSIGHTS ═══
  revenue_at_risk: ฿15,929 (= CLV × churn_prob_90d)
  priority_score: 7.2 / 10
  recommended_action: "Send credit top-up reminder with 10% discount"
  
═══ WHY THIS CUSTOMER IS AT RISK ═══
  1. Usage dropped 70% in last 3 months
  2. Haven't logged in for 45 days
  3. Overdue for purchase by 2.1x normal interval
```

### Priority Score Formula

```
priority_score (1-10) =
    0.35 × normalize(churn_prob_90d)         # High churn risk → act fast
  + 0.35 × normalize(predicted_clv)           # High CLV → worth saving
  + 0.15 × normalize(credit_urgency_score)    # Credit running out → immediate need
  + 0.15 × normalize(engagement_recency)      # Recently active → higher chance of success
```

### Model Monitoring

```
Run weekly:

1. Data Drift Detection (PSI per feature)
   - PSI < 0.1:  No drift → OK
   - PSI 0.1-0.25: Moderate drift → investigate
   - PSI > 0.25: Significant drift → trigger retrain

2. Prediction Drift (KS test on prediction distributions)
   - Compare this week's predictions vs last month's baseline
   - If p-value < 0.05 → drift detected

3. Performance Monitoring (when ground truth available)
   - Every quarter: compare predictions vs actual outcomes
   - If C-index drops > 5% or MAE increases > 20% → retrain

4. Retrain Schedule
   - Automatic: monthly with latest data
   - Triggered: when drift detected
   - Full rebuild: quarterly (re-tune hyperparameters)
```

---

## Files Output

```
models/
├── churn_survival_ensemble.pkl       # Cox + RSF + XGB-discrete ensemble
├── churn_scaler.pkl                  # Feature scaler
├── churn_model_info.json             # Features, metrics, params
├── churn_evaluation.png              # Survival curves, calibration, C-index
├── churn_shap_explainer.pkl          # SHAP TreeExplainer
│
├── clv_bgnbd.pkl                     # BG/NBD fitted model
├── clv_gamma_gamma.pkl               # Gamma-Gamma fitted model
├── clv_xgb_residual.pkl              # Optional: XGBoost residual model
├── clv_model_info.json               # Params, metrics
├── clv_evaluation.png                # Predicted vs Actual, calibration
├── clv_shap_explainer.pkl            # SHAP for residual model
│
├── credit_lgbm_q10.pkl               # LightGBM quantile P10
├── credit_lgbm_q25.pkl               # LightGBM quantile P25
├── credit_lgbm_q50.pkl               # LightGBM quantile P50
├── credit_lgbm_q75.pkl               # LightGBM quantile P75
├── credit_lgbm_q90.pkl               # LightGBM quantile P90
├── credit_model_info.json            # Params, metrics, coverage
├── credit_evaluation.png             # Prediction bands, coverage
├── credit_shap_explainer.pkl         # SHAP TreeExplainer
│
├── feature_registry.json             # Feature definitions, sources
├── model_metadata.json               # Version, retrain date, metrics
├── validation_report.json            # Walk-forward results per fold
├── monitoring_baseline.pkl           # Reference distributions for drift
├── rfm_segments.csv                  # Dynamic BG/NBD-based segments
├── full_predictions.csv              # All predictions for all customers
└── prediction_api.py                 # FastAPI production server
```

---

## Python Dependencies

```
# Core ML
xgboost>=2.0          # XGBoost discrete-time survival + residual
lightgbm>=4.0         # Quantile regression (credit model)
scikit-learn>=1.3     # Preprocessing, metrics, utilities
scikit-survival>=0.22 # Random Survival Forest, survival metrics

# Probabilistic CLV
lifetimes>=0.11       # BG/NBD + Gamma-Gamma
lifelines>=0.28       # Cox Proportional Hazards, Kaplan-Meier

# Explainability
shap>=0.44            # SHAP values (TreeExplainer + KernelExplainer)

# Data
pandas>=2.0
numpy>=1.24
pandera>=0.18         # Schema validation

# API
fastapi>=0.104
uvicorn>=0.24
pydantic>=2.0

# Monitoring
scipy>=1.11           # KS test for drift detection
```

---

## สรุป: ทำไมการออกแบบนี้ถึงเป็นระดับ Enterprise

| หลักการ | วิธีที่เราทำ |
|---|---|
| No data leakage | Point-in-time features + temporal split + label ที่ดูอนาคตเท่านั้น |
| Predict the future | Active customers only + forward-looking labels + survival curves |
| Uncertainty quantification | Bootstrap CI สำหรับ CLV + Quantile regression สำหรับ Credit |
| Right algorithm for the job | Survival ensemble (churn) + BG/NBD+GG (CLV) + Quantile LightGBM (credit) |
| Per-customer explanation | SHAP values + what-if analysis → "ทำไมคนนี้เสี่ยง" + "ทำอะไรได้" |
| Temporal validation | Walk-forward: train อดีต, test อนาคต → no leakage |
| Production monitoring | PSI drift detection + performance tracking + auto-retrain triggers |
| Actionable output | Priority score + recommended action + alert scheduling |
