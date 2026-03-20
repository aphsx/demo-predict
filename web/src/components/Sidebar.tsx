"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/runs", label: "Runs", icon: "🔄" },
  { href: "/customers", label: "Customers", icon: "👥" },
  { href: "/model-performance", label: "Model Metrics", icon: "🎯" },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 bg-gray-900 text-white min-h-screen flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold text-blue-400">1Moby Analytics</h1>
        <p className="text-xs text-gray-400 mt-1">Customer Lifecycle V2</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {links.map((l) => {
          const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
          return (
            <Link key={l.href} href={l.href}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition
                ${active ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800"}`}>
              <span className="text-base">{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 text-xs text-gray-500 border-t border-gray-700">
        5 Models • Lifecycle Engine
      </div>
    </aside>
  );
}
