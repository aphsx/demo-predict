"use client";
/**
 * Spec §2.5 — top section: predict_data_sources table + import panel.
 * Predict import endpoints are real (lib/api.ts); a simple busy state is
 * enough — no progress stream for predict imports.
 */

import { useRef, useState } from "react";
import { FileSpreadsheet, RefreshCw, UploadCloud } from "lucide-react";
import { EmptyState, SectionCard, Skeleton, StatusPill } from "@/components/ui";
import { uploadPredictDataFile, type PredictDataSource } from "@/lib/api";
import { getDisplayError } from "@/lib/ui-error";
import {
  formatDateTime,
  getCleanCounts,
  importStatusLabel,
  importStatusTone,
} from "./runs-utils";

const fieldCls =
  "mt-1.5 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3.5 text-[13px] text-[color:var(--ink-2)] shadow-[var(--shadow-1)] outline-none transition-colors focus:border-[color:var(--moby-500)] disabled:opacity-50";

function ImportPanel({ onImported }: { onImported: () => Promise<void> }) {
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
      setFile(null);
      setName("");
      setClientLabel("");
      if (fileRef.current) fileRef.current.value = "";
      await onImported();
    } catch (e) {
      setError(getDisplayError(e, "นำเข้าข้อมูลไม่สำเร็จ") ?? "นำเข้าข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] lg:items-end">
        <div>
          <span className="type-label">Excel file (.xlsx)</span>
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
            <span
              className="min-w-0 truncate text-[12px] text-[color:var(--ink-4)]"
              title={file?.name ?? undefined}
            >
              {file ? file.name : "ยังไม่ได้เลือกไฟล์"}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                setError(null);
              }}
            />
          </div>
        </div>

        <label className="block">
          <span className="type-label">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={file ? file.name.replace(/\.xlsx$/i, "") : "e.g. Customers 2026-06"}
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
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[color:var(--moby-600)] px-4 text-[13px] font-semibold text-white shadow-[0_16px_34px_rgba(0,107,255,0.14)] hover:bg-[color:var(--moby-800)] disabled:opacity-50 lg:min-w-[130px]"
        >
          {busy ? <RefreshCw size={16} className="animate-spin" /> : <UploadCloud size={16} />}
          {busy ? "Importing…" : "Import"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
          {error}
        </div>
      )}
    </div>
  );
}

export function PredictSourcesSection({
  sources,
  loading,
  onRefresh,
}: {
  sources: PredictDataSource[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  return (
    <SectionCard
      eyebrow="Data import"
      title="Predict data sources"
      hint="Import Excel (fixed 8-sheet schema) เพื่อใช้สร้าง prediction run"
    >
      <div className="space-y-5">
        <ImportPanel onImported={onRefresh} />

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : sources.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="ยังไม่มี predict data source"
            hint="Import ไฟล์ Excel ด้านบนเพื่อเริ่มต้น"
          />
        ) : (
          <div className="overflow-x-auto rounded-[22px] border border-gray-200">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th className="text-right">Customers</th>
                  <th className="text-right">Payments</th>
                  <th className="text-right">Usage</th>
                  <th>Imported</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const counts = getCleanCounts(s);
                  return (
                    <tr key={s.id}>
                      <td className="font-medium text-[color:var(--ink-1)]">{s.name}</td>
                      <td className="text-[color:var(--ink-3)]">{s.client_label ?? "—"}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <StatusPill tone={importStatusTone(s.import_status)}>
                            {importStatusLabel(s.import_status)}
                          </StatusPill>
                          {s.import_status === "failed" && s.error_message && (
                            <span
                              className="max-w-[220px] truncate text-[11px] text-[color:var(--danger)]"
                              title={s.error_message}
                            >
                              {s.error_message}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="num text-right">
                        {counts ? counts.customers.toLocaleString() : "—"}
                      </td>
                      <td className="num text-right">
                        {counts ? counts.payments.toLocaleString() : "—"}
                      </td>
                      <td className="num text-right">
                        {counts ? counts.usage.toLocaleString() : "—"}
                      </td>
                      <td className="text-[11.5px] text-[color:var(--ink-4)]">
                        {formatDateTime(s.imported_at)}
                      </td>
                      <td className="text-[11.5px] text-[color:var(--ink-4)]">
                        {s.importer_name ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
