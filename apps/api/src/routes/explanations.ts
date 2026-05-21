import Elysia, { t } from "elysia";
import { requireUser } from "../lib/auth-middleware";
import { verifyRunOwnership } from "../lib/run-guard";

const ML_URL = process.env.ML_INTERNAL_URL || "http://ml:8000";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

export const explanationsRoutes = new Elysia()
  .use(requireUser)
  .get(
    "/runs/:id/predictions/:acc_id/explain",
    async ({ params, userId, set }) => {
      // User auth + run ownership verified here; FastAPI skips both (token-only)
      const guard = await verifyRunOwnership(params.id, userId!);
      if (!guard.ok) { set.status = guard.status; return { message: guard.message }; }

      const url =
        `${ML_URL}/internal/explain` +
        `?run_id=${encodeURIComponent(params.id)}` +
        `&acc_id=${encodeURIComponent(params.acc_id)}`;

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { "x-internal-token": INTERNAL_TOKEN },
        });
      } catch (err) {
        set.status = 502;
        const msg = err instanceof Error ? err.message : String(err);
        return { message: `ML service unavailable: ${msg}` };
      }

      if (!res.ok) {
        set.status = res.status;
        return res.json().catch(() => ({ message: "Explain request failed" }));
      }

      return res.json();
    },
    { params: t.Object({ id: t.String(), acc_id: t.String() }) }
  );
