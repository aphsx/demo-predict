# Data Structure — [1Moby] Real Data

> File: `[1Moby] Data_example for Bangkok university.xlsx`
> วิเคราะห์: 2026-03-18

---

## สรุปภาพรวม

| Sheet | แถวข้อมูล | คีย์หลัก | ใช้ใน training |
|---|---|---|---|
| Users+User_profile | 25,095 | `acc_id` | ✅ หลัก |
| Backend_payment | 13,884 | `uid`, `acc_id` | ✅ หลัก |
| SMS_usage (BC) | 25,310 | `acc_id`, `year`, `month` | ✅ |
| SMS_usage (API) | 23,728 | `acc_id`, `year`, `month` | ✅ |
| SMS_usage (OTP) | 23,728 | `acc_id`, `year`, `month` | ⚠️ ซ้ำกับ API ทุก row |
| Email_usage (BC) | 2,370 | `acc_id`, `year`, `month` | ✅ |
| Email_usage (API) | 999 | `acc_id`, `year`, `month` | ✅ |
| Email_usage (OTP) | 999 | `acc_id`, `year`, `month` | ✅ |

**ช่วงข้อมูล:** Jan 2024 – Jan 2026

---

## Table Details

### 1. Users+User_profile (25,095 rows)
> Master table — 1 row ต่อ 1 account

| Column | Type | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `acc_id` | int | 23 | Primary key |
| `status (SMS)` | str | PAID / TRIAL | PAID=24,946 · TRIAL=147 |
| `user.credit + user.credit_premium` | int | 23,466,015 | SMS credits คงเหลือ |
| `credit_email` | int | 2,000 | Email credits คงเหลือ |
| `expire` | datetime | 2030-04-01 | วันหมด SMS subscription |
| `expire_email` | datetime | 2026-03-05 | วันหมด Email subscription |
| `status (Email)` | str | PAID / TRIAL | TRIAL=24,741 · PAID=352 |
| `join_date` | datetime | 2009-02-25 | วันสมัครครั้งแรก |
| `last_access` | datetime | 2026-02-02 | Login ล่าสุด |
| `last_send` | datetime | 2026-03-01 | ส่ง SMS/Email ล่าสุด |

**ข้อสังเกต:**
- SMS ส่วนใหญ่เป็น PAID (99.4%) — คนที่เคย top-up จริง
- Email ส่วนใหญ่เป็น TRIAL (99%) — product ที่ยังไม่ค่อย convert

---

### 2. Backend_payment (13,884 rows)
> Transaction ทุกครั้งที่มีการซื้อ credit

| Column | Type | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `uid` | int | 78569 | Transaction ID |
| `payment_date` | datetime | 2024-01-06 | วันที่ซื้อ |
| `acc_id` | int | 274256 | FK → Users |
| `credit_add` | int | 75,000 | credits ที่ได้รับ |
| `amount` | float | 30,000 | ยอดเงิน (บาท) |
| `credit_type` | str | sms / email | ประเภท product |

**ข้อสังเกต:**
- SMS payment: 13,467 rows (97%)
- Email payment: 415 rows (3%)
- Amount range: 0 – 4,235,294 บาท (mean ~58,000 บาท)
- มีเพียง 4,495 unique accounts ที่เคยจ่ายเงิน (จาก 25,093 ใน Users)

---

### 3. SMS_usage (BC) — Broadcast Channel (25,310 rows)
> Monthly SMS volume ส่งผ่าน Broadcast (bulk SMS)

| Column | Type | หมายเหตุ |
|---|---|---|
| `year` | int | 2024–2025 |
| `month` | int | 1–12 |
| `acc_id` | int | FK → Users |
| `usage` | int | จำนวน SMS ที่ส่ง |

---

### 4. SMS_usage (API) (23,728 rows)
> Monthly SMS volume ส่งผ่าน API

| Column | Type | หมายเหตุ |
|---|---|---|
| `year` | int | 2024–2025 |
| `month` | int | 1–12 |
| `acc_id` | int | FK → Users |
| `usage` | int | จำนวน SMS |

---

