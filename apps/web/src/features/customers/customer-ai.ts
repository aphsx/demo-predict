import type { PredictionOutput } from "@/lib/mlApi";

type AiFields = Pick<PredictionOutput, "ai_status" | "ai_explanation">;

// Narrative text (pending/failed/empty/ready) now lives in ./reasoning (composeReasoning).

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
