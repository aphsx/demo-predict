# Plan A Refactor — Moby Analytics

You are executing an incremental refactor from the current architecture
(Plan B: FastAPI does everything + Next.js hosts Better Auth) to Plan A
(Elysia owns REST + auth, Python is ML-only).

## Non-Negotiable Rules

1. **Never break the working system.** At every commit, the app must still run.
   FastAPI keeps serving routes until each one is replaced and verified.
2. **One resource at a time.** Don't migrate everything in parallel. Pick a
   route group, finish it, verify it, then move to the next.
3. **No behavior changes during migration.** Same request shape, same response
   shape, same auth behavior. Refactor first, improve later.
4. **Preserve the friend's ML code.** Everything under `ml/src/`, `ml/worker/`,
   `ml/train.py`, `ml/alembic/` stays untouched. Only `ml/api/` is being replaced.
5. **Database stays put.** Same Postgres, same Alembic migrations. Elysia uses
   Drizzle in introspection mode against the existing schema — do NOT generate
   new migrations from Drizzle.
6. **Ask before destructive action.** Never `rm -rf`, never delete files, never
   drop tables. Always show me what you're about to remove and wait for "go".

## Target Architecture

┌─────────────┐
│ Next.js │ frontend only — Server Components + Client Components
│ :3000 │ no auth handling, no Better Auth, no API routes
└──────┬──────┘
│ fetch / Eden Treaty
▼
┌─────────────┐
│ Elysia.js │ REST + auth + orchestration + SSE
│ :3001 │ Better Auth (server) lives here
│ Bun │ Drizzle (introspected from existing schema)
└──────┬──────┘
│
├─── reads/writes ──▶ PostgreSQL
│
├─── enqueues jobs ──▶ Redis (Arq queue — unchanged)
│
└─── reads progress ──▶ Redis Streams (unchanged)
┌─────────────┐
│ Python │ ML pipeline only
│ Worker │ Arq consumer (unchanged)
│ + FastAPI │ FastAPI trimmed to /health
└─────────────┘

## Target Folder Structure

moby-analytics/
├── apps/
│ ├── web/ # was: web/
│ ├── api/ # NEW: Elysia
│ │ ├── src/
│ │ │ ├── index.ts
│ │ │ ├── auth.ts # Better Auth server config
│ │ │ ├── db/
│ │ │ │ ├── client.ts
│ │ │ │ └── schema.ts # introspected from Postgres
│ │ │ ├── routes/
│ │ │ │ ├── runs.ts
│ │ │ │ ├── uploads.ts
│ │ │ │ ├── predictions.ts
│ │ │ │ ├── explanations.ts
│ │ │ │ ├── training.ts
│ │ │ │ ├── events.ts # SSE
│ │ │ │ └── health.ts
│ │ │ ├── services/
│ │ │ │ ├── excel-parser.ts
│ │ │ │ ├── job-producer.ts # Arq queue producer in TS
│ │ │ │ └── sse-bridge.ts # Redis Streams → SSE
│ │ │ └── lib/
│ │ │ └── redis.ts
│ │ ├── drizzle.config.ts
│ │ └── package.json
│ └── ml/ # was: ml/ — trimmed
│ ├── api/ # only /health remains
│ ├── src/ # UNCHANGED
│ ├── worker/ # UNCHANGED
│ ├── alembic/ # UNCHANGED
│ └── train.py # UNCHANGED
├── packages/
│ └── types/ # NEW: shared TS types
├── turbo.json # NEW
├── package.json # NEW: workspace root
└── docker-compose.yml # updated

Web stays at the same level inside `apps/`. The flat `web/` and `ml/` directories
become `apps/web/` and `apps/ml/`.

## Migration Phases

### Phase 0: Pre-flight (1 hour) — DO THIS FIRST

- Confirm we're on a clean branch (create `feat/plan-a-refactor` if not).
- Read `ml/api/main.py` in full. List every route, its method, path, auth
  requirement, request shape, and response shape. Output this as a
  `MIGRATION-INVENTORY.md` checklist. Do not write code yet.
- Read `web/src/lib/auth.ts` and `web/src/middleware.ts`. Document how Better
  Auth is currently configured (providers, callbacks, cookie name, session table).
- Stop. Show me the inventory and config doc. Wait for "go".

### Phase 1: Monorepo scaffold (half day)

- Create `apps/` and `packages/types/` directories.
- Move `web/` → `apps/web/` and `ml/` → `apps/ml/`. Update any path references
  in `docker-compose.yml`, scripts, and configs.
- Create root `package.json` with workspaces and root `turbo.json`.
- Verify: `docker compose up` still brings up the working system. Frontend still
  loads. Logging in still works. Running an analysis still works. Don't proceed
  until this is confirmed.
- Commit: "chore: move to monorepo layout (no behavior change)"

### Phase 2: Scaffold Elysia (half day)

- Create `apps/api/` with Elysia, Drizzle, ioredis, better-auth dependencies.
- Add to docker-compose as a new service on port 3001. Do NOT route traffic to
  it yet — it just runs alongside.
- Implement `GET /health` returning `{ ok: true, service: 'api' }`.
- Run `drizzle-kit introspect` against the existing Postgres to generate
  `schema.ts` from the live database. This means Drizzle reflects what Alembic
  built, not the other way around.
- Verify: hitting `localhost:3001/health` returns 200. Existing system unchanged.
- Commit: "feat(api): scaffold Elysia service alongside existing FastAPI"

### Phase 3: Move Better Auth to Elysia (1-2 days)

- Install Better Auth in `apps/api/`. Configure with same Google OAuth provider,
  same secret, same session table name.
- Set cookie domain to a value that both `:3000` and `:3001` can read (in dev:
  `localhost`, no domain restriction).
