"use client";
/**
 * Spec §2.5 — create-run section. Source dropdown is limited to
 * import_status === "ready"; run name defaults to `{source.name} — {today}`;
 * cutoff is auto-managed from the API-suggested cutoff of the selected source
 * (latest observed activity + 1). Manual override is hidden in Advanced.
 */

import { useEffect, useState } from "react";
import { Play, RefreshCw, SlidersHorizontal } from "lucide-react";
import { SectionCard } from "@/components/ui";
import type { PredictDataSource } from "@/lib/api";
import { createPredictionRun, fetchPredictSuggestedCutoff } from "@/lib/ml-api";
import { getDisplayError } from "@/lib/ui-error";
import { defaultRunName, todayISO } from "./runs-utils";

const fieldCls =
  "mt-1.5 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3.5 text-[13px] text-[color:var(--ink-2)] shadow-[var(--shadow-1)] outline-none transition-colors focus:border-[color:var(--moby-500)] disabled:opacity-50";

export function CreateRunPanel({
  sources,
  onCreated,
}: {
  sources: PredictDataSource[];
  onCreated: () => Promise<void>;
}) {
  const readySources = sources.filter((s) => s.import_status === "ready");

  const [sourceId, setSourceId] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [cutoff, setCutoff] = useState(todayISO());
  const [cutoffTouched, setCutoffTouched] = useState(false);
  const [latestDataDate, setLatestDataDate] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sourceId && readySources.some((s) => s.id === sourceId)) return;
    setSourceId(readySources[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readySources.map((s) => s.id).join(",")]);

  const selected = readySources.find((s) => s.id === sourceId) ?? null;
  useEffect(() => {
    if (nameTouched) return;
    setName(selected ? defaultRunName(selected.name) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, nameTouched]);

  useEffect(() => {
    if (!selected) return;
    setCutoffTouched(false);
    setLatestDataDate(null);
    setCutoff("");
    let alive = true;
    fetchPredictSuggestedCutoff(selected.id)
      .then(({ suggested_cutoff, latest_data_date }) => {
        if (!alive) return;
        setLatestDataDate(latest_data_date);
        setCutoffTouched((touched) => {
          if (!touched) setCutoff(suggested_cutoff);
          return touched;
        });
      })
      .catch(() => {
        // Keep the local fallback when no suggestion is available.
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const canCreate = Boolean(sourceId && name.trim() && cutoff && !creating);

  const create = async () => {
    if (!canCreate) return;
    setCreating(true);
    setError(null);
    try {
      await createPredictionRun({
        predict_source_id: sourceId,
        name: name.trim(),
        cutoff_date: cutoff,
      });
      setNameTouched(false);
      setName(selected ? defaultRunName(selected.name) : "");
      await onCreated();
    } catch (e) {
      setError(getDisplayError(e, "สร้าง prediction run ไม่สำเร็จ") ?? "สร้าง prediction run ไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  };

  return (
    <SectionCard
      eyebrow="Prediction runs"
      title="Create prediction run"
      hint="เลือก source ที่ import เสร็จแล้ว ระบบจะรัน lifecycle / churn / CLV / credit forecast ให้ทุกลูกค้า"
      right={
        <button
          type="button"
          onClick={() => void create()}
          disabled={!canCreate}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[color:var(--moby-600)] px-4 text-[13px] font-semibold text-white shadow-[0_16px_34px_rgba(0,107,255,0.14)] hover:bg-[color:var(--moby-800)] disabled:opacity-50 sm:min-w-[150px]"
        >
          {creating ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
          {creating ? "Creating…" : "Create run"}
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.95fr)]">
        <label className="block">
          <span className="type-label">Predict source</span>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            disabled={creating || readySources.length === 0}
            className={fieldCls}
          >
            {readySources.length === 0 && <option value="">ยังไม่มี source ที่ ready</option>}
            {readySources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.client_label ? ` · ${s.client_label}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="type-label">Run name</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            placeholder="ชื่อ run"
            disabled={creating || readySources.length === 0}
            className={fieldCls}
          />
        </label>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="type-label">Prediction cutoff</span>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-5)]">
              {cutoffTouched ? "Manual" : "Auto"}
            </span>
          </div>
          <p className="num mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[color:var(--ink-1)]">
            {cutoff || "Waiting for source"}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[color:var(--ink-4)]">
            {latestDataDate
              ? `ข้อมูลล่าสุด ${latestDataDate}; predict as-of วันถัดไป`
              : "ระบบเลือกจากวันที่ข้อมูลล่าสุดของ source"}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-medium text-[color:var(--ink-3)] hover:bg-gray-50"
        >
          <SlidersHorizontal size={13} />
          Advanced
        </button>
        {showAdvanced && (
          <label className="mt-3 block max-w-[260px]">
            <span className="type-label">Manual cutoff override</span>
            <input
              type="date"
              value={cutoff}
              onChange={(e) => {
                setCutoff(e.target.value);
                setCutoffTouched(true);
              }}
              disabled={creating || readySources.length === 0}
              className={fieldCls}
            />
            <p className="mt-1.5 text-[12px] leading-5 text-[color:var(--ink-4)]">
              ใช้เฉพาะกรณีต้อง replay prediction ณ วันอื่นของ dataset เดิม
            </p>
          </label>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
          {error}
        </div>
      )}
    </SectionCard>
  );
}
