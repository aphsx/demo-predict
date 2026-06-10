"use client";
/**
 * Spec §2.5 — create-run section. Source dropdown is limited to
 * import_status === "ready"; run name defaults to `{source.name} — {today}`;
 * cutoff defaults to today (the API-suggested cutoff is not exposed yet —
 * helper text tells the user what to pick).
 */

import { useEffect, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { MockBadge } from "@/components/RunSelector";
import { SectionCard } from "@/components/ui";
import type { PredictDataSource } from "@/lib/api";
import { createPredictionRun } from "@/lib/mlApi";
import { getDisplayError } from "@/lib/ui-error";
import { defaultRunName, todayISO } from "./runs-utils";

const inputCls =
  "w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-[13px] text-[color:var(--ink-2)] disabled:opacity-50";
const labelCls = "text-[11px] font-medium text-[color:var(--ink-4)] block mb-1";

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
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a valid selection as the source list changes.
  useEffect(() => {
    if (sourceId && readySources.some((s) => s.id === sourceId)) return;
    setSourceId(readySources[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readySources.map((s) => s.id).join(",")]);

  // Default run name follows the selected source until the user edits it.
  const selected = readySources.find((s) => s.id === sourceId) ?? null;
  useEffect(() => {
    if (nameTouched) return;
    setName(selected ? defaultRunName(selected.name) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, nameTouched]);

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
      title={
        <span className="inline-flex items-center gap-2">
          Create prediction run
          <MockBadge />
        </span>
      }
      hint="เลือก source ที่ import เสร็จแล้ว ระบบจะรัน lifecycle / churn / CLV / credit forecast ให้ทุกลูกค้า"
    >
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_auto] gap-3 items-start">
        <div>
          <label className={labelCls}>Predict source</label>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            disabled={creating || readySources.length === 0}
            className={inputCls}
          >
            {readySources.length === 0 && <option value="">ยังไม่มี source ที่ ready</option>}
            {readySources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.client_label ? ` · ${s.client_label}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Run name</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            placeholder="ชื่อ run"
            disabled={creating || readySources.length === 0}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Cutoff date</label>
          <input
            type="date"
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
            disabled={creating || readySources.length === 0}
            className={inputCls}
          />
          <p className="text-[11px] text-[color:var(--ink-5)] mt-1">
            ควรเป็นวันที่ข้อมูลล่าสุดของ source
          </p>
        </div>
        <div className="md:pt-5">
          <button
            type="button"
            onClick={() => void create()}
            disabled={!canCreate}
            className="h-9 px-3.5 rounded-lg bg-[color:var(--moby-600)] text-white text-[13px] hover:bg-[color:var(--moby-700)] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {creating ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
            {creating ? "Creating…" : "Create run"}
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-3 rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-3 py-2 text-[12.5px] text-[color:var(--danger)]">
          {error}
        </div>
      )}
    </SectionCard>
  );
}
