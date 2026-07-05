# เปิดโปรเจกต์ออกเน็ตด้วย Tailscale Funnel

ทุกอย่างรันใน **Docker ตัวเดียว** — ไม่ต้องลง Tailscale ลงเครื่องมหาลัย, ไม่ต้อง
forward port, ไม่ต้องมี public IP. Sidecar container `tailscale` จะเชื่อมออกไปหา
Tailscale เอง (outbound) แล้ว proxy เฉพาะ `web:3000` ออกสู่อินเทอร์เน็ต ส่วน
`db` / `redis` / `ml` / `api` ยังปิดอยู่ในเน็ตเวิร์ก Docker เหมือนเดิม.

## ตั้งค่าครั้งแรก (ทำครั้งเดียว)

1. **สร้าง auth key** ที่ https://login.tailscale.com/admin/settings/keys
   - เปิด **Reusable**
   - ปิด **Ephemeral** (เพื่อให้ node จำ state ได้จาก volume)
   - ใส่ tag `tag:moby`

2. **เปิด HTTPS + Funnel** ใน admin console (Funnel ต้องเปิดก่อนถึงจะใช้ได้):
   - MagicDNS + HTTPS certificates: https://login.tailscale.com/admin/dns
   - ACL — เพิ่ม attribute อนุญาต funnel ให้ tag:moby ที่ https://login.tailscale.com/admin/acls
     ```jsonc
     {
       "tagOwners": { "tag:moby": ["autogroup:admin"] },
       "nodeAttrs": [
         { "target": ["tag:moby"], "attr": ["funnel"] }
       ]
     }
     ```

3. **ใส่ key ใน `.env`** (คัดลอกจาก `.env.example`):
   ```
   TS_AUTHKEY=tskey-auth-xxxxxxxxxxxx
   TS_HOSTNAME=moby-analytics
   ```

## รัน

```bash
docker compose up -d              # ขึ้นทั้ง stack รวม tailscale
# หรือถ้า stack รันอยู่แล้ว เปิดเฉพาะตัว tailscale:
docker compose up -d tailscale
```

## เช็คว่าใช้ได้ไหม

```bash
docker compose logs -f tailscale         # ดู log การ join tailnet + ออก Funnel
docker compose exec tailscale tailscale status
docker compose exec tailscale tailscale funnel status
```

เมื่อสำเร็จจะได้ URL แบบ:

```
https://moby-analytics.<ชื่อ-tailnet>.ts.net
```

เปิด URL นั้นจากเน็ตข้างนอกได้เลย (มี HTTPS cert ให้อัตโนมัติ). ถ้าจะให้เข้าได้
**เฉพาะคนในทีม** โดยไม่เปิดสาธารณะ ให้แก้ `serve.json` เอา `AllowFunnel` ออก แล้ว
ใช้ผ่าน tailnet (Serve) แทน — ทุกคนต้องลง Tailscale แล้ว login เข้า tailnet เดียวกัน.

## ปิดการเปิดออกเน็ต

```bash
docker compose stop tailscale
```

เท่านี้ก็กลับไปเข้าถึงได้เฉพาะ localhost/เครื่องภายในเหมือนเดิม.
