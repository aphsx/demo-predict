# Churn CRM Dashboard - การใช้งาน (Usage Guide)

โปรเจกต์นี้แบ่งออกเป็น 3 ส่วนหลัก ได้แก่ API (Backend), Dashboard (Frontend), และส่วน Training Model (สำหรับเทรนโมเดล)

คุณสามารถเปิดใช้งานตามขั้นตอนด้านล่างนี้:

---

## 1. การรัน API (Backend)
API ถูกสร้างด้วย FastAPI เพื่อใช้บริการข้อมูลและโมเดลทำนายการ Churn

**ขั้นตอนการรัน:**
1. เปิด Terminal และเข้าไปที่โฟลเดอร์ `api`
   ```bash
   cd api
   ```
2. ติดตั้ง Python dependencies ที่จำเป็น
   ```bash
   pip install -r requirements.txt
   ```
3. รัน Server ด้วยคำสั่ง `uvicorn`
   ```bash
   uvicorn main:app --reload
   ```
*API จะทำงานอยู่ที่: `http://localhost:8000`*

*(สามารถดู API Docs ได้ที่ `http://localhost:8000/docs`)*

---

## 2. การรัน Dashboard (Frontend)
ส่วนหน้าบ้านถูกพัฒนาด้วย Next.js (React)

**ขั้นตอนการรัน:**
1. เปิด Terminal ใหม่อีก 1 หน้าต่าง และเข้าไปที่โฟลเดอร์ `dashboard`
   ```bash
   cd dashboard
   ```
2. ติดตั้ง Node modules (ทำแค่ครั้งแรก)
   ```bash
   npm install
   ```
3. รัน Development Server
   ```bash
   npm run dev
   ```
*หน้า Dashboard จะทำงานอยู่ที่: `http://localhost:3000`*

---

## 3. การเทรนโมเดลใหม่ (Training Model) - Optional
หากต้องการเทรนโมเดล Machine Learning ใหม่ให้ทำการรัน script ด้านล่าง

**ขั้นตอนการรัน:**
1. เปิด Terminal เข้าไปที่โฟลเดอร์ `train`
   ```bash
   cd train
   ```
2. รันสคริปต์ Python เพื่อเทรนโมเดล (ต้องมั่นใจว่ามี library เช่น pandas, scikit-learn เรียบร้อยแล้ว)
   ```bash
   python churn_model.py
   ```
*หลังจบกระบวนการ ไฟล์อัปเดตโมเดล (`churn_model.pkl` และ `churn_model_keras.h5`) จะถูกบันทึกในโฟลเดอร์ `train/output` โดยอัตโนมัติเพื่อให้ API โหลดนำไปใช้งาน*
