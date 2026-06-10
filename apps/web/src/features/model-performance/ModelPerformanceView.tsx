"use client";

import { PageHeader } from "@/components/ui";
import type { SummaryMetric } from "@/mocks/model-performance";

export function ModelPerformanceView({ metrics }: { metrics: SummaryMetric[] }) {
  return (
    <main className="pb-12">
      <PageHeader
        eyebrow="Model accuracy"
        title="Model Accuracy"
      />

      <div className="px-8 mt-4 space-y-5">
        <p className="max-w-4xl text-[12.5px] leading-6 text-gray-500">
          Preview uses mock metric values. Production values must come from backend historical backtests persisted in the model registry.
        </p>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">{metric.model}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600">
          {metric.method}
        </span>
        <span className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600">
          {metric.algorithm}
        </span>
      </div>

      <p className="mt-5 text-[12px] font-semibold text-gray-400">{metric.primaryMetric.label}</p>
      <p className="num mt-1 text-[34px] font-semibold leading-none">{metric.primaryMetric.value}</p>

      <div className="mt-5 space-y-3">
        {metric.metrics.map((item) => (
          <div key={item.label} className="grid grid-cols-[1fr_auto] gap-4 rounded-xl bg-gray-50 px-3 py-2.5">
            <p className="text-[12px] font-semibold text-gray-700">{item.label}</p>
            <p className="num text-[15px] font-semibold">{item.value}</p>
          </div>
        ))}
      </div>

      {metric.note ? (
        <p className="mt-4 text-[11.5px] leading-5 text-gray-400">{metric.note}</p>
      ) : null}
    </section>
  );
}
