"use client";
/**
 * Create-run card (redesigned). One card does the whole job:
 *   pick (or import) a predict source → name → Run.
 * Cutoff is auto-managed and only surfaces in Advanced; per-run model
 * overrides also live in Advanced. Importing a new source happens inline
 * via the "+ import ใหม่" toggle next to the source picker — there is no
 * separate data-sources section anymore.
 */

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FileSpreadsheet,
  Play,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  UploadCloud,
  X,
} from "lucide-react";
import { SectionCard } from "@/components/ui";
import { uploadPredictDataFile, type PredictDataSource } from "@/lib/api";
import {
  createPredictionRun,
  fetchModelVersions,
  fetchPredictSuggestedCutoff,
  type ModelVersionSummary,
} from "@/lib/ml-api";
import { getDisplayError } from "@/lib/ui-error";
import {
  defaultRunName,
  formatDate,
  formatRelative,
  getCleanCounts,
  todayISO,
} from "./runs-utils";

const MODEL_TYPES = ["churn", "clv", "credit"] as const;
type ModelType = (typeof MODEL_TYPES)[number];

const fieldCls =
  "mt-1.5 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3.5 text-[13px] text-[color:var(--ink-2)] shadow-[var(--shadow-1)] outline-none transition-colors focus:border-[color:var(--moby-500)] disabled:opacity-50";

