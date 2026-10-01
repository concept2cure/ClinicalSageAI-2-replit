-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — scheduled jobs run once per window across tasks
-- Compliance: ALCOA+ (one disposition, one audit row, one notice per event)
-- Purpose: Production runs two API tasks and a worker from one image, and
--          every in-process scheduler starts on each. runScheduledOnce
--          (server/db/scheduledOnce.ts) is a Postgres advisory lease: it stops
--          two runs OVERLAPPING, not the same window running again on the
--          process whose timer fires a moment (or, for boot-relative
--          setInterval timers, minutes) later. So a nightly retention run
--          could archive and write Part 11 audit rows three times, the hourly
--          sentinel notified each org's users three times, and the nightly
--          external-intelligence sweep called FDA/EMA/MHRA/TGA/NCBI three
--          times. One row here per (organization, job, window) is the durable
--          claim: the INSERT that wins runs the job; the others skip.
--          Audit docs/evidence/W2/2026-09-24-multi-task/ (U19).
--
-- Determinism Contract:
--   - New table + index only, all IF NOT EXISTS; no existing object touched.
--     No DROP (CLAUDE.md Rule 1: this file re-runs on every deploy).
--   - organization_id INTEGER NOT NULL, in public, so the tenant-isolation
--     sweep (last in C2C_MIGRATION_FILES) attaches tenant_isolation_policy.
--     Estate-wide jobs claim as organization 0 under the audited system scope
--     (role app_super_admin, which the policy admits); per-org jobs claim as
--     their organization. No tenant scope sees another's claims.
--   - The service prunes a job's claims older than 30 days when it claims.
-- =============================================================================

CREATE TABLE IF NOT EXISTS scheduled_job_claims (
  organization_id  INTEGER NOT NULL,
  job_name         TEXT NOT NULL,
  window_key       TEXT NOT NULL,
  claimed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  PRIMARY KEY (organization_id, job_name, window_key)
);

CREATE INDEX IF NOT EXISTS scheduled_job_claims_job_claimed_idx
  ON scheduled_job_claims (job_name, claimed_at);

COMMENT ON TABLE scheduled_job_claims IS
  'One row per (organization, scheduled job, window): the durable claim that makes a job run once per window across every server process (server/db/scheduledOnce.ts, U19).';
