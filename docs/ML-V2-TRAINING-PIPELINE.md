# ML v2 — Training Pipeline (ขั้นตอนเทรนที่ดีที่สุดสำหรับ dataset นี้)

> ตอบคำถาม: เทรนยังไงให้ไม่ leak, เลือกโมเดลตัวไหนเพราะอะไร ผสมดีกว่าไหม,
> วัดผลด้วยอะไร (F1 ฯลฯ) แต่ละค่าหมายความว่าอะไร, retrain เมื่อไหร่ยังไง
> ใช้แทนเอกสารเทรนเก่าทั้งหมด — legacy `apps/ml/src/models/` และ `train.py` ไม่ใช้ต่อ

## §1 หลักการที่ห้ามละเมิด

1. **Point-in-time (PIT):** เลือก `cutoff_date` แล้วโลกแบ่งเป็นสองส่วน — feature เห็นได้เฉพาะข้อมูล **ก่อน** cutoff, label มาจากข้อมูล **หลัง** cutoff ภายใน `horizon_days` เท่านั้น
2. **Temporal split เท่านั้น** — ห้าม random split (ข้อมูลเป็น time-series ของพฤติกรรม random split = ให้โมเดลแอบเห็นอนาคต ผล validation จะสวยเกินจริง)
3. **โมเดลต้องชนะ baseline** — ถ้า LightGBM ไม่ชนะ rule ง่าย ๆ แปลว่ายังไม่ควรใช้ ML และห้าม promote
4. **Probability ต้อง calibrated** — เพราะ downstream เอาไปคูณเงิน (`revenue_at_risk = p × CLV`)
5. **ทุกการเทรน reproducible** — fix seed, บันทึก config + `feature_code_hash` + เวอร์ชัน library ใน `ml_training_runs.training_config_json`
6. **หลักฐานทุกอย่างลง DB** — metric ลง `ml_model_evaluations`, gate report ลง `ml_data_validation_reports` — หน้าเว็บ/การตัดสินใจ promote อ่านจาก DB ไม่ใช่จาก log

## §2 ขั้นตอน end-to-end (ต่อ 1 training run)

```
 1. สร้าง ml_training_runs (status=in_progress, cutoff, horizon, config)
 2. โหลด train_clean_*                          ✅ data.py
 3. Gate 1–3: readiness / schema / cutoff feasibility ✅ validation.py
 4. สร้าง labels ทุกโมเดล + Gate 4 (label viability)  ✅ labels.py
 5. สร้าง features Tier A 24 ตัว + Gate 5 (leakage)   ✅ features.py
 6. Dataset builder: join features+labels เฉพาะกลุ่ม eligible   ❌ ใหม่
 7. Temporal split (§6)                                          ❌ ใหม่
 8. Preprocess: fit บน train เท่านั้น ✅ preprocessing.py
 9. เทรน baselines (§12) → eval → ลง ml_model_evaluations        ❌ ใหม่
10. เทรน candidates + Optuna (§8–9) → calibrate (§10) → eval (§11) ❌ ใหม่
11. Leakage tests หลังเทรน (§5.2)                                 ❌ ใหม่
12. Multi-cutoff backtest (§3)                                    ❌ ใหม่
13. เลือก champion + promotion gate (§14) → artifacts (§16)
14. activate alias "production" + บันทึก activation history
15. ปิด run: completed / failed (+error_message เสมอ)
```

ทุก step ที่ fail → run จบที่ `failed` พร้อมสาเหตุ — ห้าม fail เงียบแล้วไปต่อ

## §3 Cutoff, horizon และ backtest

- **Horizon:** 180 วัน (ทั้ง churn และ CLV 6 เดือน) / credit ใช้ 30 และ 90 วัน
- **เงื่อนไขเลือก cutoff:** ต้องมีประวัติก่อน cutoff ≥ 365 วัน (ให้ feature 180d/6m มีของจริง) และมีข้อมูลหลัง cutoff ≥ horizon เต็ม (label ครบ) — Gate 3 เช็คอยู่แล้ว
- **Multi-cutoff backtest:** เทรน/วัดที่ cutoff เดียวเชื่อไม่ได้ ใช้อย่างน้อย 3 cutoff เลื่อนถอยทีละ ~60 วัน:

