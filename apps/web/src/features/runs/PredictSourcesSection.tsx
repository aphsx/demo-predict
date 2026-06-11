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

const inputCls =
  "w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-[13px] text-[color:var(--ink-2)]";
const labelCls = "text-[11px] font-medium text-[color:var(--ink-4)] block mb-1";

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
    <div className="surface-soft p-4">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
        <div>
          <label className={labelCls}>Excel file (.xlsx)</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-[12.5px] text-[color:var(--ink-2)] hover:bg-gray-50 inline-flex items-center gap-1.5 disabled:opacity-40 shrink-0"
            >
              <FileSpreadsheet size={13} />
              เลือกไฟล์
            </button>
            <span
              className="text-[12px] text-[color:var(--ink-4)] truncate"
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
        <div>
          <label className={labelCls}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={file ? file.name.replace(/\.xlsx$/i, "") : "e.g. Customers 2026-06"}
            disabled={busy}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Client label</label>
          <input
            value={clientLabel}
            onChange={(e) => setClientLabel(e.target.value)}
            placeholder="optional"
            disabled={busy}
            className={inputCls}
          />
        </div>
        <button
          type="button"
          onClick={() => void doImport()}
          disabled={busy || !file}
          className="h-9 px-3.5 rounded-lg bg-[color:var(--moby-600)] text-white text-[13px] hover:bg-[color:var(--moby-700)] inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy ? <RefreshCw size={13} className="animate-spin" /> : <UploadCloud size={13} />}
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
      {error && (
        <div className="mt-3 rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-3 py-2 text-[12.5px] text-[color:var(--danger)]">
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
      title="Predict data sources"
      hint="Import Excel (fixed 8-sheet schema) เพื่อใช้สร้าง prediction run"
    >
      <div className="space-y-4">
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
          <div className="overflow-x-auto">
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
                              className="text-[11px] text-[color:var(--danger)] truncate max-w-[220px]"
                              title={s.error_message}
                            >
                              {s.error_message}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right num">
                        {counts ? counts.customers.toLocaleString() : "—"}
                      </td>
                      <td className="text-right num">
                        {counts ? counts.payments.toLocaleString() : "—"}
                      </td>
                      <td className="text-right num">
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
