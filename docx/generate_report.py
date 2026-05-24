"""
Generate CS460 AI Project Report — 1Moby Intelligence
Run: python3 generate_report.py
Output: CS460_AI_Project_Report_FINAL.docx
"""

from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy
import os

doc = Document()

# ─── Page margins ────────────────────────────────────────────────────────────
for section in doc.sections:
    section.top_margin    = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin   = Cm(3.0)
    section.right_margin  = Cm(2.5)

# ─── Styles helpers ──────────────────────────────────────────────────────────
FONT_BODY  = "TH Sarabun New"
FONT_CODE  = "Courier New"
COLOR_DARK = RGBColor(0x1A, 0x1A, 0x2E)
COLOR_BLUE = RGBColor(0x16, 0x21, 0x3E)
COLOR_ACC  = RGBColor(0x0F, 0x3C, 0x78)

def set_font(run, name=FONT_BODY, size=16, bold=False, color=None):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    if color:
        run.font.color.rgb = color
    r = run._r
    rPr = r.get_or_add_rPr()
    rFonts = OxmlElement("w:rFonts")
    rFonts.set(qn("w:eastAsia"), name)
    rPr.insert(0, rFonts)

def heading(text, level=1, size=20, bold=True, color=COLOR_BLUE, align=WD_ALIGN_PARAGRAPH.LEFT, space_before=14, space_after=6):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after  = Pt(space_after)
    p.alignment = align
    run = p.add_run(text)
    set_font(run, size=size, bold=bold, color=color)
    return p

def body(text, size=15, align=WD_ALIGN_PARAGRAPH.LEFT, space_before=2, space_after=4, bold=False, color=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after  = Pt(space_after)
    p.paragraph_format.first_line_indent = Pt(0)
    p.alignment = align
    run = p.add_run(text)
    set_font(run, size=size, bold=bold, color=color)
    return p

def bullet(text, size=15):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after  = Pt(1)
    run = p.add_run(text)
    set_font(run, size=size)
    return p

def add_table(headers, rows, col_widths=None):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    # Header row
    hrow = table.rows[0]
    for i, h in enumerate(headers):
        cell = hrow.cells[i]
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        shading = OxmlElement("w:shd")
        shading.set(qn("w:val"), "clear")
        shading.set(qn("w:color"), "auto")
        shading.set(qn("w:fill"), "162136")
        cell._tc.get_or_add_tcPr().append(shading)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(h)
        set_font(run, size=14, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF))
    # Data rows
    for ri, row in enumerate(rows):
        trow = table.rows[ri + 1]
        if ri % 2 == 1:
            for cell in trow.cells:
                shading = OxmlElement("w:shd")
                shading.set(qn("w:val"), "clear")
                shading.set(qn("w:color"), "auto")
                shading.set(qn("w:fill"), "EFF3FB")
                cell._tc.get_or_add_tcPr().append(shading)
        for ci, val in enumerate(row):
            cell = trow.cells[ci]
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if ci > 0 else WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run(str(val))
            set_font(run, size=13)
    if col_widths:
        for i, w in enumerate(col_widths):
            for row in table.rows:
                row.cells[i].width = Cm(w)
    return table

def add_image(rel_path, width_in, caption=None):
    abs_path = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', rel_path))
    if not os.path.exists(abs_path):
        return
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after  = Pt(2)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    run.add_picture(abs_path, width=Inches(width_in))
    if caption:
        cp = doc.add_paragraph()
        cp.paragraph_format.space_before = Pt(2)
        cp.paragraph_format.space_after  = Pt(8)
        cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cr = cp.add_run(caption)
        set_font(cr, size=12, color=RGBColor(0x55, 0x55, 0x55))

# ═══════════════════════════════════════════════════════════════════════════════
# COVER PAGE
# ═══════════════════════════════════════════════════════════════════════════════
doc.add_paragraph()
doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("CS460 AI Transformation Project")
set_font(run, size=18, bold=True, color=COLOR_BLUE)

doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("1Moby Intelligence:")
set_font(run, size=28, bold=True, color=COLOR_DARK)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("AI Customer Lifecycle & Revenue Rescue System")
set_font(run, size=22, bold=True, color=COLOR_ACC)

doc.add_paragraph()
doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("จัดทำโดย")
set_font(run, size=16)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("จีระเดช มักเจริญ   รหัส 1660703537")
set_font(run, size=16, bold=True)

doc.add_paragraph()
doc.add_paragraph()
doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("ภาควิชาวิทยาการคอมพิวเตอร์  |  ปีการศึกษา 2568")
set_font(run, size=15, color=RGBColor(0x55, 0x55, 0x55))

doc.add_page_break()

# ═══════════════════════════════════════════════════════════════════════════════
# ABSTRACT
# ═══════════════════════════════════════════════════════════════════════════════
heading("บทคัดย่อ (Abstract)", level=1, size=18)
body(
    "โปรเจคนี้พัฒนาระบบ AI Web Application สำหรับบริษัท 1Moby ซึ่งเป็นผู้ให้บริการ B2B SaaS "
    "ด้าน SMS/Email Messaging โดยมีเป้าหมายเพื่อเปลี่ยน workflow การวิเคราะห์ลูกค้าจากการ "
    "ทำงาน manual ผ่าน Excel ไปสู่ระบบ AI ที่สร้าง prediction และ action insight อัตโนมัติ "
    "ระบบประกอบด้วย 5 โมเดล Machine Learning ได้แก่ (1) Lifecycle Classification แบบ Rule-based "
    "(2) Churn Prediction ด้วย LightGBM + Optuna + SHAP (AUC = 0.9408) "
    "(3) Customer Lifetime Value ด้วย BG/NBD + Gamma-Gamma (Spearman = 0.7712) "
    "(4) Credit Top-up Forecast ด้วย LightGBM Quantile Regression x5 (P10-P90 coverage = 80.1%) "
    "และ (5) Win-back / Conversion Probability ด้วย LightGBM (AUC = 0.9252 / 0.9629) "
    "ระบบ backend ใช้สถาปัตยกรรม Elysia.js (Bun) เป็น REST API + Arq Worker สำหรับ ML Pipeline "
    "โดยมี Next.js 14 เป็น Frontend และ PostgreSQL เป็น Database "
    "ผลลัพธ์คือระบบที่ช่วยให้ทีม Sales/Account Manager สามารถ upload Excel และดูผล "
    "prediction พร้อม action queue ได้ทันทีโดยไม่ต้องวิเคราะห์ด้วยตนเอง",
    size=15
)

doc.add_page_break()

# ═══════════════════════════════════════════════════════════════════════════════
# TABLE OF CONTENTS (manual)
# ═══════════════════════════════════════════════════════════════════════════════
heading("สารบัญ", size=18, align=WD_ALIGN_PARAGRAPH.CENTER)

toc_items = [
    ("บทคัดย่อ", "2"),
    ("1.  Problem & Workflow Design", "4"),
    ("    1.1  Solution Concept (แนวคิดของระบบ)", "4"),
    ("    1.2  System Architecture & Traffic Flow", "5"),
    ("    1.3  Workflow Diagram Summary", "6"),
    ("    1.4  Workflow เดิม vs Workflow ใหม่ด้วย AI", "7"),
    ("2.  Implementation", "8"),
    ("    2.1  AI Engine — โมเดลและเทคนิคที่ใช้", "8"),
    ("    2.2  Fine-tuning / Customization", "9"),
    ("    2.3  Model Training Details", "11"),
    ("    2.4  Web Application Demo", "19"),
    ("3.  System Validation", "21"),
    ("    3.1  Workflow Validation", "21"),
    ("    3.2  Model Validation Metrics", "22"),
    ("    3.3  Model Algorithm Comparison", "25"),
    ("    3.4  Business / Workflow Impact Metrics", "26"),
    ("    3.5  Limitation & Future Improvement", "27"),
    ("4.  Deliverables", "28"),
    ("5.  บทสรุป (Conclusion)", "30"),
    ("บรรณานุกรม", "31"),
    ("ภาคผนวก", "32"),
]
for item, page in toc_items:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after  = Pt(1)
    run = p.add_run(item)
    set_font(run, size=14)
    tab = p.add_run(f"\t{page}")
    set_font(tab, size=14)
    p.paragraph_format.tab_stops.add_tab_stop(Cm(14), 2)  # right-align page number

