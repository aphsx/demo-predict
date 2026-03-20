"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Users, PlayCircle, Home } from "lucide-react";
import clsx from "clsx";

const nav = [
  { href: "/",           label: "ภาพรวม",         icon: Home },
  { href: "/runs",       label: "จัดการรัน",        icon: PlayCircle },
  { href: "/customers",  label: "รายชื่อลูกค้า",    icon: Users },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-56 min-h-screen flex flex-col"
           style={{ background: "var(--moby-blue)" }}>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/20">
        <div className="flex items-center gap-2">
          <BarChart2 className="text-white" size={22} />
          <span className="text-white font-semibold text-lg">1Moby</span>
        </div>
        <p className="text-blue-200 text-xs mt-1">Analytics Dashboard</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== "/" && path.startsWith(href));
          return (
            <Link key={href} href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                active
                  ? "bg-white/20 text-white font-medium"
                  : "text-blue-100 hover:bg-white/10 hover:text-white"
              )}>
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-3 text-blue-300 text-xs border-t border-white/20">
        v3.0 — Predictive Analytics
      </div>
    </aside>
  );
}
