"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const nav = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/customers",
    label: "ลูกค้า",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/top-risk",
    label: "Top Risk",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    href: "/predict",
    label: "Live Predict",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" />
      </svg>
    ),
  },
  {
    href: "/model",
    label: "Model Info",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <circle cx="12" cy="5" r="3" /><circle cx="5" cy="19" r="3" /><circle cx="19" cy="19" r="3" />
        <line x1="12" y1="8" x2="12" y2="14" /><line x1="12" y1="14" x2="5" y2="16" />
        <line x1="12" y1="14" x2="19" y2="16" />
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "AI Assistant",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside
      className="hidden h-screen w-[260px] shrink-0 flex-col overflow-y-auto lg:flex"
      style={{ background: "linear-gradient(180deg, #0B1937 0%, #0E2155 100%)" }}
    >
      {/* Logo */}
      <div className="px-7 py-8 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-3 mb-5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white text-sm font-bold select-none"
            style={{ background: "linear-gradient(135deg, #1461F0, #38BDF8)" }}
          >
            CI
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.38em] text-sky-400/70">One move</p>
            <h1 className="text-base font-semibold leading-tight text-white">Churn Insight</h1>
          </div>
        </div>
        <p className="text-xs leading-5 text-slate-400">
          Retention intelligence &amp; customer risk command center.
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        <p
          className="px-3 mb-3 text-[9px] font-semibold uppercase tracking-[0.42em]"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          Navigation
        </p>
        {nav.map((item) => {
          const active = path === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "text-white"
                  : "text-slate-400 hover:text-white"
              )}
              style={
                active
                  ? { background: "linear-gradient(135deg, rgba(20,97,240,0.55), rgba(56,189,248,0.18))", boxShadow: "inset 0 0 0 1px rgba(56,189,248,0.25)" }
                  : {}
              }
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "";
              }}
            >
              <span
                className={clsx(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  active ? "text-sky-300" : "text-slate-500 group-hover:text-slate-300"
                )}
              >
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {active && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#38BDF8" }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 pb-6">
        <div
          className="rounded-xl p-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <p className="text-[9px] font-semibold uppercase tracking-[0.38em] text-slate-500">Model Stack</p>
          <p className="mt-2 text-xs font-semibold text-white">Random Forest + Keras</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">Realtime churn scoring with dual-model ensemble pipeline.</p>
        </div>
      </div>
    </aside>
  );
}

