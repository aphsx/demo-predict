import { FileSpreadsheet, RefreshCw, Trash2 } from "lucide-react";
import { EmptyState, StatusPill } from "@/components/ui";
import type { TrainDataSource } from "@/lib/api";
import {
  formatDate,
  getCleanCounts,
  statusLabel,
  statusTone,
} from "./training-utils";

export function ModelTrainingPanel({
  sources,
  selectedSource,
  readyCount,
  deletingId,
  onSelect,
  onDelete,
}: {
  sources: TrainDataSource[];
  selectedSource: TrainDataSource | null;
  readyCount: number;
  deletingId: string | null;
  onSelect: (source: TrainDataSource) => void;
  onDelete: (source: TrainDataSource) => void;
}) {
  return (
    <section className="surface-elev overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="type-label">
              Model training
            </p>
            <h2 className="type-section-title mt-1 text-[22px]">
              Select dataset and train
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[color:var(--ink-4)]">
              เลือก clean dataset ที่ import สำเร็จแล้ว เพื่อใช้เป็น source สำหรับ training panel ด้านล่าง.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {selectedSource ? (
            <StatusPill tone="neutral" dot={false}>
              Selected: {selectedSource.name}
            </StatusPill>
          ) : (
            <StatusPill tone="neutral">No dataset selected</StatusPill>
          )}
          <StatusPill tone="neutral" dot={false}>
            {readyCount} ready
          </StatusPill>
        </div>
        {sources.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="No training dataset yet"
            hint="Upload one Excel file above. The system will import raw data and clean it automatically."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
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
    </section>
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
    <tr className={selected ? "bg-[color:var(--moby-50)]" : undefined}>
      <td>
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 h-3 w-3 shrink-0 rounded-full border ${
              selected ? "border-[color:var(--moby-600)] bg-[color:var(--moby-600)]" : "border-gray-300 bg-white"
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
            className={`inline-flex h-9 items-center justify-center rounded-lg px-3 text-[12px] font-semibold disabled:opacity-45 ${
              selected
                ? "bg-[color:var(--moby-50)] text-[color:var(--moby-600)]"
                : "border border-gray-200 bg-white text-[color:var(--ink-2)] hover:bg-gray-50"
            }`}
          >
            {selected ? "Selected" : selectable ? "Select" : "Not ready"}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onDelete}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-[color:var(--ink-3)] hover:border-[color:var(--danger)] hover:bg-[color:var(--danger-bg)] hover:text-[color:var(--danger)] disabled:opacity-50"
          >
            {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
