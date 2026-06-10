import type { Metadata } from "next";
import { TrainingView } from "@/features/training/TrainingView";

export const metadata: Metadata = { title: "Training Data · 1Moby Intelligence" };

export default function TrainingPage() {
  return <TrainingView />;
}
