"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { INTRO_ASSETS } from "@/lib/login-brand-colors";
import {
  LayoutDashboard, Users, Database,
  Activity, MessageSquareMore,
} from "lucide-react";
import UserNavProfile from "./UserNavProfile";

type Item = { href: string; label: string; icon: any };

const PRIMARY_GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Operate",
    items: [
      { href: "/",          label: "Dashboard", icon: LayoutDashboard },
      { href: "/customers", label: "Customers",      icon: Users },
    ],
  },
  {
    title: "Assistant",
    items: [
      { href: "/ai-chat", label: "AI Assistant", icon: MessageSquareMore },
    ],
  },
];

// Footer nav: [LEGACY] /runs = predict upload · /training = [NEW] train raw import + [LEGACY] model train
const FOOTER_GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Prediction",
    items: [
      { href: "/runs", label: "Prediction Runs", icon: Database },       // [LEGACY] predict raw_*
      { href: "/training", label: "Model Training", icon: Activity },   // [NEW] train raw + [LEGACY] train models
    ],
  },
  {
    title: "Models",
    items: [
      { href: "/model-performance", label: "Model Metrics", icon: Activity },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="w-[248px] shrink-0 bg-white border-r border-gray-200 flex flex-col">
      {/* Brand */}
      <div
        className="px-5 pt-5 pb-4 border-b border-gray-200"
        style={{
          backgroundImage: [
            "radial-gradient(rgba(7, 29, 126, 0.42) 0%, transparent 42%)",
            "url(/assets/intro/about_bg.webp)",
            "linear-gradient(140deg, #1d1f2a -10%, #006bff 58%, #1893f0 74%, #ffa400 88%, #fc4c02 96%)",
          ].join(", "),
          backgroundRepeat: "no-repeat, no-repeat, no-repeat",
          backgroundSize: "150% 130%, cover, 100% 100%",
          backgroundPosition: "center, left 58% top 0, center",
        }}
      >
        <img
          src={INTRO_ASSETS.logo}
          alt="1Moby"
          className="block h-8 w-auto"
          style={{ filter: "brightness(0) invert(1)" }}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {PRIMARY_GROUPS.map(g => (
          <div key={g.title} className="mb-4">
            <div className="px-5 mb-2 text-[11px] font-semibold tracking-[.16em] text-[color:var(--ink-5)] uppercase">
              {g.title}
            </div>
            <ul className="px-3 space-y-1">
              {g.items.map(it => {
                const Icon = it.icon;
                const active = isActive(it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={`group flex min-h-[44px] items-center gap-3 px-4 py-2.5 rounded-xl text-[15px] transition-colors
                        ${active
                          ? "bg-[color:var(--moby-50)] text-[color:var(--moby-600)] font-medium"
                          : "text-[color:var(--ink-3)] hover:bg-gray-50 hover:text-[color:var(--ink-1)]"}`}
                    >
                      <Icon size={17} strokeWidth={active ? 2.2 : 1.9}
                        className={active ? "text-[color:var(--moby-600)]" : "text-[color:var(--ink-4)]"} />
                      <span>{it.label}</span>
                      {it.href === "/ai-chat" && !active && (
                        <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide
                          bg-gradient-to-r from-[color:var(--moby-600)] to-[color:var(--moby-800)] text-white">
                          AI
                        </span>
                      )}
                      {active && <span className="ml-auto w-1.5 h-5 rounded-full bg-[color:var(--moby-600)]" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="py-3">
        {FOOTER_GROUPS.map(g => (
          <div key={g.title} className="mb-4 last:mb-0">
            <div className="px-5 mb-2 text-[11px] font-semibold tracking-[.16em] text-[color:var(--ink-5)] uppercase">
              {g.title}
            </div>
            <ul className="px-3 space-y-1">
              {g.items.map(it => {
                const Icon = it.icon;
                const active = isActive(it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={`group flex min-h-[44px] items-center gap-3 px-4 py-2.5 rounded-xl text-[15px] transition-colors
                        ${active
                          ? "bg-[color:var(--moby-50)] text-[color:var(--moby-600)] font-medium"
                          : "text-[color:var(--ink-3)] hover:bg-gray-50 hover:text-[color:var(--ink-1)]"}`}
                    >
                      <Icon size={17} strokeWidth={active ? 2.2 : 1.9}
                        className={active ? "text-[color:var(--moby-600)]" : "text-[color:var(--ink-4)]"} />
                      <span>{it.label}</span>
                      {active && <span className="ml-auto w-1.5 h-5 rounded-full bg-[color:var(--moby-600)]" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <UserNavProfile />
    </aside>
  );
}