doc.add_page_break()

# ═══════════════════════════════════════════════════════════════════════════════
# 1. PROBLEM & WORKFLOW DESIGN
# ═══════════════════════════════════════════════════════════════════════════════
heading("1.  Problem & Workflow Design")

heading("1.1  Solution Concept (แนวคิดของระบบ)", level=2, size=16, space_before=6)
body("ปัญหาเดิมของธุรกิจ", bold=True, size=15)
body(
    "บริษัท 1Moby เป็นผู้ให้บริการ B2B SaaS ด้าน SMS/Email Messaging มีฐานลูกค้ากว่า 25,000 บัญชี "
    "ข้อมูลลูกค้า การชำระเงิน และการใช้งานทั้งหมดถูกเก็บในไฟล์ Excel แต่การตัดสินใจทางธุรกิจ "
    "ยังต้องอาศัยการดูตารางย้อนหลังและการ filter แบบ manual ทำให้เกิดปัญหาดังนี้:"
)
for prob in [
    "ไม่รู้ว่าลูกค้าคนใดมีโอกาส churn สูงที่สุดในช่วง 6 เดือนข้างหน้า",
    "ไม่มี priority score ทำให้ไม่รู้ว่าควรติดต่อลูกค้าคนใดก่อน",
    "ไม่รู้ว่าลูกค้าคนใดควรซื้อเครดิตเพิ่มและในช่วงกี่วันข้างหน้า",
    "ไม่รู้ว่าลูกค้าที่เลิกใช้ไปแล้วคนใดมีโอกาสกลับมา",
    "ทีม Sales/Account Manager ต้องเสียเวลาแปลงข้อมูลเป็น action เอง",
]:
    bullet(prob)

body("AI เข้ามาเปลี่ยน Workflow อย่างไร", bold=True, size=15, space_before=8)
body(
    "ระบบ 1Moby Intelligence เปลี่ยน workflow จาก 'คนอ่าน Excel แล้วตัดสินใจเอง' "
    "เป็น 'ระบบ AI สร้าง action list ให้ทันทีหลัง upload ข้อมูล' ดังขั้นตอนต่อไปนี้:"
)
steps = [
    "ผู้ใช้สร้าง Prediction Run และกำหนด cutoff date",
    "ผู้ใช้อัปโหลด Excel dataset (8 sheets)",
    "Elysia API validate sheet และบันทึก raw data ลง PostgreSQL",
    "Arq Worker รับ job ผ่าน Redis Queue",
    "Worker สร้าง feature 30 ตัวแบบ point-in-time safe จากข้อมูลก่อน cutoff",
    "AI/ML models วิเคราะห์ lifecycle, churn, CLV, credit forecast, win-back, conversion",
    "บันทึกผล prediction ลง PostgreSQL (batch insert 1,000 rows/trip)",
    "ผู้ใช้ดูผลผ่าน Dashboard, Customer List, Customer 360, Action Queue และ Model Health",
    "ทีมธุรกิจนำผลไปตัดสินใจ: โทรหาลูกค้าเสี่ยงสูง, ส่ง reminder เติมเครดิต, ทำ win-back campaign",
]
for i, s in enumerate(steps, 1):
    bullet(f"{i}. {s}")

body("ผลลัพธ์ที่ระบบสร้างให้แต่ละลูกค้า:", bold=True, size=15, space_before=8)
outputs = [
    "Lifecycle stage: Ghost / Churned / Active Free / Active Paid",
    "Churn probability (0–1) + Churn tier: Low / Medium / High",
    "Predicted CLV 6 เดือน พร้อม Confidence Interval 80% และ 95%",
    "Credit top-up forecast: P10/P25/P50/P75/P90 วันถึงการซื้อครั้งถัดไป + urgency label",
    "Win-back probability สำหรับลูกค้าที่ churn แล้ว",
    "Conversion probability สำหรับลูกค้า Active Free",
    "Revenue at risk = churn_probability × predicted_clv_6m",
    "Top 3 risk factors จาก SHAP",
    "Priority score (0–10) จาก weighted blend ของ churn + CLV + urgency + recency",
]
for o in outputs:
    bullet(o)

doc.add_page_break()

# ─────────────────────────────────────────────────────────────────────────────
heading("1.2  System Architecture & Traffic Flow", level=2, size=16, space_before=6)
body(
    "ระบบใช้สถาปัตยกรรมแบบ Monorepo (Turborepo + Bun Workspaces) "
    "แบ่งออกเป็น 3 application หลักและ 1 shared package:"
)
add_table(
    ["Service", "Technology", "Port (External)", "หน้าที่"],
    [
        ["web (Next.js)", "Next.js 14, TypeScript, Tailwind", ":3000", "Frontend + Proxy rewrite /api/* → Elysia"],
        ["api (Elysia)", "Elysia.js บน Bun, Drizzle ORM, Better Auth", ":3001", "REST API + Better Auth + SSE + Arq enqueue"],
        ["ml (FastAPI)", "Python 3.11, FastAPI", ":8001 (internal)", "Internal routes: /health, /internal/explain, /internal/train"],
        ["db (PostgreSQL)", "PostgreSQL 15-alpine", ":5433", "Primary database — Alembic owns migrations"],
        ["redis", "Redis 7-alpine", "—", "Arq job queue + Redis Streams (progress events)"],
        ["worker (Arq)", "Python, Arq", "—", "ML pipeline consumer — รัน 5 models + batch insert"],
    ],
    col_widths=[3.5, 5.5, 3.5, 6.5]
)

body("Traffic Flow ของระบบ:", bold=True, size=15, space_before=8)
body(
    "Browser → Next.js :3000\n"
    "    /api/*  → Elysia :3001  (Next.js proxy rewrite ผ่าน ELYSIA_URL)\n\n"
    "Elysia :3001\n"
    "    → PostgreSQL (Drizzle ORM)\n"
    "    → Redis (Arq enqueue + Streams XREAD)\n"
    "    → FastAPI :8000/internal/explain  (SHAP, token-gated ด้วย X-Internal-Token)\n"
    "    → FastAPI :8000/internal/train    (training trigger, token-gated)\n\n"
    "Arq Worker (Python)\n"
    "    ← arq:queue (Redis) — รับ job\n"
    "    → PostgreSQL — batch insert predictions\n"
    "    → Redis Streams progress:{run_id} — XADD progress events",
    size=13
)

body(
    "หมายเหตุสำคัญ: FastAPI ไม่ได้ serve browser โดยตรง — ทุก user-facing request ผ่าน Elysia เท่านั้น "
    "FastAPI ถูกเรียกจาก Elysia เท่านั้นโดยใช้ Internal Service Token เพื่อป้องกันการเข้าถึงจากภายนอก",
    size=14, bold=False
)
add_image('.diagrams_build/usecase.png', 5.5, 'รูปที่ 1: Use Case Diagram — 1Moby Intelligence (16 Use Cases)')

