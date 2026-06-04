# ML Training & Prediction Requirements

เอกสารนี้เป็น requirement หลักสำหรับการออกแบบ training pipeline และ prediction output ชุดใหม่ของ 1Moby Analytics

## Goal

ระบบต้องวิเคราะห์ลูกค้าจากข้อมูล clean import แล้วสร้างผลลัพธ์ที่จับต้องได้สำหรับทีม business/sales:

- ลูกค้าอยู่ stage ไหน
- ลูกค้ามีโอกาส churn แค่ไหน
- ลูกค้ามีมูลค่าอนาคตเท่าไร
- ลูกค้าน่าจะใช้/เติม credit อย่างไร
- ควร prioritize ลูกค้าคนไหนก่อน

## Prediction Scope

Prediction output หลักมี 4 กลุ่ม:

| No. | Component | Type | Purpose |
|---|---|---|---|
| 1 | Lifecycle Engine | Rule-based | แบ่งสถานะลูกค้าเพื่อใช้ตีความและจัด action |
| 2 | Churn Prediction | ML model | ทำนายโอกาสที่ลูกค้าจะ churn |
| 3 | CLV Prediction | ML model | ทำนายมูลค่าลูกค้าในอนาคต |
| 4 | Credit Consumption Forecast | ML model | ทำนายพฤติกรรมการใช้/เติม credit |

Model หลักมีเฉพาะข้อ 2, 3, 4 เท่านั้น ส่วนข้อ 1 เป็น business logic/rule-based layer

## Out Of Scope

ฟีเจอร์ต่อไปนี้ไม่อยู่ใน training/prediction scope ชุดใหม่:

- Win-back Prediction
- Conversion Prediction
- `comeback_probability`
- `conversion_probability`

ถ้ามี column หรือ UI เดิมที่อ้างถึง output เหล่านี้ ให้ถือว่าเป็น legacy และควรถูกถอดออกในรอบ refactor ถัดไป

## 1. Lifecycle Engine

Lifecycle เป็น rule-based segmentation ไม่ใช่ ML model หลัก

### Purpose

ใช้แบ่งกลุ่มลูกค้าเพื่อให้ dashboard, customer table, และ recommendation อ่านง่ายขึ้น

### Candidate Output

- `lifecycle_stage`
- `sub_stage`
- `days_since_last_activity`
- `ever_paid`

### Example Stages

- `Ghost` - สมัครแล้วแต่ยังไม่เคยใช้งานหรือจ่ายเงิน
- `Churned` - เคยใช้งานหรือจ่ายเงิน แต่หยุดไปแล้ว
- `Active Free` - ยังใช้งานอยู่ แต่ไม่เคยจ่ายเงิน
- `Active Paid` - ยังใช้งานอยู่ และเคยจ่ายเงิน

Stage name และ rule สามารถปรับใหม่ได้ แต่ต้องคงหลักการว่า lifecycle เป็นตัวช่วยตีความ ไม่ใช่ model หลัก

## 2. Churn Prediction

Churn เป็น ML model หลักตัวที่ 1

### Purpose

ทำนายโอกาสที่ลูกค้าจะหยุดใช้บริการหรือไม่กลับมาซื้อ/ใช้งานภายใน prediction horizon ที่กำหนด

### Target Population

ควรเริ่มจากกลุ่มลูกค้าที่มีประวัติใช้งานหรือจ่ายเงินเพียงพอ เช่น `Active Paid`

### Candidate Output

- `churn_probability`
- `churn_tier`
- `revenue_at_risk`

### Business Meaning

- `churn_probability`: ความเสี่ยง churn ของลูกค้า
- `churn_tier`: กลุ่มความเสี่ยง เช่น `Low`, `Medium`, `High`
- `revenue_at_risk`: มูลค่าที่เสี่ยงหายไป คำนวณจาก churn risk และ CLV

## 3. CLV Prediction

CLV เป็น ML/statistical model หลักตัวที่ 2

### Purpose

ทำนายมูลค่าลูกค้าในอนาคต เพื่อใช้จัด priority และแยกลูกค้ามูลค่าสูง

