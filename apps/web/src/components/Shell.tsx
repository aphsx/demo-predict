"use client";
import { ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import AIChatWidget from "./AIChatWidget";
import { MobyIntroSplash } from "./MobyIntroSplash";
import { GlobalStatusDialogHost } from "./GlobalStatusDialogHost";

const BARE_ROUTES = ["/login"];

const EXACT_ROUTE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/ai-chat": "AI Assistant",
  "/customers": "Customers",
  "/runs": "Prediction runs",
  "/training": "Model Training",
  "/model-performance": "Model Metrics",
};

function getRouteTitle(pathname: string) {
  if (pathname.startsWith("/customers/")) return "Customer detail";
  return EXACT_ROUTE_TITLES[pathname];
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

  return (
    <>
      <MobyIntroSplash />
      <GlobalStatusDialogHost />
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center justify-between overflow-hidden border-b border-gray-200 bg-white px-8">
            {routeTitle ? (
              <div className="min-w-0">
                <h1 className="type-display truncate text-[20px] leading-tight">
                  {routeTitle}
                </h1>
              </div>
            ) : (
              <div />
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
