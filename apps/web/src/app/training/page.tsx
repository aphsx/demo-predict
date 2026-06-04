"use client";
export const dynamic = "force-dynamic";

import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Layers3,
  Play,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { EmptyState, PageHeader, Skeleton, StatusPill } from "@/components/ui";
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

const IMPORT_ACCENT = MOBY_BRAND.orange;
const IMPORT_ACCENT_BORDER = "rgba(252,76,2,0.24)";
const IMPORT_PROGRESS_BG = `linear-gradient(90deg, ${MOBY_BRAND.orangeWarm} 0%, ${MOBY_BRAND.orange} 100%)`;

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
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
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

  const readySources = trainSources.filter((source) => source.import_status === "ready");
  const sortedSources = trainSources
    .slice()
    .sort(
      (a, b) =>
        getTimestamp(b.imported_at || b.created_at) -
        getTimestamp(a.imported_at || a.created_at)
    );
  const selectedSource =
    sortedSources.find((source) => source.id === selectedSourceId) ?? readySources[0] ?? null;
  const selectedCleanCounts = getCleanCounts(selectedSource);
  const canTrain = Boolean(selectedSource && selectedSource.import_status === "ready");

  useEffect(() => {
    if (sortedSources.length === 0) {
      setSelectedSourceId(null);
      return;
    }
    if (selectedSourceId && sortedSources.some((source) => source.id === selectedSourceId)) return;
    setSelectedSourceId(readySources[0]?.id ?? sortedSources[0]?.id ?? null);
  }, [readySources, selectedSourceId, sortedSources]);

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
    if (!canTrain) {
      setImportError("Select a ready dataset before training.");
      return;
    }
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
        <PageHeader eyebrow="Data pipeline" title="Training data workspace" />
        <div className="px-8 mt-4 space-y-5">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_420px]">
            <Skeleton className="h-[360px]" />
            <div className="space-y-5">
              <Skeleton className="h-[180px]" />
              <Skeleton className="h-[210px]" />
            </div>
          </div>
          <Skeleton className="h-[260px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-12">

      <div className="px-8 mt-4 space-y-6">
        {loadError && (
          <div className="rounded-2xl border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
            {loadError}
          </div>
        )}

        <section className="surface-elev overflow-hidden">
          <div className="p-5 sm:p-6">
              <div className="flex flex-col gap-3 border-b border-[color:var(--line-2)] pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-5)]">
                    New dataset
                  </p>
                  <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)]">
                    Import new workbook
                  </h2>
                  <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[color:var(--ink-4)]">
                    ตั้งชื่อ dataset, เลือก Excel fixed-schema แล้วให้ระบบ import raw และ clean data อัตโนมัติ
                  </p>
                </div>
                <StatusPill tone={canTrain ? "ok" : "neutral"}>
                  {canTrain ? `${readySources.length} ready` : "No ready dataset"}
                </StatusPill>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <FilePickerPanel
                  pendingFile={pendingFile}
                  importing={importing}
                  fileInputRef={fileInputRef}
                  onFileChange={(file) => {
                    setPendingFile(file);
                    setImportError(null);
                    setImportSuccess(null);
                  }}
                />

                <div className="flex flex-col rounded-[24px] border border-[color:var(--line)] bg-[color:var(--surface-2)] p-4">
                  <div className="grid grid-cols-1 gap-4">
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
                        Dataset name
                      </span>
                      <input
                        type="text"
                        value={importName}
                        onChange={(e) => setImportName(e.target.value)}
                        placeholder="e.g. Bangkok University Q1"
                        className="mt-1.5 h-11 w-full rounded-2xl border border-[color:var(--line)] bg-white px-3.5 text-[13px] text-[color:var(--ink-2)] shadow-[var(--shadow-1)]"
                      />
                    </label>

                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
                        Client label
                      </span>
                      <input
                        type="text"
                        value={importClient}
                        onChange={(e) => setImportClient(e.target.value)}
                        placeholder="optional"
                        className="mt-1.5 h-11 w-full rounded-2xl border border-[color:var(--line)] bg-white px-3.5 text-[13px] text-[color:var(--ink-2)] shadow-[var(--shadow-1)]"
                      />
                    </label>
                  </div>

                  <div className="mt-5 rounded-2xl bg-white p-3">
                    <div className="flex items-center gap-3 text-[12px] text-[color:var(--ink-4)]">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#fff4ed] text-[#fc4c02]">
                        <Layers3 size={15} />
                      </span>
                      <span>
                        Import raw rows first, then clean customers, payments, and usage rows for training.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {(importing || training) && (
                <ProgressCard
                  training={training}
                  progress={importProgress}
                  step={importStep}
                  phase={importPhase}
                />
              )}

              <div className="mt-5 flex flex-col gap-3 border-t border-[color:var(--line-2)] pt-5 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  disabled={importing || !pendingFile}
                  onClick={() => pendingFile && void handleImportFile(pendingFile)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-[13px] font-semibold text-white shadow-[0_16px_34px_rgba(252,76,2,0.18)] disabled:opacity-50 sm:min-w-[170px]"
                  style={{ background: IMPORT_ACCENT }}
                >
                  <FileSpreadsheet size={16} />
                  Upload and clean
                </button>
              </div>
          </div>
        </section>

        <ModelTrainingPanel
          sources={sortedSources}
          selectedSource={selectedSource}
          selectedCounts={selectedCleanCounts}
          readyCount={readySources.length}
          training={training}
          deletingId={deletingId}
          canTrain={canTrain}
          onTrain={() => void startTraining()}
          onSelect={(source) => setSelectedSourceId(source.id)}
          onDelete={(source) => void deleteSource(source)}
        />
      </div>

      {(importSuccess || importError) && !importing && (
        <ResultModal
          tone={importSuccess ? "ok" : "danger"}
          title={importSuccess ? "Dataset is ready" : "Action failed"}
          message={importSuccess ?? importError ?? ""}
          onClose={() => {
            setImportSuccess(null);
            setImportError(null);
          }}
        />
      )}
    </div>
  );
}

