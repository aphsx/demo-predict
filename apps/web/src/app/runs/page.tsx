import type { Metadata } from "next";
import { RunsView } from "@/features/runs/RunsView";

export const metadata: Metadata = { title: "Runs · 1Moby Intelligence" };

export default function RunsPage() {
  return <RunsView />;
}