- In `apps/web/`: remove the `/api/auth/[...all]` route. Update the Better Auth
  client to point at `http://localhost:3001/api/auth`.
- Update `apps/web/src/middleware.ts` to verify session against the new auth
  endpoint, or simpler: remove server-side checks and rely on Elysia rejecting
  unauthenticated calls.
- In Elysia: implement a `requireUser` middleware that reads the session cookie
  and looks up the session row (port the friend's existing HMAC + session lookup
  logic from `ml/api/main.py:36-73`).
- Verify: log out, log in via Google, confirm session persists across refresh,
  confirm cookies are set correctly.
- Critical: do NOT delete the old Next.js auth handler files yet — leave them in
  place but unused. We delete after the full migration is verified.
- Commit: "feat(api): move Better Auth from Next.js to Elysia"

### Phase 4: Migrate routes — one group at a time

For each route group below, follow this pattern:

1. Read the corresponding FastAPI code in `apps/ml/api/main.py`.
2. Write the equivalent Elysia route(s) using Drizzle for queries.
3. Add input validation with `t.Object({...})` (Elysia's built-in).
4. Wire up `requireUser` and `userId` scoping.
5. Test the new endpoint manually (curl + verify response matches FastAPI's).
6. Update the Next.js frontend's `next.config.js` rewrite to send THIS resource
   to `:3001` instead of `:8000`.
7. Manually test the relevant page in the browser.
8. Commit.
9. Move to next group.

Route groups, in order (easiest → hardest):

- **Group 4a: Read-only routes (1 day)** — `/runs` list, `/runs/:id` detail,
  `/runs/:id/predictions`, `/runs/:id/summary`, `/runs/:id/predictions/:acc_id`.
  Pure SELECT queries; safest to migrate first.

- **Group 4b: Training/admin (half day)** — `/model-metrics`, `/model-versions`,
  `/model-versions/active`, `/training-log`. Also add `requireUser` to these —
  the audit flagged them as unauthenticated.

- **Group 4c: Run creation (1 day)** — `POST /runs`. Creates a `prediction_runs`
  row and enqueues an Arq job. Arq's protocol is documented; you'll need to push
  the same job payload format to the same Redis list/key that Arq expects.

- **Group 4d: Excel upload (1-2 days)** — `POST /runs/:id/upload`. Use the
  `xlsx` npm package. Stream rows in batches to Postgres using Drizzle's
  `db.insert().values(rowArray)` with chunks of 500-1000 rows. Replace the
  iterrows() pattern entirely — do NOT port the N+1 bug.

- **Group 4e: SHAP explain (1 day)** — `GET /runs/:id/predictions/:acc_id/explain`.
  This one is tricky: SHAP computation must stay in Python. Options:
  (a) Elysia calls FastAPI internally (keep a `POST /internal/explain` route in
  Python, behind a shared internal token, not user-facing)
  (b) Push an Arq job and wait for the result (synchronous via short-poll on Redis)
  Go with option (a) — simpler. Make sure FastAPI verifies the internal token
  and does not require user auth.

- **Group 4f: Export (half day)** — `GET /runs/:id/export`. CSV/Excel generation
  in TS using `xlsx`.

- **Group 4g: SSE (1 day)** — `GET /runs/:id/stream`. Port the Redis Streams
  XREAD logic from `ml/api/main.py:187-261` to Elysia using ioredis's stream API.

### Phase 5: Cut over the frontend (1 day)

- Remove the `next.config.js` rewrite proxy entirely. Frontend now calls
  `http://localhost:3001/...` directly (or via env var).
- Add CORS config in Elysia to allow the frontend origin in dev.
- Test every page that calls the API. Fix any broken calls.
- Commit: "feat(web): point frontend at Elysia"

### Phase 6: Trim FastAPI (half day)

- In `apps/ml/api/main.py`: remove all routes EXCEPT `/health` and any internal
  routes the Elysia service calls (e.g., `/internal/explain`).
- Confirm the Arq worker still starts and consumes jobs.
- Update Docker healthchecks if needed.
- Commit: "refactor(ml): trim FastAPI to health + internal-only endpoints"

### Phase 7: Clean up (1 day)

- Show me everything that's now dead code (old auth handlers in Next.js, unused
  imports, the old proxy config, etc.). Wait for "go" before deleting.
- Delete confirmed-dead files.
- Update `CLAUDE.md` to reflect the final architecture.
- Commit: "chore: remove dead code from Plan B"

### Phase 8: Verification

- Full end-to-end smoke test with a real Excel upload.
- Document any deviations from the original plan in `CLAUDE.md`.

## Coding Standards

- TypeScript strict mode in all new code.
- No `any` — if a type is uncertain, declare it `unknown` and narrow.
- Elysia routes use `t.Object({...})` schemas for inputs and outputs.
- Every route that returns user data must use `requireUser` and scope by `user_id`.
- Drizzle queries — prefer query builder over raw SQL.
- Reuse the friend's good patterns: dependency injection via Elysia's `derive`,
  parameterized inserts in chunks, structured error responses.

## What NOT to Do

- Do NOT change the database schema. Drizzle reflects, never generates.
- Do NOT change the Arq worker code or `ml/src/`.
- Do NOT improve the ML pipeline while migrating — only port behavior.
- Do NOT delete FastAPI routes before their Elysia replacement is verified working.
- Do NOT add new features during this refactor — LLM, AI Chat, etc. all wait
  until the migration is done.
- Do NOT batch commits across phases. Each phase = at least one verified commit.

## Reporting

After each phase, report:

- What was done (files changed, lines added/removed)
- What was verified (specific tests run, pages opened, curl commands)
- What's broken or risky
- What's next

Wait for "go" between phases. Do not run ahead.
