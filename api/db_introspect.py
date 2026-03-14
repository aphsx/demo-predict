"""
db_introspect.py — ดึง schema จาก DB จริง แทนการ hardcode
Schema ถูก cache ไว้ใน memory (reset เมื่อ server restart)
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_TABLES = ("customers", "payments", "predictions", "prediction_runs")

# Business descriptions สำหรับ column ที่ชื่อไม่บอกความหมายชัดเจน
# (แค่เท่าที่จำเป็น ไม่ต้อง comment ทุก column)
_HINTS: dict[str, dict[str, str]] = {
    "customers": {
        "credit":         "เครดิต SMS คงเหลือ",
        "credit_premium": "เครดิต SMS premium",
        "last_send":      "ครั้งล่าสุดที่ส่ง SMS",
    },
    "predictions": {
        "churn_probability":      "0.0–1.0  สูง = เสี่ยง churn มาก",
        "risk_tier":              "High(≥0.6) | Medium(0.3–0.6) | Low(<0.3)",
        "rfm_segment":            "Champions | Loyal | Potential | At Risk | Lost | Low Spender",
        "risk_factor":            "เหตุผลที่ AI คิดว่าจะ churn",
        "recommended_action":     "สิ่งที่ควรทำ",
        "days_since_last_access": "วันที่ไม่ได้ login",
        "days_until_expire":      "วันที่เหลือก่อนหมดอายุ (ติดลบ = หมดแล้ว)",
        "ltv":                    "Life Time Value — ยอดซื้อรวมตลอดชีพ (บาท)",
        "last_payment_recency":   "วันที่ไม่ได้ซื้อ",
        "downgraded":             "ซื้อน้อยกว่าครั้งก่อน (1=ใช่)",
        "churned":                "เลิกใช้แล้ว (1=ใช่)",
    },
    "payments": {
        "sms_volume": "จำนวน SMS ที่ได้รับจากการซื้อครั้งนี้",
    },
    "prediction_runs": {
        "status":          "pending | done | error",
        "customers_count": "จำนวนลูกค้าใน run นี้",
    },
}

_cache: str | None = None


async def get_schema(db: AsyncSession) -> str:
    """
    ดึง schema จาก information_schema แล้ว format เป็น string
    Cache ใน memory — query DB แค่ครั้งแรกเท่านั้น
    """
    global _cache
    if _cache:
        return _cache

    sql = text("""
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = ANY(:tables)
          AND table_schema = 'public'
        ORDER BY table_name, ordinal_position
    """)
    result = await db.execute(sql, {"tables": list(_TABLES)})
    rows = result.mappings().all()

    # Group by table (preserve _TABLES order)
    grouped: dict[str, list] = {t: [] for t in _TABLES}
    for row in rows:
        t = row["table_name"]
        if t in grouped:
            grouped[t].append(row)

    lines = ["=== DATABASE SCHEMA ===\n"]
    for table in _TABLES:
        cols = grouped.get(table)
        if not cols:
            continue
        lines.append(f"TABLE: {table}")
        for col in cols:
            hint = _HINTS.get(table, {}).get(col["column_name"], "")
            suffix = f"  -- {hint}" if hint else ""
            lines.append(f"  {col['column_name']}  {col['data_type']}{suffix}")
        lines.append("")

    lines.append("RELATIONS: customers.acc_id ← predictions.acc_id (1:1)")
    lines.append("           customers.acc_id ← payments.acc_id    (1:many)")

    _cache = "\n".join(lines)
    return _cache


def invalidate_cache() -> None:
    """เรียกเมื่อ schema เปลี่ยน (เช่น migrate DB)"""
    global _cache
    _cache = None
