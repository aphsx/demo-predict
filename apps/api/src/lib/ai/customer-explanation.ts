/**
 * Customer AI Explanation — complete rewrite.
 *
 * The old approach dumped raw JSON into a minimal prompt → generic, low-quality output.
 * This version uses a proper senior-analyst system prompt with structured sections,
 * explicit reasoning instructions, and calibrated temperature.
 *
 * Output structure (Markdown, in Thai):
 *   ## สรุป (Executive Summary)
 *   ## สัญญาณเสี่ยง (Risk Signals)
 *   ## ปัจจัยขับเคลื่อน (Key Drivers)
 *   ## ข้อสังเกตเพิ่มเติม (Additional Notes — if data conflicts detected)
 */

import type { CustomerAiContext } from "./customer-ai-context";
import { complete, stream, type ChatMessage } from "./llm-client";
import { getLLMConfig, isLLMConfigured } from "./llm-config";
import { renderGuardrails } from "./safety";

export type CustomerAiExplanationResult = {
  explanation: string;
  model: string;
};

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `คุณคือนักวิเคราะห์ข้อมูลลูกค้าอาวุโสของบริษัท 1Moby (B2B SaaS ด้านการส่ง SMS/Email)
มีประสบการณ์วิเคราะห์พฤติกรรมลูกค้า, churn prediction, และ CLV มากกว่า 10 ปี

งานของคุณ: วิเคราะห์ข้อมูลลูกค้า 1 รายที่ส่งให้และเขียนรายงานสั้น 4 ส่วน ในภาษาไทย

กฎสำคัญ:
${renderGuardrails()}
- อ้างอิงเฉพาะข้อมูลในส่วน <data> เท่านั้น
- ถ้า customer_dataset และ ml_output ขัดแย้งกัน ให้ระบุว่าขัดแย้งตรงไหนในส่วน "ข้อสังเกตเพิ่มเติม"
- อย่าแนะนำข้อความหรือวิธีติดต่อลูกค้าโดยตรง

รูปแบบ output (Markdown ภาษาไทย — ไม่ต้องเขียน label ภาษาอังกฤษ):

## สรุป
[2-3 ประโยค: สถานะปัจจุบัน, ระดับความเสี่ยง, ภาพรวมพฤติกรรม]

## สัญญาณเสี่ยง
- [รายการปัจจัยเสี่ยงที่พบจากข้อมูล — อ้างอิงตัวเลขจริงเสมอ]

## ปัจจัยขับเคลื่อน
- [รายการปัจจัยหลักที่อธิบาย churn probability / lifecycle stage ที่โมเดลให้]

## ข้อสังเกตเพิ่มเติม
[เฉพาะเมื่อพบความขัดแย้งระหว่าง dataset กับ ml_output หรือข้อมูลน่าสนใจอื่น ถ้าไม่มีให้เขียน "ไม่มี"]`;

// ── Context formatter ──────────────────────────────────────────────────────────

function formatContext(ctx: CustomerAiContext): string {
  const { run, acc_id, customer_dataset, ml_output } = ctx;
  const { profile, usage_monthly, payments } = customer_dataset;

  // Format usage summary (last 6 months most recent first)
  const usageSummary = usage_monthly
    .slice(-6)
    .reverse()
    .map((u) => `  ${u.year}-${String(u.month).padStart(2, "0")}: ${u.usage} units (${u.channel})`)
    .join("\n");

  const paymentSummary = payments
    .slice(-5)
    .reverse()
    .map((p) => `  ${p.payment_date}: +${p.credit_add} credits (฿${p.amount})`)
    .join("\n");

  return `<data>
Run: ${run.name} | Cutoff: ${run.cutoff_date} | Acc ID: ${acc_id}

=== CUSTOMER PROFILE ===
SMS status: ${profile?.status_sms ?? "N/A"} | Email status: ${profile?.status_email ?? "N/A"}
SMS credits: ${profile?.credit_sms ?? "N/A"} | Email credits: ${profile?.credit_email ?? "N/A"}
SMS expire: ${profile?.expire_sms ?? "N/A"} | Email expire: ${profile?.expire_email ?? "N/A"}
Join date: ${profile?.join_date ?? "N/A"}
Last access: ${profile?.last_access ?? "N/A"} | Last send: ${profile?.last_send ?? "N/A"}

=== USAGE (last 6 months, newest first) ===
${usageSummary || "  No usage data"}

=== PAYMENT HISTORY (last 5) ===
${paymentSummary || "  No payment data"}

=== ML MODEL OUTPUT ===
Lifecycle: ${ml_output.lifecycle_stage ?? "N/A"} / ${ml_output.sub_stage ?? "N/A"}
Churn probability: ${ml_output.churn_probability != null ? (ml_output.churn_probability * 100).toFixed(1) + "%" : "N/A"}
Churn risk level: ${ml_output.churn_risk_level ?? "N/A"}
Days since last activity: ${ml_output.days_since_last_activity ?? "N/A"}
Usage trend: ${ml_output.usage_trend ?? "N/A"}
Priority score: ${ml_output.priority_score ?? "N/A"}
Priority reason: ${ml_output.priority_reason ?? "N/A"}
Revenue at risk: ${ml_output.revenue_at_risk != null ? "฿" + ml_output.revenue_at_risk.toLocaleString() : "N/A"}
Predicted CLV 6m: ${ml_output.predicted_clv_6m != null ? "฿" + ml_output.predicted_clv_6m.toLocaleString() : "N/A"}
P(alive): ${ml_output.p_alive != null ? (ml_output.p_alive * 100).toFixed(1) + "%" : "N/A"}
Churn factors: ${ml_output.churn_factors_json ? JSON.stringify(ml_output.churn_factors_json) : "N/A"}
</data>`;
}

// ── Main function ──────────────────────────────────────────────────────────────

export async function generateCustomerAiExplanation(
  context: CustomerAiContext
): Promise<CustomerAiExplanationResult> {
  if (!isLLMConfigured()) {
    throw new Error("กรุณาตั้งค่า LLM_API_KEY (หรือ OLLAMA_API_KEY) ใน .env ก่อนใช้ Gen AI");
  }

  const llmConfig = getLLMConfig();

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: formatContext(context) },
  ];

  const text = (
    await complete(messages, {
      config: llmConfig,
      temperature: 0.2, // low temp = consistent, factual analysis
    })
  ).trim();

  if (!text) throw new Error("LLM returned an empty explanation");

  return { explanation: text, model: llmConfig.model };
}

/** Streaming variant — yields tokens, useful for real-time display. */
export async function* streamCustomerAiExplanation(
  context: CustomerAiContext
): AsyncGenerator<string> {
  if (!isLLMConfigured()) {
    throw new Error("กรุณาตั้งค่า LLM_API_KEY (หรือ OLLAMA_API_KEY) ใน .env ก่อนใช้ Gen AI");
  }

  const llmConfig = getLLMConfig();

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: formatContext(context) },
  ];

  yield* stream(messages, { config: llmConfig, temperature: 0.2 });
}
