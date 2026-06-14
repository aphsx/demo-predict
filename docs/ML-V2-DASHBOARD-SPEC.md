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
| `/model-performance` | Model Performance | ดูว่าโมเดลแม่นแค่ไหน เชื่อได้แค่ไหน | mock → อ่านจาก `ml_model_evaluations` |
| `/runs` | Prediction Runs | import predict data + สร้าง/ดู prediction run ครบวงจร | ต่อ `ml_prediction_runs` (§2.5) |
| `/training` | Training | import dataset + สั่งเทรน | ใช้งานได้แล้ว, เพิ่มปุ่ม train จริง |
| `/ai-chat` | AI Assistant | ถามข้อมูลด้วยภาษาธรรมชาติ | ฟีเจอร์แยก (คง spec เดิม) |
| `/login` | Login | — | ใช้งานได้แล้ว |

**เอาออก:**
- `/playbooks` — **ตัดออกจาก scope** ยังไม่ชัดว่าทีมจะใช้ workflow แบบไหน — งาน "ใครต้องถูกติดต่อก่อน" ใช้ quick presets + sort `priority_score` ใน `/customers` แทน; ไม่มี `recommended_action` / follow-up workflow ใน output contract แล้ว
- `/alerts` — โฟลเดอร์ว่าง ไม่มี page.tsx ลบทิ้ง (สัญญาณเตือนใช้ quick presets ใน `/customers` แทน)
- `/monthly-value` — ยุบเป็น drill-down/modal ของกราฟ revenue ใน Overview (ข้อมูลเดียวกัน ไม่ควรเป็น route แยก)
- ฟังก์ชัน stub เก่าใน `apps/web/src/lib/api.ts` ถูกลบแล้ว — หน้า ML ใช้ client ของ API ใหม่ (§7)
- การ์ด AI explanation ที่เป็น "Mockup" — render เฉพาะเมื่อ `ai_status='completed'`

## §2.0 Layout กลาง (ทุกหน้า)

**Sidebar (รายการสุดท้ายหลังตัด playbooks/alerts/monthly-value):**

```
📊 Dashboard          /
👥 Customers          /customers
📈 Model Performance  /model-performance
▶️  Prediction Runs    /runs
🎓 Training           /training
✨ AI Assistant       /ai-chat
─────────────
👤 ชื่อผู้ใช้ + Logout
```

**Header (เฉพาะหน้า `/`, `/customers`, `/customers/[id]`):**
- **Run selector** — dropdown ของ run ที่ `status='completed'` เรียงใหม่→เก่า, default = ล่าสุด แสดง `ชื่อ run · cutoff DD MMM YYYY` — ทุกตัวเลขบน 3 หน้านี้ผูกกับ run ที่เลือก
- ไม่มี run ที่ completed → header แสดง empty state + ลิงก์ไป `/runs` (ตาม §5)
- Desktop-first — internal tool 5 คน ไม่ต้องทำ responsive จริงจัง

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
| Priority reason | `priority_reason` |

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

**D. Priority**
`priority_score`, `priority_reason`
AI explanation (Phase 2): render เฉพาะ `ai_status='completed'`

## §2.4 หน้า Model Performance (`/model-performance`)

อ่านจาก `ml_model_aliases` (champion ปัจจุบัน) + `ml_model_versions` + `ml_model_evaluations` — **ห้าม hardcode ตัวเลข**

ต่อโมเดล (churn / clv / credit):
- Champion version, trained date, dataset size, feature set, cutoff ที่ใช้เทรน
- ตาราง metric แยก split: validation / test / backtest เฉลี่ย (กัน user เข้าใจผิดว่าตัวเลข validation คือความแม่นจริง)
- เทียบ baseline: "โมเดลดีกว่า baseline เท่าไหร่" — จาก `ml_model_evaluations.baseline_name`
- Churn เพิ่ม: calibration curve (`calibration_json`), confusion matrix ที่ threshold ใช้งาน, ตาราง lift (`lift_table_json`) แปลเป็นภาษาธุรกิจ: "โทรหา top 10% ของคะแนน = เจอคนที่จะ churn จริง X% (lift Yx)"
- Credit เพิ่ม: interval coverage ("ช่วง p10–p90 ครอบค่าจริง Z%")
- ความหมาย metric แต่ละตัว: tooltip สั้น ๆ (นิยามอยู่ใน TRAINING §11)

