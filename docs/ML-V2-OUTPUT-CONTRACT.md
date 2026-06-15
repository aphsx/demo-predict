# ML v2 — Prediction Output Contract (ต้องเก็บอะไรบ้างต่อ run)

> ตอบคำถาม: แต่ละ prediction run ต้องเก็บ field อะไรบ้าง — ทั้ง ML output และข้อมูลทั่วไปของลูกค้า —
> แต่ละ field มาจากไหน สูตรอะไร ใครได้ค่า ใครได้ null และ "มูลค่าที่จะเสีย" คิดจากใครบ้าง

## §1 กติกาหลัก

1. **1 แถวต่อลูกค้าต่อ run** ใน `ml_prediction_outputs` — `UNIQUE(prediction_run_id, acc_id)`
2. **ลูกค้าทุกคนใน predict source ต้องมีแถว** แม้โมเดลทำนายไม่ได้ — field ที่ทำนายไม่ได้เป็น `null` พร้อมเหตุผลใน `model_eligibility_json` (UI ต้องอธิบายได้เสมอว่า "ทำไมคนนี้ไม่มีคะแนน")
3. Output table เก็บ **scalar ต่อลูกค้า** เท่านั้น — time-series (กราฟ usage/payment) อ่านจาก `predict_clean_*` ตรง ๆ
4. ทุกแถวบันทึก `model_versions_json` — รู้เสมอว่าตัวเลขมาจากโมเดลเวอร์ชันไหน (audit + เปรียบเทียบข้าม run ได้)

## §2 ใครได้โมเดลไหน (Eligibility matrix)

| Lifecycle | Churn | CLV | Credit forecast | เหตุผล |
|---|---|---|---|---|
| Active Paid | ✅ | ✅ | ✅ | กลุ่มเป้าหมายหลักของทุกโมเดล |
| Active Free | ❌ (`not_eligible: never_paid`) | ✅ (ทำนายโอกาสเริ่มจ่าย) | ✅ | churn นิยามจากการหยุดใช้+จ่าย — คนไม่เคยจ่ายไม่เข้านิยาม |
| Churned | ❌ (`already_churned`) | ❌ (`inactive`) | ❌ | เป็นสถานะที่เกิดแล้ว ไม่ใช่สิ่งที่ต้องทำนาย |
| Ghost | ❌ | ❌ | ❌ (`no_history`) | ไม่มีประวัติพอจะทำนาย |

(ตรงกับ `eligible_for_churn = active_in_window & ever_paid`, `eligible_for_clv = active_in_window`, `eligible_for_credit = has_activity_history` ใน `features.py` — ยกเว้น CLV/credit ของ Churned/Ghost ที่ runner ต้อง mark not_eligible เพิ่มตามตารางนี้)

## §3 Field contract — `ml_prediction_outputs`

### 3.1 Identity / run

| Field | Type | Source |
|---|---|---|
| `prediction_run_id` | UUID | run |
| `acc_id` | INTEGER | `predict_clean_customers` |

### 3.2 Lifecycle (rule-based — ข้อมูลจริง ไม่ใช่คำทำนาย)

| Field | ค่า | สูตร |
|---|---|---|
| `lifecycle_stage` | Ghost / Churned / Active Free / Active Paid | rule ใน `features.py`: ไม่มี activity เลย→Ghost; ไม่มี activity ใน 180 วันก่อน cutoff→Churned; มี+เคยจ่าย→Active Paid; มี+ไม่เคยจ่าย→Active Free |
| `sub_stage` | Ghost / Churned Paid / Churned Free / Active Free / Active Paid | stage + `ever_paid` |

### 3.3 ข้อมูลทั่วไปของลูกค้า (descriptive — จำเป็นต่อ CRM ไม่แพ้ ML)

คำนวณจาก `predict_clean_*` ณ cutoff — เป็น "ข้อเท็จจริง" ที่ user ใช้ประเมินคู่กับคะแนนโมเดล

| Field | Type | สูตร / source |
|---|---|---|
| `days_since_last_activity` | INT | cutoff − max(วันจ่ายล่าสุด, เดือนใช้งานล่าสุดที่ usage > 0) |
| `n_purchases` | INT | count แถว payments ทั้งหมด |
| `total_revenue` | NUMERIC | Σ amount ทั้งหมด |
| `avg_transaction_value` | NUMERIC | total_revenue / n_purchases (null ถ้าไม่เคยจ่าย) |
| `ever_paid` | BOOL | n_purchases > 0 |
| `usage_trend` | TEXT | จาก `usage_change_90d_pct`: > +10% → increasing, < −10% → declining, อื่น ๆ → stable, ไม่มี usage → no_usage |
| `profile_snapshot_json` 🆕 | JSONB | snapshot โปรไฟล์ ณ cutoff: `{join_date, customer_age_days, status_sms, status_email, credit_sms, credit_email, expire_sms, expire_email, last_access, last_send, sms_usage_share, email_usage_share, bc_usage_share, api_usage_share, otp_usage_share, usage_total_180d}` — Customer 360 แสดงโปรไฟล์ได้โดยไม่ต้อง join clean tables |

