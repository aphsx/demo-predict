/**
 * Deterministic ML v2 mock provider.
 *
 * One generated customer population per run; every aggregate
 * (summary KPIs, matrix, top priority) is DERIVED from those rows with the
 * same formulas the real prediction runner will use
 * (docs/ML-V2-OUTPUT-CONTRACT.md §5), so numbers agree across pages.
 * Served by lib/mlApi.ts while NEXT_PUBLIC_ML_USE_MOCK === "1".
 */

import type {
  ChurnFactor,
  LifecycleStage,
  ModelPerfEntry,
  MonthlyUsagePoint,
  OutputsPage,
  OutputsQuery,
  PaymentEvent,
  PredictionOutput,
  PredictionRun,
  ProfileSnapshot,
  RiskLevel,
  RunSummary,
  TrainingRun,
  UrgencyLevel,
  ValueTier,
} from "@/lib/mlApi";
import type { PredictDataSource, PredictImportDone } from "@/lib/api";

// ── Seeded PRNG (mulberry32) — stable across reloads ───────────

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Thresholds / config (mirror of OUTPUT-CONTRACT §5) ─────────

const RISK_THRESHOLDS = { medium: 0.3, high: 0.6, critical: 0.85 };
const MODEL_VERSIONS = { churn: "churn_v3", clv: "clv_v2", credit: "credit_v2" };

function riskLevel(p: number): RiskLevel {
  if (p >= RISK_THRESHOLDS.critical) return "critical";
  if (p >= RISK_THRESHOLDS.high) return "high";
  if (p >= RISK_THRESHOLDS.medium) return "medium";
  return "low";
}

function urgencyLevel(days: number | null): UrgencyLevel | null {
  if (days === null) return null;
  if (days <= 14) return "critical";
  if (days <= 30) return "warning";
  if (days <= 90) return "monitor";
  return "stable";
}

// ── Runs ────────────────────────────────────────────────────────

const BASE_RUNS: PredictionRun[] = [
  {
    id: "run-2026-06",
    name: "June 2026 — monthly scoring",
    status: "completed",
    predict_source_id: "psrc-2026-06",
    predict_source_name: "predict-export-2026-06",
    cutoff_date: "2026-06-01",
    total_customers: 1284,
    created_by: "aphisit",
    created_at: "2026-06-02T03:10:00+07:00",
    finished_at: "2026-06-02T03:14:21+07:00",
    error_message: null,
    progress: null,
  },
  {
    id: "run-2026-05",
    name: "May 2026 — monthly scoring",
    status: "completed",
    predict_source_id: "psrc-2026-05",
    predict_source_name: "predict-export-2026-05",
    cutoff_date: "2026-05-01",
    total_customers: 1241,
    created_by: "aphisit",
    created_at: "2026-05-02T02:55:00+07:00",
    finished_at: "2026-05-02T02:59:03+07:00",
    error_message: null,
    progress: null,
  },
  {
    id: "run-2026-04-fail",
    name: "April 2026 — rerun test",
    status: "failed",
    predict_source_id: "psrc-2026-04",
    predict_source_name: "predict-export-2026-04",
    cutoff_date: "2026-04-01",
    total_customers: null,
    created_by: "aphisit",
    created_at: "2026-04-03T10:02:00+07:00",
    finished_at: null,
    error_message: "Gate 2 failed: predict_clean_usage has 213 rows with invalid channel",
    progress: null,
  },
];

const SOURCE_MANIFEST = {
  raw: {
    users_user_profile: 1284,
    backend_payment: 6420,
    sms_usage_bc: 9384,
    sms_usage_api: 7421,
    sms_usage_otp: 8162,
    email_usage_bc: 5128,
    email_usage_api: 4330,
    email_usage_otp: 2984,
  },
  clean: {
    customers: 1284,
    payments: 6411,
    usage: 37409,
  },
  skipped: {
    customers_no_acc_id: 0,
    payments_no_acc_id: 6,
    payments_no_date: 3,
    usage_no_acc_id: 0,
  },
  warnings: [],
};