กติกาเดิมที่ยังใช้: หน้าแสดง **ตัวเลขคุณภาพเท่านั้น** — ไม่มี pass/fail badge, ไม่มี health status

## §2.5 หน้า Prediction Runs (`/runs`)

จัดการวงจร: import predict data → สร้าง run → ดู progress → เปิดผล

**ส่วนบน — Predict data sources** (ย้าย import ของ predict มาไว้หน้านี้ ให้ครบวงจรในหน้าเดียว):
- ตาราง `predict_data_sources`: name, client_label, import_status pill, จำนวนแถว (จาก `clean_manifest`), imported_at, importer_name
- ปุ่ม Import (เหมือนหน้า training: file + name + client label + progress raw/clean)

**ส่วนสร้าง run:**

| Input | กติกา |
|---|---|
| Predict source | dropdown เฉพาะ `import_status='ready'` |
| Run name | default = `{source name} — {วันนี้}` |
| Cutoff date | default = วันที่ข้อมูลล่าสุดใน source (API ส่งมาให้ ไม่ให้ user เดา) — เพราะ predict ควรใช้ข้อมูลถึงปัจจุบันที่สุด |

กด Create → `POST /prediction-runs` → แถวใหม่สถานะ `in_progress` + progress inline

**ตาราง runs** (จาก `ml_prediction_runs`):
name · status pill (pending / in_progress / completed / failed) · predict source · cutoff_date · total_customers · created_by · finished_at · actions

- **Open** (completed) → ไปหน้า `/` พร้อมเลือก run นั้นใน run selector
- **Retry** (failed) → แสดง `error_message` + ปุ่มรันใหม่
- **Delete** → เฉพาะ owner, confirm ก่อน
- ขณะ `in_progress`: แถบ step — load data → gates → features → churn → clv → credit → derived → insert (polling จาก run detail)

## §2.6 หน้า Training (`/training`)

ของเดิม (import + ตาราง dataset) ใช้งานได้แล้ว — **เพิ่ม 3 ส่วน:**

**1. Train panel** (ตอนนี้ปุ่ม disabled — ทำให้จริง):

| Input | กติกา |
|---|---|
| Dataset | เลือกจากตารางเดิม (เฉพาะ ready) |
| Cutoff date | default = ค่าแนะนำจาก Gate 3 (วันล่าสุดที่ horizon 180 วันยังครบ) — API คำนวณให้ user แค่ยืนยัน |
| Horizon | default 180 วัน — ซ่อนใน advanced ไม่ต้องให้แก้ปกติ |

กด Train → `POST /training-runs` → progress phase: gates → labels → features → split → baselines → candidates+tuning → calibration → evaluation → promotion gate

**2. การ์ดสรุปผลหลังเทรนจบ** (ต่อโมเดล) — ตัวอย่าง:
> **Churn** — PR-AUC 0.71 (baseline ดีสุด 0.58) · calibration ECE 0.03 · leakage tests ✓ → **Promoted v3** (แทน v2)
> หรือ: → **ไม่ promote** — แพ้ champion เดิมบน backtest C2 (เหตุผลจาก promotion gate ข้อไหน)

ลิงก์ "ดูรายละเอียด" → `/model-performance`

**3. Training history** (จาก `ml_training_runs`): started_at · dataset · cutoff · status · ผล primary metric · promoted? · created_by — ไว้ตอบ "ครั้งที่แล้วเทรนเมื่อไหร่ ด้วย data ไหน"

## §2.7 หน้า AI Assistant (`/ai-chat`)

ฟีเจอร์แยก — spec หลักอยู่ `AI-ASSISTANT.md` สิ่งที่ต้องแก้ให้สอดคล้อง ML v2:
- ลบ quick link ที่ชี้ `/playbooks` (หน้าโดนลบ) — เหลือ Customers / Model Performance
- Quick prompts ปรับเป็นคำถามที่ตอบได้จริงจาก `ml_prediction_outputs` (เช่น "ลูกค้าเสี่ยงสูงที่ CLV เกิน 10k มีใครบ้าง")
- Evidence panel แสดง SQL ที่รันจริง (มีอยู่แล้ว — คงไว้)

