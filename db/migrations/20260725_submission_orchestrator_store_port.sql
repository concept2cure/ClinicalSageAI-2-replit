-- ============================================================================
-- PORT (ledger C-19): the submission orchestrator store, moved into the
-- canonical lineage so it actually exists.
-- ============================================================================
--
-- submission_orchestrator_runs / _steps / _dependencies are created ONLY by
-- migrations/0018_submission_orchestrator.sql, and their later columns only by
-- migrations/20260629_orchestrator_{tenant_scope,submission_id_fk,awaiting_async_status}.sql
-- — all four in the ROOT lineage. That lineage is not journaled (drizzle's
-- runtime migrate applies only the 0000 baseline), none of the four is in the
-- allowlist of scripts/db/apply-c2c-migrations.mjs, and none is in
-- db/migrations/migrations_manifest.json. Nothing in the repository applies them.
--
-- They exist on exactly one path: `drizzle-kit push`, because shared/schema.ts
-- re-exports shared/schema/submissions.ts which mirrors these tables.
--
-- Consequence on any migration-provisioned environment: getRun() SELECTs
-- run_id, …, submission_id_fk FROM submission_orchestrator_runs, the relation
-- does not exist, the query throws, and getRun's catch returns null. Every
-- caller then reports "run not found" — so
-- POST /api/submissions/:submissionId/sign-release returns 404 rather than an
-- error, and the whole submission orchestrator looks empty rather than
-- unprovisioned. The failure mode is quieter than C-17's 500 and harder to
-- diagnose for exactly that reason.
--
-- This ALSO repairs an ordering defect in the C-17 port
-- (20260725_esig_gate_columns_port.sql): that file ALTERs
-- submission_orchestrator_runs to widen its status CHECK, which presumes the
-- table exists. On the migration path it did not. This port is ordered BEFORE it
-- in migrations_manifest.json's executionOrder so the chain is coherent.
--
-- VERBATIM port of all four files, concatenated in their original dependency
-- order. Every statement is idempotent (CREATE TABLE/INDEX IF NOT EXISTS,
-- ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS), so applying it where the
-- push path already created the tables is a no-op. The root-lineage originals
-- are left in place as the historical record.
--
-- Rollback:
--   DROP TABLE IF EXISTS submission_orchestrator_dependencies;
--   DROP TABLE IF EXISTS submission_orchestrator_steps;
--   DROP TABLE IF EXISTS submission_orchestrator_runs;
-- ============================================================================


-- ─── PORTED VERBATIM: migrations/0018_submission_orchestrator.sql ─────────────────

-- Migration 0018: Submission-Package Orchestrator audit tables
--
-- The orchestrator coordinates artifact → section → module → ZIP assembly for
-- IND/NDA/BLA/510(k) submissions. These two tables record the per-run state
-- and the per-step audit trail needed for 21 CFR Part 11 traceability.
--
-- Run-level state: one row per orchestration pass (e.g., "build NDA seq 0003").
--   Steps are stored as JSONB to keep per-run lookups single-query while
--   preserving enough structure for filtering on status / step key.
--
-- Step-level audit: append-only event log (start / complete / fail / stale).
--   Each event records input/output hash and output reference so a future
--   run can detect that input changed and mark downstream steps stale.

BEGIN;

