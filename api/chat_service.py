"""
chat_service.py — Text-to-SQL AI Chat
Flow: คำถาม → LLM สร้าง SQL → Execute → LLM วิเคราะห์ผล → ตอบภาษาไทย

ไม่ใช้ pre-defined tools — LLM เขียน SQL เองได้ทุกคำถาม
"""

import json
import os

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from schema_context import build_system_prompt
from sql_safety import validate, inject_limit, parse_sql_blocks

OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5:397b-cloud")

_SQL_TIMEOUT = 10.0   # วินาที สำหรับแต่ละ DB query
_LLM_TIMEOUT = 120.0  # วินาที สำหรับ LLM response


# ─────────────────────────────────────────────────────────────
# DB execution
# ─────────────────────────────────────────────────────────────

async def _execute_sql(sql: str, db: AsyncSession) -> dict:
    """
    Validate, inject LIMIT, execute, return result dict.
    Returns {"rows": [...], "error": "..."}
    """
    ok, err = validate(sql)
    if not ok:
        return {"error": f"SQL ไม่ปลอดภัย: {err}", "rows": []}

    safe_sql = inject_limit(sql)

    try:
        result = await db.execute(text(safe_sql))
        rows = [dict(r) for r in result.mappings()]
        return {"rows": rows, "count": len(rows)}
    except Exception as exc:
        return {"error": str(exc), "rows": []}


def _format_sql_result(idx: int, sql: str, result: dict) -> str:
    """แปลงผล SQL เป็น string สำหรับส่งกลับ LLM"""
    label = f"[ผลลัพธ์ SQL_{idx}]" if idx > 0 else "[ผลลัพธ์ SQL]"

    if "error" in result and result["error"]:
        return f"{label}\nERROR: {result['error']}\n"

    rows = result.get("rows", [])
    if not rows:
        return f"{label}\nไม่พบข้อมูล (0 แถว)\n"

    count = result.get("count", len(rows))
    return f"{label} ({count} แถว)\n{json.dumps(rows, ensure_ascii=False, default=str)}\n"


# ─────────────────────────────────────────────────────────────
# LLM call
# ─────────────────────────────────────────────────────────────

async def _call_llm(client: httpx.AsyncClient, messages: list[dict]) -> dict:
    """Send messages to Ollama, return parsed response dict."""
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
    return resp.json()


# ─────────────────────────────────────────────────────────────
# Main chat function
# ─────────────────────────────────────────────────────────────

async def chat(
    message:  str,
    history:  list[dict],
    db:       AsyncSession,
    run_id:   int | None = None,
    run_name: str | None = None,
) -> dict:
    """
    Text-to-SQL AI chat — LLM เขียน SQL เองตามคำถาม ไม่ต้องสร้าง tool ใหม่

    Parameters
    ----------
    message  : คำถามจากผู้ใช้
    history  : list of {role, content} — บทสนทนาย้อนหลัง
    db       : AsyncSession
    run_id   : ID ของ Prediction Run (ถ้ามี)
    run_name : ชื่อ Prediction Run (ถ้ามี)

    Returns
    -------
    {"reply": str, "sql_executed": list[str]}
    """
    system_prompt = build_system_prompt(run_id=run_id, run_name=run_name)

    messages: list[dict] = [{"role": "system", "content": system_prompt}]

    # เก็บ 10 turn ล่าสุดสำหรับ context
    for turn in history[-10:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})

    messages.append({"role": "user", "content": message})

    sql_executed: list[str] = []
    max_rounds = 3  # LLM → SQL → LLM → SQL → LLM (กัน loop)

    try:
        async with httpx.AsyncClient(timeout=_LLM_TIMEOUT) as client:
            for _ in range(max_rounds):
                # Phase 1: LLM สร้าง SQL (หรือตอบตรงถ้าไม่ต้อง DB)
                data = await _call_llm(client, messages)
                llm_reply = data.get("message", {}).get("content", "")

                sql_blocks = parse_sql_blocks(llm_reply)

                if not sql_blocks:
                    # ไม่มี SQL → นี่คือคำตอบสุดท้าย
                    return {
                        "reply":        llm_reply,
                        "sql_executed": sql_executed,
                    }

                # Phase 2: Execute SQL ทุก block
                messages.append({"role": "assistant", "content": llm_reply})

                results_text = ""
                for i, sql in enumerate(sql_blocks, start=1 if len(sql_blocks) > 1 else 0):
                    sql_executed.append(sql)
                    result = await _execute_sql(sql, db)
                    results_text += _format_sql_result(i, sql, result)

                # Phase 3: ส่งผลลัพธ์กลับ LLM เพื่อวิเคราะห์
                messages.append({
                    "role":    "user",
                    "content": results_text + "\nกรุณาวิเคราะห์ผลลัพธ์ข้างต้นและตอบคำถามเป็นภาษาไทย",
                })

            # เกิน max_rounds
            return {
                "reply":        "ขออภัย ไม่สามารถวิเคราะห์ได้ในขณะนี้ กรุณาลองถามใหม่อีกครั้ง",
                "sql_executed": sql_executed,
            }

    except httpx.ConnectError:
        return {
            "reply": (
                "⚠️ ไม่สามารถเชื่อมต่อกับ Ollama ได้\n\n"
                f"กรุณาตรวจสอบว่า Ollama กำลังทำงานอยู่:\n"
                f"  ollama serve\n"
                f"  ollama pull {OLLAMA_MODEL}"
            ),
            "sql_executed": [],
        }
    except httpx.HTTPStatusError as exc:
        return {
            "reply":        f"⚠️ Ollama error {exc.response.status_code}: {exc.response.text[:200]}",
            "sql_executed": sql_executed,
        }
    except Exception as exc:
        return {
            "reply":        f"⚠️ เกิดข้อผิดพลาด: {exc}",
            "sql_executed": sql_executed,
        }