```
cutoff C3 (เก่าสุด) ── train ──▶ วัดบน label หลัง C3
cutoff C2           ── train ──▶ วัดบน label หลัง C2
cutoff C1 (ล่าสุดที่ horizon ครบ) ── final model ──▶ test
```

โมเดลที่ดีต้อง**ชนะ baseline ทุก cutoff** และ metric ไม่แกว่งแรง (std ของ PR-AUC ข้าม cutoff < ~0.05) — ค่าทุก cutoff ลง `ml_model_evaluations` (มีคอลัมน์ `cutoff_date` รองรับแล้ว)

## §4 Labels และ Features

### Labels (`labels.py` — นิยามคงเดิม)

| โมเดล | ประชากร (ณ cutoff) | Label |
|---|---|---|
| Churn | Active Paid | `churned = 1` ถ้าไม่มี payment และไม่มี usage > 0 เลยใน 180 วันหลัง cutoff |
| CLV | Active | `future_revenue_6m = Σ amount` ใน 180 วันหลัง cutoff (ศูนย์ได้ — zero-heavy) |
| Credit | มีประวัติใช้งาน | `future_credit_usage_30d/90d`; `days_until_next_topup` (censored ถ้าไม่ top-up) |

### Features — Tier A 27 ตัว (`features.py` — contract verify แล้ว)

recency (4), payment RFM (7), usage volume/trend/consistency (8), channel + source shares (5), credit balance/runway (3) — รายชื่อเต็มอยู่ใน `MINIMUM_TIER_A_FEATURES`

กลุ่ม credit balance/runway สร้างแบบ PIT-safe จาก event history เท่านั้น (`Σ credit_add ก่อน cutoff − Σ usage ก่อน cutoff`) — **ไม่ใช้** snapshot `credit_sms`/`credit_email`/`expire_*` ซึ่งเป็น Tier B

**Tier system (เหตุผลที่เริ่มแค่ Tier A):**
- **Tier A** — สร้างจาก event history (payments, usage) ย้อนเวลาได้แม่นยำ → ปลอดภัยจาก leak เสมอ
- **Tier B** — snapshot fields (`status_sms`, `credit_*`, `expire_*`): ค่าใน Excel คือค่า "ตอน export" ไม่ใช่ค่า ณ cutoff ในอดีต → ใช้เทรนกับ cutoff ย้อนหลัง = leak อนาคตเข้า feature **ห้ามใช้เทรน** (ใช้แสดงผลใน `profile_snapshot_json` ได้)
- **Tier C** — `last_access`, `last_send`: นิยามใกล้ label เกินไป (เกือบเท่ากับบอกเฉลยว่า active ไหม) → ห้าม
- จะเพิ่ม feature ใหม่ได้เมื่อ: ผ่าน PIT review + อัพเดท `feature_schema_json` + `feature_code_hash` เปลี่ยน + เทรนเป็น feature set version ใหม่ — ห้ามแก้เงียบ ๆ

## §5 การกัน leakage (สำคัญที่สุดในระบบนี้)

### §5.1 กันเชิงโครงสร้าง (ป้องกันก่อนเกิด)

| กลไก | คือ |
|---|---|
| Builder รับ `cutoff_date` เสมอ | ทุก feature function กรอง `< cutoff` ก่อนคำนวณ — ไม่มี path ที่เห็นข้อมูลหลัง cutoff |
| Feature contract + `feature_code_hash` | hash ของ source code ตัวสร้าง feature เก็บใน `ml_feature_sets` — predict ต้องใช้ hash เดียวกับตอนเทรน ไม่งั้น abort |
| Preprocessor fit-on-train-only | `fit_preprocessor()` รับเฉพาะ train split; val/test/predict ใช้ `transform_features()` (มี `check_preprocessing_safety()` ตรวจ) |
| แยก train/predict cleanทั้ง pipeline | `train_clean_*` กับ `predict_clean_*` ไม่ปนกันตั้งแต่ import |