heading("1.3  Workflow Diagram Summary", level=2, size=16, space_before=8)
body("ลำดับขั้นตอนการทำงานของระบบตั้งแต่ต้นจนจบ:")
add_table(
    ["ลำดับ", "ขั้นตอน", "Component ที่รับผิดชอบ"],
    [
        ["1", "User เปิด Browser → เข้าสู่ระบบด้วย Google Auth", "Next.js + Better Auth"],
        ["2", "User กด 'สร้าง Run' ตั้งชื่อและ cutoff date", "Next.js Web → Elysia POST /runs"],
        ["3", "User upload ไฟล์ Excel (8 sheets)", "Next.js Web → Elysia POST /runs/:id/upload"],
        ["4", "Elysia validate sheets + batch insert raw data → PostgreSQL", "Elysia API + Drizzle ORM"],
        ["5", "Elysia enqueue job ไปยัง Redis (Arq queue)", "Elysia API → Redis"],
        ["6", "Arq Worker รับ job → โหลด raw data จาก PostgreSQL", "Arq Worker + PostgreSQL"],
        ["7", "Worker สร้าง 30 features แบบ point-in-time safe", "Python features.py"],
        ["8", "Worker รัน 5 ML models ผ่าน MobyPredictor", "Python predictor.py"],
        ["9", "Worker XADD progress events → Redis Streams", "Arq Worker → Redis"],
        ["10", "Elysia SSE endpoint XREAD → ส่ง progress ให้ browser", "Elysia GET /runs/:id/stream"],
        ["11", "Worker batch insert predictions → PostgreSQL", "Arq Worker → PostgreSQL"],
        ["12", "Worker update run status → 'done'", "Arq Worker → PostgreSQL"],
        ["13", "User ดูผลผ่าน Dashboard / Customer List / Customer 360", "Next.js Web → Elysia GET /runs/:id/*"],
    ],
    col_widths=[1.5, 8.0, 5.0]
)
add_image('.diagrams_build/activity_workflow.png', 4.2, 'รูปที่ 2: Activity Diagram — End-to-End Prediction Workflow (Async Redis/Arq)')

doc.add_page_break()

heading("1.4  Workflow เดิม vs Workflow ใหม่ด้วย AI", level=2, size=16, space_before=6)
add_table(
    ["หัวข้อ", "Workflow เดิม (Manual)", "Workflow ใหม่ด้วย AI"],
    [
        ["การเตรียมข้อมูล", "เปิด Excel และ filter เอง ใช้เวลาหลายชั่วโมง", "Upload Excel เข้า Web App — ระบบจัดการทั้งหมด"],
        ["การหา Churn Risk", "ใช้ rule หรือความรู้สึกของ Analyst", "LightGBM คำนวณ churn probability พร้อม SHAP explanation"],
        ["การประเมินมูลค่าลูกค้า", "ดูยอดซื้อย้อนหลังเท่านั้น", "BG/NBD + Gamma-Gamma ทำนาย CLV 6 เดือนพร้อม CI"],
        ["การเตือนเติมเครดิต", "ดูวันหมดอายุหรือยอดเครดิตเอง", "Quantile model ทำนาย P10-P90 + urgency label + alert_date"],
        ["ลูกค้าที่เลิกใช้", "ต้องค้นเองว่าใครควรตามกลับ", "Win-back model จัดลำดับ churned customers ตาม probability"],
        ["ลูกค้าฟรี", "ไม่รู้ว่าใครน่าจะจ่ายเงิน", "Conversion model ทำนายโอกาสเปลี่ยนเป็น paid customer"],
        ["การตัดสินใจ", "Analyst สรุปให้ Sales (ใช้เวลา 1-2 วัน)", "Dashboard + Action Queue พร้อมใช้งานทันทีหลัง upload"],
        ["Explainability", "ไม่มี — ตัดสินใจจาก intuition", "SHAP top-3 risk factors แสดงรายลูกค้า"],
        ["Priority Score", "ไม่มี scoring — ต้องนับเองว่าใครสำคัญ", "Priority score 0-10 จาก weighted blend 4 ปัจจัย"],
    ],
    col_widths=[4.5, 6.0, 6.5]
)

doc.add_page_break()

# ═══════════════════════════════════════════════════════════════════════════════
# 2. IMPLEMENTATION
# ═══════════════════════════════════════════════════════════════════════════════
heading("2.  Implementation")

heading("2.1  AI Engine — โมเดลและเทคนิคที่ใช้", level=2, size=16, space_before=6)
body(
    "โปรเจคนี้ไม่ได้ใช้ AI API ภายนอกเป็นหลัก แต่ใช้ custom-trained machine learning models "
    "ที่ฝึกจากข้อมูลเฉพาะของธุรกิจ 1Moby ซึ่งตรงกับ requirement เรื่องการใช้ model ที่ customize "
    "ด้วยข้อมูลเฉพาะทาง ระบบประกอบด้วย 6 components หลัก:"
)
add_table(
    ["Component", "Algorithm / Method", "Output", "ใช้กับ Lifecycle"],
    [
        ["Lifecycle Engine", "Rule-based classification", "Ghost / Churned / Active Free / Active Paid", "ทุกลูกค้า"],
        ["Churn Model", "LightGBM + Optuna + Isotonic Calibration + SHAP", "churn_probability, churn_tier, top-3 risk factors", "Active Paid"],
        ["CLV + RFM Model", "BG/NBD + Gamma-Gamma + Quintile RFM", "predicted_clv_6m, p_alive, rfm_segment, CI 80%/95%", "Active Paid"],
        ["Credit Forecast", "LightGBM Quantile Regression ×5 + Conformal Calibration", "credit_p10–p90, urgency, alert_date", "Active Paid"],
        ["Win-back Model", "LightGBM + Isotonic Calibration", "comeback_probability", "Churned"],
        ["Conversion Model", "LightGBM + Isotonic Calibration", "conversion_probability", "Active Free"],
    ],
    col_widths=[3.5, 6.5, 5.5, 3.0]
)

heading("2.2  Fine-tuning / Customization", level=2, size=16, space_before=8)
body("การ customization ทำใน 4 ระดับ:")

body("ระดับที่ 1: Train ด้วยข้อมูลเฉพาะธุรกิจ", bold=True, size=15, space_before=6)
body(
    "ใช้ dataset ของ 1Moby จากไฟล์: "
    "data/[1Moby] Data_example for Bangkok university.xlsx"
)
add_table(
    ["ข้อมูล", "จำนวน"],
    [
        ["Total users", "25,093"],
        ["Total payments", "13,882"],
        ["Total usage rows", "76,255"],
        ["Active customers (before cutoff)", "4,362"],
        ["Active customers (after cutoff)", "4,576"],
        ["Features ที่สร้าง", "30"],
        ["Cutoff date", "2025-07-01"],
    ],
    col_widths=[8.0, 4.0]
)

body("ระดับที่ 2: Feature Engineering เฉพาะ Domain", bold=True, size=15, space_before=8)
body("สร้าง feature 30 ตัวจาก 3 กลุ่มข้อมูล (ทั้งหมดคำนวณจากข้อมูลก่อน cutoff เท่านั้น):")
add_table(
    ["กลุ่ม Feature", "Feature หลัก", "จำนวน"],
    [
        ["User Profile", "days_since_join, days_since_last_access, days_since_last_send, days_until_sms_expire, days_until_email_expire, credit_sms_log, credit_email_log, is_paid_sms, is_paid_email", "9"],
        ["Payment Behavior", "pay_recency_days, pay_frequency, pay_monetary_log, pay_avg_amount, pay_total_credits, pay_avg_interval, pay_overdue_ratio, pay_n_sms, pay_n_email, pay_tenure_days", "10"],
        ["Usage Behavior", "usage_total_log, usage_months, usage_avg, usage_max, usage_std, usage_recent_3m, usage_prev_3m, usage_decay_ratio, usage_slope, usage_sms_total, usage_email_total", "11"],
    ],
    col_widths=[3.5, 11.0, 2.0]
)

