"use client";

export const dynamic = "force-dynamic";

import { PageHeader, SectionCard } from "@/components/ui";

type SummaryMetric = {
  model: "Churn" | "CLV" | "Credit";
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  baselineDelta: string;
};

type SplitMetric = {
  model: string;
  split: "Train" | "Validation" | "Test" | "Backtest";
  primary: string;
  secondary: string;
  baselineDelta: string;
};

const SUMMARY_METRICS: SummaryMetric[] = [
  {
    model: "Churn",
    primaryLabel: "PR-AUC",
    primaryValue: "0.712",
    secondaryLabel: "F1",
    secondaryValue: "0.711",
    baselineDelta: "+8.4%",
  },
  {
    model: "CLV",
    primaryLabel: "MAE",
    primaryValue: "฿1,181",
    secondaryLabel: "Spearman",
    secondaryValue: "0.570",
    baselineDelta: "+12.8%",
  },
  {
    model: "Credit",
    primaryLabel: "SMAPE 90d",
    primaryValue: "33.7%",
    secondaryLabel: "Urgent recall",
    secondaryValue: "0.730",
    baselineDelta: "+9.1%",
  },
];

const SPLIT_METRICS: SplitMetric[] = [
  { model: "Churn", split: "Train", primary: "0.735 PR-AUC", secondary: "0.728 F1", baselineDelta: "+10.3%" },
  { model: "Churn", split: "Validation", primary: "0.718 PR-AUC", secondary: "0.716 F1", baselineDelta: "+9.2%" },
  { model: "Churn", split: "Test", primary: "0.712 PR-AUC", secondary: "0.711 F1", baselineDelta: "+8.4%" },
  { model: "Churn", split: "Backtest", primary: "0.684 PR-AUC", secondary: "0.689 F1", baselineDelta: "+5.3%" },
  { model: "CLV", split: "Train", primary: "฿1,090 MAE", secondary: "0.604 Spearman", baselineDelta: "+15.9%" },
  { model: "CLV", split: "Validation", primary: "฿1,164 MAE", secondary: "0.580 Spearman", baselineDelta: "+13.4%" },
  { model: "CLV", split: "Test", primary: "฿1,181 MAE", secondary: "0.570 Spearman", baselineDelta: "+12.8%" },
  { model: "CLV", split: "Backtest", primary: "฿1,249 MAE", secondary: "0.530 Spearman", baselineDelta: "+8.6%" },
  { model: "Credit", split: "Train", primary: "31.8% SMAPE", secondary: "0.780 coverage", baselineDelta: "+11.6%" },
  { model: "Credit", split: "Validation", primary: "32.9% SMAPE", secondary: "0.810 coverage", baselineDelta: "+10.4%" },
  { model: "Credit", split: "Test", primary: "33.7% SMAPE", secondary: "0.790 coverage", baselineDelta: "+9.1%" },
  { model: "Credit", split: "Backtest", primary: "34.9% SMAPE", secondary: "0.770 coverage", baselineDelta: "+6.2%" },
];

const CHURN_CLASSIFICATION = [
  ["ROC-AUC", "0.842"],
  ["PR-AUC", "0.712"],
  ["Precision", "0.681"],
  ["Recall", "0.744"],
  ["F1", "0.711"],
  ["Recall@top10%", "0.382"],
  ["Lift@top10%", "3.12x"],
  ["Brier score", "0.143"],
  ["Log loss", "0.421"],
  ["ECE", "0.036"],
] as const;

const CLV_REGRESSION = [
  ["MAE", "฿1,181"],
  ["RMSE", "฿2,840"],
  ["SMAPE", "31.8%"],
  ["Spearman", "0.570"],
  ["Top-decile capture", "44.0%"],
  ["Revenue-weighted MAE", "฿1,620"],
] as const;

const CREDIT_FORECAST = [
  ["MAE 30d", "920"],
  ["RMSE 30d", "2,311"],
  ["SMAPE 30d", "28.4%"],
  ["MAE 90d", "2,380"],
  ["RMSE 90d", "5,021"],
  ["SMAPE 90d", "33.7%"],
  ["P10-P90 coverage", "79.0%"],
  ["Urgent precision", "0.680"],
  ["Urgent recall", "0.730"],
] as const;

