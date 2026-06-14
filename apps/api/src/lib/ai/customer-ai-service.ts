import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { mlPredictionOutputs } from "../../db/schema";
import type { PredictionOutput } from "../ml-contract";
import { buildCustomerAiContext } from "./customer-ai-context";
import { generateCustomerAiExplanation } from "./customer-explanation";

type RunRow = {
  id: string;
  name: string;
  cutoffDate: string;
  predictSourceId: string;
};

export type CustomerAiExplanationResponse = {
  acc_id: number;
  ai_status: PredictionOutput["ai_status"];
  ai_explanation: string | null;
  ai_model: string;
  ai_generated_at: string;
};

type ServiceError = {
  status: number;
  body: { message: string; code?: string };
};

const outputWhere = (runId: string, accId: number) =>
  and(eq(mlPredictionOutputs.predictionRunId, runId), eq(mlPredictionOutputs.accId, accId));

export async function createCustomerAiExplanation(
  run: RunRow,
  accId: number,
  output: PredictionOutput,
  force: boolean
): Promise<CustomerAiExplanationResponse | ServiceError> {
  if (output.ai_status === "completed" && output.ai_explanation && !force) {
    return {
      status: 409,
      body: { message: "AI explanation already exists", code: "ai_already_exists" },
    };
  }

  await db.update(mlPredictionOutputs).set({ aiStatus: "pending" }).where(outputWhere(run.id, accId));

  try {
    const context = await buildCustomerAiContext(run, accId, output);
    const { explanation, model } = await generateCustomerAiExplanation(context);
    const generatedAt = new Date();

    const [updated] = await db
      .update(mlPredictionOutputs)
      .set({
        aiStatus: "completed",
        aiExplanation: explanation,
        aiModel: model,
        aiGeneratedAt: generatedAt,
      })
      .where(outputWhere(run.id, accId))
      .returning({
        accId: mlPredictionOutputs.accId,
        aiStatus: mlPredictionOutputs.aiStatus,
        aiExplanation: mlPredictionOutputs.aiExplanation,
      });

    return {
      acc_id: updated.accId,
      ai_status: updated.aiStatus as PredictionOutput["ai_status"],
      ai_explanation: updated.aiExplanation,
      ai_model: model,
      ai_generated_at: generatedAt.toISOString(),
    };
  } catch (e) {
    await db.update(mlPredictionOutputs).set({ aiStatus: "failed" }).where(outputWhere(run.id, accId));
    return {
      status: 500,
      body: { message: (e as Error).message || "Failed to generate AI explanation" },
    };
  }
}