### §5.2 Leakage test suite (รันอัตโนมัติหลังเทรนทุกครั้ง — fail = block promotion)

| Test | วิธี | เกณฑ์ผ่าน |
|---|---|---|
| Single-feature AUC scan | เทรน stump ทีละ feature | ไม่มี feature เดี่ยวที่ AUC > 0.90 (ถ้ามี = feature นั้นน่าจะแอบบอกเฉลย → สอบสวน) |
| Target shuffle | สลับ label มั่ว แล้วเทรนใหม่ | AUC ≈ 0.50 (±0.05) — ถ้ายังสูง = pipeline รั่ว |
| Suspect-drop audit | ตัด feature ต้องสงสัย (recency กลุ่มแรง) แล้ววัดใหม่ | AUC ตกได้ แต่ถ้าตกจาก 0.95 → 0.65 = โมเดลพึ่ง feature เดียวผิดปกติ |
| Time-travel consistency | สร้าง feature ที่ cutoff เดิมจากข้อมูลที่เพิ่มภายหลัง | ค่า feature ของอดีตต้องไม่เปลี่ยน |
| Split contamination | เช็ค `acc_id` ซ้ำข้าม split ภายใน cutoff เดียวกัน | ต้องเป็นเซตแยกขาด |
| Score sanity | ถ้า validation AUC > 0.97 | ไม่ block แต่ flag ให้สอบสวนก่อนเชื่อ (สูงผิดธรรมชาติของ churn) |

ผลทุก test เขียนลง `ml_data_validation_reports` (`validation_type='leakage'`)

## §6 Temporal split

ภายใน cutoff ล่าสุด (C1): แบ่ง**ตามลูกค้า** (grouped by `acc_id`) — train 60% / validation 20% / test 20%, stratified ตาม label
ข้าม cutoff: C2, C3 ใช้เป็น backtest อิสระ (ไม่แตะตอน tune)

บทบาทของแต่ละชุด — **ห้ามสลับหน้าที่:**
- **train** — fit โมเดล + fit preprocessor
- **validation** — Optuna tuning, เลือก calibration method, เลือก threshold
- **test** — แตะครั้งเดียวตอนจบ เพื่อรายงานตัวเลขจริง (ถ้าเอา test มา tune = ตัวเลขเชื่อไม่ได้ทั้งหมด)
- **backtest (C2, C3)** — วัดความเสถียรข้ามเวลา

## §7 Class imbalance

- churn rate จริงอยู่ราว 5–40% ของ active paid → ใช้ `scale_pos_weight` / `class_weight` ใน model
- **ห้ามใช้ SMOTE / oversampling** — มันบิด distribution ทำให้ calibration พังทั้งระบบ (ขัด §1.4)
- วัดด้วย PR-AUC เป็นหลัก ไม่ใช่ accuracy (accuracy โกหกเมื่อ class เอียง)

## §8 การเลือกโมเดล — ใช้ตัวไหน ทำไม ผสมดีไหม

### Churn (binary classification)

| Candidate | บทบาท |
|---|---|
| Logistic Regression | baseline ML — ถ้า LGBM ชนะไม่ขาด ใช้ LR ไปเลย (อธิบายง่ายกว่า) |
| Random Forest | sanity check ความ non-linear |
| **LightGBM** ⭐ | ตัวเต็งหลัก |
| XGBoost | challenger ของ LGBM |

**ทำไม LightGBM เป็นตัวเต็ง:** ข้อมูลเรา tabular ~10⁴ แถว, มี missing values (recency ของคนไม่เคยจ่าย) ซึ่ง LGBM กินได้ตรง ๆ ไม่ต้อง impute เพิ่ม, เทรนเร็วพอจะทำ Optuna หลายร้อย trial + backtest หลาย cutoff, มี feature importance + SHAP ครบ — deep learning ไม่เหมาะกับข้อมูลขนาด/ทรงนี้ (tabular เล็ก = tree ensemble ชนะแทบเสมอ)