const CONFUSION_MATRIX = [
  ["True positive", "530"],
  ["False positive", "248"],
  ["False negative", "182"],
  ["True negative", "1,375"],
] as const;

export default function ModelMetricsPage() {
  return (
    <main className="pb-12">
      <PageHeader
        eyebrow="Model metrics"
        title="Model Accuracy"
      />

      <div className="px-8 mt-4 space-y-5">
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {SUMMARY_METRICS.map((metric) => (
            <MetricSummaryCard key={metric.model} metric={metric} />
          ))}
        </section>

        <SectionCard title="Metrics by split" hint="Train / validation / test / latest backtest">
          <MetricsBySplitTable rows={SPLIT_METRICS} />
        </SectionCard>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <MetricListCard title="Churn classification" rows={CHURN_CLASSIFICATION} />
          <MetricListCard title="CLV regression" rows={CLV_REGRESSION} />
          <MetricListCard title="Credit forecast" rows={CREDIT_FORECAST} />
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <SectionCard title="Churn threshold">
            <div className="grid grid-cols-2 gap-3">
              <SmallMetric label="Selected threshold" value="0.410" />
              <SmallMetric label="Precision" value="0.681" />
              <SmallMetric label="Recall" value="0.744" />
              <SmallMetric label="F1" value="0.711" />
            </div>
          </SectionCard>

          <SectionCard title="Confusion matrix">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {CONFUSION_MATRIX.map(([label, value]) => (
                <SmallMetric key={label} label={label} value={value} />
              ))}
            </div>
          </SectionCard>
        </section>

      </div>
    </main>
  );
}

function MetricSummaryCard({ metric }: { metric: SummaryMetric }) {
  return (
    <section className="surface lift p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-5)]">{metric.model}</p>
      <h3 className="mt-1 text-[13px] font-semibold text-[color:var(--ink-2)]">{metric.primaryLabel}</h3>

      <p className="num mt-4 text-[34px] font-semibold leading-none text-[color:var(--ink-1)]">{metric.primaryValue}</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-[color:var(--surface-2)] px-3 py-2">
          <p className="text-[11px] text-[color:var(--ink-5)]">{metric.secondaryLabel}</p>
          <p className="num mt-1 text-[15px] font-semibold text-[color:var(--ink-1)]">{metric.secondaryValue}</p>
        </div>
        <div className="rounded-xl bg-[color:var(--surface-2)] px-3 py-2">
          <p className="text-[11px] text-[color:var(--ink-5)]">vs baseline</p>
          <p className="num mt-1 text-[15px] font-semibold text-[color:var(--ok)]">{metric.baselineDelta}</p>
        </div>
      </div>
    </section>
  );
}

function MetricsBySplitTable({ rows }: { rows: SplitMetric[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Model</th>
            <th>Split</th>
            <th className="text-right">Primary metric</th>
            <th className="text-right">Secondary metric</th>
            <th className="text-right">Vs baseline</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.model}-${row.split}`}>
              <td className="font-medium">{row.model}</td>
              <td>{row.split}</td>
              <td className="num text-right">{row.primary}</td>
              <td className="num text-right">{row.secondary}</td>
              <td className="num text-right text-[color:var(--ok)]">{row.baselineDelta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricListCard({ title, rows }: { title: string; rows: readonly (readonly [string, string])[] }) {
  return (
    <SectionCard title={title}>
      <div className="divide-y divide-[color:var(--line-2)] rounded-xl border border-[color:var(--line-2)]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3">
            <p className="text-[12.5px] font-medium text-[color:var(--ink-2)]">{label}</p>
            <p className="num text-[14px] font-semibold text-[color:var(--ink-1)]">{value}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--line-2)] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ink-5)]">{label}</p>
      <p className="num mt-2 text-[20px] font-semibold text-[color:var(--ink-1)]">{value}</p>
    </div>
  );
}

