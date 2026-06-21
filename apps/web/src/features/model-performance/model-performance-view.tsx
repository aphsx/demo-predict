"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import {
  activateModelVersion,
  fetchModelPerformance,
  fetchModelVersions,
  type ModelPerfEntry,
  type ModelVersionSummary,
} from "@/lib/ml-api";
import { ChurnDiagnostics } from "./churn-diagnostics";
import { metricInfo } from "./metric-info";

export function ModelPerformanceView() {
  const [entries, setEntries] = useState<ModelPerfEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetchModelPerformance()
      .then(setEntries)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "โหลด model performance ไม่สำเร็จ")
      );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="pb-12">
      <PageHeader
        eyebrow="Model accuracy"
        title="Model Accuracy"
      />

      <div className="px-8 mt-4 space-y-5">
        <p className="max-w-4xl text-[12.5px] leading-6 text-[color:var(--ink-4)]">
          Production values come from backend evaluations persisted in the model registry. No metric is hardcoded in the UI.
        </p>

        {error && <EmptyState icon={Activity} title="โหลด model performance ไม่สำเร็จ" hint={error} />}

        {!error && entries === null && (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-[26px]" />
            ))}
          </section>
        )}

        {!error && entries?.length === 0 && (
          <EmptyState
            icon={Activity}
            title="ยังไม่มี model evaluation"
            hint="รัน training ให้สำเร็จก่อน หน้านี้จะแสดง champion metrics จาก registry"
          />
        )}

        {!error && entries && entries.length > 0 && (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {entries.map((entry) => (
              <MetricSummaryCard key={entry.model_type} entry={entry} onChanged={load} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

const SWITCHABLE_TYPES = new Set(["churn", "clv", "credit"]);

function MetricSummaryCard({
  entry,
  onChanged,
}: {
  entry: ModelPerfEntry;
  onChanged: () => Promise<unknown> | void;
}) {
  const primary = entry.primary_metric;
  const primaryInfo = metricInfo(primary.name);
  const split = entry.splits.find((item) => item.split === "test") ?? entry.splits[0] ?? null;
  const metricRows = split
    ? Object.entries(split.metrics)
        .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
        .slice(0, 4)
    : [];

  return (
    <section className="surface lift p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-5)]">
        {entry.model_type}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-[color:var(--ink-3)]">
          {entry.method}
        </span>
        <span className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-[color:var(--ink-3)]">
          {entry.algorithm}
        </span>
      </div>

      <p className="mt-5 text-[12px] font-semibold text-[color:var(--ink-5)]" title={primaryInfo.tooltip}>
        {primaryInfo.label}
      </p>
      <p className="num mt-1 text-[34px] font-semibold leading-none">
        {formatMetric(primary.value)}
      </p>
      {primary.baseline !== undefined && (
        <p className="mt-1 text-[11.5px] text-[color:var(--ink-5)]">
          baseline {primary.baseline_name ?? "baseline"}:{" "}
          <span className="num">{formatMetric(primary.baseline)}</span>
        </p>
      )}

      <div className="mt-5 space-y-3">
        {metricRows.map(([name, value]) => {
          const info = metricInfo(name);
          return (
          <div key={name} className="grid grid-cols-[1fr_auto] gap-4 rounded-xl bg-gray-50 px-3 py-2.5">
            <p className="text-[12px] font-semibold text-[color:var(--ink-2)]" title={info.tooltip}>
              {info.label}
            </p>
            <p className="num text-[15px] font-semibold">{formatMetric(value)}</p>
          </div>
          );
        })}
      </div>

      {entry.competition && entry.competition.length > 0 && (
        <CandidateCompetition competition={entry.competition} />
      )}

      <div className="mt-4 space-y-1 text-[11.5px] leading-5 text-[color:var(--ink-5)]">
        {entry.version && <p>version: {entry.version}</p>}
        {entry.trained_at && <p>trained: {new Date(entry.trained_at).toLocaleString()}</p>}
        {entry.dataset_rows != null && <p>rows: {entry.dataset_rows.toLocaleString()}</p>}
      </div>

      {entry.notes ? (
        <p className="mt-4 text-[11.5px] leading-5 text-[color:var(--ink-5)]">{entry.notes}</p>
      ) : null}

      {entry.model_type === "churn" && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <ChurnDiagnostics entry={entry} />
        </div>
      )}

      {SWITCHABLE_TYPES.has(entry.model_type) && (
        <ModelVersionSwitcher modelType={entry.model_type} onChanged={onChanged} />
      )}
    </section>
  );
}

function ModelVersionSwitcher({
  modelType,
  onChanged,
}: {
  modelType: string;
  onChanged: () => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<ModelVersionSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && versions === null) {
      fetchModelVersions(modelType)
        .then(setVersions)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "โหลดเวอร์ชันไม่สำเร็จ"));
    }
  }

  async function activate(versionId: string) {
    setBusyId(versionId);
    setError(null);
    try {
      await activateModelVersion(modelType, versionId);
      await onChanged();
      setVersions(await fetchModelVersions(modelType));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เปลี่ยนโมเดลไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={toggle}
        className="text-[11.5px] font-semibold text-[color:var(--ink-3)] hover:underline"
      >
        {open ? "ซ่อนเวอร์ชัน" : "เปลี่ยนโมเดล production →"}
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          {versions === null && !error && (
            <p className="text-[11px] text-[color:var(--ink-5)]">กำลังโหลด…</p>
          )}
          {versions?.length === 0 && (
            <p className="text-[11px] text-[color:var(--ink-5)]">ยังไม่มีเวอร์ชัน</p>
          )}
          {versions?.map((v) => (
            <div
              key={v.id}
              className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-medium text-[color:var(--ink-2)]">
                  {v.version} · {v.algorithm || "—"}
                </p>
                <p className="text-[10.5px] text-[color:var(--ink-5)]">
                  {v.primary_metric_name}:{" "}
                  {v.primary_metric_value != null ? v.primary_metric_value.toFixed(4) : "—"}
                </p>
              </div>
              {v.is_active ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  production
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => activate(v.id)}
                  className="rounded-full bg-gray-900 px-2.5 py-1 text-[10.5px] font-semibold text-white disabled:opacity-50"
                >
                  {busyId === v.id ? "กำลังเปลี่ยน…" : "ใช้ตัวนี้"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateCompetition({
  competition,
}: {
  competition: NonNullable<ModelPerfEntry["competition"]>;
}) {
  const metric = competition[0]?.cv_metric ?? "CV score";
  const champion = competition.find((c) => c.is_champion);
  return (
    <div className="mt-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-5)]">
        Candidate competition · {metric}
      </p>
      <div className="mt-2 space-y-1">
        {competition.map((c) => (
          <div
            key={c.algorithm}
            className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-gray-50 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-[color:var(--ink-2)]">{c.algorithm}</span>
              {c.is_champion && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  🏆 Production
                </span>
              )}
              {!c.is_champion && c.gate_passed === false && (
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-[color:var(--ink-5)]">
                  ไม่ผ่าน gate
                </span>
              )}
            </div>
            <span className="num text-[13px] font-semibold">
              {c.cv_score != null ? c.cv_score.toFixed(4) : "—"}
            </span>
          </div>
        ))}
      </div>
      {champion?.reason && (
        <p className="mt-2 text-[11px] leading-5 text-[color:var(--ink-5)]">
          เหตุผลที่เลือก: {champion.reason}
        </p>
      )}
    </div>
  );
}

function formatMetric(value: number | string): string {
  if (typeof value === "string") return value;
  if (Number.isInteger(value) && Math.abs(value) >= 10) return value.toLocaleString();
  return value.toFixed(value < 1 ? 3 : 2);
}
