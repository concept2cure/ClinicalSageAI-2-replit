-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — AnA governed actions coordinated across processes
-- Compliance: ALCOA+ (one governed write per target at a time)
-- Purpose: AnA's write actions take a lock on their target, and each
--          organisation has a cap on concurrent actions
--          (server/services/ai-actions/distributed-lock.ts,
--          concurrency-limiter.ts). Both were Redis with an in-memory
--          fallback; production runs no Redis (decision B6, 2026-10-01), so
--          the lock and the cap held per process: two write actions on one
--          document from different API tasks both ran, and the cap was
--          multiplied by the number of tasks. A lease row here is shared by
--          every process. Audit docs/evidence/W2/2026-09-24-multi-task/ (U21).
--
-- Determinism Contract:
--   - New table + index only, all IF NOT EXISTS; no existing object touched.
--     No DROP (CLAUDE.md Rule 1: this file re-runs on every deploy).
--   - organization_id INTEGER NOT NULL is the acting organisation, in public,
--     so the tenant-isolation sweep (last in C2C_MIGRATION_FILES) attaches
--     tenant_isolation_policy; leases are written in that organisation's own
--     scope, and one organisation's lease never contends with another's.
--   - A lease expires on its own (expires_at); a lapsed one is taken over.
-- =============================================================================

CREATE TABLE IF NOT EXISTS coordination_leases (
  organization_id  INTEGER NOT NULL,
  lease_key        TEXT NOT NULL,
  owner            TEXT NOT NULL,
  acquired_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (organization_id, lease_key)
);

CREATE INDEX IF NOT EXISTS coordination_leases_org_expires_idx
  ON coordination_leases (organization_id, expires_at);

COMMENT ON TABLE coordination_leases IS
  'Leases shared by every server process: AnA write-action target locks and per-organisation action slots (server/services/ai-actions, U21). Replaces per-process memory on a deployment without Redis.';
