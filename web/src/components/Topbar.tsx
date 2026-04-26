"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Calendar, ChevronDown, BellDot } from "lucide-react";
import { fetchRuns, Run } from "@/lib/api";
import { useRunStore } from "@/lib/runStore";

const TITLE_MAP: Record<string, { title: string; sub: string }> = {
  "/":                   { title: "Command Center",   sub: "ภาพรวมพอร์ตลูกค้าและสัญญาณเตือน real-time" },
  "/playbooks":          { title: "Action Queue",     sub: "งานที่ควรทำวันนี้ จัดอันดับด้วย Priority Score" },
  "/customers":          { title: "Customers",        sub: "ค้นหา · กรอง · เจาะลึกลูกค้ารายบุคคล" },
  "/alerts":             { title: "Alerts",           sub: "Anomaly · Drift · Threshold breach" },
  "/model-performance":  { title: "Model Health",     sub: "Quality · Calibration · Feature importance" },
  "/runs":               { title: "Pipelines & Data", sub: "Ingest · Validate · Predict" },
};

export default function Topbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const sp       = useSearchParams();
  const [runs, setRuns]   = useState<Run[]>([]);
  const { runId, setRunId } = useRunStore();

  useEffect(() => {
    fetchRuns().then((r: Run[]) => {
      setRuns(r);
      const fromUrl = sp.get("run");
      const initial = fromUrl || (runId || r.find(x => x.status === "done")?.id || r[0]?.id || "");
      if (initial) setRunId(initial);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dyn = matchDynamicPath(pathname);
  const meta = TITLE_MAP[dyn] || { title: "1Moby", sub: "" };

  const activeRun = runs.find(r => r.id === runId);

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
        <Search size={14} className="text-[color:var(--ink-5)]" />
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
          value={runId}
          onChange={(e) => setRunId(e.target.value)}
          className="appearance-none h-9 pl-9 pr-9 rounded-lg border border-[color:var(--line)] bg-white text-[13px] text-[color:var(--ink-2)] hover:border-[color:var(--moby-200)] cursor-pointer min-w-[200px]"
        >
          {runs.map(r => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.cutoff_date} {r.status !== "done" ? `(${r.status})` : ""}
            </option>
          ))}
          {runs.length === 0 && <option value="">— ยังไม่มี run —</option>}
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
        <span className={`w-1.5 h-1.5 rounded-full ${
          activeRun?.status === "done" ? "bg-[color:var(--ok)]" :
          activeRun?.status === "processing" ? "bg-[color:var(--info)] pulse-soft" :
          activeRun?.status === "failed" ? "bg-[color:var(--danger)]" : "bg-[color:var(--ink-5)]"
        }`} />
        <span className="text-[12px] text-[color:var(--ink-3)] capitalize">{activeRun?.status || "—"}</span>
      </div>
    </header>
  );
}

function matchDynamicPath(pathname: string) {
  if (pathname.startsWith("/customers/")) return "/customers";
  return pathname;
}
