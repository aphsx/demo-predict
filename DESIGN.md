# 1Moby Intelligence — Enterprise Redesign Spec

ระบบเดิม (`PROJECT.md`) ทำงานได้ครบ ML pipeline + DB + Web แต่ UI/UX และ
output schema เหมาะกับงาน demo มากกว่า production. เอกสารนี้คือ
**redesign ฉบับใหม่หมด** ของชั้น output (model + API + UI) — โดย
**คงโครง raw ingestion เดิมเอาไว้** (raw_customers / raw_payments / raw_usage
และ flow upload Excel ไม่เปลี่ยน)

---

## 1. Design principles

| หลักการ | คำอธิบาย |
|---|---|
| Outcome-first | ทุกหน้าต้องตอบคำถาม "พรุ่งนี้ฉันต้องทำอะไร" ภายใน 1 click |
| Single source of truth | ทุก KPI / ทุก action point ดึงจาก output schema เดียวกัน |
| Explain ทุกตัวเลข | มี hint, threshold, model lineage และ SHAP/CI ติดมาด้วยเสมอ |
| Two personas | (a) Sales / Account Manager — action queue + customer 360, (b) Analyst — model health + drift |
| Light premium | Salesforce/Tableau-style — surface ขาว, accent navy, semantic chips, ไม่มี tutorial text |
| Real-time signals | Anomaly / drift / threshold breach เด้งเป็น first-class citizen |

---

## 2. Information Architecture

```
┌──────────────── Sidebar ────────────────┐
│ OPERATE                                 │
│  • Command Center  /                    │
│  • Action Queue    /playbooks           │
│  • Customers       /customers           │
│  • Alerts          /alerts              │
│ ANALYZE                                 │
│  • Model Health    /model-performance   │
│ CONFIGURE                               │
│  • Pipelines       /runs                │
└─────────────────────────────────────────┘
```

| Page | Audience | Job-to-be-done |
|---|---|---|
| **Command Center** `/` | Both | "พอร์ตวันนี้เป็นยังไง มี alert อะไรบ้าง" |
| **Action Queue** `/playbooks` | Sales / AM | "เช้านี้ต้องโทร/ส่งอะไรให้ใครบ้าง" |
| **Customers** `/customers` | Both | "ค้นและกรองลูกค้าเข้าโฟลว์ใดโฟลว์หนึ่ง" |
| **Customer 360** `/customers/[id]` | Sales / AM | "ลูกค้าคนนี้ทำไมเสี่ยง ควรเสนออะไร" |
| **Alerts** `/alerts` | Both | "ระบบเห็นอะไรผิดปกติ → ใครต้องลงมือ" |
| **Model Health** `/model-performance` | Analyst | "โมเดลยังเชื่อถือได้ไหม drift หรือยัง" |
| **Pipelines** `/runs` | Analyst / Ops | "Run / upload ข้อมูลรอบใหม่" |

---

## 3. Visual system (Light Premium)

```
Background  #f6f8fb   Surface #ffffff   Surface-2 #fafbfd
Line        #e6eaf0   Line-2  #eef1f5
Ink         1: #0b1220  2: #1f2937  3: #475569  4: #64748b  5: #94a3b8
Brand       moby-600 #2563eb  moby-700 #1d4ed8  moby-50 #eff6ff
Semantic    ok #059669 / warn #d97706 / danger #dc2626 / info #0369a1
Lifecycle   paid #2563eb  free #7c3aed  churn #f97316  ghost #94a3b8
```

Type — **Inter** (UI) + **JetBrains Mono** (number) + **Sarabun** (Thai fallback).
Numbers ทุกที่ทำ tabular-nums + lining figures, ใส่ class `num`.

Components หลัก: `KpiCard`, `SectionCard`, `StatusPill`, `StackBar`, `Sparkline`,
`AlertItem`, `ProgressMeter`, `EmptyState`, `Skeleton`, `PageHeader`.
ดูใน `web/src/components/ui.tsx`.

---

## 4. New Prediction Output Schema (v2)

