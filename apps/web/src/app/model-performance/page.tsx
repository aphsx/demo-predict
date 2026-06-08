"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  CircleDashed,
  Database,
  Layers,
  Lock,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  PageHeader,
  ProgressMeter,
  SectionCard,
  StatusPill,
} from "@/components/ui";

type HealthStatus = "healthy" | "watch" | "blocked" | "missing";
type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "brand" | "violet";
type Tab = "overview" | "churn" | "clv" | "credit" | "evidence";

type ChampionCard = {
  modelType: "churn" | "clv" | "credit";
  label: string;
  status: HealthStatus;
  version: string;
  algorithm: string;
  trainedAt: string;
  cutoffDate: string;
  horizonDays: number;
  primaryMetricName: string;
  primaryMetricValue: number;
  primaryMetricTarget: number;
  baselineDeltaPct: number;
  championDeltaPct: number;
  message: string;
};

type EvaluationRow = {
  model: string;
  train: HealthStatus;
  validation: HealthStatus;
  test: HealthStatus;
  backtest: HealthStatus;
  baseline: HealthStatus;
  calibration?: HealthStatus;
  ablation: HealthStatus;
  robustness: HealthStatus;
};

type SplitMetric = {
  split: string;
  primary: number;
  secondary: number;
  baselineDeltaPct: number;
  status: HealthStatus;
};

type SegmentMetric = {
  segment: string;
  metric: string;
  value: number;
  target: number;
  status: HealthStatus;
};

type ArtifactCheck = {
  label: string;
  status: HealthStatus;
  detail: string;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "churn", label: "Churn" },
  { id: "clv", label: "CLV" },
  { id: "credit", label: "Credit" },
  { id: "evidence", label: "Evidence" },
];