**ผสมโมเดล (ensemble) ดีกว่าไหม?** — คำตอบ: **ยังไม่ทำ**
- Stacking/blending ที่ data ~25k ลูกค้า ได้กำไรจริงราว 1–2% แต่แลกกับ: artifact ×2, calibration ซับซ้อนขึ้น, SHAP อธิบายยากขึ้น, retrain ช้าลง — สำหรับทีม 5 คนไม่คุ้ม
- ข้อยกเว้นที่อนุญาต: average ง่าย ๆ ของ calibrated LGBM + calibrated XGB — ลองได้ใน experiment แต่ promote ก็ต่อเมื่อชนะตัวเดี่ยว**ทุก backtest cutoff** อย่างมีนัย ไม่งั้นใช้ตัวเดี่ยว
- กติกา: **ความเรียบง่ายที่วัดผลได้ ชนะความซับซ้อนที่อธิบายไม่ได้**

### CLV (regression + ranking)

| Candidate | เหตุผล |
|---|---|
| **BG-NBD + Gamma-Gamma** ⭐ | โมเดลพฤติกรรมซื้อซ้ำโดยตรง ให้ `p_alive` ฟรี (มีคุณค่าบน UI) ทำงานได้ดีกับ data น้อย |
| LightGBM Tweedie regressor | challenger — Tweedie objective เหมาะ target ที่ศูนย์เยอะ (ลูกค้าจำนวนมาก revenue อนาคต = 0) |
| Two-stage (P(ซื้อ) × E[ยอด\|ซื้อ]) | ทางเลือกถ้าสองตัวแรกคุม zero-inflation ไม่อยู่ |

ตัดสินด้วย **Spearman correlation เป็นหลัก** (งานจริงคือ "จัดอันดับใครมีค่ามากสุด" ไม่ใช่ทายตัวเลขเป๊ะ) + MAE + top-decile capture

### Credit forecast (quantile regression)

**LightGBM quantile** (α = 0.10, 0.25, 0.50, 0.75, 0.90) — แยกโมเดลต่อ quantile ต่อ horizon (30d, 90d)
เหตุผลที่ต้องเป็น quantile: ธุรกิจต้องการ "ช่วง" ไม่ใช่ตัวเลขเดียว — p10–p90 ใช้บอกความมั่นใจบนหน้า 360 และคุม stock เครดิต / baseline: ค่าใช้จริง 30 วันล่าสุด

กลไกกันแพ้ baseline (เพราะ usage รายเดือนของลูกค้าส่วนใหญ่ persistent มากจน carryover เกือบ optimal):

- **Anchor บน log-ratio:** โมเดลเรียน correction ต่อ carryover (`log1p(y) − log1p(carryover)`) ไม่ใช่ทาย y ตรง ๆ
- **Correction shrinkage:** คูณ correction ของ p50 ด้วย λ ∈ [0, 1] ที่ tune บน validation MAE — λ = 0 คือ carryover เป๊ะ ดังนั้น point forecast เสื่อมถอยอย่างสุภาพกลับไปเท่า baseline เมื่อพฤติกรรมลูกค้าเปลี่ยนจนสัญญาณหาย ไม่มีทางแพ้หนักเชิงโครงสร้าง (λ ต่อ horizon เก็บใน model card)
- **Multi-cutoff pooling:** train split รวมแถวจาก backtest cutoffs เก่า (validation/test ยังเป็นของ cutoff ล่าสุดเท่านั้น และ acc_id ที่อยู่ใน validation/test จะไม่ถูกดึงเข้า train จาก cutoff ไหนเลย) — โมเดลได้เห็นลูกค้าคนเดิมในช่วงพฤติกรรมต่างกัน

## §9 Hyperparameter tuning (Optuna)

