# 1Moby Analytics — Full Stack

## Stack
- **ML/API**: Python + FastAPI + SQLAlchemy async
- **Frontend**: Next.js 14 + Tailwind CSS + Recharts
- **Database**: PostgreSQL 15
- **Queue**: Redis + Arq (background job processing)
- **Orchestration**: Docker Compose

---

## 2 Ways to Run

### Docker (Recommended)
```bash
# 1. Setup
cp .env.example .env

# 2. Build + Start
#    - First time: auto-train models if not exist
#    - Next times: skip training (use existing models)
docker-compose up --build

# 3. Retrain manually (when you have new data)
docker-compose exec ml python train.py /data/1Moby_Data.xlsx
```

### Local (No Docker)
```bash
# 1. Database
docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=moby1234 postgres:15-alpine

# 2. Redis (for background jobs)
docker run -d -p 6379:6379 redis:7-alpine

# 3. ML API (Terminal 1)
cd ml
pip install -r requirements.txt
python train.py data/1Moby_Data.xlsx   # first time or when data changes
uvicorn api.main:app --port 8001 --reload

# 4. Worker (Terminal 2)
cd ml
python -m arq worker.predict_worker.WorkerSettings

# 5. Frontend (Terminal 3)
cd web
npm install
npm run dev
```

**URLs:**
- Frontend: http://localhost:3001
- API docs:  http://localhost:8001/docs
- Database:  localhost:5433

---

## Model Training Behavior

| Situation | Action |
|-----------|--------|
| **Docker first run** | Auto-train if no models exist |
| **Docker restart** | Skip training (use existing models) |
| **Manual retrain** | `docker-compose exec ml python train.py <file>` |
| **Local mode** | Manual train only |

**Model files location:** `models/` (shared between ml and worker containers)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                      Frontend                         │
│                   (Next.js :3001)                    │
└──────────────────────┬──────────────────────────────┘
                       │ rewrite /api/* → ml:8000
┌──────────────────────▼──────────────────────────────┐
│                      ML API                          │
│                (FastAPI :8001)                       │
│  - REST endpoints                                    │
│  - SSE status streaming                              │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
┌────────▼─────────┐    ┌───────────▼──────────┐
│     Worker        │    │        Redis          │
│  (Arq background)│    │    (Job queue)         │
│  - Prediction     │    │                       │
└───────────────────┘    └───────────────────────┘
         │
┌────────▼─────────┐
│    PostgreSQL     │
│   (prediction DB) │
└───────────────────┘
```

---

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
- `GET  /runs/{id}/stream`                → SSE status streaming
- `GET  /health`                         → health check + model status

---

## Retrain Models

When you have new data:
```bash
# In Docker
docker-compose exec ml python train.py /data/your_data.xlsx

# Locally (in ml/ directory)
python train.py data/your_data.xlsx
```

Check model status:
```bash
curl http://localhost:8001/health
```