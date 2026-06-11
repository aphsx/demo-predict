import type { Metadata } from "next";
import { ModelPerformanceView } from "@/features/model-performance/ModelPerformanceView";

export const metadata: Metadata = { title: "Model Accuracy · 1Moby Intelligence" };

export default function ModelPerformancePage() {
  return <ModelPerformanceView />;
}
