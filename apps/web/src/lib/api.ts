/**
 * API client for routes that are actually mounted by the Elysia API.
 *
 * Legacy `/runs`, `/predictions`, `/model-versions`, `/model-metrics`,
 * `/training-log`, chat, and explanation endpoints were removed with the old
 * ML runtime. Add new wrappers here only after the matching Elysia route exists.
 */

import type { TrainDataSource, PredictDataSource } from "@moby/types";
import {
  IS_ML_MOCK,
  isApiError,
  loadMlMock as mockMl,
  redirectingFetch as apiFetch,
} from "./http";
export type { TrainDataSource, PredictDataSource };

// Helpers

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("API returned invalid JSON");
  }
}

// Train raw data import
// train_data_sources + train_raw_sheet_*. NOT uploadFile (/runs).
// See docs/DATA-PIPELINE-MIGRATION.md

export async function fetchTrainDataSources(): Promise<TrainDataSource[]> {
  const res = await apiFetch("/api/train-data-sources");
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      isApiError(body) ? body.message : `Failed to load train data sources (${res.status})`
    );
  }
  return asArray<TrainDataSource>(body);
}

export async function deleteTrainDataSource(id: string): Promise<void> {
  const res = await apiFetch(`/api/train-data-sources/${id}`, { method: "DELETE" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Failed to delete dataset (${res.status})`);
  }
}

export type TrainPipelinePhase = "raw" | "clean";

export interface TrainImportProgress {
  progress: number;
  step: string;
  phase?: TrainPipelinePhase;
  sheet?: string;
  rows?: number;
}

export interface TrainImportDone {
  source_id: string;
  import_status: string;
  sheet_manifest: Record<string, number>;
  file_checksum_sha256?: string;
  clean_manifest?: TrainCleanManifest;
}

interface TrainImportProgressPoll {
  status: "importing" | "ready" | "failed" | "not_found";
  progress: number;
  step: string;
  phase?: TrainPipelinePhase;
  sheet?: string;
  rows?: number;
  message?: string;
  code?: string;
  source_id?: string;
  result?: TrainImportDone;
}

export interface TrainCleanSkipped {
  customers_no_acc_id: number;
  payments_no_acc_id: number;
  payments_no_date: number;
  usage_no_acc_id: number;
}

export interface TrainCleanManifest {
  raw: Record<string, number>;
  clean: {
    customers: number;
    payments: number;
    usage: number;
  };
  skipped: TrainCleanSkipped;
  warnings: string[];
}

/** Monotonic pipeline progress (server may burst many SSE events in one frame). */
function createTrainImportProgressSink(
  onProgress: (event: TrainImportProgress) => void
): (event: TrainImportProgress) => void {
  let last = 0;
  return (event) => {
    const progress = Math.max(last, event.progress);
    last = progress;
    onProgress({ ...event, progress });
  };
}

function postTrainImportAsync(
  fd: FormData,
  onUploadBytes?: (loaded: number, total: number) => void,
  onServerProcessing?: () => void
): Promise<{ source_id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/train-data-sources/import/async");
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onUploadBytes) {
        onUploadBytes(e.loaded, e.total);
      }
    };

    xhr.upload.onload = () => {
      onServerProcessing?.();
    };

    xhr.onload = () => {
      let body: unknown;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        reject(new Error(`Import failed (${xhr.status})`));
        return;
      }

      if (xhr.status === 401 && typeof window !== "undefined") {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
        reject(new Error("Unauthorized"));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        const err = new Error(
          isApiError(body) ? body.message : `Import failed (${xhr.status})`
        ) as Error & { code?: string; source_id?: string };
        if (typeof body === "object" && body !== null) {
          const b = body as Record<string, unknown>;
          if (typeof b.code === "string") err.code = b.code;
          if (typeof b.source_id === "string") err.source_id = b.source_id;
        }
        reject(err);
        return;
      }

      const sourceId = (body as { source_id?: string }).source_id;
      if (!sourceId) {
        reject(new Error("Import did not return source_id"));
        return;
      }
      resolve({ source_id: sourceId });
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(fd);
  });
}

const TRAIN_IMPORT_POLL_MS = 400;

async function pollTrainImportProgress(sourceId: string): Promise<TrainImportProgressPoll> {
  const res = await apiFetch(`/api/train-data-sources/${sourceId}/import/progress`);
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      isApiError(body) ? body.message : `Progress poll failed (${res.status})`
    );
  }
  return body as TrainImportProgressPoll;
}

function waitForTrainImportDone(
  sourceId: string,
  emit: (event: TrainImportProgress) => void
): Promise<TrainImportDone> {
  return new Promise((resolve, reject) => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    };

    const tick = async () => {
      if (stopped) return;
      try {
        const snap = await pollTrainImportProgress(sourceId);

        if (snap.status === "not_found") {
          stop();
          reject(new Error("Import source not found"));
          return;
        }

        if (snap.status === "failed") {
          stop();
          const err = new Error(snap.message ?? "Import failed") as Error & {
            code?: string;
            source_id?: string;
          };
          if (snap.code) err.code = snap.code;
          if (snap.source_id) err.source_id = snap.source_id;
          reject(err);
          return;
        }

        if (snap.status === "importing") {
          emit({
            progress: snap.progress,
            step: snap.step,
            phase: snap.phase,
            sheet: snap.sheet,
            rows: snap.rows,
          });
          return;
        }

        if (snap.status === "ready") {
          stop();
          emit({
            progress: 100,
            step: snap.step || "Ready for model training",
            phase: "clean",
          });
          resolve(
            snap.result ?? {
              source_id: sourceId,
              import_status: "ready",
              sheet_manifest: {},
            }
          );
        }
      } catch (e) {
        stop();
        reject(e);
      }
    };

    timer = setInterval(() => void tick(), TRAIN_IMPORT_POLL_MS);
    void tick();
  });
}

/** Import with progress: XHR upload + poll Redis (avoids browser SSE batching 4%→100%). */
export function uploadTrainDataFileWithProgress(
  file: File,
  name: string,
  onProgress: (event: TrainImportProgress) => void,
  client_label?: string
): Promise<TrainImportDone> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("name", name);
  if (client_label) fd.append("client_label", client_label);

  const emit = createTrainImportProgressSink(onProgress);

  return (async () => {
    const { source_id: sourceId } = await postTrainImportAsync(
      fd,
      (loaded, total) => {
        const uploadPct = total > 0 ? Math.round((loaded / total) * 4) : 0;
        emit({
          progress: Math.min(4, Math.max(1, uploadPct)),
          step: `กำลังอัปโหลดไฟล์… ${Math.round((loaded / total) * 100)}%`,
          phase: "raw",
        });
      },
      () => {
        emit({
          progress: 4,
          step: "กำลังตรวจสอบไฟล์บนเซิร์ฟ…",
          phase: "raw",
        });
      }
    );

    return waitForTrainImportDone(sourceId, emit);
  })();
}

/** JSON import (no progress stream) — prefer uploadTrainDataFileWithProgress in UI. */
export async function uploadTrainDataFile(
  file: File,
  name: string,
  client_label?: string
): Promise<TrainImportDone> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("name", name);
  if (client_label) fd.append("client_label", client_label);

  const res = await apiFetch("/api/train-data-sources/import", { method: "POST", body: fd });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Import failed (${res.status})`);
  }
  return body as TrainImportDone;
}

