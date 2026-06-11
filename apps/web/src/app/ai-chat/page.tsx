import type { Metadata } from "next";
import { AIChatView } from "@/features/ai-chat/AIChatView";

export const metadata: Metadata = { title: "Moby AI · 1Moby Intelligence" };

export default function AIChatPage() {
  return <AIChatView />;
}
