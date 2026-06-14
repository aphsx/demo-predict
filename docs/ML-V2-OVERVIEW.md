# ML v2 — Overview & Roadmap

> **เอกสารนี้คือจุดเริ่มต้น (single source of truth) ของระบบ ML v2 ทั้งหมด**
> เอกสารเก่าทั้งหมด (ML-TRAINING-SRS, ML-FEATURE-SPEC, ML-EXPERIMENT-PLAN, ML-DB-REBUILD-PLAN,
> MODEL-HEALTH-DASHBOARD, DESIGN.md, PROJECT.md ฯลฯ) ถูกลบและแทนที่ด้วยชุดเอกสารนี้
> ถ้าเนื้อหาใดขัดแย้งกับ code เก่าใน `apps/ml/src/models/` ให้ยึดเอกสารชุดนี้

## ชุดเอกสาร

| ไฟล์ | ตอบคำถาม |
|---|---|
| `ML-V2-OVERVIEW.md` (ไฟล์นี้) | ภาพรวมระบบ, ขอบเขต, ลำดับการ build |
| `ML-V2-DASHBOARD-SPEC.md` | **ข้อ 1** — หน้าเว็บต้องแสดงอะไรบ้าง widget ไหนใช้ field ไหน เอาอะไรออก |
| `ML-V2-OUTPUT-CONTRACT.md` | **ข้อ 2** — แต่ละ prediction run ต้องเก็บ output อะไรบ้าง (ML + ข้อมูลทั่วไป) พร้อมสูตรทุก field |
| `ML-V2-TRAINING-PIPELINE.md` | **ข้อ 3** — ขั้นตอนเทรนทั้งหมด: กัน leak, เลือกโมเดล, วัดผล (F1 ฯลฯ), retrain, champion/challenger |

เอกสารที่ยังใช้อยู่ (ไม่เกี่ยวกับ ML core):
- `../moby-data-prep/docs/` — import/clean pipeline: naming convention, raw/clean schema (เสร็จแล้ว)
- `AI-ASSISTANT.md` — AI chat (ฟีเจอร์แยก)
- `WEB-DEV-WORKFLOW.md` — วิธีรัน dev
- `README.md` (โฟลเดอร์ docs) — สารบัญเอกสารทั้งหมด

## ภาพรวมระบบ (end-to-end)

```
Excel 8 sheets ──import──▶ predict_raw_* ──clean──▶ predict_clean_*        ✅ เสร็จแล้ว
Excel 8 sheets ──import──▶ train_raw_*   ──clean──▶ train_clean_*          ✅ เสร็จแล้ว

TRAINING (รันเมื่อมี dataset ใหม่ / ตาม retrain policy)
train_clean_* ─▶ Quality Gates 1–5 ─▶ labels + features (Tier A, 24 ตัว)
             ─▶ temporal split ─▶ preprocess (fit เฉพาะ train)
             ─▶ baselines ─▶ candidate models + Optuna ─▶ calibration
             ─▶ evaluation (validation / test / backtest) ─▶ promotion gate
             ─▶ artifacts + ml_model_versions + alias "production"

PREDICTION (รันเมื่อ user สร้าง prediction run)
predict_clean_* ─▶ Gates ─▶ features (contract เดียวกับตอนเทรน)
              ─▶ lifecycle rules ─▶ champion models (churn / clv / credit)
              ─▶ derived outputs (risk level, revenue_at_risk, priority ฯลฯ)
              ─▶ ml_prediction_outputs (1 แถว / ลูกค้า / run)

WEB (อ่านอย่างเดียวจาก output + clean tables ผ่าน Elysia)
Overview ▸ Customers ▸ Customer 360 ▸ Model Performance
```

หลักการใหญ่ 3 ข้อที่ทุกส่วนต้องยึด:

1. **Point-in-time correctness** — feature ใช้ข้อมูลก่อน cutoff เท่านั้น, label ใช้ข้อมูลหลัง cutoff เท่านั้น ห้ามปนกันเด็ดขาด
2. **Observed ≠ Predicted** — `lifecycle_stage` คือสิ่งที่*เกิดขึ้นแล้ว* (rule-based จากข้อมูลจริง) ส่วน churn/CLV/credit คือ*คำทำนายอนาคต* (model) หน้าเว็บต้องไม่เอามาปนกัน
3. **ทุกตัวเลขบนหน้าเว็บต้อง trace กลับไปหา field ใน database ได้** — ห้ามมี mock data ใน production page

## ขอบเขต ML v2