CREATE TABLE IF NOT EXISTS submission_orchestrator_runs (
  run_id              UUID PRIMARY KEY,
  submission_id       TEXT NOT NULL,
  application_number  TEXT NOT NULL,
  region              TEXT NOT NULL CHECK (region IN ('US', 'EU', 'JP', 'CA')),
  submission_type     TEXT NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL,
  completed_at        TIMESTAMPTZ,
  status              TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed', 'partial')),
  steps               JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_submission
  ON submission_orchestrator_runs(submission_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_application
  ON submission_orchestrator_runs(application_number, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_status
  ON submission_orchestrator_runs(status)
  WHERE status IN ('running', 'failed', 'partial');

-- Append-only step audit (21 CFR Part 11 traceability)
CREATE TABLE IF NOT EXISTS submission_orchestrator_steps (
  id            BIGSERIAL PRIMARY KEY,
  run_id        UUID NOT NULL REFERENCES submission_orchestrator_runs(run_id) ON DELETE CASCADE,
  step_key      TEXT NOT NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN ('start', 'complete', 'fail', 'stale')),
  status        TEXT NOT NULL,
  input_hash    TEXT NOT NULL,
  output_hash   TEXT,
  output_ref    TEXT,
  error         TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_steps_run
  ON submission_orchestrator_steps(run_id, occurred_at ASC);

CREATE INDEX IF NOT EXISTS idx_orchestrator_steps_key
  ON submission_orchestrator_steps(step_key, occurred_at DESC);

-- Dependency graph (denormalized for query convenience)
CREATE TABLE IF NOT EXISTS submission_orchestrator_dependencies (
  step_key      TEXT NOT NULL,
  depends_on    TEXT NOT NULL,
  PRIMARY KEY (step_key, depends_on)
);

INSERT INTO submission_orchestrator_dependencies (step_key, depends_on) VALUES
  ('m3.appendices',      'm3.compose'),
  ('m3.regional',        'm3.compose'),
  ('m2.3.qos',           'm3.compose'),
  ('m2.3.qos',           'm3.appendices'),
  ('m2.3.qos',           'm3.regional'),
  ('m2.7.clinical',      'csr.tabulate'),
  ('package.assemble',   'm2.3.qos'),
  ('package.assemble',   'm2.4.nonclinical'),
  ('package.assemble',   'm2.7.clinical'),
  ('package.assemble',   'm1.admin'),
  ('package.validate',   'package.assemble')
ON CONFLICT DO NOTHING;

-- updated_at trigger
CREATE OR REPLACE FUNCTION submission_orchestrator_runs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orchestrator_runs_updated_at ON submission_orchestrator_runs;
CREATE TRIGGER trg_orchestrator_runs_updated_at
  BEFORE UPDATE ON submission_orchestrator_runs
  FOR EACH ROW EXECUTE FUNCTION submission_orchestrator_runs_set_updated_at();

COMMIT;


-- ─── PORTED VERBATIM: migrations/20260629_orchestrator_tenant_scope.sql ───────────

-- Migration 20260629: Tenant-scope the Submission-Package Orchestrator (Move 1, P0)
--
-- Companion to: docs/reports/MOVE_1_ORCHESTRATOR_TENANT_SCOPING_DESIGN_2026-06-29.md
-- Companion to: docs/reports/RECONCILIATION_AUDIT_2026-06-29.md (Move 1)
--
-- WHY THIS EXISTS
-- ---------------
-- Migration 0018 created submission_orchestrator_runs / submission_orchestrator_steps
-- WITHOUT an organization_id column. Today, getRun(runId) and getRunAudit(runId)
-- accept the runId only and have no tenant filter. Two organizations running
-- submissions concurrently can hand each other runId values and see each other's
-- submission history. This is a 21 CFR Part 11 / GxP blocker on a live
-- multi-tenant production system.
--
-- PATH CHOSEN: Path B (recommended in the design doc)
-- ---------------------------------------------------
-- Add organization_id as NULLABLE. Do not backfill. Gate new writes at the
-- service layer so every new run carries organization_id. Pre-existing rows
-- with organization_id IS NULL intentionally go DARK to every read path
-- (getRun / getRunAudit / regenerateAffected all filter WHERE organization_id = $).
-- We cannot safely attribute historical rows to a tenant -- submission_id is
-- free-form TEXT with no canonical join back to organizations.id -- so the
-- correct behavior is "don't serve what you can't prove ownership of."
--
-- Path A (NOT NULL with sentinel default 0) was rejected: attributes all
-- historical rows to a non-existent tenant; auditors reject this on inspection.
--
-- Path C (backfill then SET NOT NULL) is deferred: requires a canonical join
-- from submission_id back to organizations.id that does not exist in the
-- current schema. Can be revisited after a data-archaeology pass if needed.
--
-- MIGRATION SAFETY (per "Adversarial verify lenses" in the design doc)
-- --------------------------------------------------------------------
-- Additive only. No DROP. No ALTER on existing columns. No NOT NULL on a
-- column that may have NULL rows. ADD COLUMN uses IF NOT EXISTS (PG 9.6+)
-- and indexes use IF NOT EXISTS so the migration is fully idempotent on
-- re-run (e.g. after a partial failure or a manual hot-fix).
--
-- PREREQUISITE
-- ------------
-- The `organizations` table must exist with an `id INTEGER PRIMARY KEY` /
-- compatible column before this migration runs. It is provisioned by the
-- base schema bootstrap (scripts/db-verify/00_bootstrap_base.sql) and
-- referenced by many earlier migrations (e.g. 0008_critical_fk_delete_policies,
-- 20260604_submission_core_canonical). A fresh box that bypasses the base
-- schema and runs only /migrations will fail here with `relation
-- "organizations" does not exist` — that failure is the correct signal
-- (the box is mis-provisioned) and should not be silently skipped.

BEGIN;
ALTER TABLE submission_orchestrator_runs
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE submission_orchestrator_steps
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS submission_orchestrator_runs_org_idx
  ON submission_orchestrator_runs(organization_id);
CREATE INDEX IF NOT EXISTS submission_orchestrator_runs_org_status_idx
  ON submission_orchestrator_runs(organization_id, status);
CREATE INDEX IF NOT EXISTS submission_orchestrator_steps_org_run_idx
  ON submission_orchestrator_steps(organization_id, run_id);
COMMIT;


-- ─── PORTED VERBATIM: migrations/20260629_orchestrator_submission_id_fk.sql ───────

-- Migration 20260629: Submission ID provenance — submission_id_fk on orchestrator runs/steps
--
-- Companion to: docs/reports/SUBMISSION_ID_PROVENANCE_DESIGN_2026-06-29.md
-- Pattern:      Path-to-GA §C.4 — Move 1 / Phase 3 (schema change on a live
--               multi-tenant table). Same shape as
--               migrations/20260629_orchestrator_tenant_scope.sql.
--
-- WHY THIS EXISTS
-- ---------------
-- submission_orchestrator_runs.submission_id is a free-form TEXT column with
-- no FK back to public.submissions(id). Audit queries, change-impact graph
-- walks, and lifecycle joins all need a canonical FK so orchestrator runs
-- aren't floating UUIDs disconnected from the canonical submission record
-- they belong to. This migration adds a nullable submission_id_fk column
-- alongside the existing TEXT column so:
--   * new writes dual-write both columns (TEXT for backward compat + FK for
--     joinability),
--   * legacy callers that only have the TEXT continue to work,
--   * historical rows that cannot be resolved to a submissions.id row stay
--     with submission_id_fk = NULL until a data-archaeology backfill runs.
--
-- The mirror column is added to submission_orchestrator_steps for the same
-- reason — append-only audit rows benefit from the same joinability without
-- requiring a JOIN through the parent run table.
--
-- PATH CHOSEN: Path B (recommended in the design doc).
--   Path A (DROP TEXT, replace with FK) — REJECTED: destroys audit history
--     for historical rows whose TEXT does not resolve to a submissions.id;
--     21 CFR Part 11 audit history is append-only.
--   Path C (backfill then SET NOT NULL) — DEFERRED: no canonical TEXT→FK
--     mapping rule exists today (no submissions.submission_code TEXT UNIQUE
--     business key). Backfill is a per-tenant data-archaeology workflow run
--     after this migration; the NOT NULL constraint can only follow.
--
-- FK TARGET
-- ---------
-- public.submissions(id) — the canonical region-agnostic lifecycle core
-- created by migrations/20260604_submission_core_canonical.sql:23 and
-- mirrored in shared/schema/submissions.ts:35. NOT ind_submissions(id)
-- (that table's submission_id is itself a TEXT column and would push the
-- same provenance problem one level down). See the design doc Appendix
-- "Step 1 finding" for the full rationale.
--
-- MIGRATION SAFETY
-- ----------------
-- Additive only. No DROP. No ALTER on existing columns. No NOT NULL on a
-- column that may have NULL rows. ADD COLUMN uses IF NOT EXISTS and
-- indexes use IF NOT EXISTS so the migration is fully idempotent on re-run
-- (same rationale as 20260629_orchestrator_tenant_scope.sql).
--
-- PREREQUISITES
-- -------------
-- 1. public.submissions must exist with id SERIAL PRIMARY KEY. Provisioned
--    by migrations/20260604_submission_core_canonical.sql:23.
-- 2. submission_orchestrator_runs / submission_orchestrator_steps must
--    exist with an organization_id column. Provisioned by
--    migrations/0018_submission_orchestrator.sql and the tenant-scope
--    column added by migrations/20260629_orchestrator_tenant_scope.sql.
-- A fresh box that bypasses either prerequisite will fail here with a
-- relation-does-not-exist error — that failure is the correct signal (the
-- box is mis-provisioned) and should not be silently skipped.

BEGIN;

-- ── submission_orchestrator_runs ────────────────────────────────────────────
ALTER TABLE submission_orchestrator_runs
  ADD COLUMN IF NOT EXISTS submission_id_fk INTEGER REFERENCES submissions(id);

-- FK lookups: "which orchestrator runs target submission id=42?"
CREATE INDEX IF NOT EXISTS submission_orchestrator_runs_submission_fk_idx
  ON submission_orchestrator_runs(submission_id_fk);

-- Composite for the common tenant-scoped lineage query
-- "show all runs for submission id=42 owned by org id=7":
CREATE INDEX IF NOT EXISTS submission_orchestrator_runs_org_submission_fk_idx
  ON submission_orchestrator_runs(organization_id, submission_id_fk);

-- ── submission_orchestrator_steps ───────────────────────────────────────────
-- Mirror the FK onto the append-only audit table so per-step queries can
-- filter / join by submission lineage without traversing the parent runs row.
ALTER TABLE submission_orchestrator_steps
  ADD COLUMN IF NOT EXISTS submission_id_fk INTEGER REFERENCES submissions(id);

CREATE INDEX IF NOT EXISTS submission_orchestrator_steps_submission_fk_idx
  ON submission_orchestrator_steps(submission_id_fk);

CREATE INDEX IF NOT EXISTS submission_orchestrator_steps_org_submission_fk_idx
  ON submission_orchestrator_steps(organization_id, submission_id_fk);

COMMIT;


-- ─── PORTED VERBATIM: migrations/20260629_orchestrator_awaiting_async_status.sql ──

-- ============================================================================
-- Reconciliation Move 6 — allow `awaiting-async` on submission_orchestrator_runs.status
-- ============================================================================
-- Date: 2026-06-29
-- Audit: docs/reports/RECONCILIATION_AUDIT_2026-06-29.md (Move 6)
--
-- Move 6 wires csr-job-runner (async ICH-E3 §1-§9/§13-§16 AI narrative
-- drafting) into the orchestrator as a new `csr.draft-narrative` step. That
-- step kicks off a long-running CSR build job (minutes) and returns the
-- orchestrator run to the caller in a NEW intermediate run state:
--
--   running       -> in progress, still doing synchronous work
--   awaiting-async-> kicked off external async work, waiting for completion;
--                    caller polls and resumes via runOrchestrator(_, {resumeRunId})
--   complete      -> all steps complete
--   failed        -> a hard error
--   partial       -> some steps complete, some failed
--
-- Migration 0018 created submission_orchestrator_runs with
--   CHECK (status IN ('running', 'complete', 'failed', 'partial'))
-- which would reject an awaiting-async row at persist time (caught by the
-- service-layer try/catch as a schema-shape error and re-thrown, surfacing as
-- a 500 to the route). This migration replaces the CHECK with one that
-- includes `awaiting-async` so the orchestrator can persist the intermediate
-- state cleanly.
--
-- NOTE: submission_orchestrator_steps.status is `TEXT NOT NULL` with NO
-- CHECK constraint (see 0018 line 47), so the new StepStatus value
-- `awaiting-async` does not require any schema change there. Only the
-- run-level status enum needs widening.
--
-- Forward-only. Does NOT modify migration 0018.
-- ============================================================================

BEGIN;

ALTER TABLE submission_orchestrator_runs
  DROP CONSTRAINT IF EXISTS submission_orchestrator_runs_status_check;

ALTER TABLE submission_orchestrator_runs
  ADD CONSTRAINT submission_orchestrator_runs_status_check
  CHECK (status IN ('running', 'awaiting-async', 'complete', 'failed', 'partial'));

COMMIT;

