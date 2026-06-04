"use client";
import { ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import AIChatWidget from "./AIChatWidget";
import { MobyIntroSplash } from "./MobyIntroSplash";
import { GlobalStatusDialogHost } from "./GlobalStatusDialogHost";

const BARE_ROUTES = ["/login"];

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (bare) {
    return (
      <>
        <MobyIntroSplash />
        {children}
        <GlobalStatusDialogHost />
      </>
    );
  }

  const hideWidget = pathname.startsWith("/ai-chat");

  return (
    <>
      <MobyIntroSplash />
      <GlobalStatusDialogHost />
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Suspense fallback={<div className="h-[60px] bg-white border-b border-[color:var(--line)]" />}>
            <Topbar />
          </Suspense>
          <main className="flex-1 overflow-y-auto">
            <Suspense fallback={<div className="p-8 text-[color:var(--ink-5)]">Loading…</div>}>
              {children}
            </Suspense>
          </main>
        </div>
        {!hideWidget && <AIChatWidget />}
      </div>
    </>
  );
}
