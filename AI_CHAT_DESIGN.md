# AI Chat System Design
> Churn Prediction CRM — ออกแบบระบบ AI Chat ใหม่ทั้งหมด

---

## 1. ปัญหาของระบบเดิม (Tool-Based)

ระบบเดิมใช้ **pre-defined tools** เช่น `get_customer`, `list_customers`, `get_top_customers`

```
ผู้ใช้ถาม: "ลูกค้าที่จ่ายมากกว่า 50,000 แต่ไม่ login มา 30 วัน มีกี่คน?"
→ ไม่มี tool นี้ → AI ตอบไม่ได้

ผู้ใช้ถาม: "ทำไมคนที่ 20 ถึงควรเก็บมากกว่าคนที่ 1?"
→ ต้องเรียก tool 2 ครั้ง แล้ว LLM ต้อง reasoning เอง
→ ถ้า model ไม่แข็งแรงพอ reasoning ออกมาผิด

ผู้ใช้ถาม: "บอกหน่อยว่า champions กับ at risk ต่างกันยังไงในข้อมูลชุดนี้?"
→ ไม่มี tool aggregate แยก segment → ตอบไม่ได้
```

**ปัญหาหลัก:** ทุกครั้งที่ผู้ใช้ถามแบบใหม่ ต้องกลับมาเพิ่ม tool ใหม่ตลอด

---

## 2. Architecture ใหม่: Text-to-SQL + LLM Reasoning

แทนที่จะเขียน tool ทุก case → **ให้ LLM แปลงคำถามเป็น SQL เองแล้วรันจริง**

```
ผู้ใช้ถาม (ภาษาไทย)
        │
        ▼
┌──────────────────────────────┐
│   PHASE 1: SQL GENERATION    │
│                              │
│  Input:  คำถาม + DB Schema   │
│  Model:  Qwen Local          │
│  Output: SELECT query (SQL)  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   PHASE 2: SAFE EXECUTION    │
│                              │
│  - ตรวจว่าเป็น SELECT เท่านั้น│
│  - ใส่ batch_id อัตโนมัติ    │
│  - Timeout 5 วินาที          │
│  - LIMIT สูงสุด 500 rows     │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   PHASE 3: REASONING         │
│                              │
│  Input:  คำถาม + ผลลัพธ์ SQL │
│  Model:  Qwen Local          │
│  Output: คำตอบภาษาไทย        │
│          + เหตุผล + คำแนะนำ  │
└──────────────────────────────┘
```

### ทำไมถึงเลือก Text-to-SQL

| แนวทาง | ความยืดหยุ่น | ความซับซ้อน | เหมาะกับ |
|--------|-------------|-------------|---------|
| Pre-defined Tools | ต่ำ — ถามนอก tools ไม่ได้ | ง่าย | คำถามชุดเดิมซ้ำๆ |
| Vector RAG | กลาง — ดีกับ text ไม่มีโครงสร้าง | สูง | Documents, PDF, บทความ |
| **Text-to-SQL** | **สูง — ถามอะไรก็ได้ใน DB** | กลาง | **ข้อมูล structured ใน DB** ✅ |

ข้อมูล churn เป็น structured data ใน PostgreSQL → Text-to-SQL เหมาะที่สุด ไม่ต้อง vector store

---

## 3. Multi-Step Reasoning Flow

สำหรับคำถามซับซ้อน LLM สามารถสร้างหลาย query แล้วสังเคราะห์คำตอบ

