# Migration Inventory — Plan B → Plan A
> Phase 0 output. Read-only. Do NOT act on this until "go" is given.

---

## 1. Route Inventory (`ml/api/main.py`)

Every route listed with method, path (after prefix-strip), auth requirement,
request shape, and response shape.

### Auth helpers (not routes, but used by routes below)

| Symbol | Role |
|---|---|
| `get_current_user` | Reads `better-auth.session_token` cookie → HMAC-SHA256 verify → SELECT from `session` table → returns `user_id` string or `None` |
| `require_user` | Wraps `get_current_user`; raises `HTTP 401` if `None` |
| `get_run_or_403` | Requires `require_user`; SELECT `prediction_runs` by `id`; raises `HTTP 404` if missing, `HTTP 403` if `run.user_id != user_id` (bug: skipped when `user_id` is NULL in DB) |

---

### Route table

| # | Method | Path | Auth | Request | Response |
|---|---|---|---|---|---|
| 1 | GET | `/runs` | `require_user` | — | `Run[]` (id, name, status, cutoff_date, total_customers, active_customers, error_message, created_at, updated_at) |
| 2 | POST | `/runs` | `require_user` | JSON body: `{ name: str, cutoff_date: date }` | `Run` (id, name, status, cutoff_date, created_at) |
| 3 | GET | `/runs/{run_id}` | `get_run_or_403` | path: UUID | Full `prediction_runs` row |
| 4 | GET | `/runs/{run_id}/stream` | `get_run_or_403` | path: UUID | `text/event-stream` — events: `progress {progress, step, status}`, `done {status}`, `error`, `status` |
| 5 | DELETE | `/runs/{run_id}` | `get_run_or_403` | path: UUID | `{ deleted: true }` |
| 6 | POST | `/runs/{run_id}/upload` | `get_run_or_403` | `multipart/form-data` file field `file` (`.xlsx` or `.csv`) | `{ run_id, status: "processing", message }` |
| 7 | GET | `/runs/{run_id}/predictions` | `get_run_or_403` | query: `page=1`, `page_size=50`, `lifecycle_stage?`, `search?` | `{ total, page, page_size, data: Prediction[] }` |
| 8 | GET | `/runs/{run_id}/predictions/{acc_id}` | `get_run_or_403` | path: UUID + int | Single `predictions` row |
| 9 | GET | `/runs/{run_id}/predictions/{acc_id}/explain` | `get_run_or_403` | path: UUID + int | SHAP factors — shape from `MobyPredictor.explain()` (Python-only) |
| 10 | GET | `/runs/{run_id}/summary` | `get_run_or_403` | path: UUID | `{ lifecycle, active_paid, winback, conversion, total_customers, active_customers, model_version_id }` |
| 11 | GET | `/runs/{run_id}/export` | `get_run_or_403` | query: `lifecycle_stage?` | `text/csv` download — columns: acc_id, lifecycle_stage, sub_stage, churn_probability, predicted_clv_6m, comeback_probability, conversion_probability, n_purchases, total_revenue, days_since_last_activity |
| 12 | GET | `/model-metrics` | **NONE** | — | Contents of `models/metrics.json` |
| 13 | GET | `/training-log` | **NONE** | — | `{ log: string }` — full stdout of `train.py` |
| 14 | GET | `/model-versions` | **NONE** | query: `model_type?` | `ModelVersion[]` |
| 15 | POST | `/model-versions/train` | `require_user` | — | `{ job_id, status: "started", data_file, message }` |
| 16 | GET | `/model-versions/active` | **NONE** | — | `ModelVersion[]` (latest active per model_type) |
| 17 | GET | `/health` | **NONE** | — | `{ status, db, models: { churn, winback, conversion }, message? }` |

**Security note:** Routes 12, 13, 14, 16 are unauthenticated. `/training-log`
exposes full training stdout including account counts. `/model-metrics` exposes
internal model performance data. These must have `requireUser` added in the
Elysia port.

---

### Upload flow detail (route 6)

1. Read file bytes
2. If `.csv` → treat as `Users+User_profile` sheet only
3. If `.xlsx` → `pd.read_excel(sheet_name=None)` → dict of DataFrames
4. Validate required sheets: `["Users+User_profile", "Backend_payment"]` (6 usage
   sheets are optional — silently missing is allowed)
5. Set run status → `validating`
6. Call `_insert_raw(db, run_id, df_map)` — clears then re-inserts raw_customers,
   raw_payments, raw_usage (row-by-row INSERT, the N+1 bug)
7. Set run status → `processing`
8. Enqueue Arq job: `run_prediction_pipeline(run_id, model_dir)`
9. Return `{ run_id, status: "processing", message }`

Column renames applied on `Users+User_profile`:
```
"status (SMS)"                        → status_sms
"user.credit + user.credit_premium"   → credit_sms
"credit_email"                        → credit_email
"expire"                              → expire_sms
"expire_email"                        → expire_email
"status (Email)"                      → status_email
"join_date"                           → join_date
"last_access"                         → last_access
"last_send"                           → last_send
```

`Backend_payment` columns used as-is: `acc_id`, `payment_date`, `amount`,
`credit_add`, `credit_type`.

