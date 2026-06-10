# ML v2 — Dashboard Spec (หน้าเว็บต้องแสดงอะไรบ้าง)

> ตอบคำถาม: dataset + ML output ที่เรามี ทำ dashboard อะไรได้บ้าง, แต่ละตัวเลขมาจากไหน,
> หน้าเว็บปัจจุบันต้องเอาอะไรออก/เพิ่มอะไร เพื่อให้เป็นเครื่องมือประเมินลูกค้าจริง ๆ

## §1 หลักการออกแบบ

1. **ทุก widget ต้องตอบคำถามธุรกิจ 1 ข้อ** — ถ้าตอบไม่ได้ว่า widget นี้ช่วยตัดสินใจอะไร = ตัดทิ้ง
2. **ทุกตัวเลข trace ได้** — spec นี้ระบุ field + สูตรของทุก widget ห้ามมี mock data
3. **แยก "ข้อมูลจริงที่เกิดขึ้นแล้ว" กับ "คำทำนาย" ให้ชัดบน UI** — เช่น revenue รายเดือนคือข้อมูลจริง (จาก `predict_clean_payments`) ส่วน CLV คือคำทำนาย ต้อง label ให้ user แยกออก
4. **ตัวเลขเชิงเวลา (กราฟ time-series) อ่านจาก `predict_clean_*` โดยตรง** ไม่ denormalize ลง output table — output table เก็บเฉพาะ scalar ต่อลูกค้า
5. ทุกหน้า (ยกเว้น login) ผูกกับ **prediction run เดียว** — มี run selector ที่ header, default = run ล่าสุดที่ `status='completed'`

## §2 โครงหน้าเว็บเป้าหมาย

| Route | หน้า | ผู้ใช้ใช้ทำอะไร | สถานะปัจจุบัน |
|---|---|---|---|
| `/` | Overview | เห็นภาพรวมสุขภาพฐานลูกค้า + เงินที่เสี่ยงหาย | mock → ต่อ API จริง |
| `/customers` | Customers | ค้นหา/กรอง/จัดอันดับลูกค้าทุกคน | mock → ต่อ API จริง |
| `/customers/[id]` | Customer 360 | ประเมินลูกค้ารายคนก่อนติดต่อ | mock → ต่อ API จริง |
| `/playbooks` | Action Queue | รายการลูกค้าที่ต้องติดต่อ เรียงตามความสำคัญ | ปรับ lane ใหม่ (ดู §2.4) |
| `/model-performance` | Model Performance | ดูว่าโมเดลแม่นแค่ไหน เชื่อได้แค่ไหน | mock → อ่านจาก `ml_model_evaluations` |
| `/runs` | Prediction Runs | สร้าง/ดู prediction run | ต่อ `ml_prediction_runs` |
| `/training` | Training | import dataset + สั่งเทรน | ใช้งานได้แล้ว, เพิ่มปุ่ม train จริง |
| `/ai-chat` | AI Assistant | ถามข้อมูลด้วยภาษาธรรมชาติ | ฟีเจอร์แยก (คง spec เดิม) |
| `/login` | Login | — | ใช้งานได้แล้ว |

**เอาออก:**
- `/alerts` — โฟลเดอร์ว่าง ไม่มี page.tsx ลบทิ้ง (สัญญาณเตือนใช้ filter ใน `/customers` + Action Queue แทน)
- `/monthly-value` — ยุบเป็น drill-down/modal ของกราฟ revenue ใน Overview (ข้อมูลเดียวกัน ไม่ควรเป็น route แยก)
- ฟังก์ชัน stub ทั้งหมดใน `apps/web/src/lib/api.ts` (`fetchRuns`→`[]`, `streamChat` ฯลฯ) — แทนด้วย client ของ API ใหม่ (§7)
- ปุ่ม Call / Email / Campaign ที่ disabled ใน playbooks — ซ่อนจนกว่า Phase 2 จะมีระบบส่งจริง
- การ์ด AI explanation ที่เป็น "Mockup" — render เฉพาะเมื่อ `ai_status='completed'`

## §2.1 หน้า Overview (`/`)

Header: ชื่อ run, `cutoff_date`, `total_customers`, เวลา predict เสร็จ — จาก `ml_prediction_runs`

### KPI row (5 ใบ)

| KPI | คำถามธุรกิจ | สูตร / source |
|---|---|---|
| Total customers | ฐานลูกค้าใหญ่แค่ไหน | `count(*)` จาก `ml_prediction_outputs` ของ run |
| Active paid | ลูกค้าที่จ่ายเงินและยังใช้งาน | `count(lifecycle_stage='Active Paid')` |
| High-risk active paid | กี่คนกำลังจะหาย | `count(churn_risk_level in ('high','critical'))` + % ของ active paid |
| **Expected revenue at risk** | คาดว่าจะเสียเงินเท่าไหร่ใน 6 เดือน | `Σ revenue_at_risk` ของ active paid ทุกคน (ดูนิยาม OUTPUT-CONTRACT §5.1 — ไม่ใช่เฉพาะกลุ่มเสี่ยงสูง) |
| 30d credit demand | เครดิตจะถูกใช้เท่าไหร่เดือนหน้า | `Σ predicted_credit_usage_30d` ของ active |

