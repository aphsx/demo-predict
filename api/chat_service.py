"""
chat_service.py — Text-to-SQL AI Chat
LLM เขียน SQL เองตามคำถาม ไม่มี pre-defined tools
Schema ดึงจาก DB จริงแบบ dynamic (cached)

Flow:
  คำถาม → LLM สร้าง <SQL> → execute → LLM วิเคราะห์ผล → ตอบภาษาไทย
"""

import json
import os
import textwrap
from pathlib import Path

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from db_introspect import get_schema
from sql_safety import validate, inject_limit, parse_sql_blocks

OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5:397b-cloud")

_KNOWLEDGE_FILE = Path(__file__).parent / "company_knowledge.md"
_knowledge_cache: str | None = None


def _load_knowledge() -> str:
    global _knowledge_cache
    if _knowledge_cache is None:
        if _KNOWLEDGE_FILE.exists():
            _knowledge_cache = _KNOWLEDGE_FILE.read_text(encoding="utf-8")
        else:
            _knowledge_cache = ""
    return _knowledge_cache

_LLM_TIMEOUT = 180.0
_MAX_DISPLAY_ROWS = 30   # แสดงสูงสุดกี่แถวให้ LLM ก่อน truncate


# ─────────────────────────────────────────────────────────────
# System prompt — สั้น ชัด ไม่ขยายเกินจำเป็น
# ─────────────────────────────────────────────────────────────

def _build_prompt(schema: str, run_id: int | None, run_name: str | None) -> str:
    ctx = f'\nคุณกำลังวิเคราะห์ข้อมูล Prediction Run #{run_id}: "{run_name}"' if run_id else ""
    knowledge = _load_knowledge()
    knowledge_section = f"\n{knowledge}\n" if knowledge else ""
    return textwrap.dedent(f"""\
        คุณเป็น AI ผู้ช่วยภายในของ 1MOBY สำหรับทีม CRM และ Admin{ctx}
        ตอบภาษาไทยเสมอ ให้ข้อมูลตรง มีประโยชน์ และอธิบายเหตุผล
        ตอบได้ทั้งคำถามเกี่ยวกับข้อมูลใน DB และคำถามทั่วไปเกี่ยวกับบริษัทและระบบ
        {knowledge_section}
        === วิธีใช้ SQL (เฉพาะเมื่อต้องการข้อมูลจาก DB) ===
        - ถ้าต้องการข้อมูล → เขียน SQL ใน <SQL>...</SQL>
        - ถ้าต้องหลาย query พร้อมกัน → <SQL_1>...</SQL_1> <SQL_2>...</SQL_2>
        - เมื่อได้ผล SQL แล้ว → ตอบทันที ไม่ต้องเขียน SQL เพิ่มอีก
        - คำถามทั่วไป (บริษัท, คำศัพท์, วิธีใช้งาน) → ตอบได้เลย ไม่ต้อง SQL

        === กฎ SQL ===
        - SELECT เท่านั้น ห้าม INSERT / UPDATE / DELETE / DROP
        - aggregate (COUNT/SUM/AVG + GROUP BY) ไม่ต้อง LIMIT
        - raw rows → LIMIT ≤ 100
        - "คนที่ N" หรือ "อันดับ N" → ORDER BY ... LIMIT 1 OFFSET N-1

        {schema}
    """)


# ─────────────────────────────────────────────────────────────
# DB execution
# ─────────────────────────────────────────────────────────────

async def _run_sql(sql: str, db: AsyncSession) -> dict:
    ok, err = validate(sql)
    if not ok:
        return {"error": f"SQL ไม่ผ่าน safety check: {err}", "rows": [], "count": 0}
    try:
        result = await db.execute(text(inject_limit(sql)))
        rows = [dict(r) for r in result.mappings()]
        return {"rows": rows, "count": len(rows)}
    except Exception as exc:
        return {"error": str(exc), "rows": [], "count": 0}


def _format_result(idx: int, result: dict) -> str:
    label = f"[ผลลัพธ์ SQL_{idx}]" if idx else "[ผลลัพธ์ SQL]"

    if result.get("error"):
        return f"{label} ERROR: {result['error']}\n"

    rows = result["rows"]
    count = result["count"]

    if not rows:
        return f"{label} ไม่พบข้อมูล (0 แถว)\n"

    display = rows[:_MAX_DISPLAY_ROWS]
    truncate_note = f"\n... (แสดง {_MAX_DISPLAY_ROWS}/{count} แถว)" if count > _MAX_DISPLAY_ROWS else ""
    return (
        f"{label} ({count} แถว):\n"
        + json.dumps(display, ensure_ascii=False, default=str)
        + truncate_note + "\n"
    )


# ─────────────────────────────────────────────────────────────
# LLM call
# ─────────────────────────────────────────────────────────────

async def _call_llm(client: httpx.AsyncClient, messages: list[dict]) -> str:
    resp = await client.post(
        f"{OLLAMA_URL}/api/chat",
        json={
            "model":    OLLAMA_MODEL,
            "messages": messages,
            "stream":   False,
            "options":  {"temperature": 0.2, "top_p": 0.9},
        },
        timeout=_LLM_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("message", {}).get("content", "")


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

async def chat(
    message:  str,
    history:  list[dict],
    db:       AsyncSession,
    run_id:   int | None = None,
    run_name: str | None = None,
) -> dict:
    """
    Returns {"reply": str, "sql_executed": list[str]}
    """
    schema = await get_schema(db)
    system = _build_prompt(schema, run_id, run_name)

    messages: list[dict] = [{"role": "system", "content": system}]
    for turn in history[-10:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": message})

    sql_executed: list[str] = []

    try:
        async with httpx.AsyncClient(timeout=_LLM_TIMEOUT) as client:
            for round_num in range(5):
                reply = await _call_llm(client, messages)
                sql_blocks = parse_sql_blocks(reply)

                if not sql_blocks:
                    return {"reply": reply, "sql_executed": sql_executed}

                # มี SQL — execute แล้วส่งผลกลับ
                messages.append({"role": "assistant", "content": reply})

                results = ""
                for i, sql in enumerate(sql_blocks, start=1 if len(sql_blocks) > 1 else 0):
                    sql_executed.append(sql)
                    results += _format_result(i, await _run_sql(sql, db))

                # round สุดท้าย: บังคับตอบ ห้าม SQL เพิ่ม
                instruction = (
                    "นี่คือข้อมูลทั้งหมด กรุณาสรุปและตอบเป็นภาษาไทย ห้ามเขียน SQL เพิ่มอีก"
                    if round_num >= 3 else
                    "ได้ข้อมูลมาแล้ว ถ้าครบ → ตอบเลย ถ้ายังต้องการข้อมูลเพิ่ม → เขียน SQL ได้อีก"
                )
                messages.append({"role": "user", "content": results + "\n" + instruction})

        return {"reply": "ขออภัย ไม่สามารถวิเคราะห์ได้ กรุณาลองใหม่", "sql_executed": sql_executed}

    except httpx.ConnectError:
        return {
            "reply": f"⚠️ เชื่อมต่อ Ollama ไม่ได้ ตรวจสอบว่า `ollama serve` กำลังรันอยู่ (model: {OLLAMA_MODEL})",
            "sql_executed": [],
        }
    except httpx.HTTPStatusError as e:
        return {"reply": f"⚠️ Ollama error {e.response.status_code}", "sql_executed": sql_executed}
    except Exception as e:
        return {"reply": f"⚠️ Error: {e}", "sql_executed": sql_executed}
