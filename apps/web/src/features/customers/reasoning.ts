/**
 * Single ordered behaviour layer for a customer.
 *
 * The UI shows two surfaces, in fixed precedence:
 *   1. drivers     — model (SHAP) factors behind the churn probability
 *   2. narrative   — GenAI behaviour overview (how the customer uses the
 *                    product + forward-looking risk context, not actions)
 *
 * There is intentionally NO rule-based text headline: priority is expressed as a
 * number (priority_score). Any human-readable narrative comes from the AI
 * overview, grounded in the numeric model outputs and SHAP factors.
 */
import type { ChurnFactor } from "@/lib/ml-api";

export type ReasonAiFields = {
  ai_status: "not_requested" | "pending" | "completed" | "failed";
  ai_explanation: string | null;
};

export type ReasonInput = ReasonAiFields & {
  churn_factors?: ChurnFactor[] | null;
};

export type ReasonDriver = {
  label: string;
  direction: "up" | "down";
  directionLabel: string;
  valueText: string;
};

export type ReasonNarrative = {
  kind: "ready" | "pending" | "failed" | "empty";
  text: string;
};

export type ReasoningLayer = {
  drivers: ReasonDriver[];
  narrative: ReasonNarrative;
};

/** Human-readable Thai labels for known model feature codes. */
const FEATURE_LABELS: Record<string, string> = {
  days_since_last_activity: "จำนวนวันที่ไม่มีการใช้งาน",
  days_since_last_send: "จำนวนวันที่ไม่ส่งข้อความ",
  days_since_last_payment: "จำนวนวันที่ไม่เติมเครดิต",
  usage_total_180d: "ปริมาณการใช้งานรวม 180 วัน",
  usage_total_90d: "ปริมาณการใช้งานรวม 90 วัน",
  usage_trend_slope: "แนวโน้มการใช้งาน",
  credit_balance_proxy: "เครดิตคงเหลือโดยประมาณ",
  credit_runway_months: "เครดิตพอใช้ได้อีก (เดือน)",
  credit_added_180d: "เครดิตที่เติมรวม 180 วัน",
  n_purchases: "จำนวนครั้งที่ชำระเงิน",
  total_revenue: "รายได้รวม",
  avg_transaction_value: "มูลค่าเฉลี่ยต่อครั้ง",
  payment_amount_cv: "ความผันผวนของยอดเติมเครดิต",
  channel_hhi: "ความกระจุกตัวของช่องทาง (SMS/Email)",
  multichannel_flag: "ใช้หลายช่องทาง (SMS+Email)",
  customer_age_days: "อายุการเป็นลูกค้า (วัน)",
  recency_days: "ระยะเวลาตั้งแต่ใช้งานล่าสุด",
  frequency: "ความถี่การใช้งาน",
  monetary: "มูลค่าการใช้จ่าย",
  tenure_months: "อายุบัญชี (เดือน)",
};

/** Fallback: snake_case → spaced, capitalised words. */
function humanizeFeature(feature: string): string {
  return (
    FEATURE_LABELS[feature] ??
    feature
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim()
  );
}

function formatFactorValue(value: number | string): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    const abs = Math.abs(value);
    if (abs !== 0 && abs < 1) return value.toFixed(2);
    return Math.round(value).toLocaleString("th-TH");
  }
  return String(value);
}

function narrativeFor(fields: ReasonAiFields): ReasonNarrative {
  const saved = fields.ai_explanation?.trim();
  if (saved) return { kind: "ready", text: saved };
  if (fields.ai_status === "pending") return { kind: "pending", text: "กำลังสร้างคำอธิบายจาก AI…" };
  if (fields.ai_status === "failed") return { kind: "failed", text: "สร้างคำอธิบายจาก AI ไม่สำเร็จ" };
  return { kind: "empty", text: "ยังไม่มีคำอธิบายจาก AI" };
}

/** Compose model drivers + AI narrative into one ordered reasoning layer. */
export function composeReasoning(input: ReasonInput): ReasoningLayer {
  const drivers: ReasonDriver[] = (input.churn_factors ?? [])
    .slice(0, 5)
    .map((factor: ChurnFactor) => ({
      label: humanizeFeature(factor.feature),
      direction: factor.direction,
      directionLabel: factor.direction === "up" ? "เพิ่มความเสี่ยง" : "ลดความเสี่ยง",
      valueText: formatFactorValue(factor.value),
    }));

  return { drivers, narrative: narrativeFor(input) };
}
