# Move 1 — Tenant-Scope the Submission Orchestrator (P0)

**Date:** 2026-06-29
**Status:** Pre-implementation review. Workflow held pending sign-off.
**Companion to:** `docs/reports/RECONCILIATION_AUDIT_2026-06-29.md` (Move 1)
**Severity:** P0 — 21 CFR Part 11 / GxP blocker on a live multi-tenant production system.

---

## Why this gets human review before firing

The orchestrator persists multi-tenant data with no `organization_id` column. Today, two organizations running submissions concurrently can hand each other `runId` values, query each other's runs, and see each other's step audit logs. That is not a hypothetical — `getRun(runId)` and `getRunAudit(runId)` accept the `runId` only and have no tenant filter. **Any `runId` leaked, screen-shot, or guessed exposes another tenant's submission history.**

Fixing this is a schema migration on a live table that may already have rows. Multi-agent code generation should never autonomously decide a backfill strategy for production data. The right answer depends on a fact only you know: **do real customer rows exist in `submission_orchestrator_runs` today?**

This doc lays out the three viable migration paths and recommends one. Sign off, edit, or reject before the workflow fires.

---

## Current state (verified by reading the file)

`migrations/0018_submission_orchestrator.sql`:
```sql
CREATE TABLE submission_orchestrator_runs (
  run_id              UUID PRIMARY KEY,
  submission_id       TEXT NOT NULL,
  application_number  TEXT NOT NULL,
  region              TEXT NOT NULL CHECK (...),  -- now aligned per Move 7
  submission_type     TEXT NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL,
  completed_at        TIMESTAMPTZ,
  status              TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed', 'partial')),
  steps               JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE submission_orchestrator_steps (
  step_id       UUID PRIMARY KEY,
  run_id        UUID NOT NULL REFERENCES submission_orchestrator_runs(run_id),
  step          TEXT NOT NULL,
  status        TEXT NOT NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN (...)),
  input_hash    TEXT,
  output_ref    TEXT,
  details       JSONB,
  event_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

No `organization_id` on either table. No tenant scoping in `runOrchestrator` (`submission-package-orchestrator.ts:238`), `getRun`, `getRunAudit`, `regenerateAffected`, or any helper that touches these tables.

The route at `server/routes/submission-orchestrator.ts` **does** resolve a `userId` from `req.user.id` (line ~150 for `runOrchestrator`), but does NOT pass `organizationId` to the orchestrator and the orchestrator doesn't accept one. So the route knows the tenant; the persistence layer does not.

---

## The three viable paths

### Path A — Add column as `NOT NULL` with a sentinel default (REJECTED)
```sql
ALTER TABLE submission_orchestrator_runs
  ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 0;
```
**Why rejected:** A sentinel of `0` (or any value) attributes all existing rows to a single non-existent tenant. Auditors will reject this on inspection. If a real organization happens to have `id = 0` in the future, the rows blur. **Don't do this.**

### Path B — Add column as nullable, do not backfill, gate new writes (interim safety)
```sql
ALTER TABLE submission_orchestrator_runs ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE submission_orchestrator_steps ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
CREATE INDEX submission_orchestrator_runs_org_idx ON submission_orchestrator_runs(organization_id);
CREATE INDEX submission_orchestrator_steps_org_idx ON submission_orchestrator_steps(organization_id);
```

Service-layer changes:
- `OrchestratorInputs` interface adds `organizationId: number` (required).
- `runOrchestrator` accepts and writes the column for new runs.
- `getRun` / `getRunAudit` / `regenerateAffected` require `organizationId` and filter `WHERE organization_id = $`.
- Pre-existing rows with `organization_id IS NULL` become **invisible** to every read path. This is the right behavior — they cannot be safely attributed, so they should not be served.

**Pro:** safe to ship today regardless of existing data; no backfill risk; new writes enforce tenancy.
**Con:** historical rows go dark. If the orchestrator was actively used in production, you lose visibility on those runs without a manual data-archaeology pass.

### Path C — Add column nullable, backfill, then ALTER to NOT NULL (canonical)
```sql
-- Step 1: additive
ALTER TABLE submission_orchestrator_runs ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE submission_orchestrator_steps ADD COLUMN organization_id INTEGER REFERENCES organizations(id);

-- Step 2: backfill from a join (REQUIRES SIGN-OFF on the join source)
-- Candidate: derive from submission_id → some upstream table that has organization_id.
-- Today there is NO such canonical join. submission_id is TEXT and ungrounded.
-- Without a join, backfill is impossible without you telling me how to derive
-- the tenant for each historical row.

-- Step 3 (only after backfill confirms 0 NULLs):
ALTER TABLE submission_orchestrator_runs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE submission_orchestrator_steps ALTER COLUMN organization_id SET NOT NULL;
```

**Pro:** historical data is preserved AND becomes properly scoped.
**Con:** requires you to tell me how to derive `organization_id` from `submission_id` (or whatever upstream key). The schema has no obvious join.

---

## My recommendation: **Path B**

Because:

1. **`submission_id` is a free-form TEXT** in this schema (line 19 of migration 0018). There is no canonical join from it back to `organizations.id`. Path C can't proceed without you naming the upstream key.
2. **Going-forward correctness is what matters most.** Every new run, from this migration on, is tenant-scoped. The window during which an unscoped `runId` could leak data closes immediately.
3. **Historical rows can be addressed later** if needed. If you confirm the orchestrator hasn't seen real customer load yet, the historical rows are throwaway and Path B is permanent. If real rows exist, we add a one-off backfill script after we know the join key.

**Sign-off question for you:**
- Has `submission_orchestrator_runs` accumulated rows from real customer submissions, or is it pre-production / staging-only?
  - If pre-production / no customer data: **Path B** is fine; we can also TRUNCATE the table in a separate transaction to clean state.
  - If real customer rows exist: **Path B is still my recommendation** (close the leak now, archaeology later), but please tell me before I fire the workflow so I can include a backup step.

---

## What the workflow will do (if you greenlight Path B)

### Migration `migrations/20260629_orchestrator_tenant_scope.sql`
```sql
BEGIN;

