-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — rate limits counted across server processes
-- Compliance: 21 CFR 11.300(d) (safeguards against attempts at unauthorized use
--             of passwords and identification codes hold for the deployment,
--             not for one task)
-- Purpose: Production runs the API as more than one task, coordinated through
--          Postgres with no Redis (decision B6, 2026-10-01; P-129 holds it for
--          rate limits, 2026-11-12). The sign-in and document limits were
--          counted in each task's memory, so a client got each task's
--          allowance: twice the limit on production's two tasks (MR-03 SEC-08,
--          OPS-20). One row per (bucket, window) here is what every task counts
--          against (server/middleware/redisRateLimiter.ts checkSharedRateLimit,
--          server/middleware/sign-in-limits.ts). Founder decision P-129
--          (docs/LAUNCH_DEFINITION_OF_DONE.md) approves the table.
--
-- Determinism Contract:
--   - New table + index only, all IF NOT EXISTS; no existing object touched.
--     No DROP (CLAUDE.md Rule 1: this file re-runs on every deploy).
--   - organization_id INTEGER NOT NULL, in public, so the tenant-isolation
--     sweep (last in C2C_MIGRATION_FILES) attaches tenant_isolation_policy. A
--     limit belongs to a client address or an account, not to one
--     organisation, so every row is organization 0, read and written only under
--     the audited system scope, as session_activity is; no tenant scope sees
--     any row.
--   - bucket_key is the limiter's own key (its category and the subject it
--     counts: `user:<id>` or a hashed address). No credential is stored.
--   - window_start is the start of the fixed window a hit falls in; a row
--     older than two windows is pruned by the next hit that writes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  organization_id  INTEGER NOT NULL DEFAULT 0,
  bucket_key       TEXT NOT NULL,
  window_start     TIMESTAMPTZ NOT NULL,
  hits             INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limit_counters_window_idx
  ON rate_limit_counters (window_start);

COMMENT ON TABLE rate_limit_counters IS
  'Sign-in and document rate-limit hits per fixed window, shared by every server process (P-129, MR-03 Stage 7). Replaces per-task memory: a client no longer gets each task''s allowance.';
