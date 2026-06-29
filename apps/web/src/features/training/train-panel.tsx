"use client";
/**
 * Train card (redesigned). One card does the whole job:
 *   pick (or upload) a Ready dataset → Train.
 * Cutoff is auto-managed and only surfaces in Advanced (with horizon).
 * Uploading a new dataset happens inline via the "upload ใหม่" toggle next to
 * the dataset picker — there is no separate dataset table anymore.
 */

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FileSpreadsheet,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { SectionCard } from "@/components/ui";
import type { TrainDataSource } from "@/lib/api";
import { ProgressCard } from "./progress-card";
import { formatFileSize, getCleanCounts, PRIMARY_BUTTON_CLS } from "./training-utils";
import { DEFAULT_HORIZON_DAYS } from "./training-run-utils";

const fieldCls =
  "mt-1.5 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3.5 text-[13px] text-[color:var(--ink-2)] shadow-[var(--shadow-1)] outline-none transition-colors focus:border-[color:var(--moby-500)] disabled:opacity-50";

export function TrainPanel({
  readySources,
  selectedSource,
  onSelect,
  onDeleteSource,
  onUpload,
  importing,
  importProgress,
  importStep,
  importPhase,
  suggestedCutoff,
  latestDataDate,
  creating,
  onTrain,
}: {
  readySources: TrainDataSource[];
  selectedSource: TrainDataSource | null;
  onSelect: (id: string) => void;
  onDeleteSource: (source: TrainDataSource) => void;
  onUpload: (file: File) => void;
  importing: boolean;
  importProgress: number;
  importStep: string;
  importPhase: "raw" | "clean" | null;
  suggestedCutoff: string | null;
  latestDataDate: string | null;
  creating: boolean;
  onTrain: (input: { cutoff_date: string; horizon_days: number }) => void;
}) {
  const [cutoffDate, setCutoffDate] = useState("");
  const [cutoffTouched, setCutoffTouched] = useState(false);
  const [horizonDays, setHorizonDays] = useState<number>(DEFAULT_HORIZON_DAYS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCutoffTouched(false);
    setCutoffDate("");
    setHorizonDays(DEFAULT_HORIZON_DAYS);
  }, [selectedSource?.id]);

  useEffect(() => {
    if (suggestedCutoff && !cutoffTouched) setCutoffDate(suggestedCutoff);
  }, [suggestedCutoff, cutoffTouched]);

  const horizonValid = Number.isInteger(horizonDays) && horizonDays > 0;
  const canTrain = Boolean(selectedSource) && Boolean(cutoffDate) && horizonValid && !creating;
  const counts = selectedSource ? getCleanCounts(selectedSource) : null;

  return (
    <SectionCard
      eyebrow="Training"
      title="เริ่มเทรน"
      hint="เลือก dataset แล้วกดเทรน — ระบบจัดการ cutoff, leakage และเลือกโมเดลที่ดีที่สุดให้อัตโนมัติ"
      right={
        <button
          type="button"
          disabled={!canTrain}
          onClick={() => onTrain({ cutoff_date: cutoffDate, horizon_days: horizonDays })}
          className={`${PRIMARY_BUTTON_CLS} sm:min-w-[140px]`}
        >
          {creating ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
          {creating ? "กำลังเริ่ม…" : "เทรน"}
        </button>
      }
    >
      <div className="relative">
        <span className="type-label">dataset</span>
        <div className="mt-1.5 flex items-center gap-2">
          <select
            value={selectedSource?.id ?? ""}
            onChange={(e) => onSelect(e.target.value)}
            disabled={creating || readySources.length === 0}
            className="h-11 min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white px-3.5 text-[13px] text-[color:var(--ink-2)] shadow-[var(--shadow-1)] outline-none transition-colors focus:border-[color:var(--moby-500)] disabled:opacity-50"
          >
            {readySources.length === 0 && <option value="">ยังไม่มี dataset ที่ ready</option>}
            {readySources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.client_label ? ` · ${s.client_label}` : ""}
              </option>
            ))}
          </select>
          {selectedSource && (
            <button
              type="button"
              onClick={() => onDeleteSource(selectedSource)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-[color:var(--ink-4)] shadow-[var(--shadow-1)] hover:border-[color:var(--danger)] hover:bg-[color:var(--danger-bg)] hover:text-[color:var(--danger)]"
              title="ลบ dataset นี้"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowUpload((v) => !v)}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3.5 text-[12.5px] font-semibold text-[color:var(--moby-600)] shadow-[var(--shadow-1)] hover:bg-gray-50"
          >
            <UploadCloud size={14} />
            upload ใหม่
          </button>
        </div>

        <p className="mt-2 text-[12px] text-[color:var(--ink-5)]">
          {selectedSource
            ? `${counts ? `${counts.customers.toLocaleString()} แถว · ` : ""}cutoff อัตโนมัติ: ${
                cutoffDate || "—"
              } · horizon ${horizonDays} วัน`
            : "เลือก dataset ที่ Ready หรือ upload ไฟล์ Excel ใหม่"}
        </p>

        {showUpload && (
          <UploadForm
            uploadRef={uploadRef}
            importing={importing}
            onClose={() => setShowUpload(false)}
            onUpload={onUpload}
          />
        )}
      </div>

      {importing && (
        <ProgressCard
          training={false}
          progress={importProgress}
          step={importStep}
          phase={importPhase}
        />
      )}

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
          ตั้งค่าขั้นสูง — cutoff override, horizon
        </button>
        {showAdvanced && (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="type-label">Manual cutoff override</span>
              <input
                type="date"
                value={cutoffDate}
                onChange={(e) => {
                  setCutoffDate(e.target.value);
                  setCutoffTouched(true);
                }}
                className={`${fieldCls} max-w-[240px]`}
              />
              <span className="mt-1.5 block text-[12px] leading-5 text-[color:var(--ink-4)]">
                {cutoffTouched
                  ? "Manual override — API จะ block ถ้า history หรือ label horizon ไม่ครบ"
                  : latestDataDate
                    ? `Auto · ข้อมูลล่าสุด ${latestDataDate}; เลือก cutoff นี้เพื่อกัน leakage`
                    : "Auto — ระบบเลือก cutoff ล่าสุดที่ยังมี label horizon ครบ"}
              </span>
            </label>
            <label className="block">
              <span className="type-label">Horizon (days)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={Number.isNaN(horizonDays) ? "" : horizonDays}
                onChange={(e) => setHorizonDays(Number.parseInt(e.target.value, 10))}
                className={`${fieldCls} max-w-[200px]`}
              />
              <span className="mt-1.5 block text-[12px] leading-5 text-[color:var(--ink-4)]">
                default {DEFAULT_HORIZON_DAYS} วัน — เปลี่ยนเฉพาะเมื่อรู้ว่าทำอะไรอยู่
              </span>
              {!horizonValid && (
                <span className="mt-1 block text-[12px] text-[color:var(--danger)]">
                  Horizon ต้องเป็นจำนวนวันที่มากกว่า 0
                </span>
              )}
            </label>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function UploadForm({
  uploadRef,
  importing,
  onClose,
  onUpload,
}: {
  uploadRef: React.RefObject<HTMLInputElement>;
  importing: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <div className="absolute left-0 right-0 top-full z-10 mt-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_20px_48px_rgba(13,17,35,0.12)]">
      <div className="flex items-center justify-between">
        <span className="type-label">นำเข้า dataset ใหม่ (.xlsx 8 sheets)</span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ink-5)] hover:bg-gray-50"
          aria-label="ปิด"
        >
          <X size={14} />
        </button>
      </div>

      <input
        ref={uploadRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          disabled={importing}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3.5 text-[12.5px] font-semibold text-[color:var(--moby-600)] shadow-[var(--shadow-1)] hover:bg-gray-50 disabled:opacity-40"
        >
          <FileSpreadsheet size={14} />
          เลือกไฟล์
        </button>
        <span className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--ink-4)]" title={file?.name}>
          {file ? `${file.name} · ${formatFileSize(file.size)}` : "ยังไม่ได้เลือกไฟล์"}
        </span>
        <button
          type="button"
          onClick={() => {
            if (!file) return;
            onUpload(file);
            setFile(null);
            onClose();
          }}
          disabled={importing || !file}
          className={PRIMARY_BUTTON_CLS}
        >
          <UploadCloud size={16} />
          Upload and clean
        </button>
      </div>
    </div>
  );
}