const BASE_PREDICT_SOURCES: PredictDataSource[] = [
  {
    id: "psrc-2026-06",
    name: "predict-export-2026-06",
    client_label: "1Moby demo",
    original_filename: "predict-export-2026-06.xlsx",
    file_checksum_sha256: "demo-psrc-2026-06",
    file_size_bytes: 2_840_112,
    import_status: "ready",
    imported_at: "2026-06-02T03:05:00+07:00",
    sheet_manifest: SOURCE_MANIFEST.raw,
    clean_manifest: SOURCE_MANIFEST,
    cleaned_at: "2026-06-02T03:07:00+07:00",
    notes: "Demo source generated from ML v2 output contract",
    error_message: null,
    imported_by: "demo",
    importer_name: "aphisit",
    importer_email: null,
    created_at: "2026-06-02T03:05:00+07:00",
  },
  {
    id: "psrc-2026-05",
    name: "predict-export-2026-05",
    client_label: "1Moby demo",
    original_filename: "predict-export-2026-05.xlsx",
    file_checksum_sha256: "demo-psrc-2026-05",
    file_size_bytes: 2_716_448,
    import_status: "ready",
    imported_at: "2026-05-02T02:49:00+07:00",
    sheet_manifest: SOURCE_MANIFEST.raw,
    clean_manifest: SOURCE_MANIFEST,
    cleaned_at: "2026-05-02T02:51:00+07:00",
    notes: "Demo source generated from ML v2 output contract",
    error_message: null,
    imported_by: "demo",
    importer_name: "aphisit",
    importer_email: null,
    created_at: "2026-05-02T02:49:00+07:00",
  },
];

// Session-local additions from mockCreatePredictionRun (not persisted).
const sessionRuns: PredictionRun[] = [];
const baseRunOverrides = new Map<string, PredictionRun>();
const deletedRunIds = new Set<string>();
const sessionSources: PredictDataSource[] = [];

export function mockPredictDataSources(): PredictDataSource[] {
  return [...sessionSources, ...BASE_PREDICT_SOURCES];
}

export function mockPredictDataSource(id: string): PredictDataSource {
  const source = mockPredictDataSources().find((s) => s.id === id);
  if (!source) throw new Error("Predict data source not found");
  return source;
}

export function mockUploadPredictDataFile(
  file: File,
  name?: string,
  clientLabel?: string,
  notes?: string
): PredictImportDone {
  const sourceId = `psrc-local-${sessionSources.length + 1}`;
  const source: PredictDataSource = {
    id: sourceId,
    name: name?.trim() || file.name.replace(/\.xlsx$/i, ""),
    client_label: clientLabel?.trim() || null,
    original_filename: file.name,
    file_checksum_sha256: `demo-${sourceId}`,
    file_size_bytes: file.size,
    import_status: "ready",
    imported_at: new Date().toISOString(),
    sheet_manifest: SOURCE_MANIFEST.raw,
    clean_manifest: SOURCE_MANIFEST,
    cleaned_at: new Date().toISOString(),
    notes: notes?.trim() || "Demo import; no file was sent to the prediction API",
    error_message: null,
    imported_by: "demo",
    importer_name: "you",
    importer_email: null,
    created_at: new Date().toISOString(),
  };
  sessionSources.unshift(source);
  return {
    source_id: source.id,
    import_status: source.import_status,
    sheet_manifest: SOURCE_MANIFEST.raw,
    file_checksum_sha256: source.file_checksum_sha256,
    clean_manifest: SOURCE_MANIFEST,
  };
}

export function mockPredictionRuns(): PredictionRun[] {
  const baseRuns = BASE_RUNS
    .map((run) => baseRunOverrides.get(run.id) ?? run)
    .filter((run) => !deletedRunIds.has(run.id));
  return [...sessionRuns.filter((run) => !deletedRunIds.has(run.id)), ...baseRuns];
}

export function mockCreatePredictionRun(input: {
  predict_source_id: string;
  name: string;
  cutoff_date: string;
}): PredictionRun {
  const source = mockPredictDataSources().find((s) => s.id === input.predict_source_id);
  const run: PredictionRun = {
    id: `run-local-${sessionRuns.length + 1}`,
    name: input.name,
    status: "in_progress",
    predict_source_id: input.predict_source_id,
    predict_source_name: source?.name ?? input.predict_source_id,
    cutoff_date: input.cutoff_date,
    total_customers: null,
    created_by: "you",
    created_at: new Date().toISOString(),
    finished_at: null,
    error_message: null,
    progress: { step: "Building features", pct: 35 },
  };
  sessionRuns.unshift(run);
  // Demo: complete the run after a short delay.
  setTimeout(() => {
    run.status = "completed";
    run.progress = null;
    run.total_customers = 1284;
    run.finished_at = new Date().toISOString();
  }, 6000);
  return run;
}

/** Same shape as GET /predict-data-sources/:id/suggested-cutoff. */
export function mockPredictSuggestedCutoff(_sourceId: string): { suggested_cutoff: string } {
  return { suggested_cutoff: new Date().toISOString().slice(0, 10) };
}

/** Same shape as GET /train-data-sources/:id/suggested-cutoff (Gate 3). */
export function mockTrainSuggestedCutoff(_sourceId: string): {
  suggested_cutoff: string;
  latest_data_date: string;
  horizon_days: number;
} {
  const horizonDays = 180;
  const latest = new Date();
  const cutoff = new Date(latest);
  cutoff.setDate(cutoff.getDate() + 1 - horizonDays);
  return {
    suggested_cutoff: cutoff.toISOString().slice(0, 10),
    latest_data_date: latest.toISOString().slice(0, 10),
    horizon_days: horizonDays,
  };
}

