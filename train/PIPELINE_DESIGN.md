# 1Moby Predictive Analytics — ML Pipeline Design Document

## ภาพรวมระบบ (System Overview)

Pipeline นี้รับข้อมูลจาก 1Moby (8 sheets ใน Excel) แล้วแปลงเป็น 3 ML models ที่พร้อมใช้งานกับ Web Application

```
Raw Excel/CSV → Feature Engineering → Label Creation → Train 3 Models → Export .pkl → Web API
```

---

## ข้อมูลที่ได้รับ (Data Summary)

| Sheet | Records | คำอธิบาย |
|---|---|---|
| Users+User_profile | 25,093 | ข้อมูลลูกค้า (credit, expire, status, last_access) |
| Backend_payment | 13,882 | ธุรกรรมการซื้อ 2024-2026 (4,495 ลูกค้า) |
| SMS_usage (BC/API/OTP) | ~72,760 | ปริมาณ SMS ที่ส่งรายเดือน |
| Email_usage (BC/API/OTP) | ~3,495 | ปริมาณ Email ที่ส่งรายเดือน |

สถิติสำคัญ:
- 78.2% ของลูกค้ามีเครดิต SMS เป็น 0
- มีเพียง 4,381 ลูกค้าที่เคยซื้อเครดิต (17.5%)
- ลูกค้า 39.3% ไม่เคย login, 74.8% ไม่เคยส่งข้อความ

---

## Phase 1-2: Data Preparation & Feature Engineering

### ไฟล์: `01_data_preparation.py`

รวมข้อมูลจากทุก sheet เข้าเป็น 1 ตาราง `customer_features` (1 row per acc_id) มี 58 features:

**User Features** (จาก Users table):
- `days_since_join` — อายุบัญชี (วัน)
- `days_since_last_access` — ไม่ login กี่วัน
- `days_since_last_send` — ไม่ส่งข้อความกี่วัน
- `days_until_sms_expire` — เครดิตจะหมดอายุอีกกี่วัน
- `has_sms_credit`, `sms_expired` — สถานะเครดิต

**Usage Features** (aggregate จาก 6 usage sheets):
- `total_usage`, `avg_monthly_usage` — ปริมาณใช้งานรวม
- `usage_decay_ratio` — อัตราการใช้งาน 3 เดือนล่าสุด vs 3 เดือนก่อนหน้า (สัญญาณ pre-churn)
- `usage_trend_slope` — แนวโน้มการใช้งาน (ลดลง = slope ติดลบ)
- `active_months` — จำนวนเดือนที่มีการใช้งาน

**Payment Features (RFM)** (จาก Backend_payment):
- `recency_days` — วันสุดท้ายที่ซื้อ
- `frequency` — จำนวนครั้งที่ซื้อ
- `monetary` — ยอดเงินรวม
- `avg_purchase_interval` — รอบการซื้อเฉลี่ย (วัน)
- `overdue_ratio` — เกินรอบซื้อปกติกี่เท่า (สัญญาณ churn)

---

## Phase 3: Label Creation

### ไฟล์: `02_label_creation.py`

### Model 1: Churn Label (Binary 0/1)

**นิยาม Hard Churn:**
```
Churn = 1 เมื่อ:
  - เครดิต SMS หมดอายุ (expired) + เครดิตเหลือ 0 + ไม่ซื้อใหม่ 90 วัน
  - หรือ ไม่เคยส่งข้อความเลย + ไม่มีเครดิต + สมัครมานานกว่า 180 วัน
```

**นิยาม Pre-Churn (scoring-based):**
ให้คะแนนจาก 5 สัญญาณ ถ้ารวมกัน ≥ 0.5 ถือว่า pre-churn:

| สัญญาณ | น้ำหนัก | เงื่อนไข |
|---|---|---|
| Usage Decay | 0.25 | ใช้งานลด > 50% เทียบ 3 เดือนก่อน |
| No Login | 0.25 | ไม่ login > 90 วัน |
| No Send | 0.20 | ไม่ส่งข้อความ > 90 วัน |
| Purchase Overdue | 0.20 | เกินรอบซื้อปกติ > 2 เท่า |
| Low Credit + Declining | 0.10 | เครดิตเหลือ < 1,000 + trend ลง |

ผลลัพธ์: Active 4,845 / Hard Churn 19,224 / Pre-Churn 1,024

> ⚠️ **หมายเหตุสำคัญ**: ข้อมูลมี class imbalance สูงมาก (80.7% เป็น churn) เนื่องจากลูกค้าส่วนใหญ่มีเครดิต = 0 
> สำหรับ production จริง ควรโฟกัสที่ pre-churn behavior โดย filter เฉพาะลูกค้าที่ยัง active อยู่ (มีเครดิต > 0) จะได้ model ที่ "ทำนายก่อนจะเกิด" ไม่ใช่ "บอกสิ่งที่เกิดแล้ว"

### Model 2: LTV Label + RFM Segmentation