const MOCK_HEALTH = {
  overallStatus: "watch" as HealthStatus,
  latestTrainingRun: "2026-06-08 14:20",
  latestCutoffDate: "2025-07-01",
  latestTestCutoff: "2025-07-01",
  championCount: 3,
  watchCount: 2,
  blockedCount: 0,
  openFindings: [
    {
      severity: "watch" as HealthStatus,
      title: "Churn calibration drift needs review",
      detail: "ECE is still inside tolerance, but latest cutoff moved from 0.028 to 0.036.",
    },
    {
      severity: "watch" as HealthStatus,
      title: "Credit urgent bucket recall is below target",
      detail: "Urgent bucket recall is 0.73 vs target 0.75. Do not promote a replacement until this improves.",
    },
  ],
  champions: [
    {
      modelType: "churn",
      label: "Churn champion",
      status: "watch",
      version: "churn-v0.4.2",
      algorithm: "LightGBM + isotonic",
      trainedAt: "2026-06-08",
      cutoffDate: "2025-07-01",
      horizonDays: 180,
      primaryMetricName: "PR-AUC",
      primaryMetricValue: 0.712,
      primaryMetricTarget: 0.65,
      baselineDeltaPct: 8.4,
      championDeltaPct: 1.2,
      message: "Good ranking quality; calibration should stay on watch.",
    },
    {
      modelType: "clv",
      label: "CLV champion",
      status: "healthy",
      version: "clv-v0.3.1",
      algorithm: "Two-stage LightGBM",
      trainedAt: "2026-06-08",
      cutoffDate: "2025-07-01",
      horizonDays: 180,
      primaryMetricName: "MAE",
      primaryMetricValue: 1180.5,
      primaryMetricTarget: 1350,
      baselineDeltaPct: 12.8,
      championDeltaPct: 0.7,
      message: "Beats historical average baseline and preserves high-value ranking.",
    },
    {
      modelType: "credit",
      label: "Credit champion",
      status: "watch",
      version: "credit-v0.2.8",
      algorithm: "LightGBM quantile",
      trainedAt: "2026-06-08",
      cutoffDate: "2025-07-01",
      horizonDays: 90,
      primaryMetricName: "SMAPE 90d",
      primaryMetricValue: 0.337,
      primaryMetricTarget: 0.35,
      baselineDeltaPct: 9.1,
      championDeltaPct: -1.6,
      message: "Forecast error passes, urgent bucket recall needs monitoring.",
    },
  ] satisfies ChampionCard[],
  evaluationRows: [
    {
      model: "Churn",
      train: "healthy",
      validation: "healthy",
      test: "healthy",
      backtest: "watch",
      baseline: "healthy",
      calibration: "watch",
      ablation: "healthy",
      robustness: "watch",
    },
    {
      model: "CLV",
      train: "healthy",
      validation: "healthy",
      test: "healthy",
      backtest: "healthy",
      baseline: "healthy",
      ablation: "healthy",
      robustness: "healthy",
    },
    {
      model: "Credit",
      train: "healthy",
      validation: "healthy",
      test: "healthy",
      backtest: "healthy",
      baseline: "healthy",
      ablation: "healthy",
      robustness: "watch",
    },
  ] satisfies EvaluationRow[],
  churn: {
    threshold: {
      thresholdSource: "validation",
      selectedThreshold: 0.41,
      precision: 0.681,
      recall: 0.744,
      f1: 0.711,
      brier: 0.143,
      logLoss: 0.421,
      ece: 0.036,
      tp: 530,
      fp: 248,
      tn: 1375,
      fn: 182,
    },
    splitMetrics: [
      { split: "Validation", primary: 0.718, secondary: 0.386, baselineDeltaPct: 9.2, status: "healthy" },
      { split: "Test", primary: 0.712, secondary: 0.382, baselineDeltaPct: 8.4, status: "healthy" },
      { split: "Latest backtest", primary: 0.684, secondary: 0.351, baselineDeltaPct: 5.3, status: "watch" },
    ] satisfies SplitMetric[],
    backtests: [
      { split: "2024-10-01", primary: 0.706, secondary: 0.371, baselineDeltaPct: 7.8, status: "healthy" },
      { split: "2025-01-01", primary: 0.724, secondary: 0.394, baselineDeltaPct: 10.1, status: "healthy" },
      { split: "2025-04-01", primary: 0.701, secondary: 0.366, baselineDeltaPct: 6.4, status: "healthy" },
      { split: "2025-07-01", primary: 0.684, secondary: 0.351, baselineDeltaPct: 5.3, status: "watch" },
    ] satisfies SplitMetric[],
    segments: [
      { segment: "High value", metric: "Recall", value: 0.781, target: 0.72, status: "healthy" },
      { segment: "Low value", metric: "Recall", value: 0.702, target: 0.68, status: "healthy" },
      { segment: "SMS dominant", metric: "PR-AUC", value: 0.694, target: 0.65, status: "healthy" },
      { segment: "Low history", metric: "PR-AUC", value: 0.628, target: 0.65, status: "watch" },
    ] satisfies SegmentMetric[],
  },
  clv: {
    metrics: {
      mae: 1180.5,
      rmse: 2840.2,
      smape: 0.318,
      spearman: 0.57,
      topDecileCapture: 0.44,
      revenueWeightedMae: 1620.3,
      zeroActualRate: 0.49,
      outlierShare: 0.31,
    },
    splitMetrics: [
      { split: "Validation", primary: 1164.1, secondary: 0.58, baselineDeltaPct: 13.4, status: "healthy" },
      { split: "Test", primary: 1180.5, secondary: 0.57, baselineDeltaPct: 12.8, status: "healthy" },
      { split: "Latest backtest", primary: 1248.9, secondary: 0.53, baselineDeltaPct: 8.6, status: "healthy" },
    ] satisfies SplitMetric[],
    segments: [
      { segment: "High value", metric: "MAE", value: 3810, target: 4200, status: "healthy" },
      { segment: "Mid value", metric: "MAE", value: 1120, target: 1350, status: "healthy" },
      { segment: "Low value", metric: "MAE", value: 340, target: 500, status: "healthy" },
      { segment: "Top 1% outliers", metric: "Revenue share", value: 0.31, target: 0.35, status: "healthy" },
    ] satisfies SegmentMetric[],
  },
  credit: {
    metrics: {
      mae30d: 920.4,
      rmse30d: 2310.8,
      smape30d: 0.284,
      mae90d: 2380.2,
      rmse90d: 5020.7,
      smape90d: 0.337,
      quantileCoverage: 0.79,
      urgentPrecision: 0.68,
      urgentRecall: 0.73,
      followupMaeDays: 4.8,
    },
    splitMetrics: [
      { split: "Validation", primary: 0.329, secondary: 0.81, baselineDeltaPct: 10.4, status: "healthy" },
      { split: "Test", primary: 0.337, secondary: 0.79, baselineDeltaPct: 9.1, status: "healthy" },
      { split: "Latest backtest", primary: 0.349, secondary: 0.77, baselineDeltaPct: 6.2, status: "watch" },
    ] satisfies SplitMetric[],
    segments: [
      { segment: "SMS heavy", metric: "SMAPE 90d", value: 0.329, target: 0.35, status: "healthy" },
      { segment: "Email heavy", metric: "SMAPE 90d", value: 0.341, target: 0.35, status: "healthy" },
      { segment: "Low usage", metric: "SMAPE 90d", value: 0.362, target: 0.35, status: "watch" },
      { segment: "Urgent bucket", metric: "Recall", value: 0.73, target: 0.75, status: "watch" },
    ] satisfies SegmentMetric[],
  },
  artifacts: [
    { label: "Model artifacts", status: "healthy", detail: "3/3 champion artifacts load successfully" },
    { label: "Preprocessing artifacts", status: "healthy", detail: "ColumnTransformer contracts saved" },
    { label: "Feature sets", status: "healthy", detail: "24-feature Tier A contract linked by hash" },
    { label: "Label definitions", status: "healthy", detail: "cutoff and horizon definitions stored" },
    { label: "Model cards", status: "watch", detail: "CLV and churn complete, credit markdown pending" },
    { label: "Evaluation rows", status: "healthy", detail: "required train/validation/test/backtest rows exist in mock" },
  ] satisfies ArtifactCheck[],
};