### Widgets

| Widget | แสดง | source |
|---|---|---|
| Lifecycle mix | สัดส่วน Active Paid / Active Free / Churned / Ghost (จำนวน + %) | `group by lifecycle_stage` |
| Churn risk distribution | histogram ระดับเสี่ยงของ **active paid เท่านั้น** (พร้อมคำอธิบายว่าโมเดล churn ทำนายเฉพาะ active paid — คนอื่น not eligible) | `group by churn_risk_level where lifecycle_stage='Active Paid'` |
| Value × Risk matrix | ตาราง 2 มิติ value tier × risk level — มุม "high value + high risk" คือกลุ่มที่ต้องรีบจัดการ พร้อมยอดเงิน `Σ predicted_clv_6m` ของมุมนั้น | `group by customer_value_tier, churn_risk_level` |
| Monthly revenue (ข้อมูลจริง) | กราฟรายได้จริงย้อนหลัง 12 เดือน + ค่าเฉลี่ย | `predict_clean_payments`: `sum(amount) group by month(payment_date)` |
| Credit urgency | จำนวนลูกค้าต่อ bucket: critical ≤14d / warning ≤30d / monitor ≤90d / stable + จำนวนที่ต้อง top-up ใน 7 วัน | `group by credit_urgency_level`, `count(estimated_days_until_topup<=7)` |
| Top 10 priority | ตารางลูกค้า `priority_score` สูงสุด: acc_id, stage, churn %, CLV, เหตุผล — คลิกไป 360 | `order by priority_score desc limit 10` |

## §2.2 หน้า Customers (`/customers`)

ตาราง 1 แถว/ลูกค้า จาก `ml_prediction_outputs` — paginate ฝั่ง server, sort ได้ทุกคอลัมน์, export CSV

**คอลัมน์ (เรียงตามลำดับความสำคัญ):**

| คอลัมน์ | field |
|---|---|
| Account | `acc_id` (link ไป 360) |
| Lifecycle | `lifecycle_stage` + `sub_stage` (pill) |
| Churn % | `churn_probability` (แสดง "—" + tooltip เหตุผล ถ้า not eligible) |
| Risk | `churn_risk_level` (pill สี) |
| CLV 6m | `predicted_clv_6m` |
| Revenue at risk | `revenue_at_risk` |
| Value tier | `customer_value_tier` |
| Credit urgency | `credit_urgency_level` + `estimated_days_until_topup` |
| Last activity | `days_since_last_activity` |
| Revenue (จริง) | `total_revenue` |
| Action | `recommended_action` |

**Filters:** lifecycle stage, risk level, value tier, credit urgency, `ever_paid`, ค้นหา `acc_id`
**Default sort:** `priority_score desc`
**Quick presets (แทน /alerts):** "เสี่ยงสูง+มูลค่าสูง", "ใกล้ต้องเติมเครดิต (≤14d)", "เพิ่ง churn (Churned Paid)", "Free ที่ใช้งานหนัก (candidate ขายต่อ)"

## §2.3 หน้า Customer 360 (`/customers/[id]`)

จัดเป็น 4 ส่วน บนลงล่าง = "เขาเป็นใคร → เขาทำอะไรมา → โมเดลว่ายังไง → ควรทำอะไร"

**A. Profile (ข้อมูลจริง)** — จาก `profile_snapshot_json` + general fields:
join_date + อายุลูกค้า, status SMS/Email, เครดิตคงเหลือ (SMS/Email), วันหมดอายุเครดิต, last activity, lifecycle + sub_stage

**B. Commercial history (ข้อมูลจริง)**
- `n_purchases`, `total_revenue`, `avg_transaction_value`
- กราฟ usage รายเดือน 12 เดือน แยกตาม channel (SMS/Email) และ source (BC/API/OTP) — จาก `predict_clean_usage`
- timeline การจ่ายเงิน — จาก `predict_clean_payments`

**C. Predictions (คำทำนาย — label ให้ชัดว่าเป็น forecast)**
- Churn: `churn_probability` + risk pill + **top factors จาก `churn_factors_json`** แปลเป็นภาษาคน เช่น "ไม่มียอดใช้งาน 75 วัน (ดันความเสี่ยงขึ้น)" — นี่คือส่วนที่ทำให้ user เชื่อโมเดล ขาดไม่ได้
- CLV: `predicted_clv_6m`, `p_alive`, `revenue_at_risk`
- Credit: `predicted_credit_usage_30d/90d`, แถบช่วง p10–p90, `estimated_days_until_topup`
- ถ้าโมเดลไหน not eligible → แสดงเหตุผลจาก `model_eligibility_json` แทนตัวเลข (เช่น "ลูกค้า Ghost — ไม่อยู่ในเงื่อนไขโมเดล churn")

