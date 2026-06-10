import { FileSpreadsheet, Play, RefreshCw, Trash2 } from "lucide-react";
import { EmptyState, StatusPill } from "@/components/ui";
import type { TrainDataSource } from "@/lib/api";
import {
  IMPORT_ACCENT,
  formatDate,
  getCleanCounts,
  statusLabel,
  statusTone,
} from "./training-utils";

export function ModelTrainingPanel({
  sources,
  selectedSource,
  readyCount,
  training,
  deletingId,
  canTrain,
  onTrain,
  onSelect,
  onDelete,
}: {
  sources: TrainDataSource[];
  selectedSource: TrainDataSource | null;
  readyCount: number;
  training: boolean;
  deletingId: string | null;
  canTrain: boolean;
  onTrain: () => void;
  onSelect: (source: TrainDataSource) => void;
  onDelete: (source: TrainDataSource) => void;
}) {
  return (
    <section className="surface-elev overflow-hidden">
      <div className="border-b border-[color:var(--line-2)] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-5)]">
              Model training
            </p>
            <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)]">
              Select dataset and train
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[color:var(--ink-4)]">
              เลือก clean dataset ที่ import ไว้ใน DB แล้วกด train จากพื้นที่นี้ ไม่ใช้ card เลือก dataset แล้ว
            </p>
          </div>
          <button
            type="button"
            disabled={!canTrain || training}
            onClick={onTrain}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-[13px] font-semibold text-white shadow-[0_16px_34px_rgba(252,76,2,0.14)] disabled:opacity-50 xl:min-w-[190px]"
            style={{ background: IMPORT_ACCENT }}
          >
            {training ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
            {training ? "Training..." : "Train selected"}
          </button>
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
          <div className="overflow-x-auto rounded-[22px] border border-[color:var(--line)]">
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
              selected ? "border-[color:var(--moby-600)] bg-[color:var(--moby-600)]" : "border-[color:var(--ink-6)] bg-white"
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
            className={`inline-flex h-9 items-center justify-center rounded-xl px-3 text-[12px] font-semibold disabled:opacity-45 ${
              selected
                ? "bg-[color:var(--moby-50)] text-[color:var(--moby-700)]"
                : "border border-[color:var(--line)] bg-white text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)]"
            }`}
          >
            {selected ? "Selected" : selectable ? "Select" : "Not ready"}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onDelete}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[color:var(--line)] bg-white px-3 text-[12px] font-medium text-[color:var(--ink-3)] hover:border-[color:var(--danger)] hover:bg-[color:var(--danger-bg)] hover:text-[color:var(--danger)] disabled:opacity-50"
          >
            {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