export function mockDeletePredictionRun(id: string): void {
  const i = sessionRuns.findIndex((r) => r.id === id);
  if (i >= 0) {
    sessionRuns.splice(i, 1);
    return;
  }
  deletedRunIds.add(id);
  baseRunOverrides.delete(id);
}

export function mockRetryPredictionRun(id: string): PredictionRun {
  const run = mockPredictionRuns().find((r) => r.id === id);
  if (!run) throw new Error("Run not found");
  const rerun: PredictionRun = {
    ...run,
    status: "in_progress",
    error_message: null,
    finished_at: null,
    progress: { step: "Re-running gates", pct: 10 },
  };
  const sessionIndex = sessionRuns.findIndex((r) => r.id === id);
  if (sessionIndex >= 0) {
    sessionRuns[sessionIndex] = rerun;
  } else {
    baseRunOverrides.set(id, rerun);
  }
  setTimeout(() => {
    rerun.status = "completed";
    rerun.progress = null;
    rerun.total_customers = 1284;
    rerun.finished_at = new Date().toISOString();
  }, 6000);
  return rerun;
}

// ── Customer population (per run, cached) ──────────────────────

const POPULATION = 1284;
const FEATURE_POOL: { feature: string; label: string }[] = [
  { feature: "days_since_last_usage", label: "ไม่มียอดใช้งานล่าสุด" },
  { feature: "usage_decay_ratio", label: "ยอดใช้งาน 90 วันหดตัว" },
  { feature: "payment_overdue_ratio", label: "เลยรอบจ่ายปกติ" },
  { feature: "payment_count_180d", label: "จำนวนการจ่าย 180 วัน" },
  { feature: "usage_consistency_ratio", label: "ความสม่ำเสมอการใช้งาน" },
  { feature: "total_revenue_180d", label: "รายได้ 180 วันล่าสุด" },
  { feature: "customer_age_days", label: "อายุลูกค้า" },
];

