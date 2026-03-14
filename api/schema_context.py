"""
schema_context.py — DB schema string ที่ให้ LLM ใน system prompt
LLM จะใช้ schema นี้เพื่อเขียน SQL query ได้ถูกต้อง
"""

DB_SCHEMA = """
=== DATABASE SCHEMA ===

TABLE: customers  -- ข้อมูล master account ลูกค้า
  acc_id         TEXT PRIMARY KEY     -- รหัสลูกค้า เช่น ACC010001
  status         TEXT                 -- 'paid' | 'trial'
  credit         INT                  -- เครดิต SMS คงเหลือ
  expire         DATE                 -- วันหมดอายุ
  join_date      DATE                 -- วันเริ่มใช้งาน
  last_access    TIMESTAMP            -- ครั้งล่าสุดที่ login
  last_send      TIMESTAMP            -- ครั้งล่าสุดที่ส่ง SMS

TABLE: payments  -- ประวัติการซื้อเครดิต
  id             BIGINT PRIMARY KEY
  acc_id         TEXT (FK customers)  -- รหัสลูกค้า
  payment_date   TIMESTAMP            -- วันที่ซื้อ
  amount         NUMERIC              -- ยอดเงิน (บาท)
  sms_volume     INT                  -- จำนวน SMS ที่ได้รับ
  product_name   TEXT                 -- ชื่อแพ็กเกจ
  credit_type    TEXT                 -- ประเภทเครดิต

TABLE: predictions  -- ผลการ predict churn + features วิเคราะห์พฤติกรรม
  acc_id                 TEXT PK (FK customers)  -- รหัสลูกค้า
  churn_probability      FLOAT    -- 0.0-1.0 โอกาส churn (สูง = เสี่ยงมาก)
  churn_predicted        BOOLEAN  -- ทำนายว่าจะ churn ไหม
  risk_tier              TEXT     -- 'High' (>=0.6) | 'Medium' (0.3-0.6) | 'Low' (<0.3)
  rfm_segment            TEXT     -- 'Champions'|'Loyal'|'Potential'|'At Risk'|'Lost'|'Low Spender'
  risk_factor            TEXT     -- เหตุผลหลักที่ AI คิดว่าจะ churn (ภาษาไทย)
  recommended_action     TEXT     -- สิ่งที่ควรทำ (ภาษาไทย)
  days_since_last_access FLOAT    -- วันที่ไม่ได้ login
  days_until_expire      FLOAT    -- วันที่เหลือก่อนหมดอายุ (ติดลบ = หมดแล้ว)
  account_age_days       FLOAT    -- อายุบัญชี (วัน)
  total_payments         FLOAT    -- จำนวนครั้งที่ซื้อ
  total_amount_paid      FLOAT    -- ยอดซื้อรวมตลอดชีพ (บาท)
  ltv                    FLOAT    -- LTV (ยอดซื้อรวม บาท)
  avg_amount_per_tx      FLOAT    -- ยอดซื้อเฉลี่ยต่อครั้ง
  last_payment_recency   FLOAT    -- วันที่ไม่ได้ซื้อ
  avg_payment_gap_days   FLOAT    -- ช่วงห่างเฉลี่ยระหว่างการซื้อ (วัน)
  total_sms_volume       FLOAT    -- SMS ที่ใช้ทั้งหมด
  downgraded             INT      -- ซื้อน้อยกว่าครั้งก่อน (1=ใช่, 0=ไม่)
  churned                INT      -- เลิกใช้แล้ว (1=ใช่, 0=ไม่)

TABLE: prediction_runs  -- ประวัติการรัน predict แต่ละครั้ง
  id              INT PRIMARY KEY   -- run number
  name            TEXT              -- ชื่อ run เช่น "บริษัท A มีนาคม 2026"
  status          TEXT              -- 'pending' | 'done' | 'error'
  customers_count INT               -- จำนวนลูกค้าที่ predict
  created_at      TIMESTAMP         -- วันที่รัน
  completed_at    TIMESTAMP         -- วันที่เสร็จ

=== RELATIONS ===
customers.acc_id ← predictions.acc_id (1:1)
customers.acc_id ← payments.acc_id    (1:many)
"""


def build_system_prompt(run_id: int | None = None, run_name: str | None = None) -> str:
    run_context = ""
    if run_id and run_name:
        run_context = f"\n=== CONTEXT ===\nผู้ใช้กำลังดู Prediction Run #{run_id}: \"{run_name}\"\n"

    return f"""คุณเป็น AI วิเคราะห์ข้อมูลลูกค้าสำหรับระบบ CRM ของ 1MOBY
คุณเข้าถึงฐานข้อมูล PostgreSQL ได้โดยตรง และสามารถเขียน SQL เพื่อตอบคำถามได้ทุกอย่าง
ตอบเป็นภาษาไทยเสมอ อธิบายให้เข้าใจง่าย ให้ข้อมูลที่เป็นประโยชน์และเหตุผล
{run_context}
=== วิธีตอบคำถาม ===
1. ถ้าต้องการข้อมูลจาก DB → เขียน SQL query โดยใส่ใน tag <SQL>...</SQL>
2. ถ้าต้องหลาย query → ใช้ <SQL_1>...</SQL_1> <SQL_2>...</SQL_2>
3. หลังจากระบบ execute SQL แล้วจะส่งผลลัพธ์กลับมาให้คุณ → วิเคราะห์และตอบ
4. ถ้าคำถามไม่ต้องใช้ DB (เช่น อธิบาย concept) → ตอบได้เลยโดยไม่ต้องเขียน SQL

=== กฎการเขียน SQL ===
- ใช้เฉพาะ SELECT เท่านั้น ห้าม INSERT/UPDATE/DELETE/DROP
- ถ้าดึงข้อมูลหลายแถว ใส่ LIMIT (สูงสุด 100)
- ถ้าเป็น aggregate (COUNT, SUM, AVG, GROUP BY) ไม่ต้อง LIMIT
- ใช้ JOIN ได้ตามต้องการ
- ใช้ ROUND(...::numeric, 2) สำหรับ float ที่ต้องการทศนิยม

{DB_SCHEMA}

=== ตัวอย่าง ===
คำถาม: "ลูกค้าที่เสี่ยง churn สูงสุด 5 คน"
<SQL>
SELECT p.acc_id, c.status,
       ROUND(p.churn_probability::numeric, 3) AS churn_prob,
       p.risk_tier, p.ltv, p.risk_factor, p.recommended_action
FROM predictions p
JOIN customers c ON c.acc_id = p.acc_id
ORDER BY p.churn_probability DESC
LIMIT 5
</SQL>
"""