> เป้าหมาย: ให้ทุก downstream (UI / API / Notification / Export) อ้างจากออบเจกต์
> เดียวที่อธิบายลูกค้า "หนึ่งคนต่อหนึ่งรอบประเมิน" ครบ

### 4.1 Top-level shape

```jsonc
{
  "run_id":   "9f1c…",
  "acc_id":   1234567,
  "scored_at":"2025-07-01T12:00:00Z",
  "model_versions": {
    "churn":      "churn-2025.07.0",
    "clv":        "clv-2025.07.0",
    "credit":     "credit-2025.07.0",
    "winback":    "winback-2025.07.0",
    "conversion": "conv-2025.07.0"
  },

  "lifecycle":   { /* §4.2 */ },
  "scores":      { /* §4.3 */ },
  "intervals":   { /* §4.4 */ },
  "segmentation":{ /* §4.5 */ },
  "explanations":{ /* §4.6 */ },
  "next_best_action": { /* §4.7 */ },
  "signals":     [ /* §4.8 */ ]
}
```

### 4.2 `lifecycle`

```jsonc
{
  "stage":      "Active Paid",         // Active Paid | Active Free | Churned | Ghost
  "sub_stage":  "Healthy",             // Healthy | At Risk | Lapsed | Dormant | New | …
  "is_active":  true,
  "tenure_days": 412,
  "days_since_last_activity": 7
}
```

### 4.3 `scores` (point estimates 0–1 unless noted)

```jsonc
{
  "churn_probability":      0.74,   // 6m
  "churn_tier":             "High", // Low <.30, Medium <.60, High
  "comeback_probability":   null,   // populated เฉพาะ stage = Churned
  "winback_tier":           null,
  "conversion_probability": null,   // populated เฉพาะ stage = Active Free
  "conversion_tier":        null,

  "predicted_clv_6m":       4850.0, // ฿
  "p_alive":                0.61,   // BG/NBD

  "credit_p10": 12, "credit_p25": 21, "credit_p50": 38,
  "credit_p75": 70, "credit_p90": 110,                // days
  "urgency":  "Critical",                              // Critical|Warning|Monitor|Stable|New Customer
  "alert_date":"2025-07-22",                           // cutoff + p25
  "forecast_confidence": 0.82,

  "priority_score":   8.7,          // 0–10 weighted
  "revenue_at_risk":  3589.0        // ฿
}
```

### 4.4 `intervals`

```jsonc
{
  "clv_ci80": [3200, 6400],   // ฿ low, high
  "clv_ci95": [2400, 7800],
  "credit_pi80_days": [12, 110],   // P10–P90
  "credit_pi50_days": [21, 70]     // P25–P75
}
```

### 4.5 `segmentation`

```jsonc
{
  "rfm": { "r": 4, "f": 3, "m": 5, "total": 12, "segment": "Loyal" },
  "tags": ["paid_sms","high_value","sms_heavy"]
}
```

### 4.6 `explanations`

```jsonc
{
  "shap_top": [
    {"feature":"days_since_last_send","impact":"+0.18","direction":"increase_churn"},
    {"feature":"usage_decay_ratio",  "impact":"+0.12","direction":"increase_churn"},
    {"feature":"pay_frequency",      "impact":"-0.07","direction":"decrease_churn"}
  ],
  "narrative_th": "ลูกค้าใช้งานลดลง 56% ใน 3 เดือนล่าสุด และไม่ส่ง SMS มา 41 วัน",
  "narrative_en": "Usage dropped 56% in last 3 months; no SMS for 41 days"
}
```

### 4.7 `next_best_action`

```jsonc
{
  "code":     "RETAIN_CALL_OFFER",   // enum, machine-readable
  "channel":  "phone",               // phone | email | sms | in_app | none
  "play":     "Win-back call + 10% discount",
  "deadline": "2025-07-15",
  "reason":   "Churn 74% × CLV 4,850 ฿ × Critical urgency",
  "confidence": 0.78
}
```

NBA codes (เริ่มต้น):

