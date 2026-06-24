/**
 * Customer AI Explanation.
 *
 * Produces a short, grounded BEHAVIOUR overview (Markdown, Thai) for a single
 * customer, from three sources: the raw dataset, deterministic pre-computed
 * signals (customer-ai-context.computeSignals), and the ML model output
 * (churn / lifecycle / CLV / SHAP factors).
 *
 * The audience wants to UNDERSTAND the customer's behaviour, not be told whom
 * to contact — there is intentionally no action/recommendation section
 * (OUTPUT-CONTRACT §5.2 removed the action workflow). Predictions appear only
 * as forward-looking context grounded in the observed numbers.
 *
 * Output sections:
 *   ## ภาพรวมพฤติกรรม    — how the customer uses the product, in 2–3 sentences
 *   ## การใช้งาน          — channel mix + monthly volume + trend, citing numbers
 *   ## การชำระเงิน        — payment cadence / amounts / recency, citing numbers
 *   ## แนวโน้มและความเสี่ยง — forward look: churn / p_alive / CLV / credit, with
 *                            the SHAP factors translated to plain language
 *   ## ข้อสังเกต          — only when dataset and model output conflict
 */

import type { CustomerAiContext, CustomerAiSignals } from "./customer-ai-context";
import { complete, type ChatMessage } from "./llm-client";
import { getLLMConfig, isLLMConfigured } from "./llm-config";
import { renderGuardrails } from "./safety";

export type CustomerAiExplanationResult = {
  explanation: string;
  model: string;
};

const SYSTEM_PROMPT = `คุณคือนักวิเคราะห์ข้อมูลลูกค้าอาวุโสของบริษัท 1Moby (B2B SaaS ด้านการส่ง SMS/Email)
มีประสบการณ์วิเคราะห์พฤติกรรมลูกค้า, churn prediction, และ CLV มากกว่า 10 ปี

งานของคุณ: อธิบาย "พฤติกรรมของลูกค้า 1 ราย" เป็นภาษาไทยให้ทีมภายในเข้าใจว่าลูกค้าคนนี้
ใช้งานอย่างไรและเปลี่ยนแปลงไปอย่างไร ตามรูปแบบด้านล่าง

กฎสำคัญ:
${renderGuardrails()}
- เป้าหมายคือทำให้ "เข้าใจพฤติกรรมลูกค้า" ไม่ใช่บอกให้ไปติดต่อหรือทำอะไร — ห้ามเขียน
  คำแนะนำเชิงปฏิบัติ, ข้อความหาลูกค้า, หรือ next step ใด ๆ
- อ้างอิงเฉพาะข้อมูลในส่วน <data> เท่านั้น และอ้างตัวเลขจริงทุกครั้งที่กล่าวถึงพฤติกรรม
- ค่าทำนายจากโมเดล (churn / CLV / credit) ใช้เป็น "บริบทมองไปข้างหน้า" เท่านั้น และต้อง
  อ้างอิงตัวเลข/SHAP factors จริงเสมอ — ห้ามเดาเหตุผลที่ไม่มีในข้อมูล
- ถ้า customer_dataset / signals / ml_output ขัดแย้งกัน ให้ระบุไว้ในส่วน "ข้อสังเกต"
- กระชับ ตรงประเด็น ไม่ต้องเขียน label ภาษาอังกฤษ

รูปแบบ output (Markdown ภาษาไทย):

## ภาพรวมพฤติกรรม
[2-3 ประโยค: ลูกค้าใช้งานอย่างไร, ใช้ channel ใดเป็นหลัก, ปริมาณมาก/น้อย, แนวโน้มล่าสุด]

## การใช้งาน
- [สัดส่วน SMS/Email, ปริมาณรายเดือน, แนวโน้มเพิ่ม/ลด — อ้างอิงตัวเลขจริงเสมอ]

## การชำระเงิน
- [ความถี่การเติมเครดิต, ยอดชำระ, ครั้งล่าสุดก่อน cutoff — อ้างอิงตัวเลขจริงเสมอ]

## แนวโน้มและความเสี่ยง
- [churn probability / p_alive / CLV / credit ที่โมเดลให้ พร้อมแปล churn factors เป็นภาษาคน
  เช่น "ไม่มีการใช้งาน 75 วัน (ดันความเสี่ยงขึ้น)"]

## ข้อสังเกต
[เฉพาะเมื่อพบความขัดแย้งหรือความผิดปกติในข้อมูล ถ้าไม่มีให้เขียน "ไม่มี"]`;

function formatChurnFactors(factors: CustomerAiContext["ml_output"]["churn_factors"]): string {
  if (!factors || factors.length === 0) return "N/A";
  return factors
    .slice(0, 5)
    .map((f) => `${f.feature} (${f.direction === "up" ? "เพิ่มความเสี่ยง" : "ลดความเสี่ยง"}, ค่า=${f.value})`)
    .join("; ");
}

function formatSignals(s: CustomerAiSignals): string {
  const change =
    s.usage_change_pct == null ? "N/A" : `${s.usage_change_pct > 0 ? "+" : ""}${s.usage_change_pct}%`;
  return [
    `เดือนที่มีการใช้งาน: ${s.months_with_usage}`,
    `ใช้งาน 3 เดือนล่าสุด: ${s.recent_3m_usage.toLocaleString()} (เทียบ 3 เดือนก่อนหน้า: ${s.prior_3m_usage.toLocaleString()}, เปลี่ยนแปลง ${change})`,
    `ชำระเงินล่าสุดก่อน cutoff: ${s.last_payment_days_before_cutoff ?? "N/A"} วัน`,
    `จำนวนครั้งที่ชำระ: ${s.n_payments} | ยอดชำระรวม: ฿${s.total_paid.toLocaleString()}`,
  ].join("\n");
}

function formatContext(ctx: CustomerAiContext): string {
  const { run, acc_id, customer_dataset, signals, ml_output } = ctx;
  const { profile, usage_monthly, payments } = customer_dataset;

  const usageSummary = usage_monthly
    .slice(-12)
    .reverse()
    .map((u) => `  ${u.month}: รวม ${u.total} (SMS ${u.sms} / Email ${u.email})`)
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

=== COMPUTED SIGNALS ===
${formatSignals(signals)}

=== USAGE (last 12 months, newest first) ===
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
Revenue at risk: ${ml_output.revenue_at_risk != null ? "฿" + ml_output.revenue_at_risk.toLocaleString() : "N/A"}
Predicted CLV 6m: ${ml_output.predicted_clv_6m != null ? "฿" + ml_output.predicted_clv_6m.toLocaleString() : "N/A"}
P(alive): ${ml_output.p_alive != null ? (ml_output.p_alive * 100).toFixed(1) + "%" : "N/A"}
Churn factors: ${formatChurnFactors(ml_output.churn_factors)}
</data>`;
}

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
    await complete(messages, { config: llmConfig, temperature: 0.2 })
  ).trim();

  if (!text) throw new Error("LLM returned an empty explanation");
  return { explanation: text, model: llmConfig.model };
}
