"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import CreateRunModal from "@/components/CreateRunModal";
import { setActiveRun } from "@/app/actions";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type Run = {
  id: number;
  name: string;
  status: "pending" | "done" | "error";
  users_uploaded: boolean;
  payments_uploaded: boolean;
  created_at: string;
  completed_at: string | null;
  customers_count?: number;
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function StatusBadge({ run }: { run: Run }) {
  if (run.status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-2.5 py-1 text-[11px] font-bold text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        พร้อมใช้
      </span>
    );
  }
  if (run.status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-2.5 py-1 text-[11px] font-bold text-red-600">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        เกิดข้อผิดพลาด
      </span>
    );
  }
  if (run.users_uploaded || run.payments_uploaded) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 border border-yellow-200 px-2.5 py-1 text-[11px] font-bold text-yellow-700">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
        กำลัง Import
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-2.5 py-1 text-[11px] font-bold text-gray-500">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      รอ Import
    </span>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-2.5 h-2.5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function RunCard({ run, isActive, onDelete }: { run: Run; isActive: boolean; onDelete: (id: number, e: React.MouseEvent) => void }) {
  const router = useRouter();
  const isClickable = run.status === "done";
  const isProcessing = run.status === "pending" && (run.users_uploaded || run.payments_uploaded);

  async function handleSelect() {
    if (!isClickable) return;
    await setActiveRun(run.id, run.name);
    router.push("/");
    router.refresh();
  }

  return (
    <div
      onClick={handleSelect}
      className={clsx(
        "p-5 bg-white rounded-[16px] border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all",
        isActive && "border-green-300 ring-1 ring-green-200",
        isClickable && "hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:border-[#005AE2]/30 cursor-pointer"
      )}
    >
      {/* ── Main row ── */}
      <div className="flex items-center gap-4">
        {/* Run number */}
        <div className={clsx(
          "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0",
          run.status === "done" ? "bg-[#005AE2]/10 text-[#005AE2]"
            : run.status === "error" ? "bg-red-50 text-red-400"
            : "bg-gray-100 text-gray-400"
        )}>
          #{run.id}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-900 text-sm truncate">{run.name}</p>
            <StatusBadge run={run} />
            {isActive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 border border-green-200 px-2.5 py-1 text-[11px] font-bold text-green-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                กำลังดูอยู่
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {run.customers_count != null && (
              <span className="text-xs text-gray-500 font-medium">
                {run.customers_count.toLocaleString()} คน
              </span>
            )}
            {run.customers_count != null && <span className="text-gray-300">·</span>}
            <span className="text-xs text-gray-400">{formatDate(run.created_at)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isClickable && (
            <div className="w-8 h-8 rounded-full bg-[#005AE2]/5 flex items-center justify-center text-[#005AE2]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          )}
          <button
            onClick={(e) => onDelete(run.id, e)}
            className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition-colors"
            title="ลบ Run"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M3 6h18M19 6l-1 14H6L5 6m5 0V4h4v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Progress (pending + at least one file uploaded) ── */}
      {isProcessing && (
        <div className="mt-4 space-y-3" onClick={(e) => e.stopPropagation()}>
          {/* Step indicators */}
          <div className="flex items-center">
            {/* Step: Users */}
            <div className={clsx(
              "flex items-center gap-1 text-[10px] font-bold",
              run.users_uploaded ? "text-green-600" : "text-gray-300"
            )}>
              <span className={clsx(
                "w-4 h-4 rounded-full flex items-center justify-center",
                run.users_uploaded ? "bg-green-100" : "border-2 border-gray-200"
              )}>
                {run.users_uploaded && <CheckIcon />}
              </span>
              Users
            </div>

            <div className={clsx("flex-1 h-px mx-2", run.users_uploaded ? "bg-blue-200" : "bg-gray-200")} />

            {/* Step: Payments */}
            <div className={clsx(
              "flex items-center gap-1 text-[10px] font-bold",
              run.payments_uploaded ? "text-green-600" : run.users_uploaded ? "text-yellow-500" : "text-gray-300"
            )}>
              <span className={clsx(
                "w-4 h-4 rounded-full flex items-center justify-center",
                run.payments_uploaded ? "bg-green-100"
                  : run.users_uploaded ? "bg-yellow-100"
                  : "border-2 border-gray-200"
              )}>
                {run.payments_uploaded
                  ? <CheckIcon />
                  : run.users_uploaded && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />}
              </span>
              Payments
            </div>

            <div className={clsx("flex-1 h-px mx-2", run.payments_uploaded ? "bg-blue-200" : "bg-gray-200")} />

            {/* Step: Predicting */}
            <div className={clsx(
              "flex items-center gap-1 text-[10px] font-bold",
              run.payments_uploaded ? "text-blue-600" : "text-gray-300"
            )}>
              <span className={clsx(
                "w-4 h-4 rounded-full flex items-center justify-center",
                run.payments_uploaded ? "bg-blue-100" : "border-2 border-gray-200"
              )}>
                {run.payments_uploaded && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                )}
              </span>
              Predicting
            </div>
          </div>

          {/* Animated loading bar */}
          <div className="relative h-1 w-full bg-blue-50 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 w-2/5 bg-gradient-to-r from-blue-200 via-[#005AE2] to-blue-200 rounded-full"
              style={{ animation: "bar-slide 1.4s ease-in-out infinite" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function RunsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);

  useEffect(() => {
    const match = document.cookie.match(/active_run_id=(\d+)/);
    if (match) setActiveRunId(parseInt(match[1], 10));
  }, []);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/runs`);
      if (res.ok) setRuns(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 4000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("ลบ Run นี้?")) return;
    await fetch(`${API}/api/runs/${id}`, { method: "DELETE" });
    fetchRuns();
  }

  const totalRuns = runs.length;
  const readyRuns = runs.filter((r) => r.status === "done").length;
  const processingRuns = runs.filter(
    (r) => r.status === "pending" && (r.users_uploaded || r.payments_uploaded)
  ).length;

  return (
    <div className="space-y-6 lg:space-y-7">
      {/* Banner */}
      <section className="-mx-5 -mt-6 sm:-mx-8 lg:-mx-10 lg:-mt-8 relative overflow-hidden bg-gradient-to-r from-[#005AE2] via-[#005AE2] to-[#c96216] px-8 py-8 sm:px-10 lg:px-12 lg:pt-10 lg:pb-[20px] shadow-sm">
        <div className="absolute right-[-20px] top-0 select-none pointer-events-none opacity-[0.85] mix-blend-overlay">
          <span className="text-[140px] leading-[0.85] font-black tracking-tighter text-white" style={{ fontFamily: "Arial, sans-serif" }}>
            1MO<br />BY
          </span>
        </div>
        <div className="relative z-20 max-w-2xl flex flex-col items-start pt-2">
          <p className="mb-3 text-[10px] font-bold tracking-[0.2em] text-white/90 uppercase">Prediction Runs</p>
          <h2 className="text-balance text-[28px] font-bold leading-[1.3] text-white sm:text-[34px] tracking-tight">
            จัดการ Prediction Runs
          </h2>
          <p className="mt-4 max-w-lg text-[13px] leading-relaxed text-blue-50/90 font-medium">
            แต่ละ Run คือการ predict หนึ่งรอบ — ตั้งชื่อ อัพโหลดข้อมูล แล้วดูผลลัพธ์ได้ทันที
          </p>
        </div>
      </section>

      {/* Stat chips */}
      <section className="grid grid-cols-3 gap-4 relative z-30 mt-[-80px] px-2 sm:px-0">
        {[
          { label: "ทั้งหมด", value: totalRuns, sub: "Runs", color: "text-gray-900" },
          { label: "พร้อมใช้", value: readyRuns, sub: "Ready", color: "text-green-600" },
          { label: "กำลังประมวล", value: processingRuns, sub: "Processing", color: "text-yellow-500" },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-1.5 p-5 bg-white rounded-[16px] border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#5A6B8A]">{s.label}</p>
            <p className={`text-[28px] font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400">{s.sub}</p>
          </div>
        ))}
      </section>

      {/* List header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-800">รายการ Runs</h3>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#005AE2] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(0,90,226,0.25)] hover:bg-[#004acc] transition-all"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          สร้าง Run ใหม่
        </button>
      </div>

      {/* Runs */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">กำลังโหลด...</div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 bg-white rounded-[16px] border border-gray-200">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-gray-400">
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-bold text-gray-700">ยังไม่มี Prediction Run</p>
              <p className="text-sm text-gray-400 mt-1">สร้าง Run แรกเพื่อเริ่มวิเคราะห์ข้อมูล</p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#005AE2] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#004acc] transition-all"
            >
              + สร้าง Run แรก
            </button>
          </div>
        ) : (
          runs.map((run) => (
            <RunCard key={run.id} run={run} isActive={run.id === activeRunId} onDelete={handleDelete} />
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <CreateRunModal
          onClose={() => setShowModal(false)}
          onCreated={(id) => { setShowModal(false); fetchRuns(); router.push(`/runs/${id}`); }}
        />
      )}
    </div>
  );
}
