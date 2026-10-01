-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — AnA Command continuity baseline
-- Compliance: ALCOA+ (a stated trend must be reproducible from recorded data)
-- Purpose: The continuity briefing's "previous snapshot" lived in two
--          module-level Maps (server/services/orchestration/continuity-
--          service.ts). With two API tasks behind a non-sticky ALB, each task
--          held its own baseline per project, so the trajectory verdict and
--          the "what changed / newly ready" lists depended on which task
--          served the previous page view, and every deploy reset them to
--          "stable". This table is the shared, durable snapshot store.
--          Audit docs/evidence/W2/2026-09-24-multi-task/ fix unit U14.
--
-- Determinism Contract:
--   - New table + index only, all IF NOT EXISTS; no existing object touched.
--     No DROP (CLAUDE.md Rule 1: this file re-runs on every deploy).
--   - organization_id is the integer org key, in public, so the tenant-
--     isolation sweep (20260801_tenant_isolation_sweep.sql, last in
--     C2C_MIGRATION_FILES) attaches tenant_isolation_policy on its next run.
--   - project_id is the integer project spine id. No foreign key: the briefing
--     is advisory history, and a key would add an ordering dependency on the
--     projects creator for no read the service makes.
--   - The service compares against the latest snapshot at least 24 h old,
--     records at most one snapshot per project per hour, and prunes rows older
--     than the current baseline (they can never be a baseline again).
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_continuity_snapshots (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  INTEGER NOT NULL,
  project_id       INTEGER NOT NULL,
  readiness_score  DOUBLE PRECISION NOT NULL,
  snapshot         JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_continuity_snapshots_org_project_created_idx
  ON project_continuity_snapshots (organization_id, project_id, created_at DESC);

COMMENT ON TABLE project_continuity_snapshots IS
  'AnA Command continuity snapshots per project, shared across API tasks. The trajectory verdict compares against the latest row at least 24 h old. Replaces the process-local snapshot Maps (U14).';
