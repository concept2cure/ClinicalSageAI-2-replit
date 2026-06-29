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
