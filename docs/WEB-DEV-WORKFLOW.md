docker compose stop web
cd apps/web
ELYSIA_URL=http://localhost:3001 bun run dev

# Web Dev Workflow

docker compose up -d --build api

คู่มือสั้นๆ สำหรับตอนแก้ UI ใน `apps/web`

## ถ้าแก้ UI แล้วต้อง build ใหม่ไหม

ถ้าใช้งานผ่าน Docker ตาม `docker compose` ตอนนี้:

- ต้อง `build` ใหม่สำหรับ service `web`
- เพราะ container `web` ใช้ image build-time และไม่ได้ mount source code แบบ hot reload

## คำสั่งที่ใช้บ่อย

### แก้เฉพาะ UI

```bash
docker compose up --build web
```

หรือถ้าต้องการรันแบบ background:

```bash
docker compose build web
docker compose up -d web
```

### แก้ UI และ API พร้อมกัน

```bash
docker compose up --build web api
```

### restart อย่างเดียวไม่พอ

คำสั่งนี้จะไม่ดึงโค้ดใหม่เข้า image:

```bash
docker compose restart web
```

## วิธีที่เร็วที่สุดตอนทำ UI

แนะนำให้รัน backend ใน Docker แล้วรัน Next.js ฝั่ง `web` บนเครื่องโดยตรง

### 1. เปิด service backend ที่จำเป็น

```bash
docker compose up -d db redis api
```

ถ้าหน้าอื่นที่คุณทำต้องพึ่ง worker หรือ ml ด้วย ค่อยเปิดเพิ่ม:

```bash
docker compose up -d db redis api ml worker
```

### 2. รัน frontend แบบ dev

```bash
cd apps/web
bun install
ELYSIA_URL=http://localhost:3001 bun dev -p 3000
```

จากนั้นเปิด:

```text
http://localhost:3000
```

ข้อดี:

- แก้ UI แล้ว reload เร็ว
- ไม่ต้อง `docker build` ทุกครั้ง
- เหมาะกับงาน styling, layout, spacing, copy, interaction

## สรุปเร็ว

- ใช้ Docker ล้วน: `docker compose up --build web`
- อยากแก้ UI เร็ว: รัน `apps/web` แบบ local dev server