export default function ModelHealthPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Model intelligence"
        title="Model Health"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="brand" dot={false}>Mock health data</StatusPill>
            <StatusPill tone={toneForStatus(MOCK_HEALTH.overallStatus)} icon={ShieldCheck}>
              {labelForStatus(MOCK_HEALTH.overallStatus)}
            </StatusPill>
          </div>
        }
      />

      <div className="px-8 mt-4 space-y-5">
        <HeroSummary />

        <div className="segmented">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "churn" && <ChurnTab />}
        {activeTab === "clv" && <ClvTab />}
        {activeTab === "credit" && <CreditTab />}
        {activeTab === "evidence" && <EvidenceTab />}
      </div>
    </div>
  );
}

function HeroSummary() {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[color:var(--line)] bg-white p-6 shadow-[var(--shadow-2)]">
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_70%_20%,rgba(37,99,235,0.13),transparent_36%),radial-gradient(circle_at_95%_75%,rgba(217,119,6,0.12),transparent_32%)]" />
      <div className="relative grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={toneForStatus(MOCK_HEALTH.overallStatus)} icon={ShieldCheck}>
              Portfolio {labelForStatus(MOCK_HEALTH.overallStatus)}
            </StatusPill>
            <StatusPill tone="neutral" dot={false}>Source: future /model-health</StatusPill>
          </div>
          <h2 className="mt-4 max-w-3xl text-[32px] font-semibold leading-tight tracking-[-0.04em] text-[color:var(--ink-1)]">
            Readiness view for champion models, not just a score board.
          </h2>
          <p className="mt-3 max-w-3xl text-[14px] leading-6 text-[color:var(--ink-4)]">
            หน้านี้ออกแบบให้ตรวจว่า churn, CLV และ credit model พร้อมใช้จริงหรือยัง โดยดู split-aware metrics,
            baseline/champion comparison, calibration, backtest, segment robustness และ artifact completeness ตาม docs ใหม่
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-2">
          <SummaryTile label="Champions" value={`${MOCK_HEALTH.championCount}/3`} tone="ok" />
          <SummaryTile label="Watch items" value={MOCK_HEALTH.watchCount.toString()} tone="warn" />
          <SummaryTile label="Blockers" value={MOCK_HEALTH.blockedCount.toString()} tone="ok" />
          <SummaryTile label="Latest cutoff" value={MOCK_HEALTH.latestCutoffDate} tone="info" />
        </div>
      </div>
    </section>
  );
}