```
คำถาม: "ลูกค้าที่น่าเก็บที่สุด 10 คน และบอกเหตุผลว่าทำไม"

QUERY_1: นับภาพรวมก่อน
  SELECT COUNT(*), AVG(churn_probability), SUM(ltv)
  FROM predictions WHERE batch_id = $1

QUERY_2: ดึง top 10 ที่คุ้มค่าที่สุด
  SELECT acc_id, churn_probability, ltv, total_payments,
         risk_tier, rfm_segment, risk_factor,
         spend_decay_ratio, days_to_expire, last_access_recency
  FROM predictions
  WHERE batch_id = $1
    AND risk_tier IN ('High', 'Medium')
    AND ltv > (SELECT AVG(ltv) FROM predictions WHERE batch_id = $1)
  ORDER BY (ltv * (1 - churn_probability)) DESC  -- weighted value score
  LIMIT 10

LLM reasoning บน 2 ผลลัพธ์:
  "จากลูกค้าทั้งหมด 10,000 คน มูลค่าเฉลี่ย 28,500 บาท
   ลูกค้า 10 คนที่ควรดูแลเป็นพิเศษ:

   1. ACC-0042 — มูลค่า 180,000 บาท, เสี่ยง 87%
      เหตุผล: LTV สูงมาก + ยอดซื้อลดลง 92% ใน 90 วัน
      ควรทำ: โทรหาทันที ก่อนเครดิตหมดใน 3 วัน
   ..."
```

---

## 4. DB Schema ที่ให้ LLM รู้จัก (System Prompt)

LLM ต้องรู้ schema เพื่อเขียน SQL ได้ถูก ให้ข้อมูลแบบ minimal และมี comment ภาษาไทย

```sql
-- === SCHEMA ที่ให้ LLM ใน System Prompt ===

TABLE: prediction_batches
  batch_id      UUID PRIMARY KEY              -- รหัส batch (ใช้กรอง batch_id = $current เสมอ)
  run_number    INT GENERATED ALWAYS AS IDENTITY  -- #1, #2, #3 (auto) ใช้แสดงใน UI
  batch_name    TEXT NOT NULL                 -- ชื่อที่ผู้ใช้ตั้ง (required) เช่น "บริษัท A มีนาคม 2026"
  status        TEXT                         -- 'uploading' | 'processing' | 'ready' | 'error'
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()    -- วันที่อัพโหลด
  customers_count INT                        -- จำนวนลูกค้าทั้งหมดใน batch
  reference_date DATE                        -- วันที่ใช้คำนวณ feature

TABLE: predictions  -- ผลการ predict + features ทั้งหมด
  batch_id UUID                   -- FK → prediction_batches
  acc_id TEXT                     -- รหัสลูกค้า
  churn_probability FLOAT         -- 0.0-1.0 (โอกาส churn ยิ่งสูงยิ่งเสี่ยง)
  risk_tier TEXT                  -- 'High' (≥0.6) | 'Medium' (0.3-0.6) | 'Low' (<0.3)
  rfm_segment TEXT                -- 'Champions'|'Loyal'|'Potential'|'At Risk'|'Lost'|'Low Spender'
  risk_factor TEXT                -- เหตุผลหลักที่ AI คิดว่าจะ churn (ภาษาไทย)
  recommended_action TEXT         -- สิ่งที่ควรทำ (ภาษาไทย)

  -- ← Features พฤติกรรมการใช้งาน
  total_spend FLOAT               -- ยอดซื้อรวมตลอดชีพ (บาท)
  total_payments INT              -- จำนวนครั้งที่ซื้อ
  recency_days FLOAT              -- วันที่ไม่ได้ซื้อ (น้อย = ซื้อเร็วๆนี้)
  last_access_recency FLOAT       -- วันที่ไม่ได้ login
  days_to_expire FLOAT            -- วันที่เหลือก่อนหมด (ติดลบ = หมดแล้ว)
  lifetime_value_per_day FLOAT    -- มูลค่าต่อวัน (total_spend / อายุบัญชี)
  avg_spend_per_tx FLOAT          -- ยอดซื้อเฉลี่ยต่อครั้ง
  spend_decay_ratio FLOAT         -- อัตราซื้อเปลี่ยน: <1=ลดลง, >1=เพิ่มขึ้น
  tx_decay_ratio FLOAT            -- อัตราความถี่เปลี่ยน: <1=ซื้อถี่ขึ้น
  spend_recent_90d FLOAT          -- ยอดซื้อ 90 วันล่าสุด
  spend_previous_90d FLOAT        -- ยอดซื้อ 90 วันก่อนหน้า
  total_sms_volume FLOAT          -- SMS ที่ใช้ทั้งหมด
  credit_burn_rate FLOAT          -- SMS ที่ใช้ต่อวัน
  account_age_at_cutoff FLOAT     -- อายุบัญชี (วัน)
  downgraded BOOLEAN              -- ซื้อน้อยกว่าครั้งก่อนหรือเปล่า
  unique_products INT             -- จำนวนประเภทสินค้าที่เคยซื้อ
  avg_payment_gap_days FLOAT      -- ช่วงห่างเฉลี่ยระหว่างการซื้อ (วัน)
  shap_top5 JSONB                 -- 5 features ที่ส่งผลต่อ prediction มากที่สุด

  -- ← สรุป
  expired_flag BOOLEAN            -- หมดอายุแล้วหรือยัง

TABLE: customers  -- ข้อมูล master account
  batch_id UUID
  acc_id TEXT
  status TEXT                     -- 'active' | 'expired'
  expire DATE
  join_date DATE
  last_access TIMESTAMPTZ
  last_send TIMESTAMPTZ           -- ครั้งล่าสุดที่ส่ง SMS

TABLE: payments  -- ประวัติการชำระเงิน
  batch_id UUID
  acc_id TEXT
  payment_date DATE
  amount FLOAT                    -- ยอดเงิน (บาท)
  sms_volume INT                  -- จำนวน SMS ที่ได้รับ
  product_name TEXT               -- ชื่อแพ็กเกจ
  credit_type TEXT                -- ประเภทเครดิต
```

