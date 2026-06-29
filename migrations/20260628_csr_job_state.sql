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

-- ----------------------------------------------------------------------------
-- Table 2: csr_section_outputs
-- ----------------------------------------------------------------------------
-- One row per generated section. Persisted incrementally so a
-- section-level failure leaves prior work intact. organization_id is
-- denormalized from the job for cheap org-scoped reads. ON DELETE
-- CASCADE on job_id because a section output has no value without its
-- parent job (the inverse of the job's project_id rule).
-- ----------------------------------------------------------------------------

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
  -- Constraint name matches the Drizzle definition
  -- (shared/schema.ts csrSectionOutputsJobSectionUnique) so drizzle-kit
  -- introspection doesn't flag a name drift on future diffs.
  CONSTRAINT csr_section_outputs_job_section_unique UNIQUE (job_id, section_number)
);

CREATE INDEX csr_section_outputs_org_project_idx
  ON csr_section_outputs (organization_id, project_id);

CREATE INDEX csr_section_outputs_job_idx
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

COMMIT;
