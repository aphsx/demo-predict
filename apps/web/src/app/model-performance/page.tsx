import type { Metadata } from "next";
import { ModelPerformanceView } from "@/features/model-performance/ModelPerformanceView";
import { getModelMetrics } from "@/mocks/model-performance";

export const metadata: Metadata = { title: "Model Accuracy · 1Moby Intelligence" };

export default async function ModelPerformancePage() {
  const metrics = await getModelMetrics();
  return <ModelPerformanceView metrics={metrics} />;
}
