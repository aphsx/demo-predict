import type { Metadata } from "next";
import { ProfileView } from "@/features/profile/profile-view";

export const metadata: Metadata = { title: "My Account · 1Moby Intelligence" };

export default function ProfilePage() {
  return <ProfileView />;
}