function runSeed(runId: string): number {
  let h = 2166136261;
  for (const c of runId) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function buildCustomer(runId: string, cutoff: string, accId: number): PredictionOutput {
  const r = rng(runSeed(runId) ^ (accId * 2654435761));
  const cutoffDate = new Date(cutoff);

  // lifecycle mix ~ Paid 40% / Free 26% / Churned 19.5% / Ghost 14.5%
  const roll = r();
  const stage: LifecycleStage =
    roll < 0.4 ? "Active Paid" : roll < 0.66 ? "Active Free" : roll < 0.855 ? "Churned" : "Ghost";
  const everPaid = stage === "Active Paid" || (stage === "Churned" && r() < 0.55);
  const subStage =
    stage === "Churned" ? (everPaid ? "Churned Paid" : "Churned Free") : stage;

  const isActive = stage === "Active Paid" || stage === "Active Free";
  const hasHistory = stage !== "Ghost";

  // descriptive facts
  const ageDays = Math.floor(120 + r() * 2400);
  const lastActivity = !hasHistory
    ? null
    : isActive
      ? Math.floor(r() * 60)
      : Math.floor(181 + r() * 360);
  const nPurchases = everPaid ? Math.floor(1 + r() * 24) : 0;
  const avgTicket = everPaid ? Math.round((800 + r() * 9000) * 100) / 100 : null;
  const totalRevenue = everPaid && avgTicket ? Math.round(nPurchases * avgTicket * 100) / 100 : 0;
  const usageTrendRoll = r();
  const usageTrend = !hasHistory
    ? "no_usage"
    : usageTrendRoll < 0.25
      ? "increasing"
      : usageTrendRoll < 0.6
        ? "stable"
        : "declining";

  // churn model — Active Paid only
  let churnP: number | null = null;
  let factors: ChurnFactor[] | null = null;
  if (stage === "Active Paid") {
    const base = usageTrend === "declining" ? 0.45 : usageTrend === "stable" ? 0.22 : 0.1;
    churnP = Math.min(0.98, Math.max(0.02, base + (r() - 0.35) * 0.55));
    churnP = Math.round(churnP * 10000) / 10000;
    const nf = 5;
    const shuffled = [...FEATURE_POOL].sort(() => r() - 0.5).slice(0, nf);
    factors = shuffled
      .map((f, i) => ({
        feature: f.feature,
        value: Math.round(r() * 120),
        direction: (i < 2 ? churnP! >= 0.5 : r() < 0.5) ? ("up" as const) : ("down" as const),
        impact: Math.round((0.3 - i * 0.05 + r() * 0.05) * 1000) / 1000,
      }))
      .sort((a, b) => b.impact - a.impact);
  }

  // clv model — active only
  let clv: number | null = null;
  let pAlive: number | null = null;
  if (isActive) {
    const scale = stage === "Active Paid" ? totalRevenue / Math.max(ageDays / 180, 1) : r() * 1500;
    clv = Math.round(Math.max(0, scale * (0.4 + r() * 1.4)) * 100) / 100;
    pAlive = Math.round((isActive ? 0.55 + r() * 0.44 : r() * 0.4) * 10000) / 10000;
  }

  // credit model — has history
  let credit30: number | null = null;
  let credit90: number | null = null;
  let interval: PredictionOutput["credit_forecast_interval"] = null;
  let daysUntilTopup: number | null = null;
  const creditSms = Math.round(r() * 60000);
  const creditEmail = Math.round(r() * 30000);
  if (hasHistory && isActive) {
    credit30 = Math.round(r() * 45000);
    credit90 = Math.round(credit30 * (2.4 + r() * 1.2));
    interval = {
      p10_30d: Math.round(credit30 * 0.55),
      p90_30d: Math.round(credit30 * 1.65),
      p10_90d: Math.round(credit90 * 0.5),
      p90_90d: Math.round(credit90 * 1.7),
    };
    const dailyBurn = credit30 / 30;
    daysUntilTopup =
      dailyBurn > 0 ? Math.min(365, Math.floor((creditSms + creditEmail) / dailyBurn)) : null;
  }
  const urgency = isActive ? urgencyLevel(daysUntilTopup) : null;

  // derived business (contract §5)
  const revenueAtRisk =
    churnP !== null && clv !== null ? Math.round(churnP * clv * 100) / 100 : null;

  const snapshot: ProfileSnapshot = {
    join_date: new Date(cutoffDate.getTime() - ageDays * 86400000).toISOString().slice(0, 10),
    customer_age_days: ageDays,
    status_sms: r() < 0.8 ? "active" : "suspended",
    status_email: r() < 0.7 ? "active" : "inactive",
    credit_sms: creditSms,
    credit_email: creditEmail,
    expire_sms: new Date(cutoffDate.getTime() + Math.floor(r() * 300) * 86400000).toISOString().slice(0, 10),
    expire_email: new Date(cutoffDate.getTime() + Math.floor(r() * 300) * 86400000).toISOString().slice(0, 10),
    last_access: lastActivity === null ? null
      : new Date(cutoffDate.getTime() - lastActivity * 86400000).toISOString(),
    last_send: lastActivity === null ? null
      : new Date(cutoffDate.getTime() - (lastActivity + 2) * 86400000).toISOString(),
    sms_usage_share: 0.55, email_usage_share: 0.45,
    bc_usage_share: 0.4, api_usage_share: 0.35, otp_usage_share: 0.25,
    usage_total_180d: hasHistory ? Math.round(r() * 250000) : 0,
  };

  const notEligible = (reason: string) =>
    ({ eligible: false, status: "not_eligible" as const, reason });
  const predicted = { eligible: true, status: "predicted" as const, reason: null };

  const eligibility = {
    churn: stage === "Active Paid" ? predicted
      : stage === "Active Free" ? notEligible("ลูกค้าไม่เคยจ่ายเงิน — ไม่เข้านิยาม churn")
      : stage === "Churned" ? notEligible("churn ไปแล้ว (สถานะที่เกิดขึ้นจริง)")
      : notEligible("ไม่มีประวัติการใช้งาน"),
    clv: isActive ? predicted : notEligible("ลูกค้าไม่ active ใน 180 วันก่อน cutoff"),
    credit: isActive && hasHistory ? predicted : notEligible("ไม่มีประวัติการใช้งานเพียงพอ"),
  };

  return {
    prediction_run_id: runId,
    acc_id: accId,
    lifecycle_stage: stage,
    sub_stage: subStage,
    days_since_last_activity: lastActivity,
    n_purchases: nPurchases,
    total_revenue: totalRevenue,
    avg_transaction_value: avgTicket,
    ever_paid: everPaid,
    usage_trend: usageTrend,
    profile_snapshot: snapshot,
    churn_probability: churnP,
    churn_risk_level: churnP === null ? null : riskLevel(churnP),
    churn_factors: factors,
    predicted_clv_6m: clv,
    p_alive: pAlive,
    customer_value_tier: "none", // assigned after population percentiles below
    predicted_credit_usage_30d: credit30,
    predicted_credit_usage_90d: credit90,
    credit_forecast_interval: interval,
    estimated_days_until_topup: daysUntilTopup,
    credit_urgency_level: urgency,
    revenue_at_risk: revenueAtRisk,
    priority_score: 0, // assigned below
    priority_reason: "",
    ai_status: "not_requested",
    ai_explanation: null,
    ai_recommended_message: null,
    output_status: stage === "Active Paid" ? "predicted" : "partial",
    model_eligibility: eligibility,
    model_versions: MODEL_VERSIONS,
  };
}

function assignDerived(rows: PredictionOutput[]): void {
  // value tier: percentile of CLV among active (contract §3.5)
  const active = rows.filter((c) => c.predicted_clv_6m !== null && c.predicted_clv_6m > 0);
  const sorted = [...active].sort((a, b) => (b.predicted_clv_6m ?? 0) - (a.predicted_clv_6m ?? 0));
  sorted.forEach((c, i) => {
    const pct = i / Math.max(sorted.length - 1, 1);
    c.customer_value_tier = pct < 0.1 ? "high" : pct < 0.5 ? "mid" : "low";
  });

  // priority score: 50×risk + 30×value pct + 20×credit (contract §5.2)
  const clvRank = new Map<number, number>();
  sorted.forEach((c, i) => clvRank.set(c.acc_id, 1 - i / Math.max(sorted.length - 1, 1)));
  for (const c of rows) {
    const pRisk = c.churn_probability ?? 0;
    const pValue = clvRank.get(c.acc_id) ?? 0;
    const pCredit =
      c.estimated_days_until_topup === null
        ? 0
        : Math.max(0, 1 - c.estimated_days_until_topup / 90);
    c.priority_score = Math.round((50 * pRisk + 30 * pValue + 20 * pCredit) * 100) / 100;

    const drivers: [number, string][] = [
      [50 * pRisk, `เสี่ยง churn ${(pRisk * 100).toFixed(0)}%`],
      [30 * pValue, `มูลค่าสูง (CLV อันดับ ${(pValue * 100).toFixed(0)} pct)`],
      [20 * pCredit, `เครดิตใกล้หมดใน ${c.estimated_days_until_topup ?? "-"} วัน`],
    ];
    drivers.sort((a, b) => b[0] - a[0]);
    c.priority_reason = drivers[0][0] > 0 ? drivers[0][1] : "ไม่มีสัญญาณเร่งด่วน";
  }
}

const populationCache = new Map<string, PredictionOutput[]>();

function population(runId: string): PredictionOutput[] {
  const cached = populationCache.get(runId);
  if (cached) return cached;
  const run = mockPredictionRuns().find((x) => x.id === runId) ?? BASE_RUNS[0];
  const rows: PredictionOutput[] = [];
  for (let i = 0; i < POPULATION; i++) {
    rows.push(buildCustomer(run.id, run.cutoff_date, 10001 + i * 7));
  }
  assignDerived(rows);
  populationCache.set(runId, rows);
  return rows;
}

// ── Summary (derived from the same rows — spec §4) ─────────────

export function mockRunSummary(runId: string): RunSummary {
  const run = mockPredictionRuns().find((x) => x.id === runId);
  if (!run) throw new Error("Run not found");
  if (run.status !== "completed") throw new Error("Run is not completed yet");
  const rows = population(runId);

  const count = (f: (c: PredictionOutput) => boolean) => rows.filter(f).length;
  const paid = rows.filter((c) => c.lifecycle_stage === "Active Paid");

  const byRisk: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const c of paid) if (c.churn_risk_level) byRisk[c.churn_risk_level]++;

  const matrix: RunSummary["value_risk_matrix"] = [];
  for (const tier of ["high", "mid", "low"] as ValueTier[]) {
    for (const risk of ["low", "medium", "high", "critical"] as RiskLevel[]) {
      const cell = paid.filter(
        (c) => c.customer_value_tier === tier && c.churn_risk_level === risk
      );
      matrix.push({
        value_tier: tier,
        risk_level: risk,
        count: cell.length,
        clv_sum: Math.round(cell.reduce((s, c) => s + (c.predicted_clv_6m ?? 0), 0)),
      });
    }
  }

  const byUrgency: Record<UrgencyLevel, number> = { critical: 0, warning: 0, monitor: 0, stable: 0 };
  for (const c of rows) if (c.credit_urgency_level) byUrgency[c.credit_urgency_level]++;

  // 12 months of "actual" revenue ending at cutoff
  const r = rng(runSeed(runId) ^ 0x5eed);
  const cutoff = new Date(run.cutoff_date);
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(cutoff.getFullYear(), cutoff.getMonth() - 12 + i, 1);
    const amount = Math.round(820000 + r() * 380000 + i * 9000);
    return {
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      amount,
      n_payments: Math.round(amount / 4200),
    };
  });

  const topPriority = [...rows]
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, 10)
    .map((c) => ({
      acc_id: c.acc_id,
      lifecycle_stage: c.lifecycle_stage,
      churn_probability: c.churn_probability,
      predicted_clv_6m: c.predicted_clv_6m,
      priority_score: c.priority_score,
      priority_reason: c.priority_reason,
    }));

  return {
    run: {
      id: run.id,
      name: run.name,
      cutoff_date: run.cutoff_date,
      status: run.status,
      total_customers: rows.length,
      finished_at: run.finished_at,
    },
    lifecycle: {
      active_paid: paid.length,
      active_free: count((c) => c.lifecycle_stage === "Active Free"),
      churned: count((c) => c.lifecycle_stage === "Churned"),
      ghost: count((c) => c.lifecycle_stage === "Ghost"),
    },
    churn: { eligible_count: paid.length, by_risk: byRisk, thresholds: RISK_THRESHOLDS },
    revenue: {
      expected_at_risk: Math.round(paid.reduce((s, c) => s + (c.revenue_at_risk ?? 0), 0)),
      high_risk_exposure: Math.round(
        paid
          .filter((c) => c.churn_risk_level === "high" || c.churn_risk_level === "critical")
          .reduce((s, c) => s + (c.predicted_clv_6m ?? 0), 0)
      ),
      monthly_actual: monthly,
    },
    value_risk_matrix: matrix,
    credit: {
      demand_30d: Math.round(
        rows
          .filter((c) => c.lifecycle_stage === "Active Paid" || c.lifecycle_stage === "Active Free")
          .reduce((s, c) => s + (c.predicted_credit_usage_30d ?? 0), 0)
      ),
      by_urgency: byUrgency,
      topup_due_7d: count(
        (c) => c.estimated_days_until_topup !== null && c.estimated_days_until_topup <= 7
      ),
    },
    top_priority: topPriority,
    model_versions: MODEL_VERSIONS,
  };
}

