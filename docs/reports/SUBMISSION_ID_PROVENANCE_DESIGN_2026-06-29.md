# Submission ID Provenance Design — Path-to-GA §C.4

**Date:** 2026-06-29
**Status:** Design-doc only. No code changes. No UI. Greenlight gate before fire.
**Companion to:** docs/reports/MOVE_1_ORCHESTRATOR_TENANT_SCOPING_DESIGN_2026-06-29.md
**Pattern:** Move 1 / Phase 3 — schema change on a live multi-tenant table.

---

## A. Problem statement

`migrations/0018_submission_orchestrator.sql:19` defines:

```sql
CREATE TABLE IF NOT EXISTS submission_orchestrator_runs (
  run_id              UUID PRIMARY KEY,
  submission_id       TEXT NOT NULL,        -- ← free-form, no FK
  application_number  TEXT NOT NULL,
  ...
);
```

`submission_id` is a free-form `TEXT` field. Callers pass arbitrary strings:

- `server/routes/submission-orchestrator.ts:194` — `submissionId: z.string().min(1)`.
- `server/services/submission-package-orchestrator.ts:840` — fallback path attempts
  `Number(inputs.submissionId)` and throws on failure, proving callers pass
  non-numeric strings (e.g. `'SUB-2026-001'`, GUIDs).
- `getRun` reads (`submission-package-orchestrator.ts:1861-1882`) project the
  column back as `String(row.submission_id)`.

There is no canonical join from this string back to `public.submissions.id`
(`SERIAL`, the lifecycle-aware core created by
`migrations/20260604_submission_core_canonical.sql:23`). As a result:

1. **Every audit query** that asks "what submission is this orchestrator run
   for?" has to fall back to `submission_id TEXT` equality and hope the caller
   used the same string format every time.
2. **Every cross-reference** from `submission_orchestrator_runs` to the
   source-of-truth submission row (lifecycle stage, primary region, organization
   ownership, eCTD sequence ledger) must traverse application-side logic — there
   is no `JOIN submissions ON ...` available.
