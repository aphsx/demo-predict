/**
 * Run-insight base summary.
 *
 * Produces a short, grounded BEHAVIOUR overview (Markdown, Thai) of an ENTIRE
 * prediction run — the "สรุปก่อน" the team reads to understand the customer base
 * before drilling into individual customers. Grounded entirely in the
 * deterministic aggregates from run-insight-context (counts, distributions,
 * exposure), so the narrative never invents figures.
 *
 * Like the per-customer overview, this is descriptive — it explains WHAT the
 * base looks like and WHAT is notable, and intentionally prescribes nothing
 * (OUTPUT-CONTRACT §5.2 removed the action workflow). The human decides.
 *
 * One summary per run, cached in ml_prediction_runs.cohort_insight_json and
 * regenerated on demand. ~1 LLM call per run, not per customer — cheap at scale.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { mlPredictionRuns } from "../../db/schema";
import { buildRunInsightSignals, type RunInsightSignals } from "./run-insight-context";
import { complete, type ChatMessage } from "./llm-client";
import { getLLMConfig, isLLMConfigured } from "./llm-config";
import { renderGuardrails } from "./safety";

export type RunInsight = {
  run_id: string;
  ai_status: "not_requested" | "completed" | "failed";
  ai_summary: string | null;
  ai_model: string | null;
  ai_generated_at: string | null;
};

type InsightCache = {
  status: "completed";
  summary: string;
  model: string;
  generated_at: string;
};

type ServiceError = { status: number; body: { message: string; code?: string } };

const SYSTEM_PROMPT = `คุณคือนักวิเคราะห์ข้อมูลลูกค้าอาวุโสของบริษัท 1Moby (B2B SaaS ด้านการส่ง SMS/Email)

งานของคุณ: เขียน "สรุปภาพรวมพฤติกรรมฐานลูกค้า" ของ prediction run นี้ เป็นภาษาไทย
ให้ทีมอ่านก่อนดูรายคน — เป้าหมายคือ "เข้าใจว่าฐานลูกค้านี้มีลักษณะอย่างไร"
ไม่ใช่แค่อ่านตัวเลขออกมาเป็นร้อยแก้วหรือบอกให้ไปทำอะไร

กฎเหล็ก:
${renderGuardrails()}
- ห้ามแนะนำ ห้าม next step ห้ามบอกให้ติดต่อหรือดูแลกลุ่มไหน — ผู้อ่านตัดสินใจเอง
- อ้างอิงเฉพาะตัวเลขใน <data> เท่านั้น อ้างตัวเลขจริง/สัดส่วนทุกครั้งที่กล่าวถึง
- อย่าบรรยายทีละมิติเหมือนอ่านตาราง — ให้วิเคราะห์ว่า "ภาพรวมเป็นอย่างไร" และ "มีอะไรน่าสังเกต"

รูปแบบ output (Markdown ภาษาไทย, กระชับ):

## ภาพรวม
[1 ย่อหน้า: สิ่งที่สำคัญที่สุดที่บอกลักษณะของฐานลูกค้านี้ ไม่ใช่แค่จำนวนและสัดส่วน
แต่คือ "ฐานนี้เป็น base ประเภทไหน" — เช่น base ที่กำลังหดตัว, base ที่ยังแข็งแกร่ง,
base ที่มีความเสี่ยงกระจุกตัวสูง เป็นต้น อ้างตัวเลขสนับสนุนคำอธิบาย]

## ความเชื่อมโยงที่น่าสังเกต
[2-4 bullets: ค้นหาความสัมพันธ์ข้ามมิติที่มีนัยสำคัญ เช่น
- กลุ่มเสี่ยงสูงมี revenue at risk สูงไม่สมดุลกับจำนวน (กลุ่มเล็กแต่ exposure ใหญ่ หรือกลับกัน)
- การใช้งานที่ลดลงกับ value tier และ churn risk สอดคล้องหรือขัดแย้งกันอย่างไร
- credit urgency สัมพันธ์กับ lifecycle stage อย่างไร
- cohort ไหนที่มี clv สูงแต่ใกล้หมดเครดิต
ระบุเฉพาะที่พบจากตัวเลขจริง อย่าสร้างขึ้นมาเอง]

## ข้อสังเกตเพิ่มเติม
[เฉพาะเมื่อพบตัวเลขที่ผิดปกติหรือขัดแย้งกัน เช่น churn risk ต่ำแต่ usage declining สูง,
หรือ base ใหญ่แต่ active paid มีน้อยผิดปกติ — ถ้าไม่มีให้เขียน "ไม่มีข้อมูลผิดปกติ"]`;

function pct(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function formatSignals(s: RunInsightSignals): string {
  const lc = s.lifecycle;
  const t = s.usage_trend;
  const r = s.churn.by_risk;
  const u = s.credit.by_urgency;
  const cohorts =
    s.notable_cohorts.length === 0
      ? "  ไม่มี"
      : s.notable_cohorts
          .map(
            (c) =>
              `  ${c.value_tier} value × ${c.risk_level} risk: ${c.count} ราย, CLV รวม ฿${c.clv_sum.toLocaleString()}, revenue at risk ฿${c.revenue_at_risk.toLocaleString()}`
          )
          .join("\n");

  return `<data>
ลูกค้าทั้งหมด: ${s.total_customers.toLocaleString()}

=== LIFECYCLE MIX ===
Active Paid: ${lc.active_paid} (${pct(lc.active_paid, s.total_customers)})
Active Free: ${lc.active_free} (${pct(lc.active_free, s.total_customers)})
Churned: ${lc.churned} (${pct(lc.churned, s.total_customers)})
Ghost: ${lc.ghost} (${pct(lc.ghost, s.total_customers)})

=== USAGE TREND ===
เพิ่มขึ้น: ${t.increasing} | คงที่: ${t.stable} | ลดลง: ${t.declining} | ไม่ใช้งาน: ${t.no_usage}

=== CHURN RISK (เฉพาะกลุ่มที่ประเมินได้) ===
ประเมินได้ (eligible): ${s.churn.eligible}
low: ${r.low} | medium: ${r.medium} | high: ${r.high} | critical: ${r.critical}
high+critical รวม: ${s.churn.high_plus_critical} (${pct(s.churn.high_plus_critical, s.churn.eligible)} ของ eligible)

=== REVENUE EXPOSURE ===
Revenue at risk (active paid, 6 เดือน): ฿${s.revenue.expected_at_risk.toLocaleString()}
Exposure กลุ่มเสี่ยงสูง (CLV ของ high+critical): ฿${s.revenue.high_risk_exposure.toLocaleString()}

=== NOTABLE COHORTS (value × risk, เรียงตาม revenue at risk) ===
${cohorts}

=== CREDIT ===
ความต้องการเครดิต 30 วัน (คาดการณ์): ${s.credit.demand_30d.toLocaleString()}
urgency — critical: ${u.critical} | warning: ${u.warning} | monitor: ${u.monitor} | stable: ${u.stable}
ใกล้ต้องเติมภายใน 7 วัน: ${s.credit.topup_due_7d}
</data>`;
}

function toResponse(runId: string, cache: InsightCache | null): RunInsight {
  if (!cache) {
    return { run_id: runId, ai_status: "not_requested", ai_summary: null, ai_model: null, ai_generated_at: null };
  }
  return {
    run_id: runId,
    ai_status: "completed",
    ai_summary: cache.summary,
    ai_model: cache.model,
    ai_generated_at: cache.generated_at,
  };
}

/** Read the cached base summary (no generation). */
export async function getRunInsight(runId: string): Promise<RunInsight> {
  const [row] = await db
    .select({ cache: mlPredictionRuns.cohortInsightJson })
    .from(mlPredictionRuns)
    .where(eq(mlPredictionRuns.id, runId))
    .limit(1);
  return toResponse(runId, (row?.cache as InsightCache | null) ?? null);
}

