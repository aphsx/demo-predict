"use client";
/**
 * AI base summary of the whole customer base for the active run (the "สรุปก่อน").
 * Self-contained: fetches the cached summary, lets the user generate/regenerate.
 * Descriptive only — it never prescribes actions (the human decides).
 */
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { AiBadge } from "@/components/ai-badge";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { fetchRunInsight, generateRunInsight, type RunInsight } from "@/lib/ml-api";
import { TEXT_SAFE } from "./palette";

export function RunInsightCard({ runId }: { runId: string }) {
  const [insight, setInsight] = useState<RunInsight | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setInsight(null);
    setError(null);
    fetchRunInsight(runId)
      .then((r) => alive && setInsight(r))
      .catch(() => alive && setInsight(null));
    return () => {
      alive = false;
    };
  }, [runId]);

  const ready = insight?.ai_status === "completed" && Boolean(insight.ai_summary?.trim());

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const r = await generateRunInsight(runId, { force: ready });
      setInsight(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "สร้างสรุปไม่สำเร็จ");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="surface-elev overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2">
          <h2 className={`type-section-title text-[20px] leading-tight ${TEXT_SAFE}`}>สรุปภาพรวมฐานลูกค้า</h2>
          <AiBadge />
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[color:var(--moby-600)] px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-[color:var(--moby-800)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {generating ? "กำลังสร้าง" : ready ? "สร้างใหม่" : "สร้างสรุป"}
        </button>
      </div>

      <div className="px-5 py-4">
        {error ? (
          <p className="text-[13px] leading-6 text-[color:var(--ink-4)]">{error}</p>
        ) : ready ? (
          <div className="text-[13px] leading-6 text-[color:var(--ink-3)]">
            <MarkdownLite
              text={insight!.ai_summary!}
              strongClassName="font-semibold text-[color:var(--ink-1)]"
            />
          </div>
        ) : (
          <p className="text-[13px] leading-6 text-[color:var(--ink-5)]">
            {generating
              ? "กำลังสร้างสรุปภาพรวมจาก AI…"
              : "ยังไม่มีสรุปภาพรวม — กด “สร้างสรุป” เพื่อให้ AI อธิบายพฤติกรรมฐานลูกค้าของ run นี้"}
          </p>
        )}
        {ready && insight?.ai_generated_at ? (
          <p className="mt-3 text-[11px] text-[color:var(--ink-5)]">
            สร้างเมื่อ {new Date(insight.ai_generated_at).toLocaleString("th-TH")}
            {insight.ai_model ? ` · ${insight.ai_model}` : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}