export function CreateRunPanel({
  sources,
  onRefresh,
}: {
  sources: PredictDataSource[];
  onRefresh: () => Promise<void>;
}) {
  const readySources = sources.filter((s) => s.import_status === "ready");

  const [sourceId, setSourceId] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  // Prediction cutoff is fully auto-managed (the as-of date = latest data in the
  // source). It is computed from the API suggestion and sent to the run, but is
  // not user-editable — there is no legitimate non-replay reason to override it.
  const [cutoff, setCutoff] = useState(todayISO());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-run model selection. "" = use the production champion for that type.
  const [versionsByType, setVersionsByType] = useState<Record<ModelType, ModelVersionSummary[]>>({
    churn: [],
    clv: [],
    credit: [],
  });
  const [overrides, setOverrides] = useState<Record<ModelType, string>>({
    churn: "",
    clv: "",
    credit: "",
  });

  useEffect(() => {
    let alive = true;
    Promise.all(MODEL_TYPES.map((t) => fetchModelVersions(t).catch(() => [])))
      .then(([churn, clv, credit]) => {
        if (alive) setVersionsByType({ churn, clv, credit });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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
    setCutoff("");
    if (!selected) return;
    let alive = true;
    fetchPredictSuggestedCutoff(selected.id)
      .then(({ suggested_cutoff }) => {
        if (alive) setCutoff(suggested_cutoff);
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
      const modelOverrides: { churn?: string; clv?: string; credit?: string } = {};
      for (const modelType of MODEL_TYPES) {
        if (overrides[modelType]) modelOverrides[modelType] = overrides[modelType];
      }
      await createPredictionRun({
        predict_source_id: sourceId,
        name: name.trim(),
        cutoff_date: cutoff,
        ...(Object.keys(modelOverrides).length > 0 ? { model_overrides: modelOverrides } : {}),
      });
      setNameTouched(false);
      setName(selected ? defaultRunName(selected.name) : "");
      await onRefresh();
    } catch (e) {
      setError(getDisplayError(e, "สร้าง prediction run ไม่สำเร็จ") ?? "สร้าง prediction run ไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  };

  const counts = selected ? getCleanCounts(selected) : null;

  return (
    <SectionCard
      eyebrow="Prediction runs"
      title="สร้าง prediction run"
      hint="เลือกข้อมูล ตั้งชื่อ แล้วกดรัน — ระบบจัดการ cutoff และรัน lifecycle / churn / CLV / credit ให้ทุกลูกค้า"
      right={
        <button
          type="button"
          onClick={() => void create()}
          disabled={!canCreate}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[color:var(--moby-600)] px-4 text-[13px] font-semibold text-white shadow-[0_16px_34px_rgba(0,107,255,0.14)] hover:bg-[color:var(--moby-800)] disabled:opacity-50 sm:min-w-[140px]"
        >
          {creating ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
          {creating ? "กำลังรัน…" : "รัน"}
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="relative">
          <span className="type-label">แหล่งข้อมูล</span>
          <div className="mt-1.5 flex items-center gap-2">
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              disabled={creating || readySources.length === 0}
              className="h-11 min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white px-3.5 text-[13px] text-[color:var(--ink-2)] shadow-[var(--shadow-1)] outline-none transition-colors focus:border-[color:var(--moby-500)] disabled:opacity-50"
            >
              {readySources.length === 0 && <option value="">ยังไม่มี source ที่ ready</option>}
              {readySources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.client_label ? ` · ${s.client_label}` : ""}
                </option>
              ))}
            </select>
            <ImportToggleButton onImported={onRefresh} />
          </div>
          {selected && (
            <p className="mt-2 text-[12px] text-[color:var(--ink-5)]">
              {counts ? `${counts.customers.toLocaleString()} ลูกค้า · ` : ""}
              นำเข้า {formatRelative(selected.imported_at)}
              {cutoff ? ` · ทำนาย ณ ${formatDate(cutoff)} (อัตโนมัติ)` : ""}
            </p>
          )}
        </div>

        <label className="block">
          <span className="type-label">ชื่อ run</span>
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
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[color:var(--ink-3)] hover:text-[color:var(--moby-600)]"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${showAdvanced ? "rotate-0" : "-rotate-90"}`}
          />
          <SlidersHorizontal size={13} />
          ตั้งค่าขั้นสูง — เลือกเวอร์ชันโมเดล
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-4">
            <div>
              <span className="type-label">เลือกโมเดลต่อ run</span>
              <p className="mt-1 mb-2 text-[12px] leading-5 text-[color:var(--ink-4)]">
                ปล่อยเป็น &quot;Production (ปัจจุบัน)&quot; เพื่อใช้ champion — หรือเลือกเวอร์ชันเจาะจงสำหรับ run นี้
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {MODEL_TYPES.map((modelType) => (
                  <label key={modelType} className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ink-5)]">
                      {modelType}
                    </span>
                    <select
                      value={overrides[modelType]}
                      onChange={(e) =>
                        setOverrides((prev) => ({ ...prev, [modelType]: e.target.value }))
                      }
                      disabled={creating}
                      className={fieldCls}
                    >
                      <option value="">Production (ปัจจุบัน)</option>
                      {versionsByType[modelType].map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.version}
                          {v.is_active ? " · production" : ""} · {v.algorithm || "—"}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          </div>
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

/** "+ import ใหม่" toggle that reveals an inline upload form. */
function ImportToggleButton({ onImported }: { onImported: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3.5 text-[12.5px] font-semibold text-[color:var(--moby-600)] shadow-[var(--shadow-1)] hover:bg-gray-50"
      >
        <Plus size={14} />
        import ใหม่
      </button>
      {open && (
        <InlineImportForm
          onClose={() => setOpen(false)}
          onImported={async () => {
            await onImported();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function InlineImportForm({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doImport = async () => {
    if (!file || busy) return;
    const datasetName = name.trim() || file.name.replace(/\.xlsx$/i, "");
    setBusy(true);
    setError(null);
    try {
      await uploadPredictDataFile(file, datasetName, clientLabel.trim() || undefined);
      await onImported();
    } catch (e) {
      setError(getDisplayError(e, "นำเข้าข้อมูลไม่สำเร็จ") ?? "นำเข้าข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute left-0 right-0 top-full z-10 mt-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_20px_48px_rgba(13,17,35,0.12)]">
      <div className="flex items-center justify-between">
        <span className="type-label">นำเข้า predict data ใหม่ (.xlsx 8 sheets)</span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ink-5)] hover:bg-gray-50"
          aria-label="ปิด"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] sm:items-end">
        <div>
          <span className="type-label">ไฟล์ Excel</span>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3.5 text-[12.5px] font-semibold text-[color:var(--moby-600)] shadow-[var(--shadow-1)] hover:bg-gray-50 disabled:opacity-40"
            >
              <FileSpreadsheet size={14} />
              เลือกไฟล์
            </button>
            <span className="min-w-0 truncate text-[12px] text-[color:var(--ink-4)]" title={file?.name}>
              {file ? file.name : "ยังไม่ได้เลือก"}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
          </div>
        </div>

        <label className="block">
          <span className="type-label">ชื่อ</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={file ? file.name.replace(/\.xlsx$/i, "") : "เช่น Customers 2026-06"}
            disabled={busy}
            className={fieldCls}
          />
        </label>

        <label className="block">
          <span className="type-label">Client label</span>
          <input
            value={clientLabel}
            onChange={(e) => setClientLabel(e.target.value)}
            placeholder="optional"
            disabled={busy}
            className={fieldCls}
          />
        </label>

        <button
          type="button"
          onClick={() => void doImport()}
          disabled={busy || !file}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[color:var(--moby-600)] px-4 text-[13px] font-semibold text-white shadow-[0_16px_34px_rgba(0,107,255,0.14)] hover:bg-[color:var(--moby-800)] disabled:opacity-50"
        >
          {busy ? <RefreshCw size={16} className="animate-spin" /> : <UploadCloud size={16} />}
          {busy ? "กำลังนำเข้า…" : "Import"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-3 py-2 text-[12px] text-[color:var(--danger)]">
          {error}
        </div>
      )}
    </div>
  );
}
