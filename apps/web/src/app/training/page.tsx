"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import {
  Play, CheckCircle2, AlertCircle, RefreshCw, Database
} from "lucide-react";
import {
  PageHeader, SectionCard, StatusPill, Skeleton, EmptyState,
} from "@/components/ui";
import { fetchModelVersions, fetchActiveModelVersions, trainModels } from "@/lib/api";
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
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const [allVersions, activeArr] = await Promise.all([
        fetchModelVersions(),
        fetchActiveModelVersions(),
      ]);
      setVersions(Array.isArray(allVersions) ? allVersions : []);
      const map: ActiveVersions = {};
      (Array.isArray(activeArr) ? activeArr : []).forEach((v) => {
        map[v.model_type] = v;
      });
      setActiveVersions(map);
    } catch (e) {
      setVersions([]);
      setActiveVersions({});
      setLoadError(getDisplayError(e, "Failed to load model versions"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
      <div className="space-y-6">
        <PageHeader title="Model Training" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  const modelTypes = ["churn", "clv", "credit", "winback", "conversion"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Model Training"
        actions={
          <button
            onClick={startTraining}
            disabled={training}
            className="flex items-center gap-2 px-4 py-2 bg-[color:var(--moby-600)] text-white rounded-lg text-sm font-medium hover:bg-[color:var(--moby-700)] disabled:opacity-50"
          >
            {training ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
            {training ? "Training..." : "Train New Models"}
          </button>
        }
      />
      <p className="px-8 text-sm text-[color:var(--ink-4)] -mt-4 mb-2">Monitor model versions and trigger new training runs</p>

      {loadError && (
        <p className="px-8 text-sm text-[color:var(--danger)]">{loadError}</p>
      )}

      {/* Active Versions Summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {modelTypes.map(type => {
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
                    v {active.version}
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
                  {active ? "v1" : "—"}
                </StatusPill>
              </div>
            </SectionCard>
          );
        })}
      </div>

      {/* All Versions */}
      <SectionCard title="All Model Versions" hint="Historical model versions across all types">
        <div className="space-y-3">
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
                  {versions.map(v => (
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
        </div>
      </SectionCard>
    </div>
  );
}
