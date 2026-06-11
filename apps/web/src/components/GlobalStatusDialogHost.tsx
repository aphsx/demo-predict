"use client";

import { StatusDialog } from "@/components/StatusDialog";
import { useStatusDialogStore, type StatusDialogPayload } from "@/stores/statusDialogStore";

export type GlobalStatusDialogPayload = StatusDialogPayload;

/** Imperative helper — callable from non-React code (e.g. async handlers). */
export function notifyStatusDialog(payload: StatusDialogPayload) {
  useStatusDialogStore.getState().notify(payload);
}

export function GlobalStatusDialogHost() {
  const dialog = useStatusDialogStore((s) => s.dialog);
  const dismiss = useStatusDialogStore((s) => s.dismiss);

  if (!dialog) return null;

  return (
    <StatusDialog
      open
      tone={dialog.tone}
      title={dialog.title}
      message={dialog.message}
      confirmLabel={dialog.confirmLabel}
      onConfirm={dismiss}
    />
  );
}
