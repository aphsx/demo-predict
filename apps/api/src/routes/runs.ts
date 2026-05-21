import Elysia, { t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { predictionRuns } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { verifyRunOwnership } from "../lib/run-guard";

// Explicit snake_case select — matches FastAPI response shape exactly
const RUN_SELECT = {
  id: predictionRuns.id,
  name: predictionRuns.name,
  status: predictionRuns.status,
  cutoff_date: predictionRuns.cutoffDate,
  total_customers: predictionRuns.totalCustomers,
  active_customers: predictionRuns.activeCustomers,
  error_message: predictionRuns.errorMessage,
  model_version_id: predictionRuns.modelVersionId,
  user_id: predictionRuns.userId,
  created_at: predictionRuns.createdAt,
  updated_at: predictionRuns.updatedAt,
} as const;

export const runsRoutes = new Elysia({ prefix: "/runs" })
  .use(requireUser)

  // GET /runs — list the authenticated user's runs (newest first, max 50)
  .get("/", ({ userId }) =>
    db
      .select(RUN_SELECT)
      .from(predictionRuns)
      .where(eq(predictionRuns.userId, userId!))
      .orderBy(desc(predictionRuns.createdAt))
      .limit(50)
  )

  // GET /runs/:id — single run with ownership check
  .get(
    "/:id",
    async ({ params, userId, set }) => {
      const guard = await verifyRunOwnership(params.id, userId!);
      if (!guard.ok) {
        set.status = guard.status;
        return { message: guard.message };
      }
      const [run] = await db
        .select(RUN_SELECT)
        .from(predictionRuns)
        .where(eq(predictionRuns.id, params.id))
        .limit(1);
      return run;
    },
    { params: t.Object({ id: t.String() }) }
  );
