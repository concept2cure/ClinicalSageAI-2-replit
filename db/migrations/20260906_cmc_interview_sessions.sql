-- =============================================================================
--
-- AMENDED IN PLACE 2026-09-07 (CLAUDE.md Rule 1 — the set re-runs every deploy,
-- so the creating file is amended, never followed by an ALTER): the status
-- CHECK gains 'committing'. A commit moves the session complete → committing
-- before its first register write and back to complete (partial) or on to
-- committed (all landed); two concurrent commits of one session used to both
-- write every register row because nothing held the session while one ran.
-- The constraint below is dropped and re-added under its name so a database
-- that already carries the four-value CHECK picks up the fifth on replay.
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Give the guided CMC interview (AnA intelligence flow) a durable,
--          tenant-scoped home for its state, so a dropped session does not
--          lose every answer and a completed one can be committed to the CMC
--          registers that feed Module 3.
--
-- eCTD/CTD Context:
--   - Module(s): Module 3 — the interview captures 3.2.S.1–3.2.S.7 and
--     3.2.P.1–3.2.P.8 content that is then projected onto the registers
--   - Integrity Risk Addressed: the interview's FlowState lived ONLY in the
--     AnA tool arguments, round-tripped through the model on every turn; a
--     dropped turn lost the whole interview, and on completion the answers
--     went nowhere (docs/audits/CMC_CAPTURE_ANALYSIS_M3_EVALUATION_2026-08-31.md
--     item 5, "Persist the guided flow")
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - public schema, organization_id INTEGER NOT NULL: both tenant sweeps are
--     public+integer, so the isolation sweep that closes C2C_MIGRATION_FILES
--     policies this table (CLAUDE.md RULE 1, corollary 2).
--   - Additive and idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF
--     NOT EXISTS). Nothing is dropped or renamed.
--   - Purged with the tenant: listed in PURGE_CHILD_TABLES
--     (server/services/tenant/tenant-offboarding.ts). The rows are the
--     tenant's own CMC answers.
-- =============================================================================

-- One row per interview session.
--
--   state                 the engine's FlowState (answers, issues, progress),
--                         written after every step — the durable copy the
--                         tool surface loads by session id instead of asking
--                         the model to round-trip it
--   status                active    → being answered
--                         complete  → the flow reached its terminal node
--                         committed → the answers were projected onto the
--                                     CMC registers; committed_record_refs
--                                     names every record written
--                         abandoned → closed without completion
--   committed_record_refs [{ key, register, id, module3Linked, ... }] — the
--                         register records this session produced. Written on
--                         a PARTIAL commit too (status stays 'complete'), so a
--                         failed commit reports what it did write rather than
--                         hiding it, and a retry skips what already landed.
--   project_id            TEXT, like every register in this family: the v2
--                         shell passes the regulatory_programs uuid, legacy
--                         callers the numeric projects.id as a string.
CREATE TABLE IF NOT EXISTS cmc_interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id),
  project_id text,
  user_id integer REFERENCES users(id),
  flow_id text NOT NULL,
  flow_category text NOT NULL,
  state jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active',
  committed_record_refs jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cmc_interview_sessions_status_chk
    CHECK (status IN ('active', 'complete', 'committing', 'committed', 'abandoned'))
);

-- Tenant-scoped access paths: every read is "this org's session by id", and
-- the listings are "this org's sessions for a project" / "by status".
CREATE INDEX IF NOT EXISTS idx_cmc_interview_sessions_org
  ON cmc_interview_sessions (organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_interview_sessions_org_project
  ON cmc_interview_sessions (organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_cmc_interview_sessions_org_status
  ON cmc_interview_sessions (organization_id, status);

-- Replay: a database created by an earlier run of this file holds the
-- four-value CHECK under the same constraint name; re-add it with 'committing'.
ALTER TABLE cmc_interview_sessions DROP CONSTRAINT IF EXISTS cmc_interview_sessions_status_chk;
ALTER TABLE cmc_interview_sessions ADD CONSTRAINT cmc_interview_sessions_status_chk
  CHECK (status IN ('active', 'complete', 'committing', 'committed', 'abandoned'));
