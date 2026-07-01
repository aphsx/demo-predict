# ระบบ Prediction ของ Moby Analytics — เอกสารฉบับละเอียด (End-to-End)

> เอกสารนี้อธิบาย **ทั้งระบบทำนาย (prediction)** ของ Moby Analytics ตั้งแต่ไฟล์ Excel ที่ลูกค้าอัปโหลด
> จนถึงตัวเลขที่แสดงบนหน้าเว็บ — ว่าเรา **ทำอะไร ใช้อะไร เก็บอะไร และคำนวณยังไง** ในทุกขั้นตอน
>
> ทุก field / factor / สูตร / ค่าคงที่ในเอกสารนี้ตรวจสอบกับโค้ดจริงแล้ว (ณ มิ.ย. 2026)
> ถ้าโค้ดกับเอกสารขัดกันในอนาคต **ให้เชื่อโค้ด** แล้วมาแก้เอกสารนี้
>
> เอกสารอ้างอิงเชิงลึกที่เกี่ยวข้อง: `docs/ML-V2-OVERVIEW.md`, `docs/ML-V2-OUTPUT-CONTRACT.md`,
> `docs/ML-V2-TRAINING-PIPELINE.md`, `docs/ML-V2-DASHBOARD-SPEC.md`, `docs/CUSTOMER-SEGMENTS.md`,
> และ `moby-data-prep/docs/*` (สัญญาการ import)

---

## สารบัญ