## §2.8 หน้า Login (`/login`)

คงเดิม: Google OAuth ผ่าน Better Auth เท่านั้น

## §3 Value provenance — ทุกค่าบน UI มาจากไหน คำนวณเมื่อไหร่ โดยใคร

ค่าบนหน้าเว็บถูกคำนวณใน **3 จังหวะ** — UI ไม่คำนวณ business logic เองเด็ดขาด:

| จังหวะ | ใครคำนวณ | ได้อะไร |
|---|---|---|
| **T (ตอนเทรน)** | training pipeline (Python) | threshold ของ risk level, calibrator, โมเดล champion — เก็บใน model card / artifacts |
| **P (ตอน prediction run)** | prediction runner (Python) | ค่า per-customer ทุกตัวใน `ml_prediction_outputs` (probability, CLV, derived fields) |
| **Q (ตอนเรียก API)** | Elysia (SQL aggregate) | count / sum / group by / percentile ของ run นั้น |

### §3.1 ตัวอย่างไล่เส้นทางเต็ม: "ลูกค้าเสี่ยงสูง (High-risk active paid)"

```
predict_clean_payments + predict_clean_usage            ข้อมูลจริงของลูกค้า
  │  [P] runner สร้าง features 24 ตัว ณ cutoff (contract เดียวกับตอนเทรน)
  ▼
champion churn model (alias 'production')               [T] LightGBM ที่ผ่าน promotion gate
  │  raw score
  ▼
calibrator.pkl                                          [T] fit จาก validation ตอนเทรน
  │
  ▼
churn_probability = 0.83  ──────────────▶ เก็บลง ml_prediction_outputs   [P]
  │
  ▼
thresholds.json ของ champion                            [T] เลือกจาก validation (F2) ไม่ใช่เลขตายตัว
  │  0.83 อยู่ช่วง high (0.60–0.85)
  ▼
churn_risk_level = 'high'  ─────────────▶ เก็บลง ml_prediction_outputs   [P]
  │
  ▼
KPI "Active high risk" = count(*) WHERE lifecycle_stage='Active Paid'
                         AND churn_risk_level IN ('high','critical')      [Q]
  % = ÷ count(lifecycle_stage='Active Paid')   ← ตัวหารคือ active paid ไม่ใช่ลูกค้าทั้งหมด
```

ข้อควรระวังบน UI: คนที่ `churn_probability IS NULL` (not eligible) **ไม่อยู่ใน**ทั้งเศษและส่วนของ KPI นี้

### §3.2 ตารางที่มาของทุกค่า