body("ระดับที่ 3: Business Rules เฉพาะระบบ 1Moby", bold=True, size=15, space_before=8)
rules = [
    "Active window = 6 เดือน (ลูกค้าที่ active ใน 6 เดือนก่อน cutoff)",
    "Churn label = ลูกค้า active ก่อน cutoff ที่ไม่มี activity ใน 6 เดือนหลัง cutoff",
    "CLV horizon = 180 วัน (6 เดือน)",
    "Churn tier: Low (0.00–0.30) | Medium (0.30–0.60) | High (0.60–1.00)",
    "Credit urgency: Critical (<14 วัน) | Warning (14–30 วัน) | Monitor (30–90 วัน) | Stable (>90 วัน)",
    "alert_date = cutoff + P25 days (วันที่ควรเริ่ม campaign ก่อนลูกค้าจะซื้อ)",
]
for r in rules:
    bullet(r)

body("ระดับที่ 4: Explainable AI ด้วย SHAP", bold=True, size=15, space_before=8)
body(
    "ระบบใช้ SHAP (SHapley Additive exPlanations) เพื่อบอกเหตุผลว่า feature ใด "
    "ส่งผลต่อ churn probability ของลูกค้าแต่ละคน SHAP คำนวณสำหรับ active customers "
    "500 คนแรกต่อ run และเก็บ top-3 risk factors ไว้ใน risk_factor_1/2/3"
)
body("SHAP Top-10 Features (จาก Training Run):", bold=True, size=14, space_before=4)
add_table(
    ["อันดับ", "Feature", "Mean |SHAP|", "ความหมาย"],
    [
        ["1", "days_since_last_access", "0.6901", "วันนับจาก login ล่าสุด"],
        ["2", "days_until_sms_expire", "0.6186", "วันจนกว่าเครดิต SMS จะหมดอายุ"],
        ["3", "usage_months", "0.4116", "จำนวนเดือนที่มีการใช้งาน"],
        ["4", "usage_recent_3m", "0.2668", "ปริมาณ usage 3 เดือนล่าสุด"],
        ["5", "usage_decay_ratio", "0.2259", "สัดส่วน recent_3m / prev_3m (trend)"],
        ["6", "credit_sms_log", "0.1726", "เครดิต SMS คงเหลือ (log scale)"],
        ["7", "days_since_last_send", "0.1635", "วันนับจากส่งข้อความล่าสุด"],
        ["8", "usage_prev_3m", "0.1070", "ปริมาณ usage 3 เดือนก่อนหน้า"],
        ["9", "days_until_email_expire", "0.0910", "วันจนกว่าเครดิต Email จะหมดอายุ"],
        ["10", "pay_n_sms", "0.0628", "จำนวนครั้งที่ซื้อ SMS credits"],
    ],
    col_widths=[1.5, 5.0, 3.0, 7.0]
)

doc.add_page_break()

heading("2.3  Model Training Details", level=2, size=16, space_before=6)
body(
    "ระบบมีการ train model จากข้อมูลเฉพาะของ 1Moby เพื่อให้ AI เข้าใจพฤติกรรมลูกค้าจริง "
    "ของธุรกิจ ใช้แนวคิด Point-in-Time Training เพื่อป้องกัน lookahead bias:"
)
body(
    "timeline:  ← ─ ─ ─ ─ ─ ─ ─ ─ [cutoff: 2025-07-01] ─ ─ ─ ─ ─ ─ ─ ─ →\n"
    "features build ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘\n"
    "churn labels   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ → (6 months)\n"
    "CLV forecast   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ → (6 months)",
    size=13
)
body("คำสั่งที่ใช้ Train Model:")
body("    python train.py '../data/[1Moby] Data_example for Bangkok university.xlsx'", size=13)
add_image('.diagrams_build/activity_training.png', 4.2, 'รูปที่ 3: Activity Diagram — Model Training Pipeline (Offline CLI)')

# Churn
body("โมเดลที่ 1: Churn Prediction Model", bold=True, size=16, space_before=10)
add_table(
    ["รายการ", "รายละเอียด"],
    [
        ["Algorithm", "LightGBM Classifier"],
        ["Calibration", "Isotonic Calibration (CalibratedClassifierCV, 5-fold)"],
        ["Hyperparameter Tuning", "Optuna — 30 trials"],
        ["Data Split", "Train 60% / Validation 20% / Test 20%"],
        ["Population", "3,099 Active Paid customers"],
        ["Churn rate", "29.8% (positive class)"],
        ["Output", "churn_probability (0–1), churn_tier, top-3 SHAP factors"],
    ],
    col_widths=[5.5, 11.0]
)
body("Performance Metrics:", bold=True, size=14, space_before=4)
add_table(
    ["Metric", "Value", "หมายเหตุ"],
    [
        ["AUC-ROC", "0.9408", "สูงมาก — แยก churner/non-churner ได้ดีมาก"],
        ["F1 Score", "0.7772", "Balance ระหว่าง Precision และ Recall"],
        ["Precision", "0.7772", "เมื่อทำนายว่า churn จะถูกต้อง 77.72%"],
        ["Recall", "0.7772", "จับ churner จริงได้ 77.72%"],
        ["AUC (ตัด leakage features)", "0.9419", "AUC เพิ่มเล็กน้อย — ไม่พบ leakage"],
        ["AUC drop จาก leakage audit", "0.002", "น้อยมาก — model มีความน่าเชื่อถือสูง"],
    ],
    col_widths=[5.0, 3.0, 8.5]
)
body(
    "Leakage Audit: ระบบทดสอบโดยเปรียบเทียบ AUC แบบใช้ features ทั้งหมดกับแบบตัด "
    "suspect features (usage_decay_ratio, usage_recent_3m) ออก พบว่า AUC drop เพียง 0.002 "
    "แสดงว่าไม่พบปัญหา data leakage อย่างมีนัยสำคัญ",
    size=14
)

# CLV
body("โมเดลที่ 2: Customer Lifetime Value (CLV) Model", bold=True, size=16, space_before=10)
add_table(
    ["รายการ", "รายละเอียด"],
    [
        ["Algorithm (Frequency)", "BG/NBD (Beta-Geometric/Negative Binomial Distribution)"],
        ["Algorithm (Monetary)", "Gamma-Gamma Model"],
        ["Confidence Interval", "Empirical per-decile residual CI (95% และ 80%)"],
        ["CLV Horizon", "180 วัน (6 เดือน)"],
        ["Output", "predicted_clv_6m, p_alive, clv_ci95_lo/hi, clv_ci80_lo/hi"],
    ],
    col_widths=[5.5, 11.0]
)
body("Performance Metrics:", bold=True, size=14, space_before=4)
add_table(
    ["Metric", "Value", "หมายเหตุ"],
    [
        ["Spearman Correlation", "0.7712", "เรียงลำดับมูลค่าลูกค้าได้ดี"],
        ["Top Decile Lift", "0.6447", "กลุ่ม top 10% มีมูลค่าสูงกว่าที่ทำนาย"],
        ["MAE (Mean Absolute Error)", "140,510 บาท", "ค่า error เฉลี่ย"],
        ["Median Absolute Error", "21,919 บาท", "ค่า error ส่วนกลาง (robust กว่า MAE)"],
        ["Average CLV 6 months", "112,880 บาท", "มูลค่าเฉลี่ยต่อลูกค้า"],
        ["Median CLV 6 months", "10,339 บาท", "มูลค่ากลางต่อลูกค้า"],
        ["95% Interval Coverage", "0.9303 (93.0%)", "ใกล้ target 95%"],
        ["80% Interval Coverage", "0.7909 (79.1%)", "ใกล้ target 80% มาก"],
        ["Average P(alive)", "0.5421", "โอกาสเฉลี่ยที่ลูกค้ายังคง active"],
    ],
    col_widths=[5.5, 3.5, 7.5]
)
body("RFM Segmentation (Quintile Scoring):", bold=True, size=14, space_before=6)
add_table(
    ["Segment", "เงื่อนไข (R + F + M score)", "ความหมาย"],
    [
        ["Champions", "R+F+M ≥ 13", "ลูกค้าซื้อบ่อย มูลค่าสูง ล่าสุดซื้อ"],
        ["Loyal", "total ≥ 10 และ R ≥ 3", "ลูกค้าประจำ มูลค่าดี"],
        ["Promising", "R ≥ 4 และ total < 10", "ลูกค้าใหม่ที่มี potential"],
        ["Cannot Lose", "R ≤ 2 และ total ≥ 8", "ลูกค้าเคยดีแต่หายไป — ต้อง win back"],
        ["At Risk", "R ≤ 2", "ลูกค้าไม่ได้ซื้อนาน"],
        ["Need Attention", "อื่นๆ", "ลูกค้าที่ต้องติดตาม"],
    ],
    col_widths=[3.5, 6.0, 7.0]
)

