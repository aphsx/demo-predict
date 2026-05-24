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
  Play, CheckCircle2, AlertCircle, RefreshCw, Database, Upload, FileSpreadsheet,
} from "lucide-react";
import {
  PageHeader, SectionCard, StatusPill, Skeleton, EmptyState,
} from "@/components/ui";
import {
  fetchModelVersions,
  fetchActiveModelVersions,
  trainModels,
  fetchTrainDataSources,
  uploadTrainDataFile,
  type TrainDataSource,
} from "@/lib/api";
import { getDisplayError } from "@/lib/ui-error";
import { useSession } from "@/lib/auth-client";

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
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;

  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [activeVersions, setActiveVersions] = useState<ActiveVersions>({});
  const [trainSources, setTrainSources] = useState<TrainDataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importName, setImportName] = useState("");
  const [importClient, setImportClient] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
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
    try {
      await uploadTrainDataFile(
        file,
        name,
        importClient.trim() || undefined
      );
      setImportName("");
      await load();
    } catch (e) {
      setImportError(getDisplayError(e, "Import failed"));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
          Import Excel training data (raw) then train models when clean pipeline is ready
        </p>

        {/* [NEW] Train raw import — replaces filesystem-only training data for new pipeline */}
        <SectionCard
          title="Training data (raw)"
          hint="Imports are tied to your account (imported_by) — you only see datasets you uploaded"
        >
          {session?.user && (
            <p className="text-[13px] text-[color:var(--ink-4)] mb-3">
              Signed in as{" "}
              <span className="font-medium text-[color:var(--ink-1)]">
                {session.user.name || session.user.email}
              </span>
              {session.user.email && session.user.name ? (
                <span className="text-[color:var(--ink-5)]"> ({session.user.email})</span>
              ) : null}
            </p>
          )}
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
                  if (f) void handleImportFile(f);
                }}
              />
              <button
                type="button"
                disabled={importing || !session?.user}
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-3 rounded-lg border border-[color:var(--line)] bg-white text-[13px] hover:bg-[color:var(--surface-1)] inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {importing ? (
                  <RefreshCw size={15} className="animate-spin" />
                ) : (
                  <Upload size={15} />
                )}
                {importing ? "Importing…" : "Import .xlsx"}
              </button>
            </div>
          </div>
          {importError && (
            <p className="mt-3 text-[13px] text-[color:var(--danger)]">{importError}</p>
          )}
          {trainSources.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={FileSpreadsheet}
                title="No training datasets yet"
                hint={
                  session?.user
                    ? "Upload an 8-sheet Excel file — it will be linked to your account"
                    : "Sign in to import training data"
                }
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
                  </tr>
                </thead>
                <tbody>
                  {trainSources.map((s) => (
                    <tr
                      key={s.id}
                      className={`border-b border-[color:var(--line)] ${
                        s.imported_by === currentUserId ? "bg-[color:var(--moby-50)]/40" : ""
                      }`}
                    >
                      <td className="py-2 px-2 font-medium text-[color:var(--ink-1)]">
                        {s.name}
                        {s.is_mine && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-[color:var(--moby-700)]">
                            yours
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-[color:var(--ink-4)] text-xs">{s.original_filename}</td>
                      <td className="py-2 px-2">
                        <StatusPill tone={s.import_status === "ready" ? "ok" : s.import_status === "failed" ? "danger" : "neutral"}>
                          {s.import_status}
                        </StatusPill>
                      </td>
                      <td className="py-2 px-2 text-[color:var(--ink-4)] text-xs">
                        {s.importer?.name ?? s.importer?.email ?? "—"}
                      </td>
                      <td className="py-2 px-2 text-[color:var(--ink-4)] text-xs">
                        {s.imported_at
                          ? new Date(s.imported_at).toLocaleString("th-TH")
                          : new Date(s.created_at).toLocaleString("th-TH")}
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