| ค่าบน UI | สูตร / field | จังหวะ | หมายเหตุ |
|---|---|---|---|
| Total customers | `count(*)` จาก outputs ของ run | Q | = จำนวนลูกค้าใน predict source เสมอ (กติกา 1 คน 1 แถว) |
| Active paid / Free / Churned / Ghost | `group by lifecycle_stage` | Q | stage มาจาก rule ใน `features.py` [P] — ข้อมูลจริง ไม่ใช่โมเดล |
| ลูกค้าเสี่ยงสูง + % | §3.1 | T+P+Q | threshold มากับโมเดล เปลี่ยนเมื่อ retrain |
| Expected revenue at risk | `Σ revenue_at_risk` ของ active paid | Q | per-customer = `churn_probability × predicted_clv_6m` [P] |
| High-risk revenue exposure | `Σ predicted_clv_6m` WHERE risk ∈ {high,critical} | Q | คนละความหมายกับข้างบน — ติด label แยก |
| 30d credit demand | `Σ predicted_credit_usage_30d` WHERE active | Q | ค่า p50 จาก quantile model [P] |
| Monthly revenue chart | `sum(amount) group by month(payment_date)` จาก `predict_clean_payments` | Q | **ข้อมูลจริง 100%** ไม่ผ่านโมเดล — UI ติด label "actual" |
| Churn % (ตาราง/360) | `churn_probability` | P | null → แสดง "—" + tooltip เหตุผลจาก `model_eligibility_json` |
| Risk pill | `churn_risk_level` | P (threshold จาก T) | UI ห้ามตัดช่วงเอง |
| CLV 6m | `predicted_clv_6m` | P | คำทำนาย 180 วันข้างหน้า — label "forecast" |
| `p_alive` | BG-NBD | P | null ได้ถ้า champion เป็น regressor |
| Value tier | percentile ของ CLV ในหมู่ active ของ run | P | relative ภายใน run — เทียบข้าม run ตรง ๆ ไม่ได้ |
| Credit urgency | `estimated_days_until_topup` ตัดช่วง 14/30/90 | P | days = (credit_sms + credit_email ณ snapshot) ÷ (p50_30d/30) |
| Days until top-up | สูตรข้างบน | P | null ถ้า forecast ≤ 0 → UI แสดง "ไม่มีการใช้งานพอจะประเมิน" |
| Last activity | `days_since_last_activity` | P | นับจาก cutoff ไม่ใช่จากวันนี้ — tooltip ต้องบอก |
| Revenue / Purchases / Avg ticket | `total_revenue`, `n_purchases`, `avg_transaction_value` | P | ข้อมูลจริงสะสมถึง cutoff |
| Priority score + เหตุผล | `priority_score` (50 risk / 30 value / 20 credit), `priority_reason` | P | น้ำหนักอยู่ใน runner config |
| Churn factors (360) | `churn_factors_json` (top-5 SHAP) | P | แปล feature name → ภาษาคนด้วย mapping ฝั่ง UI (mapping คงที่ ไม่ใช่ logic) |
| Profile (เครดิต/expire/status) | `profile_snapshot_json` | P | ค่า "ณ วัน export Excel" — ไม่ใช่ realtime, UI ติด label วันที่ |
| กราฟ usage รายเดือน (360) | query `predict_clean_usage` ตรง | Q | ไม่เก็บใน outputs |
| Payment timeline (360) | query `predict_clean_payments` ตรง | Q | — |
| ตัวเลขหน้า Model Performance | `ml_model_evaluations` + `ml_model_versions` + aliases | T | เขียนตอนเทรน อ่านอย่างเดียว — ห้าม hardcode |

## §4 Response shape ของ summary endpoint (ใบสั่งงาน Elysia)

`GET /prediction-runs/:id/summary` — ตอบทุก widget ของ Overview ใน request เดียว:

```jsonc
{
  "run": { "id", "name", "cutoff_date", "status", "total_customers", "finished_at" },
  "lifecycle": { "active_paid": 0, "active_free": 0, "churned": 0, "ghost": 0 },
  "churn": {
    "eligible_count": 0,                       // ตัวหารของ %
    "by_risk": { "low": 0, "medium": 0, "high": 0, "critical": 0 },
    "thresholds": { "medium": 0.30, "high": 0.60, "critical": 0.85 }   // จาก model card — UI ใช้แสดง legend
  },
  "revenue": {
    "expected_at_risk": 0,                     // Σ p×CLV ของ active paid
    "high_risk_exposure": 0,                   // Σ CLV เฉพาะ high+critical
    "monthly_actual": [ { "month": "2026-01", "amount": 0, "n_payments": 0 } ]   // 12 เดือน
  },
  "value_risk_matrix": [ { "value_tier": "high", "risk_level": "high", "count": 0, "clv_sum": 0 } ],
  "credit": { "demand_30d": 0, "by_urgency": { "critical": 0, "warning": 0, "monitor": 0, "stable": 0 }, "topup_due_7d": 0 },
  "top_priority": [ { "acc_id": 0, "lifecycle_stage": "", "churn_probability": 0, "predicted_clv_6m": 0, "priority_score": 0, "priority_reason": "" } ],
  "model_versions": { "churn": "", "clv": "", "credit": "" }    // footer "ทำนายโดยรุ่นไหน"
}
```

## §5 Display states + รูปแบบตัวเลข

