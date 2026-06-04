"use client";

import { useEffect, useState } from "react";
import { StatusDialog, type StatusDialogTone } from "@/components/StatusDialog";

export const GLOBAL_STATUS_DIALOG_EVENT = "moby:status-dialog";

export type GlobalStatusDialogPayload = {
  tone: StatusDialogTone;
  title: string;
  message?: string;
  confirmLabel?: string;
};

export function notifyStatusDialog(payload: GlobalStatusDialogPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<GlobalStatusDialogPayload>(GLOBAL_STATUS_DIALOG_EVENT, {
      detail: payload,
    })
  );
}

export function GlobalStatusDialogHost() {
  const [dialog, setDialog] = useState<GlobalStatusDialogPayload | null>(null);

  useEffect(() => {
    const handleDialog = (event: Event) => {
      const customEvent = event as CustomEvent<GlobalStatusDialogPayload>;
      setDialog(customEvent.detail);
    };

    window.addEventListener(GLOBAL_STATUS_DIALOG_EVENT, handleDialog);
    return () => {
      window.removeEventListener(GLOBAL_STATUS_DIALOG_EVENT, handleDialog);
    };
  }, []);

  if (!dialog) return null;

  return (
    <StatusDialog
      open
      tone={dialog.tone}
      title={dialog.title}
      message={dialog.message}
      confirmLabel={dialog.confirmLabel}
      onConfirm={() => setDialog(null)}
    />
  );
}
