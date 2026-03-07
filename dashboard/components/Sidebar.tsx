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
    <aside className="w-[220px] shrink-0 flex flex-col bg-slate-900 border-r border-slate-800 min-h-screen">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-800">
        <p className="text-xs text-slate-500 uppercase tracking-widest">CRM</p>
        <h1 className="text-lg font-bold text-white leading-tight">Churn&nbsp;Predict</h1>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
              path === item.href
                ? "bg-brand-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-800">
        <p className="text-xs text-slate-600">Model: Random Forest</p>
        <p className="text-xs text-slate-600">H5: Keras Neural Net</p>
        <p className="text-xs text-slate-700 mt-1">© 2026 Demo</p>
      </div>
    </aside>
  );
}
