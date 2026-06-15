import { type RefObject } from "react";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { formatFileSize, PRIMARY_BUTTON_CLS } from "./training-utils";

export function FilePickerPanel({
  pendingFile,
  importing,
  fileInputRef,
  onFileChange,
}: {
  pendingFile: File | null;
  importing: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  onFileChange: (file: File) => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-1)]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          onFileChange(file);
        }}
      />

      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-[color:var(--moby-600)]">
          <FileSpreadsheet size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[color:var(--ink-1)]">
            Source workbook
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[color:var(--ink-4)]">
            One `.xlsx` file with the required 8 sheets.
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
          <p className="type-label">
            Selected file
          </p>
        </div>

        {pendingFile ? (
          <div className="bg-white px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="shrink-0 text-[color:var(--moby-600)]">
                <FileSpreadsheet size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[color:var(--ink-1)]">
                  {pendingFile.name}
                </p>
                <p className="mt-1 text-[12px] text-[color:var(--ink-4)]">
                  {formatFileSize(pendingFile.size)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-7 text-center">
            <p className="text-[13px] font-medium text-[color:var(--ink-2)]">No file selected</p>
            <p className="mt-1 text-[12px] text-[color:var(--ink-5)]">
              Choose a workbook before uploading.
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={importing}
        onClick={() => fileInputRef.current?.click()}
        className={`mt-4 w-full ${PRIMARY_BUTTON_CLS} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <UploadCloud size={14} aria-hidden />
        {pendingFile ? "Change file" : "Choose file"}
      </button>
    </div>
  );
}
