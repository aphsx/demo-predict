/** Progress % for train Excel import (validate → sheets → finalize). */

export interface TrainImportProgressEvent {
  progress: number;
  step: string;
  sheet?: string;
  rows?: number;
}

const VALIDATE_PCT = 5;
const FINALIZE_PCT = 3;
const SHEET_PCT = 100 - VALIDATE_PCT - FINALIZE_PCT;

export function progressAfterValidate(): number {
  return VALIDATE_PCT;
}

/** Progress when sheet at `sheetIndex` (0-based) has finished. */
export function progressAfterSheet(sheetIndex: number, sheetCount: number): number {
  if (sheetCount <= 0) return VALIDATE_PCT;
  return VALIDATE_PCT + Math.round(((sheetIndex + 1) / sheetCount) * SHEET_PCT);
}

/** Progress just before starting sheet at `sheetIndex`. */
export function progressBeforeSheet(sheetIndex: number, sheetCount: number): number {
  if (sheetIndex <= 0) return VALIDATE_PCT;
  return progressAfterSheet(sheetIndex - 1, sheetCount);
}

export function progressFinalize(): number {
  return 100;
}