ALTER TABLE submission_orchestrator_runs
  ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE submission_orchestrator_steps
  ADD COLUMN organization_id INTEGER REFERENCES organizations(id);

-- Tenant-first indexes for status dashboards and audit reads
CREATE INDEX IF NOT EXISTS submission_orchestrator_runs_org_idx
  ON submission_orchestrator_runs(organization_id);
CREATE INDEX IF NOT EXISTS submission_orchestrator_runs_org_status_idx
  ON submission_orchestrator_runs(organization_id, status);
CREATE INDEX IF NOT EXISTS submission_orchestrator_steps_org_run_idx
  ON submission_orchestrator_steps(organization_id, run_id);

COMMIT;
```

### Service-layer changes (`server/services/submission-package-orchestrator.ts`)
1. `OrchestratorInputs` interface adds required `organizationId: number`.
2. `runOrchestrator(inputs)` requires `inputs.organizationId`; throws fast at top if missing or non-positive.
3. `persistRun` includes `organization_id` in the UPSERT.
4. `persistStepEvent` includes `organization_id` in the INSERT.
5. `getRun(runId, organizationId)` adds the second arg; query filters `WHERE run_id = $1 AND organization_id = $2`. Returns null if not found OR org mismatch (collapsed).
6. `getRunAudit(runId, organizationId)` same shape.
7. `regenerateAffected(previousRun, inputs, changedStep?)` requires `inputs.organizationId` and the previous run's `organization_id` must match — else throw.

### Route-layer changes (`server/routes/submission-orchestrator.ts`)
1. Every handler that calls into the orchestrator resolves `organizationId` from `req.tenantContext / req.user` at the top (same `requireTenant` pattern Phase 1b uses). 401 unauthenticated / 403 missing-org-claim, never silent fallback.
2. `POST /runs` body schema gains nothing — `organizationId` is JWT-bound, never accepted from the body.
3. `GET /runs/:runId` and `GET /runs/:runId/audit` pass `organizationId` to the service; service returns null collapses to 404.
4. `POST /runs/:runId/regenerate` validates the run belongs to the requesting org before kicking off.

### Drizzle defs (if used)
If `shared/schema.ts` defines `submissionOrchestratorRuns` / `submissionOrchestratorSteps`, add `organizationId` column and relations. If only the raw SQL exists today, skip — the migration is the source of truth and the service uses `pool.query` directly per the audit.

### Tests
- `runOrchestrator` throws without `organizationId`.
- Two orgs running in parallel cannot see each other's runs via `getRun` / `getRunAudit`.
- `regenerateAffected` rejects when previousRun.organizationId ≠ inputs.organizationId.
- Routes return 401 unauthenticated / 403 missing-org / 404 cross-org / 200 same-org.
- A row inserted under org A is not visible to a `getRun` call from org B.

### Adversarial verify lenses
1. **Tenant isolation** — every read query filters by `organization_id`. Every write includes `organization_id`. No path through the orchestrator can persist a run without `organization_id`.
2. **Backward compat / regression** — any existing caller of `runOrchestrator` / `getRun` / `getRunAudit` is updated to pass `organizationId`. Without the rename, the workflow CANNOT silently leave callers broken — TS compile errors will surface them.
3. **Migration safety** — additive only. No DROP. No NOT NULL on a column that may have NULL rows. Indexes are `IF NOT EXISTS` so re-running the migration is idempotent.

---

## Effort estimate

| Stage | Hours |
|---|---|
| Migration + index + Drizzle defs | 2 |
| Service-layer interface change + persist + read filters | 6 |
| Route-layer requireTenant wiring + 401/403/404 collapse | 3 |
| Tests (5 cases minimum) | 4 |
| Adversarial verify + patch + integration smoke | 4 |
| Buffer for surprises | 5 |
| **Total** | **~24 hours = ~3 working days** at one engineer |

---

## What the workflow will NOT do

- Backfill historical rows (your call — see sign-off question above).
- Change `runId` from UUID to anything else (UUID is fine; the issue was lack of tenant filter, not the key shape).
- Modify `submission_id` (still TEXT, still ungrounded — Move 1 doesn't address that gap).
- Touch any of the four pre-existing services beyond what's needed to thread `organizationId` through.
- Wire any of the Phase 1/2/3 work I shipped this session — that's Moves 3/5/6 after Move 1 lands.

---

## What I need from you to fire the workflow

One answer:
- **Greenlight Path B** (recommended): I fire the workflow as written above.
- **Greenlight Path B + TRUNCATE** the table in a separate transaction first (only if you confirm pre-production data).
- **Path C with this join key:** `<tell me how to derive organization_id from submission_id>`. I update the design doc + fire.
- **Hold** — you want to do something different.

Sign-off in plain text in the next turn is enough. I will not fire until you explicitly approve a path.
