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
  ml_output: PredictionOutput;
};

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
    ml_output: mlOutput,
  };
}