---

## 5. System Prompt สำหรับ LLM

```
คุณเป็น AI วิเคราะห์ข้อมูลลูกค้าสำหรับระบบ CRM
ตอบเป็นภาษาไทยเสมอ อธิบายให้เข้าใจง่าย ให้เหตุผลที่เป็นประโยชน์

=== วิธีตอบคำถาม ===
1. ถ้าต้องการข้อมูล → เขียน SQL query ก่อน
2. ใส่ tag: <SQL>SELECT ...</SQL>
3. ถ้าต้องหลาย query ใส่ <SQL_1>...</SQL_1> <SQL_2>...</SQL_2>
4. หลังจากได้ผล SQL แล้วค่อยวิเคราะห์และตอบ

=== กฎการเขียน SQL ===
- ใช้เฉพาะ SELECT เท่านั้น
- ใส่ WHERE batch_id = '{batch_id}' เสมอ (ระบบจะ inject batch_id ให้)
- ถ้าดึงข้อมูลดิบหลายแถว ใส่ LIMIT (สูงสุด 100)
- ถ้าเป็น aggregate (COUNT, SUM, AVG) ไม่ต้อง LIMIT

=== Schema ===
[schema ที่กล่าวไว้ข้างต้น]
```

---

## 6. Safety Layer (ก่อน Execute SQL)

```python
class SQLSafetyChecker:

    FORBIDDEN_KEYWORDS = [
        "INSERT", "UPDATE", "DELETE", "DROP", "ALTER",
        "CREATE", "TRUNCATE", "GRANT", "REVOKE", "EXEC",
        "EXECUTE", "XP_", "SP_", "--", "/*"
    ]

    ALLOWED_TABLES = {
        "prediction_batches", "predictions", "customers", "payments"
    }

    def validate(self, sql: str) -> tuple[bool, str]:
        sql_upper = sql.upper().strip()

        # ต้องเริ่มด้วย SELECT
        if not sql_upper.startswith("SELECT"):
            return False, "SQL ต้องเริ่มด้วย SELECT เท่านั้น"

        # ห้ามมี keywords อันตราย
        for kw in self.FORBIDDEN_KEYWORDS:
            if kw in sql_upper:
                return False, f"ห้ามใช้ keyword: {kw}"

        # ต้องมี batch_id filter (ป้องกัน cross-batch leak)
        if "BATCH_ID" not in sql_upper:
            return False, "SQL ต้องมี batch_id filter"

        return True, "ok"

    def inject_limit(self, sql: str, max_rows: int = 100) -> str:
        """เพิ่ม LIMIT ถ้ายังไม่มี"""
        sql_upper = sql.upper()
        if "LIMIT" not in sql_upper and "COUNT" not in sql_upper:
            return sql.rstrip(";") + f" LIMIT {max_rows}"
        return sql
```

