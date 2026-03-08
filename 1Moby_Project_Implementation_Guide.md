# 1Moby - Predictive Customer Analytics System
## ระบบวิเคราะห์ข้อมูลลูกค้าเชิงคาดการณ์
### Project Implementation Guide - เอกสารแนวทางการพัฒนาโครงการฉบับสมบูรณ์

**บริษัท:** 1Moby Co., Ltd.
**ธุรกิจ:** Thaibulksms / Thaibulkmail (Credit Base - Pay-Per-Use)
**Data:** Users 10,000 records | Payments ~42,000 transactions (2020-2025)
**ระยะเวลา:** ม.ค. 2569 - ธ.ค. 2569

---

## สารบัญ

1. [Project Overview](#1-project-overview)
2. [Model 1: Churn Prediction](#2-model-1-churn-prediction)
3. [Model 2: Customer LTV + RFM Segmentation](#3-model-2-customer-ltv--rfm-segmentation)
4. [Model 3: Cross-Sell Recommendation](#4-model-3-cross-sell-recommendation)
5. [Model เสริม: Credit Consumption Prediction](#5-model-เสริม-credit-consumption-prediction)
6. [Web Application (Next.js + FastAPI)](#6-web-application-nextjs--fastapi)
7. [AI Chatbot (RAG + Qwen 3.5 Local)](#7-ai-chatbot-rag--qwen-35-local)
8. [Deliverables สรุป](#8-deliverables-สรุป)
9. [Project Folder Structure](#9-project-folder-structure)
10. [Timeline การพัฒนา](#10-timeline-การพัฒนา)
11. [ลำดับการพัฒนาแนะนำ](#11-ลำดับการพัฒนาแนะนำ)
12. [Libraries ที่ต้องใช้](#12-libraries-ที่ต้องใช้)

---

## 1. Project Overview

### Business Context

โมเดลธุรกิจเป็นแบบ Credit Base หมายความว่าลูกค้าไม่มี subscription รายเดือน แต่ซื้อเครดิตเป็นก้อนแล้วใช้ส่ง SMS/Email ไปเรื่อยๆ เครดิตมีวันหมดอายุ ถ้าลูกค้าไม่ซื้อใหม่หลังหมดอายุ ถือว่า churn

การ define churn จึงต่างจาก subscription business ทั่วไป เพราะไม่มี "ยกเลิก subscription" ชัดเจน ต้องดูจากพฤติกรรมการใช้งานและการซื้อเครดิต

### Models ที่ต้องพัฒนาทั้งหมด

| Model | ประเภท | เป้าหมาย | ผู้ใช้งานหลัก |
|-------|--------|----------|--------------|
| Churn Prediction | Classification | ระบุลูกค้าที่มีแนวโน้ม churn ก่อนที่จะ churn จริง | Marketing, Sales |
| Customer LTV + RFM | Regression + Segmentation | ประเมินมูลค่าลูกค้าและจัดกลุ่มตามพฤติกรรม | Sales, BD |
| Cross-Sell Recommendation | Recommendation | แนะนำผลิตภัณฑ์เพิ่มเติมจากพฤติกรรมการซื้อ | Sales, Marketing |
| AI Chatbot (เสริม) | RAG + LLM | ถามตอบข้อมูลลูกค้าเป็นภาษาธรรมชาติ | ทุกทีม |

### Data ที่มีให้

- **Sample Users:** 10,000 records - ข้อมูลพื้นฐานลูกค้า, วันที่สมัคร, การเข้าใช้งานล่าสุด (last_access, last_send)
- **Sample Payment:** ~42,000 transactions (ปี 2020-2025) - ประวัติการซื้อเครดิต, วันหมดอายุ, จำนวนเงิน

### Tech Stack ภาพรวม

| Layer | Technology | หมายเหตุ |
|-------|-----------|---------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui | Web Application Prototype |
| Backend API | FastAPI (Python) | Serve model + RAG pipeline |
| ML Training | Python + scikit-learn + XGBoost + SHAP | Train และ export model |
| LLM (Chatbot) | Qwen 3.5 9B ผ่าน Ollama (Local) | ไม่ต้องใช้ internet |
| Embedding | nomic-embed-text หรือ bge-m3 ผ่าน Ollama | สำหรับ RAG |
| Vector DB | ChromaDB | Lightweight, in-process Python |
| Charts | Recharts หรือ Chart.js | Dashboard visualization |

### System Architecture ภาพรวม

```
[CSV Data] → [Train Model] → [model.pkl files]
                                      ↓
[Next.js Frontend] ←→ [FastAPI Backend] ←→ [Model Inference]
        ↓                      ↓
  [Dashboard UI]        [RAG Pipeline]
  [Upload CSV]          [ChromaDB + Qwen 3.5 Local (Ollama)]
  [Chat Interface]
```

---

## 2. Model 1: Churn Prediction

**เป้าหมาย:** พัฒนาแบบจำลองที่สามารถระบุกลุ่มลูกค้าที่มีแนวโน้มจะยกเลิกการใช้บริการ ก่อนที่จะ churn จริง เพื่อให้ฝ่ายขาย/การตลาดเข้าไปดูแลได้ทันท่วงที

### 2.1 Churn Definition (สำคัญมาก)

**บริษัทไม่ได้ให้ Label Churn (0/1) มาสำเร็จรูป** ต้องสร้าง Label เอง (Label Engineering) จากพฤติกรรมลูกค้า

#### Baseline Definition

Churn = เครดิตที่สั่งซื้อไว้หมดอายุ (Expired) หรือเครดิตคงเหลือเป็นศูนย์ ทำให้ลูกค้าไม่สามารถส่งข้อความได้อีก และไม่มีการสั่งซื้อใหม่

#### Pre-Churn Definition (ต้อง Investigate เพิ่ม)

เนื่องจากเป้าหมายคือ Predict ก่อนเกิดขึ้น ถ้ารอให้เครดิตหมดก่อนแล้วค่อยบอกว่า Churn สายเกินไป ต้องหาสัญญาณเตือนล่วงหน้า:

- **Usage Decay** - อัตราการใช้งานที่ลดลง: ลูกค้าเข้าใช้งานระบบน้อยลง (ดูจาก last_access) หรือส่งข้อความน้อยลงผิดปกติ (ดูจาก last_send)
- **Recency** - ระยะเวลาห่างจากการซื้อครั้งล่าสุด: ลูกค้าไม่เติมเครดิตใหม่ภายในระยะเวลาที่ควรจะเป็น เมื่อเทียบกับรอบการเติมเงินในอดีต (ดูจาก payment_date)

#### แนวทาง Label Engineering

วิธีสร้าง label สำหรับ Credit Base Business:

1. คำนวณ average purchase cycle ของลูกค้าแต่ละคน (เช่น ปกติซื้อทุก 30 วัน)
2. ถ้าเลย cycle ไป X เท่า (เช่น 2 เท่า = 60 วัน) โดยไม่ซื้อ + เครดิตเหลือน้อยหรือหมด = Churn
3. ใช้ observation window (เช่น 6 เดือน) เพื่อดูพฤติกรรม และ prediction window (เช่น 3 เดือน) เพื่อดูว่า churn หรือไม่
4. ลูกค้าที่อยู่ในช่วง Pre-Churn (usage decay แต่ยังไม่ churn) สามารถใช้เป็น positive class ได้เช่นกัน

### 2.2 Step 1: Data Preparation

#### 2.2.1 EDA (Exploratory Data Analysis)

**เครื่องมือ:** pandas, matplotlib, seaborn

- ตรวจสอบ missing values ใน Users และ Payment data
- ดู distribution ของ features ต่างๆ เช่น tenure, payment amount, frequency
- วิเคราะห์ correlation matrix ระหว่าง features
- ดู class distribution ของ churn vs non-churn (หลังสร้าง label)
- ดู pattern การซื้อเครดิต (seasonality, frequency)
- ระบุ outliers ที่อาจต้อง handle

#### 2.2.2 Data Cleaning

- Handle missing values: ใช้ median imputation สำหรับ numerical, mode สำหรับ categorical
- ตรวจสอบ data types: แปลง date columns ให้เป็น datetime
- ลบ duplicates ถ้ามี
- Handle outliers: ใช้ IQR method หรือ capping

#### 2.2.3 Feature Engineering (สร้าง Features จาก Raw Data)

ต้องแปลง Transaction Logs ให้เป็น Features ที่ Model ใช้ได้:

| Feature Name | คำอธิบาย | คำนวณจาก |
|-------------|----------|---------|
| tenure_days | จำนวนวันตั้งแต่สมัคร | วันปัจจุบัน - วันสมัคร |
| recency_days | จำนวนวันตั้งแต่ซื้อเครดิตครั้งสุดท้าย | วันปัจจุบัน - last payment_date |
| frequency | จำนวนครั้งที่ซื้อเครดิต | count(payment transactions) |
| monetary_total | ยอดเงินรวมที่ซื้อเครดิตทั้งหมด | sum(payment amount) |
| avg_purchase_amount | ยอดซื้อเฉลี่ยต่อครั้ง | monetary_total / frequency |
| avg_purchase_cycle | รอบการซื้อเฉลี่ย (วัน) | mean(diff between payment_dates) |
| days_since_last_access | วันที่ไม่เข้าใช้งาน | วันปัจจุบัน - last_access |
| days_since_last_send | วันที่ไม่ส่งข้อความ | วันปัจจุบัน - last_send |
| usage_decay_rate | อัตราการใช้งานที่ลดลง | เปรียบเทียบ usage 3 เดือนหลัง vs 3 เดือนแรก |
| credit_remaining | เครดิตคงเหลือ | จาก user data |
| credit_utilization | อัตราการใช้เครดิต | used / total purchased |
| burn_rate | อัตราการใช้เครดิตต่อวัน | credits used / active days |
| days_to_expiry | วันที่เหลือก่อนเครดิตหมดอายุ | expiry_date - วันปัจจุบัน |
| purchase_trend | แนวโน้มการซื้อ (เพิ่ม/ลด/คงที่) | slope ของ purchase amounts over time |

#### 2.2.4 Data Preprocessing

- Encode categorical features: ใช้ LabelEncoder สำหรับ ordinal, OneHotEncoder สำหรับ nominal
- Scale numerical features: ใช้ StandardScaler หรือ MinMaxScaler
- Handle class imbalance: ใช้ SMOTE (Synthetic Minority Oversampling Technique) จาก imbalanced-learn เพราะ churn data มักจะ imbalanced มาก
- Train/Test Split: แบ่ง 80/20 ด้วย train_test_split (stratified split เพื่อรักษาสัดส่วน churn)

### 2.3 Step 2: Model Training

#### 2.3.1 Algorithm ที่ใช้

เทรนหลาย algorithm แล้วเลือกตัวที่ดีที่สุด:

| Algorithm | Library | เหตุผลที่เลือก | ข้อดี |
|-----------|---------|---------------|------|
| **XGBoost (แนะนำหลัก)** | xgboost | แม่นที่สุดสำหรับ tabular data | มี feature importance ในตัว, รองรับ SHAP |
| LightGBM | lightgbm | เร็วกว่า XGBoost ผลใกล้เคียง | เหมาะถ้า data ใหญ่มาก |
| Random Forest | scikit-learn | ไม่ overfit ง่าย | เข้าใจง่าย อธิบายได้ |
| Logistic Regression | scikit-learn | ใช้เป็น baseline | เปรียบเทียบกับ model อื่น |

#### 2.3.2 Hyperparameter Tuning

ใช้ GridSearchCV หรือ RandomizedSearchCV จาก scikit-learn หรือ Optuna:

- XGBoost parameters: n_estimators, max_depth, learning_rate, subsample, colsample_bytree, scale_pos_weight (สำหรับ imbalanced data)
- ใช้ Cross-Validation (5-fold Stratified) เพื่อหา best parameters
- ระวัง overfitting: ดู gap ระหว่าง train score กับ validation score

#### 2.3.3 SHAP (Explainable AI) - สำคัญมาก

โจทย์ต้องการ Feature Importance + อธิบายเหตุผลของแต่ละลูกค้าได้ (Explainable AI):

- **Global Feature Importance:** feature ไหนมีผลต่อ churn มากที่สุดในภาพรวม
- **Local Explanation:** อธิบายรายบุคคลว่า ลูกค้าคนนี้ feature ไหนดัน churn probability ขึ้น/ลง
- ใช้ `shap.TreeExplainer` สำหรับ XGBoost/LightGBM/Random Forest
- Export SHAP explainer เก็บไว้ใช้ตอน prediction ด้วย

### 2.4 Step 3: Model Evaluation

ตามโจทย์ต้องมี metrics เหล่านี้ครบ:

| Metric | คำอธิบาย | ทำไมสำคัญ |
|--------|----------|----------|
| Confusion Matrix | แสดง TP, TN, FP, FN | เห็นภาพรวมว่า model พลาดตรงไหน |
| Accuracy | สัดส่วนที่ทำนายถูก | ดูภาพรวม (แต่ไม่เพียงพอถ้า imbalanced) |
| Precision | จากที่ทำนายว่า churn ถูกจริงกี่ % | ลด false alarm ให้ Sales |
| Recall | จาก churn จริง ทำนายถูกกี่ % | ไม่พลาดลูกค้าที่จะ churn |
| F1-Score | Harmonic mean ของ Precision + Recall | Balance ระหว่าง Precision กับ Recall |
| ROC Curve + AUC | วัดความสามารถแยก class | ยิ่งใกล้ 1 ยิ่งดี |

### 2.5 Step 4: Export Model Files

ไฟล์ที่ต้อง export ออกมา (format: .pkl หรือ .h5):

| ไฟล์ | คำอธิบาย | ใช้ตอนไหน |
|------|----------|----------|
| churn_model.pkl | XGBoost model ที่เทรนแล้ว | Prediction |
| scaler.pkl | StandardScaler/MinMaxScaler | Transform data ก่อน predict |
| encoder.pkl | LabelEncoder/OneHotEncoder | Encode categorical features |
| shap_explainer.pkl | SHAP TreeExplainer | อธิบาย prediction รายบุคคล |
| feature_names.json | รายชื่อ features ที่ model ใช้ | Validate input data |
| requirements.txt | Library versions ที่ใช้ | Reproduce environment |

Library หลักที่ต้องบันทึก version: pandas, scikit-learn, xgboost, shap, imbalanced-learn, numpy

---

## 3. Model 2: Customer LTV + RFM Segmentation

**เป้าหมาย:** พยากรณ์รายรับในอนาคตจากลูกค้าแต่ละราย และจัดกลุ่มลูกค้าตามพฤติกรรมการซื้อ เพื่อให้ Sales จัดลำดับความสำคัญและดูแลลูกค้าได้เหมาะสม

### 3.1 RFM Segmentation

RFM เป็นวิธีจัดกลุ่มลูกค้าตามพฤติกรรม 3 มิติ:

| มิติ | คำอธิบาย | คำนวณจาก |
|-----|----------|---------|
| Recency (R) | ซื้อครั้งสุดท้ายเมื่อไหร่ | วันปัจจุบัน - last payment_date |
| Frequency (F) | ซื้อบ่อยแค่ไหน | จำนวนครั้งที่ซื้อเครดิตใน observation period |
| Monetary (M) | ใช้จ่ายเท่าไหร่ | ยอดเงินรวมที่ซื้อเครดิตใน observation period |

#### วิธีทำ RFM

1. คำนวณค่า R, F, M ของลูกค้าแต่ละคนจาก Payment data
2. แบ่ง Score 1-5 ด้วย quantile (quintile) สำหรับแต่ละมิติ
3. รวม RFM Score เพื่อจัดกลุ่ม เช่น Champions (555), Loyal (X4X-X5X), At Risk (Low R + High F,M), Hibernating (Low ทุกมิติ)
4. สร้าง segment labels อัตโนมัติตาม business rules

#### RFM Segments ที่โจทย์ต้องการ

| Segment | ลักษณะ | กลยุทธ์ที่แนะนำ |
|---------|--------|---------------|
| Champions | ซื้อบ่อย ใช้จ่ายเยอะ เพิ่งซื้อ | ดูแลเป็นพิเศษ VIP |
| Loyal Customers | ซื้อบ่อย ใช้จ่ายดี | Upsell, Cross-sell |
| At Risk | เคยซื้อเยอะ แต่เงียบหายนาน | Retention campaign เร่งด่วน |
| Hibernating | ไม่ซื้อนาน ไม่ค่อยใช้จ่าย | Win-back campaign หรือปล่อย |
| New Customers | เพิ่งสมัคร ยังซื้อน้อย | Onboarding, สร้าง engagement |

### 3.2 LTV Prediction

LTV = มูลค่าตลอดอายุการใช้งานของลูกค้า ใช้ predict ว่าลูกค้าคนนี้จะสร้างรายได้ให้บริษัทอีกเท่าไหร่

#### แนวทางการพัฒนา LTV Model

- **Approach 1 (แนะนำ): BG/NBD + Gamma-Gamma Model** - ใช้ library `lifetimes` ของ Python, เหมาะกับ non-contractual business (เช่น Credit Base), BG/NBD ทำนายจำนวนครั้งซื้อในอนาคต + Gamma-Gamma ทำนายมูลค่าต่อครั้ง
- **Approach 2: Regression Model** - ใช้ XGBoost Regressor หรือ Linear Regression ทำนาย total revenue ในอนาคต X เดือน, สร้าง features เหมือน Churn model แล้วเปลี่ยน target เป็น monetary
- **Approach 3: Simple Formula** - LTV = Avg Purchase Value x Purchase Frequency x Avg Customer Lifespan, เหมาะเป็น baseline เปรียบเทียบ

### 3.3 Output ที่ต้องส่งมอบ

- LTV Score ของลูกค้าแต่ละราย (฿)
- RFM Segment ของลูกค้าแต่ละราย
- Model file (.pkl) พร้อมเอกสารกำกับ
- Performance metrics (MAE, RMSE, R-squared สำหรับ LTV regression)

---

## 4. Model 3: Cross-Sell Recommendation

**เป้าหมาย:** วิเคราะห์พฤติกรรมการซื้อในอดีตเพื่อคาดการณ์โอกาสในการซื้อสินค้าหรือบริการอื่นเพิ่มเติม เช่น ลูกค้าที่ใช้ SMS อาจสนใจ Email service หรือ package ที่ใหญ่กว่า

### 4.1 แนวทางพัฒนา

- **Approach 1: Association Rule Mining** - ใช้ Apriori algorithm หรือ FP-Growth จาก mlxtend เพื่อหา product associations, เหมาะถ้ามี product catalog หลายรายการ
- **Approach 2: Collaborative Filtering** - ใช้ User-based หรือ Item-based similarity, ลูกค้าที่คล้ายกันมักซื้ออะไรเหมือนกัน
- **Approach 3: Classification-based** - สร้าง binary classification ว่าลูกค้าคนนี้จะซื้อ product X หรือไม่, ใช้ features เหมือน Churn model + RFM features

### 4.2 Output ที่ต้องส่งมอบ

- Recommended Products/Packages สำหรับลูกค้าแต่ละราย
- Probability Score ของการซื้อแต่ละ product
- Model file (.pkl) พร้อมเอกสาร

---

## 5. Model เสริม: Credit Consumption Prediction

โจทย์ต้องการให้วิเคราะห์อัตราการใช้เครดิต (Burn Rate) และทำนายวันที่เครดิตจะหมดอายุ (Run-out Date) เพื่อให้ Sales ติดต่อลูกค้าก่อนเครดิตหมด

### 5.1 สิ่งที่ต้องทำ

- คำนวณ Burn Rate (Average credit usage per day) ของลูกค้าแต่ละราย
- Predict Run-out Date = credit remaining / burn rate
- แจ้งเตือนล่วงหน้าหากเครดิตจะหมดภายใน X วัน
- Predict Re-order Value: ประมาณยอดเงินที่ลูกค้าจะซื้อรอบถัดไป จาก historical pattern
- สามารถใช้ Time Series model (เช่น Prophet, ARIMA) หรือ Simple Moving Average ก็ได้

### 5.2 Output ที่แสดง Dashboard (Urgent Top-up List)

| Column | คำอธิบาย |
|--------|----------|
| Customer ID | รหัสลูกค้า |
| Current Credit | เครดิตคงเหลือ |
| Burn Rate (Avg/Day) | อัตราการใช้เครดิตเฉลี่ยต่อวัน |
| Predicted Run-out Date | วันที่คาดว่าเครดิตจะหมด |
| Days Left | จำนวนวันที่เหลือ |
| Predicted Re-order Value | ยอดเงินที่คาดว่าจะซื้อ |
| Status | Critical / Warning / Normal |
| Action | Call to Top-up / Send Reminder |

---

## 6. Web Application (Next.js + FastAPI)

เป็น Frontend Prototype ในรูปแบบ Web Application ให้ผู้ใช้ upload ข้อมูล ดู Dashboard และใช้ AI Chatbot

### 6.1 System Architecture

```
┌─────────────────────────────────────────┐
│           Next.js Frontend              │
│                                         │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │Dashboard │ │Upload CSV│ │ Chat UI │ │
│  │ Charts   │ │ + Predict│ │ (RAG)   │ │
│  └────┬─────┘ └────┬─────┘ └────┬────┘ │
│       │             │            │       │
└───────┼─────────────┼────────────┼───────┘
        │             │            │
        ▼             ▼            ▼
┌─────────────────────────────────────────┐
│           FastAPI Backend               │
│                                         │
│  /api/upload     → รับ CSV/Excel        │
│  /api/predict/*  → รับ data, return ผล  │
│  /api/dashboard  → สรุปสถิติ            │
│  /api/explain    → SHAP explanation     │
│  /api/chat       → RAG + Qwen 3.5      │
│  /api/export     → Export CSV/Excel     │
│                                         │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │Model.pkl │ │ChromaDB  │ │Qwen 3.5 │ │
│  │SHAP.pkl  │ │(Vectors) │ │(Ollama) │ │
│  └──────────┘ └──────────┘ └─────────┘ │
└─────────────────────────────────────────┘
```

Frontend (Next.js) สื่อสารกับ Backend (FastAPI) ผ่าน REST API โดย Backend จะ load model files (.pkl) เพื่อทำ prediction และเชื่อมต่อกับ Ollama สำหรับ AI Chatbot

### 6.2 Backend API Endpoints (FastAPI)

#### Module 1: Data Ingestion

| Endpoint | Method | คำอธิบาย | Input | Output |
|----------|--------|----------|-------|--------|
| /api/upload | POST | Upload CSV/Excel file | File (CSV/XLSX) | upload_id, preview data, validation results |
| /api/validate | POST | Validate uploaded data | upload_id | validation report (missing, format errors) |
| /api/preprocess | POST | Feature engineering อัตโนมัติ | upload_id | processed data ready for model |

Data Validation ต้องตรวจสอบ:
- Date format ถูกต้อง
- Missing values แจ้งเตือน
- Column names ตรงกับที่ model ต้องการ
- Data types ถูกต้อง

#### Module 2: Prediction

| Endpoint | Method | คำอธิบาย | Input | Output |
|----------|--------|----------|-------|--------|
| /api/predict/churn | POST | Predict churn probability | processed data | customer_id, churn_prob, risk_level, top_factors |
| /api/predict/ltv | POST | Predict LTV + RFM | processed data | customer_id, ltv_score, rfm_segment |
| /api/predict/credit | POST | Predict credit run-out | processed data | customer_id, burn_rate, run_out_date, days_left |
| /api/predict/crosssell | POST | Cross-sell recommendation | processed data | customer_id, recommended_products, probability |
| /api/explain/{customer_id} | GET | SHAP explanation | customer_id | top_features, shap_values, waterfall_data |

#### Module 3: Dashboard Data

| Endpoint | Method | คำอธิบาย |
|----------|--------|----------|
| /api/dashboard/summary | GET | สรุปภาพรวม: total customers, churn count, churn rate, revenue at risk |
| /api/dashboard/risk-distribution | GET | สัดส่วน High/Medium/Low risk |
| /api/dashboard/top-churn | GET | รายชื่อลูกค้าเสี่ยง churn สูงสุด |
| /api/dashboard/top-topup | GET | รายชื่อลูกค้าที่ต้องเติมเครดิตเร่งด่วน |
| /api/customer/{id} | GET | Customer 360 Profile |

#### Module 4: Export

| Endpoint | Method | คำอธิบาย |
|----------|--------|----------|
| /api/export/churn-list | GET | Export รายชื่อลูกค้า churn เป็น CSV/Excel |
| /api/export/topup-list | GET | Export รายชื่อลูกค้า top-up เป็น CSV/Excel |
| /api/metrics | GET | Model performance metrics (Accuracy, F1, AUC) |

### 6.3 Frontend Pages (Next.js)

#### หน้า 1: Overview Dashboard

**Zone 1 - Executive Summary:**
- Total Revenue at Risk (฿): มูลค่ารายได้ที่เสี่ยงสูญเสีย (คำนวณจาก LTV ของลูกค้าที่ Churn Score สูง)
- Upcoming Top-up Opportunity (฿): มูลค่าโอกาสการขายเติมเงินใน X วันข้างหน้า
- Summary Cards: Total Customers, Churn Rate, Avg LTV, Active Customers

**Zone 2 - Charts:**
- Churn Risk Distribution (Pie Chart: High/Medium/Low)
- RFM Segment Distribution (Bar Chart)
- Credit Status Overview (Gauge Chart)
- Top Feature Importance (Horizontal Bar Chart)

#### หน้า 2: Upload & Predict

- Drag & Drop file upload (CSV, Excel)
- Data validation results display + แจ้งเตือน errors
- Preview data ก่อน predict (Table with pagination)
- ปุ่ม Predict → แสดงผลเป็น Table พร้อม color-coded risk level
- Filter/Sort by risk level, segment, score
- Export ผลลัพธ์เป็น CSV/Excel

#### หน้า 3: Retention Alert List

ตาราง B จากโจทย์ แสดงลูกค้าเสี่ยง churn:

| Column | คำอธิบาย |
|--------|----------|
| Customer ID | รหัสลูกค้า |
| Churn Probability (0-1) | คะแนนความเสี่ยง |
| LTV Value | มูลค่าลูกค้า X เดือน |
| RFM Segment | กลุ่มพฤติกรรม |
| Risk Factor | เหตุผลหลักจาก SHAP |
| Recommended Action | คำแนะนำสำหรับ Sales/MKT |

#### หน้า 4: Urgent Top-up List

ตาราง A จากโจทย์ แสดงลูกค้าที่เครดิตใกล้หมด (ดู columns ใน Section 5.2)

#### หน้า 5: Customer 360 Profile

คลิกที่ลูกค้าแต่ละคนจะเห็น 3 sections:

1. **Section 1: Consumption Insight (Credit Prediction)** - สถานะเครดิต (Critical/Warning/Normal), วันหมดอายุที่คาดการณ์, กราฟเส้นการใช้เครดิตย้อนหลัง 3 เดือน, เส้นประแสดงการทำนายอนาคต 1 เดือน (Forecast), Alert Message
2. **Section 2: Engagement Health (Churn + RFM)** - RFM Segment (เช่น "At Risk"), Churn Risk Score (เช่น 85%), Key Reason จาก Explainable AI/SHAP (เช่น "ลูกค้าเปิดอ่าน Email น้อยลง 50% ในเดือนที่ผ่านมา")
3. **Section 3: Value Prediction (LTV)** - Historical Revenue (Last Year), Predicted Revenue (Next Year), Customer Tier (เช่น Platinum - Top 5%)

#### หน้า 6: AI Chat (Chatbot)

Chat interface สำหรับถามตอบข้อมูลลูกค้า (รายละเอียดใน Section 7)

#### หน้า 7: Model Performance (Admin)

- แสดง Accuracy, Precision, Recall, F1-Score, ROC-AUC ของแต่ละ model
- Confusion Matrix visualization
- สำหรับ Technical team ตรวจสอบความน่าเชื่อถือ

---

## 7. AI Chatbot (RAG + Qwen 3.5 Local)

ส่วนเสริมที่เพิ่มเข้ามา เป็น AI Chatbot ที่สามารถถามตอบข้อมูลลูกค้าภายในองค์กรได้ ใช้ RAG (Retrieval-Augmented Generation) ร่วมกับ Qwen 3.5 9B ที่ run บนเครื่อง local ผ่าน Ollama

### 7.1 ทำไมต้อง RAG

Qwen 3.5 ไม่รู้จักข้อมูลลูกค้าของ 1Moby ดังนั้นต้อง inject ข้อมูลเข้าไปใน context ก่อนถาม **Chatbot ไม่ได้ predict churn เอง** แต่อ่านผลที่ Model เรา predict ไว้แล้ว แล้วอธิบายเป็นภาษาคนให้ ทำให้ Chat ตรงกับ Prediction 100%

### 7.2 Tech Stack

| Component | Technology | หมายเหตุ |
|-----------|-----------|---------|
| LLM | Qwen 3.5 9B ผ่าน Ollama | Run local, ไม่ต้อง internet, API ที่ localhost:11434 |
| Embedding Model | nomic-embed-text หรือ bge-m3 ผ่าน Ollama | แปลง text เป็น vector |
| Vector Database | ChromaDB | Lightweight, run in-process กับ Python |
| Orchestration | LangChain หรือเขียน pipeline เอง | จัดการ flow RAG |

### 7.3 RAG Pipeline (ละเอียด)

```
[User Question]
       ↓
[1. Embed Question] → nomic-embed-text → vector
       ↓
[2. Search ChromaDB] → ได้ relevant documents
       ↓
[3. Build Prompt] → System Prompt + Context + Question
       ↓
[4. Send to Qwen 3.5] → localhost:11434
       ↓
[Response to User]
```

#### Step 1: Data Ingestion เข้า ChromaDB

ทุกครั้งที่ user upload CSV ใหม่และ predict เสร็จ ต้อง ingest data เข้า ChromaDB โดยสร้าง 3 ชั้นข้อมูล:

**ชั้นที่ 1: Customer Profiles** - สร้าง document สำหรับลูกค้าแต่ละคน โดยรวมข้อมูลพื้นฐาน + ผล predict ทุก model + SHAP explanation เข้าด้วยกัน

ตัวอย่าง document:
```
ลูกค้า ID: 10
ชื่อ: สมชาย
อายุการใช้งาน: 3 เดือน
ค่าบริการ: 1,500 บาท/เดือน
สัญญา: รายเดือน
จำนวนร้องเรียน: 5 ครั้ง
Churn Probability: 89%
Risk Level: High
LTV: ฿50,000
RFM Segment: At Risk
Top Churn Factors (จาก SHAP):
  1) สัญญารายเดือน (+0.25)
  2) ร้องเรียนบ่อย (+0.20)
  3) ใช้งานน้อย (+0.15)
เครดิตคงเหลือ: 500
Burn Rate: 100/วัน
คาดว่าเครดิตหมด: 5 วัน
```

**ชั้นที่ 2: Aggregated Insights** - สรุปภาพรวมทั้ง portfolio เช่น จำนวนลูกค้าทั้งหมด, churn rate, revenue at risk, top factors รวม, จำนวนลูกค้าแต่ละ segment

**ชั้นที่ 3: Business Rules / Retention Strategies** - กลยุทธ์การรักษาลูกค้าตาม segment เช่น สำหรับ At Risk แนะนำให้เสนอส่วนลด, สำหรับ Champions แนะนำ Upsell

#### จุดสำคัญ: ข้อมูลทุกอย่างมาจาก Model โดยตรง

```
Model Predict → สร้าง Document → ยัดเข้า ChromaDB
                                        ↓
User ถาม → RAG ดึง Document → Qwen อ่าน Document → ตอบ
```

Chatbot ไม่ได้ predict เอง มันแค่เป็น "ปากของ model" ที่อธิบายผลให้คนเข้าใจ ถ้า pipeline ทำถูก มันจะไม่มีทางขัดแย้งกับ Dashboard

#### Step 2: Query Processing

เมื่อ user ถามคำถาม:

1. รับ user question (เช่น: "ลูกค้าคนที่ 10 ทำไมถึง churn สูง?")
2. Embed question ด้วย nomic-embed-text → ได้ vector
3. Search ChromaDB ด้วย vector → ได้ relevant documents (customer profile, insights, strategies)
4. รวม documents เป็น context + question เป็น prompt
5. ส่งให้ Qwen 3.5 ตอบโดยอิงจาก context เท่านั้น

#### Step 3: Prompt Engineering

System Prompt ที่ใช้ (สำคัญมาก):

```
System: คุณคือผู้เชี่ยวชาญด้านการวิเคราะห์ลูกค้าของ 1Moby
ตอบคำถามโดยอิงจากข้อมูลด้านล่างเท่านั้น
ห้ามคิดเอง ห้ามเดา
ถ้าไม่มีข้อมูลให้ตอบว่า "ไม่พบข้อมูลในระบบ"
ให้ตอบเป็นภาษาไทย ใช้ตัวเลขและข้อเท็จจริงจาก context

Context: {retrieved_documents}

User: {user_question}
```

#### Step 4: Re-sync เมื่อ Predict ใหม่

ทุกครั้งที่ upload CSV ใหม่แล้ว predict:
1. ลบ data เก่าใน ChromaDB ทิ้ง
2. Ingest ผล predict ใหม่เข้าไป
3. Chatbot จะตอบตามผลใหม่เสมอ

### 7.4 ตัวอย่างคำถามที่ Chatbot ตอบได้

| คำถาม | Chatbot ทำอะไร | ตอบจากอะไร |
|-------|--------------|-----------|
| "ลูกค้า ID 10 ทำไม churn สูง?" | ค้น customer profile ID 10 + SHAP | Customer Profile document |
| "ลูกค้าคนไหนควรโทรหาก่อน?" | ค้น top churn + high LTV | Aggregated Insights |
| "ลูกค้า ID 10 ควรรักษาไว้ยังไง?" | ค้น retention strategy ตาม segment | Business Rules + Profile |
| "สรุปภาพรวม churn ตอนนี้เป็นยังไง?" | ค้น aggregated data | Aggregated Insights |
| "ลูกค้ากลุ่ม At Risk มีกี่คน?" | ค้น RFM segment data | Aggregated Insights |

### 7.5 Setup Ollama

```bash
# ติดตั้ง Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull Qwen 3.5 9B
ollama pull qwen3:8b

# Pull Embedding Model
ollama pull nomic-embed-text

# ทดสอบ
ollama run qwen3:8b "สวัสดี"

# Ollama จะ serve API ที่ http://localhost:11434
# FastAPI backend เรียก API ตรงนี้ ไม่ต้องออก internet
```

### 7.6 Backend Endpoints สำหรับ Chat

| Endpoint | Method | คำอธิบาย | Input | Output |
|----------|--------|----------|-------|--------|
| /api/chat | POST | ส่งข้อความถาม chatbot | message (string), session_id | response (string), sources (list) |
| /api/chat/ingest | POST | Ingest prediction results เข้า ChromaDB | prediction_results | status, document_count |
| /api/chat/clear | DELETE | ลบข้อมูลเก่าใน ChromaDB | - | status |

---

## 8. Deliverables สรุป

### Mandatory Deliverables

| รายการ | รายละเอียด | Format |
|--------|-----------|--------|
| Churn Model | XGBoost model ที่ train + validate แล้ว | .pkl |
| LTV Model | BG/NBD + Gamma-Gamma หรือ XGBoost Regressor | .pkl |
| Cross-Sell Model | Recommendation model | .pkl |
| Scalers + Encoders | Data transformation objects | .pkl |
| SHAP Explainer | สำหรับ Explainable AI | .pkl |
| Performance Report | Metrics ครบทุก model (Confusion Matrix, Precision, Accuracy, Recall, F1, ROC-AUC) | .pdf หรือ .docx |
| Technical Documentation | แนวคิด, architecture, algorithms, เหตุผล | .pdf หรือ .docx |
| Usage Guide | คู่มือ Input/Output ของ model | .pdf หรือ .docx |
| requirements.txt | Library versions | .txt |

### Optional Deliverables

| รายการ | รายละเอียด |
|--------|-----------|
| Web Application (Next.js) | Frontend Prototype: Upload, Dashboard, Customer 360, Export |
| FastAPI Backend | API endpoints สำหรับ prediction, dashboard, export |
| AI Chatbot | RAG pipeline + Qwen 3.5 local สำหรับถามตอบข้อมูลลูกค้า |

---

## 9. Project Folder Structure

```
churn-prediction-1moby/
├── model-training/                    ← ทุกอย่างเกี่ยวกับการ train model
│   ├── data/
│   │   ├── raw/                       ← raw CSV files จาก 1Moby
│   │   ├── processed/                 ← cleaned + featured data
│   │   └── labels/                    ← churn labels ที่สร้างเอง
│   ├── notebooks/
│   │   ├── 01_eda.ipynb               ← Exploratory Data Analysis
│   │   ├── 02_label_engineering.ipynb  ← สร้าง Churn Label
│   │   ├── 03_feature_engineering.ipynb← สร้าง Features
│   │   ├── 04_churn_model.ipynb       ← Train Churn Model
│   │   ├── 05_ltv_rfm_model.ipynb     ← Train LTV + RFM
│   │   ├── 06_crosssell_model.ipynb   ← Train Cross-Sell
│   │   └── 07_credit_prediction.ipynb ← Credit Consumption
│   ├── models/                        ← exported .pkl files ทั้งหมด
│   │   ├── churn_model.pkl
│   │   ├── ltv_model.pkl
│   │   ├── crosssell_model.pkl
│   │   ├── scaler.pkl
│   │   ├── encoder.pkl
│   │   ├── shap_explainer.pkl
│   │   └── feature_names.json
│   ├── reports/                       ← model performance reports
│   └── requirements.txt
│
├── backend/                           ← FastAPI application
│   ├── main.py                        ← FastAPI app entry point
│   ├── routers/
│   │   ├── upload.py                  ← /api/upload, /api/validate
│   │   ├── predict.py                 ← /api/predict/*
│   │   ├── dashboard.py               ← /api/dashboard/*
│   │   ├── chat.py                    ← /api/chat
│   │   └── export.py                  ← /api/export/*
│   ├── services/
│   │   ├── model_service.py           ← Load model, predict, SHAP
│   │   ├── rag_service.py             ← RAG pipeline logic
│   │   ├── chroma_service.py          ← ChromaDB operations
│   │   └── data_service.py            ← Data validation, preprocessing
│   ├── models/                        ← symlink/copy จาก model-training
│   └── requirements.txt
│
├── frontend/                          ← Next.js application
│   ├── app/
│   │   ├── page.tsx                   ← Overview Dashboard
│   │   ├── upload/
│   │   │   └── page.tsx               ← Upload & Predict
│   │   ├── retention/
│   │   │   └── page.tsx               ← Retention Alert List
│   │   ├── topup/
│   │   │   └── page.tsx               ← Urgent Top-up List
│   │   ├── customer/[id]/
│   │   │   └── page.tsx               ← Customer 360 Profile
│   │   ├── chat/
│   │   │   └── page.tsx               ← AI Chat
│   │   └── admin/
│   │       └── page.tsx               ← Model Performance
│   ├── components/
│   │   ├── ChurnGauge.tsx
│   │   ├── RiskTable.tsx
│   │   ├── ShapChart.tsx
│   │   ├── ChatInterface.tsx
│   │   ├── FileUpload.tsx
│   │   ├── SummaryCards.tsx
│   │   └── CustomerProfile.tsx
│   ├── lib/
│   │   └── api.ts                     ← API client functions
│   └── package.json
│
├── docs/                              ← documentation
│   ├── technical_report.md
│   ├── usage_guide.md
│   └── model_evaluation_report.md
│
└── docker-compose.yml                 ← optional containerization
```

---

## 10. Timeline การพัฒนา

ตามโจทย์: ม.ค. 2569 - ธ.ค. 2569

| ช่วงเวลา | งาน | Output |
|----------|-----|--------|
| ม.ค. 2569 | Kick-off + Requirement gathering + เข้าใจโจทย์ | Project plan, requirement doc |
| ก.พ. - มี.ค. 2569 | EDA + Data cleaning + Feature Engineering + Label Engineering | Cleaned data, feature set, churn labels |
| เม.ย. - มิ.ย. 2569 | Model 1: Churn Prediction (Train, Tune, Evaluate, Export) | churn_model.pkl + performance report |
| เม.ย. - มิ.ย. 2569 | Data Ingestion module + FastAPI เบื้องต้น | Upload, validate, preprocess API |
| ก.ค. - ก.ย. 2569 | Model 2: LTV + RFM (Train, Evaluate) | ltv_model.pkl + rfm segments |
| ก.ค. - ก.ย. 2569 | Credit Consumption Prediction | credit prediction module |
| ต.ค. - พ.ย. 2569 | Model 3: Cross-Sell Recommendation | crosssell_model.pkl |
| ต.ค. - พ.ย. 2569 | Frontend Dashboard (Next.js) ทุกหน้า | Complete web application |
| ต.ค. - พ.ย. 2569 | AI Chatbot (RAG + Qwen 3.5) | Working chatbot |
| ธ.ค. 2569 | Testing, Model Evaluation, Documentation, Demo | Final deliverables |

---

## 11. ลำดับการพัฒนาแนะนำ

เอกสารนี้ออกแบบมาเพื่อให้สามารถพัฒนาทีละ Module ได้ โดยแนะนำลำดับดังนี้:

1. **Churn Model Training** - เริ่มจาก EDA, Label Engineering, Feature Engineering, Train XGBoost, Evaluate, Export .pkl ทั้งหมด เพราะเป็น core ของทั้งโปรเจค
2. **FastAPI Backend (Predict endpoints)** - สร้าง API สำหรับ upload CSV, validate, predict churn พร้อม SHAP explanation
3. **Next.js Frontend (Upload + Dashboard)** - สร้าง UI สำหรับ upload, แสดงผล prediction, dashboard charts
4. **LTV + RFM Model** - เพิ่ม model ตัวที่ 2 เข้าไปใน pipeline
5. **Credit Consumption Prediction** - เพิ่ม burn rate + run-out date prediction
6. **Cross-Sell Recommendation** - เพิ่ม model ตัวที่ 3
7. **Customer 360 Profile Page** - หน้ารวม 3 models ไว้ในที่เดียว
8. **AI Chatbot (RAG)** - Setup Ollama + ChromaDB + RAG pipeline + Chat UI
9. **Export + Admin Page** - Export CSV/Excel + Model metrics display
10. **Testing + Documentation** - Integration test, performance test, เขียนเอกสาร

**แต่ละ step ให้ทำเสร็จและเช็คผลลัพธ์ก่อน แล้วค่อยไป step ถัดไป เพื่อให้มั่นใจว่าแต่ละส่วนทำงานถูกต้อง**

---

## 12. Libraries ที่ต้องใช้

### Python Libraries

| Library | Version (แนะนำ) | ใช้สำหรับ |
|---------|----------------|----------|
| pandas | >=2.0 | Data manipulation |
| numpy | >=1.24 | Numerical computing |
| scikit-learn | >=1.3 | ML algorithms, preprocessing, evaluation |
| xgboost | >=2.0 | XGBoost model |
| lightgbm | >=4.0 | LightGBM model (optional) |
| shap | >=0.43 | Explainable AI |
| imbalanced-learn | >=0.11 | SMOTE for class imbalance |
| matplotlib | >=3.7 | Visualization |
| seaborn | >=0.12 | Statistical visualization |
| lifetimes | >=0.11 | BG/NBD + Gamma-Gamma for LTV |
| mlxtend | >=0.23 | Association Rules for Cross-Sell |
| fastapi | >=0.100 | Backend API |
| uvicorn | >=0.23 | ASGI server |
| chromadb | >=0.4 | Vector database for RAG |
| langchain | >=0.1 | RAG orchestration |
| joblib | >=1.3 | Model serialization |
| openpyxl | >=3.1 | Excel file support |
| python-multipart | >=0.0.6 | File upload support in FastAPI |

### Node.js Packages

| Package | ใช้สำหรับ |
|---------|----------|
| next | Frontend framework |
| react / react-dom | UI library |
| tailwindcss | Styling |
| @shadcn/ui | UI components |
| recharts | Dashboard charts |
| axios | HTTP client สำหรับเรียก API |
| react-dropzone | File upload drag & drop |
| lucide-react | Icons |

### Setup Ollama (Local LLM)

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

---

## หมายเหตุ

- เอกสารนี้เป็น reference สำหรับ AI ในการพัฒนาแต่ละ module
- ให้ทำทีละ step ตาม Section 11 และเช็คผลลัพธ์ก่อนไป step ถัดไป
- ข้อมูลทั้งหมดอ้างอิงจากโจทย์ PDF ของ 1Moby + ส่วนเสริม AI Chatbot
- สามารถแก้ไขเพิ่มเติมได้ตามความเหมาะสมของ data จริงที่ได้รับ