// ── Outputs table ───────────────────────────────────────────────

export function mockRunOutputs(runId: string, q: OutputsQuery): OutputsPage {
  let rows = [...population(runId)];

  if (q.search) rows = rows.filter((c) => String(c.acc_id).includes(q.search!));
  if (q.lifecycle_stage) rows = rows.filter((c) => c.lifecycle_stage === q.lifecycle_stage);
  if (q.churn_risk_level) rows = rows.filter((c) => c.churn_risk_level === q.churn_risk_level);
  if (q.customer_value_tier) rows = rows.filter((c) => c.customer_value_tier === q.customer_value_tier);
  if (q.credit_urgency_level) rows = rows.filter((c) => c.credit_urgency_level === q.credit_urgency_level);
  if (q.ever_paid) rows = rows.filter((c) => c.ever_paid === (q.ever_paid === "true"));

  const [sortKey, sortDir] = (q.sort ?? "priority_score:desc").split(":");
  const dir = sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[sortKey as keyof PredictionOutput];
    const bv = b[sortKey as keyof PredictionOutput];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  const page = q.page ?? 1;
  const pageSize = q.page_size ?? 50;
  return {
    total: rows.length,
    page,
    page_size: pageSize,
    data: rows.slice((page - 1) * pageSize, page * pageSize),
  };
}

