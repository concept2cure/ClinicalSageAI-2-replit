-- ============================================================================
-- Phase 3 — CSR Job-State Schema
-- ============================================================================
-- Date: 2026-06-28
-- Design doc: docs/reports/CSR_JOB_STATE_SCHEMA_DESIGN_2026-06-28.md
--
-- Adds two tables that wrap server/services/csr-builder.ts in durable
-- job state so launchCSRBuild can run asynchronously and survive a
-- worker restart, and so partial section work is not lost on a
-- section-level error.
--
-- This is a PURE ADDITIVE migration:
--   * No DROP TABLE
--   * No ALTER on existing tables
--   * No CASCADE on references to existing tables
--   * Rollback is the inverse DROP TABLE (only safe before rows are written)
--
-- AMENDED IN PLACE 2026-10-29 (D2, CSR end to end, slice 3 of
-- docs/design/CSR_END_TO_END_2026-10-29.md; RULE 1 of CLAUDE.md):
--   * The file was on no deploy applier (it sat in
--     scripts/ci/migration-deploy-path-baseline.json). It is now on
--     C2C_MIGRATION_FILES, above the final isolation pair, so it re-runs on
--     every deploy. Every CREATE is therefore IF NOT EXISTS and every
--     constraint is added only when absent: a database where the tables were
--     pushed from shared/schema.ts keeps its rows and gains the columns below.
--   * csr_build_jobs.source_run_id: the retained Submission Center run whose
--     engine tables ground the build. A STORED generated column over
--     study_info_snapshot->'evidenceSource'->>'runId', which the job runner
--     already writes at enqueue, so the two can never disagree. NULL for a
--     build with no bound run (metadata-only, never a results draft).
--   * csr_section_outputs review state, per section: review_status
--     ('draft' | 'in_review' | 'approved', default 'draft'), reviewer_id (the
--     user who made the last review decision), review_decided_at,
--     review_reason (a send-back's stated reason) and reviewed_content_hash
--     (the content_hash the decision was made on: an approval binds that exact
--     text, and a redraft that changes content_hash leaves the approval
--     stale, which server/services/csr/csr-section-review.ts reports as a
--     draft). Written only by csr-section-review.ts.
--   Nothing is dropped; no file in the set re-creates or removes these.
--
-- AMENDED IN PLACE 2026-10-29 (D2, CSR end to end, slice 7 of
-- docs/design/CSR_END_TO_END_2026-10-29.md; RULE 1 of CLAUDE.md):
--   * Table 3, csr_narrative_outputs: one row per subject the E3 §12.3.2 rule
--     selects for a patient safety narrative in a CSR build
--     (server/services/csr/csr-narrative-job.ts, its only writer). Each composed
--     narrative carries its SHA-256 and the digest of the ADaM facts it was
--     composed from, so a resumed build skips exactly the subjects whose
--     verified narrative still matches its facts and preserves a damaged row
--     rather than overwriting it. A refused subject is recorded with its
--     reason and no text. Public, organization_id INTEGER NOT NULL, so the
--     final tenant sweep polices it. CREATE ... IF NOT EXISTS only, with its
--     constraints inside the CREATE; nothing is dropped and no other file in
--     the set creates or removes it.
--
-- AMENDED IN PLACE 2026-10-30 (D2, CSR end to end, reach of slice 8:
-- docs/evidence/D2-CSR/2026-10-30-assembly-reach/; RULE 1 of CLAUDE.md):
--   * Table 4, csr_assembly_runs: one row per assembly of a CSR build into
--     its eCTD leaves (server/services/csr/csr-assembly-run.ts, its only
--     writer). The assembly runs off the request thread, like the build it
--     assembles; the row carries its status, progress and stage, the
--     appendices the user declared not applicable (each with its reason, who
--     and when), the Vault documents supplied for 16.1.x / 16.3 by exact
--     digest, the result (each leaf with page count, SHA-256 and the
--     rendered_leaf_files row that retains its bytes; every missing appendix
--     and whether it blocks), and the placement into a sequence. A partial
--     unique index allows one queued or running assembly per build. Public,
--     organization_id INTEGER NOT NULL, so the final tenant sweep polices it.
--     CREATE ... IF NOT EXISTS only, with its constraints inside the CREATE;
--     nothing is dropped and no other file in the set creates or removes it.
--
-- AMENDED IN PLACE 2026-10-30 (D2, CSR end to end, the narrative build off
-- the request path: docs/evidence/D2-CSR/2026-10-30-narrative-queue/; RULE 1
-- of CLAUDE.md):
--   * Table 5, csr_narrative_runs: one row per request to build a CSR's
--     patient safety narratives (server/services/csr/csr-narrative-run.ts, its
--     only writer). The build runs off the request thread on the CSR build's
--     own queue pattern (a durable row, a worker started with setImmediate,
--     claimed by a conditional UPDATE); the row carries its status (queued,
--     running, complete, incomplete, failed, cancelled), subjects done of
--     total, the attempt that holds it, and the outcome or the refusal by
--     code. A run whose worker stopped (a restart) is taken over by the next
--     request and resumes per subject from csr_narrative_outputs. A partial
--     unique index allows one queued or running build per CSR build. Public,
--     organization_id INTEGER NOT NULL, so the final tenant sweep polices it.
--     CREATE ... IF NOT EXISTS only, with its constraints inside the CREATE;
--     nothing is dropped and no other file in the set creates or removes it.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Table 1: csr_build_jobs
-- ----------------------------------------------------------------------------
-- The job header. One row per CSR build request, with state transitions
-- tracked here. project_id is nullable with ON DELETE SET NULL so the
-- audit trail survives a project archive. status is a CHECK constraint
-- (not an enum) so it can be loosened with a single ALTER TABLE.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS csr_build_jobs (
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
CREATE INDEX IF NOT EXISTS csr_build_jobs_org_project_idx
  ON csr_build_jobs (organization_id, project_id);

-- Partial index for the worker poll path — only "live" rows matter
CREATE INDEX IF NOT EXISTS csr_build_jobs_status_idx
  ON csr_build_jobs (status)
  WHERE status IN ('queued', 'loading_data', 'drafting', 'tabulating', 'cross_linking');

-- Org+study lookup for "show me the latest CSR for this study"
CREATE INDEX IF NOT EXISTS csr_build_jobs_org_study_idx
  ON csr_build_jobs (organization_id, study_id);

-- ----------------------------------------------------------------------------
-- Table 2: csr_section_outputs
-- ----------------------------------------------------------------------------
-- One row per generated section. Persisted incrementally so a
-- section-level failure leaves prior work intact. organization_id is
-- denormalized from the job for cheap org-scoped reads. ON DELETE
-- CASCADE on job_id because a section output has no value without its
-- parent job (the inverse of the job's project_id rule).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS csr_section_outputs (
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
  -- Constraint name matches the Drizzle definition
  -- (shared/schema.ts csrSectionOutputsJobSectionUnique) so drizzle-kit
  -- introspection doesn't flag a name drift on future diffs.
  CONSTRAINT csr_section_outputs_job_section_unique UNIQUE (job_id, section_number)
);

CREATE INDEX IF NOT EXISTS csr_section_outputs_org_project_idx
  ON csr_section_outputs (organization_id, project_id);

CREATE INDEX IF NOT EXISTS csr_section_outputs_job_idx
  ON csr_section_outputs (job_id);

-- ----------------------------------------------------------------------------
-- updated_at trigger on csr_build_jobs
-- ----------------------------------------------------------------------------
-- Uses the shared `set_updated_at()` helper installed by an earlier
-- migration (referenced by migrations/20260520_pdev_workflow_activities.sql).
-- Guard the create so this migration is safe to re-run and is a no-op
-- if the helper is not present in this environment.
--
-- csr_section_outputs has no updated_at (it is write-once-or-upsert via
-- ON CONFLICT, not a row that mutates field-by-field), so it does not
-- get a trigger.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'csr_build_jobs_set_updated_at'
    ) THEN
        EXECUTE 'CREATE TRIGGER csr_build_jobs_set_updated_at
                 BEFORE UPDATE ON csr_build_jobs
                 FOR EACH ROW
                 EXECUTE FUNCTION set_updated_at()';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2026-10-29 amendment: bound source run and per-section review state
-- ----------------------------------------------------------------------------

ALTER TABLE csr_build_jobs
  ADD COLUMN IF NOT EXISTS source_run_id text
    GENERATED ALWAYS AS ((study_info_snapshot -> 'evidenceSource' ->> 'runId')) STORED;

CREATE INDEX IF NOT EXISTS csr_build_jobs_org_source_run_idx
  ON csr_build_jobs (organization_id, source_run_id)
  WHERE source_run_id IS NOT NULL;

ALTER TABLE csr_section_outputs
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS reviewer_id integer REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_content_hash text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'csr_section_outputs_review_status_check'
      AND conrelid = 'csr_section_outputs'::regclass
  ) THEN
    ALTER TABLE csr_section_outputs
      ADD CONSTRAINT csr_section_outputs_review_status_check
      CHECK (review_status IN ('draft', 'in_review', 'approved'));
  END IF;
  -- A decision is recorded with when it was made and on which text; an
  -- approval without them is not an approval.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'csr_section_outputs_review_decision_check'
      AND conrelid = 'csr_section_outputs'::regclass
  ) THEN
    ALTER TABLE csr_section_outputs
      ADD CONSTRAINT csr_section_outputs_review_decision_check
      CHECK (review_status = 'draft' AND review_decided_at IS NULL
             OR review_decided_at IS NOT NULL AND reviewed_content_hash IS NOT NULL);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Table 3 (2026-10-29 amendment, slice 7): csr_narrative_outputs
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS csr_narrative_outputs (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  job_id            integer NOT NULL REFERENCES csr_build_jobs(id) ON DELETE CASCADE,
  -- ADSL USUBJID, and the subject's place in treatment-group and subject order
  subject_id        text NOT NULL,
  sequence          integer NOT NULL CHECK (sequence >= 0),
  status            text NOT NULL CHECK (status IN ('composed', 'refused')),
  content           text,
  content_hash      text,                   -- SHA-256 lowercase hex of content
  facts_digest      text NOT NULL,          -- SHA-256 of the ADaM facts composed from
  qc                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now(),
  CONSTRAINT csr_narrative_outputs_job_subject_unique UNIQUE (job_id, subject_id),
  CONSTRAINT csr_narrative_outputs_content_check
    CHECK (status = 'composed' AND content IS NOT NULL AND content_hash IS NOT NULL
           OR status = 'refused' AND content IS NULL AND content_hash IS NULL)
);

