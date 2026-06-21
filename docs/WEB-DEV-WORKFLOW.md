# Web Dev Workflow

คู่มือสั้นๆ สำหรับรัน Docker และ dev เว็บใน `apps/web`

## ถ้าแก้ UI แล้วต้อง build ใหม่ไหม

ถ้าใช้งานผ่าน Docker ตาม `docker compose` ตอนนี้:

- ต้อง `build` ใหม่สำหรับ service `web`
- เพราะ container `web` ใช้ image build-time และไม่ได้ mount source code แบบ hot reload

`docker compose restart web` **ไม่พอ** — จะไม่ดึงโค้ดใหม่เข้า image

---

## 1. รันทั้งหมด (ทั้งโปรเจค)

```bash
docker compose up -d --build      # build + รันเบื้องหลังทั้ง 5 services
docker compose up -d              # รัน (ไม่ build ใหม่)
docker compose ps                 # ดูสถานะทุก service
docker compose logs -f            # ดู log รวมแบบ realtime
```

Services: `db`, `redis`, `ml`, `api`, `web`

---

## 2. รันแยกเฉพาะบาง service

```bash
docker compose up -d db redis api     # รันเฉพาะ backend (ไม่เอา web/ml)
docker compose up -d db redis ml       # รันเฉพาะฝั่ง ML
```

---

## 3. รันเฉพาะ web

```bash
docker compose up -d web          # รัน web (จะดึง api+db+redis ขึ้นมาด้วยอัตโนมัติ
                                  #  เพราะ web ต้องพึ่ง api)
docker compose up -d --build web  # ถ้าแก้โค้ด web แล้วอยาก build ใหม่
```

**หมายเหตุ:** web proxy `/api/*` ไปที่ `api:3001` เลยต้องมี api รันอยู่ — compose จะ start ให้เอง

---

## 4. stop / start / restart web

```bash
docker compose stop web           # หยุด web (container ยังอยู่)
docker compose start web          # เปิด web กลับ (ที่ stop ไว้)
docker compose restart web        # รีสตาร์ท web
docker compose up -d --build web  # rebuild + รันใหม่ (หลังแก้โค้ด)
```

---

## 5. ดู log / เข้า shell เฉพาะ web

```bash
docker compose logs -f web        # ดู log เฉพาะ web
docker compose exec web sh        # เข้า shell ใน container web
```

---

## 6. หยุด / ลบ

```bash
docker compose stop               # หยุดทุก service (เก็บ container + data ไว้)
docker compose down               # ลบ container + network (data ใน volume ยังอยู่)
docker compose down -v            # ลบทุกอย่าง + ลบ DB volume ด้วย ⚠️ ข้อมูลหาย
```

---

## ทางเลือกที่ดีกว่าสำหรับ dev เว็บ (เร็วกว่าเยอะ)

ถ้าจะแก้ UI บ่อยๆ ไม่ควรรัน web ใน Docker (build ช้า, ไม่มี hot-reload ดีนัก) — ให้รัน backend ใน Docker แต่รัน web บนเครื่องโดยตรง:

```bash
# 1) backend ใน docker
docker compose up -d db redis api      # (เพิ่ม ml ถ้าต้องเทรน/ทำนาย)

# 2) web บนเครื่อง host (hot-reload เร็ว)
cd apps/web
bun install
ELYSIA_URL=http://localhost:3001 \
NEXT_PUBLIC_AUTH_URL=http://localhost:3000 \
bun run dev                            # เปิดที่ http://localhost:3000
```

แบบนี้แก้โค้ดเห็นผลทันที ไม่ต้อง rebuild image

**สำคัญ:** ถ้ารัน `docker compose stop web api` แล้วเปิด web local ต้องเปิด api กลับด้วย (`docker compose up -d api`) ไม่งั้น login/API จะ error `ECONNREFUSED :3001`

ข้อดี:

- แก้ UI แล้ว reload เร็ว
- ไม่ต้อง `docker build` ทุกครั้ง
- เหมาะกับงาน styling, layout, spacing, copy, interaction

---

## Ports สรุป

| Service | Port (host) |
|---|---|
| web (Next.js) | `:3000` |
| api (Elysia) | `:3001` |
| ml (FastAPI) | `:8001` |
| db (Postgres) | `:5433` |
| redis | ภายใน Docker `:6379` (ไม่ expose ออก host) |

---

## สรุปเร็ว

- ใช้ Docker ล้วน: `docker compose up -d --build`
- รัน web ใน Docker: `docker compose up -d --build web`
- อยากแก้ UI เร็ว: `docker compose up -d db redis api` + รัน `apps/web` แบบ local dev server
