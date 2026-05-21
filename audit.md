# Architecture Comparison Audit — Moby Analytics

You are a senior full-stack engineer performing a comparison audit between
two architectures for the same project:

- **Plan A** — the architecture documented in `CLAUDE.md` at the repo root
- **Plan B** — the architecture actually implemented in this codebase

Your job is NOT to enforce Plan A. Your job is to compare both honestly
and recommend, per concern area, which approach to keep, which to refactor,
and where a blend works best.

## Core Principle

For each decision area, ask three questions in order:

1. **Quality** — which approach produces cleaner, more readable, more maintainable code?
2. **Adaptability** — if we keep the friend's code, what's the refactor cost to bring it up to standard?
3. **Folder/code organization** — regardless of tech choice, is the file structure easy to navigate?

The goal is the **best final codebase**, not loyalty to either plan.

## Project Context

"Moby Analytics" — internal tool for 1Moby (B2B SaaS messaging company).

- ~5 internal users
- Upload fixed 8-sheet Excel → run 3 ML models (churn, CLV/RFM, credit forecast)
- LLM (Gemini) generates insights after all 3 models complete
- Local Docker development first

The 3 ML models and their data dependencies are fixed scope. Tech choices are negotiable.

## Audit Procedure

### Step 1: Inventory Plan B (the actual code)

Walk the repo and produce this table — fill it in from what you find:

| Concern                | Plan A (from CLAUDE.md)                      | Plan B (in code) | Status                   |
| ---------------------- | -------------------------------------------- | ---------------- | ------------------------ |
| Frontend framework     | Next.js 15 App Router                        | ?                | match / differ / missing |
| API framework          | Elysia.js (Bun)                              | ?                |                          |
| ORM                    | Drizzle                                      | ?                |                          |
| Auth                   | Better Auth + Google OAuth                   | ?                |                          |
| Database               | PostgreSQL                                   | ?                |                          |
| Queue                  | Redis Streams (native)                       | ?                |                          |
| ML runtime             | Python worker + FastAPI /health              | ?                |                          |
| ML libs                | LightGBM, XGBoost, CatBoost, SHAP, lifetimes | ?                |                          |
| Real-time              | SSE                                          | ?                |                          |
| Monorepo tool          | Turborepo + Bun workspaces                   | ?                |                          |
| Storage (models)       | R2 (local FS in dev)                         | ?                |                          |
| Worker → API signaling | Postgres LISTEN/NOTIFY                       | ?                |                          |

No judgment yet. Just inventory.

### Step 2: Per-Concern Comparison

For each row in the table where Plan A and Plan B differ, write a comparison
following this template:

---

**Area: [e.g., ORM]**

- **Plan A:** Drizzle. Why we chose it: Bun compatibility, no binary engine,
  SQL-like query style for complex joins on the analytics queries we'll write.
- **Plan B:** [whatever was used] — observed in [file paths]. How it's used:
  [describe the pattern they followed].

**Code quality of Plan B's implementation:**

- Schema clarity: [good / messy / inconsistent]
- Query patterns: [clean / mixed / N+1 risks]
- Type safety: [end-to-end / partial / lost]
- Migration setup: [versioned / ad-hoc / missing]

**Recommendation:** [Keep Plan B / Refactor to Plan A / Blend]
**Reasoning:** [2-3 sentences. What's the cleaner final state? What's the cost?]
**Refactor effort if changing:** [hours / days / not worth it]

---

Repeat this block for every differing concern.

### Step 3: Folder & Code Organization

This is independent of tech choice. Audit:

**Top-level structure:**

- Is it a monorepo or polyrepo? Is the structure self-explanatory?
- Are apps/services in obvious places (`apps/`, `services/`, `packages/`)?
- Are there orphan folders or unclear boundaries?

**Within each app:**

- Are routes, services, db, and lib code separated?
- Is there a god folder (everything dumped in `src/`)?
- Naming: are file names descriptive (`upload-handler.ts`) or generic (`utils.ts`, `helpers.ts`)?
- Are types co-located with the code that uses them or in a shared package?

**Cross-cutting:**

- Are shared types/constants centralized, or duplicated across apps?
- Is there an obvious place a new developer would put new code?

For each problem found, propose a specific reorganization. Show before/after
folder trees. Don't just say "this is messy" — show what it should look like.

### Step 4: Code Quality Issues (Tech-Agnostic)

These matter regardless of framework. Scan for:

**Readability**

- Functions over 50 lines without clear sub-steps
- Variable names like `data`, `result`, `temp`, `x`
- Magic numbers/strings (status codes, channel names, queue names) not extracted to constants
- Comments that explain _what_ instead of _why_

**Separation of concerns**

- Route handlers doing business logic + DB calls + validation inline
- DB queries inside React components or pages
- Business logic in workers that should be in shared services

**Error handling**

- Async functions with no try/catch
- Empty catch blocks (silent failures)
- Errors logged but not propagated, or propagated without context

**Type safety**

- `any` types in TypeScript
- Missing type hints in Python
- API responses with implicit `any` shape

**Security**

- Hardcoded secrets
- SQL string concatenation
- Missing auth checks on routes
- Unvalidated file uploads

**Performance smells**

- Loading entire Excel files into memory
- Loop + query (N+1)
- Models reloaded on every job instead of cached
- Frontend fetching the same data in multiple components

For each smell found: cite file path + line range, describe the issue, propose the fix.

### Step 5: Missing Pieces

Compare Plan A's Phase 1 scope checklist to what's actually built. List:

- ✅ Built and working
- 🚧 Started but incomplete
- ❌ Not started

### Step 6: Produce the Final Report

Output a single Markdown document with this structure:
Architecture Comparison Audit
Executive Summary
3-5 sentences. What's the overall verdict? How much of the friend's code should we keep?
Tech Stack Comparison
[The filled-in table from Step 1]
Per-Concern Decisions
[One section per differing concern, following the template from Step 2]
Decisions to Keep from Plan B (friend's code)
Bulleted list with one-line reasoning each.
Decisions to Refactor to Plan A
Bulleted list with one-line reasoning + estimated effort each.
Blended Approaches (take parts of both)
Bulleted list with what to take from where.
Folder Reorganization Proposal
Before/after folder trees. Specific moves required.
Code Quality Issues
Grouped by severity:

🔴 Critical (security, broken patterns) — must fix before more code is added
🟡 Moderate (readability, organization) — fix opportunistically
🟢 Minor (style, naming) — fix during refactor passes

For each: file path, problem, suggested fix.
Phase 1 Completion Status

✅ Done
🚧 In progress
❌ Missing

Recommended Next Steps (Ordered)

[First action — should be the highest-ROI fix]
[Second — usually folder reorg if needed]
...
Keep each step small enough for one work session.

Open Questions for the Team
Things the audit couldn't decide without human input.

## Rules

- Do NOT write or modify code. Read-only analysis.
- Do NOT recommend changes based on "this isn't what the plan said" alone.
  Every recommendation must cite a quality reason.
- Be specific. "The error handling is bad" is useless.
  "`apps/api/src/routes/upload.ts:47` catches errors but logs nothing and returns 200" is useful.
- Cite file paths and line numbers for every finding.
- When in doubt between two approaches, prefer the one that's already partially
  built — refactor cost is real.
