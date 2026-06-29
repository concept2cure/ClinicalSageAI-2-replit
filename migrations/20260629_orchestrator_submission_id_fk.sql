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