### 3.4 Churn (model)

| Field | Type | Source / สูตร |
|---|---|---|
| `churn_probability` | NUMERIC(5,4) | champion churn model (calibrated) — null ถ้า not eligible |
| `churn_risk_level` | TEXT | ตัดช่วงจาก threshold ใน model card ของ champion (default: <0.30 low, 0.30–0.60 medium, 0.60–0.85 high, ≥0.85 critical) — **UI ห้าม hardcode ช่วงเอง** อ่านจาก API |
| `churn_factors_json` 🆕 | JSONB | top-5 SHAP factors: `[{feature, value, direction: "up"\|"down", impact}]` — ใช้ตอบ "ทำไมคนนี้เสี่ยง" บนหน้า 360 |

### 3.5 CLV (model)

| Field | Type | Source |
|---|---|---|
| `predicted_clv_6m` | NUMERIC(14,2) | champion CLV model — รายได้คาดการณ์ 180 วันข้างหน้า |
| `p_alive` 🆕 | NUMERIC(5,4) | จาก BG-NBD — ความน่าจะเป็นที่ลูกค้ายัง "active" (null ถ้า champion เป็น ML regressor ที่ไม่มีค่านี้) |
| `customer_value_tier` | TEXT | quantile ของ `predicted_clv_6m` ในหมู่ลูกค้า active ของ run เดียวกัน: top 10% → high, ถัดมา 40% → mid, ที่เหลือ → low (คนที่ CLV=0/null → none) |

### 3.6 Credit forecast (model)

| Field | Type | Source / สูตร |
|---|---|---|
| `predicted_credit_usage_30d` | NUMERIC(14,2) | quantile model — ใช้ p50 เป็นค่าหลัก |
| `predicted_credit_usage_90d` | NUMERIC(14,2) | p50 ของ horizon 90 วัน |
| `credit_forecast_interval_json` 🆕 | JSONB | `{p10_30d, p90_30d, p10_90d, p90_90d}` — แถบช่วงบนหน้า 360 |
| `estimated_days_until_topup` | INT | เครดิตคงเหลือรวม ÷ (predicted_credit_usage_30d / 30) — capped 365; null ถ้า forecast ≤ 0 |
| `credit_urgency_level` | TEXT | ≤14 วัน → critical, ≤30 → warning, ≤90 → monitor, อื่น ๆ → stable |

### 3.7 Derived business fields

| Field | Type | สูตร |
|---|---|---|
| `revenue_at_risk` | NUMERIC(14,2) | `churn_probability × predicted_clv_6m` — ดูนิยามเต็ม §5.1 |
| `priority_score` | NUMERIC(5,2) | 0–100 — log rescale ของ `revenue_at_risk` (ดู §5.2) — **เป็นสัญญาณ priority เพียงตัวเดียว ไม่มีข้อความ reason** |

### 3.8 AI explanation (Phase 2 — โครงรองรับไว้แล้ว)

`ai_explanation`, `ai_reasoning_json`, `ai_generated_at`, `ai_model`, `ai_status` (default `not_requested`) — เติมทีหลังแบบ per-customer ไม่ block prediction run

### 3.9 Meta

| Field | ค่า |
|---|---|
| `output_status` | `predicted` (ครบ) / `partial` (บางโมเดล fallback/null) / `insufficient_data` |
| `output_notes` | ข้อความอธิบายเพิ่มเติม |
| `model_eligibility_json` | `{churn: {eligible, status, reason}, clv: {...}, credit: {...}}` — status ∈ predicted / not_eligible / insufficient_data / failed |
| `model_versions_json` | `{churn: <version_id>, clv: <version_id>, credit: <version_id>}` |

### 3.10 Schema status

คอลัมน์ `churn_factors_json`, `p_alive`, `profile_snapshot_json`, `credit_forecast_interval_json` อยู่ใน single bootstrap schema แล้ว (`db/init/001_schema.sql`)

## §5 นิยาม derived fields แบบละเอียด

### §5.1 Revenue at Risk — "มูลค่าที่จะเสีย มาจากไหน มาจากใคร"

