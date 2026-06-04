"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Calendar, ChevronDown, BellDot, LogOut } from "lucide-react";
import { fetchRuns, Run } from "@/lib/api";
import { useRunStore } from "@/lib/runStore";
import { useSession, signOut } from "@/lib/auth-client";

const TITLE_MAP: Record<string, { title: string; sub: string }> = {
  "/": { title: "Dashboard", sub: "ภาพรวมพอร์ตลูกค้าและสัญญาณเตือน real-time" },
  "/playbooks": { title: "Action Queue", sub: "งานที่ควรทำวันนี้ จัดอันดับด้วย Priority Score" },
  "/customers": { title: "Customers", sub: "ค้นหา · กรอง · เจาะลึกลูกค้ารายบุคคล" },
  "/alerts": { title: "Alerts", sub: "Anomaly · Drift · Threshold breach" },
  "/model-performance": { title: "Model Health", sub: "Quality · Calibration · Feature importance" },
  "/runs": { title: "Pipelines & Data", sub: "Ingest · Validate · Predict" },
  "/training": { title: "Model Training", sub: "Import training data · Train models" },
  "/ai-chat": { title: "AI Assistant", sub: "Ask anything about your customers and predictions" },
};

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const [runs, setRuns] = useState<Run[]>([]);
  const { runId, setRunId } = useRunStore();

  useEffect(() => {
    fetchRuns()
      .then((r: Run[]) => {
        const safeRuns = Array.isArray(r) ? r : [];
        setRuns(safeRuns);
        const fromUrl = sp.get("run");
        const doneWithData = safeRuns.find(
          (x) => x.status === "done" && (x.total_customers ?? 0) > 0
        );
        const initial =
          fromUrl || runId || doneWithData?.id || safeRuns.find((x) => x.status === "done")?.id || safeRuns[0]?.id || "";
        if (initial) setRunId(initial);
      })
      .catch(() => {
        setRuns([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const dyn = matchDynamicPath(pathname);
  const meta = TITLE_MAP[dyn] || { title: "1Moby", sub: "" };

  const safeRuns = Array.isArray(runs) ? runs : [];
  const activeRun = safeRuns.find(r => r.id === runId);

  return (
    <header className="h-[60px] shrink-0 bg-white/95 backdrop-blur border-b border-[color:var(--line)] flex items-center px-6 gap-4">
      {/* Title */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[15px] font-semibold text-[color:var(--ink-1)] truncate">{meta.title}</h1>
          <span className="text-[12px] text-[color:var(--ink-5)] truncate">{meta.sub}</span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div className="hidden md:flex items-center h-9 px-3 gap-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] w-[260px]">
        <Image src="/icons/search.svg" alt="" width={14} height={14} aria-hidden />
        <input
          placeholder="Search account id, segment…"
          className="bg-transparent outline-none text-[13px] flex-1 placeholder:text-[color:var(--ink-5)]"
          onKeyDown={e => {
            if (e.key === "Enter") {
              const v = (e.currentTarget.value || "").trim();
              if (v) router.push(`/customers?search=${encodeURIComponent(v)}&run=${runId}`);
            }
          }}
        />
        <kbd className="text-[10px] text-[color:var(--ink-5)] border border-[color:var(--line)] px-1.5 py-0.5 rounded">⌘K</kbd>
      </div>

      {/* Run selector */}
      <div className="relative">
        <select
          value={runId || ""}
          onChange={(e) => setRunId(e.target.value)}
          className="appearance-none h-9 pl-9 pr-9 rounded-lg border border-[color:var(--line)] bg-white text-[13px] text-[color:var(--ink-2)] hover:border-[color:var(--moby-200)] cursor-pointer min-w-[200px]"
        >
          {safeRuns.map(r => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.cutoff_date} {r.status !== "done" ? `(${r.status})` : ""}
            </option>
          ))}
          {safeRuns.length === 0 && <option value="">— ยังไม่มี run —</option>}
        </select>
        <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ink-4)] pointer-events-none" />
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--ink-4)] pointer-events-none" />
      </div>

      {/* Notifications */}
      <button
        onClick={() => router.push("/alerts")}
        className="relative h-9 w-9 grid place-items-center rounded-lg border border-[color:var(--line)] bg-white hover:bg-[color:var(--surface-2)]"
        title="Alerts"
      >
        <BellDot size={15} className="text-[color:var(--ink-3)]" />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[color:var(--danger)] pulse-soft" />
      </button>

      {/* Status */}
      <div className="hidden lg:flex items-center gap-2 h-9 px-3 rounded-lg border border-[color:var(--line)] bg-white">
        <span className={`w-1.5 h-1.5 rounded-full ${activeRun?.status === "done" ? "bg-[color:var(--ok)]" :
            activeRun?.status === "processing" ? "bg-[color:var(--info)] pulse-soft" :
              activeRun?.status === "failed" ? "bg-[color:var(--danger)]" : "bg-[color:var(--ink-5)]"
          }`} />
        <span className="text-[12px] text-[color:var(--ink-3)] capitalize">{activeRun?.status || "—"}</span>
      </div>

      <UserMenu />
    </header>
  );
}

function UserMenu() {
  const { data, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (isPending) {
    return <div className="w-9 h-9 rounded-full bg-[color:var(--surface-2)] animate-pulse" />;
  }
  if (!data?.user) return null;

  const user = data.user;
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-9 flex items-center gap-2 pl-1 pr-2 rounded-lg border border-[color:var(--line)] bg-white hover:bg-[color:var(--surface-2)]"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <span className="w-7 h-7 rounded-full bg-[color:var(--moby-600)] text-white text-[12px] font-semibold grid place-items-center">
            {initial}
          </span>
        )}
        <span className="hidden md:inline text-[12px] text-[color:var(--ink-2)] max-w-[120px] truncate">
          {user.name || user.email}
        </span>
        <ChevronDown size={12} className="text-[color:var(--ink-4)]" />
      </button>

      {open && (
        <div className="absolute right-0 top-[44px] w-[240px] rounded-lg border border-[color:var(--line)] bg-white shadow-lg overflow-hidden z-50">
          <div className="px-3 py-2.5 border-b border-[color:var(--line-2)]">
            <div className="text-[12.5px] font-medium text-[color:var(--ink-1)] truncate">{user.name || "—"}</div>
            <div className="text-[11px] text-[color:var(--ink-5)] truncate">{user.email}</div>
          </div>
          <button
            onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/login"; } } })}
            className="w-full px-3 py-2 flex items-center gap-2 text-[12.5px] text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)]"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function matchDynamicPath(pathname: string) {
  if (pathname.startsWith("/customers/")) return "/customers";
  return pathname;
}