function OverviewTab() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {MOCK_HEALTH.champions.map((model) => (
          <ChampionCard key={model.modelType} model={model} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title="Evaluation matrix" hint="Required rows before champion promotion">
          <EvaluationMatrix rows={MOCK_HEALTH.evaluationRows} />
        </SectionCard>

        <SectionCard title="Open blockers and warnings" hint="Shown before detailed metrics">
          <div className="space-y-3">
            {MOCK_HEALTH.openFindings.map((finding) => (
              <FindingCard key={finding.title} {...finding} />
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function ChurnTab() {
  const threshold = MOCK_HEALTH.churn.threshold;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Threshold and calibration" hint="Threshold is selected from validation only">
          <div className="grid grid-cols-2 gap-3">
            <MetricBox label="Selected threshold" value={formatDecimal(threshold.selectedThreshold)} hint={threshold.thresholdSource} />
            <MetricBox label="F1 at threshold" value={formatDecimal(threshold.f1)} hint="classification tradeoff" />
            <MetricBox label="Precision" value={formatDecimal(threshold.precision)} />
            <MetricBox label="Recall" value={formatDecimal(threshold.recall)} />
            <MetricBox label="Brier score" value={formatDecimal(threshold.brier)} hint="probability quality" />
            <MetricBox label="ECE" value={formatDecimal(threshold.ece)} hint="watch if rising" tone="warn" />
          </div>
        </SectionCard>

        <SectionCard title="Confusion matrix" hint="At selected validation threshold">
          <div className="grid grid-cols-2 gap-3">
            <ConfusionCell label="True positive" value={threshold.tp} tone="ok" />
            <ConfusionCell label="False positive" value={threshold.fp} tone="warn" />
            <ConfusionCell label="False negative" value={threshold.fn} tone="danger" />
            <ConfusionCell label="True negative" value={threshold.tn} tone="neutral" />
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SectionCard title="Split-aware churn metrics" hint="Primary = PR-AUC, secondary = recall@top10%">
          <SplitMetricTable rows={MOCK_HEALTH.churn.splitMetrics} primaryLabel="PR-AUC" secondaryLabel="Recall@top10%" />
        </SectionCard>
        <SectionCard title="Backtest stability" hint="Latest cutoff should not collapse">
          <SplitMetricTable rows={MOCK_HEALTH.churn.backtests} primaryLabel="PR-AUC" secondaryLabel="Recall@top10%" />
        </SectionCard>
      </div>

      <SectionCard title="Segment robustness" hint="Model should not fail only for a hidden segment">
        <SegmentTable rows={MOCK_HEALTH.churn.segments} />
      </SectionCard>
    </div>
  );
}

function ClvTab() {
  const metrics = MOCK_HEALTH.clv.metrics;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricBox label="MAE" value={formatCurrency(metrics.mae)} hint="primary metric" />
        <MetricBox label="RMSE" value={formatCurrency(metrics.rmse)} />
        <MetricBox label="SMAPE" value={formatPercent(metrics.smape)} />
        <MetricBox label="Spearman" value={formatDecimal(metrics.spearman)} hint="ranking quality" />
        <MetricBox label="Top decile capture" value={formatPercent(metrics.topDecileCapture)} tone="ok" />
        <MetricBox label="Revenue-weighted MAE" value={formatCurrency(metrics.revenueWeightedMae)} />
        <MetricBox label="Zero actual rate" value={formatPercent(metrics.zeroActualRate)} tone="warn" />
        <MetricBox label="Top 1% share" value={formatPercent(metrics.outlierShare)} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SectionCard title="Split-aware CLV metrics" hint="Primary = MAE, secondary = Spearman">
          <SplitMetricTable rows={MOCK_HEALTH.clv.splitMetrics} primaryLabel="MAE" secondaryLabel="Spearman" lowerPrimaryIsBetter />
        </SectionCard>
        <SectionCard title="Segment robustness" hint="Error by customer value tier">
          <SegmentTable rows={MOCK_HEALTH.clv.segments} />
        </SectionCard>
      </div>
    </div>
  );
}

function CreditTab() {
  const metrics = MOCK_HEALTH.credit.metrics;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricBox label="MAE 30d" value={formatNumber(metrics.mae30d)} />
        <MetricBox label="RMSE 30d" value={formatNumber(metrics.rmse30d)} />
        <MetricBox label="SMAPE 30d" value={formatPercent(metrics.smape30d)} />
        <MetricBox label="MAE 90d" value={formatNumber(metrics.mae90d)} />
        <MetricBox label="SMAPE 90d" value={formatPercent(metrics.smape90d)} hint="primary" />
        <MetricBox label="P10-P90 coverage" value={formatPercent(metrics.quantileCoverage)} hint="target 80%" />
        <MetricBox label="Urgent precision" value={formatDecimal(metrics.urgentPrecision)} />
        <MetricBox label="Urgent recall" value={formatDecimal(metrics.urgentRecall)} tone="warn" />
        <MetricBox label="Follow-up MAE" value={`${metrics.followupMaeDays.toFixed(1)}d`} />
        <MetricBox label="Negative forecasts" value="0" hint="blocker if > 0" tone="ok" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SectionCard title="Split-aware credit metrics" hint="Primary = SMAPE 90d, secondary = quantile coverage">
          <SplitMetricTable rows={MOCK_HEALTH.credit.splitMetrics} primaryLabel="SMAPE 90d" secondaryLabel="Coverage" lowerPrimaryIsBetter />
        </SectionCard>
        <SectionCard title="Segment robustness" hint="Error by usage/channel segment">
          <SegmentTable rows={MOCK_HEALTH.credit.segments} />
        </SectionCard>
      </div>
    </div>
  );
}

function EvidenceTab() {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <SectionCard title="Training lineage" hint="Versioning and reproducibility">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LineageItem icon={BookOpenCheck} label="Latest training run" value={MOCK_HEALTH.latestTrainingRun} />
          <LineageItem icon={Layers} label="Latest cutoff" value={MOCK_HEALTH.latestCutoffDate} />
          <LineageItem icon={Database} label="Test cutoff" value={MOCK_HEALTH.latestTestCutoff} />
          <LineageItem icon={Lock} label="Promotion decision" value="Do not auto-promote" />
        </div>
      </SectionCard>

      <SectionCard title="Artifact and model-card checklist" hint="Missing required evidence blocks promotion">
        <div className="space-y-3">
          {MOCK_HEALTH.artifacts.map((artifact) => (
            <div key={artifact.label} className="flex items-start justify-between gap-3 rounded-xl border border-[color:var(--line-2)] bg-[color:var(--surface-2)] px-4 py-3">
              <div>
                <div className="text-[13px] font-semibold text-[color:var(--ink-1)]">{artifact.label}</div>
                <div className="mt-0.5 text-[12px] text-[color:var(--ink-4)]">{artifact.detail}</div>
              </div>
              <StatusPill tone={toneForStatus(artifact.status)} dot={false}>
                {labelForStatus(artifact.status)}
              </StatusPill>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Future API contract" hint="This mock should be replaced by ML v2 data">
        <div className="rounded-xl border border-[color:var(--line-2)] bg-[color:var(--surface-2)] p-4">
          <p className="text-[13px] font-semibold text-[color:var(--ink-1)]">Expected source</p>
          <p className="mt-1 text-[12px] leading-5 text-[color:var(--ink-4)]">
            `GET /model-health` should aggregate `ml_model_aliases`, `ml_model_versions`,
            `ml_model_evaluations`, `ml_feature_sets`, `ml_training_runs`, and validation reports.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Promotion blockers" hint="These must be visible above detailed tables">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            "missing champion alias",
            "missing required evaluation rows",
            "candidate loses to baseline",
            "latest cutoff fails threshold",
            "churn calibration report missing",
            "artifact load test failed",
            "feature schema mismatch",
            "model card missing",
          ].map((blocker) => (
            <div key={blocker} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[12px] text-[color:var(--ink-3)]">
              <CircleDashed size={13} className="text-[color:var(--ink-5)]" />
              {blocker}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function ChampionCard({ model }: { model: ChampionCard }) {
  const lowerIsBetter = model.modelType !== "churn";
  const progress = lowerIsBetter
    ? Math.min(100, (model.primaryMetricTarget / model.primaryMetricValue) * 100)
    : Math.min(100, (model.primaryMetricValue / model.primaryMetricTarget) * 100);

  return (
    <section className="surface lift overflow-hidden">
      <div className="border-b border-[color:var(--line-2)] bg-[color:var(--surface-2)] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-5)]">{model.label}</p>
            <h3 className="mt-1 text-[16px] font-semibold text-[color:var(--ink-1)]">{model.version}</h3>
          </div>
          <StatusPill tone={toneForStatus(model.status)}>{labelForStatus(model.status)}</StatusPill>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <div className="text-[12px] text-[color:var(--ink-4)]">{model.algorithm}</div>
          <div className="mt-1 text-[11.5px] text-[color:var(--ink-5)]">
            cutoff {model.cutoffDate} · horizon {model.horizonDays}d · trained {model.trainedAt}
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="num text-[30px] font-semibold text-[color:var(--ink-1)]">
                {lowerIsBetter ? formatNumber(model.primaryMetricValue) : formatDecimal(model.primaryMetricValue)}
              </div>
              <div className="text-[11.5px] text-[color:var(--ink-5)]">{model.primaryMetricName} · target {formatMetricTarget(model.primaryMetricTarget, lowerIsBetter)}</div>
            </div>
            <div className="text-right text-[11.5px] text-[color:var(--ink-4)]">
              <div className="num font-semibold text-[color:var(--ok)]">+{model.baselineDeltaPct.toFixed(1)}%</div>
              <div>vs baseline</div>
            </div>
          </div>
          <div className="mt-3">
            <ProgressMeter value={progress} max={100} tone={toneForStatus(model.status) === "ok" ? "emerald" : "amber"} showValue={false} />
          </div>
        </div>

        <p className="rounded-xl bg-[color:var(--surface-2)] px-3 py-2 text-[12px] leading-5 text-[color:var(--ink-4)]">
          {model.message}
        </p>
      </div>
    </section>
  );
}

function EvaluationMatrix({ rows }: { rows: EvaluationRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Model</th>
            <th>Train</th>
            <th>Validation</th>
            <th>Test</th>
            <th>Backtest</th>
            <th>Baseline</th>
            <th>Calibration</th>
            <th>Ablation</th>
            <th>Robustness</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.model}>
              <td className="font-medium">{row.model}</td>
              <StatusCell status={row.train} />
              <StatusCell status={row.validation} />
              <StatusCell status={row.test} />
              <StatusCell status={row.backtest} />
              <StatusCell status={row.baseline} />
              <StatusCell status={row.calibration ?? "missing"} optional={row.calibration == null} />
              <StatusCell status={row.ablation} />
              <StatusCell status={row.robustness} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SplitMetricTable({
  rows,
  primaryLabel,
  secondaryLabel,
  lowerPrimaryIsBetter = false,
}: {
  rows: SplitMetric[];
  primaryLabel: string;
  secondaryLabel: string;
  lowerPrimaryIsBetter?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Split / cutoff</th>
            <th className="text-right">{primaryLabel}</th>
            <th className="text-right">{secondaryLabel}</th>
            <th className="text-right">Baseline delta</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.split}>
              <td className="font-medium">{row.split}</td>
              <td className="num text-right">
                {lowerPrimaryIsBetter && row.primary > 1 ? formatNumber(row.primary) : formatDecimal(row.primary)}
              </td>
              <td className="num text-right">{formatDecimal(row.secondary)}</td>
              <td className="num text-right text-[color:var(--ok)]">+{row.baselineDeltaPct.toFixed(1)}%</td>
              <td><StatusPill tone={toneForStatus(row.status)} dot={false}>{labelForStatus(row.status)}</StatusPill></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SegmentTable({ rows }: { rows: SegmentMetric[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Segment</th>
            <th>Metric</th>
            <th className="text-right">Value</th>
            <th className="text-right">Target</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.segment}-${row.metric}`}>
              <td className="font-medium">{row.segment}</td>
              <td>{row.metric}</td>
              <td className="num text-right">{formatSegmentValue(row.value)}</td>
              <td className="num text-right">{formatSegmentValue(row.target)}</td>
              <td><StatusPill tone={toneForStatus(row.status)} dot={false}>{labelForStatus(row.status)}</StatusPill></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FindingCard({
  severity,
  title,
  detail,
}: {
  severity: HealthStatus;
  title: string;
  detail: string;
}) {
  const Icon = severity === "blocked" ? AlertTriangle : severity === "healthy" ? CheckCircle2 : AlertTriangle;

  return (
    <div className="flex gap-3 rounded-xl border border-[color:var(--line-2)] bg-[color:var(--surface-2)] p-3">
      <div className="mt-0.5 text-[color:var(--warn)]">
        <Icon size={15} />
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-semibold text-[color:var(--ink-1)]">{title}</p>
          <StatusPill tone={toneForStatus(severity)} dot={false}>{labelForStatus(severity)}</StatusPill>
        </div>
        <p className="mt-1 text-[12px] leading-5 text-[color:var(--ink-4)]">{detail}</p>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-2xl border border-[color:var(--line-2)] bg-white/88 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-5)]">{label}</p>
      <p className="num mt-2 text-[22px] font-semibold text-[color:var(--ink-1)]">{value}</p>
      <div className="mt-3">
        <StatusPill tone={tone} dot={false}>tracked</StatusPill>
      </div>
    </div>
  );
}

function MetricBox({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--line-2)] bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ink-5)]">{label}</p>
        {tone !== "neutral" && <StatusPill tone={tone} dot={false}>{tone === "ok" ? "pass" : "watch"}</StatusPill>}
      </div>
      <p className="num mt-2 text-[21px] font-semibold text-[color:var(--ink-1)]">{value}</p>
      {hint && <p className="mt-1 text-[11.5px] text-[color:var(--ink-5)]">{hint}</p>}
    </div>
  );
}

function ConfusionCell({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className="rounded-xl border border-[color:var(--line-2)] bg-[color:var(--surface-2)] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-[color:var(--ink-3)]">{label}</p>
        <StatusPill tone={tone} dot={false}>{tone}</StatusPill>
      </div>
      <p className="num mt-3 text-[26px] font-semibold text-[color:var(--ink-1)]">{value.toLocaleString()}</p>
    </div>
  );
}

function LineageItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="surface-soft p-4">
      <div className="flex items-center gap-2 text-[color:var(--ink-4)]">
        <Icon size={14} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ink-5)]">{label}</span>
      </div>
      <p className="num mt-2 text-[15px] font-semibold text-[color:var(--ink-1)]">{value}</p>
    </div>
  );
}

function StatusCell({ status, optional = false }: { status: HealthStatus; optional?: boolean }) {
  return (
    <td>
      <StatusPill tone={optional ? "neutral" : toneForStatus(status)} dot={false}>
        {optional ? "n/a" : labelForStatus(status)}
      </StatusPill>
    </td>
  );
}

function toneForStatus(status: HealthStatus): Tone {
  if (status === "healthy") return "ok";
  if (status === "watch") return "warn";
  if (status === "blocked") return "danger";
  return "neutral";
}

function labelForStatus(status: HealthStatus) {
  if (status === "healthy") return "Healthy";
  if (status === "watch") return "Watch";
  if (status === "blocked") return "Blocked";
  return "Missing";
}

function formatDecimal(value: number) {
  return value.toFixed(3);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatCurrency(value: number) {
  return `฿${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatMetricTarget(value: number, lowerIsBetter: boolean) {
  if (lowerIsBetter && value > 1) return formatNumber(value);
  return value > 1 ? formatNumber(value) : formatDecimal(value);
}

function formatSegmentValue(value: number) {
  return value > 10 ? formatNumber(value) : formatDecimal(value);
}