| code | when |
|---|---|
| `RETAIN_CALL_OFFER` | High churn + High CLV |
| `RETAIN_CALL`       | High churn + Mid CLV |
| `TOPUP_REMINDER`    | Critical urgency |
| `UPSELL`            | Champions / Loyal + low utilization |
| `WINBACK_CAMPAIGN`  | Churned + winback High |
| `CONVERSION_OFFER`  | Active Free + conversion High |
| `MONITOR`           | else |

### 4.8 `signals` (per-customer anomaly evidence)

```jsonc
[
  { "type": "USAGE_DROP",       "delta": -0.56, "severity": "warn" },
  { "type": "PAYMENT_OVERDUE",  "days":  18,    "severity": "warn" },
  { "type": "NEW_PURCHASE",     "amount": 1200, "severity": "info" }
]
```

---

## 5. New DB tables (v2)

> raw_* tables (`raw_customers`, `raw_payments`, `raw_usage`, `prediction_runs`)
> **คงไว้เหมือนเดิม** เพื่อไม่กระทบ ingestion. ตารางผลลัพธ์ใหม่ทั้งหมด

### 5.1 `predictions` (rewrite, JSONB-rich)

| col | type | note |
|---|---|---|
| `run_id`     | UUID FK | |
| `acc_id`     | BIGINT | composite PK with run_id |
| `scored_at`  | TIMESTAMPTZ | |
| `lifecycle`  | JSONB | §4.2 |
| `scores`     | JSONB | §4.3 |
| `intervals`  | JSONB | §4.4 |
| `segmentation` | JSONB | §4.5 |
| `explanations` | JSONB | §4.6 |
| `nba`        | JSONB | §4.7 |
| `model_versions` | JSONB | for audit |

ดัชนีหลัก:

```sql
CREATE INDEX idx_pred_run            ON predictions(run_id);
CREATE INDEX idx_pred_stage          ON predictions((lifecycle->>'stage'));
CREATE INDEX idx_pred_churn_tier     ON predictions((scores->>'churn_tier'));
CREATE INDEX idx_pred_urgency        ON predictions((scores->>'urgency'));
CREATE INDEX idx_pred_priority       ON predictions(((scores->>'priority_score')::numeric) DESC);
CREATE INDEX idx_pred_rar            ON predictions(((scores->>'revenue_at_risk')::numeric) DESC);
CREATE INDEX idx_pred_rfm            ON predictions((segmentation->'rfm'->>'segment'));
```

### 5.2 `customer_signals`

per-customer event-style signals (จาก §4.8) — เปิดทางให้ทำ "Recent activity" timeline:

| col | type |
|---|---|
| run_id | UUID FK |
| acc_id | BIGINT |
| signal_type | VARCHAR |
| severity | VARCHAR(8)  — info / warn / danger |
| payload | JSONB |
| ts      | TIMESTAMPTZ |

### 5.3 `alerts` (portfolio-level)

| col | type |
|---|---|
| id | UUID PK |
| run_id | UUID FK |
| severity | VARCHAR — danger/warn/info/ok |
| category | VARCHAR — Portfolio/Model/Data/Pipeline |
| code | VARCHAR — `HIGH_CHURN_SHARE`, `RAR_BREACH`, `DRIFT_PSI`, `LEAKAGE_SUSPECT`, … |
| metric_value | NUMERIC |
| threshold_value | NUMERIC |
| metric_label | TEXT |
| body | TEXT |
| created_at | TIMESTAMPTZ |
| resolved_at | TIMESTAMPTZ NULL |
| acked_by | VARCHAR NULL |

### 5.4 `model_versions`

| col | type |
|---|---|
| id | VARCHAR PK — `churn-2025.07.0` |
| family | VARCHAR — churn / clv / credit / winback / conversion |
| algo | VARCHAR — `lightgbm+isotonic`, `bgnbd+gg` … |
| trained_at | TIMESTAMPTZ |
| training_cutoff | DATE |
| metrics | JSONB |
| artifact_path | VARCHAR |
| feature_baseline_psi_path | VARCHAR |

### 5.5 `audit_actions` (sales activity feedback loop)