- Optimize **PR-AUC บน validation** (churn) / Spearman (CLV) / pinball loss (credit)
- 100 trials + MedianPruner, early stopping rounds 50, `TPESampler(seed=42)`
- Search space (LGBM): `num_leaves` 16–256, `learning_rate` 0.01–0.2 (log), `min_child_samples` 10–200, `feature_fraction`/`bagging_fraction` 0.5–1.0, `lambda_l1`/`l2` 1e-8–10 (log), `scale_pos_weight` ตามอัตรา class จริง
- best params เก็บใน `training_config_json` และ model card

## §10 Calibration (ทำไม churn_probability ถึงเชื่อได้)

- Gradient boosting ดิบให้คะแนน "เรียงถูก" แต่**ค่าความน่าจะเป็นเพี้ยน** — ใช้คูณเงินไม่ได้
- หลังเทรน: fit calibrator บน **validation** — เลือกระหว่าง Platt (sigmoid; data น้อย) กับ Isotonic (data พอ; ≥ ~1,000 positive) ตัวที่ Brier score บน validation ต่ำกว่า
- รายงาน **Brier score** และ **ECE (expected calibration error)** บน test + เก็บ calibration curve ลง `ml_model_evaluations.calibration_json` → หน้า Model Performance วาดกราฟได้
- Artifact: calibrator แยกไฟล์ + ระบุใน model card — prediction runner ต้อง load คู่กับโมเดลเสมอ

## §11 Evaluation metrics — วัดอะไร แปลว่าอะไร เท่าไหร่ถึงใช้ได้

ทุกค่า**คำนวณฝั่ง Python (sklearn/scipy/lifetimes)** แล้ว persist ลง `ml_model_evaluations` แยกตาม split — UI ไม่คำนวณเอง

### Churn

| Metric | ความหมายภาษาคน | เกณฑ์ |
|---|---|---|
| **PR-AUC** (primary) | คุณภาพการจับ "คนที่จะ churn จริง" เมื่อ class เอียง | ชนะทุก baseline ทุก cutoff — เกณฑ์เด็ดขาด |
| ROC-AUC | ความสามารถแยกกลุ่มโดยรวม | > 0.75 ใช้งานได้, > 0.97 ต้องสงสัย leak (§5.2) |
| Precision @ threshold | ในกลุ่มที่โมเดลชี้ว่าเสี่ยง — ชี้ถูกกี่ % ("โทรไปไม่เก้อกี่สาย") | ดูคู่ recall ตาม threshold ที่เลือก (§13) |
| Recall @ threshold | คนที่จะ churn จริง โมเดลจับได้กี่ % ("หลุดมือไปกี่คน") | ดูคู่ precision |
| **F1** | สมดุล precision/recall ที่ threshold เดียว | ใช้เทียบรุ่นต่อรุ่น ไม่ใช่เกณฑ์เดี่ยว — F1 ขึ้นกับ threshold เสมอ ต้องรายงาน threshold กำกับทุกครั้ง |
| Recall@top-10% | ถ้าทีมขายมีแรงโทรแค่ 10% ของลูกค้า จะครอบ churner จริงกี่ % | ยิ่งสูงยิ่งคุ้มแรงทีมขาย — metric ที่ตรงการใช้งานจริงที่สุด |
| Lift@top-10% | top 10% ของโมเดลเจอ churner หนาแน่นกว่าสุ่มกี่เท่า | > 2.5× ถือว่าใช้งานได้ |
| Brier score | ความแม่นของ "ค่าความน่าจะเป็น" เอง | ต่ำกว่า baseline ที่ทายอัตราเฉลี่ย |
| ECE | ความตรงของ calibration (บอก 70% แล้ว churn จริง ~70% ไหม) | < 0.05 |
| Confusion matrix | TP/FP/FN/TN ที่ threshold ใช้งาน | เก็บไว้แสดงบน Model Performance |

### CLV