// Predict raw data import
// predict_data_sources + predict_raw_sheet_* + predict_clean_*.

export interface PredictImportDone {
  source_id: string;
  import_status: string;
  sheet_manifest: Record<string, number>;
  file_checksum_sha256: string;
  clean_manifest?: TrainCleanManifest;
  /** Set when the import auto-created + triggered a prediction run (default on;
   *  opt out with auto_run=false). Null when auto-run failed or was skipped. */
  auto_prediction_run_id?: string | null;
}

export async function fetchPredictDataSources(): Promise<PredictDataSource[]> {
  if (IS_ML_MOCK) return (await mockMl()).mockPredictDataSources();

  const res = await apiFetch("/api/predict-data-sources");
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      isApiError(body) ? body.message : `Failed to load predict data sources (${res.status})`
    );
  }
  return asArray<PredictDataSource>(body);
}

export async function fetchPredictDataSource(id: string): Promise<PredictDataSource> {
  if (IS_ML_MOCK) return (await mockMl()).mockPredictDataSource(id);

  const res = await apiFetch(`/api/predict-data-sources/${id}`);
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      isApiError(body) ? body.message : `Failed to load predict data source (${res.status})`
    );
  }
  return body as PredictDataSource;
}

export async function uploadPredictDataFile(
  file: File,
  name?: string,
  client_label?: string,
  notes?: string
): Promise<PredictImportDone> {
  if (IS_ML_MOCK) {
    return (await mockMl()).mockUploadPredictDataFile(file, name, client_label, notes);
  }

  const fd = new FormData();
  fd.append("file", file);
  if (name) fd.append("name", name);
  if (client_label) fd.append("client_label", client_label);
  if (notes) fd.append("notes", notes);

  const res = await apiFetch("/api/predict-data-sources/import", { method: "POST", body: fd });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Import failed (${res.status})`);
  }
  return body as PredictImportDone;
}
