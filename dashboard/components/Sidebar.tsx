"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const nav = [
  { href: "/",             label: "Dashboard",  icon: "📊" },
  { href: "/customers",    label: "ลูกค้า",      icon: "👥" },
  { href: "/top-risk",     label: "Top Risk",    icon: "🔴" },
  { href: "/predict",      label: "Live Predict",icon: "🤖" },
  { href: "/model",        label: "Model Info",  icon: "🧠" },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside className="sticky top-0 hidden min-h-screen w-[280px] shrink-0 flex-col border-r border-white/10 bg-white/5 backdrop-blur-2xl lg:flex">
      {/* Logo */}
      <div className="border-b border-white/10 px-7 py-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.42em] text-cyan-200/70">One move</p>
        <h1 className="mt-3 text-2xl font-semibold leading-tight text-white">Churn Insight</h1>
        <p className="mt-2 max-w-[200px] text-sm leading-6 text-slate-300">
          Retention command center with a modern martech visual system.
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-2 px-4 py-6">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "group flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200",
              path === item.href
                ? "border-cyan-400/30 bg-cyan-400/10 text-white shadow-[0_0_40px_rgba(34,211,238,0.12)]"
                : "border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white"
            )}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-base transition-colors group-hover:bg-white/10">
              {item.icon}
            </span>
            <span className="flex-1">{item.label}</span>
            <span className="text-[10px] uppercase tracking-[0.28em] text-slate-500">
              {path === item.href ? "Live" : "Go"}
            </span>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 px-6 py-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Model stack</p>
          <p className="mt-2 text-sm font-medium text-white">Random Forest + Keras H5</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">Realtime scoring for churn risk, spend behavior, and inactivity signals.</p>
        </div>
      </div>
    </aside>
  );
}