- **LTV Target**: revenue_2025 (ใช้ข้อมูล 2024 เป็น features, 2025 เป็น target)
- **RFM**: แบ่ง Recency/Frequency/Monetary เป็น quintile (1-5) แล้วจัดกลุ่ม

RFM Segments ที่ได้:
- Champions: 742, Loyal: 856, At Risk: 421, Hibernating: 1,254, New: 122

### Model 3: Credit Consumption Label

- **Target**: `predicted_days_to_runout` = credit_sms / daily_burn_rate
- **Burn rate**: คำนวณจาก usage 3 เดือนล่าสุด / 90 วัน
- **Urgency**: Critical (≤7 วัน), Warning (≤30), Monitor (≤90), Stable (>90)

---

## Phase 4-5: Model Training & Evaluation

### ไฟล์: `03_train_evaluate_export.py`

ทั้ง 3 โมเดลใช้ **XGBoost** เป็นหลัก เพราะ:
- ทำงานได้ดีกับ tabular data
- รองรับ missing values ได้ดี
- Feature importance ชัดเจน (Explainable AI)
- ไฟล์ model เล็ก export ง่าย

### Model 1: Churn Prediction (XGBClassifier)

| Metric | Score |
|---|---|
| Accuracy | 0.9962 |
| Precision | 0.9998 |
| Recall | 0.9956 |
| F1-Score | 0.9976 |
| AUC-ROC | 0.9999 |

Top Features: `has_sms_credit` (0.58), `credit_sms` (0.11), `sms_expired` (0.10)

### Model 2: LTV Prediction (XGBRegressor)

| Metric | Score |
|---|---|
| MAE | ฿14,848 |
| RMSE | ฿108,722 |
| R² | 0.7550 |
| Median AE | ฿31 |

Target ใช้ log-transform เนื่องจาก revenue skewed มาก

### Model 3: Credit Consumption (XGBRegressor)

| Metric | Score |
|---|---|
| MAE | 7.0 วัน |
| RMSE | 15.2 วัน |
| R² | 0.9905 |
| Median AE | 2.0 วัน |

ทำนายวันที่เครดิตจะหมดได้แม่นยำมาก (คลาดเคลื่อนเฉลี่ย 7 วัน)

---

## Phase 6: Export & Web Integration

### ไฟล์ที่ได้จาก pipeline:

```
models/
├── churn_model.pkl          # โมเดล Churn (538 KB)
├── churn_scaler.pkl         # Scaler สำหรับ Churn
├── churn_model_info.json    # Features list + metrics
├── churn_evaluation.png     # ROC Curve + Confusion Matrix
├── ltv_model.pkl            # โมเดล LTV (681 KB)
├── ltv_scaler.pkl
├── ltv_model_info.json
├── ltv_evaluation.png       # Actual vs Predicted + RFM segments
├── credit_model.pkl         # โมเดล Credit (490 KB)
├── credit_scaler.pkl
├── credit_model_info.json
├── credit_evaluation.png    # Actual vs Predicted + Feature Importance
├── rfm_segments.csv         # ตาราง RFM segmentation
├── full_dataset_with_labels.csv  # Dataset พร้อม label ทั้งหมด
└── prediction_api.py        # Code สำหรับ Web API
```

### วิธีใช้งานกับ Web App:

```python
from prediction_api import PredictiveAnalytics

# โหลด models (ทำครั้งเดียวตอน server start)
analytics = PredictiveAnalytics(model_dir='models')

# เมื่อ user upload CSV:
# 1. Run feature engineering pipeline
features = build_customer_features(uploaded_data)

# 2. ทำนายทั้ง 3 models
results = analytics.predict_all(features)

# 3. ผลลัพธ์ที่ได้:
# - churn_probability (0-1)
# - churn_risk (Low/Medium/High)
# - predicted_ltv (฿)
# - predicted_days_to_runout (วัน)
# - urgency (Critical/Warning/Monitor/Stable)
# - revenue_at_risk (= LTV × churn probability)
```

---

## คำแนะนำสำหรับนักศึกษา

1. **Churn Model ที่แม่นมากเกินไป**: ตัวเลข AUC 0.9999 สูงเพราะ label มาจาก features เดียวกัน (credit=0 → churn=1) สำหรับ demo ดีแล้ว แต่ถ้าจะทำให้ดีขึ้น ควร:
   - Filter เฉพาะ active customers (มีเครดิต > 0) แล้ว predict ว่าจะ churn ใน 3-6 เดือนข้างหน้า
   - ใช้ time-based split (train บน 2024, predict 2025) แทน random split

2. **LTV Model**: R² = 0.755 ถือว่าดี ปรับปรุงได้โดย:
   - เพิ่ม features เช่น industry/segment ของลูกค้า (ถ้ามี)
   - ลอง ensemble กับ LightGBM

3. **Credit Model**: R² = 0.99 แม่นมากอยู่แล้ว เหมาะกับ production ได้เลย

4. **Web App**: ใช้ `prediction_api.py` เป็น backend + React frontend ตามที่โจทย์ระบุ
