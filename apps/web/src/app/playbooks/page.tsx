import type { Metadata } from "next";
import { PlaybooksView } from "@/features/playbooks/PlaybooksView";

export const metadata: Metadata = { title: "Action Queue · 1Moby Intelligence" };

export default function PlaybooksPage() {
  // Queue data is not wired to the API yet — lanes render their skeleton state.
  return <PlaybooksView data={{}} />;
}
