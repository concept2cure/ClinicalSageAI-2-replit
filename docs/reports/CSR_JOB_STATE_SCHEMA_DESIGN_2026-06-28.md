# Phase 3 — CSR Job-State Schema Design

**Date:** 2026-06-28
**Status:** Pre-implementation review. Schema is NOT yet shipped. Workflow held pending sign-off.
**Companion to:**
- `DOCUMENT_ASSEMBLY_VERIFICATION_2026-04-27.md` — established CSR composer is 496 lines, complete, AI integration real
- `DOCUMENT_ASSEMBLY_BUILD_PLANS_2026-04-27.md` — Plan 4 (rescoped 4.5w → 1.5w)

---

## Why this gets human review before firing

This phase adds two new tables to a live, multi-tenant production system. Schema migrations are effectively irreversible at scale — once columns are written, removing them either drops user data or requires a backfill ladder. Multi-agent code generation is great for stateless services; it should never autonomously design durable storage on its own.

Specifically, the wrong answer here gets us:
- An indexed column that becomes the wrong access pattern in three months
- A foreign-key cascade that deletes audit data on a project archive
- A `text` column where we needed `jsonb` (or vice versa) — painful to migrate later
- A missing `NOT NULL` we can't add without a backfill once data exists

So the schema gets reviewed in plain SQL by a human before any workflow touches it.

---

## What's changing about CSR

Existing state (verified, not assumed):
- `server/services/csr-builder.ts` is 496 lines, complete, AI-integrated via `unified-ai-client` (the gateway shim).
- `launchCSRBuild()` at line 152 runs synchronously in-process — that's the only real gap.
- 17 ICH-E3 templates at lines 439–480 are real.
- Raw SQL at lines 325–355 in `compareWithExistingCSRs` needs porting to Drizzle.

The scope of Phase 3 is therefore narrow:
1. Add a job-state table so `launchCSRBuild` can run asynchronously and survive a worker restart
2. Add per-section persistence so partial work isn't lost on a section-level error
3. Port the raw SQL to Drizzle

This is **not** "build CSR from scratch" — that was the audit's original framing. Verification corrected it.

---

## Schema design — two new tables

### Table 1: `csr_build_jobs`

The job header. One row per CSR build request, with state transitions tracked here.

```sql
CREATE TABLE csr_build_jobs (
  id                    serial PRIMARY KEY,

  -- Tenant scoping (non-negotiable)
  organization_id       integer NOT NULL REFERENCES organizations(id),
  project_id            integer REFERENCES projects(id) ON DELETE SET NULL,

  -- Study context (the CSR is for a specific study)
  study_id              text NOT NULL,

  -- State machine
  status                text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'loading_data', 'drafting', 'tabulating',
                      'cross_linking', 'complete', 'failed', 'cancelled')),
  progress              integer NOT NULL DEFAULT 0
    CHECK (progress >= 0 AND progress <= 100),

  -- What's being generated (denormalized for fast resume)
  sections_to_generate  text[],
  study_info_snapshot   jsonb,         -- snapshot of CSRBuildRequest at enqueue time
  error                 jsonb,         -- populated on failed state

  -- Audit / lifecycle
  requested_by          integer REFERENCES users(id) ON DELETE SET NULL,
  started_at            timestamp,
  completed_at          timestamp,
  created_at            timestamp NOT NULL DEFAULT now(),
  updated_at            timestamp NOT NULL DEFAULT now()
);

-- Tenant-first index for status dashboards
CREATE INDEX csr_build_jobs_org_project_idx
  ON csr_build_jobs (organization_id, project_id);

-- Partial index for the worker poll path — only "live" rows matter
CREATE INDEX csr_build_jobs_status_idx
  ON csr_build_jobs (status)
  WHERE status IN ('queued', 'loading_data', 'drafting', 'tabulating', 'cross_linking');

-- Org+study lookup for "show me the latest CSR for this study"
CREATE INDEX csr_build_jobs_org_study_idx
  ON csr_build_jobs (organization_id, study_id);
```

