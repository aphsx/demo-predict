import Elysia, { t } from "elysia";
import { requireUser } from "../../lib/auth-middleware";
import { createRunInsight, getRunInsight } from "../../lib/ai";
import { fetchRun, requireOwnedRun } from "./_helpers";

/**
 * Run-level AI base summary (the "สรุปก่อน" of the whole customer base).
 *   GET  /:id/insight  — read the cached summary (never generates)
 *   POST /:id/insight  — generate or regenerate (force) and cache it
 */
export const insightRoutes = new Elysia()
  .use(requireUser)
  .get(
    "/:id/insight",
    async ({ params, userId, set }) => {
      const run = await fetchRun(params.id);
      const denied = requireOwnedRun(run, userId, set);
      if (denied) return denied;
      return getRunInsight(run!.id);
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/:id/insight",
    async ({ params, body, userId, set }) => {
      const run = await fetchRun(params.id);
      const denied = requireOwnedRun(run, userId, set);
      if (denied) return denied;

      const result = await createRunInsight(run!.id, body.force ?? false);
      if ("status" in result) {
        set.status = result.status;
        return result.body;
      }
      return result;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ force: t.Optional(t.Boolean()) }),
    }
  );
