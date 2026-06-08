"use client";

export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/ui";

type SummaryMetric = {
  model: "Churn" | "CLV" | "Credit";
  description: string;
  primaryMetric: {
    label: string;
    value: string;
    helper: string;
  };
  metrics: readonly {
    label: string;
    value: string;
    helper: string;
  }[];
};

const SUMMARY_METRICS: SummaryMetric[] = [
  {
    model: "Churn",
    description: "Classification quality for churn risk scores.",
    primaryMetric: {
      label: "F1 score",
      value: "0.711",
      helper: "Balance of precision and recall",
    },
    metrics: [
      { label: "Precision", value: "0.681", helper: "Alerts that were actually churn" },
      { label: "Recall", value: "0.744", helper: "Actual churn customers detected" },
      { label: "PR-AUC", value: "0.712", helper: "Overall ranking quality" },
      { label: "Lift@top10%", value: "3.12x", helper: "Top risk list vs random" },
    ],
  },
  {
    model: "CLV",
    description: "Regression quality for future customer value.",
    primaryMetric: {
      label: "MAE",
      value: "฿1,181",
      helper: "Average prediction error",
    },
    metrics: [
      { label: "SMAPE", value: "31.8%", helper: "Percent error" },
      { label: "Spearman", value: "0.570", helper: "Customer value ranking quality" },
      { label: "Top-decile capture", value: "44.0%", helper: "Revenue captured by top 10%" },
    ],
  },
  {
    model: "Credit",
    description: "Forecast quality for future credit consumption.",
    primaryMetric: {
      label: "SMAPE 90d",
      value: "33.7%",
      helper: "90-day forecast percent error",
    },
    metrics: [
      { label: "MAE 90d", value: "2,380", helper: "Average credit error" },
      { label: "SMAPE 30d", value: "28.4%", helper: "Short-term percent error" },
      { label: "Coverage", value: "79.0%", helper: "Prediction range reliability" },
      { label: "Urgent recall", value: "0.730", helper: "Urgent credit cases detected" },
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
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
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
      <h3 className="mt-1 text-[13px] font-semibold text-[color:var(--ink-2)]">{metric.primaryMetric.label}</h3>
      <p className="mt-2 text-[12px] leading-5 text-[color:var(--ink-4)]">{metric.description}</p>

      <p className="num mt-4 text-[34px] font-semibold leading-none text-[color:var(--ink-1)]">{metric.primaryMetric.value}</p>
      <p className="mt-2 text-[11px] text-[color:var(--ink-5)]">{metric.primaryMetric.helper}</p>

      <div className="mt-5 space-y-3">
        {metric.metrics.map((item) => (
          <div key={item.label} className="grid grid-cols-[1fr_auto] gap-4 rounded-xl bg-[color:var(--surface-2)] px-3 py-2.5">
            <div>
              <p className="text-[12px] font-semibold text-[color:var(--ink-2)]">{item.label}</p>
              <p className="mt-1 text-[11px] text-[color:var(--ink-5)]">{item.helper}</p>
            </div>
            <p className="num text-[15px] font-semibold text-[color:var(--ink-1)]">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