| Component | วิธี | Output หลัก |
|---|---|---|
| Lifecycle | Rule-based (ไม่ใช่ ML) | `lifecycle_stage`, `sub_stage` |
| Churn | LightGBM + calibration + SHAP | `churn_probability`, `churn_risk_level`, `churn_factors_json` |
| CLV | BG-NBD + Gamma-Gamma แข่งกับ ML regressor | `predicted_clv_6m`, `p_alive` |
| Credit forecast | LightGBM quantile regression | `predicted_credit_usage_30d/90d`, `estimated_days_until_topup` |

**ตัดออกถาวร:** win-back model, conversion model, `comeback_probability`, `conversion_probability`

## สถานะปัจจุบัน vs เป้าหมาย

| ส่วน | สถานะ |
|---|---|
| Import + clean (train / predict แยกกัน) | ✅ เสร็จ ใช้งานได้ |
| Quality Gates 1–5 + persistence | ✅ เสร็จ (`apps/ml/src/training/validation.py`) |
| Label builders | ✅ เสร็จ (`labels.py`) |
| Tier A feature builder (model-specific 24/27 features) + lifecycle rules | ✅ เสร็จ (`features.py`) |
| Preprocessing contract (fit-on-train-only) | ✅ เสร็จ (`preprocessing.py`) |
| Dataset builders (features + labels + split) | ✅ เสร็จ (`datasets.py` — temporal grouped split + month-aligned backtest cutoffs) |
| Baselines + candidate training + Optuna + calibration | ✅ เสร็จ (`baselines.py`, `churn_trainer.py`, `clv_trainer.py`, `credit_trainer.py`) |
| Evaluation + ml_model_evaluations | ✅ เสร็จ (`metrics.py`, `registry.py` — holdout/backtest/baseline ทุก split) |
| Champion/challenger + alias activation | ✅ เสร็จ (`registry.py` + promotion gate ใน `runner.py`; churn เลือก candidate ที่ CV สูงสุด*ที่ผ่าน gate*) |
| Prediction runner → ml_prediction_outputs | ✅ เสร็จ (`src/prediction/runner.py` + `predict_v2.py`) |
| Elysia API สำหรับ prediction output / summary / model metrics | ✅ เสร็จ (`routes/prediction-runs.ts`, `training-runs.ts`, `model-performance.ts`, suggested-cutoff) |
| หน้าเว็บต่อ API จริง (ตอนนี้เป็น mock ทั้งหมด) | ✅ เสร็จ (mlApi ชี้ API จริง; mock เหลือเฉพาะ opt-in ผ่าน `NEXT_PUBLIC_ML_USE_MOCK=1`) |

> โค้ดเทรนเก่าใน `apps/ml/src/models/` และ `apps/ml/train.py` คือ legacy v1 — **ไม่เอามาใช้ต่อ**
> เขียน training runner ใหม่ทั้งหมดใน `apps/ml/src/training/` ตาม `ML-V2-TRAINING-PIPELINE.md`
> (ส่วนที่ verify แล้วใน `src/training/` — gates, features, preprocessing — ตรง contract ใหม่อยู่แล้ว เก็บไว้ใช้ต่อได้)

## ลำดับการ build (Phase)

| Phase | งาน | เอกสารอ้างอิง |
|---|---|---|
| A | Dataset builders: รวม features + labels + lifecycle → train/val/test ตาม temporal split | TRAINING §6–7 |
| B | Baselines 3 ตัวของ churn + evaluation harness + เขียนผลลง `ml_model_evaluations` | TRAINING §12 |
| C | Churn candidates (LR/RF/LGBM/XGB) + Optuna + calibration + leakage tests | TRAINING §8–10, §5 |
| D | Promotion gate + model registry + alias activation + model card | TRAINING §14, §16 |
| E | CLV (BG-NBD+GG vs regressor) และ Credit (quantile) ด้วย harness เดียวกัน | TRAINING §8, §11 |
| F | Prediction runner: เขียน `ml_prediction_outputs` ครบทุกลูกค้า + derived fields | OUTPUT-CONTRACT ทั้งไฟล์ |
| G | Elysia routes: runs / summary / outputs / customer / model-performance | DASHBOARD §7 |
| H | ต่อหน้าเว็บเข้า API จริง ถอด mock + ถอดของที่ไม่ใช้ | DASHBOARD §6 |
| I | Realized-outcome loop (วัดผลจริงเมื่อครบ horizon) + retrain policy | TRAINING §15 |
| Phase 2 | AI explanation (Gemini), R2 storage, Eden Treaty, email notification | — |