Usage sheets mapped: `SMS_usage (BC)` → `(sms, bc)`, `SMS_usage (API)` →
`(sms, api)`, `SMS_usage (OTP)` → `(sms, otp)`, `Email_usage (BC)` →
`(email, bc)`, `Email_usage (API)` → `(email, api)`, `Email_usage (OTP)` →
`(email, otp)`.

---

### SSE stream detail (route 4)

```
Primary path:
  aioredis.from_url(redis://redis:6379)
  XREAD {progress:{run_id}: last_id} count=10 block=1000ms
  For each message: yield event=progress, data={progress, step, status}
  If progress >= 100 or step starts with "failed": close and return
  Also poll DB each iteration for final status

Fallback path (if Redis unavailable — Exception swallowed silently):
  Loop every 5 seconds:
    SELECT status FROM prediction_runs
    yield event=status, data={status, progress (0/50/100), step, ...}
    If done/failed: yield event=done, break
```

---

### Arq job payload (route 6 → worker)

```python
await arq.enqueue_job("run_prediction_pipeline", str(run_id), str(MODEL_DIR))
```

Arq pushes to Redis key `arq:queue` by default. The worker's `WorkerSettings`
(`ml/worker/predict_worker.py:235-240`) declares `functions = [run_prediction_pipeline]`.
The job function signature is `run_prediction_pipeline(ctx, run_id: str, model_dir: str)`.

---

### SHAP explain detail (route 9)

This is Python-only and cannot be ported to TypeScript:
- Loads raw data from `raw_customers`, `raw_payments`, `raw_usage` for the single `acc_id`
- Rebuilds features via `build_features()` from `ml/src/features.py`
- Instantiates `MobyPredictor(model_dir, cutoff)`, calls `predictor.explain(acc_id)`
- Returns whatever `explain()` returns (SHAP values structure)

**Migration plan:** Keep a `POST /internal/explain` route in FastAPI. Elysia
calls it with an internal service token (not user-facing). Elysia proxies the
result back to the client.

---

## 2. Better Auth Configuration

### Server side (`web/src/lib/auth.ts`)

| Setting | Value |
|---|---|
| Database | `pg.Pool` → `DATABASE_URL` env (fallback: `postgresql://moby:moby1234@db:5432/moby`) |
| baseURL | `BETTER_AUTH_URL` env \|\| `http://localhost:3001` |
| secret | `BETTER_AUTH_SECRET` env |
| trustedOrigins | `["http://localhost:3001", "http://localhost:3000"]` |
| Social providers | Google OAuth only (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) |
| Session expiry | 7 days (`expiresIn: 60*60*24*7`) |
| Session updateAge | 1 day |
| Cookie name | `better-auth.session_token` (default) |
| Plugin | `nextCookies()` — must be last; forwards `Set-Cookie` via Next.js `cookies()` API |