| สถานการณ์ | UI ต้องแสดง |
|---|---|
| ยังไม่มี run ที่ `completed` | empty state ทุกหน้า + ปุ่มพาไป `/runs` — ห้าม fallback เป็น mock |
| run `in_progress` | progress (จาก run detail) แทน dashboard |
| run `failed` | `error_message` + ปุ่ม retry |
| field เป็น null เพราะ not eligible | "—" + tooltip เหตุผลจาก `model_eligibility_json` (เช่น "ลูกค้า Free — ไม่เข้าเงื่อนไขโมเดล churn") |
| field เป็น null เพราะ insufficient_data | "ข้อมูลไม่พอประเมิน" — ต่างจาก not eligible |
| `ai_status != 'completed'` | ไม่ render การ์ด AI เลย (ไม่ใช่การ์ดว่าง) |

รูปแบบ: เงิน `฿` compact (฿1.2M), เปอร์เซ็นต์ทศนิยม 1 ตำแหน่ง, เครดิตคั่นหลักพัน, วันที่ `DD MMM YYYY` โซน Asia/Bangkok, ตัวเลขทำนายทุกตัวมี label/icon บอกว่าเป็น forecast

## §6 Gap checklist — UI ปัจจุบันเทียบ spec (จาก audit โค้ด `apps/web`)

| หน้า | มีแล้ว | ยังขาด / ต้องแก้ |
|---|---|---|
| `/` Overview | KPI 4 ใบ, lifecycle mix, revenue chart, risk + CLV + top-up widgets — **mock ทั้งหมด** | ต่อ `/summary` จริง; เพิ่ม Total customers KPI, Value×Risk matrix, Top 10 priority, run selector; แยก label actual vs forecast |
| `/customers` | ตาราง acc_id / stage / churn / CLV / revenue + filter lifecycle | คอลัมน์ risk level, revenue_at_risk, value tier, credit urgency, last activity, priority reason; filter risk/tier/urgency; quick presets; sort ฝั่ง server; export CSV |
| `/customers/[id]` | hero metrics, usage chart, profile ย่อ | churn factors (SHAP) — หัวใจของหน้า, profile snapshot (เครดิต/expire), payment timeline, แถบ p10–p90 credit, เหตุผล not eligible, ซ่อน AI card ที่เป็น Mockup |
| `/playbooks` | lane + การ์ด + done checkbox | **ลบ route ทั้งหน้า** (ตัดออกจาก scope — ดู §2) |
| `/model-performance` | การ์ด 4 โมเดล — **ตัวเลข hardcode** | อ่านจาก `ml_model_evaluations`; แยก split, เทียบ baseline, calibration curve, lift table, threshold ที่ใช้ |
| `/runs` | โครงหน้า + ตาราง — fetch เป็น stub คืน `[]` | ทำตาม §2.5: ย้าย predict import มารวม, create run (เลือก source + cutoff ที่ API แนะนำ), progress steps, open→เลือก run บน dashboard, retry/delete |
| `/training` | import + เลือก dataset ใช้งานได้จริง | ทำตาม §2.6: Train panel จริง (cutoff แนะนำจาก Gate 3), การ์ดสรุปผล+เหตุผล promote/ไม่ promote, training history |
| `/ai-chat` | chat + evidence panel ใช้งานได้ | ลบ quick link `/playbooks`, ปรับ quick prompts ให้ถามจาก `ml_prediction_outputs` ได้จริง (§2.7) |
| Layout/nav | sidebar มีลิงก์ครบทุกหน้าเก่า | ตัดเมนู playbooks / alerts / monthly-value, เพิ่ม run selector ใน header (§2.0) |
| `/alerts`, `/monthly-value`, `/playbooks` | — | ลบ route (§2) |

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

GET  /model-performance                        champion ทุก model_type + evaluations + baselines
POST /training-runs                            { train_source_id, cutoff_date, horizon_days }
GET  /training-runs/:id                        progress + ผล gate + metrics
```

กติกา: ทุก route ใช้ `requireUser`; read แชร์ทุกคน; mutation เฉพาะ owner (ตาม CLAUDE.md); aggregate ทำใน SQL ไม่ดึงทั้งตารางมา reduce ใน JS
