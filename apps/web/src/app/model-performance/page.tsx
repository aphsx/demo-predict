"use client";

export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/ui";

type SummaryMetric = {
  model: "Lifecycle" | "Churn" | "CLV" | "Credit";
  method: string;
  algorithm: string;
  primaryMetric: {
    label: string;
    value: string;
  };
  metrics: readonly {
    label: string;
    value: string;
  }[];
  note?: string;
};

const SUMMARY_METRICS: SummaryMetric[] = [
  {
    model: "Lifecycle",
    method: "Rule-based classification",
    algorithm: "Deterministic rules",
    primaryMetric: {
      label: "Rule coverage",
      value: "100%",
    },
    metrics: [
      { label: "Unknown rate", value: "0.0%" },
      { label: "Rule conflicts", value: "0" },
      { label: "Stages", value: "4" },
    ],
    note: "Rules: Ghost=no history, Churned=no activity in 180d, Paid=active+paid, Free=active+no paid.",
  },
  {
    model: "Churn",
    method: "ML classification",
    algorithm: "Calibrated LightGBM",
    primaryMetric: {
      label: "F1 score",
      value: "0.711",
    },
    metrics: [
      { label: "Precision", value: "0.681" },
      { label: "Recall", value: "0.744" },
      { label: "PR-AUC", value: "0.712" },
      { label: "Lift@top10%", value: "3.12x" },
    ],
  },
  {
    model: "CLV",
    method: "Regression + ranking",
    algorithm: "BG-NBD + Gamma-Gamma / ML regressors",
    primaryMetric: {
      label: "MAE",
      value: "฿1,181",
    },
    metrics: [
      { label: "SMAPE", value: "31.8%" },
      { label: "Spearman", value: "0.570" },
      { label: "Top-decile capture", value: "44.0%" },
    ],
  },
  {
    model: "Credit",
    method: "Forecasting regression",
    algorithm: "LightGBM quantile regressor",
    primaryMetric: {
      label: "SMAPE 90d",
      value: "33.7%",
    },
    metrics: [
      { label: "MAE 90d", value: "2,380" },
      { label: "SMAPE 30d", value: "28.4%" },
      { label: "Coverage", value: "79.0%" },
      { label: "Urgent recall", value: "0.730" },
    ],
  },
];

export default function ModelMetricsPage() {
  return (
    <main className="pb-12">
      <PageHeader
        eyebrow="Model accuracy"
        title="Model Accuracy"
      />

      <div className="px-8 mt-4 space-y-5">
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {SUMMARY_METRICS.map((metric) => (
            <MetricSummaryCard key={metric.model} metric={metric} />
          ))}
        </section>
      </div>
    </main>
  );
}

function MetricSummaryCard({ metric }: { metric: SummaryMetric }) {
  return (
    <section className="surface lift p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-5)]">{metric.model}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-[color:var(--surface-2)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ink-3)]">
          {metric.method}
        </span>
        <span className="rounded-full bg-[color:var(--surface-2)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ink-3)]">
          {metric.algorithm}
        </span>
      </div>

      <p className="mt-5 text-[12px] font-semibold text-[color:var(--ink-5)]">{metric.primaryMetric.label}</p>
      <p className="num mt-1 text-[34px] font-semibold leading-none text-[color:var(--ink-1)]">{metric.primaryMetric.value}</p>

      <div className="mt-5 space-y-3">
        {metric.metrics.map((item) => (
          <div key={item.label} className="grid grid-cols-[1fr_auto] gap-4 rounded-xl bg-[color:var(--surface-2)] px-3 py-2.5">
            <p className="text-[12px] font-semibold text-[color:var(--ink-2)]">{item.label}</p>
            <p className="num text-[15px] font-semibold text-[color:var(--ink-1)]">{item.value}</p>
          </div>
        ))}
      </div>

      {metric.note ? (
        <p className="mt-4 text-[11.5px] leading-5 text-[color:var(--ink-5)]">{metric.note}</p>
      ) : null}
    </section>
  );
}
