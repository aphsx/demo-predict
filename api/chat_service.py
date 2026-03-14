"""
chat_service.py — AI Chatbot powered by Ollama (Qwen) + PostgreSQL tool calling

Flow:
  User message → FastAPI /api/chat
    → Ollama /api/chat (with TOOLS defined below)
    → If model returns tool_calls → execute SQL queries on PostgreSQL
    → Feed results back to model
    → Return final Thai-language answer

Tools available to the AI:
  1. get_customer          — full profile for 1 customer
  2. compare_customers     — side-by-side comparison of 2 customers
  3. list_customers        — filtered list (risk, rfm, ltv range, sort, limit)
  4. get_churn_stats       — overall KPI summary
  5. get_top_customers     — top-N by any metric
"""

import json
import os
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5:9b")

SYSTEM_PROMPT = """\
คุณเป็น AI วิเคราะห์ข้อมูลลูกค้าสำหรับระบบ CRM ของ 1MOBY
คุณสามารถใช้ tools เพื่อดึงข้อมูลจากฐานข้อมูลแล้วตอบคำถามได้อย่างแม่นยำ

กฎ:
- ตอบเป็นภาษาไทยเสมอ
- ถ้าต้องการข้อมูลลูกค้า ให้เรียก tool ก่อน อย่าเดาเอง
- ให้ข้อมูลที่เป็นประโยชน์และอธิบายสาเหตุด้วย
- ถ้าไม่มีข้อมูลในระบบ บอกตรงๆ

ข้อมูลในระบบ:
- acc_id           : รหัสลูกค้า (เช่น ACC010001)
- status           : paid / trial
- churn_probability: ความเสี่ยงเลิกใช้ (0.0–1.0 = 0–100%)
- risk_tier        : High / Medium / Low
- rfm_segment      : Champions / Loyal / Potential / At Risk / Lost / Low Spender
- ltv              : ยอดซื้อรวมตลอดอายุลูกค้า (บาท)
- total_payments   : จำนวนครั้งที่ซื้อเครดิต
- days_since_last_access : วันที่ไม่ได้ login
- last_payment_recency   : วันที่ไม่ได้ซื้อเครดิต
- avg_payment_gap_days   : ช่วงห่างเฉลี่ยระหว่างการซื้อ
- downgraded       : ซื้อน้อยลงกว่าครั้งก่อน (1=ใช่, 0=ไม่)
- recommended_action     : คำแนะนำการดูแลลูกค้า
"""

