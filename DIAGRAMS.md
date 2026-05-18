# 1Moby Analytics — Use Case & Activity Diagrams

เอกสารนี้รวบรวม **Use Case Diagram** และ **Activity Diagrams** ของระบบ 1Moby Analytics
(อ้างอิงจาก [README.md](./README.md) และ [PROJECT.md](./PROJECT.md))

---

## สารบัญ

- [1. Use Case Diagram](#1-use-case-diagram)
- [2. Use Case Descriptions](#2-use-case-descriptions)
- [3. Activity Diagram — End-to-End Prediction Workflow](#3-activity-diagram--end-to-end-prediction-workflow)
- [4. Activity Diagram — Model Training (Offline)](#4-activity-diagram--model-training-offline)

---

## 1. Use Case Diagram

```mermaid
%%{init: {'theme':'default'}}%%
flowchart LR
    %% Actors
    User((👤 Business User))
    Admin((👤 Data/ML Engineer))
    Worker((⚙️ ARQ Worker<br/>System Actor))
    DB((🗄️ PostgreSQL<br/>System Actor))

    %% System boundary
    subgraph SYS [1Moby Analytics System]
        direction TB

        UC1([UC1: Create Prediction Run])
        UC2([UC2: Upload Excel Dataset])
        UC3([UC3: Monitor Run Status])
        UC4([UC4: View Dashboard / KPIs])
        UC5([UC5: Browse Customer List])
        UC6([UC6: View Customer 360])
        UC7([UC7: Filter & Search Customers])
        UC8([UC8: Delete Prediction Run])
        UC9([UC9: Check System Health])

        UC10([UC10: Run ML Prediction Pipeline])
        UC11([UC11: Build Features])
        UC12([UC12: Compute Churn / CLV / Credit])
        UC13([UC13: Generate SHAP Explanations])
        UC14([UC14: Persist Predictions])

        UC15([UC15: Train ML Models])
        UC16([UC16: Validate Excel Schema])
    end

    %% User associations
    User --- UC1
    User --- UC2
    User --- UC3
    User --- UC4
    User --- UC5
    User --- UC6
    User --- UC7
    User --- UC8

    %% Admin associations
    Admin --- UC15
    Admin --- UC9
    Admin --- UC8

    %% System actors
    Worker --- UC10
    DB --- UC14

    %% Include / Extend relationships
    UC2 -.->|«include»| UC16
    UC2 -.->|«include»| UC10
    UC10 -.->|«include»| UC11
    UC10 -.->|«include»| UC12
    UC10 -.->|«include»| UC13
    UC10 -.->|«include»| UC14
    UC6 -.->|«extend»| UC13
    UC4 -.->|«include»| UC3
```

---

## 2. Use Case Descriptions

| ID | Use Case | Actor(s) | Description | Trigger | Main Flow |
|----|----------|----------|-------------|---------|-----------|
| **UC1** | Create Prediction Run | Business User | สร้าง run ใหม่โดยตั้ง `name` และ `cutoff_date` เพื่อใช้เป็นจุดอ้างอิงการวิเคราะห์ | กดปุ่ม "Create Run" บนหน้า `/runs` | `POST /runs` → DB insert → run status = `pending` |
| **UC2** | Upload Excel Dataset | Business User | อัปโหลดไฟล์ Excel (Users, Payments, Usage) ให้ระบบประมวลผล | กด Upload หลังสร้าง run | Validate sheets → INSERT raw_* tables → enqueue ARQ job |
| **UC3** | Monitor Run Status | Business User | ติดตามสถานะ run แบบ real-time (`pending → validating → processing → done / failed`) | เปิดหน้า dashboard / runs | Poll ทุก 5s หรือ subscribe SSE `/runs/{id}/stream` |
| **UC4** | View Dashboard / KPIs | Business User | ดูภาพรวม: Active customers, Revenue at risk, Churn distribution, RFM, Urgency | เลือก run จาก dropdown | `GET /runs/{id}/summary` → render charts |
| **UC5** | Browse Customer List | Business User | ดูตารางลูกค้าทั้งหมดของ run พร้อม pagination | เปิดหน้า `/customers` | `GET /runs/{id}/predictions?page=...` |
| **UC6** | View Customer 360 | Business User | ดูรายละเอียดลูกค้ารายคน: Churn gauge, CLV+CI, RFM, Credit forecast, Sales recommendation | คลิก `acc_id` | `GET /runs/{id}/predictions/{acc_id}` |
| **UC7** | Filter & Search Customers | Business User | กรองตาม Churn tier / RFM segment / Urgency / search `acc_id` | เลือก filter | ส่ง query params ไป `/predictions` |
| **UC8** | Delete Prediction Run | Business User / Admin | ลบ run พร้อม cascade ลบ raw + predictions | กดปุ่ม Delete (confirmation) | `DELETE /runs/{id}` |
| **UC9** | Check System Health | Admin | ตรวจสถานะ DB connectivity + model files ที่โหลด | `GET /health` | คืน status + model versions |
| **UC10** | Run ML Prediction Pipeline | ARQ Worker (system) | ประมวลผล ML ทั้งหมดเป็น background job | ARQ dequeue job | load raw → features → predict → SHAP → batch insert |
| **UC11** | Build Features | Worker | สร้าง 30 features (user / payment / usage) แบบ point-in-time safe | ภายใน UC10 | `build_features(users, payments, usage, cutoff)` |
| **UC12** | Compute Churn / CLV / Credit | Worker | รัน 3 โมเดล: LightGBM (Churn), BG/NBD+GG (CLV), Quantile LGBM ×5 (Credit) | ภายใน UC10 | `MobyPredictor.run_all_predictions()` |
| **UC13** | Generate SHAP Explanations | Worker | คำนวณ top-3 risk factor สำหรับ active customer 500 อันดับแรก | ภายใน UC10 | SHAP TreeExplainer |
| **UC14** | Persist Predictions | Worker → DB | บันทึก predictions แบบ batch 1,000 rows/trip | ภายใน UC10 | INSERT INTO predictions |
| **UC15** | Train ML Models | Data/ML Engineer | retrain โมเดลด้วยข้อมูลใหม่ | manual CLI | `python train.py <excel>` → save `.pkl` ใน `models/` |
| **UC16** | Validate Excel Schema | System (during UC2) | ตรวจ sheets ที่จำเป็น และ schema ของแต่ละ sheet | ระหว่าง upload | reject ถ้า invalid → status = `failed` |

---

## 3. Activity Diagram — End-to-End Prediction Workflow

```mermaid
%%{init: {'theme':'default'}}%%
flowchart TD
    Start([● Start])

    A1[User เปิดหน้า /runs]
    A2[กรอก name + cutoff_date<br/>กด Create]
    A3["POST /runs<br/>(status = pending)"]
    A4[เลือก Excel file<br/>กด Upload]
    A5["POST /runs/{id}/upload"]

    V{Validate sheets<br/>+ schema?}
    Vfail[status = failed<br/>เก็บ error_message]
    EndFail([● End: Failed])

    I1["INSERT raw_customers<br/>raw_payments<br/>raw_usage"]
    I2[status = validating]
    I3[Enqueue job → Redis ARQ]
    I4[status = processing]

    subgraph WORKER [⚙️ ARQ Worker — Background]
        direction TB
        W1[Dequeue job]
        W2[Load raw data จาก DB]
        W3[build_features<br/>30 features point-in-time safe]
        W4[Run Churn Model<br/>LightGBM + Isotonic]
        W5[Run CLV Model<br/>BG/NBD + Gamma-Gamma]
        W6[Run Credit Model<br/>Quantile LightGBM x5]
        W7[คำนวณ RFM segment<br/>+ Priority Score<br/>+ Revenue at risk]
        W8[SHAP top-500 active]
        W9[Batch INSERT predictions<br/>1000 rows/trip]
        W10[UPDATE prediction_runs<br/>status = done]
    end

    subgraph FE [🖥️ Frontend Polling — every 5s]
        direction TB
        P1[Poll GET /runs/{id}]
        Pcheck{status?}
    end

    R1[ดู Dashboard<br/>GET /summary]
    R2[Browse /customers<br/>filter + paginate]
    R3[Click acc_id<br/>เปิด Customer 360]
    R4[เห็น Churn gauge,<br/>CLV CI, RFM,<br/>Credit quantiles,<br/>Sales recommendation]
    EndOK([● End: Success])

    Start --> A1 --> A2 --> A3 --> A4 --> A5 --> V
    V -- No --> Vfail --> EndFail
    V -- Yes --> I1 --> I2 --> I3 --> I4
    I3 --> W1 --> W2 --> W3 --> W4 --> W5 --> W6 --> W7 --> W8 --> W9 --> W10

    I4 --> P1 --> Pcheck
    Pcheck -- processing --> P1
    Pcheck -- failed --> EndFail
    Pcheck -- done --> R1 --> R2 --> R3 --> R4 --> EndOK

    W10 -. notify .-> Pcheck
```

---

## 4. Activity Diagram — Model Training (Offline)

```mermaid
%%{init: {'theme':'default'}}%%
flowchart TD
    S([● Start])

    T1[วาง Excel ใหม่ที่<br/>ml/data/1Moby_Data.xlsx]
    T2[python train.py<br/>data/1Moby_Data.xlsx]
    T3[Load + clean data]
    T4[Define active /<br/>churn labels<br/>ที่ CUTOFF]
    T5[build_features<br/>30 features]

    T6[Train Churn<br/>LightGBM + Optuna 30 trials<br/>+ Isotonic calibration]
    T7[Train CLV<br/>BG/NBD + Gamma-Gamma<br/>+ Empirical PI per decile]
    T8[Train Credit<br/>5 quantile LightGBM<br/>+ Conformal calibration]

    T9{Leakage<br/>detection<br/>passed?}
    Tfail[หยุด + แจ้ง warning]
    EndFail([● End: Aborted])

    T10[คำนวณ RFM segments<br/>+ baseline distribution]
    T11[Save artifacts:<br/>churn_model.pkl<br/>ltv_bgnbd.pkl, ltv_gg.pkl<br/>credit_q10..q90.pkl<br/>metrics.json<br/>monitoring_baseline.json<br/>rfm_segments.csv]
    T12[ML API auto-load<br/>โมเดลใหม่ตอน reload]
    EndOK([● End: Models Ready])

    S --> T1 --> T2 --> T3 --> T4 --> T5
    T5 --> T6
    T5 --> T7
    T5 --> T8
    T6 --> T9
    T7 --> T9
    T8 --> T9
    T9 -- No --> Tfail --> EndFail
    T9 -- Yes --> T10 --> T11 --> T12 --> EndOK
```

---

## Summary

- **UC1–UC9** → user-facing flows ผ่าน Next.js frontend
- **UC10–UC14** → automated system flows ที่ worker เรียกหลัง upload
- **UC15–UC16** → admin / system support
- End-to-end activity diagram แสดง async hand-off ผ่าน **Redis + ARQ worker** และ polling loop ทุก 5 วินาที ขณะ `status = processing`
- Training activity diagram แยกออกมาเป็น offline CLI ที่ผลิต `.pkl` artifacts ให้ API/Worker โหลดตอน runtime
