# AI Chat System — Implementation Doc
> Churn Prediction CRM · 1MOBY · อัปเดต มีนาคม 2026

---

## ภาพรวม

AI Chat ของระบบนี้เป็น **dual-purpose assistant** สำหรับทีม CRM และ Admin:

1. **Data Q&A** — ถามข้อมูลอะไรก็ได้จาก DB (LLM เขียน SQL เอง ไม่มี pre-defined tools)
2. **Company Q&A** — ถามเรื่องบริษัท, คำศัพท์, กระบวนการ, วิธีใช้งาน (ตอบจาก knowledge base)

---

## Architecture

```
ผู้ใช้ถาม (ภาษาไทย/อังกฤษ)
         │
         ▼
┌─────────────────────────────────────┐
│  System Prompt (สร้างทุก request)   │
│                                     │
│  - Role + instructions              │
│  - company_knowledge.md  (cached)   │
│  - DB Schema จาก information_schema │
│    (cached in memory)               │
│  - Run context (#id, ชื่อ)          │
└──────────────┬──────────────────────┘
               │
               ▼
       LLM (Ollama / Cloud)
               │
       ┌───────┴────────┐
       │                │
  ตอบทันที         สร้าง <SQL>
  (company Q&A)         │
       │                ▼
       │      sql_safety.py validate
       │                │
       │                ▼
       │      Execute on PostgreSQL
       │                │
       │      ส่งผลกลับ LLM (≤30 rows)
       │                │
       │          LLM วิเคราะห์
       │                │
       └───────┬─────────┘
               ▼
         คำตอบภาษาไทย
         (render Markdown ใน UI)
```

---

## Files

```
api/
├── chat_service.py       ← Main logic: prompt building, LLM loop, result formatting
├── db_introspect.py      ← Dynamic schema จาก information_schema + memory cache
├── sql_safety.py         ← Security: validate SELECT-only, parse <SQL> blocks
├── company_knowledge.md  ← Knowledge base — แก้ไขได้โดยไม่ต้องแตะ code
└── schema_context.py     ← DEPRECATED (ว่างเปล่า)

dashboard/
└── app/runs/[id]/
    ├── RunChat.tsx        ← Chat UI + Markdown renderer (react-markdown + remark-gfm)
    └── page.tsx           ← ส่ง runId + runName ให้ RunChat
```

---

## Flow รายละเอียด

### 1. Schema Introspection (`db_introspect.py`)

ดึง schema จาก `information_schema.columns` ตรงๆ ไม่ hardcode:

```python
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = ANY(['customers','payments','predictions','prediction_runs'])
  AND table_schema = 'public'
ORDER BY table_name, ordinal_position
```

- **Cache ใน memory** — query DB แค่ครั้งแรก reset เมื่อ restart
- **Business hints** — dict เล็กๆ สำหรับ column ที่ชื่อไม่ชัด เช่น `ltv`, `downgraded`, `risk_tier`
- เพิ่ม column ใหม่ใน DB → อัปเดตอัตโนมัติ (restart server)

### 2. Company Knowledge (`company_knowledge.md`)

ไฟล์ Markdown แก้ไขง่าย ทีมแก้เองได้โดยไม่ต้องแตะ code:

```
api/company_knowledge.md
├── เกี่ยวกับ 1MOBY
├── ประเภทลูกค้า (paid / trial)
├── คำศัพท์ (Churn, LTV, RFM Segment, SHAP)
├── แพ็กเกจ SMS
├── กระบวนการ Predict
├── Recommended Actions
├── ทีมที่ใช้ระบบ
└── FAQ
```

โหลดครั้งแรกเมื่อมี request แล้ว cache ใน memory เช่นกัน

### 3. System Prompt (สร้างต่อ request)

```
คุณเป็น AI ผู้ช่วยภายในของ 1MOBY...
[run context ถ้ามี]

[company_knowledge.md ทั้งไฟล์]

=== วิธีใช้ SQL ===
- <SQL>...</SQL> หรือ <SQL_1>...</SQL_1> <SQL_2>...</SQL_2>
- เมื่อได้ผลแล้ว → ตอบทันที
- คำถามทั่วไป → ตอบได้เลย ไม่ต้อง SQL

=== กฎ SQL ===
- SELECT เท่านั้น
- aggregate → ไม่ต้อง LIMIT
- raw rows → LIMIT ≤ 100
- "คนที่ N" → OFFSET N-1

[DB Schema จาก db_introspect]
```

