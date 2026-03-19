"""
sql_safety.py — validate และ sanitize SQL ที่ LLM สร้าง
ป้องกัน SQL injection และ destructive queries
"""

import re

FORBIDDEN_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER",
    "CREATE", "TRUNCATE", "GRANT", "REVOKE",
    "EXECUTE", "EXEC", "XP_", "SP_",
}

MAX_ROWS = 100


def validate(sql: str) -> tuple[bool, str]:
    """
    Returns (is_valid, error_message)
    is_valid=True หมายความว่า SQL ปลอดภัยสามารถรันได้
    """
    cleaned = sql.strip()
    if not cleaned:
        return False, "SQL ว่างเปล่า"

    upper = cleaned.upper()

    if not upper.startswith("SELECT"):
        return False, "SQL ต้องเริ่มด้วย SELECT เท่านั้น"

    # ตรวจ token-by-token เพื่อหลีกเลี่ยง false positive (เช่น column ที่มีชื่อคล้าย keyword)
    tokens = set(re.findall(r"\b\w+\b", upper))
    for kw in FORBIDDEN_KEYWORDS:
        if kw in tokens:
            return False, f"ห้ามใช้ keyword อันตราย: {kw}"

    # ห้าม comment SQL (อาจใช้ bypass)
    if "--" in cleaned or "/*" in cleaned:
        return False, "ห้ามใช้ SQL comment"

    return True, "ok"


def inject_limit(sql: str, max_rows: int = MAX_ROWS) -> str:
    """
    เพิ่ม LIMIT ถ้า query ยังไม่มี และไม่ใช่ aggregate-only query
    """
    upper = sql.upper()
    if "LIMIT" in upper:
        return sql  # มี LIMIT อยู่แล้ว

    # ถ้าเป็น aggregate ล้วนๆ ไม่ต้อง LIMIT
    has_group_by = "GROUP BY" in upper
    has_aggregate = any(fn in upper for fn in ("COUNT(", "SUM(", "AVG(", "MIN(", "MAX("))

    if has_aggregate and not has_group_by:
        return sql  # aggregate ไม่มี GROUP BY → คืน 1 แถว ไม่ต้อง LIMIT

    return sql.rstrip(";").rstrip() + f"\nLIMIT {max_rows}"


def parse_sql_blocks(text: str) -> list[str]:
    """
    Extract SQL blocks from LLM response.
    รองรับ <SQL>...</SQL> และ <SQL_1>...</SQL_1>, <SQL_2>...</SQL_2>, ...
    """
    blocks: list[str] = []

    # หา <SQL_N>...</SQL_N> ก่อน (numbered)
    numbered = re.findall(r"<SQL_\d+>(.*?)</SQL_\d+>", text, re.DOTALL | re.IGNORECASE)
    if numbered:
        blocks.extend([s.strip() for s in numbered])
    else:
        # หา <SQL>...</SQL> แบบ single
        single = re.findall(r"<SQL>(.*?)</SQL>", text, re.DOTALL | re.IGNORECASE)
        blocks.extend([s.strip() for s in single])

    return [b for b in blocks if b]
