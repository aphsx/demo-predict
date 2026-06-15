"use client";

import { useEffect, useState } from "react";
import { Play, RefreshCw, SlidersHorizontal } from "lucide-react";
import { MockBadge } from "@/components/run-selector";
import { StatusPill } from "@/components/ui";
import type { TrainDataSource } from "@/lib/api";
import { IMPORT_ACCENT } from "./training-utils";
import { DEFAULT_HORIZON_DAYS } from "./training-run-utils";

const CUTOFF_HELPER =
  "ระบบเลือก cutoff ล่าสุดที่ยังมี label horizon ครบ เพื่อกัน leakage และไม่ให้ train fail";

export function TrainRunPanel({
  selectedSource,
  suggestedCutoff,
  latestDataDate,
  creating,
  onTrain,
}: {
  /** dataset chosen in the table above — null until a "ready" dataset is selected */
  selectedSource: TrainDataSource | null;
  /** Gate 3 suggestion from the API for the selected dataset. */
  suggestedCutoff: string | null;
  /** Latest observed activity date used to derive the cutoff. */
  latestDataDate: string | null;
  creating: boolean;
  onTrain: (input: { cutoff_date: string; horizon_days: number }) => void;
}) {
  const [cutoffDate, setCutoffDate] = useState<string>("");
  const [cutoffTouched, setCutoffTouched] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [horizonDays, setHorizonDays] = useState<number>(DEFAULT_HORIZON_DAYS);

  useEffect(() => {
    setCutoffTouched(false);
    setCutoffDate("");
    setHorizonDays(DEFAULT_HORIZON_DAYS);
  }, [selectedSource?.id]);

  useEffect(() => {
    if (suggestedCutoff && !cutoffTouched) setCutoffDate(suggestedCutoff);
  }, [suggestedCutoff, cutoffTouched]);

  const horizonValid = Number.isInteger(horizonDays) && horizonDays > 0;
  const canTrain = Boolean(selectedSource) && Boolean(cutoffDate) && horizonValid && !creating;
  const cutoffMode = cutoffTouched ? "Manual override" : "Auto-managed";

  return (
    <section className="surface-elev overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-5)]">
              ML v2 training
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-[22px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)]">
                Train models
              </h2>
              <MockBadge />
            </div>
            <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[color:var(--ink-4)]">
              ใช้ dataset ที่เลือกจากตารางด้านบน (เฉพาะสถานะ Ready) — กด Train เพื่อสร้าง training run
              ใหม่ผ่าน pipeline: gates → labels → features → baselines → tuning → promotion gate
            </p>
          </div>
          <button
            type="button"
            disabled={!canTrain}
            onClick={() => onTrain({ cutoff_date: cutoffDate, horizon_days: horizonDays })}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-[13px] font-semibold text-white shadow-[0_16px_34px_rgba(252,76,2,0.14)] disabled:opacity-50 xl:min-w-[170px]"
            style={{ background: IMPORT_ACCENT }}
          >
            {creating ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
            {creating ? "Starting..." : "Train"}
          </button>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {selectedSource ? (
            <StatusPill tone="brand" dot={false}>
              Dataset: {selectedSource.name}
            </StatusPill>
          ) : (
            <StatusPill tone="neutral">เลือก dataset ที่ Ready จากตารางด้านบนก่อน</StatusPill>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-[var(--shadow-1)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
                Training cutoff
              </span>
              <StatusPill tone={cutoffTouched ? "warn" : "ok"} dot={false}>
                {cutoffMode}
              </StatusPill>
            </div>
            <div className="mt-2 text-[24px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)]">
              {cutoffDate || "Waiting for source"}
            </div>
            <p className="mt-1.5 text-[12px] leading-5 text-[color:var(--ink-4)]">
              {latestDataDate
                ? `ข้อมูลล่าสุด ${latestDataDate}; horizon ${horizonDays} วัน จึงใช้ cutoff นี้อัตโนมัติ`
                : CUTOFF_HELPER}
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-medium text-[color:var(--ink-3)] hover:bg-gray-50"
            >
              <SlidersHorizontal size={13} />
              Advanced
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
                    Manual cutoff override
                  </span>
                  <input
                    type="date"
                    value={cutoffDate}
                    onChange={(e) => {
                      setCutoffDate(e.target.value);
                      setCutoffTouched(true);
                    }}
                    className="mt-1.5 h-11 w-full max-w-[240px] rounded-2xl border border-gray-200 bg-white px-3.5 text-[13px] text-[color:var(--ink-2)] shadow-[var(--shadow-1)]"
                  />
                  <span className="mt-1.5 block text-[12px] leading-5 text-[color:var(--ink-4)]">
                    แก้เฉพาะกรณีพิเศษ; API จะ block ถ้า history หรือ label horizon ไม่ครบ
                  </span>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
                    Horizon (days)
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={Number.isNaN(horizonDays) ? "" : horizonDays}
                    onChange={(e) => setHorizonDays(Number.parseInt(e.target.value, 10))}
                    className="mt-1.5 h-11 w-full max-w-[200px] rounded-2xl border border-gray-200 bg-white px-3.5 text-[13px] text-[color:var(--ink-2)] shadow-[var(--shadow-1)]"
                  />
                  <span className="mt-1.5 block text-[12px] leading-5 text-[color:var(--ink-4)]">
                    default {DEFAULT_HORIZON_DAYS} วัน — เปลี่ยนเฉพาะเมื่อรู้ว่าทำอะไรอยู่
                  </span>
                  {!horizonValid && (
                    <span className="mt-1 block text-[12px] text-[color:var(--danger)]">
                      Horizon ต้องเป็นจำนวนวันที่มากกว่า 0
                    </span>
                  )}
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