function FilePickerPanel({
  pendingFile,
  importing,
  fileInputRef,
  onFileChange,
}: {
  pendingFile: File | null;
  importing: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  onFileChange: (file: File) => void;
}) {
  return (
    <div className="rounded-[24px] border border-[color:var(--line)] bg-white p-4 shadow-[var(--shadow-1)]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          onFileChange(file);
        }}
      />

      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fff4ed] text-[#fc4c02]">
          <FileSpreadsheet size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[color:var(--ink-1)]">
            Source workbook
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[color:var(--ink-4)]">
            One `.xlsx` file with the required 8 sheets.
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-[22px] border border-[color:var(--line-2)]">
        <div className="border-b border-[color:var(--line-2)] bg-[color:var(--surface-2)] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
            Selected file
          </p>
        </div>

        {pendingFile ? (
          <div className="bg-[#fff8f4] px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-[#fc4c02] shadow-[var(--shadow-1)]">
                <FileSpreadsheet size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[color:var(--ink-1)]">
                  {pendingFile.name}
                </p>
                <p className="mt-1 text-[12px] text-[color:var(--ink-4)]">
                  {formatFileSize(pendingFile.size)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-7 text-center">
            <p className="text-[13px] font-medium text-[color:var(--ink-2)]">No file selected</p>
            <p className="mt-1 text-[12px] text-[color:var(--ink-5)]">
              Choose a workbook before uploading.
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={importing}
        onClick={() => fileInputRef.current?.click()}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[color:var(--line)] bg-white px-4 text-[13px] font-semibold text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Upload size={15} />
        {pendingFile ? "Change file" : "Choose file"}
      </button>
    </div>
  );
}

function ModelTrainingPanel({
  sources,
  selectedSource,
  selectedCounts,
  readyCount,
  training,
  deletingId,
  canTrain,
  onTrain,
  onSelect,
  onDelete,
}: {
  sources: TrainDataSource[];
  selectedSource: TrainDataSource | null;
  selectedCounts: CleanCounts | null;
  readyCount: number;
  training: boolean;
  deletingId: string | null;
  canTrain: boolean;
  onTrain: () => void;
  onSelect: (source: TrainDataSource) => void;
  onDelete: (source: TrainDataSource) => void;
}) {
  return (
    <section className="surface-elev overflow-hidden">
      <div className="border-b border-[color:var(--line-2)] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-5)]">
              Model training
            </p>
            <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)]">
              Select dataset and train
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[color:var(--ink-4)]">
              เลือก clean dataset ที่ import ไว้ใน DB แล้วกด train จากพื้นที่นี้ ไม่ใช้ card เลือก dataset แล้ว
            </p>
          </div>
          <button
            type="button"
            disabled={!canTrain || training}
            onClick={onTrain}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-[13px] font-semibold text-white shadow-[0_16px_34px_rgba(252,76,2,0.14)] disabled:opacity-50 xl:min-w-[190px]"
            style={{ background: IMPORT_ACCENT }}
          >
            {training ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
            {training ? "Training..." : "Train selected"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b border-[color:var(--line-2)] bg-[color:var(--surface-2)] p-5 xl:border-b-0 xl:border-r">
          <div className="rounded-[24px] border border-[color:var(--line)] bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
              Current dataset
            </p>
            <h3 className="mt-2 truncate text-[18px] font-semibold tracking-[-0.02em] text-[color:var(--ink-1)]">
              {selectedSource?.name || "No dataset selected"}
            </h3>
            <p className="mt-1 break-all text-[12px] leading-5 text-[color:var(--ink-4)]">
              {selectedSource?.original_filename || "Choose a ready row from the dataset table."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedSource ? (
                <StatusPill tone={statusTone(selectedSource.import_status)}>
                  {statusLabel(selectedSource.import_status)}
                </StatusPill>
              ) : (
                <StatusPill tone="neutral">No selection</StatusPill>
              )}
              <StatusPill tone="neutral" dot={false}>
                {readyCount} ready
              </StatusPill>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <DatasetCount label="Customers" value={selectedCounts?.customers} />
            <DatasetCount label="Payments" value={selectedCounts?.payments} />
            <DatasetCount label="Usage" value={selectedCounts?.usage} />
          </div>
        </div>

        <div className="p-5">
          {sources.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="No training dataset yet"
              hint="Upload one Excel file above. The system will import raw data and clean it automatically."
            />
          ) : (
            <div className="overflow-x-auto rounded-[22px] border border-[color:var(--line)]">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Dataset</th>
                    <th>Status</th>
                    <th className="text-right">Customers</th>
                    <th className="text-right">Payments</th>
                    <th className="text-right">Usage</th>
                    <th>Imported</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((source) => (
                    <DatasetTableRow
                      key={source.id}
                      source={source}
                      selected={selectedSource?.id === source.id}
                      deleting={deletingId === source.id}
                      onSelect={() => onSelect(source)}
                      onDelete={() => onDelete(source)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ResultModal({
  tone,
  title,
  message,
  onClose,
}: {
  tone: "ok" | "danger";
  title: string;
  message: string;
  onClose: () => void;
}) {
  const Icon = tone === "ok" ? CheckCircle2 : AlertCircle;
  const color = tone === "ok" ? "var(--ok)" : "var(--danger)";
  const bg = tone === "ok" ? "var(--ok-bg)" : "var(--danger-bg)";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4 px-5 py-5">
          <div className="flex items-start gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
              style={{ color, background: bg }}
            >
              <Icon size={22} />
            </span>
            <div>
              <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-[color:var(--ink-1)]">
                {title}
              </h3>
              <p className="mt-2 text-[13px] leading-6 text-[color:var(--ink-4)]">{message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[color:var(--ink-5)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--ink-2)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="border-t border-[color:var(--line-2)] bg-[color:var(--surface-2)] px-5 py-4 text-right">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-2xl px-4 text-[13px] font-semibold text-white"
            style={{ background: tone === "ok" ? IMPORT_ACCENT : "var(--danger)" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgressCard({
  training,
  progress,
  step,
  phase,
}: {
  training: boolean;
  progress: number;
  step: string;
  phase: "raw" | "clean" | null;
}) {
  const label = training
    ? "Training models"
    : phase === "clean"
      ? "Cleaning imported data"
      : "Importing raw data";

  return (
    <div className="mt-5 rounded-[24px] border border-[rgba(252,76,2,0.14)] bg-white p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[#fff4ed] text-[#fc4c02]">
          <RefreshCw size={15} className="animate-spin" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-[color:var(--ink-1)]">{label}</p>
            {!training && (
              <span className="num text-[13px] font-semibold text-[#fc4c02]">
                {progress}%
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12px] text-[color:var(--ink-4)]">
            {training
              ? "Refreshing active models after training completes."
              : step || "Processing..."}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <GradientProgressBar
          value={training ? 100 : Math.max(progress > 0 ? 4 : 0, progress)}
          indeterminate={training}
        />
      </div>
    </div>
  );
}

function DatasetTableRow({
  source,
  selected,
  deleting,
  onSelect,
  onDelete,
}: {
  source: TrainDataSource;
  selected: boolean;
  deleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const counts = getCleanCounts(source);
  const importer = source.importer_name ?? source.importer_email ?? source.imported_by ?? "-";
  const selectable = source.import_status === "ready";

  return (
    <tr className={selected ? "bg-[#fff8f4]" : undefined}>
      <td>
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 h-3 w-3 shrink-0 rounded-full border ${
              selected ? "border-[#fc4c02] bg-[#fc4c02]" : "border-[color:var(--ink-6)] bg-white"
            }`}
            aria-hidden
          />
          <div className="min-w-[220px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[color:var(--ink-1)]">{source.name}</span>
              {selected && (
                <StatusPill tone="neutral" dot={false}>
                  Selected
                </StatusPill>
              )}
              {source.client_label && (
                <StatusPill tone="neutral" dot={false}>
                  {source.client_label}
                </StatusPill>
              )}
            </div>
            <div className="mt-1 max-w-[360px] break-all text-[12px] text-[color:var(--ink-4)]">
              {source.original_filename}
            </div>
            {source.error_message && (
              <div className="mt-1 text-[12px] text-[color:var(--danger)]">{source.error_message}</div>
            )}
          </div>
        </div>
      </td>
      <td>
        <StatusPill tone={statusTone(source.import_status)}>
          {statusLabel(source.import_status)}
        </StatusPill>
      </td>
      <td className="num text-right">{counts?.customers.toLocaleString() ?? "-"}</td>
      <td className="num text-right">{counts?.payments.toLocaleString() ?? "-"}</td>
      <td className="num text-right">{counts?.usage.toLocaleString() ?? "-"}</td>
      <td>
        <div className="text-[12px] text-[color:var(--ink-4)]">
          {formatDate(source.imported_at || source.created_at)}
        </div>
        <div className="mt-0.5 text-[11px] text-[color:var(--ink-5)]">{importer}</div>
      </td>
      <td>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={!selectable}
            onClick={onSelect}
            className={`inline-flex h-9 items-center justify-center rounded-xl px-3 text-[12px] font-semibold disabled:opacity-45 ${
              selected
                ? "bg-[#fff4ed] text-[#fc4c02]"
                : "border border-[color:var(--line)] bg-white text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)]"
            }`}
          >
            {selected ? "Selected" : selectable ? "Select" : "Not ready"}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onDelete}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[color:var(--line)] bg-white px-3 text-[12px] font-medium text-[color:var(--ink-3)] hover:border-[color:var(--danger)] hover:bg-[color:var(--danger-bg)] hover:text-[color:var(--danger)] disabled:opacity-50"
          >
            {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}

function DatasetCount({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-2xl bg-[color:var(--surface-2)] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-5)]">
        {label}
      </p>
      <p className="num mt-1 text-[15px] font-semibold text-[color:var(--ink-1)]">
        {value == null ? "-" : value.toLocaleString()}
      </p>
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
          backgroundImage: IMPORT_PROGRESS_BG,
          boxShadow: "0 0 18px rgba(252,76,2,0.18)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage: "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.38) 50%, transparent 82%)",
        }}
      />
    </div>
  );
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

function statusTone(status: string): "ok" | "danger" | "neutral" | "info" {
  if (status === "ready") return "ok";
  if (status === "failed") return "danger";
  if (status === "cleaning" || status === "importing") return "info";
  return "neutral";
}

function statusLabel(status: string): string {
  if (status === "ready") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "cleaning") return "Cleaning";
  if (status === "importing") return "Importing";
  return "No dataset";
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH");
}

function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