CREATE INDEX IF NOT EXISTS csr_narrative_outputs_org_job_idx
  ON csr_narrative_outputs (organization_id, job_id, sequence);

-- ----------------------------------------------------------------------------
-- Table 4 (2026-10-30 amendment, assembly reach): csr_assembly_runs
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS csr_assembly_runs (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  job_id            integer NOT NULL REFERENCES csr_build_jobs(id) ON DELETE CASCADE,
  requested_by      integer REFERENCES users(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'assembling', 'assembled', 'failed')),
  progress          integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  stage             text,
  -- { "16.2.3": { "reason": "...", "declaredBy": 5, "declaredAt": "..." } }
  not_applicable    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { "16.1.1": { "documentId": "<vault uuid>", "sha256": "<hex>" } }
  supplied          jsonb NOT NULL DEFAULT '{}'::jsonb,
  result            jsonb,
  error             jsonb,
  placement         jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  completed_at      timestamptz,
  CONSTRAINT csr_assembly_runs_outcome_check
    CHECK (status <> 'assembled' OR result IS NOT NULL),
  CONSTRAINT csr_assembly_runs_failure_check
    CHECK (status <> 'failed' OR error IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS csr_assembly_runs_org_job_idx
  ON csr_assembly_runs (organization_id, job_id, id);

-- One queued or running assembly per build.
CREATE UNIQUE INDEX IF NOT EXISTS csr_assembly_runs_one_active_idx
  ON csr_assembly_runs (job_id) WHERE status IN ('queued', 'assembling');

-- ----------------------------------------------------------------------------
-- Table 5 (2026-10-30 amendment, narrative build off the request path): csr_narrative_runs
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS csr_narrative_runs (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  job_id            integer NOT NULL REFERENCES csr_build_jobs(id) ON DELETE CASCADE,
  requested_by      integer REFERENCES users(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'complete', 'incomplete', 'failed', 'cancelled')),
  subjects_done     integer NOT NULL DEFAULT 0 CHECK (subjects_done >= 0),
  subjects_total    integer CHECK (subjects_total IS NULL OR subjects_total >= 0),
  -- Incremented by each claim; a worker writes only while it holds the latest attempt.
  attempt           integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  result            jsonb,
  error             jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  completed_at      timestamptz,
  CONSTRAINT csr_narrative_runs_outcome_check
    CHECK (status NOT IN ('complete', 'incomplete') OR result IS NOT NULL),
  CONSTRAINT csr_narrative_runs_failure_check
    CHECK (status <> 'failed' OR error IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS csr_narrative_runs_org_job_idx
  ON csr_narrative_runs (organization_id, job_id, id);

-- One queued or running narrative build per CSR build.
CREATE UNIQUE INDEX IF NOT EXISTS csr_narrative_runs_one_active_idx
  ON csr_narrative_runs (job_id) WHERE status IN ('queued', 'running');

COMMIT;