3. **Every change-impact graph walk** ("which orchestrator runs target
   submission id=42?") collapses to a string scan with no referential guarantee
   that the target submission still exists or belongs to the same tenant.
4. Orchestrator runs are **floating UUIDs** disconnected from the canonical
   submission record they belong to. The Move 1 tenant column protects against
   cross-tenant reads, but it does not link runs to their underlying lifecycle
   object.

This is the same risk class as Move 1 (schema change on a live multi-tenant
table) and gets the same human-review-before-fire pattern.

---

## B. Three migration paths

### Path A — REJECTED: Drop TEXT column, add FK

```sql
-- ❌ DO NOT EXECUTE
ALTER TABLE submission_orchestrator_runs DROP COLUMN submission_id;
ALTER TABLE submission_orchestrator_runs
  ADD COLUMN submission_id INTEGER NOT NULL REFERENCES submissions(id);
```

**Rejected because:**

- Every historical row whose `submission_id TEXT` does NOT resolve to a
  `submissions.id` (a) cannot have its FK populated, (b) cannot be NOT NULL,
  (c) cannot survive a DROP that removes the only evidence of its origin.
- Some callers pass non-numeric submissionIds today
  (`submission-package-orchestrator.ts:833-844` documents this explicitly:
  *"Many callers pass a non-numeric submissionId (e.g. 'SUB-2026-001', a UUID)"*).
  A blanket DROP destroys that audit trail.
- 21 CFR Part 11 — audit history is append-only. DROP-ing a column that
  records what the user submitted at the time is non-compliant.

### Path B — RECOMMENDED: Add nullable FK column alongside existing TEXT

```sql
ALTER TABLE submission_orchestrator_runs
  ADD COLUMN IF NOT EXISTS submission_id_fk INTEGER REFERENCES submissions(id);
```

- The existing `submission_id TEXT NOT NULL` column **stays unchanged** (audit
  history preserved).
- The new `submission_id_fk INTEGER` is **nullable**. New writes dual-write
  both columns when the caller supplies the FK; legacy callers that only have
  the TEXT continue to work (the FK column stays NULL).
- No `NOT NULL` constraint on `submission_id_fk` until backfill is complete
  AND a 90-day grace window has elapsed during which every new write carries
  the FK.
- Reads can join `submissions ON submission_orchestrator_runs.submission_id_fk =
  submissions.id` whenever the FK is populated. Rows where the FK is still
  NULL fall back to the TEXT (and a follow-up reconciliation job can backfill
  them).

This is the identical pattern Move 1 used for `organization_id` (see
`migrations/20260629_orchestrator_tenant_scope.sql` and its companion design
doc).

### Path C — Backfill: requires a TEXT → FK mapping rule

The orchestrator persists `submission_id TEXT` directly from
`OrchestratorInputs.submissionId` (`submission-package-orchestrator.ts:526`).
There is no normalization rule today: callers pass whatever string they have.
A backfill from `submission_id TEXT` → `submissions.id` would require:

1. A canonical, tenant-scoped mapping from the TEXT identifier shape (which
   varies — sometimes a SERIAL integer rendered as a string, sometimes a
   business-domain code like `'SUB-2026-001'`, sometimes a GUID) back to
   `submissions.id`.
2. Such a mapping **does not exist in the schema today**. `public.submissions`
   has `id SERIAL PRIMARY KEY` but no business-key column (e.g.
   `submission_code TEXT UNIQUE`) that would resolve free-form strings to a
   stable id. The Move 1 design doc reaches the same conclusion:
   *"requires a canonical join from submission_id back to organizations.id
   that does not exist in the current schema."*
3. **Therefore the backfill is not safe to run automatically.** A
   data-archaeology pass is required: for each historical row, a human (or a
   carefully written script with per-tenant heuristics) must decide whether
   the TEXT field can be resolved to a `submissions.id` for that tenant, and
   leave it NULL otherwise. Misattributing a historical row to the wrong
   submission is worse than leaving it unresolved.

The Path B design accepts this: backfill is a separate, manual, post-migration
workflow. New writes carry the FK from day one; old rows go through the
data-archaeology pass on a tenant-by-tenant basis.

---

## C. Recommendation

**Path B.** Justification:

1. **Forward-only, additive, no data loss.** Same shape as Move 1.
2. **Backward compatible** with every existing caller — the TEXT column stays
   `NOT NULL` and continues to be the source of record until backfill is run.
3. **Unblocks the cross-reference query immediately** for new runs: every
   orchestrator run created after migration carries a real FK to
   `submissions`, so audit queries / change-impact walks / lifecycle joins
   can use the FK from day one without waiting on backfill.
4. **Defers the NOT NULL decision** until both (a) the backfill workflow has
   run for the historical rows that can be resolved, and (b) a 90-day window
   has elapsed proving every code path now writes the FK. That mirrors the
   Move 1 deferred-NOT-NULL pattern.
5. **Auditor-safe.** No row is dropped, no row is silently retroactively
   attributed to a wrong submission. A row with `submission_id_fk IS NULL`
   means "we have not yet proven this run's lineage" — which is exactly what
   the audit trail should say.

---

## D. Migration SQL (forward-only, for review)

> ⚠️ **DO NOT execute this SQL from this document.** It is here for human
> review only. The actual `.sql` migration file is the implementation
> workflow that fires *after* sign-off.

```sql
-- Migration 20260629: Submission ID provenance — submission_id_fk on orchestrator runs
-- Path-to-GA §C.4 — Move 1 / Phase 3 pattern.
--
-- WHY
-- ---
-- submission_orchestrator_runs.submission_id is a free-form TEXT column with
-- no FK back to public.submissions(id). Audit queries, change-impact graph
-- walks, and lifecycle joins all need a canonical FK. This migration adds a
-- nullable submission_id_fk column alongside the existing TEXT column so:
--   * new writes dual-write both columns (TEXT for backward compat + FK for
--     joinability),
--   * legacy callers that only have the TEXT continue to work,
--   * historical rows that cannot be resolved to a submissions.id row stay
--     with submission_id_fk = NULL until a data-archaeology backfill runs.
--
-- PATH CHOSEN: Path B (recommended in the design doc).
--   Path A (DROP TEXT, replace with FK) — REJECTED: destroys audit history.
--   Path C (backfill then SET NOT NULL) — DEFERRED: no canonical TEXT→FK
--     mapping rule exists today; backfill is a separate, manual,
--     post-migration workflow.
--
-- MIGRATION SAFETY
-- ----------------
-- Additive only. No DROP. No ALTER on existing columns. No NOT NULL on a
-- column that may have NULL rows. ADD COLUMN uses IF NOT EXISTS and indexes
-- use IF NOT EXISTS so the migration is fully idempotent on re-run.
--
-- PREREQUISITE
-- ------------
-- public.submissions must exist with id SERIAL PRIMARY KEY before this
-- migration runs. Provisioned by
-- migrations/20260604_submission_core_canonical.sql:23.

BEGIN;

ALTER TABLE submission_orchestrator_runs
  ADD COLUMN IF NOT EXISTS submission_id_fk INTEGER REFERENCES submissions(id);

-- FK lookups: "which orchestrator runs target submission id=42?"
CREATE INDEX IF NOT EXISTS submission_orchestrator_runs_submission_fk_idx
  ON submission_orchestrator_runs(submission_id_fk);

-- Composite for the common tenant-scoped lineage query
-- "show all runs for submission id=42 owned by org id=7":
CREATE INDEX IF NOT EXISTS submission_orchestrator_runs_org_submission_fk_idx
  ON submission_orchestrator_runs(organization_id, submission_id_fk);

COMMIT;
```

**Notes on the SQL:**

- `BEGIN; ... COMMIT;` matches the discipline of
  `migrations/20260629_orchestrator_tenant_scope.sql` (Move 1) and
  `migrations/20260629_orchestrator_awaiting_async_status.sql` (Move 6).
- `IF NOT EXISTS` on both the column and the indexes makes the migration
  idempotent on partial-failure re-run (same rationale as Move 1).
- No `submission_orchestrator_steps` change is needed — step rows reference
  `submission_orchestrator_runs.run_id` via ON DELETE CASCADE, so the parent
  table's FK is enough to walk back to `submissions`.

---

## E. Service-layer changes (for review, NOT FOR IMPLEMENTATION YET)

`server/services/submission-package-orchestrator.ts`:

1. **`OrchestratorInputs` (line 179)** — add an optional field alongside the
   existing `submissionId`:
   ```ts
   /**
    * Optional canonical FK back to public.submissions(id). When supplied,
    * persistRun dual-writes both `submission_id TEXT` (legacy) and
    * `submission_id_fk INTEGER` (the joinable FK). When absent, only the
    * TEXT column is written and submission_id_fk stays NULL — the row will
    * remain in the "unresolved lineage" bucket until backfill.
    */
   submissionFk?: number;
   ```

2. **`OrchestratorRun` (line 140)** — add the same optional field on the
   in-memory shape so it round-trips through `persistRun` / `getRun`.

3. **`persistRun` (line 504)** — dual-write both columns:
   ```ts
   INSERT INTO submission_orchestrator_runs
     (run_id, organization_id, submission_id, submission_id_fk,
      application_number, region, submission_type, started_at,
      completed_at, status, steps)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
   ON CONFLICT (run_id) DO UPDATE SET
     completed_at = EXCLUDED.completed_at,
     status = EXCLUDED.status,
     steps = EXCLUDED.steps,
     submission_id_fk = COALESCE(EXCLUDED.submission_id_fk,
                                 submission_orchestrator_runs.submission_id_fk);
   ```
   `COALESCE` on the UPSERT side prevents a resume-write from clearing a
   previously-populated FK back to NULL.

4. **`getRun` (line 1848)** — SELECT the new column and project it onto the
   in-memory shape. During the transition window, getRun should NOT filter on
   `submission_id_fk` — it should keep returning rows whose FK is still NULL
   so legacy data stays visible. Once the backfill is complete and
   `submission_id_fk` goes `NOT NULL`, this becomes a join opportunity (not
   a filter).

5. **New helper** —
   `loadSubmissionFkBySubmissionIdText(text: string, organizationId: number):
   Promise<number | null>`. For callers that have only the TEXT but want
   to populate the FK on write, this helper performs the tenant-scoped
   resolution (if and only if the TEXT happens to be a valid integer that
   matches a `submissions.id` owned by the supplied `organizationId`). Returns
   `null` when the TEXT cannot be safely resolved — caller proceeds with FK =
   undefined and leaves the column NULL. Critically, this helper does NOT
   guess; if the lookup is ambiguous, it returns null.

---

## F. Route-layer changes (for review, NOT FOR IMPLEMENTATION YET)

`server/routes/submission-orchestrator.ts:193` — `RunCommonSchema`:

```ts
const RunCommonSchema = z.object({
  submissionId: z.string().min(1),
  submissionFk: z.number().int().positive().optional(),  // ← new
  applicationNumber: z.string().min(1),
  region: RegionSchema,
  ...
});
```

`submissionFk` is **optional**. Existing clients continue to send only
`submissionId` (TEXT) and nothing breaks. Clients that can supply the canonical
FK do so and gain joinability immediately.

The route handler threads `submissionFk` straight into
`OrchestratorInputs.submissionFk` without normalization — the service layer
owns the resolution / dual-write logic.

---

## G. Open questions for human review

1. **Canonical submissions table.** Step 1 finding (below) selected
   `public.submissions` (`SERIAL` id, created by
   `20260604_submission_core_canonical.sql`) as the FK target. This is the
   region-agnostic, lifecycle-aware core. There is a separate
   `ind_submissions` table (`migrations/0000_sweet_joseph.sql:3795`) that
   serves the IND wizard — but `ind_submissions.submission_id` is itself a
   `TEXT` column (not a primary key), and `ind_submissions.id` is a separate
   SERIAL that is IND-wizard-specific, not the lifecycle core. **The FK
   should point at `public.submissions(id)`, not `public.ind_submissions(id)`,
   because the orchestrator runs against the lifecycle core, not the IND
   wizard's project tracker.** Confirm this is the intended target.

2. **Mapping rule for backfill.** Does an authoritative mapping rule from
   `submission_id TEXT` → `submissions.id` survive across orgs? If not (and
   the schema today says it does not — no `submissions.submission_code TEXT
   UNIQUE` or similar business key exists), **the backfill cannot happen
   automatically.** It becomes a per-tenant data-archaeology task. Confirm
   whether ops has the appetite to leave historical rows with
   `submission_id_fk IS NULL` indefinitely until that pass runs.

3. **NOT NULL timeline.** When can we make `submission_id_fk` NOT NULL?
   Proposal: after 90 days of new writes carrying the FK AND completion of
   the per-tenant backfill pass. This requires:
   - A telemetry counter on rows written with `submission_id_fk IS NULL`
     (so we know when new code paths have stopped producing them);
   - Sign-off from compliance that "rows where the FK is still NULL after
     backfill" can be left as audit-of-record (we keep them, but they are
     not joinable).

