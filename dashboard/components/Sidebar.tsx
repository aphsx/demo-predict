"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const usersInputRef = useRef<HTMLInputElement>(null);
  const paymentsInputRef = useRef<HTMLInputElement>(null);
  const [importingType, setImportingType] = useState<"users" | "payments" | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>, expectedType: "users" | "payments") {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingType(expectedType);
    setImportMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("http://localhost:8000/api/import-csv", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (res.ok) {
        setImportMsg(`✓ ${json.message}`);
        if (json.predictions_ready) {
          setTimeout(() => router.refresh(), 800);
        }
      } else {
        setImportMsg(`✗ ${json.detail ?? "Error"}`);
      }
    } catch {
      setImportMsg("✗ เชื่อมต่อ API ไม่ได้");
    } finally {
      setImportingType(null);
      if (usersInputRef.current) usersInputRef.current.value = "";
      if (paymentsInputRef.current) paymentsInputRef.current.value = "";
    }
  }

  return (
    <aside
      className="hidden h-screen w-[260px] shrink-0 flex-col overflow-y-auto lg:flex bg-white border-r border-gray-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)]"
    >
      {/* Logo */}
      <div className="px-8 py-8 border-b border-gray-100">
        <div className="flex items-center mb-1">
          <h1 className="text-3xl font-black text-[#006bff] tracking-tight" style={{ fontFamily: "Arial, sans-serif" }}>
            1MOBY
          </h1>
        </div>
        <p className="text-[11px] text-gray-400 mt-2 font-medium uppercase tracking-wider">
          Technology &amp; Innovation
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-6 space-y-1.5">
        <p
          className="px-4 mb-4 text-[10px] font-bold uppercase tracking-wider text-gray-400"
        >
          Menu
        </p>
        {nav.map((item) => {
          const active = path === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "group flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200",
                active
                  ? "text-white bg-[#005AE2] shadow-[0_4px_12px_rgba(0,90,226,0.25)]"
                  : "text-gray-600 hover:text-[#005AE2] hover:bg-gray-50"
              )}
            >
              <span
                className={clsx(
                  "flex h-5 w-5 items-center justify-center transition-colors",
                  active ? "text-white flex-shrink-0" : "text-gray-400 flex-shrink-0 group-hover:text-[#005AE2]"
                )}
              >
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Sidebar Footer Extras */}
      <div className="px-6 pb-8 mt-auto flex flex-col gap-2 border-t border-gray-100 pt-6">
        {/* Import CSV — 2 files */}
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center">Import CSV</p>
        <input ref={usersInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, "users")} />
        <input ref={paymentsInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, "payments")} />
        <button
          onClick={() => usersInputRef.current?.click()}
          disabled={importingType !== null}
          className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-[#005AE2]/30 bg-[#005AE2]/5 px-3 py-2 text-[11px] font-bold text-[#005AE2] transition-all hover:bg-[#005AE2]/10 hover:border-[#005AE2]/50 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5 shrink-0">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {importingType === "users" ? "กำลัง Import…" : "Users CSV"}
        </button>
        <button
          onClick={() => paymentsInputRef.current?.click()}
          disabled={importingType !== null}
          className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-purple-300/50 bg-purple-50/50 px-3 py-2 text-[11px] font-bold text-purple-600 transition-all hover:bg-purple-100/50 hover:border-purple-400/50 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5 shrink-0">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {importingType === "payments" ? "กำลัง Import…" : "Payments CSV"}
        </button>
        {importMsg && (
          <p className={clsx("text-[10px] text-center font-medium px-1", importMsg.startsWith("✓") ? "text-green-600" : "text-red-500")}>
            {importMsg}
          </p>
        )}
        {/* Language selector */}
        <button className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-[12px] font-bold text-gray-500 transition-all hover:bg-gray-50 hover:border-gray-300 mt-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
            <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          TH
        </button>
      </div>
    </aside>
  );
}
