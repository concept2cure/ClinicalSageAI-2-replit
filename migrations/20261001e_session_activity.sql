-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — sign-in sessions shared across server processes
-- Compliance: 21 CFR 11.10(d), Annex 11 §12 (inactivity logoff and the
--             concurrent-session limit hold for the session, not for a task)
-- Purpose: Production runs two API tasks and a worker with no Redis (decision
--          B6, 2026-10-01: Postgres is the coordination store). The
--          inactivity logoff kept each session's last activity, the
--          account's session registry and the "superseded" markers in each
--          process's memory, and a process that had not seen a session
--          measured it from its token's issue — in practice the sign-in. So
--          every deploy signed out everyone who had signed in more than the
--          idle window ago, mid-work; a session ended by the concurrent-
--          session limit kept working on the other task; and the limit was
--          counted per task. One row per session here is what every process
--          reads. Audit docs/evidence/W2/2026-09-24-multi-task/ (U20).
--
-- Determinism Contract:
--   - New table + indexes only, all IF NOT EXISTS; no existing object touched.
--     No DROP (CLAUDE.md Rule 1: this file re-runs on every deploy).
--   - organization_id INTEGER NOT NULL, in public, so the tenant-isolation
--     sweep (last in C2C_MIGRATION_FILES) attaches tenant_isolation_policy. A
--     session belongs to an account, not to one organisation, so every row is
--     organization 0, read and written only under the audited system scope
--     (role app_super_admin, which the policy admits); no tenant scope sees
--     any row.
--   - session_key is the session's activity key (server/services/session-
--     inactivity.ts sessionKeyOf: `sid:<id>`, or `tok:<sha256>` for a token
--     minted before sessions had ids). No token is stored.
--   - Rows expire with the session's absolute lifetime (12 h) and are pruned
--     at each sign-in.
-- =============================================================================

CREATE TABLE IF NOT EXISTS session_activity (
  organization_id     INTEGER NOT NULL DEFAULT 0,
  session_key         TEXT NOT NULL,
  account             TEXT,
  session_started_at  TIMESTAMPTZ,
  last_seen_at        TIMESTAMPTZ NOT NULL,
  superseded_at       TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (organization_id, session_key)
);

CREATE INDEX IF NOT EXISTS session_activity_account_live_idx
  ON session_activity (account, session_started_at)
  WHERE account IS NOT NULL AND superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS session_activity_expires_idx
  ON session_activity (expires_at);

COMMENT ON TABLE session_activity IS
  'Sign-in session activity, registry and superseded markers, shared by every server process (server/services/session-inactivity.ts, U20). Replaces per-process memory: a deploy no longer signs out every session older than its idle window.';
