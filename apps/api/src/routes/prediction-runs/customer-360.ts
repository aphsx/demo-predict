import Elysia, { t } from "elysia";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { mlPredictionOutputs } from "../../db/schema";
import { requireUser } from "../../lib/auth-middleware";
import { denyNotFound } from "../../lib/access-control";
import { UUID_RE } from "../../lib/constants";
import {
  createCustomerAiExplanation,
  loadCustomerPayments,
  loadCustomerUsageMonthly,
} from "../../lib/ai";
import { fetchRun, mapOutput, requireRunFound } from "./_helpers";

export const customer360Routes = new Elysia()
  .use(requireUser)
  .get(
    "/:id/customers/:acc_id/usage-monthly",
    async ({ params, set }) => {
      const accId = Number(params.acc_id);
      const run = await fetchRun(params.id);
      const denied = requireRunFound(run, set);
      if (denied) return denied;
      if (!Number.isInteger(accId)) return denyNotFound(set, "Prediction run not found");
      return loadCustomerUsageMonthly(run!, accId);
    },
    { params: t.Object({ id: t.String(), acc_id: t.String() }) }
  )
  .get(
    "/:id/customers/:acc_id/payments",
    async ({ params, set }) => {
      const accId = Number(params.acc_id);
      const run = await fetchRun(params.id);
      const denied = requireRunFound(run, set);
      if (denied) return denied;
      if (!Number.isInteger(accId)) return denyNotFound(set, "Prediction run not found");
      return loadCustomerPayments(run!, accId);
    },
    { params: t.Object({ id: t.String(), acc_id: t.String() }) }
  )
  .post(
    "/:id/outputs/:acc_id/ai-explanation",
    async ({ params, body, set }) => {
      const accId = Number(params.acc_id);
      if (!UUID_RE.test(params.id) || !Number.isInteger(accId)) {
        return denyNotFound(set, "Prediction output not found");
      }

      const run = await fetchRun(params.id);
      const denied = requireRunFound(run, set);
      if (denied) return denied;

      const [row] = await db
        .select()
        .from(mlPredictionOutputs)
        .where(
          and(
            eq(mlPredictionOutputs.predictionRunId, params.id),
            eq(mlPredictionOutputs.accId, accId)
          )
        )
        .limit(1);
      if (!row) return denyNotFound(set, "Prediction output not found");

      const result = await createCustomerAiExplanation(
        run!,
        accId,
        mapOutput(row),
        body.force ?? false
      );
      if ("status" in result) {
        set.status = result.status;
        return result.body;
      }
      return result;
    },
    {
      params: t.Object({ id: t.String(), acc_id: t.String() }),
      body: t.Object({ force: t.Optional(t.Boolean()) }),
    }
  );
