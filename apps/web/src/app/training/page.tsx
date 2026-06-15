import type { Metadata } from "next";
import { TrainingView } from "@/features/training/training-view";

export const metadata: Metadata = { title: "Training Data · 1Moby Intelligence" };

export default function TrainingPage() {
  return <TrainingView />;
}