### Candidate Output

- `predicted_clv_6m`
- `p_alive`
- `clv_ci80_lo`
- `clv_ci80_hi`
- `clv_ci95_lo`
- `clv_ci95_hi`
- `n_purchases`
- `total_revenue`
- `avg_transaction_value`

### Business Meaning

- `predicted_clv_6m`: มูลค่าที่คาดว่าจะเกิดใน 6 เดือนข้างหน้า
- `p_alive`: โอกาสที่ลูกค้ายังเป็นลูกค้าที่ active อยู่
- `n_purchases`: จำนวนครั้งที่เคยซื้อ
- `total_revenue`: รายได้รวมจากลูกค้า
- `avg_transaction_value`: มูลค่าเฉลี่ยต่อ transaction

Confidence interval จะเก็บไว้ถ้าต้องการแสดง uncertainty ของ CLV บนหน้า Customer 360 หรือ model performance

## 4. Credit Consumption Forecast

Credit forecast เป็น ML model หลักตัวที่ 3

### Purpose

ทำนายจังหวะการใช้หรือเติม credit เพื่อช่วยทีม sales/support follow up ได้ถูกเวลา

### Candidate Output

- `credit_p10`
- `credit_p25`
- `credit_p50`
- `credit_p75`
- `credit_p90`
- `forecast_confidence`

### Business Meaning

- `credit_p10` ถึง `credit_p90`: quantile forecast ของจำนวนวันจนถึงเหตุการณ์สำคัญ เช่น เติม credit ครั้งถัดไป หรือ credit consumption threshold
- `credit_p50`: ค่ากลางที่ควรใช้เป็น forecast หลัก
- `credit_p25`: ใช้เป็น early warning/follow-up date ได้
- `forecast_confidence`: ความมั่นใจของ forecast

ต้องนิยาม label ให้ชัดเจนก่อน train ใหม่ว่า credit model จะทำนายอะไรแน่:

- จำนวนวันจนถึงการเติม credit ครั้งถัดไป
- จำนวนวันจนกว่า credit จะหมด
- ปริมาณ credit consumption ใน horizon ที่กำหนด
- หรือ target อื่นที่ business ใช้งานได้จริงกว่า

## Derived Business Outputs

Fields เหล่านี้ไม่จำเป็นต้องเป็น model output โดยตรง แต่ควรมีใน prediction result เพราะใช้กับ dashboard, customer table, sorting, และ recommendation:

- `revenue_at_risk`
- `avg_transaction_value`
- `forecast_confidence`
- `days_since_last_activity`
- `n_purchases`
- `total_revenue`
- `ever_paid`

## Recommended Prediction Record

Prediction result ต่อ customer ควรมี field ขั้นต่ำดังนี้:

```text
acc_id
lifecycle_stage
sub_stage
churn_probability
churn_tier
predicted_clv_6m
p_alive
clv_ci80_lo
clv_ci80_hi
clv_ci95_lo
clv_ci95_hi
credit_p10
credit_p25
credit_p50
credit_p75
credit_p90
forecast_confidence
revenue_at_risk
avg_transaction_value
days_since_last_activity
n_purchases
total_revenue
ever_paid
```

## Training Redesign Notes

ก่อนเริ่ม rewrite training pipeline ต้องสรุป decision ต่อไปนี้ให้ชัด:

1. Churn horizon คือกี่เดือน และ label churn นิยามจากอะไร
2. CLV horizon ใช้ 6 เดือนต่อหรือไม่
3. Credit model target จะทำนาย event/quantity ไหน
4. Lifecycle rule ใช้ active window กี่เดือน
5. Output ใดต้อง persist ลง DB และ output ใดคำนวณสดใน API ได้
6. Metrics ที่ต้องใช้วัดแต่ละ model คืออะไร

## Current Decision

สรุป scope ปัจจุบัน:

```text
1. Lifecycle Engine              rule-based
2. Churn Prediction              primary ML model
3. CLV Prediction                primary ML/statistical model
4. Credit Consumption Forecast   primary ML model
```

ให้ตัด Win-back และ Conversion ออกจาก model scope ชุดใหม่