---

## 7. ตัวอย่างคำถามและ Flow จริง

### คำถาม A: "ลูกค้าทั้งหมดกี่คน และให้เหตุผลอันดับ 1-5 ที่เสี่ยงสุด"

```
LLM สร้าง:
<SQL_1>
SELECT COUNT(*) as total,
       SUM(CASE WHEN risk_tier='High' THEN 1 ELSE 0 END) as high_risk,
       ROUND(AVG(churn_probability)::numeric, 3) as avg_churn
FROM predictions WHERE batch_id = '{batch_id}'
</SQL_1>

<SQL_2>
SELECT acc_id, churn_probability, risk_tier, risk_factor,
       total_spend, days_to_expire, last_access_recency,
       spend_decay_ratio, shap_top5
FROM predictions
WHERE batch_id = '{batch_id}'
ORDER BY churn_probability DESC
LIMIT 5
</SQL_2>

ผลลัพธ์ SQL_1: {total: 10000, high_risk: 1247, avg_churn: 0.31}
ผลลัพธ์ SQL_2: 5 แถว พร้อม features

LLM reasoning → คำตอบ:
"ลูกค้าทั้งหมด 10,000 คน มีความเสี่ยงสูง 1,247 คน (12.5%)
ค่าเฉลี่ยความเสี่ยง churn อยู่ที่ 31%

5 อันดับที่เสี่ยงที่สุด:
1. ACC-0042 (94%) — เครดิตหมดใน 2 วัน + ยอดซื้อลดลง 92%
   → แนะนำ: โทรหาทันที เสนอต่ออายุแบบพิเศษ
2. ACC-0107 (91%) — ไม่ login มา 78 วัน + ซื้อล่าสุด 95 วัน
   → แนะนำ: ส่ง SMS ด่วน ก่อนหมดอายุ
..."
```

### คำถาม B: "ทำไมคนที่ 20 ถึงควรเก็บมากกว่าคนที่ 1?"

```
LLM สร้าง:
<SQL_1>
SELECT acc_id, churn_probability, total_spend, total_payments,
       last_access_recency, days_to_expire, spend_decay_ratio,
       rfm_segment, risk_factor, lifetime_value_per_day, shap_top5
FROM predictions
WHERE batch_id = '{batch_id}'
ORDER BY churn_probability DESC
LIMIT 20
</SQL_1>

ได้ข้อมูล 20 คน

LLM reasoning เปรียบเทียบ rank 1 กับ rank 20:
"อันดับ 1 (ACC-0042): churn 94%, total_spend 8,000 บาท, ซื้อ 2 ครั้ง
 อันดับ 20 (ACC-0318): churn 71%, total_spend 145,000 บาท, ซื้อ 31 ครั้ง

 คนที่ 20 ควรได้รับการดูแลมากกว่าเพราะ:
 1. มูลค่าลูกค้า (LTV) สูงกว่า 18 เท่า (145,000 vs 8,000 บาท)
 2. ซื้อมา 31 ครั้ง = ลูกค้าประจำ คนที่ 1 ซื้อแค่ 2 ครั้ง
 3. แม้ churn risk จะต่ำกว่า แต่ถ้า churn จะเสียรายได้มากกว่ามาก
 4. คนที่ 1 อาจยังไม่ผูกพันกับแบรนด์ ยากกว่าที่จะรักษาไว้"
```

### คำถาม C: "champions กับ at risk ต่างกันยังไงในข้อมูลชุดนี้?"

