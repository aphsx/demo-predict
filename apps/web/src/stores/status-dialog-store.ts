import { create } from "zustand";
import type { StatusDialogTone } from "@/components/status-dialog";

export type StatusDialogPayload = {
  tone: StatusDialogTone;
  title: string;
  message?: string;
  confirmLabel?: string;
};

interface StatusDialogState {
  dialog: StatusDialogPayload | null;
  notify: (payload: StatusDialogPayload) => void;
  dismiss: () => void;
}

/** App-wide status dialog. Rendered by GlobalStatusDialogHost. */
export const useStatusDialogStore = create<StatusDialogState>()((set) => ({
  dialog: null,
  notify: (dialog) => set({ dialog }),
  dismiss: () => set({ dialog: null }),
}));
