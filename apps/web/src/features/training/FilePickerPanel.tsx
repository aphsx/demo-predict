import { type RefObject } from "react";
import Image from "next/image";
import { FileSpreadsheet } from "lucide-react";
import { BRAND_BLUE, formatFileSize } from "./training-utils";

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
    <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-[var(--shadow-1)]">
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

      <div className="mt-5 overflow-hidden rounded-[22px] border border-gray-100">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
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
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-[13px] font-semibold text-white shadow-[0_12px_28px_rgba(0,107,255,0.12)] disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: BRAND_BLUE }}
      >
        <Image src="/icons/upload-icon.svg" alt="" width={14} height={14} aria-hidden />
        {pendingFile ? "Change file" : "Choose file"}
      </button>
    </div>
  );
}
