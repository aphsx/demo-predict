"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { MOBY_BRAND } from "@/lib/login-brand-colors";

export type StatusDialogTone = "success" | "error" | "warning";

type StatusDialogProps = {
  open: boolean;
  tone: StatusDialogTone;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

const TONE_STYLE: Record<StatusDialogTone, { color: string; background: string; button: string }> = {
  success: {
    color: "var(--ok)",
    background: "var(--ok-bg)",
    button: MOBY_BRAND.blue,
  },
  error: {
    color: "var(--danger)",
    background: "var(--danger-bg)",
    button: "var(--danger)",
  },
  warning: {
    color: "var(--warn)",
    background: "var(--warn-bg)",
    button: "var(--danger)",
  },
};

export function StatusDialog({
  open,
  tone,
  title,
  message,
  confirmLabel = "ตกลง",
  cancelLabel = "ยกเลิก",
  loading = false,
  onConfirm,
  onCancel,
}: StatusDialogProps) {
  if (!open) return null;

  const style = TONE_STYLE[tone];
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-[560px] rounded-[28px] border border-white/70 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span
            className="grid h-[96px] w-[96px] place-items-center rounded-full"
            style={{ color: style.color, background: style.background }}
          >
            <Icon size={48} strokeWidth={1.8} />
          </span>

          <h3 className="mt-8 max-w-[400px] text-[20px] font-bold leading-7 text-[color:var(--ink-1)]">
            {title}
          </h3>
          {message && (
            <p className="mt-3 max-w-[420px] text-[13px] leading-6 text-[color:var(--ink-4)]">
              {message}
            </p>
          )}

          <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row">
            {onCancel && (
              <button
                type="button"
                disabled={loading}
                onClick={onCancel}
                className="inline-flex h-[47px] min-w-[102px] items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white px-5 text-[13px] font-semibold text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)] disabled:opacity-50"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              className="inline-flex h-[47px] min-w-[102px] items-center justify-center rounded-2xl px-5 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: style.button }}
            >
              {loading ? "กำลังดำเนินการ..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