### Route handler (`web/src/app/api/auth/[...all]/route.ts`)

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const { GET, POST } = toNextJsHandler(auth.handler);
```

Mounted at `/api/auth/[...all]` — catches all `/api/auth/*` requests.

### Client side (`web/src/lib/auth-client.ts`)

```ts
createAuthClient({
  baseURL: typeof window !== "undefined"
    ? window.location.origin          // browser: same origin as the Next.js app
    : process.env.BETTER_AUTH_URL || "http://localhost:3001"  // SSR fallback
})
```

Browser always sends auth requests to the **same origin as Next.js** (port 3001
in Docker). The `[...all]` catch-all route handles them.

### Middleware (`web/src/middleware.ts`)

- `getSessionCookie(request)` — reads the `better-auth.session_token` cookie
  without verifying it (edge-runtime compatible — HMAC verification happens
  server-side in `get_current_user` in FastAPI)
- Redirects to `/login?redirect=<path>` if cookie absent
- Public paths: only `/login`
- Matcher excludes: `/api/auth/*`, `_next/static`, `_next/image`, `favicon.ico`,
  image file extensions

### FastAPI cookie verification (`ml/api/main.py:36-57`)

FastAPI independently re-verifies the cookie:
```
cookie value (URL-encoded): <token>.<base64-hmac-sha256-signature>
secret: BETTER_AUTH_SECRET env var
verification: hmac.compare_digest(expected, actual)
then: SELECT "userId" FROM session WHERE token = :t AND "expiresAt" > NOW()
```

---

## 3. Frontend API Client (`web/src/lib/api.ts`)

All calls use `apiFetch()` which:
- Adds `credentials: "include"` to every request
- Redirects to `/login` on 401

URL construction: `apiUrl(path)` strips `/api` prefix and prepends
`NEXT_PUBLIC_API_URL` if set, otherwise uses the path as-is (relative URL,
relies on Next.js rewrite).

**Exception:** `web/src/app/training/page.tsx` uses raw `fetch("/api/model-versions")`
without `apiFetch` — no credentials, no 401 redirect.

---

## 4. Next.js Rewrite (proxy)

```js
// web/next.config.js
source:      "/api/:path((?!auth(?:/|$)).*)"
destination: "${API_URL || "http://ml:8000"}/:path*"
```

- `/api/auth/*` → handled by Next.js (not proxied)
- `/api/runs` → `http://ml:8000/runs`
- `/api/model-metrics` → `http://ml:8000/model-metrics`
- etc.

FastAPI also has an `strip_api_prefix` middleware that strips `/api` from
incoming paths — this is redundant for Docker traffic (Next.js already strips)
but handles direct `curl :8001/api/runs` calls.

---

## 5. Docker Compose Services

| Service | Image/Build | Internal port | External port | Notes |
|---|---|---|---|---|
| `db` | postgres:15-alpine | 5432 | 5433 | env_file .env |
| `redis` | redis:7-alpine | 6379 | — | |
| `ml` | `./ml` | 8000 | 8001 | FastAPI + Alembic migrations; models and data volumes |
| `worker` | `./ml` + `Dockerfile.worker` | — | — | Arq worker; same models and data volumes |
| `web` | `./web` | 3001 | 3001 | Next.js; depends on ml |

---

## 6. Migration Checklist (Phase 0 status)

### Phase 0: Pre-flight
- [x] Branch `feat/plan-a-refactor` created
- [x] Full route inventory produced (this document)
- [x] Better Auth config documented
- [ ] **Waiting for "go" before Phase 1**

### Phase 1: Monorepo scaffold
- [ ] Create `apps/` + `packages/types/`
- [ ] Move `web/` → `apps/web/`, `ml/` → `apps/ml/`
- [ ] Update `docker-compose.yml` build contexts
- [ ] Create root `package.json` (Bun workspaces)
- [ ] Create `turbo.json`
- [ ] Verify: `docker compose up` still works end-to-end

### Phase 2: Scaffold Elysia
- [ ] Create `apps/api/` with Elysia + Drizzle + ioredis + better-auth
- [ ] Add `api` service to `docker-compose.yml` on port 3002 (not yet routing traffic)
- [ ] `GET /health` returns `{ ok: true, service: "api" }`
- [ ] `drizzle-kit introspect` against existing Postgres → `schema.ts`
- [ ] Verify: `:3002/health` returns 200, existing system unchanged

### Phase 3: Move Better Auth to Elysia
- [ ] Install + configure Better Auth in `apps/api/` (same Google OAuth, same secret, same session table)
- [ ] Set cookie to work for both `:3001` (Next.js) and `:3002` (Elysia) in dev
- [ ] Remove `/api/auth/[...all]` from Next.js
- [ ] Update auth client `baseURL` → `http://localhost:3002`
- [ ] Update `web/src/middleware.ts` (verify against Elysia or remove server-side check)
- [ ] Port `requireUser` logic to Elysia (`derive`)
- [ ] Verify: login → session → refresh works

### Phase 4: Routes (one group at a time)
- [ ] 4a Read-only: GET /runs, /runs/:id, /runs/:id/predictions, /runs/:id/summary, /runs/:id/predictions/:acc_id
- [ ] 4b Training/admin (+ add auth): /model-metrics, /model-versions, /model-versions/active, /training-log
- [ ] 4c Run creation: POST /runs
- [ ] 4d Excel upload: POST /runs/:id/upload (batched insert — fix the N+1)
- [ ] 4e SHAP explain: GET /runs/:id/predictions/:acc_id/explain (proxy to FastAPI internal)
- [ ] 4f Export: GET /runs/:id/export (CSV in TS)
- [ ] 4g SSE: GET /runs/:id/stream (Redis Streams XREAD in ioredis)

### Phase 5: Cut over frontend
- [ ] Remove Next.js rewrite proxy
- [ ] Frontend calls Elysia directly
- [ ] CORS config in Elysia
- [ ] Full page-by-page test

### Phase 6: Trim FastAPI
- [ ] Remove all routes except `/health` and `/internal/explain`
- [ ] Verify Arq worker still runs

### Phase 7: Clean up
- [ ] Identify and show dead code for approval
- [ ] Delete confirmed-dead files
- [ ] Update `CLAUDE.md`

### Phase 8: Verification
- [ ] Full end-to-end smoke test with real Excel upload

---

## 7. Key Risk Register

| Risk | Where | Mitigation |
|---|---|---|
| SHAP explain is Python-only | Phase 4e | Keep `/internal/explain` in FastAPI; Elysia proxies |
| Arq job payload format | Phase 4c | Use `arq` npm package or reverse-engineer the Redis key format Arq uses |
| Cookie domain across ports (3001 ↔ 3002) | Phase 3 | Set domain to `localhost` with no restriction in dev |
| `nextCookies()` plugin removed from Next.js | Phase 3 | Better Auth's Next.js integration may need `nextCookies()` replaced by Elysia's `cookies` plugin |
| `training/page.tsx` raw `fetch()` | All | Fix `fetch` → `apiFetch` in Phase 4b |
| Double `/api` prefix strip | Phase 4 start | Drop FastAPI's `strip_api_prefix` middleware once Elysia is routing |
| NULL `user_id` ownership bypass | Phase 3 | Do NOT replicate the bug; Elysia's `requireRun` always checks `run.userId === userId` |
