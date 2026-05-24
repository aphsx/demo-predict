"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { INTRO_ASSETS } from "@/lib/login-brand-colors";
import {
  LayoutDashboard, Users, ListChecks, Database,
  Activity, Bell, ShieldCheck, MessageSquareMore,
} from "lucide-react";

type Item = { href: string; label: string; icon: any };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Operate",
    items: [
      { href: "/",          label: "Dashboard", icon: LayoutDashboard },
      { href: "/playbooks", label: "Action Queue",   icon: ListChecks },
      { href: "/customers", label: "Customers",      icon: Users },
      { href: "/alerts",    label: "Alerts",         icon: Bell },
    ],
  },
  {
    title: "Analyze",
    items: [
      { href: "/model-performance", label: "Model Health", icon: Activity },
    ],
  },
  {
    title: "Configure",
    items: [
      { href: "/runs", label: "Pipelines & Data", icon: Database },
      { href: "/training", label: "Model Training", icon: Activity },
    ],
  },
  {
    title: "Assistant",
    items: [
      { href: "/ai-chat", label: "AI Assistant", icon: MessageSquareMore },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="w-[232px] shrink-0 bg-white border-r border-[color:var(--line)] flex flex-col">
      {/* Brand */}
      <div
        className="px-5 pt-5 pb-4 border-b border-[color:var(--line)]"
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
        {GROUPS.map(g => (
          <div key={g.title} className="mb-3">
            <div className="px-5 mb-1.5 text-[10px] font-semibold tracking-[.16em] text-[color:var(--ink-5)] uppercase">
              {g.title}
            </div>
            <ul className="px-2 space-y-0.5">
              {g.items.map(it => {
                const Icon = it.icon;
                const active = isActive(it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={`group flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors
                        ${active
                          ? "bg-[color:var(--moby-50)] text-[color:var(--moby-700)] font-medium"
                          : "text-[color:var(--ink-3)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--ink-1)]"}`}
                    >
                      <Icon size={15} strokeWidth={active ? 2.2 : 1.8}
                        className={active ? "text-[color:var(--moby-600)]" : "text-[color:var(--ink-4)]"} />
                      <span>{it.label}</span>
                      {it.href === "/ai-chat" && !active && (
                        <span className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide
                          bg-gradient-to-r from-[color:var(--moby-600)] to-[color:var(--moby-800)] text-white">
                          AI
                        </span>
                      )}
                      {active && <span className="ml-auto w-1 h-4 rounded-full bg-[color:var(--moby-600)]" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[color:var(--line)] flex items-center gap-2 text-[11.5px] text-[color:var(--ink-4)]">
        <ShieldCheck size={13} className="text-[color:var(--ok)]" />
        <span>5 models · point-in-time safe</span>
      </div>
    </aside>
  );
}