# ─────────────────────────────────────────────────────────────
# Tool schemas (OpenAI-compatible, supported by Qwen2.5 via Ollama)
# ─────────────────────────────────────────────────────────────
TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "get_customer",
            "description": "ดึงข้อมูลลูกค้า 1 คนตาม acc_id — ใช้เมื่อถามเกี่ยวกับลูกค้าคนเดียวหรือต้องการข้อมูลก่อนเปรียบเทียบ",
            "parameters": {
                "type": "object",
                "properties": {
                    "acc_id": {
                        "type": "string",
                        "description": "รหัสลูกค้า เช่น ACC010030"
                    }
                },
                "required": ["acc_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_customers",
            "description": "เปรียบเทียบลูกค้า 2 คนแบบเคียงกัน — ตอบคำถามว่าทำไมคนนึงดีหรือแย่กว่าอีกคน",
            "parameters": {
                "type": "object",
                "properties": {
                    "acc_id_1": {"type": "string", "description": "รหัสลูกค้าคนที่ 1"},
                    "acc_id_2": {"type": "string", "description": "รหัสลูกค้าคนที่ 2"},
                },
                "required": ["acc_id_1", "acc_id_2"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_customers",
            "description": "ค้นหาและกรองลูกค้าตามเงื่อนไข เช่น ความเสี่ยงสูง, rfm segment, ช่วงยอดซื้อ",
            "parameters": {
                "type": "object",
                "properties": {
                    "risk_tier": {
                        "type": "string",
                        "enum": ["High", "Medium", "Low"],
                        "description": "กรองตามระดับความเสี่ยง",
                    },
                    "rfm_segment": {
                        "type": "string",
                        "description": "กรองตาม RFM segment เช่น Champions, At Risk, Lost",
                    },
                    "min_ltv": {"type": "number", "description": "ยอดซื้อรวมขั้นต่ำ (บาท)"},
                    "max_ltv": {"type": "number", "description": "ยอดซื้อรวมสูงสุด (บาท)"},
                    "sort_by": {
                        "type": "string",
                        "enum": ["ltv", "churn_probability", "days_since_last_access", "total_payments"],
                        "description": "เรียงตาม field ไหน",
                    },
                    "order": {
                        "type": "string",
                        "enum": ["desc", "asc"],
                        "description": "มากไปน้อย (desc) หรือน้อยไปมาก (asc)",
                    },
                    "limit": {"type": "integer", "description": "จำนวนที่แสดง (สูงสุด 20)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_churn_stats",
            "description": "ดูสถิติภาพรวมทั้งหมด — อัตรา churn, จำนวนแต่ละกลุ่ม, รายได้เสี่ยง",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_top_customers",
            "description": "ดูลูกค้า top-N ตาม metric — เช่น ยอดซื้อสูงสุด, เสี่ยงสูงสุด, ไม่ active นานที่สุด",
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {
                        "type": "string",
                        "enum": ["ltv", "churn_probability", "total_payments", "days_since_last_access"],
                        "description": "เรียงตาม metric ไหน",
                    },
                    "order": {
                        "type": "string",
                        "enum": ["desc", "asc"],
                        "description": "สูงสุด (desc) หรือต่ำสุด (asc)",
                    },
                    "limit": {"type": "integer", "description": "จำนวนที่ต้องการ (สูงสุด 20)"},
                },
                "required": ["metric"],
            },
        },
    },
]


# ─────────────────────────────────────────────────────────────
# DB query helpers  (parameterised — no SQL injection risk)
# ─────────────────────────────────────────────────────────────

async def _query_customer(acc_id: str, db: AsyncSession) -> dict:
    sql = text("""
        SELECT
            c.acc_id, c.status,
            TO_CHAR(c.expire,      'YYYY-MM-DD') AS expire,
            TO_CHAR(c.join_date,   'YYYY-MM-DD') AS join_date,
            TO_CHAR(c.last_access, 'YYYY-MM-DD') AS last_access,
            p.churn_probability, p.risk_tier, p.rfm_segment,
            p.ltv, p.total_payments, p.total_amount_paid,
            p.days_since_last_access, p.days_until_expire,
            p.last_payment_recency, p.avg_payment_gap_days,
            p.avg_amount_per_tx, p.total_sms_volume,
            p.risk_factor, p.recommended_action,
            p.downgraded, p.account_age_days
        FROM customers c
        LEFT JOIN predictions p ON c.acc_id = p.acc_id
        WHERE c.acc_id = :acc_id
    """)
    result = await db.execute(sql, {"acc_id": acc_id})
    row = result.mappings().first()
    if row is None:
        return {"error": f"ไม่พบลูกค้า {acc_id} ในระบบ"}
    return dict(row)


async def _query_compare(acc_id_1: str, acc_id_2: str, db: AsyncSession) -> dict:
    c1 = await _query_customer(acc_id_1, db)
    c2 = await _query_customer(acc_id_2, db)
    return {"customer_1": c1, "customer_2": c2}


_VALID_SORT  = frozenset({"ltv", "churn_probability", "days_since_last_access", "total_payments"})
_VALID_LIMIT = 20


async def _query_list(
    risk_tier:   str | None = None,
    rfm_segment: str | None = None,
    min_ltv:     float | None = None,
    max_ltv:     float | None = None,
    sort_by:     str = "ltv",
    order:       str = "desc",
    limit:       int = 10,
    db: AsyncSession = None,
) -> list[dict]:
    conditions: list[str] = []
    params: dict[str, Any] = {}

    if risk_tier:
        conditions.append("p.risk_tier = :risk_tier")
        params["risk_tier"] = risk_tier
    if rfm_segment:
        conditions.append("p.rfm_segment = :rfm_segment")
        params["rfm_segment"] = rfm_segment
    if min_ltv is not None:
        conditions.append("p.ltv >= :min_ltv")
        params["min_ltv"] = float(min_ltv)
    if max_ltv is not None:
        conditions.append("p.ltv <= :max_ltv")
        params["max_ltv"] = float(max_ltv)

    where     = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sort_col  = sort_by if sort_by in _VALID_SORT else "ltv"
    direction = "ASC" if order == "asc" else "DESC"
    safe_lim  = min(int(limit), _VALID_LIMIT)

    # sort_col and direction are validated against whitelists — not user strings
    sql = text(f"""
        SELECT
            c.acc_id, c.status,
            p.churn_probability, p.risk_tier, p.rfm_segment,
            p.ltv, p.total_payments, p.days_since_last_access,
            p.risk_factor, p.recommended_action
        FROM customers c
        LEFT JOIN predictions p ON c.acc_id = p.acc_id
        {where}
        ORDER BY p.{sort_col} {direction} NULLS LAST
        LIMIT :lim
    """)
    params["lim"] = safe_lim
    result = await db.execute(sql, params)
    return [dict(r) for r in result.mappings()]


async def _query_stats(db: AsyncSession) -> dict:
    sql = text("""
        SELECT
            COUNT(*)                                                       AS total_customers,
            SUM(CASE WHEN churned = 1 THEN 1 ELSE 0 END)                  AS churned_count,
            SUM(CASE WHEN risk_tier = 'High'   THEN 1 ELSE 0 END)         AS high_risk,
            SUM(CASE WHEN risk_tier = 'Medium' THEN 1 ELSE 0 END)         AS medium_risk,
            SUM(CASE WHEN risk_tier = 'Low'    THEN 1 ELSE 0 END)         AS low_risk,
            ROUND(AVG(churn_probability)::numeric, 4)                      AS avg_churn_probability,
            ROUND(SUM(CASE WHEN risk_tier='High' THEN ltv ELSE 0 END)::numeric, 2) AS revenue_at_risk,
            ROUND(AVG(ltv)::numeric, 2)                                    AS avg_ltv
        FROM predictions
    """)
    result = await db.execute(sql)
    row = result.mappings().first()
    return dict(row) if row else {}


async def _query_top(
    metric: str,
    order:  str,
    limit:  int,
    db: AsyncSession,
) -> list[dict]:
    sort_col  = metric if metric in _VALID_SORT else "ltv"
    direction = "ASC" if order == "asc" else "DESC"
    safe_lim  = min(int(limit), _VALID_LIMIT)

    sql = text(f"""
        SELECT
            c.acc_id, c.status,
            p.churn_probability, p.risk_tier, p.rfm_segment,
            p.ltv, p.total_payments, p.days_since_last_access,
            p.recommended_action
        FROM customers c
        LEFT JOIN predictions p ON c.acc_id = p.acc_id
        ORDER BY p.{sort_col} {direction} NULLS LAST
        LIMIT {safe_lim}
    """)
    result = await db.execute(sql)
    return [dict(r) for r in result.mappings()]


# ─────────────────────────────────────────────────────────────
# Tool dispatcher
# ─────────────────────────────────────────────────────────────

async def _execute_tool(name: str, args: dict, db: AsyncSession) -> str:
    """Run a tool and return its result as a JSON string."""
    try:
        if name == "get_customer":
            result = await _query_customer(args["acc_id"], db)

        elif name == "compare_customers":
            result = await _query_compare(args["acc_id_1"], args["acc_id_2"], db)

        elif name == "list_customers":
            result = await _query_list(
                risk_tier   = args.get("risk_tier"),
                rfm_segment = args.get("rfm_segment"),
                min_ltv     = args.get("min_ltv"),
                max_ltv     = args.get("max_ltv"),
                sort_by     = args.get("sort_by", "ltv"),
                order       = args.get("order",   "desc"),
                limit       = args.get("limit",   10),
                db          = db,
            )

        elif name == "get_churn_stats":
            result = await _query_stats(db)

        elif name == "get_top_customers":
            result = await _query_top(
                metric = args.get("metric", "ltv"),
                order  = args.get("order",  "desc"),
                limit  = args.get("limit",  5),
                db     = db,
            )

        else:
            result = {"error": f"Unknown tool: {name}"}

    except Exception as exc:
        result = {"error": str(exc)}

    return json.dumps(result, ensure_ascii=False, default=str)


# ─────────────────────────────────────────────────────────────
# Main chat function
# ─────────────────────────────────────────────────────────────

async def chat(
    message: str,
    history: list[dict],
    db: AsyncSession,
) -> dict:
    """
    Send a user message to Ollama (Qwen) with tool calling.

    Parameters
    ----------
    message : user's Thai-language question
    history : list of {"role": "user"|"assistant", "content": "..."} — last N turns
    db      : async SQLAlchemy session

    Returns
    -------
    {"reply": str, "tools_used": list[str]}
    """
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Keep last 8 turns for context window
    for turn in history[-8:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})

    messages.append({"role": "user", "content": message})

    tools_used: list[str] = []
    max_iterations = 6  # safety guard against infinite tool loop

    async with httpx.AsyncClient(timeout=120.0) as client:
        for _ in range(max_iterations):
            try:
                resp = await client.post(
                    f"{OLLAMA_URL}/api/chat",
                    json={
                        "model":    OLLAMA_MODEL,
                        "messages": messages,
                        "tools":    TOOLS,
                        "stream":   False,
                        "options":  {"temperature": 0.3, "top_p": 0.9},
                    },
                )
                resp.raise_for_status()
            except httpx.ConnectError:
                return {
                    "reply": (
                        "⚠️ ไม่สามารถเชื่อมต่อกับ Ollama ได้\n\n"
                        "กรุณาตรวจสอบว่า Ollama กำลังทำงานอยู่:\n"
                        f"  `ollama serve`\n"
                        f"  `ollama pull {OLLAMA_MODEL}`"
                    ),
                    "tools_used": [],
                }
            except httpx.HTTPStatusError as exc:
                return {"reply": f"⚠️ Ollama error {exc.response.status_code}", "tools_used": tools_used}

            data          = resp.json()
            assistant_msg = data.get("message", {})
            messages.append(assistant_msg)

            tool_calls = assistant_msg.get("tool_calls") or []
            if not tool_calls:
                # No more tools → this is the final answer
                return {
                    "reply":       assistant_msg.get("content", ""),
                    "tools_used":  tools_used,
                }

            # Execute each tool call sequentially
            for tc in tool_calls:
                fn   = tc.get("function", {})
                name = fn.get("name", "")
                args = fn.get("arguments", {})
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}

                tools_used.append(name)
                tool_result = await _execute_tool(name, args, db)

                messages.append({"role": "tool", "content": tool_result})

    return {
        "reply":      "ขออภัย ไม่สามารถประมวลผลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
        "tools_used": tools_used,
    }