doc.add_page_break()

# Credit Forecast
body("โมเดลที่ 3: Credit Top-up Forecast Model", bold=True, size=16, space_before=6)
add_table(
    ["รายการ", "รายละเอียด"],
    [
        ["Algorithm", "LightGBM Quantile Regression"],
        ["Quantiles", "P10, P25, P50, P75, P90"],
        ["Hyperparameter Tuning", "Optuna — 15 trials ต่อ quantile (75 trials รวม)"],
        ["Post-processing", "Conformal Calibration (ปรับ coverage ให้ตรงเป้า)"],
        ["Training Data", "5,761 transaction pairs (ลูกค้าที่ซื้อ ≥ 2 ครั้ง)"],
        ["Output", "credit_p10–p90 (วัน), urgency, alert_date, forecast_confidence"],
    ],
    col_widths=[5.5, 11.0]
)
body("Performance Metrics:", bold=True, size=14, space_before=4)
add_table(
    ["Metric", "Before Calibration", "After Calibration", "Target"],
    [
        ["P50 MAE", "—", "32.96 วัน", "—"],
        ["P50 Median AE", "—", "9.39 วัน", "—"],
        ["P50 R²", "—", "0.4014", "—"],
        ["XGBoost Baseline MAE", "34.98 วัน", "—", "< 34.98 (beat baseline)"],
        ["P10-P90 Coverage", "73.37%", "80.14%", "80%"],
        ["P25-P75 Coverage", "44.93%", "50.39%", "50%"],
    ],
    col_widths=[5.5, 4.0, 4.0, 3.0]
)
body(
    "Conformal Calibration ช่วยปรับ coverage ของ prediction interval ให้ตรงเป้า "
    "โดย P10-P90 ปรับจาก 73.4% เป็น 80.1% และ P25-P75 ปรับจาก 44.9% เป็น 50.4%",
    size=14
)

# Winback
body("โมเดลที่ 4: Win-back Model", bold=True, size=16, space_before=10)
add_table(
    ["รายการ", "รายละเอียด"],
    [
        ["Algorithm", "LightGBM + Isotonic Calibration"],
        ["Population", "4,948 Churned customers"],
        ["Positive class (comeback)", "160 customers (3.2% — highly imbalanced)"],
        ["Output", "comeback_probability (0–1)"],
    ],
    col_widths=[5.5, 11.0]
)
add_table(
    ["Metric", "Value", "หมายเหตุ"],
    [
        ["AUC-ROC", "0.9252", "สูงมาก — แยก win-back candidate ได้ดี"],
        ["F1 Score", "0.4928", "ต่ำกว่า churn เพราะ class imbalance (positive 3.2%)"],
        ["Precision", "0.5862", "เมื่อทำนาย comeback จะถูกต้อง 58.6%"],
        ["Recall", "0.4250", "จับ comeback จริงได้ 42.5%"],
    ],
    col_widths=[4.0, 3.0, 9.5]
)
body(
    "หมายเหตุ: F1 ที่ค่อนข้างต่ำเป็นผลจาก extreme class imbalance "
    "(comeback 160 คน จาก 4,948 คน = 3.2%) AUC ที่ 0.9252 สะท้อนว่าโมเดลยังแยกลูกค้า "
    "ที่มีโอกาสกลับมาออกได้ดี แต่ threshold ต้องปรับให้เหมาะสมกับ business tolerance",
    size=14
)

# Conversion
body("โมเดลที่ 5: Free-to-Paid Conversion Model", bold=True, size=16, space_before=10)
add_table(
    ["รายการ", "รายละเอียด"],
    [
        ["Algorithm", "LightGBM + Isotonic Calibration"],
        ["Population", "1,912 Active Free customers"],
        ["Positive class (converted)", "80 customers (4.2% — imbalanced)"],
        ["Output", "conversion_probability (0–1)"],
    ],
    col_widths=[5.5, 11.0]
)
add_table(
    ["Metric", "Value", "หมายเหตุ"],
    [
        ["AUC-ROC", "0.9629", "ดีที่สุดในบรรดา 5 โมเดล"],
        ["F1 Score", "0.6667", "ดีกว่า win-back แม้ class imbalance ใกล้กัน"],
        ["Precision", "0.6842", "เมื่อทำนาย conversion จะถูกต้อง 68.4%"],
        ["Recall", "0.6500", "จับ converter จริงได้ 65.0%"],
    ],
    col_widths=[4.0, 3.0, 9.5]
)

# Priority Score
body("Priority Score Formula", bold=True, size=16, space_before=10)
body(
    "ระบบคำนวณ Priority Score (0–10) สำหรับลูกค้าแต่ละคนโดยใช้ weighted blend ของ 4 ปัจจัย:"
)
body(
    "  score = (0.35 × norm(churn_probability)\n"
    "         + 0.35 × norm(predicted_clv_6m)\n"
    "         + 0.15 × urgency_score          — Critical=1.0, Warning=0.75, Monitor=0.5, Stable=0.25\n"
    "         + 0.15 × recency_score)  × 10\n\n"
    "  Revenue at Risk = churn_probability × predicted_clv_6m",
    size=13
)

doc.add_page_break()

heading("2.4  Web Application Demo", level=2, size=16, space_before=6)
body(
    "โปรเจคนี้ใช้ Web Application แบบ full-stack แทน Streamlit/Gradio เพราะต้องการแสดง "
    "workflow จริงตั้งแต่ upload data → background job → SSE progress → database → dashboard "
    "→ customer detail ในลักษณะที่ผู้ใช้จริงจะใช้งาน"
)
add_table(
    ["หน้า", "URL", "ฟังก์ชัน"],
    [
        ["Login", "/login", "เข้าสู่ระบบด้วย Google OAuth (Better Auth)"],
        ["Command Center", "/", "KPI ภาพรวม, lifecycle summary, churn/RFM/urgency charts"],
        ["Pipelines / Runs", "/runs", "สร้าง run, upload Excel, ดู status แบบ real-time ผ่าน SSE"],
        ["Customers", "/customers", "ตารางลูกค้าทั้งหมด, filter by lifecycle/churn tier/urgency/RFM, search"],
        ["Customer 360", "/customers/[id]", "Churn gauge + SHAP factors, CLV + CI, RFM scores, credit forecast timeline"],
        ["Action Queue", "/playbooks", "รายชื่อลูกค้าที่ควร action เรียงตาม priority score"],
        ["Alerts", "/alerts", "แจ้งเตือนระดับ portfolio/model drift/data quality"],
        ["Model Health", "/model-performance", "AUC/F1/Coverage metrics, SHAP plots, training log, model drift (PSI/KS)"],
        ["AI Chat (Demo)", "/ai-chat", "หน้าสนทนา demo สำหรับถามภาพรวมระบบ (LLM integration — Phase 2)"],
    ],
    col_widths=[3.5, 4.0, 9.0]
)
body("Demo Script:", bold=True, size=15, space_before=8)
demo_steps = [
    "เปิดหน้า /runs → สร้าง run ใหม่ ตั้งชื่อและ cutoff date (2025-07-01)",
    "Upload ไฟล์ Excel → ดู status badge เปลี่ยนแบบ real-time: pending → processing → done",
    "ไปหน้า / เพื่อดู KPI: Active customers, High churn count, Revenue at risk",
    "ไปหน้า /customers → filter ลูกค้า churn tier = High + urgency = Critical",
    "คลิกลูกค้า 1 คน → เปิด Customer 360: ดู churn gauge, SHAP top-3, CLV forecast, credit timeline",
    "เปิด /model-performance → แสดง validation metrics, SHAP summary plot, training log",
]
for i, s in enumerate(demo_steps, 1):
    bullet(f"{i}. {s}")
