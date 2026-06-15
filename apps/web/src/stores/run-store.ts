import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RunState {
  runId: string;
  setRunId: (runId: string) => void;
}

/** Active run id, persisted to localStorage. URL sync lives in RunUrlSync.tsx. */
export const useRunStore = create<RunState>()(
  persist(
    (set) => ({
      runId: "",
      setRunId: (runId) => set({ runId }),
    }),
    { name: "moby:run" },
  ),
);
