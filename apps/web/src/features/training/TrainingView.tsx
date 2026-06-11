"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Layers3 } from "lucide-react";
import { notifyStatusDialog } from "@/components/GlobalStatusDialogHost";
import { StatusDialog } from "@/components/StatusDialog";
import { Skeleton } from "@/components/ui";
import {
  deleteTrainDataSource,
  fetchTrainDataSources,
  trainModels,
  uploadTrainDataFileWithProgress,
  type TrainDataSource,
} from "@/lib/api";
import { getDisplayError } from "@/lib/ui-error";
import { FilePickerPanel } from "./FilePickerPanel";
import { ModelTrainingPanel } from "./ModelTrainingPanel";
import { ProgressCard } from "./ProgressCard";
import {
  IMPORT_ACCENT,
  getTimestamp,
  wait,
  waitForTrainingHealth,
} from "./training-utils";

export function TrainingView() {
  const [trainSources, setTrainSources] = useState<TrainDataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStep, setImportStep] = useState("");
  const [importPhase, setImportPhase] = useState<"raw" | "clean" | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importName, setImportName] = useState("");
  const [importClient, setImportClient] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteSource, setPendingDeleteSource] = useState<TrainDataSource | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const sources = await fetchTrainDataSources().catch(() => [] as TrainDataSource[]);
      setTrainSources(Array.isArray(sources) ? sources : []);
    } catch (e) {
      setTrainSources([]);
      setLoadError(getDisplayError(e, "Failed to load training workspace"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const readySources = useMemo(
    () => trainSources.filter((source) => source.import_status === "ready"),
    [trainSources]
  );
  const sortedSources = useMemo(
    () =>
      trainSources
        .slice()
        .sort(
          (a, b) =>
            getTimestamp(b.imported_at || b.created_at) -
            getTimestamp(a.imported_at || a.created_at)
        ),
    [trainSources]
  );
  const selectedSource =
    sortedSources.find((source) => source.id === selectedSourceId) ?? readySources[0] ?? null;
  const canTrain = Boolean(selectedSource && selectedSource.import_status === "ready");

  useEffect(() => {
    if (sortedSources.length === 0) {
      setSelectedSourceId(null);
      return;
    }
    if (selectedSourceId && sortedSources.some((source) => source.id === selectedSourceId)) return;
    setSelectedSourceId(readySources[0]?.id ?? sortedSources[0]?.id ?? null);
  }, [readySources, selectedSourceId, sortedSources]);

  const handleImportFile = async (file: File) => {
    const datasetName = importName.trim() || file.name.replace(/\.xlsx$/i, "");
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    setImportProgress(1);
    setImportStep("Uploading Excel file...");
    setImportPhase(null);

    try {
      await uploadTrainDataFileWithProgress(
        file,
        datasetName,
        (event) => {
          setImportProgress(event.progress);
          setImportStep(event.step);
          if (event.phase) setImportPhase(event.phase);
        },
        importClient.trim() || undefined
      );

      setImportName("");
      setPendingFile(null);
      setImportProgress(100);
      setImportStep("Import complete");
      await wait(450);
      await load();
      notifyStatusDialog({
        tone: "success",
        title: "นำเข้าข้อมูลสำเร็จ",
        message: "ระบบ import และ clean data เสร็จเรียบร้อย",
      });
    } catch (e) {
      setImportProgress(0);
      setImportStep("");
      setImportPhase(null);
      const err = e as Error & { code?: string; source_id?: string };
      if (err.code === "DUPLICATE_FILE" && err.source_id) {
        notifyStatusDialog({
          tone: "error",
          title: "นำเข้าข้อมูลไม่สำเร็จ",
          message: "ไฟล์นี้ถูกนำเข้าแล้ว กรุณาเลือก dataset เดิมจากตารางด้านล่าง",
        });
      } else {
        notifyStatusDialog({
          tone: "error",
          title: "นำเข้าข้อมูลไม่สำเร็จ",
          message: getDisplayError(e, "นำเข้าข้อมูลไม่สำเร็จ") ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
        });
      }
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteSource = async (source: TrainDataSource) => {
    setDeletingId(source.id);
    setImportError(null);
    setImportSuccess(null);
    setPendingDeleteSource(null);
    try {
      await deleteTrainDataSource(source.id);
      setTrainSources((prev) => prev.filter((item) => item.id !== source.id));
      setImportSuccess("ลบข้อมูลสำเร็จ");
    } catch (e) {
      setImportError(getDisplayError(e, "ลบ dataset ไม่สำเร็จ"));
    } finally {
      setDeletingId(null);
    }
  };

  const startTraining = async () => {
    if (!canTrain) {
      setImportError("กรุณาเลือก dataset ที่พร้อมใช้งานก่อนเริ่ม train");
      return;
    }
    setTraining(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      await trainModels();
      await waitForTrainingHealth();
      await load();
    } catch (e) {
      setImportError(getDisplayError(e, "เริ่ม train model ไม่สำเร็จ"));
    } finally {
      setTraining(false);
    }
  };

  if (loading) {
    return (
      <main className="min-w-0 px-4 py-6 pb-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Skeleton className="h-[360px]" />
          <Skeleton className="h-[360px]" />
        </div>
        <Skeleton className="mt-6 h-[280px]" />
      </main>
    );
  }

  return (
    <main className="min-w-0 px-4 py-6 pb-12 sm:px-6 lg:px-8">
      <div className="space-y-6">
        {loadError && (
          <div className="rounded-2xl border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
            {loadError}
          </div>
        )}

        <section className="surface-elev overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
            <p className="type-label">New dataset</p>
            <h2 className="type-section-title mt-1 text-[22px]">
              Upload and clean dataset
            </h2>
           
          </div>
          <div className="p-5 sm:p-6">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <FilePickerPanel
                pendingFile={pendingFile}
                importing={importing}
                fileInputRef={fileInputRef}
                onFileChange={(file) => {
                  setPendingFile(file);
                  setImportError(null);
                  setImportSuccess(null);
                }}
              />

              <div className="flex flex-col rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="grid grid-cols-1 gap-4">
                  <label className="block">
                    <span className="type-label">Dataset name</span>
                    <input
                      type="text"
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                      placeholder="e.g. Bangkok University Q1"
                      className="mt-1.5 h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-[13px] text-[color:var(--ink-2)]"
                    />
                  </label>

                  <label className="block">
                    <span className="type-label">Client label</span>
                    <input
                      type="text"
                      value={importClient}
                      onChange={(e) => setImportClient(e.target.value)}
                      placeholder="optional"
                      className="mt-1.5 h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-[13px] text-[color:var(--ink-2)]"
                    />
                  </label>
                </div>

                <div className="mt-5 rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-center gap-3 text-[12px] text-[color:var(--ink-4)]">
                    <span className="shrink-0 text-[color:var(--moby-600)]">
                      <Layers3 size={15} />
                    </span>
                    <span>
                      Import raw rows first, then clean customers, payments, and usage rows for training.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {(importing || training) && (
              <ProgressCard
                training={training}
                progress={importProgress}
                step={importStep}
                phase={importPhase}
              />
            )}

            <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                disabled={importing || !pendingFile}
                onClick={() => pendingFile && void handleImportFile(pendingFile)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold text-white disabled:opacity-50 sm:min-w-[170px]"
                style={{ background: IMPORT_ACCENT }}
              >
                <Image src="/icons/import.svg" alt="" width={16} height={17} aria-hidden />
                Upload and clean
              </button>
            </div>
          </div>
        </section>

        <ModelTrainingPanel
          sources={sortedSources}
          selectedSource={selectedSource}
          readyCount={readySources.length}
          training={training}
          deletingId={deletingId}
          canTrain={canTrain}
          onTrain={() => void startTraining()}
          onSelect={(source) => setSelectedSourceId(source.id)}
          onDelete={(source) => setPendingDeleteSource(source)}
        />
      </div>

      {pendingDeleteSource && (
        <StatusDialog
          open
          tone="warning"
          title="ยืนยันการลบข้อมูล"
          message={
            pendingDeleteSource.import_status === "importing" ||
            pendingDeleteSource.import_status === "cleaning"
              ? "งาน import อาจยังทำงานอยู่ หากลบตอนนี้ข้อมูล raw และ clean ทั้งหมดของ dataset นี้จะถูกลบ"
              : "ข้อมูล raw และ clean ทั้งหมดของ dataset นี้จะถูกลบถาวร"
          }
          confirmLabel="ลบข้อมูล"
          cancelLabel="ยกเลิก"
          loading={deletingId === pendingDeleteSource.id}
          onCancel={() => setPendingDeleteSource(null)}
          onConfirm={() => void deleteSource(pendingDeleteSource)}
        />
      )}

      {(importSuccess || importError) && !importing && (
        <StatusDialog
          open
          tone={importSuccess ? "success" : "error"}
          title={importSuccess ?? "ดำเนินการไม่สำเร็จ"}
          message={
            importSuccess
              ? "ระบบ import และ clean data เสร็จเรียบร้อย"
              : importError ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"
          }
          onConfirm={() => {
            setImportSuccess(null);
            setImportError(null);
          }}
        />
      )}
    </main>
  );
}
