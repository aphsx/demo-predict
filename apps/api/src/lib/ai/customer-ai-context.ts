import type { PredictionOutput } from "../ml-contract";
import {
  loadCustomerPayments,
  loadCustomerProfile,
  loadCustomerUsageMonthly,
  type PredictRunRef,
} from "./customer-dataset";

export type CustomerAiRunRef = PredictRunRef & {
  id: string;
  name: string;
};

/**
 * Derived, pre-computed signals handed to the LLM alongside the raw data.
 * Computing these deterministically (instead of asking the model to do the
 * arithmetic) keeps the explanation grounded and consistent run-to-run.
 */
export type CustomerAiSignals = {
  months_with_usage: number;
  recent_3m_usage: number;
  prior_3m_usage: number;
  usage_change_pct: number | null;
  last_payment_days_before_cutoff: number | null;
  total_paid: number;
  n_payments: number;
};

export type CustomerAiContext = {
  run: {
    id: string;
    name: string;
    cutoff_date: string;
  };
  acc_id: number;
  customer_dataset: {
    profile: Awaited<ReturnType<typeof loadCustomerProfile>>;
    usage_monthly: Awaited<ReturnType<typeof loadCustomerUsageMonthly>>;
    payments: Awaited<ReturnType<typeof loadCustomerPayments>>;
  };
  signals: CustomerAiSignals;
  ml_output: PredictionOutput;
};

function daysBetween(fromIso: string, toIso: string): number | null {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

function computeSignals(
  usageMonthly: CustomerAiContext["customer_dataset"]["usage_monthly"],
  payments: CustomerAiContext["customer_dataset"]["payments"],
  cutoffDate: string
): CustomerAiSignals {
  const totals = usageMonthly.map((u) => u.total);
  const recent3 = totals.slice(-3).reduce((a, b) => a + b, 0);
  const prior3 = totals.slice(-6, -3).reduce((a, b) => a + b, 0);
  const usageChangePct = prior3 > 0 ? ((recent3 - prior3) / prior3) * 100 : null;

  // payments arrive newest-first from the loader.
  const lastPayment = payments[0]?.payment_date ?? null;

  return {
    months_with_usage: totals.filter((t) => t > 0).length,
    recent_3m_usage: Math.round(recent3),
    prior_3m_usage: Math.round(prior3),
    usage_change_pct: usageChangePct == null ? null : Math.round(usageChangePct),
    last_payment_days_before_cutoff: lastPayment ? daysBetween(lastPayment, cutoffDate) : null,
    total_paid: Math.round(payments.reduce((a, p) => a + (p.amount ?? 0), 0)),
    n_payments: payments.length,
  };
}

export async function buildCustomerAiContext(
  run: CustomerAiRunRef,
  accId: number,
  mlOutput: PredictionOutput
): Promise<CustomerAiContext> {
  const [profile, usageMonthly, payments] = await Promise.all([
    loadCustomerProfile(run.predictSourceId, accId),
    loadCustomerUsageMonthly(run, accId),
    loadCustomerPayments(run, accId),
  ]);

  return {
    run: {
      id: run.id,
      name: run.name,
      cutoff_date: run.cutoffDate,
    },
    acc_id: accId,
    customer_dataset: { profile, usage_monthly: usageMonthly, payments },
    signals: computeSignals(usageMonthly, payments, run.cutoffDate),
    ml_output: mlOutput,
  };
}