| Metric | ความหมาย | เกณฑ์ |
|---|---|---|
| **Spearman** (primary) | จัดอันดับลูกค้าตามมูลค่าได้ถูกแค่ไหน | > 0.45 และชนะ baseline |
| MAE / RMSE | คลาดเคลื่อนเฉลี่ยเป็นบาท (RMSE โดน outlier ลากแรงกว่า) | MAE ชนะ baseline "ทายค่าเฉลี่ย" |
| SMAPE | % คลาดเคลื่อนแบบสมมาตร (กัน zero หาร) | รายงานประกอบ |
| Top-decile capture | top 10% ตามโมเดล กินรายได้จริงกี่ % ของทั้งหมด | > 35% |

### Credit

| Metric | ความหมาย | เกณฑ์ |
|---|---|---|
| MAE / SMAPE ต่อ horizon (30d, 90d) | คลาดเคลื่อนของ p50 | ชนะ baseline "ใช้เท่าเดือนที่แล้ว" |
| **Interval coverage** (primary) | ค่าจริงตกใน p10–p90 กี่ % — ควร ≈ 80% | 75–85% (ต่ำ = ช่วงแคบเกินหลอกมั่นใจ, สูง = กว้างเกินไร้ประโยชน์) |
| Urgent precision/recall | bucket "ต้อง top-up ≤14 วัน" เตือนถูก/ครบแค่ไหน | recall > 0.7 |

## §12 Baselines (ต้อง build ก่อน candidate เสมอ)

| โมเดล | Baseline |
|---|---|
| Churn | (1) recency rule: `days_since_last_activity > 90` → churn; (2) RFM score ต่ำสุด quartile; (3) Logistic Regression บน Tier A features |
| CLV | (1) ค่าเฉลี่ยกลุ่ม; (2) `total_revenue_180d` ที่ผ่านมา (สมมติอนาคต = อดีต); (3) RFM segment mean |
| Credit | (1) ใช้เท่า 30 วันล่าสุด; (2) moving average 90 วัน |

Baseline ทุกตัว evaluate ด้วย harness เดียวกับ candidate และลง `ml_model_evaluations` (มี `baseline_name`) — เพื่อให้หน้า Model Performance เทียบได้ และเป็นเกณฑ์ promotion

## §13 การเลือก threshold (สำหรับ churn_risk_level)

- เลือกบน **validation** ไม่ใช่เดา: กวาด threshold แล้วเลือกตามต้นทุนธุรกิจ — ค่าโทร 1 สายถูกมากเทียบกับ CLV ที่เสีย → ให้น้ำหนัก recall มากกว่า: ใช้ **F2 score สูงสุด** เป็น default ของเส้น high
- เส้นแบ่ง 4 ระดับ (low/medium/high/critical) เก็บใน model card + ส่งผ่าน API — **ห้าม hardcode ใน UI หรือ SQL**
- ทุกครั้งที่ retrain ให้คำนวณ threshold ใหม่ (distribution ของ score เปลี่ยนตามรุ่น)

## §14 Champion / Challenger + Model Registry

- ทุกโมเดลที่เทรน = แถวใน `ml_model_versions` (status: `candidate` → `production` → `archived`) + alias ใน `ml_model_aliases` (`production` ต่อ model_type ละ 1 ตัว — DB บังคับด้วย unique index แล้ว)
- prediction runner โหลดผ่าน alias `production` เท่านั้น

**Promotion gate — ครบทุกข้อถึง promote ได้ (ข้อใดข้อหนึ่ง fail = block):**
1. Gate 1–8 (data/label/feature/preprocessing) ผ่านหมด
2. Leakage test suite (§5.2) ผ่านหมด
3. ชนะ baseline ทุกตัวบน primary metric **ทุก backtest cutoff**
4. ถ้ามี champion เดิม: ชนะ champion เดิมบน backtest ชุดเดียวกัน (เทียบ apples-to-apples — รัน champion เดิมบน cutoff ใหม่ด้วย)
5. Calibration: ECE < 0.05 (churn) / coverage 75–85% (credit)
6. Artifact load test: โหลด model + preprocessor + calibrator จากไฟล์แล้ว predict ตัวอย่างได้จริง
7. Feature schema ตรงกับ `ml_feature_sets` (`feature_code_hash` ตรง)
8. Model card ครบ (§16)