body("คำสั่งรัน Demo:")
body("    docker-compose up --build", size=13)
body("Access points:")
add_table(
    ["Service", "URL"],
    [
        ["Frontend (Next.js)", "http://localhost:3000"],
        ["Elysia API", "http://localhost:3001"],
        ["FastAPI Internal Docs", "http://localhost:8001/docs"],
    ],
    col_widths=[6.0, 10.5]
)

doc.add_page_break()

# ═══════════════════════════════════════════════════════════════════════════════
# 3. SYSTEM VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════
heading("3.  System Validation")

heading("3.1  Workflow Validation", level=2, size=16, space_before=6)
add_table(
    ["ขั้นตอน", "วิธีทดสอบ", "Expected Result", "สถานะ"],
    [
        ["Create prediction run", "POST /runs ผ่าน Web UI", "run status = pending", "✓ ผ่าน"],
        ["Upload Excel (8 sheets)", "Upload dataset ที่มี required sheets", "validate + insert raw data", "✓ ผ่าน"],
        ["Validate missing sheet", "Upload Excel ที่ขาด sheet", "reject 400 + error message", "✓ ผ่าน"],
        ["Arq job dispatch", "ตรวจ Redis queue หลัง upload", "job เข้า arq:queue", "✓ ผ่าน"],
        ["Worker processing", "Worker รับ job ผ่าน Redis/Arq", "status → processing", "✓ ผ่าน"],
        ["Feature engineering", "Worker เรียก build_features()", "30 features แบบ point-in-time safe", "✓ ผ่าน"],
        ["Model prediction", "MobyPredictor.run_all_predictions()", "ได้ lifecycle + all predictions", "✓ ผ่าน"],
        ["Batch insert", "Worker save predictions", "batch 1,000 rows/trip → PostgreSQL", "✓ ผ่าน"],
        ["SSE progress stream", "GET /runs/:id/stream", "event-stream แสดง progress real-time", "✓ ผ่าน"],
        ["Run status final", "ตรวจ DB หลัง pipeline เสร็จ", "status = done / failed", "✓ ผ่าน"],
        ["Dashboard KPIs", "เปิดหน้า /", "แสดง KPI summary ถูกต้อง", "✓ ผ่าน"],
        ["Customer 360", "เปิด /customers/[id]", "แสดงข้อมูลรายลูกค้าครบทุก field", "✓ ผ่าน"],
        ["Model Health page", "เปิด /model-performance", "แสดง metrics จาก metrics.json", "✓ ผ่าน"],
        ["Auth guard", "เข้า /customers โดยไม่ login", "redirect → /login", "✓ ผ่าน"],
        ["Run ownership check", "ดู run ของ user อื่น", "403 Forbidden", "✓ ผ่าน"],
    ],
    col_widths=[4.5, 4.5, 5.5, 2.0]
)

doc.add_page_break()

heading("3.2  Model Validation Metrics", level=2, size=16, space_before=6)
body("Churn Model", bold=True, size=15)
add_table(
    ["Metric", "Value"],
    [
        ["AUC-ROC", "0.9408"],
        ["F1 Score", "0.7772"],
        ["Precision", "0.7772"],
        ["Recall", "0.7772"],
        ["AUC (ตัด leakage features)", "0.9419"],
        ["AUC drop (leakage audit)", "0.002"],
    ],
    col_widths=[7.0, 9.5]
)
body(
    "สรุป: Churn model มี AUC สูงมาก (0.9408) และ leakage audit ผ่าน "
    "เพราะเมื่อตัด suspect features ออก AUC ไม่ตกผิดปกติ (drop เพียง 0.002)",
    size=14
)
add_image('models/churn_eval.png', 6.0, 'รูปที่ 4: Churn Model — ROC Curve, Calibration Plot, Precision-Recall Curve')
add_image('models/churn_shap.png', 4.0, 'รูปที่ 5: SHAP Feature Importance — Churn Model')

body("CLV Model", bold=True, size=15, space_before=8)
add_table(
    ["Metric", "Value"],
    [
        ["Spearman Correlation", "0.7712"],
        ["Top Decile Lift", "0.6447"],
        ["MAE", "140,510 บาท"],
        ["Median Absolute Error", "21,919 บาท"],
        ["Average CLV 6 months", "112,880 บาท"],
        ["Median CLV 6 months", "10,339 บาท"],
        ["Average P(alive)", "0.5421"],
        ["95% Interval Coverage", "93.03%"],
        ["80% Interval Coverage", "79.09%"],
    ],
    col_widths=[7.0, 9.5]
)
body(
    "สรุป: โมเดล CLV เรียงลำดับลูกค้ามูลค่าสูงได้ดีจาก Spearman 0.7712 "
    "และ interval coverage ใกล้ target มาก (93% vs 95% target, 79% vs 80% target)",
    size=14
)
add_image('models/clv_eval.png', 6.0, 'รูปที่ 6: CLV Model — Decile Lift, Prediction vs Actual, Interval Coverage')

body("Credit Top-up Forecast Model", bold=True, size=15, space_before=8)
add_table(
    ["Metric", "Before Calibration", "After Calibration"],
    [
        ["P50 MAE", "—", "32.96 วัน"],
        ["P50 Median AE", "—", "9.39 วัน"],
        ["P50 R²", "—", "0.4014"],
        ["XGBoost Baseline MAE", "34.98 วัน", "— (beat baseline)"],
        ["P10-P90 Coverage", "73.37%", "80.14%  ✓"],
        ["P25-P75 Coverage", "44.93%", "50.39%  ✓"],
    ],
    col_widths=[5.5, 5.0, 6.0]
)
add_image('models/credit_eval.png', 6.0, 'รูปที่ 7: Credit Forecast — Quantile Coverage & Calibration Analysis')

body("Win-back Model", bold=True, size=15, space_before=8)
add_table(
    ["Metric", "Value"],
    [
        ["AUC-ROC", "0.9252"],
        ["F1 Score", "0.4928 (class imbalance: 3.2% positive)"],
        ["Precision", "0.5862"],
        ["Recall", "0.4250"],
        ["Churned customers", "4,948"],
        ["Comeback customers (positive)", "160"],
    ],
    col_widths=[5.5, 11.0]
)
add_image('models/winback_eval.png', 5.5, 'รูปที่ 8: Win-back Model Evaluation')

body("Conversion Model", bold=True, size=15, space_before=8)
add_table(
    ["Metric", "Value"],
    [
        ["AUC-ROC", "0.9629"],
        ["F1 Score", "0.6667"],
        ["Precision", "0.6842"],
        ["Recall", "0.6500"],
        ["Active Free customers", "1,912"],
        ["Converted customers (positive)", "80"],
    ],
    col_widths=[5.5, 11.0]
)
add_image('models/conversion_eval.png', 5.5, 'รูปที่ 9: Conversion Model Evaluation')