**Design decisions:**

| Decision | Why |
|---|---|
| `project_id` nullable with `ON DELETE SET NULL` | A study can outlive a project archive; we want the job audit trail to survive project deletion. |
| `status` is a CHECK constraint, not an enum type | Enums are painful to migrate. CHECK constraints can be loosened with a single `ALTER TABLE`. |
| Eight statuses (added `cancelled`) | A user must be able to cancel a long-running job; without `cancelled` we'd be reusing `failed` for two semantics. |
| `sections_to_generate text[]` | The request specifies a subset of ICH-E3 sections to build. Array column avoids a join table for a small bounded list. |
| `study_info_snapshot jsonb` | Snapshot of the build request at enqueue time so a resumed job has stable inputs even if the source data changes. |
| `error jsonb` not `text` | Errors carry structure (code, section that failed, stack). |
| `requested_by` nullable | Service-initiated builds (e.g., a webhook) may not have a user. |
| Three indexes, not more | (org, project) covers most dashboard reads; partial status index for worker; (org, study) for "latest CSR" lookups. |

### Table 2: `csr_section_outputs`

One row per generated section. Persisted incrementally so a section-level failure leaves prior work intact.

```sql
CREATE TABLE csr_section_outputs (
  id                serial PRIMARY KEY,

  -- Tenant scoping (denormalized from the job for cheap org-scoped reads)
  organization_id   integer NOT NULL REFERENCES organizations(id),
  project_id        integer REFERENCES projects(id) ON DELETE SET NULL,

  -- Foreign key to the job
  job_id            integer NOT NULL REFERENCES csr_build_jobs(id) ON DELETE CASCADE,

  -- ICH-E3 section identifier (e.g., '2.1', '11.4', '12.2.4')
  section_number    text NOT NULL,

  -- Content
  content           text NOT NULL,
  content_hash      text NOT NULL,          -- SHA-256 lowercase hex of content

  -- Provenance
  ai_generated      boolean NOT NULL DEFAULT false,
  model             text,                   -- e.g., 'claude-opus-4-7'
  token_cost        integer DEFAULT 0,
  lineage           jsonb,                  -- which sources, prior section refs

  generated_at      timestamp NOT NULL DEFAULT now(),

  -- One section number per job; regeneration uses INSERT ... ON CONFLICT UPDATE
  UNIQUE (job_id, section_number)
);

CREATE INDEX csr_section_outputs_org_project_idx
  ON csr_section_outputs (organization_id, project_id);

CREATE INDEX csr_section_outputs_job_idx
  ON csr_section_outputs (job_id);
```

**Design decisions:**

| Decision | Why |
|---|---|
| `organization_id` denormalized | Lets a "list all my CSR sections" query stay tenant-scoped without a join. The slight write cost is fine; the read frequency is much higher. |
| `ON DELETE CASCADE` on `job_id` | When a job is purged (e.g., GDPR), its section content goes with it. This is the inverse of the job's `project_id` rule because the section output has no value without its parent job. |
| `content_hash` separate from `content` | Lets a regenerate path detect "no-op rewrites" by hash before persisting. SHA-256 lowercase hex (matches the validator convention from Phase 1). |
| `UNIQUE (job_id, section_number)` | Regeneration is an upsert, not a duplicate insert. Keeps cardinality bounded per job. |
| `lineage jsonb` | Per the build-plan goal of artifact-level provenance (which sources fed each section). Not enforced shape v1; we can tighten later. |
| `token_cost` and `model` per section | Lets us compute true per-section AI cost for billing and budget alerting. |

---

## Migration

**File:** `migrations/<next-number>_csr_job_state.sql` (next number determined at fire time)

**Drizzle additions** to `shared/schema.ts`:
- `csrBuildJobs` (`pgTable`)
- `csrSectionOutputs` (`pgTable`)
- Type exports: `CsrBuildJob`, `NewCsrBuildJob`, `CsrSectionOutput`, `NewCsrSectionOutput`
- Relations: `csrBuildJobsRelations` (organization, project, requestedByUser, sections), `csrSectionOutputsRelations` (organization, project, job)

