/**
 * Training page — two concerns while we migrate:
 *   [NEW]  "Training data (raw)" — import Excel → train_data_sources (greenfield)
 *   [LEGACY] Model versions + "Train New Models" — FastAPI /model-versions/train
 * See docs/DATA-PIPELINE-MIGRATION.md
 */
"use client";
export const dynamic = "force-dynamic";
import { useEffect, useRef, useState } from "react";
import {
  Play, CheckCircle2, AlertCircle, RefreshCw, Database, Upload, FileSpreadsheet, Trash2,
} from "lucide-react";
import {
  PageHeader, SectionCard, StatusPill, Skeleton, EmptyState,
} from "@/components/ui";
import {
  fetchModelVersions,
  fetchActiveModelVersions,
  trainModels,
  fetchTrainDataSources,
  deleteTrainDataSource,
  uploadTrainDataFileWithProgress,
  type TrainDataSource,
} from "@/lib/api";
import { getDisplayError } from "@/lib/ui-error";

interface ModelVersion {
  id: string;
  model_type: string;
  version: string;
  trained_at: string;
  metrics_json: Record<string, any>;
  model_file_path: string;
  is_active: boolean;
}

interface ActiveVersions {
  [key: string]: ModelVersion;
}

const modelLabels: Record<string, string> = {
  churn: "Churn Prediction",
  clv: "Customer Lifetime Value",
  credit: "Credit Purchase Forecast",
  winback: "Win-back",
  conversion: "Free → Paid Conversion",
};