---

## H. Effort estimate

**~3 person-days** per Path-to-GA §C.4:

- 0.5 day: migration file + idempotent re-run verification on dev DB.
- 1 day: service-layer dual-write + `loadSubmissionFkBySubmissionIdText`
  helper + tests (unit + integration covering the COALESCE-on-UPSERT and
  the legacy-no-FK-supplied path).
- 0.5 day: route schema + Zod validation tests.
- 0.5 day: backfill workflow design (separate doc, manual per-tenant) — does
  NOT include actually running the backfill, only designing the script.
- 0.5 day: telemetry counter for `submission_id_fk IS NULL` writes + dashboard
  panel so we can decide the NOT NULL gate.

Not included (out of scope for §C.4): the data-archaeology backfill itself,
the eventual NOT NULL migration, any UI surfacing of the FK linkage.

---

## I. Risk register — top 3

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| 1 | **Wrong FK target chosen.** If callers actually mean `ind_submissions.id` (IND wizard's tracker) and we point at `submissions.id` (lifecycle core), every backfilled row links to the wrong object. | Medium | High | Open Question #1 — gate the migration on explicit user sign-off of the FK target. Default = `public.submissions` per Step 1. |
| 2 | **Silent FK NULL on new writes.** If a route handler forgets to pass `submissionFk` through, the orchestrator persists a row with `submission_id_fk IS NULL` even though the caller knew the FK. The row goes into the "unresolved lineage" bucket and is missed by audit queries that filter on FK presence. | Medium | Medium | Telemetry counter on NULL-FK writes (see §G.3); periodic audit query "runs created in the last 7 days with NULL FK" surfaces missed call sites. |
| 3 | **Cross-tenant FK leak via helper.** `loadSubmissionFkBySubmissionIdText` resolves a TEXT submissionId to an integer FK. If the helper does not enforce `WHERE organization_id = $`, a caller could resolve a TEXT to a submission owned by a different tenant and the orchestrator row would link runs across tenants — a Part 11 violation worse than the original problem. | Low | High | The helper MUST take `organizationId` as a required parameter (see §E.5) and the SQL MUST filter on it. Unit test the cross-tenant case explicitly — resolve a TEXT that exists in org A while querying as org B, assert NULL. |

---

## J. Sign-off question

> **Greenlight Path B with `submissions` table = `public.submissions`
> (`migrations/20260604_submission_core_canonical.sql`, the region-agnostic
> lifecycle core, SERIAL PK) as the FK target?**

Explicit yes / no required before the `.sql` migration file is written.

---

## Appendix — Step 1 finding

**Canonical submissions table: `public.submissions`**, defined in
`migrations/20260604_submission_core_canonical.sql:23` and mirrored in the
Drizzle schema at `shared/schema/submissions.ts:35`.

```
public.submissions (
  id               SERIAL PRIMARY KEY,
  title            TEXT NOT NULL,
  product_name     TEXT,
  application_type TEXT NOT NULL,    -- ind|nda|bla|anda|maa|510k|de_novo|pma|cta
  client_type      TEXT NOT NULL,    -- pharma|biotech|mdx|ivd
  primary_region   TEXT NOT NULL,    -- fda|eu|jp
  status           TEXT NOT NULL DEFAULT 'planning',
  lifecycle_stage  TEXT NOT NULL DEFAULT 'planning',
  organization_id  INTEGER NOT NULL REFERENCES organizations(id),
  ...
)
```

**Why this one and not the alternatives:**

| Candidate | Verdict | Reason |
|-----------|---------|--------|
| `public.submissions` (`shared/schema/submissions.ts`) | **CHOSEN** | Phase 1, WO-1.1 canonical region-agnostic lifecycle core. Already FK target for `submission_regions.submission_id`, `ectd_sequences.submission_id`, `submission_leaves` (transitively). Has `organization_id` for tenant alignment. SERIAL `id` makes it a clean integer FK target. |
| `public.ind_submissions` (`migrations/0000_sweet_joseph.sql:3795`) | Rejected | IND-wizard-specific (not lifecycle-aware, not region-agnostic). Its own `submission_id` is itself a TEXT column, not the PK — using it as the FK target would just push the same provenance problem one level down. |
| `public.c2c_submissions` | Not found in repo | Search returned no `CREATE TABLE c2c_submissions` — this table does not exist. |
| `public.concept2cure_submissions` | Not found in repo | Search returned no `CREATE TABLE concept2cure_submissions` — this table does not exist. (`server/routes/concept2cure.ts` exists as a route file but does not own a `*_submissions` table.) |
| `public.ectd_submissions` | Not found in repo | Search returned no `CREATE TABLE ectd_submissions`. `ectd_sequences` exists but is the lifecycle ledger that itself FKs to `submissions`, not a submission table per se. |

`public.submissions` is the source of truth. The other "submission-ish"
tables either don't exist or are downstream projections that themselves FK
into `public.submissions`.
