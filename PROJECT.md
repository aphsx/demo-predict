# 1Moby Analytics — Project Documentation

## สารบัญ

- [ภาพรวมระบบ](#ภาพรวมระบบ)
- [Tech Stack](#tech-stack)
- [โครงสร้างโปรเจค](#โครงสร้างโปรเจค)
- [Architecture & Data Flow](#architecture--data-flow)
- [Database Schema](#database-schema)
- [ML Pipeline](#ml-pipeline)
- [API Endpoints](#api-endpoints)
- [Worker & Task Queue](#worker--task-queue)
- [Frontend](#frontend)
- [Docker Services](#docker-services)
- [Environment Variables](#environment-variables)
- [Development Workflow](#development-workflow)
- [Training Models](#training-models)

---

## ภาพรวมระบบ

**1Moby Analytics** คือระบบ Customer Predictive Analytics สำหรับวิเคราะห์ลูกค้า ประกอบด้วย 3 โมเดล ML หลัก:

| โมเดล | ทำนาย | Output |
|-------|--------|--------|
| **Churn Model** | โอกาสที่ลูกค้าจะเลิกใช้งานใน 6 เดือน | churn_probability, churn_tier |
| **CLV Model** | มูลค่าลูกค้าตลอด 6 เดือนข้างหน้า | predicted_clv_6m, confidence intervals |
| **Credit Model** | ทำนายว่าลูกค้าจะซื้อเครดิตอีกกี่วัน | P10–P90 quantiles, urgency, alert_date |

ผู้ใช้ upload ไฟล์ Excel → ระบบ process → แสดงผลบน Dashboard พร้อม Customer 360 และ SHAP explanations

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, Recharts |
| **API** | FastAPI (Python 3.11), SQLAlchemy (async) |
| **ML** | LightGBM, XGBoost, lifetimes (BG/NBD), scikit-learn, SHAP |
| **Database** | PostgreSQL 15 |
| **Task Queue** | ARQ (async Redis queue) |
| **Cache/Broker** | Redis 7 |
| **Container** | Docker Compose |
| **Serialization** | dill (pickle protocol 5) |

---

## โครงสร้างโปรเจค

```
demo-predict/
├── docker-compose.yml          # orchestration ทุก service
├── db/
│   └── init.sql                # สร้าง schema + indexes ตอน boot
├── ml/
│   ├── Dockerfile              # image เดียวสำหรับทั้ง API และ worker
│   ├── train.py                # script เทรนโมเดลทั้งหมด
│   ├── models/                 # ไฟล์โมเดลที่ save แล้ว (.pkl)
│   ├── data/                   # ไฟล์ Excel สำหรับเทรน
│   ├── api/
│   │   ├── main.py             # FastAPI app + endpoints ทั้งหมด
│   │   └── database.py         # async SQLAlchemy engine + session
│   ├── worker/
│   │   └── predict_worker.py   # ARQ worker — รัน ML pipeline
│   └── src/
│       ├── config.py           # constants ทั้งระบบ (thresholds, weights)
│       ├── data_loader.py      # อ่าน Excel + define active/churn labels
│       ├── features.py         # สร้าง 30 features (point-in-time safe)
│       ├── predictor.py        # MobyPredictor — entry point predict ทุกโมเดล
│       ├── rfm.py              # RFM quintile scoring + segment mapping
│       ├── monitoring.py       # PSI + KS drift detection
│       └── models/
│           ├── churn_model.py  # LightGBM + Isotonic calibration
│           ├── clv_model.py    # BG/NBD + Gamma-Gamma + empirical PI
│           └── credit_model.py # LightGBM quantile regression × 5
└── web/
    ├── Dockerfile              # multi-stage build
    ├── next.config.js          # proxy /api/* → ml:8000
    ├── package.json
    └── src/
        ├── app/
        │   ├── layout.tsx          # root layout + sidebar
        │   ├── page.tsx            # Dashboard (KPIs + charts)
        │   ├── runs/
        │   │   └── page.tsx        # จัดการ Runs (สร้าง/upload/ลบ)
        │   └── customers/
        │       ├── page.tsx        # ตารางลูกค้าทั้งหมด + filter
        │       └── [id]/
        │           └── page.tsx    # Customer 360
        ├── components/
        │   ├── Sidebar.tsx
        │   └── Badge.tsx
        └── lib/
            └── api.ts              # API client functions + TypeScript types
```

---

## Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER (Browser)                           │
│         Next.js Frontend  →  port 3001                          │
└────────────────────────────┬────────────────────────────────────┘
                             │  /api/* (Next.js proxy)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI  →  port 8001                        │
│  POST /runs/{id}/upload                                         │
│    1. Validate Excel sheets                                     │
│    2. INSERT raw data → PostgreSQL                              │
│    3. Enqueue job → Redis (ARQ)                                 │
└──────────────┬──────────────────────────────┬───────────────────┘
               │ INSERT                        │ enqueue
               ▼                              ▼
┌──────────────────────┐          ┌───────────────────────────────┐
│   PostgreSQL :5432   │          │     Redis :6379  (ARQ)        │
│  raw_customers       │◄─────────│   job queue + results         │
│  raw_payments        │          └──────────────┬────────────────┘
│  raw_usage           │                         │ dequeue
│  prediction_runs     │          ┌──────────────▼────────────────┐
│  predictions         │◄─────────│        ARQ Worker             │
└──────────────────────┘  INSERT  │  1. Load raw data from DB     │
                                  │  2. Build 30 features         │
                                  │  3. Run Churn / CLV / Credit  │
                                  │  4. SHAP for top 500 active   │
                                  │  5. Batch INSERT predictions  │
                                  │     (1000 rows / batch)       │
                                  │  6. Update run status → done  │
                                  └───────────────────────────────┘
```

### Point-in-Time Correctness

ทุก feature ถูก compute จากข้อมูล **ก่อน cutoff_date เท่านั้น** เพื่อป้องกัน lookahead bias:

```
timeline:  ←──────────────────[cutoff]──────────────→
                                  │
features build ←─────────────────┘
churn labels  ──────────────────────────────→ (6 months)
CLV forecast  ──────────────────────────────→ (6 months)
```

---

## Database Schema

### prediction_runs
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Run identifier |
| name | VARCHAR | ชื่อ run |
| status | VARCHAR | pending → validating → processing → done / failed |
| cutoff_date | DATE | วันอ้างอิง point-in-time |
| total_customers | INT | จำนวนลูกค้าทั้งหมด |
| active_customers | INT | ลูกค้า active |
| error_message | TEXT | ข้อผิดพลาด (ถ้า failed) |
| created_at / updated_at | TIMESTAMP | auto-update trigger |

### raw_customers
| Column | Type | Description |
|--------|------|-------------|
| run_id | UUID FK | อ้างอิง prediction_runs |
| acc_id | BIGINT | รหัสลูกค้า |
| status_sms / status_email | VARCHAR | สถานะ |
| credit_sms / credit_email | NUMERIC | เครดิตคงเหลือ |
| expire_sms / expire_email | TIMESTAMP | วันหมดอายุ |
| join_date | TIMESTAMP | วันสมัคร |
| last_access / last_send | TIMESTAMP | การใช้งานล่าสุด |

### raw_payments
| Column | Type | Description |
|--------|------|-------------|
| run_id | UUID FK | |
| acc_id | BIGINT | |
| payment_date | TIMESTAMP | วันชำระ |
| amount | NUMERIC | จำนวนเงิน |
| credit_add | NUMERIC | เครดิตที่ได้รับ |
| credit_type | VARCHAR | sms / email |

### raw_usage
| Column | Type | Description |
|--------|------|-------------|
| run_id | UUID FK | |
| acc_id | BIGINT | |
| year / month | INT | รอบเดือน |
| usage | NUMERIC | ปริมาณใช้งาน |
| channel | VARCHAR | sms / email |
| source | VARCHAR | bc / api / otp |

### predictions (ML Output)
| Column | Description |
|--------|-------------|
| run_id, acc_id | FK keys |
| churn_probability | 0.0–1.0 |
| churn_tier | Low / Medium / High |
| predicted_clv_6m | บาท |
| clv_ci95_lo/hi, clv_ci80_lo/hi | Confidence intervals |
| p_alive | โอกาสยังเป็น active customer |
| rfm_segment | Champions / Loyal / Promising / Cannot Lose / At Risk / Need Attention |
| credit_p10/25/50/75/90 | วันถึงซื้อเครดิต (quantiles) |
| urgency | Critical / Warning / Monitor / Stable |
| alert_date | วันที่ควรเริ่ม campaign (cutoff + P25 days) |
| n_purchases | จำนวนครั้งที่ซื้อ |
| forecast_confidence | 0.0–1.0 |
| priority_score | 0–10 (weighted blend) |
| revenue_at_risk | churn_prob × clv (บาท) |
| is_active | 0 / 1 |
| risk_factor_1/2/3 | top SHAP factors |

**Indexes**: run_id, acc_id, churn_tier, urgency, rfm_segment

---

## ML Pipeline

### Feature Engineering (30 features)

สร้างใน `ml/src/features.py` → `build_features(users, payments, usage, cutoff)`

**User Features (9)**
| Feature | Description |
|---------|-------------|
| days_since_join | อายุลูกค้า (วัน) |
| days_since_last_access | ล่าสุดที่ login |
| days_since_last_send | ล่าสุดที่ส่งข้อความ |
| days_until_sms_expire | เหลือกี่วันก่อนหมดอายุ SMS |
| days_until_email_expire | เหลือกี่วันก่อนหมดอายุ Email |
| credit_sms_log | log(credit_sms + 1) |
| credit_email_log | log(credit_email + 1) |
| is_paid_sms / is_paid_email | เคยจ่ายเงินหรือไม่ |

**Payment Features (10)**
| Feature | Description |
|---------|-------------|
| pay_recency_days | วันนับจากการชำระล่าสุด |
| pay_frequency | จำนวนครั้งทั้งหมด |
| pay_monetary_log | log(ยอดรวม + 1) |
| pay_avg_amount | ยอดเฉลี่ยต่อครั้ง |
| pay_total_credits | เครดิตรวมที่ซื้อ |
| pay_avg_interval | ช่วงห่างเฉลี่ยระหว่างการชำระ (วัน) |
| pay_overdue_ratio | สัดส่วนชำระหลัง expire |
| pay_n_sms / pay_n_email | แยกตาม channel |
| pay_tenure_days | อายุการเป็นลูกค้า (วัน) |

**Usage Features (11)**
| Feature | Description |
|---------|-------------|
| usage_total_log | log(usage รวม + 1) |
| usage_months | กี่เดือนที่มี usage |
| usage_avg | ค่าเฉลี่ยรายเดือน |
| usage_max | สูงสุดในช่วง |
| usage_std | ความผันผวน |
| usage_recent_3m | 3 เดือนล่าสุด |
| usage_prev_3m | 3 เดือนก่อนหน้า |
| usage_decay_ratio | recent_3m / prev_3m (trend) |
| usage_slope | แนวโน้มการใช้งาน (linear regression) |
| usage_sms_total / usage_email_total | แยก channel |

---

### Churn Model (`ml/src/models/churn_model.py`)

**Algorithm**: LightGBM + Isotonic Calibration

```
Raw Data
  → 30 features
  → Train/Val/Test split (60/20/20)
  → LightGBM (Optuna hyperparameter tuning, 30 trials)
  → CalibratedClassifierCV (isotonic, 5-fold)
  → churn_probability (0.0–1.0)
  → churn_tier: Low(0–0.3) / Medium(0.3–0.6) / High(0.6–1.0)
```

**Leakage detection**: เปรียบ AUC แบบมี vs ไม่มี suspect features (usage_decay, usage_recent)

**Output files**: `churn_model.pkl` (model + scaler + feature names)

---

### CLV Model (`ml/src/models/clv_model.py`)

**Algorithm**: BG/NBD + Gamma-Gamma + Empirical Residual PI

```
Payment history
  → BG/NBD: ทำนาย frequency ใน 6 เดือน + P(alive)
  → Gamma-Gamma: ทำนาย average order value
  → CLV = BG/NBD frequency × Gamma-Gamma value
  → Confidence Interval (FIX V3 — Empirical per decile)
     residuals = actual - predicted
     CI 95% = predicted + [P2.5, P97.5] ของ decile นั้น
     CI 80% = predicted + [P10, P90]
```

**RFM Scoring (Quintile)**

| Score | R (Recency) | F (Frequency) | M (Monetary) |
|-------|-------------|---------------|--------------|
| 5 | ซื้อล่าสุด | ซื้อบ่อยที่สุด | ใช้จ่ายสูงสุด |
| 1 | ไม่ซื้อนาน | ซื้อน้อยที่สุด | ใช้จ่ายน้อยสุด |

**RFM Segments**

| Segment | เงื่อนไข |
|---------|----------|
| Champions | total ≥ 13 |
| Loyal | total ≥ 10 และ R ≥ 3 |
| Promising | R ≥ 4 และ total < 10 |
| Cannot Lose | R ≤ 2 และ total ≥ 8 |
| At Risk | R ≤ 2 |
| Need Attention | อื่นๆ |

**Output files**: `ltv_bgnbd.pkl`, `ltv_gg.pkl`, `rfm_segments.csv`

---

### Credit Model (`ml/src/models/credit_model.py`)

**Algorithm**: LightGBM Quantile Regression × 5 + Conformal Calibration

```
Payment pairs (ลูกค้าที่ซื้อ ≥ 2 ครั้ง)
  → 20 features จาก transaction history
  → เทรน 5 โมเดลแยก: P10, P25, P50, P75, P90
     (Optuna 15 trials ต่อ quantile)
  → Conformal post-calibration
     → ปรับให้ coverage 80% และ 50% ตรงเป้า
  → Urgency (based on P10):
     Critical < 14 วัน
     Warning  14–30 วัน
     Monitor  30–90 วัน
     Stable   > 90 วัน
  → alert_date = cutoff + P25 days
```

**หมายเหตุ**: ลูกค้าที่ซื้อเพียงครั้งเดียว → "New Customer" (ไม่มี P10–P90)

**Output files**: `credit_q10.pkl`, `credit_q25.pkl`, `credit_q50.pkl`, `credit_q75.pkl`, `credit_q90.pkl`

---

### Priority Score

```python
score = (
    0.35 × norm(churn_probability) +
    0.35 × norm(predicted_clv_6m) +
    0.15 × urgency_score +        # Critical=1.0, Warning=0.75, Monitor=0.5, Stable=0.25
    0.15 × recency_score          # สัดส่วนจาก days_since_last_send
) × 10
```

**Revenue at Risk** = `churn_probability × predicted_clv_6m`

---

### SHAP Explanations

- คำนวณ SHAP values สำหรับลูกค้า active 500 คนแรก (per run)
- แสดง top 3 risk factors ต่อลูกค้า
- เก็บใน `risk_factor_1`, `risk_factor_2`, `risk_factor_3`

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (DB + models) |
| GET | `/runs` | List runs (50 ล่าสุด) |
| POST | `/runs` | สร้าง run ใหม่ `{name, cutoff_date}` |
| GET | `/runs/{run_id}` | ดูรายละเอียด run |
| DELETE | `/runs/{run_id}` | ลบ run + raw data cascade |
| POST | `/runs/{run_id}/upload` | Upload Excel → validate → insert → enqueue |
| GET | `/runs/{run_id}/predictions` | Paginated list (filter: churn_tier, rfm_segment, urgency) |
| GET | `/runs/{run_id}/predictions/{acc_id}` | Customer 360 (16 fields) |
| GET | `/runs/{run_id}/summary` | KPIs + distributions สำหรับ Dashboard |

### Summary Response
```json
{
  "active_customers": 12500,
  "high_churn_customers": 2340,
  "avg_clv_6m": 4850.0,
  "total_revenue_at_risk": 11200000.0,
  "critical_topup_customers": 890,
  "total_customers": 25000,
  "churn_distribution": {"Low": 15000, "Medium": 7660, "High": 2340},
  "rfm_distribution": {"Champions": 1200, "Loyal": 3400, ...},
  "urgency_distribution": {"Critical": 890, "Warning": 2300, ...}
}
```

---

## Worker & Task Queue

### Flow

```
API  →  arq_pool.enqueue_job("run_prediction_pipeline", run_id, model_dir)
         ↓ Redis queue
Worker  →  run_prediction_pipeline(ctx, run_id, model_dir)
            ↓
         _pipeline(run_id, model_dir)
           1. create_async_engine
           2. _load_from_db()        # raw_customers, raw_payments, raw_usage
           3. build_features()
           4. MobyPredictor.run_all_predictions()
           5. predictor.predict_batch()
           6. SHAP for active[:500]
           7. _save_predictions()    # batch insert 1000 rows/trip
           8. UPDATE prediction_runs SET status='done'
```

### Worker Configuration

```python
class WorkerSettings:
    functions      = [run_prediction_pipeline]
    redis_settings = RedisSettings(host="redis", port=6379)
    max_jobs       = 2        # predict สองงานพร้อมกันสูงสุด
    job_timeout    = 3600     # 1 ชั่วโมง
    keep_result    = 3600     # เก็บ result ใน Redis 1 ชั่วโมง
```

### Batch Insert (Optimized)

Worker insert ทีละ **1,000 rows** แทนทีละ row เดิม:

```
25,000 rows  →  25 round trips  (แทนที่จะเป็น 25,000)
```

---

## Frontend

### Pages

#### `/` — Dashboard

- Run selector dropdown
- **6 KPI Cards**: Active customers, High churn count, Revenue at risk, Avg CLV, Critical top-ups, Total customers
- **Churn Tier** donut chart (Low / Medium / High / Already Churned)
- **RFM Segments** bar chart
- **Credit Urgency** distribution
- Auto-refresh ทุก 5 วินาที ขณะ status = processing

#### `/runs` — Runs Management

- สร้าง run ใหม่ (name + cutoff_date)
- Upload Excel → status badge แสดงแบบ real-time
- ตาราง: Name, Status, Cutoff, Total, Active, Created
- Actions: Upload / View / Delete (พร้อม confirmation)

**Status workflow**:
```
pending → validating → processing → done
                                  ↘ failed (แสดง error message)
```

#### `/customers` — Customer List

- ตาราง 11 คอลัมน์ + pagination (50 rows/page)
- Filter: Churn Tier, RFM Segment, Urgency, Search by acc_id
- Churn % แสดงเป็น progress bar (สีตามระดับ)
- คลิก acc_id → Customer 360

#### `/customers/[id]` — Customer 360

Layout 3 คอลัมน์:

**ซ้าย — Churn Analysis**
- Churn gauge (SVG semicircle)
- Top 3 SHAP risk factors (ภาษาไทย)
- Key stats: Revenue at risk, Priority, Purchases, Confidence

**กลาง — CLV & RFM**
- CLV value + 95%/80% CI bars
- P(alive) percentage
- RFM Segment badge
- R/F/M scores (progress bars)

**ขวา — Credit Forecast**
- Quantile bar chart (P10–P90)
- Urgency badge + Alert date
- ตีความแต่ละ quantile (warm up → alert → target → late → pessimistic)

**Header — Sales Recommendation**

| สถานการณ์ | คำแนะนำ |
|-----------|---------|
| High churn + Critical urgency | รีบโทรทันที |
| High churn | โทรสอบถาม + เสนอ Offer |
| Critical urgency | ส่ง Reminder ซื้อเครดิต |
| Champions / Loyal | Cross-sell / Upsell |
| อื่นๆ | Monitor |

---

## Docker Services

### docker-compose.yml

| Service | Image / Build | Port | Role |
|---------|--------------|------|------|
| **db** | postgres:15-alpine | 5433 | Database |
| **redis** | redis:7-alpine | — | Queue + Cache |
| **ml** | ./ml/Dockerfile | 8001 | FastAPI API server |
| **worker** | ./ml/Dockerfile | — | ARQ background worker |
| **web** | ./web/Dockerfile | 3001 | Next.js frontend |

### Dependency Chain

```
db (healthy) ──┐
               ├──→ ml ──→ web
redis (healthy)─┤
               └──→ worker
```

### Shared Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| postgres_data | /var/lib/postgresql/data | DB persistence |
| ./ml/models | /app/models | model artifacts (shared ml + worker) |
| ./ml/data | /app/data | training data |

### Next.js Proxy

`next.config.js` proxy `/api/*` → backend:

```
Browser request  →  /api/runs
Next.js rewrite  →  http://ml:8000/runs   (Docker internal, ไม่เปลี่ยน)

Dev mode         →  http://localhost:8001/runs
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_DB` | moby | ชื่อ database |
| `POSTGRES_USER` | moby | PostgreSQL user |
| `POSTGRES_PASSWORD` | moby1234 | PostgreSQL password |
| `DATABASE_URL` | postgresql://moby:moby1234@db:5432/moby | connection string |
| `MODEL_DIR` | /app/models | path ไฟล์โมเดล |
| `REDIS_HOST` | redis | Redis hostname |
| `REDIS_PORT` | 6379 | Redis port |
| `NEXT_PUBLIC_API_URL` | http://localhost:8001 | API URL สำหรับ browser |
| `API_URL` | http://ml:8000 | API URL สำหรับ Next.js server-side |

---

## Development Workflow

### รัน Full Stack (Docker)

```bash
# Boot ทุก service
docker compose up -d

# ดู logs
docker compose logs -f ml worker

# Rebuild หลังแก้ไข Python
docker compose up -d --build ml worker
```

### รัน Frontend Dev (แก้หน้าบ้านอย่างเดียว)

```bash
# Step 1 — เปิด backend ผ่าน Docker (ครั้งเดียว)
docker compose up db redis ml worker -d

# Step 2 — รัน Next.js dev server บนเครื่อง
cd web
npm install               # ครั้งแรกเท่านั้น
API_URL=http://localhost:8001 npm run dev

# เปิด http://localhost:3001
# แก้ไฟล์ → browser reload เอง (hot reload)
```

### Workflow หลักของผู้ใช้

```
1. สร้าง Run  →  POST /runs  (ตั้งชื่อ + cutoff date)
2. Upload Excel  →  POST /runs/{id}/upload
   - ระบบ validate sheets ที่ required
   - INSERT raw data ลง PostgreSQL
   - Enqueue job ผ่าน ARQ
3. รอ processing  (poll status ทุก 5 วินาที)
   - Worker โหลดข้อมูล → build features → run models
   - INSERT predictions กลับ DB (batch 1000 rows)
   - status → done
4. ดู Dashboard  →  /
5. เจาะดูลูกค้า  →  /customers  →  /customers/{id}
```

---

## Training Models

### Requirements

- ไฟล์ Excel ที่มี sheets: `Users+User_profile`, `Backend_payment`, `SMS_usage_BC/API/OTP`, `Email_usage_BC/API/OTP`
- วาง Excel ที่ `ml/data/1Moby_Data.xlsx`

### ขั้นตอน

```bash
cd ml
python train.py data/1Moby_Data.xlsx
```

**สิ่งที่ถูกสร้าง (ใน `ml/models/`)**

| ไฟล์ | เนื้อหา |
|------|---------|
| `churn_model.pkl` | Calibrated LightGBM + StandardScaler + feature list |
| `ltv_bgnbd.pkl` | BG/NBD model + decile_stats สำหรับ empirical PI |
| `ltv_gg.pkl` | Gamma-Gamma model |
| `credit_q10/25/50/75/90.pkl` | 5 quantile models + conformal calibration data |
| `metrics.json` | AUC, F1, coverage rates, Spearman corr |
| `monitoring_baseline.json` | feature distribution baseline สำหรับ drift detection |
| `rfm_segments.csv` | RFM mapping ทุก customer |
| `*_eval.png` | evaluation plots (ROC, calibration, decile lift, etc.) |

### Model Monitoring

```python
# PSI (Population Stability Index)
# Alert ถ้า PSI > 0.25 (feature distribution drift)

# KS Test
# Alert ถ้า p-value < 0.05 (prediction distribution shift)
```

---

## Config Constants (`ml/src/config.py`)

```python
CUTOFF = pd.Timestamp("2025-07-01")   # cutoff default สำหรับ train

# Churn
CHURN_THRESHOLDS = {
    "Low":    (0.00, 0.30),
    "Medium": (0.30, 0.60),
    "High":   (0.60, 1.01),
}

# CLV
CLV_HORIZON_DAYS = 180    # 6 เดือน
CLV_PI_DECILES   = 10     # empirical PI แบ่ง 10 deciles

# Credit
CREDIT_QUANTILES = [0.10, 0.25, 0.50, 0.75, 0.90]
CREDIT_URGENCY_DAYS = {"Critical": 14, "Warning": 30, "Monitor": 90}

# Priority Score weights
PRIORITY_WEIGHTS = {
    "churn_probability": 0.35,
    "predicted_clv_6m":  0.35,
    "urgency_score":     0.15,
    "recency_score":     0.15,
}

# Monitoring
PSI_ALERT_THRESHOLD = 0.25
KS_PVALUE_THRESHOLD = 0.05
```
