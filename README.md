# 1Moby Analytics — Full Stack

## Stack
- **ML/API**: Python + FastAPI + SQLAlchemy async
- **Frontend**: Next.js 14 + Tailwind CSS + Recharts
- **Database**: PostgreSQL 15
- **Orchestration**: Docker Compose

## Quick Start

```bash
# 1. Copy env
cp .env.example .env

# 2. Train models ก่อน (ต้องมี Excel data)
cd ml && python train.py data/1Moby_Data.xlsx

# 3. Run all services
docker-compose up --build
```

**URLs:**
- Frontend: http://localhost:3001
- API docs:  http://localhost:8001/docs
- Database:  localhost:5433

## การใช้งาน

1. เปิด http://localhost:3001
2. ไปหน้า "จัดการรัน" → สร้าง Run ใหม่
3. อัปโหลดไฟล์ Excel → ระบบ predict อัตโนมัติ
4. ดูผลที่หน้า Dashboard และ รายชื่อลูกค้า

## Pages
- `/`              → Dashboard + KPI + Charts
- `/runs`          → จัดการ Prediction Runs + Upload
- `/customers`     → ตารางลูกค้า + filter + pagination
- `/customers/[id]`→ Customer 360 detail

## API Endpoints
- `GET  /runs`                           → list runs
- `POST /runs`                           → create run
- `POST /runs/{id}/upload`               → upload + trigger predict
- `GET  /runs/{id}/predictions`          → paginated results
- `GET  /runs/{id}/predictions/{acc_id}` → customer 360
- `GET  /runs/{id}/summary`              → dashboard KPIs
- `GET  /health`                         → health check
