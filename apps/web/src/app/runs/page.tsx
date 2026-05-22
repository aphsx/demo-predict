"use client";
export const dynamic = "force-dynamic";
import { useEffect, useRef, useState } from "react";

function UploadButton({ runId, uploading, onUpload }: {
  runId: string;
  uploading: boolean;
  onUpload: (runId: string, file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className="h-7 px-2.5 rounded-md border border-[color:var(--line)] bg-white text-[11.5px] text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)] inline-flex items-center gap-1 disabled:opacity-40"
      >
        {uploading ? <RefreshCw size={11} className="animate-spin" /> : <Upload size={11} />}
        Upload
      </button>
      <input
        ref={ref} type="file" accept=".xlsx,.csv" className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) { onUpload(runId, f); e.target.value = ""; }
        }}
      />
    </>
  );
}
import {
  Plus, Upload, Trash2, RefreshCw, CheckCircle2,
  Clock3, AlertCircle, FileSpreadsheet, ChevronRight,
} from "lucide-react";
import {
  PageHeader, SectionCard, StatusPill, Skeleton, EmptyState,
} from "@/components/ui";
import { api, retryRun, Run } from "@/lib/api";

const statusToTone: Record<string, "ok" | "warn" | "danger" | "info" | "neutral"> = {
  done: "ok",
  processing: "info",
  validating: "info",
  pending: "neutral",
  failed: "danger",
};
const statusIcon: Record<string, any> = {
  done: CheckCircle2,
  processing: RefreshCw,
  validating: RefreshCw,
  pending: Clock3,
  failed: AlertCircle,
};

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [cutoff, setCutoff] = useState("2025-07-01");
  const [uploading, setUploading] = useState<string | null>(null);
  const [streamingRun, setStreamingRun] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const d = await api.listRuns();
      setRuns(Array.isArray(d) ? d : []);
    } catch (e) {
      setRuns([]);
      setError(e instanceof Error ? e.message : "โหลดรายการ run ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  // SSE subscription for active runs
  useEffect(() => {
    const activeRun = runs.find(r => ["pending", "validating", "processing"].includes(r.status));
    if (!activeRun || streamingRun === activeRun.id) return;

    setStreamingRun(activeRun.id);
    const unsub = api.subscribeRunStatus(activeRun.id, (update) => {
      if (update.status === "done" || update.status === "failed") {
        setStreamingRun(null);
        load();
      }
    });
    return unsub;
  }, [runs, streamingRun]);

  const createRun = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("กรุณาใส่ชื่อ run");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api.createRun({ name: trimmed, cutoff_date: cutoff });
      setRuns((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
      setCreating(false);
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้าง run ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };
  const deleteRun = async (id: string) => {
    if (!confirm("ลบ Run นี้?")) return;
    setError(null);
    try {
      await api.deleteRun(id);
      setRuns((prev) => prev.filter((r) => r.id !== id));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ลบ run ไม่สำเร็จ");
    }
  };
  const retryPipeline = async (runId: string) => {
    setRetrying(runId);
    setError(null);
    try {
      await retryRun(runId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry ไม่สำเร็จ");
    } finally {
      setRetrying(null);
    }
  };

  const uploadFile = async (runId: string, file: File) => {
    setUploading(runId);
    setError(null);
    try {
      await api.uploadFile(runId, file);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(null);
    }
  };

  const stats = {
    total: runs.length,
    active: runs.filter(r => ["processing", "validating"].includes(r.status)).length,
    done: runs.filter(r => r.status === "done").length,
    failed: runs.filter(r => r.status === "failed").length,
  };

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Pipelines"
        title="Run management"
        actions={
          <button
            onClick={() => setCreating(true)}
            className="h-9 px-3 rounded-lg bg-[color:var(--moby-600)] text-white text-[13px] hover:bg-[color:var(--moby-700)] inline-flex items-center gap-1.5"
          >
            <Plus size={14} /> Create run
          </button>
        }
      />

      <div className="px-8 mt-4 space-y-5">
        {error && (
          <div className="rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
            {error}
          </div>
        )}

        {/* Status strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Total runs" value={stats.total} tone="slate" />
          <MiniStat label="In progress" value={stats.active} tone="blue" />
          <MiniStat label="Completed" value={stats.done} tone="emerald" />
          <MiniStat label="Failed" value={stats.failed} tone="rose" />
        </div>

        {/* Create panel */}
        {creating && (
          <SectionCard title="New run" right={<button onClick={() => setCreating(false)} className="text-[12px] text-[color:var(--ink-4)] hover:underline">cancel</button>}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-medium text-[color:var(--ink-4)] block mb-1">Run name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Q3-2025"
                  className="w-full h-9 px-3 rounded-lg border border-[color:var(--line)] bg-white text-[13px]"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[color:var(--ink-4)] block mb-1">Cutoff date</label>
                <input
                  type="date"
                  value={cutoff}
                  onChange={e => setCutoff(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[color:var(--line)] bg-white text-[13px]"
                />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={createRun}
                disabled={saving}
                className="h-9 px-3 rounded-lg bg-[color:var(--moby-600)] text-white text-[13px] hover:bg-[color:var(--moby-700)] disabled:opacity-50"
              >
                {saving ? "Creating…" : "Create"}
              </button>
            </div>
          </SectionCard>
        )}

        {/* Runs table */}
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Status</th>
                  <th>Cutoff</th>
                  <th className="text-right">Customers</th>
                  <th className="text-right">Active</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading && [...Array(4)].map((_, i) => (
                  <tr key={i}><td colSpan={7}><Skeleton className="h-6 my-1" /></td></tr>
                ))}
                {!loading && runs.length === 0 && (
                  <tr><td colSpan={7}>
                    <EmptyState
                      icon={FileSpreadsheet}
                      title="ยังไม่มี run"
                      hint="Create run และ upload Excel เพื่อเริ่มประมวลผล"
                    />
                  </td></tr>
                )}
                {!loading && runs.map(run => {
                  const Icon = statusIcon[run.status];
                  return (
                    <tr key={run.id}>
                      <td className="font-medium text-[color:var(--ink-1)]">{run.name}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <StatusPill tone={statusToTone[run.status] || "neutral"} icon={Icon}>
                            {run.status}
                          </StatusPill>
                          {run.error_message && (
                            <span className="text-[11px] text-[color:var(--danger)] truncate max-w-[240px]" title={run.error_message}>
                              {run.error_message}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="num">{run.cutoff_date}</td>
                      <td className="text-right num">{run.total_customers?.toLocaleString() ?? "—"}</td>
                      <td className="text-right num">{run.active_customers?.toLocaleString() ?? "—"}</td>
                      <td className="text-[11.5px] text-[color:var(--ink-4)]">
                        {new Date(run.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {["pending", "failed", "processing", "validating"].includes(run.status) && (
                            <UploadButton
                              runId={run.id}
                              uploading={uploading === run.id}
                              onUpload={uploadFile}
                            />
                          )}
                          {["processing", "failed"].includes(run.status) && (
                            <button
                              onClick={() => retryPipeline(run.id)}
                              disabled={retrying === run.id}
                              className="h-7 px-2.5 rounded-md border border-[color:var(--line)] bg-white text-[11.5px] text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)] inline-flex items-center gap-1 disabled:opacity-40"
                            >
                              {retrying === run.id
                                ? <RefreshCw size={11} className="animate-spin" />
                                : <RefreshCw size={11} />}
                              Retry
                            </button>
                          )}
                          {run.status === "done" && (
                            <a
                              href={`/?run=${run.id}`}
                              className="h-7 px-2.5 rounded-md border border-[color:var(--line)] bg-white text-[11.5px] text-[color:var(--moby-700)] hover:bg-[color:var(--surface-2)] inline-flex items-center gap-1"
                            >
                              Open <ChevronRight size={11} />
                            </a>
                          )}
                          <button
                            onClick={() => deleteRun(run.id)}
                            className="h-7 w-7 grid place-items-center rounded-md text-[color:var(--ink-4)] hover:text-[color:var(--danger)] hover:bg-[color:var(--danger-bg)]"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "slate" | "blue" | "emerald" | "rose" }) {
  const col = ({ slate: "var(--ink-4)", blue: "var(--moby-600)", emerald: "var(--ok)", rose: "var(--danger)" } as const)[tone];
  return (
    <div className="surface p-4">
      <div className="text-[11px] uppercase tracking-[.10em] text-[color:var(--ink-5)]">{label}</div>
      <div className="num text-[22px] font-semibold mt-1" style={{ color: col }}>{value.toLocaleString()}</div>
    </div>
  );
}
