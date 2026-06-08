"use client";
export const dynamic = "force-dynamic";
import {
  ShieldCheck, Cpu, Layers, BookOpenCheck,
} from "lucide-react";
import {
  PageHeader, SectionCard, StatusPill, ProgressMeter, Skeleton,
} from "@/components/ui";
import { formatFeatureLabel } from "@/lib/featureLabels";

type Tab = "overview" | "churn" | "clv" | "credit" | "log";

export default function ModelHealth() {
  return <ModelHealthSkeleton />;
}

/* ─── Tabs ─── */

function Overview({ m }: any) {
  const c = m.churn || {}, lv = m.clv || {}, cr = m.credit || {};
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <ScoreCard title="Churn" hint="LightGBM · isotonic" main={c.auc} mainLabel="AUC" green={0.9} ok={0.8} status={c.auc} />
      <ScoreCard title="CLV" hint="BG/NBD · Gamma-Gamma" main={lv.spearman} mainLabel="Spearman" green={0.5} ok={0.3} status={lv.spearman} />
      <ScoreCard title="Credit" hint="LGBM quantile × 5" main={cr.coverage_p10_p90_after} mainLabel="80% coverage" green={0.78} ok={0.7} status={cr.coverage_p10_p90_after} target={0.80} />
      <SectionCard title="Data summary" hint="ใช้ในการเทรน">
        <KVList rows={[
          ["Total users", ds(m).total_users],
          ["Total payments", ds(m).total_payments],
          ["Usage rows", ds(m).total_usage_rows],
          ["Active before cutoff", ds(m).active_before_cutoff],
          ["Active after cutoff", ds(m).active_after_cutoff],
          ["Number of features", ds(m).n_features],
        ]} />
      </SectionCard>
    </div>
  );
}
const ds = (m: any) => m.data_summary || {};