doc.add_page_break()

heading("3.3  Model Algorithm Comparison", level=2, size=16, space_before=6)
body(
    "ระบบทำการเปรียบเทียบ LightGBM กับ algorithms อื่นๆ เพื่อยืนยันว่า LightGBM เป็น "
    "algorithm ที่เหมาะสมที่สุดสำหรับ Churn Prediction ในบริบทของ 1Moby:"
)
add_table(
    ["Algorithm", "AUC-ROC", "F1 Score", "Precision", "Recall", "หมายเหตุ"],
    [
        ["Logistic Regression", "0.8873", "0.6609", "0.7125", "0.6162", "Baseline — linear model"],
        ["Random Forest", "0.9183", "0.7439", "0.7419", "0.7459", "ดี แต่ AUC ต่ำกว่า LightGBM"],
        ["XGBoost", "0.9184", "0.7433", "0.7354", "0.7514", "ใกล้เคียง Random Forest"],
        ["LightGBM (ไม่ tune)", "0.9267", "0.7234", "0.7120", "0.7351", "LightGBM default params"],
        ["LightGBM + Optuna (Final)", "0.9408", "0.7772", "0.7772", "0.7772", "★ Final model — ดีที่สุด"],
    ],
    col_widths=[5.0, 2.5, 2.5, 2.5, 2.5, 4.5]
)
body(
    "ผลการเปรียบเทียบยืนยันว่า LightGBM + Optuna hyperparameter tuning ให้ผลดีที่สุดทั้ง AUC, F1, "
    "Precision และ Recall ในทุก metric เมื่อเทียบกับ Logistic Regression, Random Forest และ XGBoost "
    "AUC ของ Final model สูงกว่า XGBoost (0.9408 vs 0.9184 = +0.0224) และสูงกว่า "
    "Logistic Regression ถึง 0.0535",
    size=14
)

heading("3.4  Business / Workflow Impact Metrics", level=2, size=16, space_before=8)
add_table(
    ["Metric", "วิธีวัด", "ผล / เป้าหมาย"],
    [
        ["Model accuracy", "AUC, F1, Precision, Recall", "Churn AUC 0.9408, Conversion AUC 0.9629"],
        ["Forecast reliability", "Coverage ของ prediction interval", "Credit P10-P90 coverage 80.14% (target 80%)"],
        ["Customer prioritization", "Priority score = weighted blend 4 ปัจจัย", "Score 0-10 พร้อม revenue at risk ทุกลูกค้า"],
        ["Processing efficiency", "Batch insert vs row-by-row", "1,000 rows/trip — ลด DB round trips 1,000×"],
        ["Time to insight", "จาก upload จนถึง dashboard", "< 5 นาที สำหรับ 25,000 customers"],
        ["Explainability", "SHAP top-3 factors ต่อลูกค้า", "มี risk explanation ทุก active customer"],
        ["Model freshness", "PSI + KS drift detection", "alert เมื่อ PSI > 0.25 หรือ KS p < 0.05"],
    ],
    col_widths=[4.5, 5.5, 7.5]
)

heading("3.5  Limitation & Future Improvement", level=2, size=16, space_before=8)
body("ข้อจำกัดปัจจุบัน:", bold=True, size=15)
limitations = [
    "AI Chat (/ai-chat) ยังเป็น demo/mock response — ยังไม่ได้ต่อ LLM จริง (Gemini API) — Phase 2",
    "Win-back model มี F1/Recall ต่ำเพราะ extreme class imbalance (positive 3.2%) — ควรใช้ oversampling หรือ cost-sensitive learning",
    "ยังไม่มี feedback loop จากผลลัพธ์จริง (เช่น โทรแล้วซื้อ/ไม่ซื้อ) เพื่อ retrain model",
    "Model artifacts เก็บใน local filesystem — ยังไม่ได้ migrate ไป Cloudflare R2",
    "ยังไม่มี real email/LINE notification เมื่อ pipeline เสร็จ",
]
for l in limitations:
    bullet(l)

body("แผนพัฒนาต่อ (Phase 2):", bold=True, size=15, space_before=6)
improvements = [
    "ต่อ LLM (Gemini API) สำหรับ AI assistant — ให้ตอบจาก customer metrics และ model explanation แบบ streaming",
    "เพิ่ม feedback loop จาก action outcome เพื่อ retrain model อัตโนมัติ",
    "Migrate model artifacts ไป Cloudflare R2 keyed by dataset_id",
    "เพิ่ม win-back model performance ด้วย SMOTE / class weighting",
    "Export action list เป็น CSV หรือส่งเข้า CRM โดยตรง",
    "เพิ่ม real-time notification (Email/LINE) เมื่อ pipeline เสร็จหรือมี critical alert",
]
for imp in improvements:
    bullet(imp)

doc.add_page_break()

# ═══════════════════════════════════════════════════════════════════════════════
# 4. DELIVERABLES
# ═══════════════════════════════════════════════════════════════════════════════
heading("4.  Deliverables")

heading("4.1  Project Proposal Summary", level=2, size=16, space_before=6)
add_table(
    ["หัวข้อ", "รายละเอียด"],
    [
        ["ชื่อโปรเจค", "1Moby Intelligence: AI Customer Lifecycle & Revenue Rescue System"],
        ["ปัญหาหลัก", "การวิเคราะห์ลูกค้า B2B SaaS ยังเป็น manual ผ่าน Excel — ไม่มี prediction, priority, explainability"],
        ["แนวทางแก้", "ML Web App: upload Excel → AI สร้าง prediction + action insight อัตโนมัติ"],
        ["Dataset", "1Moby Excel ข้อมูล users (25,093), payments (13,882), usage (76,255 rows)"],
        ["Models", "5 ML models: Churn, CLV, Credit Forecast, Win-back, Conversion + Lifecycle rule"],
        ["Tech Stack", "Elysia.js + Bun (API), Next.js 14 (Web), Python/FastAPI (ML), PostgreSQL, Redis, Arq"],
        ["Deployment", "Docker Compose — local development"],
        ["Training Command", "python train.py '../data/[1Moby] Data_example for Bangkok university.xlsx'"],
    ],
    col_widths=[4.0, 12.5]
)

heading("4.2  Model Artifacts", level=2, size=16, space_before=8)
add_table(
    ["ไฟล์", "เนื้อหา"],
    [
        ["churn_model.pkl", "Calibrated LightGBM + StandardScaler + feature list"],
        ["churn_scaler.pkl", "StandardScaler สำหรับ churn features"],
        ["ltv_bgnbd.pkl", "BG/NBD model + decile_stats สำหรับ empirical PI"],
        ["ltv_gg.pkl", "Gamma-Gamma model"],
        ["credit_q10/25/50/75/90.pkl", "5 quantile models + conformal calibration data"],
        ["winback_model.pkl", "Calibrated LightGBM สำหรับ win-back prediction"],
        ["conversion_model.pkl", "Calibrated LightGBM สำหรับ conversion prediction"],
        ["metrics.json", "AUC, F1, coverage rates, Spearman corr, model comparison"],
        ["monitoring_baseline.json", "Feature distribution baseline สำหรับ PSI drift detection"],
        ["rfm_segments.csv", "RFM segment mapping ทุก customer"],
        ["*_eval.png", "Evaluation plots: ROC curve, calibration, decile lift, SHAP summary"],
        ["training_log.txt", "Training log รายละเอียด"],
    ],
    col_widths=[5.5, 11.0]
)