export function mockRunOutput(runId: string, accId: number): PredictionOutput {
  const row = population(runId).find((c) => c.acc_id === accId);
  if (!row) throw new Error(`Customer ${accId} not found in run ${runId}`);
  return row;
}

// ── Per-customer time series ────────────────────────────────────

export function mockUsageMonthly(runId: string, accId: number): MonthlyUsagePoint[] {
  const c = mockRunOutput(runId, accId);
  const run = mockPredictionRuns().find((x) => x.id === runId)!;
  const r = rng(runSeed(runId) ^ accId ^ 0xa11ce);
  const cutoff = new Date(run.cutoff_date);
  const trendFactor =
    c.usage_trend === "increasing" ? 1.08 : c.usage_trend === "declining" ? 0.88 : 1.0;
  let base = c.profile_snapshot.usage_total_180d / 6 || 0;
  if (c.lifecycle_stage === "Ghost") base = 0;

  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(cutoff.getFullYear(), cutoff.getMonth() - 12 + i, 1);
    const inactive = c.lifecycle_stage === "Churned" && i >= 7;
    const total = inactive || base === 0 ? 0 : Math.max(0, Math.round(base * Math.pow(trendFactor, i - 6) * (0.75 + r() * 0.5)));
    const sms = Math.round(total * c.profile_snapshot.sms_usage_share);
    return {
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      sms,
      email: total - sms,
      bc: Math.round(total * c.profile_snapshot.bc_usage_share),
      api: Math.round(total * c.profile_snapshot.api_usage_share),
      otp: Math.round(total * c.profile_snapshot.otp_usage_share),
      total,
    };
  });
}