### 5. SMS_usage (OTP) ⚠️ DUPLICATE
> **ข้อมูลซ้ำกับ SMS_usage (API) ทุก row** — ต้องถามว่าเป็น error หรือ OTP=API intentional

---

### 6. Email_usage (BC) (2,370 rows)
> Monthly Email volume ส่งผ่าน Broadcast

| Column | Type | หมายเหตุ |
|---|---|---|
| `year` | int | 2024–2025 |
| `month` | int | 1–12 |
| `acc_id` | int | FK → Users |
| `usage` | int | จำนวน Email ที่ส่ง |

---

### 7. Email_usage (API) (999 rows)
> Monthly Email volume ส่งผ่าน API (ช่วง Jan 2024+)

---

### 8. Email_usage (OTP) (999 rows)
> Monthly Email volume ส่งผ่าน OTP (ช่วง Sep 2024+, ต่างจาก API)

---

## Relationship Diagram

```
Users+User_profile (acc_id) ──┬── Backend_payment (acc_id)
                               ├── SMS_usage BC    (acc_id + year + month)
                               ├── SMS_usage API   (acc_id + year + month)
                               ├── Email_usage BC  (acc_id + year + month)
                               ├── Email_usage API (acc_id + year + month)
                               └── Email_usage OTP (acc_id + year + month)
```

---

## ปัญหาที่ต้องแก้ก่อน Training

| # | ปัญหา | วิธีแก้ |
|---|---|---|
| 1 | SMS_usage OTP = API ทุก row | ตรวจสอบกับ 1Moby ว่า OTP sheet ถูกต้องไหม หรือ drop ทิ้ง |
| 2 | acc_id overlap ไม่ครบ | SMS_BC มีแค่ 3,634/25,093 accounts — ส่วนที่เหลือคือ TRIAL หรือ inactive |
| 3 | Payment เพียง 4,495 accounts | 20,000+ accounts ไม่เคยจ่ายเงินเลย — เป็น churn โดย default |
| 4 | `last_send` บาง row เป็น `#N/A` | ต้องทำ null handling |
| 5 | Credit column ชื่อยาว มี space | ต้อง rename ก่อน process |

---

## สิ่งที่ต้องทำก่อน Training (ขั้นตอน)

### Step 1 — Data Merge
```
Users + Payment → RFM features (เหมือนเดิม)
SMS_usage (BC + API) → aggregate per acc_id per month → total_sms_bc, total_sms_api
Email_usage (BC + API + OTP) → aggregate → total_email_bc, total_email_api, total_email_otp
```

### Step 2 — Feature Engineering
- SMS features: total volume, active months, BC vs API ratio, trend (decay)
- Email features: email adoption flag (เคยใช้ email ไหม), email usage trend
- Cross-product: ใช้ทั้ง SMS + Email = lower churn risk?
- Payment: เหมือนเดิม (RFM)

### Step 3 — Label Definition
- **Churn target (SMS):** expire < reference_date AND ไม่มี payment หลัง expire
- **Churn target (Email):** expire_email < reference_date AND ไม่มี email payment หลัง expire
- สามารถ train แยก 2 model (SMS churn, Email churn) หรือ รวม

### Step 4 — Training
- Architecture เดิม (Out-of-Time validation) ยังใช้ได้
- เพิ่ม features ใหม่จาก email + channel breakdown
- Reference date: ประมาณ Oct 2025 (90 วันก่อนข้อมูลล่าสุด Jan 2026)

---

## สรุป: ต้องใช้กี่ sheet?

| Sheet | ต้องใช้ |
|---|---|
| Users+User_profile | ✅ ต้องใช้ |
| Backend_payment | ✅ ต้องใช้ |
| SMS_usage (BC) | ✅ ต้องใช้ |
| SMS_usage (API) | ✅ ต้องใช้ |
| SMS_usage (OTP) | ❓ รอ clarify (ข้อมูลซ้ำ API) |
| Email_usage (BC) | ✅ ต้องใช้ |
| Email_usage (API) | ✅ ต้องใช้ |
| Email_usage (OTP) | ✅ ต้องใช้ |

**→ ใช้ทั้งหมด 7 sheets (ยกเว้น OTP SMS ที่ต้อง clarify)**