| col | type |
|---|---|
| id | BIGSERIAL PK |
| run_id | UUID FK |
| acc_id | BIGINT |
| action_code | VARCHAR — RETAIN_CALL_OFFER … |
| channel | VARCHAR |
| outcome | VARCHAR — booked / no_answer / declined / converted |
| user | VARCHAR |
| ts | TIMESTAMPTZ |

---

## 6. New API contract (v2)

base path `/v2`. JSON ทุก endpoint, snake_case.

### 6.1 Runs

```
GET    /v2/runs                       → Run[] (เหมือนเดิม + status events)
POST   /v2/runs                       → Run
DELETE /v2/runs/{run_id}
POST   /v2/runs/{run_id}/upload       multipart=file → { job_id, status }
GET    /v2/runs/{run_id}              → Run + pipeline_events[]
```

### 6.2 Customers

```
GET /v2/runs/{run_id}/customers
  ?stage=Active%20Paid
  &churn_tier=High
  &urgency=Critical
  &rfm_segment=Loyal
  &search=12345
  &min_priority=7
  &page=1&page_size=50
  &sort=priority_score:desc
→
{
  "total": 25023,
  "page": 1, "page_size": 50,
  "data": [ <PredictionV2>, … ]
}

GET /v2/runs/{run_id}/customers/{acc_id}        → PredictionV2 + recent signals[]
GET /v2/runs/{run_id}/customers/{acc_id}/timeline → SignalEvent[]
POST /v2/runs/{run_id}/customers/{acc_id}/actions
  body { action_code, channel, outcome, note }
```

### 6.3 Summary / Distributions / Cohort

```
GET /v2/runs/{run_id}/summary       → { kpis, lifecycle, distributions, trend? }
GET /v2/runs/{run_id}/cohorts       → cohort retention matrix (optional)
```

`summary` shape:

```jsonc
{
  "kpis": {
    "total_customers": 25000,
    "active_paid":     { "total": 12500, "healthy": 9000, "at_risk": 3500,
                         "revenue_at_risk": 11200000, "avg_clv": 4850, "critical_topup": 890 },
    "active_free":     { "total": 5400, "high_intent": 1200, "avg_convert": 0.21 },
    "churned":         { "total": 6200, "winback_high": 800, "avg_comeback": 0.18 },
    "ghost":           { "total": 900 }
  },
  "distributions": {
    "churn":   {"Low":15000,"Medium":7660,"High":2340},
    "rfm":     {"Champions":1200,"Loyal":3400,…},
    "urgency": {"Critical":890,"Warning":2300,…}
  },
  "trend": { /* vs prior run */ "active_paid_delta": -0.012, … }
}
```

### 6.4 Alerts

```
GET    /v2/runs/{run_id}/alerts?severity=danger&category=Portfolio
POST   /v2/runs/{run_id}/alerts/{id}/ack
DELETE /v2/runs/{run_id}/alerts/{id}        # dismiss
```

### 6.5 Playbooks (Action Queue)

```
GET /v2/runs/{run_id}/playbooks
→
{
  "lanes": [
    { "id":"retain","title":"Retain · High churn","filters":{…},"items":[<Pred>], "size":124 },
    { "id":"topup","title":"Top-up · Critical","filters":{…},"items":[…], "size":89 },
    …
  ]
}
```

### 6.6 Model & drift

```
GET /v2/models                        → ModelVersion[]
GET /v2/models/{family}               → latest version + metrics + competition
GET /v2/runs/{run_id}/drift           → per-feature PSI & KS
GET /v2/runs/{run_id}/training-log    → string
```

### 6.7 What-if (ส่วนต่อขยาย)

```
POST /v2/runs/{run_id}/whatif
  body { intervention: { type: "campaign_call", lift_churn: -0.08 }, segment: "rfm:At Risk" }
  → expected_change in revenue_at_risk / churn_count / NBA mix
```

---

## 7. Ingestion (ไม่เปลี่ยน)

Excel sheets ที่รับยังเป็น:
`Users+User_profile`, `Backend_payment`, `SMS_usage_BC/API/OTP`,
`Email_usage_BC/API/OTP`. Validation + insert เข้า `raw_*` ตามเดิมในไฟล์
`ml/api/main.py` และ worker `predict_worker.py`.