export function mockPayments(runId: string, accId: number): PaymentEvent[] {
  const c = mockRunOutput(runId, accId);
  if (!c.ever_paid || c.n_purchases === 0) return [];
  const run = mockPredictionRuns().find((x) => x.id === runId)!;
  const r = rng(runSeed(runId) ^ accId ^ 0x9a7);
  const cutoffMs = new Date(run.cutoff_date).getTime();
  const spanDays = Math.min(c.profile_snapshot.customer_age_days, 720);
  const events: PaymentEvent[] = [];
  for (let i = 0; i < c.n_purchases; i++) {
    const daysAgo = Math.floor((i / c.n_purchases) * spanDays + r() * 25);
    const amount = Math.round((c.avg_transaction_value ?? 1000) * (0.7 + r() * 0.6) * 100) / 100;
    events.push({
      payment_date: new Date(cutoffMs - daysAgo * 86400000).toISOString().slice(0, 10),
      amount,
      credit_add: Math.round(amount * (8 + r() * 4)),
      credit_type: r() < 0.7 ? "sms" : "email",
    });
  }
  return events.sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1));
}

// ── Model performance (written at training time — spec §2.4) ───

const MODEL_PERF: ModelPerfEntry[] = [
  {
    model_type: "lifecycle",
    method: "Rule-based classification",
    algorithm: "Deterministic rules (features.py)",
    version: null,
    trained_at: null,
    cutoff_date: null,
    dataset_rows: null,
    feature_set: null,
    primary_metric: { name: "Rule coverage", value: "100%" },
    splits: [],
    baselines: [],
    notes: "ไม่ใช่โมเดล ML — กติกาแบ่ง Ghost / Churned / Active Free / Active Paid จากข้อมูลจริง",
  },
  {
    model_type: "churn",
    method: "Binary classification (calibrated probability)",
    algorithm: "LightGBM + isotonic calibration",
    version: "churn_v3",
    trained_at: "2026-06-03T11:20:00+07:00",
    cutoff_date: "2025-12-01",
    dataset_rows: 9412,
    feature_set: "churn_A_safe_history v1 (24 features)",
    primary_metric: { name: "PR-AUC", value: 0.712, baseline: 0.541, baseline_name: "logistic_regression" },
    splits: [
      { split: "validation", metrics: { roc_auc: 0.861, pr_auc: 0.731, f1: 0.724, precision: 0.692, recall: 0.759, brier: 0.118, ece: 0.028, recall_at_top10pct: 0.471, lift_at_top10pct: 3.31 } },
      { split: "test", metrics: { roc_auc: 0.848, pr_auc: 0.712, f1: 0.711, precision: 0.681, recall: 0.744, brier: 0.124, ece: 0.034, recall_at_top10pct: 0.452, lift_at_top10pct: 3.12 } },
      { split: "backtest_avg", metrics: { roc_auc: 0.839, pr_auc: 0.694, f1: 0.698, precision: 0.667, recall: 0.732, brier: 0.129, ece: 0.039, recall_at_top10pct: 0.438, lift_at_top10pct: 2.98 } },
    ],
    baselines: [
      { name: "recency_rule_90d", metrics: { pr_auc: 0.447, f1: 0.512, recall_at_top10pct: 0.262, lift_at_top10pct: 1.84 } },
      { name: "rfm_quartile", metrics: { pr_auc: 0.489, f1: 0.547, recall_at_top10pct: 0.301, lift_at_top10pct: 2.12 } },
      { name: "logistic_regression", metrics: { pr_auc: 0.541, f1: 0.601, recall_at_top10pct: 0.343, lift_at_top10pct: 2.41 } },
    ],
    thresholds: RISK_THRESHOLDS,
    calibration: {
      prob_pred: [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95],
      prob_true: [0.04, 0.13, 0.24, 0.37, 0.44, 0.57, 0.63, 0.77, 0.83, 0.91],
      ece: 0.034,
    },
    confusion: { tp: 318, fp: 149, fn: 109, tn: 1306, threshold: 0.6 },
    lift_table: [
      { decile: 1, share_of_churners: 0.452, lift: 3.12 },
      { decile: 2, share_of_churners: 0.224, lift: 2.31 },
      { decile: 3, share_of_churners: 0.118, lift: 1.62 },
      { decile: 4, share_of_churners: 0.077, lift: 1.21 },
      { decile: 5, share_of_churners: 0.051, lift: 0.84 },
    ],
  },
  {
    model_type: "clv",
    method: "Regression + ranking",
    algorithm: "BG-NBD + Gamma-Gamma (champion) vs LGBM Tweedie",
    version: "clv_v2",
    trained_at: "2026-06-03T11:42:00+07:00",
    cutoff_date: "2025-12-01",
    dataset_rows: 8120,
    feature_set: "clv_A_safe_history v1",
    primary_metric: { name: "Spearman", value: 0.57, baseline: 0.41, baseline_name: "revenue_180d_carryover" },
    splits: [
      { split: "validation", metrics: { spearman: 0.588, mae: 1129, rmse: 4310, smape: 0.309, top_decile_capture: 0.461 } },
      { split: "test", metrics: { spearman: 0.57, mae: 1181, rmse: 4488, smape: 0.318, top_decile_capture: 0.44 } },
      { split: "backtest_avg", metrics: { spearman: 0.553, mae: 1224, rmse: 4632, smape: 0.327, top_decile_capture: 0.428 } },
    ],
    baselines: [
      { name: "segment_mean", metrics: { spearman: 0.318, mae: 1612, top_decile_capture: 0.281 } },
      { name: "revenue_180d_carryover", metrics: { spearman: 0.41, mae: 1437, top_decile_capture: 0.352 } },
    ],
  },
  {
    model_type: "credit",
    method: "Quantile forecasting",
    algorithm: "LightGBM quantile (p10/p25/p50/p75/p90)",
    version: "credit_v2",
    trained_at: "2026-06-03T12:05:00+07:00",
    cutoff_date: "2025-12-01",
    dataset_rows: 10874,
    feature_set: "credit_A_safe_history v1",
    primary_metric: { name: "Coverage p10–p90", value: 0.79 },
    splits: [
      { split: "validation", metrics: { mae_30d: 2110, smape_30d: 0.271, mae_90d: 2298, smape_90d: 0.326, coverage_p10_p90: 0.804, urgent_recall: 0.748, urgent_precision: 0.701 } },
      { split: "test", metrics: { mae_30d: 2204, smape_30d: 0.284, mae_90d: 2380, smape_90d: 0.337, coverage_p10_p90: 0.79, urgent_recall: 0.73, urgent_precision: 0.688 } },
    ],
    baselines: [
      { name: "last_30d_carryover", metrics: { mae_30d: 3415, smape_30d: 0.41 } },
      { name: "moving_avg_90d", metrics: { mae_30d: 2987, smape_30d: 0.365 } },
    ],
  },
];