function ChurnTab({ m }: any) {
  const c = m.churn || {};
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <SectionCard title="Quality metrics">
        <KVList rows={[
          ["AUC-ROC", num(c.auc), c.auc >= 0.9 ? "Excellent" : c.auc >= 0.8 ? "Good" : "Needs review"],
          ["F1", num(c.f1)],
          ["Precision", num(c.precision)],
          ["Recall", num(c.recall)],
          ["AUC w/o leak suspects", num(c.auc_without_leak_suspects)],
          ["Leakage drop", num(c.auc_drop_leakage_test), c.auc_drop_leakage_test < 0.05 ? "Safe" : "Suspicious"],
        ]} />
      </SectionCard>
      <SectionCard title="Top SHAP factors" hint="Mean |SHAP|">
        {!(Array.isArray(m.churn_shap_top10) && m.churn_shap_top10.length > 0) ? (
          <div className="space-y-2">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : (
          <div className="space-y-2">
            {m.churn_shap_top10.map((d: any, i: number) => (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <span className="text-[11.5px] text-[color:var(--ink-3)]">{formatFeatureLabel(d.feature, d.shap)}</span>
                  <span className="text-[11.5px] num text-[color:var(--ink-2)]">{Number(d.shap).toFixed(4)}</span>
                </div>
                <ProgressMeter value={Math.abs(d.shap)} max={Math.abs(m.churn_shap_top10[0].shap)} tone="blue" showValue={false} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <SectionCard title="Model competition (val)" className="xl:col-span-2">
        <CompetitionTable data={m.churn_competition || {}} />
      </SectionCard>
    </div>
  );
}

function ClvTab({ m }: any) {
  const lv = m.clv || {};
  return (
    <SectionCard title="CLV quality">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <KVList rows={[
          ["Spearman corr.", num(lv.spearman), lv.spearman > 0.5 ? "Good" : "Acceptable"],
          ["Top decile lift", num(lv.top_decile_lift)],
          ["MAE (฿)", num(lv.mae)],
          ["Median AE (฿)", num(lv.medae)],
          ["Avg P(alive)", num(lv.avg_p_alive)],
        ]} />
        <KVList rows={[
          ["Avg CLV 6m (฿)", num(lv.avg_clv_6m)],
          ["Median CLV 6m (฿)", num(lv.median_clv_6m)],
          ["95% CI coverage", num(lv.coverage_95), "target 0.95"],
          ["80% CI coverage", num(lv.coverage_80), "target 0.80"],
        ]} />
      </div>
    </SectionCard>
  );
}

function CreditTab({ m }: any) {
  const cr = m.credit || {};
  return (
    <SectionCard title="Credit purchase forecast">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <KVList rows={[
          ["P50 MAE (days)", num(cr.p50_mae)],
          ["P50 Median AE (days)", num(cr.p50_medae)],
          ["P50 R²", num(cr.p50_r2), cr.p50_r2 > 0.4 ? "Acceptable" : "Low"],
          ["XGB baseline MAE (days)", num(cr.xgb_baseline_mae)],
        ]} />
        <KVList rows={[
          ["P10–P90 coverage (raw)", num(cr.coverage_p10_p90_before)],
          ["P10–P90 coverage (cal.)", num(cr.coverage_p10_p90_after), "target 0.80"],
          ["P25–P75 coverage (raw)", num(cr.coverage_p25_p75_before)],
          ["P25–P75 coverage (cal.)", num(cr.coverage_p25_p75_after), "target 0.50"],
          ["Conformal mult. 80%", num(cr.conformal_mult_80)],
          ["Conformal mult. 50%", num(cr.conformal_mult_50)],
        ]} />
      </div>
    </SectionCard>
  );
}

/* ─── helpers ─── */

function ScoreCard({
  title, hint, main, mainLabel, green, ok, status, target,
}: { title: string; hint: string; main: any; mainLabel: string; green: number; ok: number; status: any; target?: number }) {
  const v = Number(main || 0);
  const tone = v >= green ? "ok" : v >= ok ? "warn" : "danger";
  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[.12em] text-[color:var(--ink-5)]">{title}</div>
          <div className="text-[12px] text-[color:var(--ink-4)] mt-0.5">{hint}</div>
        </div>
        <StatusPill tone={tone}>{tone === "ok" ? "Healthy" : tone === "warn" ? "Watch" : "Action"}</StatusPill>
      </div>
      <div className="num text-[28px] font-semibold text-[color:var(--ink-1)] mt-3">{Number(main || 0).toFixed(3)}</div>
      <div className="text-[11.5px] text-[color:var(--ink-5)] mt-0.5">
        {mainLabel}{target ? ` · target ${target}` : ""}
      </div>
      <div className="mt-3"><ProgressMeter value={Math.min(100, v * 100)} max={100} tone={tone === "ok" ? "emerald" : tone === "warn" ? "amber" : "rose"} showValue={false} /></div>
    </div>
  );
}

function KVList({ rows }: { rows: [string, any, string?][] }) {
  return (
    <table className="w-full text-[12.5px]">
      <tbody>
        {rows.map(([k, v, note], i) => (
          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[color:var(--surface-2)]"}>
            <td className="py-1.5 px-3 text-[color:var(--ink-4)] w-1/2">{k}</td>
            <td className="py-1.5 px-3 num font-medium text-[color:var(--ink-1)]">{v ?? "—"}</td>
            {note ? <td className="py-1.5 px-3 text-[11px] text-[color:var(--ink-5)]">{note}</td> : <td />}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CompetitionTable({ data }: { data: Record<string, any> }) {
  const entries = Object.entries(data || {});
  if (entries.length === 0) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr><th>Model</th><th className="text-right">AUC</th><th className="text-right">F1</th><th className="text-right">Precision</th><th className="text-right">Recall</th></tr>
        </thead>
        <tbody>
          {entries.map(([name, m]: any) => (
            <tr key={name}>
              <td className="text-[color:var(--ink-2)]">{name}</td>
              <td className="text-right num">{m.auc?.toFixed(4)}</td>
              <td className="text-right num">{m.f1?.toFixed(4)}</td>
              <td className="text-right num">{m.precision?.toFixed(4)}</td>
              <td className="text-right num">{m.recall?.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Lineage({ label, value, icon: Icon, pill }: any) {
  return (
    <div className="surface-soft p-4">
      <div className="flex items-center gap-2 text-[color:var(--ink-4)]">
        <Icon size={13} />
        <span className="text-[11px] uppercase tracking-[.10em] text-[color:var(--ink-5)]">{label}</span>
      </div>
      <div className="num text-[16px] font-semibold text-[color:var(--ink-1)] mt-1">{value}</div>
      {pill && <div className="mt-2">{pill}</div>}
    </div>
  );
}

function num(v: any) {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(4);
  return String(v);
}

function ModelHealthSkeleton() {
  return (
    <div className="pb-12">
      <PageHeader eyebrow="Model intelligence" title="Model Health" />
      <div className="px-8 mt-4 space-y-5">
        <SectionCard title="Training lineage" hint="Versioning & freshness">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <LineageSkeleton label="Trained at" icon={BookOpenCheck} />
            <LineageSkeleton label="Cutoff" icon={Layers} />
            <LineageSkeleton label="Features" icon={Cpu} />
            <LineageSkeleton label="Drift status" icon={ShieldCheck} />
          </div>
        </SectionCard>
        <div className="segmented">
          {["Overview", "Churn", "CLV", "Credit", "Training log"].map((label, index) => (
            <button key={label} className={index === 0 ? "active" : ""}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <ScoreSkeleton title="Churn" hint="ML v2 candidate" />
          <ScoreSkeleton title="CLV" hint="BG/NBD · Gamma-Gamma" />
          <ScoreSkeleton title="Credit" hint="Forecast component" />
        </div>
        <SectionCard title="Data summary" hint="ใช้ในการเทรน">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <KVListSkeleton rows={6} />
            <KVListSkeleton rows={6} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function LineageSkeleton({ label, icon: Icon }: { label: string; icon: any }) {
  return (
    <div className="surface-soft p-4">
      <div className="flex items-center gap-2 text-[color:var(--ink-4)]">
        <Icon size={13} />
        <span className="text-[11px] uppercase tracking-[.10em] text-[color:var(--ink-5)]">{label}</span>
      </div>
      <Skeleton className="mt-2 h-5 w-24" />
      <Skeleton className="mt-2 h-6 w-20" />
    </div>
  );
}

function ScoreSkeleton({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[.12em] text-[color:var(--ink-5)]">{title}</div>
          <div className="text-[12px] text-[color:var(--ink-4)] mt-0.5">{hint}</div>
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-8 w-24" />
      <Skeleton className="mt-3 h-2 w-full rounded-full" />
    </div>
  );
}

function KVListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="grid grid-cols-2 gap-3 rounded-md bg-[color:var(--surface-2)] px-3 py-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
