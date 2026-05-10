# 1Moby Analytics — Full Stack

## Stack
- **ML/API**: Python + FastAPI + SQLAlchemy async
- **Frontend**: Next.js 14 + Tailwind CSS + Recharts
- **Database**: PostgreSQL 15
- **Orchestration**: Docker Compose

---

## 2 Ways to Run

### Docker (Recommended)
```bash
# 1. Setup
cp .env.example .env

# 2. Build + Start (ml will auto-train on every start)
docker-compose up --build

# 3. Retrain manually (when you have new data)
docker-compose exec ml python train.py /app/data/new_data.xlsx
```

### Local (No Docker)
```bash
# 1. Database
docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=moby1234 postgres:15-alpine

# 2. ML API (Terminal 1)
cd ml
pip install -r requirements.txt
python train.py data/1Moby_Data.xlsx   # first time or when data changes
uvicorn api.main:app --port 8001 --reload

# 3. Frontend (Terminal 2)
cd web
npm install
npm run dev
```

**URLs:**
- Frontend: http://localhost:3001
- API docs:  http://localhost:8001/docs
- Database:  localhost:5433

---

## Auto-train Behavior

| Mode | Train when | How to retrain |
|------|------------|----------------|
| **Docker** | Every `docker-compose up` | `docker-compose exec ml python train.py <file>` |
| **Local** | Never (manual only) | `python train.py <data_file>` |
| **No models** | API returns `degraded` status + error message | Train first |

Check model status:
```bash
curl http://localhost:8001/health
```

---

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
- `GET  /runs/{id}/predictions/{acc_id}`  → customer 360
- `GET  /runs/{id}/summary`               → dashboard KPIs
- `GET  /health`                         → health check + model status