export function mockModelPerformance(): ModelPerfEntry[] {
  return MODEL_PERF;
}

// ── Training runs ───────────────────────────────────────────────

const TRAINING_RUNS: TrainingRun[] = [
  {
    id: "train-2026-06-03",
    status: "completed",
    dataset_name: "train-export-2025-q4",
    cutoff_date: "2025-12-01",
    horizon_days: 180,
    started_at: "2026-06-03T11:02:00+07:00",
    finished_at: "2026-06-03T12:05:00+07:00",
    created_by: "aphisit",
    error_message: null,
    progress: null,
    results: [
      {
        model_type: "churn",
        primary_metric_name: "PR-AUC",
        primary_metric_value: 0.712,
        baseline_name: "logistic_regression",
        baseline_value: 0.541,
        calibration_ece: 0.034,
        leakage_passed: true,
        promoted: true,
        promote_reason: "ชนะ baseline ทุก cutoff และชนะ champion เดิม (v2: 0.683)",
        new_version: "churn_v3",
      },
      {
        model_type: "clv",
        primary_metric_name: "Spearman",
        primary_metric_value: 0.57,
        baseline_name: "revenue_180d_carryover",
        baseline_value: 0.41,
        calibration_ece: null,
        leakage_passed: true,
        promoted: true,
        promote_reason: "ชนะ baseline ทุก backtest cutoff",
        new_version: "clv_v2",
      },
      {
        model_type: "credit",
        primary_metric_name: "Coverage p10–p90",
        primary_metric_value: 0.79,
        baseline_name: "last_30d_carryover",
        baseline_value: 0.0,
        calibration_ece: null,
        leakage_passed: true,
        promoted: true,
        promote_reason: "coverage อยู่ในช่วงเป้า 75–85% และ MAE ชนะ baseline",
        new_version: "credit_v2",
      },
    ],
  },
];

export function mockTrainingRuns(): TrainingRun[] {
  return TRAINING_RUNS;
}

export function mockCreateTrainingRun(input: {
  train_source_id: string;
  dataset_name: string;
  cutoff_date: string;
  horizon_days?: number;
}): TrainingRun {
  const run: TrainingRun = {
    id: `train-local-${TRAINING_RUNS.length + 1}`,
    status: "in_progress",
    dataset_name: input.dataset_name,
    cutoff_date: input.cutoff_date,
    horizon_days: input.horizon_days ?? 180,
    started_at: new Date().toISOString(),
    finished_at: null,
    created_by: "you",
    error_message: null,
    progress: { phase: "Quality gates", pct: 5 },
    results: null,
  };
  TRAINING_RUNS.unshift(run);
  return run;
}
