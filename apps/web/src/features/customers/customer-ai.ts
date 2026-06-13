import type { PredictionOutput } from "@/lib/mlApi";

type AiFields = Pick<PredictionOutput, "ai_status" | "ai_explanation">;

export function customerAiExplanationText({ ai_status, ai_explanation }: AiFields): string {
  const saved = ai_explanation?.trim();
  if (saved) return saved;

  if (ai_status === "pending") return "กำลังสร้างคำอธิบายจาก AI…";
  if (ai_status === "failed") return "สร้างคำอธิบายจาก AI ไม่สำเร็จ";
  return "ยังไม่มีคำอธิบายจาก AI";
}

export function isCustomerAiGenerating(
  { ai_status }: AiFields,
  inFlight: boolean
): boolean {
  return inFlight || ai_status === "pending";
}

export function isCustomerAiGenerated({ ai_status, ai_explanation }: AiFields): boolean {
  return ai_status === "completed" && Boolean(ai_explanation?.trim());
}

export function shouldConfirmAiOverwrite({ ai_status, ai_explanation }: AiFields): boolean {
  return isCustomerAiGenerated({ ai_status, ai_explanation });
}