ส่วนที่เปลี่ยน: หลัง predictor รันเสร็จ ต้อง serialize เป็น schema §4 แล้ว
INSERT ลง `predictions` (JSONB) ตามที่กำหนดในข้อ 5.1.

---

## 8. Migration plan (4 ขั้น)

1. **Add v2 tables เป็น parallel** — `predictions_v2`, `customer_signals`,
   `alerts`, `model_versions`, `audit_actions`. ของเดิมไม่แตะ
2. **Worker dual-write** — เขียนลงทั้ง `predictions` (เดิม) และ `predictions_v2`
   จนกว่า frontend จะ migrate ครบ
3. **Frontend cut over** — UI ใหม่ (โค้ดในชุดนี้) เปลี่ยนไปอ่าน `/v2/*`
4. **Drop legacy** — หลัง stable 2 รอบ run ลบตาราง `predictions` เดิม

---

## 9. Frontend ↔ schema mapping (ชั้น compatibility)

`web/src/lib/api.ts` ปัจจุบัน flatten output (`churn_probability`, `predicted_clv_6m`, …).
หน้าใหม่ทุกหน้าใช้ key เดียวกันอยู่ → ทำงานได้กับ API เดิมก่อน, เมื่อ
backend ออก v2 แล้ว ให้แก้ใน `api.ts` จุดเดียว:

```ts
// adapter v2 → flat
function flatten(p: PredictionV2) {
  return {
    acc_id: p.acc_id,
    lifecycle_stage: p.lifecycle.stage,
    sub_stage: p.lifecycle.sub_stage,
    days_since_last_activity: p.lifecycle.days_since_last_activity,
    ...p.scores,
    ...p.segmentation.rfm,
    rfm_segment: p.segmentation.rfm.segment,
    risk_factor_1: p.explanations.shap_top[0]?.feature,
    risk_factor_2: p.explanations.shap_top[1]?.feature,
    risk_factor_3: p.explanations.shap_top[2]?.feature,
    recommended_action: p.next_best_action.play,
    revenue_at_risk: p.scores.revenue_at_risk,
    clv_ci80_lo: p.intervals.clv_ci80?.[0],
    clv_ci80_hi: p.intervals.clv_ci80?.[1],
    clv_ci95_lo: p.intervals.clv_ci95?.[0],
    clv_ci95_hi: p.intervals.clv_ci95?.[1],
    rfm_r: p.segmentation.rfm.r,
    rfm_f: p.segmentation.rfm.f,
    rfm_m: p.segmentation.rfm.m,
  };
}
```

UI ไม่ต้องแก้ — ทุกหน้าใหม่ (`/`, `/customers`, `/customers/[id]`, `/playbooks`,
`/alerts`, `/model-performance`, `/runs`) อ่านจาก flat shape นี้ทั้งหมด

---

## 10. Files in this redesign

```
web/src/
├── app/
│   ├── globals.css                # Light Premium tokens (rewritten)
│   ├── layout.tsx                 # mounts <Shell>
│   ├── page.tsx                   # Command Center
│   ├── playbooks/page.tsx         # NEW — Action Queue
│   ├── alerts/page.tsx            # NEW — Anomaly feed + drift
│   ├── customers/page.tsx         # rewritten
│   ├── customers/[id]/page.tsx    # rewritten — Customer 360
│   ├── runs/page.tsx              # rewritten
│   └── model-performance/page.tsx # rewritten — Model Health
├── components/
│   ├── Shell.tsx                  # NEW — sidebar + topbar wrapper
│   ├── Sidebar.tsx                # rewritten — grouped nav
│   ├── Topbar.tsx                 # NEW — run selector, search, alerts bell
│   ├── ui.tsx                     # NEW — KpiCard, SectionCard, StatusPill, …
│   └── Badge.tsx                  # legacy (replaced by StatusPill, kept for compat)
└── lib/
    ├── api.ts                     # unchanged (flat shape) — adapter ready for v2
    └── runStore.ts                # NEW — run-id state via URL+localStorage
```