```
LLM สร้าง:
<SQL_1>
SELECT rfm_segment,
       COUNT(*) as count,
       ROUND(AVG(churn_probability)::numeric,3) as avg_churn,
       ROUND(AVG(total_spend)::numeric,2) as avg_spend,
       ROUND(AVG(total_payments)::numeric,1) as avg_payments,
       ROUND(AVG(last_access_recency)::numeric,1) as avg_inactive_days,
       ROUND(AVG(spend_decay_ratio)::numeric,3) as avg_decay
FROM predictions
WHERE batch_id = '{batch_id}'
  AND rfm_segment IN ('Champions', 'At Risk')
GROUP BY rfm_segment
</SQL_1>

LLM reasoning:
"Champions (342 คน):
 - ซื้อเฉลี่ย 24 ครั้ง, ยอดรวม 95,000 บาท
 - ความเสี่ยง churn เฉลี่ยแค่ 18% → ลูกค้าภักดี
 - ยังมีกิจกรรมสม่ำเสมอ

At Risk (891 คน):
 - ซื้อเฉลี่ย 11 ครั้ง, ยอดรวม 42,000 บาท
 - ความเสี่ยง churn เฉลี่ย 67% → ต้องดูแลด่วน
 - spend decay ratio 0.31 → ซื้อน้อยลง 69%

กลุ่ม At Risk น่ากังวลที่สุดเพราะ..."
```

---

## 8. UI Dashboard

ทั้งหมดมี **2 หน้าหลัก** + **1 modal** สำหรับสร้าง Run ใหม่

---

### 8.1 หน้า Dashboard (Run List)

```
┌─────────────────────────────────────────────────────────────────┐
│  Churn Predictor                                                 │  ← top bar
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Prediction Runs                          [+ สร้าง Run ใหม่]   │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │  ทั้งหมด       │  │  พร้อมใช้      │  │  กำลังประมวล  │    │  ← stat chips
│  │     3 Runs     │  │      2         │  │      0         │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  #3  บริษัท A - มีนาคม 2026                   ✅ Ready  │   │  ← คลิกได้
│  │       10,234 คน  ·  High Risk 1,247 (12%)                │   │
│  │       อัพโหลด 13 มี.ค. 2026                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  #2  บริษัท B - กุมภาพันธ์ 2026               ✅ Ready  │   │  ← คลิกได้
│  │       5,200 คน  ·  High Risk 634 (12%)                   │   │
│  │       อัพโหลด 28 ก.พ. 2026                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  #1  ทดสอบ - มกราคม 2026                      ❌ Error  │   │  ← คลิกได้
│  │       ไฟล์ผิด format                                     │   │
│  │       อัพโหลด 15 ม.ค. 2026              [ลบ Run นี้]    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

> **Card status:**
> - `✅ Ready` — คลิกเข้าดูผลได้
> - `⏳ Processing` — กำลัง predict, แสดง progress bar
> - `❌ Error` — predict ล้มเหลว, แสดงสาเหตุ + ปุ่มลบ

---

### 8.2 Modal สร้าง Run ใหม่ (2 ขั้นตอน)

**Step 1 — ตั้งชื่อ**

```
         ┌────────────────────────────────────────────┐
         │  สร้าง Prediction Run ใหม่             [×] │
         ├────────────────────────────────────────────┤
         │                                            │
         │   ●──────────○                             │
         │   ชื่อ       อัพโหลด                      │  ← stepper
         │                                            │
         │   ชื่อ Prediction Run *                    │
         │   ┌──────────────────────────────────┐     │
         │   │                                  │     │
         │   └──────────────────────────────────┘     │
         │   เช่น "บริษัท A มีนาคม 2026"             │
         │                                            │
         │                          [ถัดไป →]        │
         └────────────────────────────────────────────┘
```

**Step 2 — อัพโหลด CSV**

```
         ┌────────────────────────────────────────────┐
         │  สร้าง Prediction Run ใหม่             [×] │
         ├────────────────────────────────────────────┤
         │                                            │
         │   ✓──────────●                             │
         │   ชื่อ       อัพโหลด                      │
         │                                            │
         │   Run: "บริษัท A มีนาคม 2026"             │
         │                                            │
         │   ┌──────────────────────────────────┐     │
         │   │                                  │     │
         │   │   ↑  ลาก CSV มาวางที่นี่         │     │
         │   │      หรือ [เลือกไฟล์]            │     │
         │   │                                  │     │
         │   └──────────────────────────────────┘     │
         │                                            │
         │   [← ย้อนกลับ]        [เริ่ม Predict]     │
         └────────────────────────────────────────────┘
