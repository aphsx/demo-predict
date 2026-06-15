"use client";
import { ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";
import AIChatWidget from "./ai-chat-widget";
import { MobyIntroSplash } from "./moby-intro-splash";
import { GlobalStatusDialogHost } from "./global-status-dialog-host";
import RunSelector from "./run-selector";
import { RunUrlSync } from "@/stores/run-url-sync";

const BARE_ROUTES = ["/login"];

const EXACT_ROUTE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/ai-chat": "AI Assistant",
  "/customers": "Customers",
  "/runs": "Prediction runs",
  "/training": "Model Training",
  "/model-performance": "Model Metrics",
  "/profile": "My Account",
};

function getRouteTitle(pathname: string) {
  if (pathname.startsWith("/customers/")) return "Customer detail";
  return EXACT_ROUTE_TITLES[pathname];
}

function shouldShowRunSelector(pathname: string) {
  return pathname === "/" || pathname === "/customers" || pathname.startsWith("/customers/");
}

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
  const routeTitle = getRouteTitle(pathname);
  const showRunSelector = shouldShowRunSelector(pathname);

  return (
    <>
      <MobyIntroSplash />
      <GlobalStatusDialogHost />
      {showRunSelector && (
        <Suspense fallback={null}>
          <RunUrlSync />
        </Suspense>
      )}
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center justify-between gap-4 overflow-hidden border-b border-gray-200 bg-white px-8">
            {routeTitle ? (
              <div className="min-w-0 flex-1">
                <h1 className="type-display truncate text-[20px] leading-tight">
                  {routeTitle}
                </h1>
              </div>
            ) : (
              <div className="min-w-0 flex-1" />
            )}
            {showRunSelector && (
              <div className="min-w-0 shrink-0">
                <RunSelector />
              </div>
            )}
          </header>
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