### 4. LLM Loop (`chat_service.py`)

```
round 0-4 (max 5 rounds):
  → call LLM
  → parse <SQL> blocks จาก response
  → ถ้าไม่มี SQL → return คำตอบ (จบ)
  → execute แต่ละ SQL block
  → format ผลลัพธ์ (สูงสุด 30 rows ต่อ block)
  → ส่งกลับ LLM พร้อม instruction
  → round >= 3 → บังคับตอบ ห้าม SQL เพิ่ม

ถ้าเกิน 5 rounds → return error message
```

### 5. SQL Safety (`sql_safety.py`)

| Check | วิธี |
|-------|------|
| ต้องเริ่มด้วย SELECT | `startswith("SELECT")` |
| ห้าม keyword อันตราย | token-based match (ไม่ใช่ substring เพื่อกัน false positive) |
| ห้าม SQL comment | ตรวจ `--` และ `/*` |
| Auto LIMIT | inject `LIMIT 100` ถ้าไม่มี (ยกเว้น aggregate ล้วนๆ) |

### 6. Markdown Rendering (Frontend)

`RunChat.tsx` ใช้ `react-markdown` + `remark-gfm`:
- ตาราง, bold, italic, list, code, blockquote
- AI bubble render Markdown / User bubble เป็น plain text
- ความสูง chat box 520px มี scroll

---

## API

```
POST /api/chat

Body:
{
  "message":  "คำถาม",
  "history":  [{"role": "user"|"assistant", "content": "..."}],  // 10 turn ล่าสุด
  "run_id":   1,        // optional — ถ้ามีจะ inject ใน context
  "run_name": "ชื่อ Run" // optional
}

Response:
{
  "reply":        "คำตอบภาษาไทย (Markdown)",
  "sql_executed": ["SELECT ...", "SELECT ..."]  // SQL ที่รันจริง
}
```

---

## Model

| ENV var | Default | หมายเหตุ |
|---------|---------|---------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server |
| `OLLAMA_MODEL` | `qwen3.5:397b-cloud` | ผ่าน Ollama cloud routing ไม่ต้อง download local |

ตั้งค่าใน `.env`:
```
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3.5:397b-cloud
```

Model อื่นที่รองรับ (ถ้า cloud ไม่ได้):
| Model | VRAM | คุณภาพ SQL |
|-------|------|-----------|
| `qwen3.5:9b` | ~6 GB | ดี |
| `qwen2.5:14b` | ~9 GB | ดีมาก |
| `qwen2.5:32b` | ~20 GB | ยอดเยี่ยม |

---

## การเพิ่มข้อมูลบริษัท

**ไม่ต้องแตะ code** — แก้ไฟล์เดียว:

```
api/company_knowledge.md
```

แล้ว restart FastAPI server เพื่อ reload cache

---

## ตัวอย่างคำถามที่รองรับ

### คำถาม DB (LLM เขียน SQL เอง)
- "ลูกค้าที่เสี่ยง churn สูงสุด 10 คน พร้อม LTV"
- "ลูกค้าคนที่ 99 มีประวัติอะไรบ้าง"
- "Champions กับ At Risk ต่างกันยังไงในข้อมูลชุดนี้"
- "ลูกค้าที่จ่ายมากกว่า 50,000 แต่ไม่ login มา 30 วัน มีกี่คน"
- "เทียบยอดซื้อ 90 วันที่แล้วกับ 90 วันก่อนหน้า"

### คำถามบริษัท (ตอบจาก knowledge base ไม่ต้อง SQL)
- "At Risk คืออะไร ควรทำอะไร"
- "LTV คำนวณยังไง"
- "downgraded หมายความว่าอะไร"
- "วิธีใช้งานระบบนี้เป็นยังไง"
- "ลูกค้า trial กับ paid ต่างกันยังไง"

---

## ข้อจำกัดปัจจุบัน

| ข้อจำกัด | รายละเอียด |
|---------|-----------|
| ไม่มี streaming | รอ response ทั้งก้อน ไม่แสดงทีละตัวอักษร |
| History เก็บ client-side | refresh หน้า = history หาย |
| Knowledge cache | แก้ไข `company_knowledge.md` ต้อง restart server |
| Schema cache | migrate DB แล้วต้อง restart server (หรือเรียก `invalidate_cache()`) |