**ระดับลูกค้า:** `revenue_at_risk = churn_probability × predicted_clv_6m`
= ค่าคาดหวังของรายได้ 6 เดือนที่จะหายไปถ้าลูกค้าคนนี้ churn ตามความน่าจะเป็น
คำนวณให้ **active paid ที่ eligible ทุกคน** (ไม่ใช่เฉพาะกลุ่มเสี่ยงสูง) — คนเสี่ยง 20% ก็มีมูลค่าคาดหวังที่เสี่ยง แค่น้อย
เงื่อนไขสำคัญ: สูตรนี้มีความหมายก็ต่อเมื่อ `churn_probability` ถูก **calibrate** แล้ว (TRAINING §10) — ไม่งั้นการคูณนี้เพี้ยนทั้งระบบ

**ระดับ dashboard มี 2 มุม (แสดงทั้งคู่ ติด label ให้ชัด):**

| ตัวเลข | สูตร | ตอบคำถาม |
|---|---|---|
| Expected revenue at risk | `Σ revenue_at_risk` ของ active paid ทั้งหมด | "ถ้าทุกอย่างเป็นไปตามความน่าจะเป็น เราจะเสียรายได้ราวเท่าไหร่ใน 6 เดือน" |
| High-risk revenue exposure | `Σ predicted_clv_6m` เฉพาะคน risk ∈ {high, critical} | "ถ้ากลุ่มเสี่ยงสูงหายหมดจริง เงินก้อนไหนหาย" — ใช้จัดลำดับว่าต้อง save ใคร |

"มาจากใคร" → ตาราง Top customers เรียง `revenue_at_risk desc` + Value × Risk matrix (DASHBOARD §2.1) เปิดดูรายคนได้เสมอ

### §5.2 Priority score (0–100)

จัดอันดับ "ใครควรถูกสนใจก่อน" โดย **อิงเงินที่เสี่ยงจะเสียจริง** ไม่ใช่น้ำหนักที่เดาเอา:

```
ranking key = revenue_at_risk = churn_probability × predicted_clv_6m   (หน่วย ฿)
priority_score = log rescale ของ revenue_at_risk → 0..100 (เพื่อแสดงผลเท่านั้น
                 ลำดับเท่ากับการเรียงด้วย revenue_at_risk ทุกประการ)
```

เหตุผลที่เลิกใช้สูตร `50×risk + 30×value + 20×credit` เดิม:
- ผสมหน่วยไม่เข้ากัน (ความน่าจะเป็นดิบ + percentile rank) → ลูกค้ามูลค่าสูงกว่า 10 เท่าขยับคะแนนนิดเดียว
- น้ำหนัก 50/30/20 ไม่เคย validate กับผลลัพธ์
- `churn.fillna(0.0)` ทำให้ลูกค้าที่ทำนาย churn ไม่ได้ถูกนับว่า "ปลอดภัย" (แก้แล้ว)

**Credit urgency ไม่อยู่ในคะแนน** อีกต่อไป — มันคือสัญญาณ "จังหวะขายต่อ" (`credit_urgency_level`) คนละ action กับ retention จึงแยกออก

**priority = ตัวเลขล้วน ไม่มีข้อความ reason** — การแบ่งกลุ่ม/segment ลูกค้าใช้ฟิลด์ที่มีอยู่แล้ว (`customer_value_tier`, `churn_risk_level`, `credit_urgency_level`, `lifecycle_stage` + Value×Risk matrix) ส่วนคำอธิบายภาษาคน "ทำไม" มาจาก AI explanation (`ai_explanation`) ที่ generate จากตัวเลข/SHAP factors ไม่ใช่ประโยค hardcode

### §5.3 Action workflow removed

Prediction output ไม่สร้าง `recommended_action` หรือ follow-up date แล้ว เพราะ workflow การติดต่อยังไม่ถูกนิยามเป็น product behavior ที่ชัดเจน ใช้ `priority_score` (ตัวเลข) จัดลำดับ + ฟิลด์แบ่งกลุ่ม (`customer_value_tier` / `churn_risk_level` / `credit_urgency_level`) ใน `/customers` แทน

## §6 ลำดับการเขียน output ของ prediction runner

1. สร้าง `ml_prediction_runs` status `in_progress`
2. โหลด `predict_clean_*` → gates → features (contract เดียวกับเทรน + preprocessor ของ champion)
3. lifecycle + eligibility ทุกคน
4. รัน 3 โมเดล champion เฉพาะกลุ่ม eligible → SHAP เฉพาะ churn
5. คำนวณ derived fields (§5)
6. **Batch insert** ทั้งหมด (ห้าม insert ทีละแถว) — ลูกค้าทุกคนต้องมีแถว
7. Post-check (Gate 15): จำนวนแถว = จำนวนลูกค้า, score อยู่ในช่วง [0,1], null rate ของกลุ่ม eligible ≈ 0 → เขียน `ml_data_validation_reports`
8. อัพเดท run: `completed` + `total_customers` (หรือ `failed` + `error_message` — ทุก exception ต้องจบที่สถานะนี้ ห้ามค้าง `in_progress`)
