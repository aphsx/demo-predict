"use client";

/**
 * Model version management (moved here from the read-only Model Metrics page).
 * Per model type: list trained versions, set the production champion, and delete
 * non-production versions. The production champion can never be deleted (guarded
 * in the UI and in the ML registry).
 */
import { useEffect, useState } from "react";
import { Boxes, Trash2 } from "lucide-react";
import { StatusDialog } from "@/components/status-dialog";
import {
  activateModelVersion,
  deleteModelVersion,
  fetchModelVersions,
  type ModelVersionSummary,
} from "@/lib/ml-api";

const MODEL_TYPES = ["churn", "clv", "credit"] as const;

export function ModelVersionsSection() {
  return (
    <section className="surface-elev overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
        <p className="type-label">Models</p>
        <h2 className="type-section-title mt-1 text-[20px]">จัดการเวอร์ชันโมเดล</h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[color:var(--ink-4)]">
          ตั้งเวอร์ชัน production และลบเวอร์ชันที่ไม่ใช้ (ลบ production ไม่ได้)
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-3">
        {MODEL_TYPES.map((modelType) => (
          <ModelTypeVersions key={modelType} modelType={modelType} />
        ))}
      </div>
    </section>
  );
}

function ModelTypeVersions({ modelType }: { modelType: string }) {
  const [versions, setVersions] = useState<ModelVersionSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ModelVersionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    fetchModelVersions(modelType)
      .then(setVersions)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "โหลดเวอร์ชันไม่สำเร็จ"));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelType]);

  async function activate(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await activateModelVersion(modelType, id);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เปลี่ยนโมเดลไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(version: ModelVersionSummary) {
    setDeletingId(version.id);
    setError(null);
    try {
      await deleteModelVersion(modelType, version.id);
      setPendingDelete(null);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ลบเวอร์ชันไม่สำเร็จ");
    } finally {
      setDeletingId(null);
    }
  }

  const busy = busyId !== null || deletingId !== null;

  return (
    <div className="rounded-2xl border border-gray-200 p-3.5">
      <div className="flex items-center gap-2">
        <Boxes size={14} className="text-[color:var(--moby-600)]" />
        <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
          {modelType}
        </span>
      </div>

      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}

      <div className="mt-2 space-y-1.5">
        {versions === null && !error && (
          <p className="text-[11px] text-[color:var(--ink-5)]">กำลังโหลด…</p>
        )}
        {versions?.length === 0 && (
          <p className="text-[11px] text-[color:var(--ink-5)]">ยังไม่มีเวอร์ชัน</p>
        )}
        {versions?.map((v) => (
          <div
            key={v.id}
            className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5"
          >
            <div className="min-w-0">
              <p className="truncate text-[11.5px] font-medium text-[color:var(--ink-2)]">
                {v.version} · {v.algorithm || "—"}
              </p>
              <p className="text-[10.5px] text-[color:var(--ink-5)]">
                {v.primary_metric_name}:{" "}
                {v.primary_metric_value != null ? v.primary_metric_value.toFixed(4) : "—"}
              </p>
            </div>
            {v.is_active ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                production
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => activate(v.id)}
                  className="rounded-full bg-gray-900 px-2.5 py-1 text-[10.5px] font-semibold text-white disabled:opacity-50"
                >
                  {busyId === v.id ? "กำลังเปลี่ยน…" : "ใช้ตัวนี้"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPendingDelete(v)}
                  title="ลบเวอร์ชันนี้"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--ink-5)] hover:bg-[color:var(--danger-bg)] hover:text-[color:var(--danger)] disabled:opacity-40"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {pendingDelete && (
        <StatusDialog
          open
          tone="warning"
          title={`ยืนยันการลบเวอร์ชัน ${pendingDelete.version}`}
          message="ไฟล์โมเดล (.pkl) และผลประเมินของเวอร์ชันนี้จะถูกลบถาวร กู้คืนไม่ได้ — เวอร์ชัน production ปัจจุบันจะไม่ถูกแตะต้อง"
          confirmLabel="ลบเวอร์ชัน"
          cancelLabel="ยกเลิก"
          loading={deletingId === pendingDelete.id}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void remove(pendingDelete)}
        />
      )}
    </div>
  );
}