```

**Step 2 — กำลัง Processing**

```
         ┌────────────────────────────────────────────┐
         │  สร้าง Prediction Run ใหม่             [×] │
         ├────────────────────────────────────────────┤
         │                                            │
         │   "บริษัท A มีนาคม 2026"  (#4)            │
         │                                            │
         │   ████████████████░░░░░░░  68%            │
         │   กำลัง predict...                         │
         │   ประมวลผลแล้ว 6,959 / 10,234 คน          │
         │                                            │
         │   [ปิด]  ← ระบบทำงานต่อใน background      │
         └────────────────────────────────────────────┘
```

> เมื่อ predict เสร็จ → toast แจ้ง + card ใน list เปลี่ยนเป็น ✅ Ready

---

### 8.3 หน้า Run Detail

```
┌─────────────────────────────────────────────────────────────────┐
│  ← กลับ    #3 · บริษัท A - มีนาคม 2026            ✅ Ready    │  ← top bar
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ ลูกค้ารวม   │  │  High Risk   │  │ Medium Risk  │          │  ← metric cards
│  │   10,234    │  │ 1,247 (12%)  │  │ 3,105 (30%)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  Top 20 ที่เสี่ยงที่สุด  ─────────────────────────────────────  │
│  ┌────┬──────────┬─────────────┬──────────┬──────────────────┐  │
│  │ #  │ acc_id   │   Churn %   │   LTV    │     Action       │  │
│  ├────┼──────────┼─────────────┼──────────┼──────────────────┤  │
│  │  1 │ ACC-0042 │ ████░  94%  │ 180,000  │ โทรด่วน         │  │
│  │  2 │ ACC-0107 │ ████░  91%  │  92,000  │ ส่ง SMS         │  │
│  │  3 │ ACC-0831 │ ███░░  88%  │  74,000  │ ส่ง SMS         │  │
│  │  . │    .     │      .      │     .    │     .            │  │
│  └────┴──────────┴─────────────┴──────────┴──────────────────┘  │
│                                                                  │
│  Chat ────────────────────────────────────────────────────────  │
│                                                                  │
│   AI: สวัสดีครับ Run นี้มีลูกค้า 10,234 คน                     │
│       High Risk 1,247 คน — ต้องการถามอะไรไหมครับ?              │
│                                                                  │
│   คุณ: ลูกค้าที่เสี่ยงสุดและ LTV สูงสุด 5 คน                  │
│                                                                  │
│   AI: ⏳ กำลังวิเคราะห์...  (streaming)                        │
│                                                                  │
│  ┌──────────────────────────────────────────────┐  [ส่ง]       │
│  │  พิมพ์คำถาม...                               │              │
│  └──────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

### 8.4 Context Isolation (Code)

```python
class ChatSession:
    def __init__(self, batch_id: str):
        self.batch_id = batch_id
        self.history = []   # เก็บ 10 turn ล่าสุด
        self.created_at = datetime.now()

    # batch_id inject เข้า SQL อัตโนมัติ — ผู้ใช้ไม่ต้องพิมพ์เอง
    # ป้องกัน cross-batch data leak โดยสมบูรณ์
```

**กฎ:** ทุก query ใน session ต้องมี `WHERE batch_id = '{self.batch_id}'` เสมอ → ข้อมูลแต่ละ Run ไม่ปนกัน

---

### 8.5 สรุป Navigation

```
[Dashboard / Run List]
       │
       ├── คลิก card ที่ ✅ Ready  →  [Run Detail]
       │                                    │
       │                                    └── ← กลับ → [Dashboard]
       │
       └── กด "+ สร้าง Run ใหม่"  →  [Modal Step 1: ชื่อ]
                                              │
                                        [Modal Step 2: อัพโหลด]
                                              │
                                        [Processing...]
                                              │
                                        [ปิด Modal → Dashboard]
                                        [card ใหม่ปรากฏ ✅]
```

---

## 9. Model Recommendation สำหรับ Local

| Model | VRAM | SQL Quality | Reasoning | แนะนำถ้า |
|-------|------|-------------|-----------|---------|
| `qwen2.5:7b` | ~5 GB | ดี | พอใช้ | RAM น้อย, คำถามง่าย |
| `qwen2.5:14b` | ~9 GB | ดีมาก | ดี | **แนะนำสำหรับ production** |
| `qwen3:8b` | ~6 GB | ดีมาก | ดีมาก | ถ้ามี Qwen3 พร้อมใช้ |
| `qwen2.5:32b` | ~20 GB | ยอดเยี่ยม | ยอดเยี่ยม | GPU แรง ต้องการคุณภาพสูงสุด |

**คำแนะนำ:** เริ่มที่ `qwen2.5:14b` — สมดุลระหว่างคุณภาพกับ resource

```bash
ollama pull qwen2.5:14b
ollama serve
```

---

## 10. Files ที่ต้องสร้าง / แก้ไข

```
api/
├── chat_service.py         ← เขียนใหม่ทั้งหมด (Text-to-SQL แทน tools)
├── sql_safety.py           ← NEW: validate + sanitize SQL จาก LLM
├── schema_context.py       ← NEW: schema string สำหรับ system prompt
└── main.py                 ← แก้ POST /api/chat ให้รับ batch_id
```

### chat_service.py (โครงสร้างใหม่)

```python
class ChatService:
    def __init__(self, db_pool, ollama_url, model="qwen2.5:14b"):
        ...

    async def chat(self, message, batch_id, history) -> AsyncIterator[str]:
        # 1. สร้าง system prompt พร้อม schema + batch_id
        # 2. ส่งไป LLM → รับ response
        # 3. parse <SQL> tags
        # 4. validate + execute SQL
        # 5. ส่งผลลัพธ์กลับไป LLM
        # 6. stream คำตอบสุดท้าย

    def _parse_sql_blocks(self, text) -> list[str]:
        # parse <SQL>, <SQL_1>, <SQL_2> จาก LLM response

    async def _execute_safe(self, sql, batch_id) -> list[dict]:
        # safety check + inject batch_id + execute
```

---

## 11. Streaming Response

สำหรับ UX ที่ดี ควรใช้ streaming เพื่อให้ตัวอักษรค่อยๆ ปรากฏ แทนที่จะรอทั้งหมดก่อน

```python
# API endpoint
@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    return StreamingResponse(
        chat_service.chat_stream(req.message, req.batch_id, req.history),
        media_type="text/event-stream"
    )

# Response format (Server-Sent Events)
data: {"type": "thinking", "content": "กำลังวิเคราะห์..."}
data: {"type": "sql", "content": "SELECT COUNT(*)..."}
data: {"type": "result", "content": "พบ 1,247 คน"}
data: {"type": "answer", "content": "ลูกค้าทั้งหมด..."}  ← stream ทีละตัว
data: {"type": "done"}
```

---

## 12. สรุป Decisions

| หัวข้อ | การตัดสินใจ | เหตุผล |
|--------|-------------|--------|
| SQL Generation | LLM เขียน SQL เอง | ยืดหยุ่นสูงสุด ไม่ต้องเพิ่ม tool |
| Retrieval | SQL query ตรง | ข้อมูลมีโครงสร้าง ไม่ต้อง vector search |
| Reasoning | LLM phase ที่ 2 | แยก fetch กับ reason ออกจากกัน |
| Safety | Whitelist + batch_id forced | ป้องกัน SQL injection + cross-batch |
| Model | Qwen 2.5/3.x local | ถนัด SQL, รันบนเครื่องได้ |
| Prediction Run | ตั้งชื่อก่อน → อัพไฟล์ | ชื่อ required ป้องกันสับสน, auto run_number |
| Run Detail | list → คลิก → ดูผล + แชท | เข้าถึงทุก Run ได้ตลอด ไม่หาย |
| Context | batch_id ใน session | isolate ข้อมูลแต่ละ Run ไม่ปนกัน |
| UX | Streaming SSE | ผู้ใช้เห็นผลทันที ไม่รอนาน |
| History | เก็บ 10 turn | context พอ + ไม่เปลือง token |