**No DROP statements.** This is a pure additive migration. Rollback is the inverse `DROP TABLE` (only if no rows have been written).

---

## Service surface (no new routes in Phase 3)

`server/services/csr/csr-job-runner.ts`:

```ts
// Returns immediately; runner fires in setImmediate.
enqueueCSRBuildJob(req: CSRBuildRequest, ctx: {
  organizationId: number;
  projectId?: number;
  requestedBy?: number;
}): Promise<{ jobId: number; status: 'queued' }>

// State-machine executor; fired by enqueueCSRBuildJob in the background.
runCSRBuildJob(jobId: number): Promise<void>

// Org-scoped status fetch — returns null if not found or org mismatch.
getCSRBuildJobStatus(jobId: number, organizationId: number): Promise<...>

// Org-scoped section list.
getCSRSectionOutputs(jobId: number, organizationId: number): Promise<CsrSectionOutput[]>
```

`server/services/csr-builder.ts` (existing file):
- ADD `launchCSRBuildAsync(req, ctx)` — calls `enqueueCSRBuildJob`, kicks off `runCSRBuildJob` in `setImmediate`, returns `jobId`. Existing `launchCSRBuild` stays for back-compat.
- PORT the raw SQL at lines 325–355 to Drizzle (`compareWithExistingCSRs`).

**No new routes.** A future Phase 3b adds `POST /api/csr/jobs`, `GET /api/csr/jobs/:id`, etc. Route surface is held separate so the schema can be reviewed in isolation.

---

## Things I expect grilling on

1. **Why no external job queue (BullMQ/PgBoss) for v1?** `setImmediate` works for single-process, works in serverless, and avoids a dependency. If a job dies mid-run, we mark it `failed` on restart via a heartbeat check (deferred to v1.1). For an initial CSR job feature, `setImmediate` is honest about its limitations rather than premature infrastructure.

2. **Why denormalize `organization_id` onto `csr_section_outputs`?** Read frequency >> write frequency. A "list my org's CSR sections" query without the denormalized column needs a join through `csr_build_jobs`. With the column, every reader stays tenant-scoped cheaply. The risk is drift between job and section org — addressed by a CHECK trigger or by always writing both from the same code path.

3. **Why `text[]` instead of a join table for `sections_to_generate`?** Bounded list (~30 ICH-E3 sections max), set-on-create, never updated incrementally. Array avoids the join. If we ever need to query "which jobs included section 11.4," we add a GIN index then.

4. **Why nullable `project_id`?** Studies can outlive projects (a project archive shouldn't delete the CSR history). `ON DELETE SET NULL` preserves the audit trail.

5. **Why a CHECK constraint instead of a Postgres enum?** Enums are painful to extend (you can't drop a value, and adding one needs `ALTER TYPE`). CHECK is a single `ALTER TABLE` to loosen.

6. **What about regeneration semantics?** `UNIQUE (job_id, section_number)` + upsert. If a section is regenerated, the row is updated and the old `content_hash` is lost. If we need an immutable history of every regeneration, we add a `csr_section_versions` table later — held back for v1.

7. **Where does AI cost accountability live?** Per-section `token_cost` and `model`. Aggregate to job level by summing. Lets the team set per-job budget alerts at the application layer without a separate cost table.

---

## What gets reviewed before fire

- [ ] The two `CREATE TABLE` statements above (column types, FKs, ON DELETE rules)
- [ ] The three index choices on `csr_build_jobs` (none more, none fewer)
- [ ] The two index choices on `csr_section_outputs`
- [ ] The `CHECK` constraint on `status` covers all states the runner can produce
- [ ] The denormalization of `organization_id` onto `csr_section_outputs` is the right call
- [ ] The `setImmediate` v1 worker is acceptable (no external queue this phase)
- [ ] No new routes in Phase 3 (route surface is Phase 3b)

Sign-off: green-light, or notes attached. The Phase 3 workflow will only fire after the schema is approved.