export default function TrainingPage() {
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [activeVersions, setActiveVersions] = useState<ActiveVersions>({});
  const [trainSources, setTrainSources] = useState<TrainDataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStep, setImportStep] = useState("");
  const [importPhase, setImportPhase] = useState<"raw" | "clean" | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importName, setImportName] = useState("");
  const [importClient, setImportClient] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const [allVersions, activeArr, sources] = await Promise.all([
        fetchModelVersions(),
        fetchActiveModelVersions(),
        fetchTrainDataSources().catch(() => [] as TrainDataSource[]),
      ]);
      setVersions(Array.isArray(allVersions) ? allVersions : []);
      const map: ActiveVersions = {};
      (Array.isArray(activeArr) ? activeArr : []).forEach((v) => {
        map[v.model_type] = v;
      });
      setActiveVersions(map);
      setTrainSources(Array.isArray(sources) ? sources : []);
    } catch (e) {
      setVersions([]);
      setActiveVersions({});
      setTrainSources([]);
      setLoadError(getDisplayError(e, "Failed to load model versions"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleImportFile = async (file: File) => {
    const name = importName.trim() || file.name.replace(/\.xlsx$/i, "");
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    setImportProgress(0);
    setImportStep("กำลังเตรียมข้อมูล (raw → clean)…");
    setImportPhase(null);
    try {
      const result = await uploadTrainDataFileWithProgress(
        file,
        name,
        (event) => {
          setImportProgress(event.progress);
          setImportStep(event.step);
          if (event.phase) setImportPhase(event.phase);
        },
        importClient.trim() || undefined
      );
      setImportName("");
      setPendingFile(null);
      setImportProgress(100);
      setImportStep("Ready for model training");
      const clean = result.clean_manifest;
      let cleanSummary = "";
      if (clean) {
        const c = clean.clean;
        cleanSummary = ` — clean: ${c.customers.toLocaleString()} customers, ${c.payments.toLocaleString()} payments, ${c.usage.toLocaleString()} usage rows`;
        const skipParts: string[] = [];
        const s = clean.skipped;
        if (s.customers_no_acc_id > 0) skipParts.push(`${s.customers_no_acc_id} users without acc_id`);
        if (s.payments_no_acc_id > 0) skipParts.push(`${s.payments_no_acc_id} payments without acc_id`);
        if (s.payments_no_date > 0) skipParts.push(`${s.payments_no_date} payments without date`);
        if (s.usage_no_acc_id > 0) skipParts.push(`${s.usage_no_acc_id} usage without acc_id`);
        if (skipParts.length > 0) {
          cleanSummary += ` (skipped: ${skipParts.join("; ")})`;
        }
      }
      setImportSuccess(
        `เตรียมข้อมูลเสร็จ ${result.source_id.slice(0, 8)}… (${Object.keys(result.sheet_manifest).length} sheets)${cleanSummary}`
      );
      await new Promise((r) => setTimeout(r, 450));
      await load();
    } catch (e) {
      setImportProgress(0);
      setImportStep("");
      setImportPhase(null);
      const err = e as Error & { code?: string; source_id?: string };
      if (err.code === "DUPLICATE_FILE" && err.source_id) {
        setImportError(
          `${err.message} (existing source ${err.source_id.slice(0, 8)}…)`
        );
      } else {
        setImportError(getDisplayError(e, "Import failed"));
      }
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteSource = async (id: string, name: string, status: string) => {
    const stuck = status === "importing" || status === "cleaning";
    const msg = stuck
      ? `งาน import อาจค้างอยู่ — ลบ dataset "${name}" และข้อมูล raw/clean ทั้งหมด?`
      : `ลบ dataset "${name}"? ข้อมูล raw/clean ทั้งหมดจะถูกลบถาวร`;
    if (!confirm(msg)) return;
    setDeletingId(id);
    setImportError(null);
    try {
      await deleteTrainDataSource(id);
      setTrainSources((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setImportError(getDisplayError(e, "ลบ dataset ไม่สำเร็จ"));
    } finally {
      setDeletingId(null);
    }
  };

  const startTraining = async () => {
    setTraining(true);
    try {
      await trainModels();
      // Poll FastAPI's /health (public endpoint) until all model files exist
      const interval = setInterval(async () => {
        const res = await fetch("/api/health");
        if (res.ok) {
          const data = await res.json();
          if (data.models?.churn && data.models?.winback && data.models?.conversion) {
            clearInterval(interval);
            load();
            setTraining(false);
          }
        }
      }, 5000);
    } catch {
      setTraining(false);
    }
  };

  if (loading) {
    return (
      <div className="pb-12">
        <PageHeader title="Model Training" />
        <div className="px-8 mt-4 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
          </div>
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const modelTypes = ["churn", "clv", "credit", "winback", "conversion"];

  return (
    <div className="pb-12">
      <PageHeader
        title="Model Training"
        actions={
          <button
            onClick={startTraining}
            disabled={training}
            className="h-9 px-3 rounded-lg bg-[color:var(--moby-600)] text-white text-[13px] hover:bg-[color:var(--moby-700)] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {training ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
            {training ? "Training..." : "Train New Models"}
          </button>
        }
      />
      <div className="px-8 mt-4 space-y-5">
        <p className="text-sm text-[color:var(--ink-4)]">
          อัปโหลดไฟล์ .xlsx ครั้งเดียว — ระบบนำเข้า raw แล้ว clean ให้อัตโนมัติ (progress เดียว)
        </p>

        <SectionCard
          title="อัปโหลดข้อมูลเทรน"
          hint="Excel 8 ชีต → raw ใน DB → clean สำหรับเทรนโมเดล (ไม่ต้องกดแยก)"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm">
              <span className="text-[color:var(--ink-5)] text-xs uppercase tracking-wider">Dataset name</span>
              <input
                type="text"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="e.g. Bangkok University Q1"
                className="mt-1 w-full h-9 px-3 rounded-lg border border-[color:var(--line)] bg-white text-[13px]"
              />
            </label>
            <label className="flex-1 text-sm">
              <span className="text-[color:var(--ink-5)] text-xs uppercase tracking-wider">Client label (optional)</span>
              <input
                type="text"
                value={importClient}
                onChange={(e) => setImportClient(e.target.value)}
                placeholder="e.g. bangkok_university"
                className="mt-1 w-full h-9 px-3 rounded-lg border border-[color:var(--line)] bg-white text-[13px]"
              />
            </label>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setPendingFile(f);
                    setImportError(null);
                    setImportSuccess(null);
                  }
                }}
              />
              <button
                type="button"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-3 rounded-lg border border-[color:var(--line)] bg-white text-[13px] hover:bg-[color:var(--surface-1)] inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Upload size={15} />
                Choose .xlsx
              </button>
              <button
                type="button"
                disabled={importing || !pendingFile}
                onClick={() => pendingFile && void handleImportFile(pendingFile)}
                className="h-9 px-3 rounded-lg bg-[color:var(--moby-600)] text-white text-[13px] hover:bg-[color:var(--moby-700)] inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <FileSpreadsheet size={15} />
                อัปโหลด
              </button>
            </div>
          </div>
          {pendingFile && !importing && (
            <p className="mt-2 text-[12px] text-[color:var(--ink-4)]">
              Selected: <span className="font-medium text-[color:var(--ink-2)]">{pendingFile.name}</span>
              {" "}({(pendingFile.size / (1024 * 1024)).toFixed(2)} MB)
            </p>
          )}
          {importing && (
            <div className="mt-4 rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-1)] p-4 space-y-3">
              <div className="flex items-center gap-2 text-[13px] text-[color:var(--ink-2)]">
                <RefreshCw size={14} className="animate-spin shrink-0 text-[color:var(--moby-600)]" />
                <span className="font-medium">กำลังเตรียมข้อมูลเทรน…</span>
                <span className="ml-auto text-[11px] text-[color:var(--ink-5)]">
                  {importPhase === "clean"
                    ? "ขั้นที่ 2/2 · Clean"
                    : importPhase === "raw"
                      ? "ขั้นที่ 1/2 · Raw"
                      : "Raw → Clean"}
                </span>
              </div>
              <div className="relative w-full h-3 rounded-full bg-[color:var(--surface-2)] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-[45%] w-px bg-[color:var(--line)] z-10"
                  aria-hidden
                />
                <div
                  className="h-full rounded-full bg-[color:var(--moby-600)] transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.max(importProgress > 0 ? 4 : 0, importProgress)}%` }}
                />
              </div>
              <p className="text-[12px] text-[color:var(--ink-4)]">{importStep || "กำลังประมวลผล…"}</p>
              <p className="num text-[13px] font-medium text-[color:var(--moby-700)]">{importProgress}%</p>
            </div>
          )}
          {importSuccess && !importing && (
            <p className="mt-3 text-[13px] text-[color:var(--ok)]">{importSuccess}</p>
          )}
          {importError && (
            <p className="mt-3 text-[13px] text-[color:var(--danger)]">{importError}</p>
          )}
          {trainSources.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={FileSpreadsheet}
                title="No training datasets yet"
                hint="Upload an 8-sheet Excel file to store raw rows in the database"
              />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--line)]">
                    <th className="text-left py-2 px-2 text-xs text-[color:var(--ink-5)] uppercase">Name</th>
                    <th className="text-left py-2 px-2 text-xs text-[color:var(--ink-5)] uppercase">File</th>
                    <th className="text-left py-2 px-2 text-xs text-[color:var(--ink-5)] uppercase">Status</th>
                    <th className="text-left py-2 px-2 text-xs text-[color:var(--ink-5)] uppercase">Imported by</th>
                    <th className="text-left py-2 px-2 text-xs text-[color:var(--ink-5)] uppercase">When</th>
                    <th className="text-right py-2 px-2 text-xs text-[color:var(--ink-5)] uppercase w-12" />
                  </tr>
                </thead>
                <tbody>
                  {trainSources.map((s) => (
                    <tr key={s.id} className="border-b border-[color:var(--line)]">
                      <td className="py-2 px-2 font-medium text-[color:var(--ink-1)]">{s.name}</td>
                      <td className="py-2 px-2 text-[color:var(--ink-4)] text-xs">{s.original_filename}</td>
                      <td className="py-2 px-2">
                        <StatusPill
                          tone={
                            s.import_status === "ready"
                              ? "ok"
                              : s.import_status === "failed"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {s.import_status === "cleaning" ? "cleaning" : s.import_status}
                        </StatusPill>
                      </td>
                      <td className="py-2 px-2 text-[color:var(--ink-4)] text-xs">
                        {s.importer_name ?? s.importer_email ?? s.imported_by ?? "—"}
                      </td>
                      <td className="py-2 px-2 text-[color:var(--ink-4)] text-xs">
                        {s.imported_at
                          ? new Date(s.imported_at).toLocaleString("th-TH")
                          : new Date(s.created_at).toLocaleString("th-TH")}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <button
                          type="button"
                          disabled={deletingId === s.id}
                          onClick={() => void deleteSource(s.id, s.name, s.import_status)}
                          title="ลบ dataset (raw + clean)"
                          className="h-7 w-7 grid place-items-center rounded-md text-[color:var(--ink-4)] hover:text-[color:var(--danger)] hover:bg-[color:var(--danger-bg)] disabled:opacity-40"
                        >
                          {deletingId === s.id ? (
                            <RefreshCw size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {loadError && (
          <div className="rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
            {loadError}
          </div>
        )}

        {/* [LEGACY] Model registry + train trigger — not yet wired to train_data_sources */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {modelTypes.map((type) => {
            const active = activeVersions[type];
            return (
              <SectionCard key={type} className="relative overflow-hidden">
                <div className="text-xs font-medium text-[color:var(--ink-5)] uppercase tracking-wider mb-2">
                  {modelLabels[type] || type}
                </div>
                {active ? (
                  <>
                    <div className="flex items-center gap-1.5 mb-2">
                      <CheckCircle2 size={14} className="text-[color:var(--ok)]" />
                      <span className="text-sm font-semibold text-[color:var(--ink-1)]">Active</span>
                    </div>
                    <div className="text-xs text-[color:var(--ink-4)]">
                      {active.version}
                    </div>
                    <div className="text-xs text-[color:var(--ink-5)] mt-1">
                      {new Date(active.trained_at).toLocaleDateString("th-TH")}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-[color:var(--ink-4)]">
                    <AlertCircle size={14} />
                    <span className="text-sm">Not trained</span>
                  </div>
                )}
                <div className="absolute top-3 right-3">
                  <StatusPill tone={active ? "ok" : "neutral"}>
                    {active ? active.version : "—"}
                  </StatusPill>
                </div>
              </SectionCard>
            );
          })}
        </div>

        <SectionCard title="All Model Versions" hint="Historical model versions across all types">
          {versions.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No models trained yet"
              hint="Train your first model to see version history here"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--line)]">
                    <th className="text-left py-2.5 px-3 text-[color:var(--ink-5)] font-medium text-xs uppercase tracking-wider">Model</th>
                    <th className="text-left py-2.5 px-3 text-[color:var(--ink-5)] font-medium text-xs uppercase tracking-wider">Version</th>
                    <th className="text-left py-2.5 px-3 text-[color:var(--ink-5)] font-medium text-xs uppercase tracking-wider">Status</th>
                    <th className="text-left py-2.5 px-3 text-[color:var(--ink-5)] font-medium text-xs uppercase tracking-wider">Trained At</th>
                    <th className="text-left py-2.5 px-3 text-[color:var(--ink-5)] font-medium text-xs uppercase tracking-wider">Metrics</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id} className="border-b border-[color:var(--line)] hover:bg-[color:var(--surface-1)]">
                      <td className="py-2.5 px-3 font-medium text-[color:var(--ink-1)]">
                        {modelLabels[v.model_type] || v.model_type}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-[color:var(--ink-3)]">
                        {v.version}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusPill tone={v.is_active ? "ok" : "neutral"}>
                          {v.is_active ? "Active" : "Archived"}
                        </StatusPill>
                      </td>
                      <td className="py-2.5 px-3 text-[color:var(--ink-4)]">
                        {new Date(v.trained_at).toLocaleString("th-TH")}
                      </td>
                      <td className="py-2.5 px-3 text-[color:var(--ink-4)]">
                        {v.metrics_json ? (
                          <span className="text-xs">
                            {Object.keys(v.metrics_json).length} metrics
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