heading("4.3  Web Application Access", level=2, size=16, space_before=8)
add_table(
    ["รายการ", "รายละเอียด"],
    [
        ["Repository folder", "demo-predict (Monorepo: apps/web, apps/api, apps/ml)"],
        ["Run command", "docker-compose up --build"],
        ["Frontend (Next.js)", "http://localhost:3000"],
        ["Elysia API", "http://localhost:3001"],
        ["FastAPI Internal", "http://localhost:8001/docs (internal routes เท่านั้น)"],
    ],
    col_widths=[5.0, 11.5]
)

doc.add_page_break()

# ═══════════════════════════════════════════════════════════════════════════════
# 5. CONCLUSION
# ═══════════════════════════════════════════════════════════════════════════════
heading("5.  บทสรุป (Conclusion)")
body(
    "โปรเจค 1Moby Intelligence ประสบความสำเร็จในการเปลี่ยน workflow การวิเคราะห์ลูกค้า "
    "จาก manual Excel-based analysis ไปสู่ระบบ AI ที่ให้ผล prediction และ action insight "
    "อัตโนมัติ ระบบสามารถวิเคราะห์ลูกค้ากว่า 25,000 คนได้ภายในไม่กี่นาทีหลังจาก upload "
    "Excel โดยไม่ต้องใช้ความเชี่ยวชาญด้าน data science จากผู้ใช้"
)
body(
    "ด้าน Machine Learning ทุกโมเดลผ่าน validation criteria ที่ตั้งไว้ "
    "Churn model มี AUC 0.9408 ซึ่งสูงกว่า XGBoost baseline 2.2% "
    "CLV model มี Spearman correlation 0.7712 พร้อม interval coverage ที่ใกล้ target "
    "Credit forecast ผ่าน conformal calibration จนได้ P10-P90 coverage ที่ 80.1% "
    "และ Conversion model มี AUC สูงสุด 0.9629"
)
body(
    "ด้านสถาปัตยกรรม ระบบใช้ separation of concerns ที่ชัดเจน: "
    "Elysia.js เป็น API layer (TypeScript-native, typed, SSE), "
    "Python/Arq เป็น ML worker (Python-native ML pipeline), "
    "FastAPI เป็น internal service เท่านั้น ทำให้แต่ละส่วนสามารถ scale และ maintain ได้อิสระ"
)
body(
    "ข้อจำกัดหลักคือ AI Chat ยังเป็น demo และ Win-back model มี F1 ต่ำจาก class imbalance "
    "ซึ่งทั้งสองส่วนอยู่ในแผน Phase 2 รวมถึงการต่อ Gemini LLM, feedback loop และ R2 storage "
    "โดยรวมโปรเจคนี้แสดงให้เห็นว่า AI สามารถสร้างมูลค่าทางธุรกิจจริงได้โดยไม่ต้องอาศัย "
    "external AI API — custom-trained models จากข้อมูลเฉพาะธุรกิจให้ผลที่ accurate และ explainable กว่า"
)

doc.add_page_break()

# ═══════════════════════════════════════════════════════════════════════════════
# REFERENCES
# ═══════════════════════════════════════════════════════════════════════════════
heading("บรรณานุกรม")
refs = [
    "Ke, G., Meng, Q., Finley, T., Wang, T., Chen, W., Ma, W., ... & Liu, T.-Y. (2017). LightGBM: A highly efficient gradient boosting decision tree. Advances in Neural Information Processing Systems, 30.",
    "Fader, P. S., Hardie, B. G., & Lee, K. L. (2005). 'Counting your customers' the easy way: An alternative to the Pareto/NBD model. Marketing Science, 24(2), 275–284.",
    "Fader, P. S., & Hardie, B. G. (2013). The Gamma-Gamma model of monetary value. (SSRN Working Paper).",
    "Lundberg, S. M., & Lee, S.-I. (2017). A unified approach to interpreting model predictions. Advances in Neural Information Processing Systems, 30.",
    "Akiba, T., Sano, S., Yanase, T., Ohta, T., & Koyama, M. (2019). Optuna: A next-generation hyperparameter optimization framework. Proceedings of the 25th ACM SIGKDD International Conference on Knowledge Discovery & Data Mining.",
    "Vovk, V., Gammerman, A., & Shafer, G. (2005). Algorithmic Learning in a Random World. Springer. (Conformal Prediction)",
    "ElysiaJS Documentation. https://elysiajs.com/",
    "Next.js 14 App Router Documentation. https://nextjs.org/docs",
    "Drizzle ORM Documentation. https://orm.drizzle.team/",
    "Better Auth Documentation. https://www.better-auth.com/",
]
for i, ref in enumerate(refs, 1):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after  = Pt(2)
    p.paragraph_format.left_indent  = Cm(0.8)
    p.paragraph_format.first_line_indent = Cm(-0.8)
    run = p.add_run(f"[{i}] {ref}")
    set_font(run, size=13)

doc.add_page_break()

# ═══════════════════════════════════════════════════════════════════════════════
# APPENDIX
# ═══════════════════════════════════════════════════════════════════════════════
heading("ภาคผนวก")

heading("ภาคผนวก ก: Database Schema หลัก", level=2, size=16, space_before=6)
add_table(
    ["ตาราง", "คอลัมน์สำคัญ", "หน้าที่"],
    [
        ["prediction_runs", "id (UUID), name, status, cutoff_date, total_customers, error_message", "เก็บแต่ละ run ที่ผู้ใช้สร้าง"],
        ["raw_customers", "run_id, acc_id, status_sms/email, credit_sms/email, expire_sms/email, join_date, last_access, last_send", "ข้อมูลดิบลูกค้าต่อ run"],
        ["raw_payments", "run_id, acc_id, payment_date, amount, credit_add, credit_type", "ข้อมูลการชำระเงินดิบต่อ run"],
        ["raw_usage", "run_id, acc_id, year, month, usage, channel, source", "ข้อมูลการใช้งาน SMS/Email ดิบต่อ run"],
        ["predictions", "run_id, acc_id, lifecycle_stage, churn_probability, churn_tier, predicted_clv_6m, p_alive, rfm_segment, credit_p10–p90, urgency, alert_date, priority_score, revenue_at_risk, risk_factor_1/2/3", "ผล ML output ทั้งหมดต่อลูกค้าต่อ run"],
        ["model_versions", "id, model_type, version, metrics_json, created_at", "ทะเบียน model versions"],
    ],
    col_widths=[3.5, 7.5, 5.5]
)

heading("ภาคผนวก ข: Environment Variables", level=2, size=16, space_before=8)
add_table(
    ["Service", "Variable", "ค่าตัวอย่าง", "หน้าที่"],
    [
        ["api (Elysia)", "DATABASE_URL", "postgresql://...", "PostgreSQL connection"],
        ["api", "BETTER_AUTH_SECRET", "(secret)", "Better Auth signing key"],
        ["api", "INTERNAL_SERVICE_TOKEN", "(shared token)", "Token ยืนยัน Elysia→FastAPI"],
        ["api", "ML_INTERNAL_URL", "http://ml:8000", "FastAPI internal URL"],
        ["ml (Python)", "DATABASE_URL", "postgresql://...", "PostgreSQL connection"],
        ["ml", "REDIS_HOST", "redis", "Redis hostname"],
        ["ml", "MODEL_DIR", "/app/models", "Path ไฟล์โมเดล"],
        ["ml", "INTERNAL_SERVICE_TOKEN", "(shared token)", "Token ยืนยัน"],
        ["web (Next.js)", "ELYSIA_URL", "http://api:3001", "Proxy target (server-side)"],
        ["web", "NEXT_PUBLIC_AUTH_URL", "http://localhost:3001", "Auth URL (browser-visible)"],
    ],
    col_widths=[3.0, 5.0, 4.5, 4.0]
)

# ─── Save ─────────────────────────────────────────────────────────────────────
out = "./CS460_AI_Project_Report_FINAL.docx"
doc.save(out)
print(f"✓ Saved: {out}")