/** Generate (or regenerate with force) the base summary and cache it on the run. */
export async function createRunInsight(
  runId: string,
  force: boolean
): Promise<RunInsight | ServiceError> {
  const [row] = await db
    .select({ cache: mlPredictionRuns.cohortInsightJson })
    .from(mlPredictionRuns)
    .where(eq(mlPredictionRuns.id, runId))
    .limit(1);
  const existing = (row?.cache as InsightCache | null) ?? null;
  if (existing?.summary && !force) {
    return { status: 409, body: { message: "Run insight already exists", code: "insight_already_exists" } };
  }

  if (!isLLMConfigured()) {
    return {
      status: 503,
      body: { message: "กรุณาตั้งค่า LLM_API_KEY (หรือ OLLAMA_API_KEY) ใน .env ก่อนใช้ Gen AI" },
    };
  }

  try {
    const signals = await buildRunInsightSignals(runId);
    const llmConfig = getLLMConfig();
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: formatSignals(signals) },
    ];
    const summary = (await complete(messages, { config: llmConfig, temperature: 0.2 })).trim();
    if (!summary) throw new Error("LLM returned an empty summary");

    const cache: InsightCache = {
      status: "completed",
      summary,
      model: llmConfig.model,
      generated_at: new Date().toISOString(),
    };
    await db
      .update(mlPredictionRuns)
      .set({ cohortInsightJson: cache })
      .where(eq(mlPredictionRuns.id, runId));

    return toResponse(runId, cache);
  } catch (e) {
    return { status: 500, body: { message: (e as Error).message || "Failed to generate run insight" } };
  }
}
