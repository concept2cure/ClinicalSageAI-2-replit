-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — AnA run control
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Give a live AnA turn a durable, tenant-scoped control record, so
--          pausing, steering or stopping her survives a process restart and
--          works on a deployment with more than one instance.
--
-- eCTD/CTD Context:
--   - Module(s): none directly. This governs the ASSISTANT that authors into
--     every module, so a human's decision to stop or redirect her is part of
--     the decision lineage the dossier carries.
--   - Integrity Risk Addressed: run control lived in a process-local Map with
--     a 30-minute TTL (server/services/ana/run-control-registry.ts). Control
--     404'd after a restart, and on a second instance without sticky routing
--     it never bound to the right run at all — so "I stopped her" was a claim
--     the platform could not keep, and the human-control events recorded on
--     the turn were held in memory until the turn ended and lost if it did not.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - public schema, organization_id INTEGER NOT NULL: both tenant sweeps are
--     public+integer, so the isolation sweep that closes C2C_MIGRATION_FILES
--     policies this table (CLAUDE.md RULE 1, corollary 2). NOT NULL is
--     deliberate — ana_deep_investigations declares its org nullable and its
--     reader has to match "null org matches null", which is the shape the rule
--     exists to prevent.
--   - Additive and idempotent (CREATE TABLE / INDEX IF NOT EXISTS). Nothing is
--     dropped or renamed.
--   - Purged with the tenant: listed in PURGE_CHILD_TABLES
--     (server/services/tenant/tenant-offboarding.ts). The rows are the
--     tenant's own control decisions.
-- =============================================================================

-- One row per in-flight AnA turn.
--
--   id                    'run_<uuid>' — the shape the SSE stream already
--                         emits to the client as `run_started`.
--   status                running            → generating or running tools
--                         paused             → held at the next round boundary
--                         awaiting_approval  → stopped at a governed tool,
--                                              waiting on a human decision
--                         cancelled          → terminal; the person stopped it
--                         finished           → terminal; the turn completed
--                         failed             → terminal; it errored or was
--                                              orphaned by a restart
--   owner_instance        which process holds the AbortController for this
--                         run. Control can be ACCEPTED anywhere — it is a row
--                         write — but only the owner can actually abort the
--                         work, so it listens and drives its local handle.
--   pending_interjections [{ text, at, byUserId }] — steers accepted but not
--                         yet spliced into a round. Drained atomically.
--   control_events        [{ action, message, round, at, byUserId }] — written
--                         at the MOMENT a control is accepted, not at the end
--                         of the turn, so a crash cannot lose a human decision.
--                         Projected onto chat_messages.metadata.humanControls
--                         when the turn finishes; that projection is what the
--                         lineage dossier reads, and these rows are reaped.
--   stopped_reason        cancelled | client_disconnected | orphaned |
--                         max_rounds | duplicate_thrash | no_more_tools |
--                         approval_denied. A dropped socket is NOT a human
--                         decision and must not be recorded as one.
CREATE TABLE IF NOT EXISTS ana_runs (
  id text PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  user_id integer REFERENCES users(id),
  thread_id text,
  project_id text,
  surface text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  owner_instance text NOT NULL,
  current_round integer NOT NULL DEFAULT 0,
  pending_interjections jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending_approval jsonb,
  approval_decision jsonb,
  control_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  stopped_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT ana_runs_status_chk CHECK (
    status IN ('running','paused','awaiting_approval','cancelled','finished','failed')
  )
);

-- The tenant's recent runs, for an org-scoped read.
CREATE INDEX IF NOT EXISTS idx_ana_runs_org_recent
  ON ana_runs (organization_id, created_at DESC);

-- The reaper's query: live rows whose heartbeat went stale.
--
-- Deliberately NOT keyed on owner_instance. The runs that most need reaping
-- belong to an instance that is gone, and a dead process cannot sweep its own
-- rows — so any live instance sweeps all of them and the leading column has to
-- be the one the predicate ranges over.
CREATE INDEX IF NOT EXISTS idx_ana_runs_live
  ON ana_runs (heartbeat_at)
  WHERE status IN ('running','paused','awaiting_approval');

-- Runs belonging to one conversation.
CREATE INDEX IF NOT EXISTS idx_ana_runs_org_thread
  ON ana_runs (organization_id, thread_id);
