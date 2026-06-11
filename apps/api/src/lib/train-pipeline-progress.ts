/**
 * Combined raw import + train clean progress (0–100%).
 */

export type PipelinePhase = "raw" | "clean";

export interface TrainPipelineProgressEvent {
  progress: number;
  step: string;
  phase: PipelinePhase;
  sheet?: string;
  rows?: number;
}

const RAW_END = 45;
const CLEAN_START = 45;
const CLEAN_END = 97;

/** Map raw-only progress (5–100 from train-import-progress) → 5–45% pipeline. */
export function mapRawImportProgress(rawPct: number): number {
  const clamped = Math.max(5, Math.min(100, rawPct));
  return Math.round(5 + ((clamped - 5) / 95) * (RAW_END - 5));
}

export function progressCleanStart(): TrainPipelineProgressEvent {
  return { progress: CLEAN_START, step: "Starting clean (for model training)…", phase: "clean" };
}

export function progressCleanCustomers(): TrainPipelineProgressEvent {
  return { progress: 52, step: "Clean: writing customers…", phase: "clean" };
}

export function progressCleanPayments(): TrainPipelineProgressEvent {
  return { progress: 65, step: "Clean: writing payments…", phase: "clean" };
}

export function progressCleanUsageSheet(
  sheetIndex: number,
  sheetCount: number,
  sheetName: string,
  rows: number
): TrainPipelineProgressEvent {
  if (sheetCount <= 0) {
    return { progress: 75, step: `Clean: ${sheetName}`, phase: "clean", sheet: sheetName, rows };
  }
  const span = CLEAN_END - 75;
  const pct = 75 + Math.round(((sheetIndex + 1) / sheetCount) * span);
  return {
    progress: pct,
    step: `Clean: ${sheetName} (${rows.toLocaleString()} rows)`,
    phase: "clean",
    sheet: sheetName,
    rows,
  };
}

export function progressPipelineDone(): TrainPipelineProgressEvent {
  return { progress: 100, step: "Ready for model training", phase: "clean" };
}