การ activate/rollback ทุกครั้งลง `ml_model_activation_history` (ใคร, เมื่อไหร่, เหตุผล) — rollback = ชี้ alias กลับเวอร์ชันเก่า ไม่ต้องเทรนใหม่

## §15 Retraining policy

**Trigger ให้ retrain:**

| Trigger | ตรวจยังไง |
|---|---|
| Dataset ใหม่ import + clean สำเร็จ | user สั่งจากหน้า /training |
| ตามรอบเวลา | ทุก ~90 วัน (horizon ใหม่ครบ = มี label สดให้เรียน) |
| Feature drift | PSI ของ feature หลักระหว่าง train กับ predict ล่าสุด > 0.2 → เตือน (เก็บลง `drift_json` ที่จองไว้แล้ว) |
| Performance decay จากผลจริง | ดู realized-outcome ด้านล่าง |

**Realized-outcome loop (ปิดวงจร — ของที่ระบบเก่าไม่มี):**
เมื่อ prediction run อายุครบ 180 วัน และมี data ใหม่ที่ครอบช่วงนั้น → คำนวณ label จริงของลูกค้าใน run นั้น แล้ววัด PR-AUC / lift จริงเทียบที่เคยทำนาย เขียนเป็น `ml_model_evaluations` (`evaluation_type='production_holdout'`) — นี่คือตัวเลขที่ซื่อสัตย์ที่สุด ถ้าต่ำกว่า test ตอนเทรนมาก = โลกเปลี่ยน ต้อง retrain

**ขั้นตอน retrain:** รัน pipeline เต็ม (§2) ที่ cutoff ใหม่ → challenger เทียบ champion ผ่าน promotion gate ข้อ 4 → ชนะถึงสลับ alias, แพ้ก็เก็บเป็น candidate ไว้ดูได้ — **ไม่มี "incremental training"**: เทรนใหม่หมดทุกครั้ง (data ขนาดนี้เทรนไม่กี่นาที ความ reproducible สำคัญกว่า)

## §16 Artifacts + Model card

เก็บที่ `models/{model_type}/{version}/` (Phase 2 ค่อยย้าย R2):

```
model.pkl              โมเดลหลัก
calibrator.pkl         (churn) ตัว calibrate คู่กัน
preprocessor.json      PreprocessorConfig (fit จาก train split)
feature_names.json     ลำดับ feature ที่โมเดลคาด
thresholds.json        เส้นแบ่ง risk level (churn)
metrics.json           ทุก metric ทุก split
model_card.json / .md  เอกสารประจำรุ่น
training_log.txt
```

**Model card ต้องมี:** model_type/version, วันที่+cutoff+horizon, dataset (source_id, จำนวนแถว, positive rate), feature set (ชื่อ+version+hash), algorithm+params, ผลทุก split + เทียบ baseline + backtest, calibration method + ECE, thresholds, leakage test results, ข้อจำกัด (เช่น "ใช้ได้กับลูกค้า active paid เท่านั้น"), ผู้เทรน
path + checksum บันทึกใน `ml_model_versions.artifact_path` / `artifact_checksum`

## §17 Definition of Done ของระบบเทรน

- [ ] รัน training run จบจาก CLI/API เดียว: gates → train → eval → promote → artifacts ครบ
- [ ] `ml_model_evaluations` มีแถวของ baseline + candidate ทุก split ทุก cutoff
- [ ] Leakage suite รันอัตโนมัติและเคย "จับของจริง" ได้ (ทดสอบโดยจงใจใส่ feature leak แล้วต้อง fail)
- [ ] Champion มี alias `production` + model card + artifact load test ผ่าน
- [ ] หน้า Model Performance แสดงค่าจาก DB ล้วน ไม่มี mock
- [ ] Prediction runner ใช้ champion + preprocessor + calibrator ชุดเดียวกับที่เทรน (hash ตรง)