**D. Action**
`priority_score`, `recommended_action`, `priority_reason`, `recommended_followup_date`
AI explanation (Phase 2): render เฉพาะ `ai_status='completed'`

## §2.4 หน้า Action Queue (`/playbooks`)

**เปลี่ยน lane จาก lifecycle → จัดตาม "งานที่ต้องทำ"** (lane ตาม lifecycle ไม่ตอบว่าควรทำอะไร):

| Lane | เงื่อนไข (จาก output fields) | เรียงตาม |
|---|---|---|
| 🔴 Save now — เสี่ยงหาย มูลค่าสูง | risk ∈ {high,critical} AND value tier ∈ {high,mid} | `revenue_at_risk desc` |
| 🟠 Top-up ใกล้หมด | `credit_urgency_level in ('critical','warning')` | `estimated_days_until_topup asc` |
| 🟡 Upsell Free → Paid | stage='Active Free' AND usage สูง (`usage_trend='increasing'` หรือ value tier สูง) | `priority_score desc` |
| 🔵 เพิ่ง churn (win-back manual) | `sub_stage='Churned Paid'` AND `days_since_last_activity <= 270` | `total_revenue desc` |

การ์ด: acc_id, เหตุผล 1 บรรทัด (`priority_reason`), CLV, follow-up date, checkbox done (local state)
KPI ด้านบน: จำนวนค้างในคิว / ทำแล้ววันนี้ — คงของเดิม

## §2.5 หน้า Model Performance (`/model-performance`)

อ่านจาก `ml_model_aliases` (champion ปัจจุบัน) + `ml_model_versions` + `ml_model_evaluations` — **ห้าม hardcode ตัวเลข**

ต่อโมเดล (churn / clv / credit):
- Champion version, trained date, dataset size, feature set, cutoff ที่ใช้เทรน
- ตาราง metric แยก split: validation / test / backtest เฉลี่ย (กัน user เข้าใจผิดว่าตัวเลข validation คือความแม่นจริง)
- เทียบ baseline: "โมเดลดีกว่า baseline เท่าไหร่" — จาก `ml_model_evaluations.baseline_name`
- Churn เพิ่ม: calibration curve (`calibration_json`), confusion matrix ที่ threshold ใช้งาน, ตาราง lift (`lift_table_json`) แปลเป็นภาษาธุรกิจ: "โทรหา top 10% ของคะแนน = เจอคนที่จะ churn จริง X% (lift Yx)"
- Credit เพิ่ม: interval coverage ("ช่วง p10–p90 ครอบค่าจริง Z%")
- ความหมาย metric แต่ละตัว: tooltip สั้น ๆ (นิยามอยู่ใน TRAINING §11)

กติกาเดิมที่ยังใช้: หน้าแสดง **ตัวเลขคุณภาพเท่านั้น** — ไม่มี pass/fail badge, ไม่มี health status

## §2.6 หน้า Runs (`/runs`) และ Training (`/training`)

- `/runs`: list จาก `ml_prediction_runs` (name, status, cutoff, total_customers, created_by, error_message) + ปุ่ม create (เลือก predict source ที่ ready + cutoff) + ดู progress + ลบ (เฉพาะ owner)
- `/training`: ของเดิม (import + เลือก dataset) + ปุ่ม "Train" สร้าง `ml_training_runs` + ดู progress + ผลสรุป (ผ่าน gate ไหม, metric หลัก, promote หรือไม่)

## §7 API ที่หน้าเว็บต้องใช้ (Elysia — ทุก key เป็น snake_case)

```
GET  /prediction-runs                          list run ทั้งหมด
POST /prediction-runs                          { predict_source_id, name, cutoff_date }
GET  /prediction-runs/:id                      run detail + progress
DELETE /prediction-runs/:id                    owner เท่านั้น

GET  /prediction-runs/:id/summary              ตัวเลขทุก widget ของ Overview (aggregate ฝั่ง SQL จบใน endpoint เดียว)
GET  /prediction-runs/:id/outputs              ตาราง customers: ?page&page_size&sort&filters...
GET  /prediction-runs/:id/outputs/:acc_id      Customer 360 (output + profile_snapshot)
GET  /prediction-runs/:id/customers/:acc_id/usage-monthly    กราฟ usage จาก predict_clean_usage
GET  /prediction-runs/:id/customers/:acc_id/payments         timeline จาก predict_clean_payments
GET  /prediction-runs/:id/action-queue         4 lanes ของ §2.4 (กรอง+เรียงฝั่ง server)

GET  /model-performance                        champion ทุก model_type + evaluations + baselines
POST /training-runs                            { train_source_id, cutoff_date, horizon_days }
GET  /training-runs/:id                        progress + ผล gate + metrics
```

กติกา: ทุก route ใช้ `requireUser`; read แชร์ทุกคน; mutation เฉพาะ owner (ตาม CLAUDE.md); aggregate ทำใน SQL ไม่ดึงทั้งตารางมา reduce ใน JS
