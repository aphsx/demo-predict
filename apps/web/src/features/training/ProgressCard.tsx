import { RefreshCw } from "lucide-react";
import { IMPORT_PROGRESS_BG } from "./training-utils";

export function ProgressCard({
  training,
  progress,
  step,
  phase,
}: {
  training: boolean;
  progress: number;
  step: string;
  phase: "raw" | "clean" | null;
}) {
  const label = training
    ? "Training models"
    : phase === "clean"
      ? "Cleaning imported data"
      : "Importing raw data";

  return (
    <div className="mt-5 rounded-[24px] border border-[rgba(252,76,2,0.14)] bg-white p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[#fc4c02]">
          <RefreshCw size={15} className="animate-spin" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-[color:var(--ink-1)]">{label}</p>
            {!training && (
              <span className="num text-[13px] font-semibold text-[#fc4c02]">
                {progress}%
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12px] text-[color:var(--ink-4)]">
            {training
              ? "Refreshing active models after training completes."
              : step || "Processing..."}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <GradientProgressBar
          value={training ? 100 : Math.max(progress > 0 ? 4 : 0, progress)}
          indeterminate={training}
        />
      </div>
    </div>
  );
}

function GradientProgressBar({
  value,
  indeterminate = false,
}: {
  value: number;
  indeterminate?: boolean;
}) {
  return (
    <div className="relative h-3 overflow-hidden rounded-full bg-[rgba(13,17,35,0.08)]">
      <div
        className={`h-full rounded-full transition-[width,opacity] duration-300 ease-out ${indeterminate ? "animate-pulse" : ""}`}
        style={{
          width: indeterminate ? "100%" : `${Math.max(0, Math.min(100, value))}%`,
          backgroundImage: IMPORT_PROGRESS_BG,
          boxShadow: "0 0 18px rgba(252,76,2,0.18)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage: "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.38) 50%, transparent 82%)",
        }}
      />
    </div>
  );
}
