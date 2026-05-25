"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import {
  FileSpreadsheet,
  Play,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { EmptyState, PageHeader, SectionCard, Skeleton, StatusPill } from "@/components/ui";
import {
  deleteTrainDataSource,
  fetchTrainDataSources,
  trainModels,
  uploadTrainDataFileWithProgress,
  type TrainCleanManifest,
  type TrainDataSource,
} from "@/lib/api";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import { getDisplayError } from "@/lib/ui-error";

const IMPORT_BAR_GRADIENT = `linear-gradient(90deg, #3f98ff 0%, ${MOBY_BRAND.blueLight} 18%, ${MOBY_BRAND.blue} 38%, #3d7bff 56%, #6fa8ff 68%, ${MOBY_BRAND.orangeWarm} 84%, #ff8f1f 93%, ${MOBY_BRAND.orange} 100%)`;

type CleanCounts = {
  customers: number;
  payments: number;
  usage: number;
};

export default function TrainingPage() {
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
      const sources = await fetchTrainDataSources().catch(() => [] as TrainDataSource[]);
      setTrainSources(Array.isArray(sources) ? sources : []);
    } catch (e) {
      setTrainSources([]);
      setLoadError(getDisplayError(e, "Failed to load training workspace"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const latestSource = getLatestTrainSource(trainSources);
  const latestCleanCounts = getCleanCounts(latestSource);
  const readySources = trainSources.filter((source) => source.import_status === "ready");
  const canTrain = readySources.length > 0;

  const handleImportFile = async (file: File) => {
    const datasetName = importName.trim() || file.name.replace(/\.xlsx$/i, "");
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    setImportProgress(1);
    setImportStep("Uploading Excel file...");
    setImportPhase(null);

    try {
      const result = await uploadTrainDataFileWithProgress(
        file,
        datasetName,
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
      setImportStep("Dataset is ready for training");
      setImportSuccess(buildImportSuccessMessage(result.source_id, result.clean_manifest));
      await wait(450);
      await load();
    } catch (e) {
      setImportProgress(0);
      setImportStep("");
      setImportPhase(null);
      const err = e as Error & { code?: string; source_id?: string };
      if (err.code === "DUPLICATE_FILE" && err.source_id) {
        setImportError(`${err.message} (existing source ${err.source_id.slice(0, 8)}...)`);
      } else {
        setImportError(getDisplayError(e, "Import failed"));
      }
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteSource = async (source: TrainDataSource) => {
    const stuck = source.import_status === "importing" || source.import_status === "cleaning";
    const message = stuck
      ? `งาน import อาจค้างอยู่ - ลบ dataset "${source.name}" และข้อมูล raw/clean ทั้งหมด?`
      : `ลบ dataset "${source.name}"? ข้อมูล raw/clean ทั้งหมดจะถูกลบถาวร`;
    if (!confirm(message)) return;

    setDeletingId(source.id);
    setImportError(null);
    setImportSuccess(null);
    try {
      await deleteTrainDataSource(source.id);
      setTrainSources((prev) => prev.filter((item) => item.id !== source.id));
    } catch (e) {
      setImportError(getDisplayError(e, "ลบ dataset ไม่สำเร็จ"));
    } finally {
      setDeletingId(null);
    }
  };

  const startTraining = async () => {
    setTraining(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      await trainModels();
      await waitForTrainingHealth();
      await load();
    } catch (e) {
      setImportError(getDisplayError(e, "Training failed"));
    } finally {
      setTraining(false);
    }
  };

  if (loading) {
    return (
      <div className="pb-12">
        <PageHeader title="Model Training" />
        <div className="px-8 mt-4 space-y-5">
          <Skeleton className="h-[280px]" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Skeleton className="h-[220px]" />
            <Skeleton className="h-[220px]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-12">
      <PageHeader title="Model Training" />

      <div className="px-8 mt-4 space-y-5">
        {loadError && (
          <div className="rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
            {loadError}
          </div>
        )}

        <section className="surface overflow-hidden">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_360px]">
            <div className="p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-5)]">
                    Training workspace
                  </p>
                  <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[color:var(--ink-1)]">
                    Upload dataset and train models
                  </h2>
                  <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[color:var(--ink-4)]">
                    ใช้พื้นที่นี้สำหรับอัปโหลดไฟล์ Excel, รอระบบ prepare ข้อมูล, แล้วเริ่ม train โมเดลจาก dataset ที่พร้อมใช้งาน
                  </p>
                </div>
                <StatusPill tone={canTrain ? "ok" : "neutral"}>
                  {canTrain ? `${readySources.length} dataset ready` : "Waiting for dataset"}
                </StatusPill>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="text-sm">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-5)]">
                    Dataset name
                  </span>
                  <input
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    placeholder="e.g. Bangkok University Q1"
                    className="mt-1 w-full h-10 rounded-xl border border-[color:var(--line)] bg-white px-3 text-[13px]"
                  />
                </label>

                <label className="text-sm">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-5)]">
                    Client label
                  </span>
                  <input
                    type="text"
                    value={importClient}
                    onChange={(e) => setImportClient(e.target.value)}
                    placeholder="optional"
                    className="mt-1 w-full h-10 rounded-xl border border-[color:var(--line)] bg-white px-3 text-[13px]"
                  />
                </label>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setPendingFile(file);
                  setImportError(null);
                  setImportSuccess(null);
                }}
              />

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--line)] bg-white px-4 text-[13px] font-medium text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)] disabled:opacity-50"
                >
                  <Upload size={15} />
                  Choose .xlsx
                </button>

                <button
                  type="button"
                  disabled={importing || !pendingFile}
                  onClick={() => pendingFile && void handleImportFile(pendingFile)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white disabled:opacity-50"
                  style={{
                    backgroundImage: IMPORT_BAR_GRADIENT,
                    boxShadow: "0 14px 34px rgba(7, 29, 126, 0.18)",
                  }}
                >
                  <FileSpreadsheet size={15} />
                  Upload and prepare
                </button>

                <button
                  type="button"
                  disabled={training || importing || !canTrain}
                  onClick={() => void startTraining()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[rgba(0,107,255,0.14)] bg-[color:var(--moby-50)] px-4 text-[13px] font-semibold text-[color:var(--moby-700)] hover:bg-[color:var(--moby-100)] disabled:opacity-50"
                >
                  {training ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
                  {training ? "Training models..." : "Train models"}
                </button>
              </div>

              {pendingFile && !importing && (
                <div className="mt-4 rounded-xl border border-[color:var(--line-2)] bg-[color:var(--surface-2)] px-4 py-3 text-[13px] text-[color:var(--ink-3)]">
                  Ready to upload:{" "}
                  <span className="font-medium text-[color:var(--ink-1)]">{pendingFile.name}</span>
                  {" · "}
                  {(pendingFile.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              )}

              {(importing || training) && (
                <div className="mt-4 rounded-2xl border border-[rgba(0,107,255,0.10)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,251,253,0.98))] p-4">
                  <div className="flex items-center gap-2 text-[13px] text-[color:var(--ink-2)]">
                    <RefreshCw size={14} className="animate-spin shrink-0 text-[color:var(--moby-600)]" />
                    <span className="font-medium">
                      {training ? "Training models with the prepared dataset..." : "Preparing training dataset..."}
                    </span>
                    {!training && (
                      <span className="ml-auto text-[11px] text-[color:var(--ink-5)]">
                        {importPhase === "clean"
                          ? "Step 2 of 2 - Clean"
                          : importPhase === "raw"
                            ? "Step 1 of 2 - Raw"
                            : "Raw to Clean"}
                      </span>
                    )}
                  </div>

                  <div className="mt-3">
                    <GradientProgressBar
                      value={training ? 100 : Math.max(importProgress > 0 ? 4 : 0, importProgress)}
                      indeterminate={training}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-[12px] text-[color:var(--ink-4)]">
                      {training ? "We will refresh the active models as soon as training is complete." : importStep || "Processing..."}
                    </p>
                    {!training && (
                      <p className="num text-[13px] font-semibold text-[color:var(--moby-700)]">
                        {importProgress}%
                      </p>
                    )}
                  </div>
                </div>
              )}

              {importSuccess && !importing && !training && (
                <div className="mt-4 rounded-xl border border-[color:var(--ok)] bg-[color:var(--ok-bg)] px-4 py-3 text-[13px] text-[color:var(--ok)]">
                  {importSuccess}
                </div>
              )}

              {importError && (
                <div className="mt-4 rounded-xl border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
                  {importError}
                </div>
              )}
            </div>

            <aside className="border-t border-[color:var(--line-2)] bg-[color:var(--surface-2)] p-6 xl:border-l xl:border-t-0">
              <div className="space-y-5">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-5)]">
                    Workspace summary
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <StatBlock label="Total datasets" value={trainSources.length.toString()} />
                    <StatBlock label="Ready" value={readySources.length.toString()} tone="ok" />
                  </div>
                </div>

                <div className="rounded-2xl border border-[color:var(--line)] bg-white p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-5)]">
                    Latest dataset
                  </div>
                  <div className="mt-2 text-[16px] font-semibold text-[color:var(--ink-1)]">
                    {latestSource?.name || "No dataset yet"}
                  </div>
                  <div className="mt-2 text-[12px] text-[color:var(--ink-4)]">
                    {latestSource
                      ? `${latestSource.original_filename} · ${formatDate(latestSource.imported_at || latestSource.created_at)}`
                      : "Upload one Excel file to get started."}
                  </div>
                  {latestSource && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusPill tone={statusTone(latestSource.import_status)}>
                        {statusLabel(latestSource.import_status)}
                      </StatusPill>
                      {latestSource.client_label && (
                        <StatusPill tone="neutral" dot={false}>
                          {latestSource.client_label}
                        </StatusPill>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-[color:var(--line)] bg-white p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-5)]">
                    Clean output
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <SmallMetric label="Customers" value={latestCleanCounts?.customers.toLocaleString() || "-"} />
                    <SmallMetric label="Payments" value={latestCleanCounts?.payments.toLocaleString() || "-"} />
                    <SmallMetric label="Usage" value={latestCleanCounts?.usage.toLocaleString() || "-"} />
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <SectionCard
          title="Dataset library"
          hint="All uploaded training datasets in one place"
        >
          {trainSources.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="No training dataset yet"
              hint="Upload one Excel file above to prepare the raw and clean data automatically."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--line)]">
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">Dataset</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">Status</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">Imported</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">By</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">Clean rows</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {trainSources
                    .slice()
                    .sort((a, b) => getTimestamp(b.imported_at || b.created_at) - getTimestamp(a.imported_at || a.created_at))
                    .map((source) => {
                      const counts = getCleanCounts(source);
                      const isDeleting = deletingId === source.id;
                      return (
                        <tr key={source.id} className="border-b border-[color:var(--line-2)] align-top hover:bg-[color:var(--surface-2)]">
                          <td className="px-3 py-3">
                            <div className="font-medium text-[color:var(--ink-1)]">{source.name}</div>
                            <div className="mt-1 text-[12px] text-[color:var(--ink-4)] break-all">{source.original_filename}</div>
                            {source.client_label && (
                              <div className="mt-2">
                                <StatusPill tone="neutral" dot={false}>{source.client_label}</StatusPill>
                              </div>
                            )}
                            {source.error_message && (
                              <div className="mt-2 text-[12px] text-[color:var(--danger)]">{source.error_message}</div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <StatusPill tone={statusTone(source.import_status)}>
                              {statusLabel(source.import_status)}
                            </StatusPill>
                          </td>
                          <td className="px-3 py-3 text-[13px] text-[color:var(--ink-4)]">
                            {formatDate(source.imported_at || source.created_at)}
                          </td>
                          <td className="px-3 py-3 text-[13px] text-[color:var(--ink-4)]">
                            {source.importer_name ?? source.importer_email ?? source.imported_by ?? "-"}
                          </td>
                          <td className="px-3 py-3 text-[13px] text-[color:var(--ink-4)]">
                            {counts
                              ? `${counts.customers.toLocaleString()} / ${counts.payments.toLocaleString()} / ${counts.usage.toLocaleString()}`
                              : "-"}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => void deleteSource(source)}
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[color:var(--line)] bg-white px-3 text-[12px] font-medium text-[color:var(--ink-3)] hover:border-[color:var(--danger)] hover:bg-[color:var(--danger-bg)] hover:text-[color:var(--danger)] disabled:opacity-50"
                            >
                              {isDeleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

      </div>
    </div>
  );
}

function GradientProgressBar({
  value,
  indeterminate = false,
}: {
  value: number;
  indeterminate?: boolean;
}) {
  return (
    <div className="relative h-3 overflow-hidden rounded-full bg-[rgba(13,17,35,0.08)]">
      <div
        className={`h-full rounded-full transition-[width,opacity] duration-300 ease-out ${indeterminate ? "animate-pulse" : ""}`}
        style={{
          width: indeterminate ? "100%" : `${Math.max(0, Math.min(100, value))}%`,
          backgroundImage: IMPORT_BAR_GRADIENT,
          boxShadow: `0 0 22px ${MOBY_BRAND.radialGlow}`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.42) 45%, transparent 80%)",
        }}
      />
    </div>
  );
}

function getLatestTrainSource(sources: TrainDataSource[]): TrainDataSource | null {
  if (sources.length === 0) return null;
  return [...sources].sort((a, b) => getTimestamp(b.imported_at || b.created_at) - getTimestamp(a.imported_at || a.created_at))[0] || null;
}

function getCleanCounts(source: TrainDataSource | null): CleanCounts | null {
  const cleanManifest = source?.clean_manifest;
  if (!cleanManifest || typeof cleanManifest !== "object" || Array.isArray(cleanManifest)) return null;
  const clean = (cleanManifest as Record<string, unknown>).clean;
  if (!clean || typeof clean !== "object" || Array.isArray(clean)) return null;
  const counts = clean as Record<string, unknown>;
  return {
    customers: Number(counts.customers ?? 0),
    payments: Number(counts.payments ?? 0),
    usage: Number(counts.usage ?? 0),
  };
}

function buildImportSuccessMessage(sourceId: string, cleanManifest: TrainCleanManifest | undefined): string {
  const counts = cleanManifest
    ? {
        customers: cleanManifest.clean.customers,
        payments: cleanManifest.clean.payments,
        usage: cleanManifest.clean.usage,
      }
    : null;
  if (!counts) {
    return `Dataset ${sourceId.slice(0, 8)}... is ready for training.`;
  }
  return `Dataset ${sourceId.slice(0, 8)}... is ready: ${counts.customers.toLocaleString()} customers, ${counts.payments.toLocaleString()} payments, ${counts.usage.toLocaleString()} usage rows.`;
}

function statusTone(status: string): "ok" | "danger" | "neutral" {
  if (status === "ready") return "ok";
  if (status === "failed") return "danger";
  return "neutral";
}

function statusLabel(status: string): string {
  if (status === "ready") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "cleaning") return "Cleaning";
  if (status === "importing") return "Importing";
  return "No dataset";
}

function StatBlock({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "brand";
}) {
  const toneClass = {
    neutral: "bg-[color:var(--surface-2)] text-[color:var(--ink-1)]",
    ok: "bg-[color:var(--ok-bg)] text-[color:var(--ok)]",
    brand: "bg-[color:var(--moby-50)] text-[color:var(--moby-700)]",
  }[tone];

  return (
    <div className="rounded-xl border border-[color:var(--line-2)] bg-[color:var(--surface)] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
        {label}
      </div>
      <div className={`mt-2 inline-flex rounded-lg px-2.5 py-1 text-[13px] font-semibold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function SmallMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-[color:var(--surface-2)] px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
        {label}
      </div>
      <div className="mt-1 text-[13px] font-semibold text-[color:var(--ink-2)] break-words">
        {value}
      </div>
    </div>
  );
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH");
}

function getTimestamp(value?: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForTrainingHealth(): Promise<void> {
  const maxAttempts = 36;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const res = await fetch("/api/health");
    if (res.ok) {
      const data = await res.json();
      if (data.models?.churn && data.models?.winback && data.models?.conversion) {
        return;
      }
    }
    await wait(5000);
  }
  throw new Error("Training finished too slowly - health check timed out");
}