1. [ภาพรวม: เราทำนายอะไร ด้วยโมเดลแบบไหน](#1-ภาพรวม)
2. [ภาพรวมสถาปัตยกรรมและการไหลของข้อมูล](#2-สถาปัตยกรรม)
3. [ขั้นที่ 1 — ข้อมูลนำเข้า: Excel 8 ชีต](#3-ข้อมูลนำเข้า)
4. [ขั้นที่ 2 — Raw layer (เก็บดิบตามจริง)](#4-raw-layer)
5. [ขั้นที่ 3 — Clean layer (ETL ทำความสะอาด)](#5-clean-layer)
6. [ขั้นที่ 4 — Feature Engineering (factor ทั้ง 26 ตัว)](#6-features)
7. [ขั้นที่ 5 — Labels (นิยามสิ่งที่ทำนาย)](#7-labels)
8. [ขั้นที่ 6 — Dataset, การแบ่ง split และการกัน leakage](#8-datasets)
9. [ขั้นที่ 7 — Preprocessing (fit เฉพาะ train)](#9-preprocessing)
10. [โมเดลที่ 1 — Lifecycle (rule-based)](#10-lifecycle)
11. [โมเดลที่ 2 — Churn (LightGBM + calibration + SHAP)](#11-churn)
12. [โมเดลที่ 3 — CLV (BG/NBD + Gamma-Gamma vs LightGBM)](#12-clv)
13. [โมเดลที่ 4 — Credit Forecast (Quantile + AFT survival)](#13-credit)
14. [Baselines (เส้นเปรียบเทียบ)](#14-baselines)
15. [Metrics (ตัววัดผล)](#15-metrics)
16. [Promotion Gate แบบ 2 ชั้น (Safety / Quality)](#16-promotion)
17. [Leakage Suite (ชุดตรวจการรั่วของข้อมูล)](#17-leakage)
18. [Drift Monitoring (PSI)](#18-drift)
19. [Training Runner — ลำดับ Gate ทั้งหมด](#19-training-runner)
20. [Prediction Runner — ลำดับการทำงานตอนทำนาย](#20-prediction-runner)
21. [Output Contract — ทุกคอลัมน์ของ `ml_prediction_outputs`](#21-output-contract)
22. [Derived fields + Customer Segmentation](#22-derived)
23. [ตาราง `ml_*` อื่น ๆ ที่ใช้เก็บผล](#23-ml-tables)
24. [การแสดงผล: Dashboard + API](#24-dashboard)
25. [ภาคผนวก — สรุปค่าคงที่สำคัญทั้งหมด](#25-constants)

---

<a name="1-ภาพรวม"></a>
## 1. ภาพรวม: เราทำนายอะไร ด้วยโมเดลแบบไหน

Moby Analytics เป็นแพลตฟอร์ม analytics ภายในของ **1Moby** (ธุรกิจ B2B SaaS ส่ง SMS / Email)
ผู้ใช้ภายใน ~5 คน อัปโหลดไฟล์ Excel ข้อมูลลูกค้า (~25,000 บัญชี) แล้วระบบจะทำนาย 4 อย่างต่อ "ลูกค้า 1 ราย ต่อ 1 รอบทำนาย (run)":

| องค์ประกอบ | ประเภท | สิ่งที่ได้ออกมา |
|---|---|---|
| **Lifecycle** | กฎ (rule-based ไม่ใช่ ML) | `lifecycle_stage`, `sub_stage` — สถานะปัจจุบันของลูกค้า |
| **Churn** | LightGBM + calibration + SHAP (มี candidate 5 แบบแข่งกัน) | `churn_probability`, `churn_risk_level`, `churn_factors` |
| **CLV** | BG/NBD + Gamma-Gamma **เทียบกับ** LightGBM Tweedie regressor | `predicted_clv_6m`, `p_alive` |
| **Credit Forecast** | LightGBM **quantile regression** + XGBoost **AFT survival** | `predicted_credit_usage_30d/90d`, ช่วง p10–p90, `estimated_days_until_topup` |

> **หมายเหตุสำคัญ:** โมเดล Win-back และ Conversion (`comeback_probability`, `conversion_probability`)
> **ถูกตัดถาวร** ห้ามนำกลับมา

หลักการกลางที่สำคัญที่สุดของทั้งระบบคือ **cutoff_date (วันอ้างอิง "as-of")**:
- **Feature** สร้างจากข้อมูล **ก่อน** cutoff เท่านั้น (strict `< cutoff`)
- **Label** นิยามจากข้อมูล **หลัง** cutoff เท่านั้น (`>= cutoff`)

เส้นแบ่งนี้คือสิ่งที่ทำให้โมเดลไม่ "โกง" (data leakage) และทำ backtest ย้อนหลังได้

---

<a name="2-สถาปัตยกรรม"></a>
## 2. ภาพรวมสถาปัตยกรรมและการไหลของข้อมูล

ระบบเป็น **monorepo** (Turborepo + Bun) มี 3 บริการหลัก:

- **`apps/web`** — Next.js 16 (หน้าเว็บ + proxy `/api/*` ไป Elysia)
- **`apps/api`** — Elysia.js (Bun) เป็นเจ้าของ REST + Auth + การ import/clean Excel + สั่งงาน ML
- **`apps/ml`** — Python 3.11: FastAPI (เฉพาะ endpoint ภายใน) + CLI ฝึก/ทำนาย

การไหลของงานทำนาย (prediction run):

```
ผู้ใช้อัปโหลด Excel (predict) ที่หน้า /runs
        │  POST /predict-data-sources/import   (raw + clean ในงานเดียว)
        ▼
Elysia: raw import → clean ETL  → predict_clean_* (Postgres)
        │  ความคืบหน้า stream ผ่าน Redis Stream: predict-import:{source_id}
        ▼
ผู้ใช้สร้าง run:  POST /prediction-runs { predict_source_id, name, cutoff_date }
        ▼
Elysia เรียก FastAPI /internal/prediction-runs (กั้นด้วย INTERNAL_SERVICE_TOKEN)
        ▼
FastAPI spawn:  python -m src.cli.predict   (prediction runner)
        │  โหลด champion (churn/clv/credit) → lifecycle + eligibility →
        │  รันโมเดล → SHAP (churn) → derived fields → batch insert
        ▼
เขียนผลลง ml_prediction_outputs (1 แถว/ลูกค้า/run)
        ▼
สถานะ run: in_progress → completed / failed   (ทุก exception ลงเอยที่ failed + error_message)
```

การฝึก (training) ใช้รูปแบบเดียวกัน: `POST /training-runs` → `/internal/training-runs` → `python -m src.cli.train`

**พอร์ต:** web `:3000` · api `:3001` · ml `:8001` (ภายใน `:8000`) · Postgres `:5433` (ภายใน `:5432`) · Redis `:6379`

---

<a name="3-ข้อมูลนำเข้า"></a>
## 3. ขั้นที่ 1 — ข้อมูลนำเข้า: Excel 8 ชีต

ไฟล์ Excel ต้องมี **8 ชีตตายตัว** (schema คงที่) ถ้าขาดชีตใดชีตหนึ่ง หรือมีชีตเกินที่ไม่รู้จัก ระบบจะ
reject ทั้งไฟล์ (`validateWorkbookSheets` ใน `excel-core.ts` — "Expected exactly 8 fixed-schema sheets")

| ชื่อชีต Excel | header ที่บังคับ | ความหมาย / คอลัมน์ที่อ่าน |
|---|---|---|
| `Users+User_profile` | `acc_id` | 1 แถว = 1 บัญชีลูกค้า อ่าน: `acc_id`, `status (SMS)` (สถานะแพ็กเกจ SMS), `user.credit + user.credit_premium` (เครดิต SMS), `credit_email` (เครดิต Email), `expire` (วันหมดอายุ SMS), `expire_email`, `status (Email)`, `join_date`, `last_access` (ล็อกอินล่าสุด), `last_send` (ส่งข้อความล่าสุด) |
| `Backend_payment` | `uid`, `payment_date`, `acc_id` | เหตุการณ์เติมเงิน/จ่ายเงิน อ่าน: `uid`, `acc_id`, `payment_date`, `amount` (บาท), `credit_add` (เครดิตที่ได้), `credit_type` |
| `SMS_usage (BC)` | `year`, `month`, `acc_id`, `usage` | การใช้ SMS แบบ Broadcast รายเดือนต่อบัญชี |
| `SMS_usage (API)` | เหมือนกัน | การใช้ SMS ผ่าน API |
| `SMS_usage (OTP)` | เหมือนกัน | การใช้ SMS แบบ OTP |
| `Email_usage (BC)` | เหมือนกัน | การใช้ Email Broadcast |
| `Email_usage (API)` | เหมือนกัน | การใช้ Email ผ่าน API |
| `Email_usage (OTP)` | เหมือนกัน | การใช้ Email OTP |

> ⚠️ **จุดที่ doc เก่าขัดกับโค้ด:** `excel-import-contract.md` เขียนว่า 6 ชีต usage เป็น optional
> แต่ **โค้ดจริงบังคับครบทั้ง 8 ชีต** (`TRAIN_REQUIRED_SHEETS`) — ให้เชื่อโค้ด

ไฟล์ตัวอย่างจริง: `data/[1Moby] Data_example for Bangkok university.xlsx`
มี 2 สาย (lineage) คือ **train** และ **predict** ซึ่งใช้ logic parse/clean ชุดเดียวกัน ต่างกันแค่ชื่อตาราง
และนโยบาย dedupe (train กันไฟล์ซ้ำด้วย checksum, predict ไม่กัน — ทุกการอัปโหลดคือ snapshot ใหม่)

**การตรวจตอน import (gating):** ตรวจครบ 8 ชีต → ตรวจ header บังคับครบ → จำกัดขนาดไฟล์ (`MAX_UPLOAD_BYTES`)
→ (train) กันไฟล์ซ้ำด้วย SHA-256 (`DUPLICATE_FILE`) ถ้าชีต/header ขาด = ทั้งไฟล์ `failed` (ไม่มี partial)

---

<a name="4-raw-layer"></a>
## 4. ขั้นที่ 2 — Raw layer (เก็บดิบตามจริง)

หลักการ: **เก็บข้อมูลดิบตามจริงทุก cell** ยังไม่ทำ business logic ใด ๆ (เลื่อนไปทำตอน clean)

แต่ละชีตถูก mirror ลงตารางของตัวเอง (8 ตารางต่อ lineage):

| ชีต | ตาราง train | ตาราง predict |
|---|---|---|
| Users+User_profile | `train_raw_sheet_users_user_profile` | `predict_raw_sheet_users_user_profile` |
| Backend_payment | `train_raw_sheet_backend_payment` | `predict_raw_sheet_backend_payment` |
| SMS_usage (BC/API/OTP) | `train_raw_sheet_sms_usage_{bc,api,otp}` | `predict_raw_sheet_sms_usage_{bc,api,otp}` |
| Email_usage (BC/API/OTP) | `train_raw_sheet_email_usage_{bc,api,otp}` | `predict_raw_sheet_email_usage_{bc,api,otp}` |

**โครงตาราง raw (เหมือนกันทั้ง 16 ตาราง):**

```sql
id           bigint   NOT NULL              -- PK
source_id    uuid     NOT NULL              -- FK → {train,predict}_data_sources.id (ON DELETE CASCADE)
excel_row    integer  NOT NULL              -- เลขแถว Excel (1-based; แถว 1 = header, แถวข้อมูลแรก = 2)
row_payload  jsonb    NOT NULL              -- cell ทั้งแถว key ด้วย header ที่ trim แล้ว
imported_at  timestamptz DEFAULT now() NOT NULL
```

- **ไม่มี UNIQUE บน business key** → แถวซ้ำถูกเก็บไว้ครบตามจริง
- **การเข้ารหัสค่าใน cell (`cellToJson`):** `null` → null; วันที่ → `{_excel:"datetime", iso:<ISO>, serial:<เลข serial Excel>}` (เก็บทั้งแบบอ่านได้และ serial); number/string/boolean → เก็บตามจริง
- **batch insert ทีละ 500 แถว** (ไม่ใช่ทีละแถว)
- insert แบบ batch ทั้งหมด ตามกฎ "ห้าม row-by-row loop"

**ตาราง catalog** `train_data_sources` / `predict_data_sources` เก็บ metadata ของแต่ละไฟล์:
`id, name, client_label, original_filename, file_checksum_sha256, file_size_bytes,
import_status (pending/importing/cleaning/ready/failed), imported_at, sheet_manifest (jsonb {ชีต:จำนวนแถว}),
clean_manifest (jsonb หลัง clean), cleaned_at, notes, error_message, imported_by, created_at`

ทุกตาราง raw/clean ผูก `ON DELETE CASCADE` กับ catalog → ลบ catalog = ลบ raw + clean ตามไปด้วย
การ re-upload จะ clear แล้ว insert ใหม่ตาม source_id

---

<a name="5-clean-layer"></a>
## 5. ขั้นที่ 3 — Clean layer (ETL ทำความสะอาด)

clean อ่าน raw ทั้งหมดของ source นั้น แปลงแต่ละแถวด้วยฟังก์ชันใน `sheet-cleaners.ts` แล้ว batch insert (ทีละ 500)
ทุกครั้งจะ **ลบ clean เดิมของ source ก่อน** (idempotent — clean ซ้ำได้) สถานะไหล `importing → cleaning → ready`

**ตัวแปลง cell หลัก:** `parseCellInt`, `parseCellNumeric` (เก็บเป็น numeric string), `parseCellDate`
(รองรับ Date / `{_excel}` / serial / string), `parseCellDateOnly` (→ `YYYY-MM-DD`)

### 5.1 Clean ลูกค้า → `train_clean_customers` / `predict_clean_customers`

| header Excel | คอลัมน์ clean | การแปลง |
|---|---|---|
| `acc_id` | `acc_id` | `parseCellInt` — **ถ้า null = ทิ้งแถว** (นับเป็น `customers_no_acc_id`) |
| `status (SMS)` | `status_sms` | string |
| `user.credit + user.credit_premium` | `credit_sms` | numeric **`?? "0"`** (null → 0) |
| `credit_email` | `credit_email` | numeric `?? "0"` |
| `expire` | `expire_sms` | date |
| `expire_email` | `expire_email` | date |
| `status (Email)` | `status_email` | string |
| `join_date` | `join_date` | date |
| `last_access` | `last_access` | timestamptz |
| `last_send` | `last_send` | timestamptz |

โครง: `id, source_id, acc_id (NOT NULL), status_sms, credit_sms, credit_email, expire_sms, expire_email,
status_email, join_date, last_access, last_send, excel_row, raw_row_id`
**กฎทิ้งแถวเดียว:** ขาด `acc_id` (เครดิต default 0, วันที่ parse ไม่ได้ = null แต่เก็บแถวไว้)

### 5.2 Clean การจ่ายเงิน → `train_clean_payments` / `predict_clean_payments`

| header | คอลัมน์ | การแปลง |
|---|---|---|
| `acc_id` | `acc_id` | int — null = **ทิ้ง** (`payments_no_acc_id`) |
| `payment_date` | `payment_date` | date — null/parse ไม่ได้ = **ทิ้ง** (`payments_no_date`) |
| `uid` | `payment_uid` | int (nullable) |
| `amount` | `amount` | numeric (nullable) |
| `credit_add` | `credit_add` | numeric (nullable) |
| `credit_type` | `credit_type` | string (nullable) |

โครง: `id, source_id, acc_id (NOT NULL), payment_uid, payment_date (NOT NULL), amount, credit_add, credit_type, excel_row, raw_row_id`
**กฎทิ้ง 2 ข้อ:** ขาด `acc_id` หรือ ขาด `payment_date`

### 5.3 Clean การใช้งาน → `train_clean_usage` / `predict_clean_usage` (รวม 6 ชีตเป็นตารางเดียว)

6 ชีต usage ถูก **UNION เป็นตาราง long/tidy ตารางเดียว** โดยเพิ่ม 2 คอลัมน์แยกที่มา:

```
"SMS_usage (BC)"    → channel="sms",   usage_source="bc"
"SMS_usage (API)"   → channel="sms",   usage_source="api"
"SMS_usage (OTP)"   → channel="sms",   usage_source="otp"
"Email_usage (BC)"  → channel="email", usage_source="bc"
"Email_usage (API)" → channel="email", usage_source="api"
"Email_usage (OTP)" → channel="email", usage_source="otp"
```

โครง: `id, source_id, acc_id (NOT NULL), year, month, usage (default 0), channel (NOT NULL),
usage_source (NOT NULL), excel_row, raw_row_id`
**กฎทิ้ง:** ขาด `acc_id` เท่านั้น (month นอกช่วง 1–12 = warning แต่เก็บแถว); **ไม่ dedupe ข้ามชีต**

### 5.4 Manifest หลัง clean

`clean_manifest` (jsonb) บันทึก: `raw` (จำนวนแถวต่อชีต), `clean` (`{customers, payments, usage}`),
`skipped` (`customers_no_acc_id, payments_no_acc_id, payments_no_date, usage_no_acc_id`), `warnings[]`
— นี่คือ "report การ validate" เดียวที่ชั้น ingestion สร้างเอง

### 5.5 ตอน ML อ่าน clean (`apps/ml/src/training/data.py`)

`load_train_clean(source_id)` / `load_predict_clean(source_id)` อ่าน clean แล้ว normalize:
lowercase/trim ค่า category (`channel, usage_source, status_sms, status_email, credit_type`),
coerce ตัวเลขเป็น nullable Int64/numeric, แปลงวันที่เป็น **tz-naive UTC datetime**, และ
**สังเคราะห์คอลัมน์ `period`** = `to_datetime(f"{year}-{month:02d}-01")` (ต้นเดือน) เพื่อใช้กับ feature รายเดือน

---

<a name="6-features"></a>
## 6. ขั้นที่ 4 — Feature Engineering (factor ทั้ง 26 ตัว)

ไฟล์: `apps/ml/src/training/features.py` — **นี่คือหัวใจของระบบทำนาย**

### 6.1 หลักการกลาง

- **EPSILON = `1e-9`** ใช้กันหารด้วยศูนย์ในทุก "safe ratio"
- **Point-in-time (PIT) filter:** ทุก feature คำนวณจากข้อมูล **ก่อน cutoff อย่างเข้มงวด** (`< cutoff`)
  - `_payment_history`: เก็บแถวที่ `acc_id` และ `payment_date` ไม่ null และ `payment_date < cutoff`
  - `_usage_history`: เก็บแถวที่ `acc_id` และ `period` ไม่ null และ `period < cutoff` (usage NaN → 0)
- **Account spine** (`_known_account_ids`): union ของ (ก) `acc_id` จากชีตลูกค้า, (ข) บัญชีที่มีจ่ายเงินก่อน cutoff,
  (ค) บัญชีที่มี usage > 0 ก่อน cutoff — เพื่อไม่ทิ้งบัญชี orphan ที่มีสัญญาณ
- **ฟังก์ชัน safe-math:** `_signed_log1p` (บีบหางหนักแต่คงเครื่องหมาย), `_safe_pct_change`,
  `_activity_ratio`, `_safe_ratio` (หาร 0 → 0), `_nullable_ratio` (หาร 0 → NaN)

### 6.2 รายการ feature ทั้งหมด (26 ตัว) — ชื่อ / สูตร / ที่มา

ระบบสร้าง **superset 27 ตัวเสมอ** แล้วแต่ละโมเดลค่อยเลือก subset (ดู 6.3)
ฐานคือ **24 ตัว (`BASE_TIER_A_FEATURES`)** + **3 ตัวเฉพาะ credit** = 27

**A. Tenure / โปรไฟล์**
1. `customer_age_days` — `(cutoff − join_date).days` · ที่มา `customers.join_date` · **nullable** ถ้าไม่มี join_date

**B. Recency (ความใหม่ของกิจกรรม)**
2. `days_since_last_activity` — `cutoff − max(วันกิจกรรมล่าสุด)` (กิจกรรม = union ของจ่ายเงิน + usage>0) · nullable
3. `days_since_last_payment` — `cutoff − max(payment_date)` · nullable
4. `days_since_last_usage` — `cutoff − max(period ที่ usage>0)` · nullable

**C. Payment RFM (ความถี่ / มูลค่า / จังหวะการจ่าย)**
5. `payment_count_all` — นับจำนวนการจ่ายทั้งหมดก่อน cutoff · default 0
6. `payment_count_180d` — นับการจ่ายใน 180 วันก่อน cutoff · default 0
7. `total_revenue_all` — `sum(amount)` ทั้งหมดก่อน cutoff · default 0
8. `total_revenue_180d` — `sum(amount)` ใน 180 วัน · default 0
9. `avg_transaction_value` — `mean(amount)` ก่อน cutoff · nullable
10. `payment_interval_mean_days` — ค่าเฉลี่ยระยะห่างวันระหว่างการจ่ายติดกัน · nullable (ถ้าจ่าย < 2 ครั้ง)
11. `payment_overdue_ratio` — `_nullable_ratio(days_since_last_payment, payment_interval_mean_days)` · NaN ถ้าไม่รู้จังหวะ

**D. ปริมาณ / แนวโน้ม / ความสม่ำเสมอของการใช้งาน**
หน้าต่าง: `recent_180` = period≥cutoff−180d; `recent_90`; `prev_90` = [cutoff−180d, cutoff−90d)
12. `usage_total_180d` — `sum(usage)` ใน 180 วัน · default 0
13. `usage_recent_90d` — `sum(usage)` ใน 90 วัน · default 0
14. `usage_prev_90d` — `sum(usage)` ในช่วง 90–180 วัน · default 0
15. `usage_change_90d_pct` — `_signed_log1p(_safe_pct_change(recent_90, prev_90))` · default 0
16. `usage_decay_ratio` — `_signed_log1p(_activity_ratio(recent_90, prev_90))` · default 0
17. `usage_slope_6m` — ความชัน regression เชิงเส้นของ usage รายเดือน 6 เดือนก่อน cutoff (x=0..5) · default 0
18. `usage_active_months_180d` — จำนวนเดือนที่ usage>0 ใน 180 วัน · default 0
19. `usage_consistency_ratio` — `usage_active_months_180d / 6.0` · default 0

**E. สัดส่วนการใช้ตาม channel**
20. `sms_usage_share` — usage SMS / usage รวม (ก่อน cutoff ทั้งหมด) · default 0
21. `email_usage_share` — usage Email / usage รวม · default 0

**F. สัดส่วนการใช้ตาม product/source**
22. `bc_usage_share` — broadcast / รวม · default 0
23. `api_usage_share` — api / รวม · default 0
24. `otp_usage_share` — otp / รวม · default 0

**G. เครดิต / runway — เฉพาะโมเดล Credit เท่านั้น**
> สำคัญ: **ไม่ใช้** คอลัมน์ snapshot `credit_sms/credit_email/expire_*` จากชีตลูกค้า เพราะสะท้อนเวลา export ไม่ใช่ cutoff
> (เป็น leakage) — แต่ **สร้างใหม่แบบ PIT-safe** จากประวัติ
25. `credit_added_180d` — `sum(credit_add)` ใน 180 วันก่อน cutoff · default 0
26. `credit_balance_proxy` — `sum(credit_add ทั้งหมด) − sum(usage ทั้งหมด)` ก่อน cutoff · default 0
27. `credit_runway_months` — `clip(balance_proxy / monthly_usage, 0, 24)` โดย `monthly_usage = recent_90d/3`;
    ถ้า usage=0 แต่ balance>0 → 24, ถ้า balance≤0 → 0 · default 0

> (รายการ 1–24 = ฐาน `BASE_TIER_A_FEATURES`; 25–27 = เฉพาะ credit — รวม **27 ตัวไม่ซ้ำ**)

**การจัดการ null:** feature กลุ่มความถี่/มูลค่า/usage/share/credit default = 0 (`ZERO_DEFAULT_FEATURES`);
ส่วน 7 ตัวที่ nullable (`customer_age_days, days_since_last_activity, days_since_last_payment,
days_since_last_usage, avg_transaction_value, payment_interval_mean_days, payment_overdue_ratio`)
จะคง NaN ไว้ก่อน แล้วค่อย impute ตอน preprocessing

### 6.3 feature ตัวไหนเข้าโมเดลไหน

`feature_names_for_model(model_type)`:
- **Churn** → 24 ตัวฐาน (ไม่มี credit 3 ตัว)
- **CLV** → 24 ตัวฐาน (เหมือน churn)
- **Credit** → 27 ตัว (ฐาน 24 + credit 3)

เหตุผล: credit ผูกกับ usage อนาคตตรง ๆ จึงควรเห็น balance/runway; แต่ 3 ตัวนี้เพิ่ม noise ให้ churn/CLV
ในการ backtest จึงตัดออก สัญญา feature: churn/clv = **`tier_a_24`**, credit = **`tier_a_27`**

### 6.4 `feature_code_hash` — versioning ของ feature

SHA-256 ของ (รายการ feature contract + source code จริงของทุก builder/helper) → ถ้าแก้ logic feature
hash เปลี่ยน → ใช้แยกเวอร์ชันใน `ml_feature_sets` และตรวจ drift ของโค้ด
(`lifecycle_code_hash` แยกต่างหากสำหรับกฎ lifecycle)

---

<a name="7-labels"></a>
## 7. ขั้นที่ 5 — Labels (นิยามสิ่งที่ทำนาย)

ไฟล์: `apps/ml/src/training/labels.py` · `LabelConfig`: `horizon_days=180`, `active_window_days=180`
หน้าต่าง: `horizon_end = cutoff + 180d` (อนาคต), `active_start = cutoff − 180d` (เกณฑ์ eligibility)

### 7.1 Churn label
- **ประชากร:** ลูกค้าที่ (active ใน 180 วันก่อน cutoff) **และ** (เคยจ่ายเงินก่อน cutoff)
- **label:** `churn_label = 1` ถ้า **ไม่มีจ่ายเงิน และไม่มี usage>0 ใน 180 วันหลัง cutoff**; `0` ถ้ามีกิจกรรมใด ๆ
- พูดง่าย ๆ: churn = นิยาม "เงียบสนิท" (pure inactivity) ในกลุ่มลูกค้าที่เคยจ่ายและเพิ่ง active

### 7.2 CLV labels
- **ประชากร:** active ใน 180 วันก่อน cutoff
- `future_revenue_6m` = `sum(amount)` ที่ `cutoff ≤ payment_date < cutoff+180d` (target ของ regression)
- `future_purchase_flag` = `future_revenue_6m > 0` (ใช้ stratify split)

### 7.3 Credit usage labels
- **ประชากร:** ทุก `_known_account_ids`
- `future_credit_usage_30d` = `sum(usage)` ใน 30 วันหลัง cutoff
- `future_credit_usage_90d` = `sum(usage)` ใน 90 วันหลัง cutoff
- (`CREDIT_HORIZONS = {30, 90}`)

### 7.4 Top-up timing labels
- `days_until_next_topup` = `(วันจ่ายเงินครั้งถัดไป − cutoff).days` (NaN ถ้าไม่มี = censored)
- `topup_observed` = มีวันจ่ายในอนาคตหรือไม่ (ใช้กับ survival model)

---

<a name="8-datasets"></a>
## 8. ขั้นที่ 6 — Dataset, การแบ่ง split และการกัน leakage

ไฟล์: `apps/ml/src/training/datasets.py`

- **`build_cutoff_datasets`** สร้าง feature ครั้งเดียว สร้าง label ทั้งหมด แล้วทำ 3 `SplitFrame`:
  churn (เลือก 24 feature, stratify ด้วย `churn_label`), CLV (24, stratify `future_purchase_flag`),
  credit (27, stratify `future_credit_usage_30d>0`)
- **การแบ่ง split:** seed `42`, `HOLDOUT_FRACTION=0.40`, `TEST_WITHIN_HOLDOUT=0.50` → **train/val/test = 60/20/20**
  แบ่งแบบ stratified รายลูกค้า (1 แถว/acc_id/cutoff → row split = group split) ถ้าข้อมูล < 25 แถว → ทั้งหมดเป็น train
- **cutoff ต้องเป็นต้นเดือน** (`month_start`) เพราะ usage เป็นรายเดือน — cutoff กลางเดือนทำให้หน้าต่าง label เพี้ยน
- **Backtest:** `adaptive_backtest_cutoffs` ถอยหลังทีละ `step_months=2` เก็บเฉพาะ cutoff ที่มีประวัติ ≥ 365 วัน
  และมี label window เต็ม สูงสุด 6 cutoff
- **Pool ข้าม cutoff** (`pool_train_rows`): เพิ่มแถว cutoff เก่าเข้า train เฉพาะ acc_id ที่ไม่ได้อยู่ใน val/test
  ของ cutoff หลัก → กัน leakage; val/test อยู่ที่ cutoff ล่าสุดเสมอ
- **`check_split_contamination`:** ยืนยัน acc_id ใน train/val/test ไม่ทับกัน

---

<a name="9-preprocessing"></a>
## 9. ขั้นที่ 7 — Preprocessing (fit เฉพาะ train)

ไฟล์: `apps/ml/src/training/preprocessing.py` — หลักการ **fit-on-train-only** (กัน leakage)

`fit_preprocessor` (ใช้เฉพาะ train split):
1. coerce feature เป็น numeric
2. **Imputation:** ถ้า feature มี default ในสัญญา (เช่น 0) → ใช้ค่านั้น; ถ้าเป็น nullable (7 ตัว) → ใช้
   **median ของ train**; ถ้า median เป็น NaN → 0
3. **center** = mean ของ train (หลัง impute)
4. **scale** = std (ddof=0) ของ train; ถ้า std ≤ 0 → 1 (กันหารศูนย์ของคอลัมน์คงที่)

`transform_features` (ใช้กับ val/test/predict): ใช้ค่า impute/center/scale ที่ **fit จาก train เท่านั้น**
ทำ `(x − center)/scale` — **ไม่มีการ refit** จากชุดอื่น
**ไม่มี categorical encoding** (ทุก feature เป็น numeric อยู่แล้ว — channel/source ถูกยุบเป็น share)
artifact เก็บเป็น JSON (`preprocessor_config.json`)

Gate 8 (`check_preprocessing_safety`) ตรวจว่า: fit แล้ว, จำนวนแถว fit ตรงกับ train split,
ลำดับ feature คงเดิม, ไม่มีร่องรอย refit จากชุดอื่น

---

<a name="10-lifecycle"></a>
## 10. โมเดลที่ 1 — Lifecycle (rule-based ไม่ใช่ ML)

คำนวณใน `features.py` → `build_lifecycle_outputs()` และนำมาใช้ตอนทำนายใน prediction runner
เป็น **state machine แบบกฎ** `active_window_days=180`

**กฎ stage** (ไล่จากบนลงล่าง เจอตัวแรกชนะ):
```
ไม่มีประวัติกิจกรรมเลย      → "Ghost"
ไม่ active ใน 180 วัน        → "Churned"
เคยจ่ายเงิน                  → "Active Paid"
อื่น ๆ                       → "Active Free"
```
**sub_stage:** Ghost / Churned Paid / Churned Free / Active Free / Active Paid

**เมทริกซ์ eligibility (ตอนทำนาย runner เป็นตัวตัดสินสุดท้าย — override ค่าจาก features):**
```
el_churn  = (stage == "Active Paid")
el_clv    = stage ∈ {"Active Paid", "Active Free"}
el_credit = stage ∈ {"Active Paid", "Active Free"}
```
→ ตอนทำนาย credit eligibility = เฉพาะ stage Active (Ghost/Churned ถูกตัด) แม้ตอน train จะ label credit ทุกบัญชีที่มีประวัติ

---

<a name="11-churn"></a>
## 11. โมเดลที่ 2 — Churn (LightGBM + calibration + SHAP)

ไฟล์: `apps/ml/src/training/churn_trainer.py` · **metric หลัก: PR-AUC** (average precision) · positive class = churned

### 11.1 candidate ทั้ง 5 แบบ (แข่งกัน)
1. **Logistic Regression** — `max_iter=2000, class_weight="balanced", C=1.0, seed=42`
2. **Random Forest** — `n_estimators=500, min_samples_leaf=5, max_features="sqrt", class_weight="balanced", n_jobs=-1`
3. **LightGBM** — จูนด้วย Optuna `LGBM_TRIALS=100`
4. **XGBoost** — จูนด้วย Optuna `XGB_TRIALS=50`
5. **TabICLv2** (`tabicl`) — tabular foundation model **ไม่ต้องจูน** (in-context learner) เพิ่มต่อเมื่อ
   (ก) `len(y_train) ≤ 500,000` และ (ข) import package `tabicl` ได้; device = CUDA ถ้ามี ไม่งั้น CPU
   ถ้าไม่มี package/GPU จะ **degrade เงียบ ๆ** (try/except) — **ไม่มี SHAP** (ข้าม global importance)

`scale_pos_weight = (#neg)/(#pos)` ใส่ให้ LightGBM และ XGBoost

**Search space LightGBM (Optuna):** `n_estimators=2000` (early-stop เลือก best), `num_leaves[16,256]`,
`learning_rate[0.01,0.2] log`, `min_child_samples[10,200]`, `feature_fraction/bagging_fraction[0.5,1.0]`,
`lambda_l1/l2[1e-8,10] log`; objective = val average_precision; `TPESampler(seed=42)`, `MedianPruner(n_warmup=10)`, early-stop 50
**XGBoost:** `n_estimators=1500`, `max_depth[3,9]`, `min_child_weight[1,50]`, `subsample/colsample[0.5,1.0]`,
`reg_alpha/lambda[1e-8,10] log`; eval `aucpr`

### 11.2 การจัดอันดับ + calibration
- จัดอันดับด้วย **5-fold stratified CV PR-AUC บน train∪val** (`_cv_oof`) — **test ไม่แตะจนนาทีสุดท้าย**
- **calibration** (`_fit_calibrator`) fit บน OOF prediction เลือกระหว่าง **Platt (sigmoid)** กับ **Isotonic**
  ด้วย **OOF ECE** (Brier เป็น tiebreak): Isotonic พิจารณาเมื่อ positive ≥ 200 และจะเลือกก็ต่อเมื่อ
  `iso_ece < platt_ece − 0.005` หรือ ECE เสมอกันแต่ Brier ดีกว่า; ไม่งั้นใช้ Platt

### 11.3 threshold + risk level
- `f2_threshold` = threshold ที่ max F2 (เน้น recall) บน OOF
- `high_threshold = clip(f2, 0.35, 0.85)`
- จาก high คำนวณ 4 แถบ: `medium = high×0.5`, `critical = high + 0.6×(1−high)`
- **risk bucketing ตอนทำนาย:** `≥critical→"critical"`, `≥high→"high"`, `≥medium→"medium"`, ไม่งั้น `"low"`

> threshold เก็บใน model card — UI/runner **ห้าม hardcode** ถ้า threshold หาย runner จะ error ทันที (ไม่เดา)

### 11.4 output ของ churn
- `churn_probability` (calibrated, clip 0–1, เฉพาะ Active Paid, ไม่งั้น null)
- `churn_risk_level`
- `churn_factors` = top-5 SHAP ต่อลูกค้า `[{feature, value, direction (up/down), impact=|shap|}]`
  (tree → `TreeExplainer`; linear → `x*coef`; SHAP ล้มเหลวไม่ block run)

---

<a name="12-clv"></a>
## 12. โมเดลที่ 3 — CLV (BG/NBD + Gamma-Gamma vs LightGBM)

ไฟล์: `apps/ml/src/training/clv_trainer.py` · **metric หลัก: Spearman** บน validation · target = `future_revenue_6m`

### 12.1 candidate 2 แบบ
1. **BG-NBD + Gamma-Gamma** (library `lifetimes`) — เชิงพฤติกรรม
   - RFM จากการจ่ายก่อน cutoff: `frequency = วันจ่ายไม่ซ้ำ − 1`, `recency`, `T`, `monetary_value`
   - penalizer grid `[0.001, 0.01, 0.1]` เลือกด้วย val Spearman
   - `predicted_clv = clip(n_purchases × expected_value, 0, ∞)`
   - **`p_alive` = conditional_probability_alive** (clip 0–1)
2. **LightGBM Tweedie regressor** — `objective="tweedie"`, จูน Optuna `TWEEDIE_TRIALS=50`
   (`tweedie_variance_power[1.1,1.9]`, num_leaves[16,128], ฯลฯ); objective = val Spearman

### 12.2 การเลือก champion + ทำนาย
```
champion = "lgbm_tweedie" ถ้า tweedie_val_spearman > best_bgnbd_spearman ไม่งั้น "bgnbd_gamma_gamma"
```
- **BG-NBD fit เสมอ** และ **`p_alive` มาจาก BG-NBD เสมอ** ไม่ว่าใครชนะ (artifact เก็บทั้งคู่)
- ถ้า champion = Tweedie → ทำ **whale-tail correction** (`_blend_clv_tail`): สำหรับ top-decile
  (`CLV_TAIL_QUANTILE=0.90`, freq floor 2.0) ใช้ `max(tweedie, bgnbd_clv)` (ข้ามถ้าประชากร < 50)

---

<a name="13-credit"></a>
## 13. โมเดลที่ 4 — Credit Forecast (Quantile + AFT survival)

ไฟล์: `apps/ml/src/training/credit_trainer.py` · **metric หลัก: interval coverage p10–p90** (ไม่ใช่ MAE)

### 13.1 LightGBM quantile regression
- `QUANTILES = [0.10, 0.25, 0.50, 0.75, 0.90]`, `HORIZONS = {30, 90}`, `CREDIT_TRIALS=30`, `TARGET_COVERAGE=0.80`
- **Anchored log-ratio target:** โมเดลทำนาย "ส่วนแก้" เทียบ baseline carryover
  `target = log1p(clip(y,0)) − anchor` (anchor จาก carryover); แมปกลับด้วย `expm1`; clip ส่วนแก้ที่ 1.5
- จูน Optuna ต่อ horizon ด้วย p50 pinball loss แล้ว fit ครบทั้ง 5 quantile
- **Median shrinkage λ** (`linspace(0,1,11)`) ลด val p50 MAE; λ=0 = baseline carryover (fallback ปลอดภัย)
- **Interval widening** (`linspace(0.3,3.0,28)`) ปรับให้ coverage p10–p90 ≈ 0.80
- **แก้ quantile crossing:** pin p50, บีบ p25/p10 ให้ ≤ p50, p75/p90 ให้ ≥ p50

### 13.2 Top-up timing — XGBoost AFT survival
- `objective="survival:aft"`, `eval_metric="aft-nloglik"` — รองรับ censored ~70% (คนที่ยังไม่เติม)
- grid distribution × scale = (`normal/logistic`) × (`0.5/1.0/1.5`), `AFT_ROUNDS=600`, เลือกด้วย val urgent-F2
- `URGENT_TOPUP_DAYS=14`; params: `max_depth=4, lr=0.05, subsample=0.8, colsample=0.8, min_child_weight=10, lambda=1, seed=42`

### 13.3 output ของ credit
- `predicted_credit_usage_30d` = p50 ของ 30d; `predicted_credit_usage_90d` = `max(p50_90d, p50_30d)` (90d ≥ 30d)
- ช่วง `{p10_30d, p90_30d, p10_90d, p90_90d}` (90d floor ที่ 30d)
- `estimated_days_until_topup` = `min(ceil(AFT.predict_days), 365)`; **fallback heuristic**
  (`credit_balance / (p50_30d/30)`) เฉพาะ row ที่โมเดลไม่ได้ค่า
- `credit_urgency_level`: default `stable`; `≤90→monitor`, `≤30→warning`, `≤14→critical`

---

<a name="14-baselines"></a>
## 14. Baselines (เส้นเปรียบเทียบ)

ทุก baseline วัดด้วย harness เดียวกับ candidate และเก็บลง `ml_model_evaluations` (`baseline_name`)
candidate ที่ชนะ baseline ไม่ได้ จะ **ไม่ถูก promote**

- **Churn:** `recency_rule_90d` (`clip(days_since_last_activity/180,0,1)`), `rfm_quartile`, `logistic_regression`
- **CLV:** `segment_mean` (ค่าเฉลี่ยรายได้อนาคตตาม quartile ของ `total_revenue_180d`), `revenue_180d_carryover`
- **Credit:** `last_30d_carryover` (`usage_recent_90d/3 × horizon/30`), `moving_avg_90d` (`usage_total_180d/6 × horizon/30`)

---

<a name="15-metrics"></a>
## 15. Metrics (ตัววัดผล)

ไฟล์: `apps/ml/src/training/metrics.py`

- **Churn:** `pr_auc, roc_auc, f1, precision, recall, recall_at_top10pct, lift_at_top10pct, brier, ece,
  threshold, positive_rate, n` + calibration curve (10 bin) + confusion + lift table
- **ECE** (`expected_calibration_error`): 10 bin เท่ากัน `ECE = Σ น้ำหนัก_bin × |mean(y_true) − mean(y_prob)|`
  — ฟังก์ชันเดียวกันนี้ใช้ทั้งตอนเลือก calibrator และตอน gate
- **CLV:** `spearman, mae, rmse, smape, top_decile_capture, n`
- **Credit:** `mae_30d/90d, smape_30d/90d, coverage_p10_p90 (+30d/90d), pinball_p50_30d/90d, n`
  + top-up: `urgent_topup_precision/recall, topup_mae_days_observed`

---

<a name="16-promotion"></a>
## 16. Promotion Gate แบบ 2 ชั้น (Safety / Quality)

ไฟล์: `apps/ml/src/training/promotion.py` — **churn ใช้ gate ใหม่ 2 ชั้นนี้**
(CLV/Credit ยังใช้ boolean gate เดิมใน runner)

**Config churn (`CHURN_PROMOTION_CONFIG`):**
```
primary_metric        = "pr_auc"
higher_is_better      = True
champion_margin       = 0.0
stability_max_rel_drop= 0.30
calibration_ceiling   = 0.10   # เพดานความปลอดภัย ECE
calibration_target    = 0.05   # เป้า ECE
calibration_penalty   = 1.0
```

**Stage 1 — SAFETY (binary, ตกข้อใดข้อหนึ่ง = ตัดออก):**
- `leakage_ok` ผ่าน
- `artifact_ok` (ตัวที่ชนะต้องโหลด artifact กลับได้)
- ชนะ baseline บน validation **และ** test
- ไม่แพ้ baseline บน backtest ใด ๆ
- ชนะ champion เดิม (เฉลี่ยบน backtest ที่ใช้ร่วมกัน) `champion_gap ≥ 0`
- เสถียร: `instability ≤ 0.30` (backtest ที่แย่สุดต้องไม่ตกเกิน 30% จาก median)
- **ECE ≤ 0.10 (เพดานปลอดภัย)** — เกินถือว่าไม่ปลอดภัย ตัดทิ้ง

**Stage 2 — QUALITY (composite ในกลุ่มที่ผ่าน Stage 1):**
```
quality   = mean([primary_test, *primary_backtests])        # PR-AUC แบบ robust
penalty   = 1.0 × max(0, ECE − 0.05)
composite = quality − penalty
winner    = argmax(composite)
```
→ **calibration ระหว่าง 0.05–0.10 เป็น "soft penalty" ไม่ใช่ veto** (นี่คือหัวใจที่รื้อใหม่ใน PR #21:
TabICLv2 ที่ PR-AUC สูงสุดแต่ ECE 0.061 เคยถูก gate เดิม veto จนแพ้ logistic — gate ใหม่ให้แข่งแบบหักคะแนนแทน)
ถ้าไม่มีตัวผ่านเลย → คง champion เดิม

> test: `apps/ml/scripts/verify_promotion_policy.py` (6/6 ผ่าน)

---

<a name="17-leakage"></a>
## 17. Leakage Suite (ชุดตรวจการรั่วของข้อมูล)

ไฟล์: `apps/ml/src/training/leakage.py` — รันอัตโนมัติหลัง train เก็บลง `ml_data_validation_reports`
(`validation_type='leakage'`) ข้อที่ `severity="fail"` จะ block การ promote

**Churn (5 ข้อ):**
1. `single_feature_auc_scan` (fail) — feature เดี่ยว → tree depth 2; ตกถ้า worst AUC > `0.90`
2. `target_shuffle` (fail) — สับ label 5 รอบ refit; ตกถ้า lower-bound ของ deviation > `0.07`
3. `suspect_drop_audit` (fail) — AUC เต็ม vs ตัด recency suspects; ตกถ้าตกเกิน `0.30`
4. `split_contamination` (fail) — acc_id ไม่ทับกันข้าม split
5. `score_sanity` (warn) — val AUC > `0.97` เตือนว่าสูงผิดธรรมชาติ

**Regression (CLV/Credit):** `split_contamination`, `single_feature_spearman_scan` (warn, limit 0.95),
`target_shuffle` (fail, tol 0.10), `score_sanity` (warn, 0.97)

---

<a name="18-drift"></a>
## 18. Drift Monitoring (PSI)

ไฟล์: `apps/ml/src/training/drift.py` (PR #19)

- **ตอน train:** `build_feature_baseline` เก็บการกระจาย feature ของ train ลง artifact (bin 10 ช่อง, สัดส่วน, mean/std/p50/p95)
- **ตอน predict:** `compute_feature_drift` bin feature จริง (เฉพาะกลุ่มที่ทำนาย) เทียบ baseline
  `PSI = Σ (actual − expected) × ln(actual/expected)`
- **แถบ:** `PSI<0.10` stable; `0.10–0.25` minor_drift; `≥0.25` major_drift
- **เก็บ:** 1 report `validation_type="drift"` ต่อโมเดล ลง `ml_data_validation_reports.drift_json`
  — **ไม่ block** (stable→passed, ไม่งั้น warning); champion ที่ train ก่อนมี drift (ไม่มี baseline) จะข้าม

---

<a name="19-training-runner"></a>
## 19. Training Runner — ลำดับ Gate ทั้งหมด

ไฟล์: `apps/ml/src/training/runner.py` · `run_training(id)` ห่อด้วย try/except ที่ลงเอย `status='failed'` เสมอ
cutoff ต้องเป็นต้นเดือน · seed 42 · `BACKTEST_STEP_MONTHS=2, MAX_BACKTESTS=6, MIN_BACKTEST_HISTORY_DAYS=365`

**ลำดับ:**
1. mark `in_progress`, เขียน `training_config`
2. **Gate 1–5** (`validation.py`) — ถ้า status `failed` ข้อใด = abort:
   - Gate 1 `check_train_source_readiness` — ตารางพร้อม, source `ready`, clean_manifest, ข้อมูลไม่ว่าง
   - Gate 2 `check_train_schema_quality` — คอลัมน์ครบ, acc_id/วันที่ถูก, usage ≥ 0, category ถูก, ตรวจ dup/orphan
   - Gate 3 `check_train_cutoff_feasibility` — หน้าต่าง active/horizon > 0, มีกิจกรรม, มีประวัติก่อน, อนาคตครอบ horizon
   - Gate 4 `check_train_label_viability` — churn eligible≥500/positive≥100/negative≥100/rate∈[0.05,0.80];
     clv eligible≥500/nonzero≥100/variance>0; credit nonzero≥500 ต่อ horizon; topup observed≥500 (warn)
   - Gate 5 `check_train_feature_leakage` — PIT: วันที่ feature < cutoff, feature ตรง superset,
     กัน snapshot leakage (`last_access, last_send, credit_sms/email, expire_sms/email`)
3. โหลด clean, สร้าง dataset ที่ cutoff
4. `adaptive_backtest_cutoffs` (≤6)
5. **credit ใช้ cutoff ใหม่กว่า** = `month_start(activity_max − 90d)` (horizon 90 สั้นกว่า ไม่ต้องเสียเดือนสด)
6. **Churn:** fit preprocessor → train 5 candidate → finalize+leakage+backtest ทุกตัว → `promotion.decide`
   → save artifact + feature-set (`tier_a_24/v1`) + model_version + evaluations → verify artifact → promote
7. **CLV:** `train_clv` → backtest → leakage → boolean gate → bundle (bgnbd+tweedie)
8. **Credit:** pool train ข้าม cutoff → `train_credit` → backtest → leakage → coverage+MAE gate → bundle (horizons+topup)
9. `completed`, เขียน `results`

**Registry (`registry.py`):** version = `{type}-{YYYY.MM}.{seq}`; `promote_model_version` แบบ transaction —
archive ตัวเก่า, ตั้งตัวใหม่ `production`, upsert `ml_model_aliases` (alias `production` 1 ตัว/model_type),
บันทึก `ml_model_activation_history`; champion = ตัวที่ชี้โดย alias `production`; manual override ผ่าน UI ได้

---

<a name="20-prediction-runner"></a>
## 20. Prediction Runner — ลำดับการทำงานตอนทำนาย

ไฟล์: `apps/ml/src/prediction/runner.py` · `run_prediction(id)` ห่อให้ทุก exception ลงเอย `failed`

1. โหลด run + cutoff, mark `in_progress`
2. **โหลด champion ผ่าน alias `production`** (churn/clv/credit) — ขาดตัวใด = error
3. **Predict gates:** `check_predict_source_readiness`, `check_predict_schema_quality`, `check_predict_feature_leakage`
   (payments/usage ฝั่ง predict เป็น warning ได้)
4. `load_predict_clean` → `build_all_features` → merge lifecycle + feature
5. เมทริกซ์ eligibility (override): churn=Active Paid, clv/credit=Active stages
6. `_feature_contract_guard` ต่อโมเดล (คอลัมน์ครบ; hash ไม่ตรง = warning ไม่ block)
7. **Drift check** (PSI) เก็บ report — ไม่ block
8. **Churn:** `predict_proba` → calibrator → `churn_probability` (clip, null ถ้าไม่ eligible) → risk level
   (ถ้า threshold หาย = error) → top-5 SHAP `churn_factors`
9. **CLV:** `_apply_clv` — p_alive จาก BG-NBD + predicted_clv + whale-tail blend
10. **Credit:** `_apply_credit` — quantile, interval, `estimated_days_until_topup` จาก AFT
11. **Descriptive:** `_apply_descriptive` — n_purchases, total_revenue, avg_transaction_value, usage_trend,
    profile_snapshot, credit_balance_total
12. **Derived:** `_apply_derived` + `_apply_segments` — value tier, revenue_at_risk, priority_score,
    credit_urgency, needs_review, segment, action_rank (ดู §22)
13. **Batch insert** — 1 แถว/ลูกค้า ลง `ml_prediction_outputs` (DELETE เดิม → insert ทีละ 1000);
    `output_status = predicted` ถ้าทั้ง 3 โมเดล eligible+predicted ไม่งั้น `partial`
14. **Post-check (Gate 15):** จำนวนแถว = จำนวนลูกค้า, churn/p_alive อยู่ใน [0,1], churn null rate ในกลุ่ม eligible ≤ 1%
    — ตก = run failed
15. mark `completed`, ตั้ง `total_customers`, `model_versions`

---

<a name="21-output-contract"></a>
## 21. Output Contract — ทุกคอลัมน์ของ `ml_prediction_outputs`

1 แถว = 1 ลูกค้า ต่อ 1 run · PK `id bigint` · `UNIQUE(prediction_run_id, acc_id)`
ลูกค้าทุกคนใน predict source ได้แถวเสมอ (ถ้าโมเดลทำนายไม่ได้ = null + เหตุผลใน `model_eligibility_json`)
ตารางนี้เก็บ **scalar เท่านั้น** (time-series อยู่ใน `predict_clean_*`)

**กลุ่ม A — Identity:** `id`, `prediction_run_id (uuid)`, `acc_id (integer)`

**กลุ่ม B — Lifecycle (ข้อเท็จจริง ไม่ใช่การทำนาย):**
`lifecycle_stage` (Ghost/Churned/Active Free/Active Paid), `sub_stage`

**กลุ่ม C — Churn:**
- `churn_probability numeric(5,4)` — calibrated, null ถ้าไม่ eligible
- `churn_risk_level text` — low/medium/high/critical (cut ด้วย threshold จาก model card; UI ห้าม hardcode)
- `churn_factors_json jsonb` — top-5 SHAP `[{feature, value, direction, impact}]`

**กลุ่ม D — CLV:**
- `predicted_clv_6m numeric(14,2)` — รายได้คาดการณ์ 180 วันข้างหน้า
- `p_alive numeric(5,4)` — จาก BG-NBD (clip 0–1)
- `customer_value_tier text` — high/mid/low/none (percentile CLV ในกลุ่ม active)

**กลุ่ม E — Credit:**
- `predicted_credit_usage_30d / 90d numeric(14,2)` — p50; 90d ≥ 30d
- `credit_forecast_interval_json jsonb` — `{p10_30d, p90_30d, p10_90d, p90_90d}`
- `estimated_days_until_topup integer` — cap 365
- `credit_urgency_level text` — critical(≤14) / warning(≤30) / monitor(≤90) / stable

**กลุ่ม F — Descriptive (ข้อเท็จจริงจาก clean ณ cutoff):**
- `usage_trend text` — increasing(>+10%) / declining(<−10%) / stable / no_usage
- `days_since_last_activity integer`
- `n_purchases integer`, `total_revenue numeric(14,2)`, `avg_transaction_value numeric(14,2)`
- `ever_paid boolean NOT NULL`
- `profile_snapshot_json jsonb` — `{join_date, customer_age_days, status_sms, status_email,
  credit_sms, credit_email, expire_sms, expire_email, last_access, last_send,
  sms_usage_share, email_usage_share, bc_usage_share, api_usage_share, otp_usage_share, usage_total_180d}`

**กลุ่ม G — Derived (business):**
- `revenue_at_risk numeric(14,2)` — `churn_probability × predicted_clv_6m`
- `priority_score numeric(5,2)` — 0–100 (log-rescale ของ revenue_at_risk; เรียงเหมือน revenue_at_risk)
- `segment text` — 1 ใน 10 segment
- `action_rank integer` — อันดับ work-list ทั้งระบบ
- `needs_review boolean NOT NULL`

**กลุ่ม H — AI explanation (Phase 2 scaffolding):**
`ai_explanation, ai_reasoning_json, ai_generated_at, ai_model, ai_status (default 'not_requested')`

**กลุ่ม I — Metadata:**
- `output_status text NOT NULL` — predicted / partial / insufficient_data
- `output_notes text`
- `model_eligibility_json jsonb` — `{churn:{eligible,status,reason}, clv:{...}, credit:{...}}` (reason เป็นภาษาไทย)
- `model_versions_json jsonb` — `{churn, clv, credit}` version id
- `created_at timestamptz NOT NULL`

**เมทริกซ์ eligibility (lifecycle ไหนได้โมเดลไหน):**
Active Paid → churn+CLV+credit ✅ · Active Free → churn ❌ (never_paid), CLV+credit ✅ ·
Churned → ทั้งหมด ❌ · Ghost → ทั้งหมด ❌

---

<a name="22-derived"></a>
## 22. Derived fields + Customer Segmentation

### 22.1 สูตร derived field

- **`customer_value_tier`:** ในกลุ่ม active ที่ CLV>0 หา `rank(pct)` ของ `predicted_clv_6m`;
  `≥0.90→high`, `≥0.50→mid`, ไม่งั้น `low`; CLV=0/null หรือไม่ active → `none` (เทียบกันภายใน run เท่านั้น)
- **`revenue_at_risk`** = `round(churn_probability × predicted_clv_6m, 2)` (null ถ้าตัวใดตัวหนึ่ง null)
- **`priority_score`** = `100 × (log1p(revenue_at_risk) − min)/(max − min)` (monotonic → เรียงเท่ากับ revenue_at_risk)
- **`estimated_days_until_topup`** — หลักจาก AFT (`ceil`, cap 365); fallback heuristic
  `credit_balance_total / (p50_30d/30)` (`credit_balance_total = credit_sms + credit_email`)
- **`credit_urgency_level`** — stable เป็น default; ≤90 monitor → ≤30 warning → ≤14 critical
- **`needs_review`** = `(churn high/critical) OR (valuable AND p_alive<0.20 AND usage_change<−0.10)` แล้วต้อง active
- **`output_status`** = predicted ถ้าทุกโมเดล eligible ไม่งั้น partial

### 22.2 Segmentation (10 segment) — `docs/CUSTOMER-SEGMENTS.md` + `_apply_segments`

**แกน 1 (value):** high = top 10%, mid = next 40%, low = bottom 50% ("valuable" = top 50%)
**แกน 2 (health):** at-risk = `risk∈{high,critical}` หรือ `p_alive<0.20`; watch = `risk=medium` หรือ `p_alive<0.50`; ไม่งั้น healthy
**momentum:** จาก `usage_change_90d_pct` — growing >+10%, declining <−10%, stable

| # | Segment | กฎ | แผน |
|---|---|---|---|
| 1 | `Protect` | valuable & at-risk | รักษาด่วน เงินเสี่ยงสูงสุด |
| 2 | `Stabilize` | valuable & watch | เช็กอินเชิงรุก |
| 3 | `Grow` | valuable & healthy | upsell |
| 4 | `Develop` | value-low + healthy + growing | บ่มเพาะรายเล็กที่กำลังโต |
| 5 | `Maintain` | default (value-low + healthy) | keep-warm |
| 6 | `Watch-low` | value-low & watch | เฝ้าระวังเบา ๆ |
| 7 | `Salvage-low` | value-low & at-risk | รักษาถ้าถูก |
| 8 | `Reactivate` | churned & sub_stage=Churned Paid | win-back |
| 9 | `Dormant` | churned (never paid) | email nurture |
| 10 | `Ghost` | stage=Ghost | ตัดออกจาก outreach |

**ลำดับ priority (work-list):** Protect, Stabilize, Grow, Develop, Maintain, Watch-low, Salvage-low, Reactivate, Dormant, Ghost
**`action_rank`:** เรียงตาม (ลำดับ segment, แล้วเงิน) — เงิน = `revenue_at_risk` สำหรับ segment กลุ่มรักษา
(Protect/Stabilize/Salvage-low/Watch-low) ไม่งั้น `predicted_clv_6m`

---

<a name="23-ml-tables"></a>
## 23. ตาราง `ml_*` อื่น ๆ ที่ใช้เก็บผล

- **`ml_prediction_runs`** — 1 แถว/run: `id, name, predict_source_id, status, cutoff_date, started_at,
  finished_at, total_customers, progress_json, model_versions_json, error_message, created_by, created_at`
- **`ml_training_runs`** — 1 แถว/การฝึก: `id, source_id, run_type, status, cutoff_date, horizon_days,
  training_config_json, progress_json, results_json, parent_training_run_id, error_message, created_by, ...`
- **`ml_model_versions`** — แต่ละ artifact: `model_type, version, status (candidate/production/archived),
  artifact_path, artifact_checksum, metrics_json, validation_metrics_json, test_metrics_json,
  feature_names_json, label_definition_json, model_card_json (เก็บ risk threshold!), is_active, ...`
- **`ml_model_evaluations`** — metric ต่อ split (Model Performance อ่านจากนี่): `evaluation_type,
  dataset_split (validation/test/backtest), baseline_name, metrics_json, confusion_matrix_json,
  calibration_json, lift_table_json, feature_importance_json, business_metrics_json, ...`
- **`ml_model_aliases`** — ตัวชี้ champion: `model_type, alias ('production'=champion), model_version_id`
- **`ml_model_activation_history`** — audit การสลับ champion: `previous/new_model_version_id, action, reason`
- **`ml_feature_sets`** — สัญญา feature: `name, version, model_type, feature_names_json,
  feature_schema_json, transform_config_json, feature_code_hash, status`
- **`ml_data_validation_reports`** — ผล gate/leakage/drift/post-check: `source_kind, training_run_id,
  prediction_run_id, validation_type, status, row_count, stats_json, anomalies_json, drift_json`

---

<a name="24-dashboard"></a>
## 24. การแสดงผล: Dashboard + API

ทุก route ใช้ `requireUser` และ scope ด้วย `createdBy = userId` (ของคนอื่น = not found) · aggregate ทำฝั่ง SQL

### 24.1 API อ่านผลทำนาย

- **`GET /prediction-runs/:id/summary`** — ยิง 8 query ขนาน คืน: lifecycle mix, churn eligible_count + by_risk
  + thresholds, revenue (`expected_at_risk = Σ revenue_at_risk ของ Active Paid`, `high_risk_exposure = Σ CLV
  ของ risk high/critical`, `monthly_actual` 12 เดือนจาก payments), value×risk matrix, credit demand_30d
  + by_urgency + topup_due_7d, top_priority (เรียง priority_score), model_versions
- **`GET /prediction-runs/:id/outputs`** — ตารางลูกค้า paginate (page_size 1–200 default 8),
  sort whitelist (`priority_score, churn_probability, predicted_clv_6m, revenue_at_risk, total_revenue,
  days_since_last_activity, estimated_days_until_topup, action_rank, acc_id`, default `priority_score:desc`),
  filter (`search, lifecycle_stage, churn_risk_level, customer_value_tier, credit_urgency_level, ever_paid`)
- **`GET /prediction-runs/:id/outputs/:acc_id`** — Customer 360 (1 แถวเต็ม via `mapOutput`)
- **`GET .../customers/:acc_id/usage-monthly | payments`** — time-series จาก `predict_clean_*`
- **`POST .../outputs/:acc_id/ai-explanation`** — สั่ง gen คำอธิบาย AI (Phase 2)

### 24.2 หน้าเว็บ

- **`/` Overview** — KPI 5 ตัว (total customers, active paid, high-risk active paid, **expected revenue at risk**,
  30d credit demand) + widget: lifecycle mix, churn risk distribution, value×risk matrix, monthly revenue,
  credit urgency, top 10 priority
- **`/customers`** — ตารางลูกค้า เรียง/กรอง/export CSV (default sort priority_score)
- **`/customers/[id]` Customer 360** — A.โปรไฟล์ (จาก snapshot) · B.ประวัติการค้า (usage 12 เดือน + payment timeline)
  · C.การทำนาย (churn+SHAP / CLV+p_alive / credit+ช่วง p10–p90) · D.priority + AI card (เฉพาะ ai_status=completed)
- **`/model-performance`** — champion ปัจจุบัน (จาก alias) + metric แยก split + เทียบ baseline + calibration curve (churn)
- **`/runs`** — จัดการ predict source + สร้าง run + ตาราง run พร้อม progress bar
- **`/training`** — สั่งฝึก + สรุปผล promote/no-promote + ประวัติการฝึก

**สถานะการแสดงผล:** ไม่มี run เสร็จ → empty state (ห้าม mock) · null เพราะไม่ eligible → "—" + tooltip จาก
`model_eligibility_json` · null เพราะข้อมูลไม่พอ → "ข้อมูลไม่พอประเมิน" · เงิน `฿` compact, %1 ทศนิยม,
วันที่ `DD MMM YYYY` (Asia/Bangkok)

---

<a name="25-constants"></a>
## 25. ภาคผนวก — สรุปค่าคงที่สำคัญทั้งหมด

| ค่าคงที่ | ค่า | ใช้ที่ |
|---|---|---|
| `EPSILON` | `1e-9` | safe ratio |
| feature windows | 180d / 90d / [90,180)d / 6 เดือน | features.py |
| credit runway clip | `[0, 24]` เดือน | features.py |
| `horizon_days` (churn/clv label) | `180` | labels.py |
| `active_window_days` | `180` | labels/features |
| `CREDIT_HORIZONS` | `{30, 90}` วัน | labels.py |
| feature contract | churn/clv = `tier_a_24` (24), credit = `tier_a_27` (27) | features.py |
| `RANDOM_SEED` | `42` | ทุกที่ |
| train/val/test split | `60/20/20` (holdout 0.40, test-within 0.50) | datasets.py |
| min rows for split | `< 25` → ทั้งหมดเป็น train | datasets.py |
| backtest | step 2 เดือน, ≤6 cutoff, ประวัติ ≥365 วัน | datasets.py |
| Optuna trials | churn LGBM **100**, churn XGB **50**, CLV Tweedie **50**, credit quantile **30**/horizon | trainers |
| topup AFT | 600 rounds, grid 2×3, `URGENT_TOPUP_DAYS=14` | credit_trainer |
| churn calibration | Platt vs Isotonic เลือกด้วย ECE; iso ต้อง positive ≥ 200 | churn_trainer |
| churn high_threshold band | `clip(f2, 0.35, 0.85)` | churn_trainer |
| risk bands | medium=high×0.5, critical=high+0.6×(1−high) | metrics.py |
| **promotion ECE** | ceiling **0.10** (veto), target **0.05** (penalty) | promotion.py |
| stability | `instability ≤ 0.30` | promotion.py |
| credit coverage gate | test/val ∈ `[0.75, 0.90]`, backtest ∈ `[0.70, 0.92]` | runner.py |
| credit MAE tolerance | `× 1.10` ของ baseline | runner.py |
| CLV whale-tail | quantile `0.90`, freq floor `2.0`, ประชากร ≥ `50` | clv_trainer |
| PSI drift bands | `<0.10` stable, `0.10–0.25` minor, `≥0.25` major | drift.py |
| batch sizes | raw/clean insert **500**, output insert **1000** | import / runner |
| `TOPUP_CAP_DAYS` | `365` | runner.py |

---

*จัดทำจากการอ่านโค้ดจริงใน `apps/ml/src/`, `apps/api/src/`, `db/init/001_schema.sql`,
`moby-data-prep/docs/` และ `docs/ML-V2-*.md` — มิ.ย. 2026*
