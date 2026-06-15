"use client";

import Image from "next/image";
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

const TONE_STYLE: Record<StatusDialogTone, { button: string; icon: string; alt: string }> = {
  success: {
    button: MOBY_BRAND.blue,
    icon: "/icons/success-alert.svg",
    alt: "success",
  },
  error: {
    button: "var(--danger)",
    icon: "/icons/error-alert.svg",
    alt: "error",
  },
  warning: {
    button: "var(--danger)",
    icon: "/icons/noti.svg",
    alt: "notification",
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

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-[607px] rounded-[28px] border border-white/70 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
        <div className="flex flex-col items-center gap-16 px-6 py-16 text-center">
          <div className="flex flex-col items-center justify-center gap-10">
            <Image src={style.icon} alt={style.alt} width={105} height={105} priority />

            <div>
              <h3 className="max-w-[400px] text-[18px] font-bold leading-7 text-[color:var(--ink-1)]">
                {title}
              </h3>
              {message && (
                <p className="mt-3 max-w-[420px] text-[13px] leading-6 text-[color:var(--ink-4)]">
                  {message}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            {onCancel && (
              <button
                type="button"
                disabled={loading}
                onClick={onCancel}
                className="inline-flex h-[47px] min-w-[102px] items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 text-[13px] font-semibold text-[color:var(--ink-2)] hover:bg-gray-50 disabled:opacity-50"
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
