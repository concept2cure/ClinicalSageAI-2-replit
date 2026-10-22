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
--   - Consequence of that idempotence, worth knowing before editing this file:
--     because the whole set re-executes on every deploy, CREATE TABLE IF NOT
--     EXISTS is a NO-OP on any database that already has the table. Adding a
--     column by editing the CREATE TABLE above would therefore take effect only
--     on a fresh database and silently never on a provisioned one. A later
--     column goes in as its own ADD COLUMN IF NOT EXISTS statement in this
--     file, below the CREATE TABLE, with a dated note saying what and why
--     (CLAUDE.md RULE 1).
--   - Purged with the tenant: listed in PURGE_CHILD_TABLES
--     (server/services/tenant/tenant-offboarding.ts). The rows are the
--     tenant's own control decisions.
--
-- AMENDMENT 2026-09-18 (in place, per CLAUDE.md RULE 1 — this file re-executes
-- on every deploy, so a correction is an edit here, never an appended DROP or
-- an ALTER in a later file):
--   idx_ana_runs_live was first written as (owner_instance, heartbeat_at). The
--   reaper it exists for does not filter on owner_instance and must not — the
--   runs that most need reaping belong to an instance that is gone, and a dead
--   process cannot sweep its own rows — so the leading column had to be the one
--   the predicate ranges over. Changed to (heartbeat_at).
--
--   Caveat, and the reason this note exists rather than a silent edit: the
--   statement is CREATE INDEX IF NOT EXISTS under an unchanged NAME, so any
--   database that already applied the first version keeps the OLD index and
--   never gets this one. No deployed database has applied this file (it is
--   introduced and amended in the same unreleased change), so there is nothing
--   to correct today. Should that ever stop being true, the fix is a new index
--   name here — not a DROP, and not an edit that cannot reach the databases it
--   is meant for.
--
-- AMENDMENT 2026-10-08 (in place, per CLAUDE.md RULE 1; AnA detach slice DT1,
-- docs/design/ANA_DETACH_2026-10-08.md §3.1, evidence
-- docs/evidence/ANA-SUMMARY/2026-10-08/DT1-run-events/):
--   Six columns, each its own ADD COLUMN IF NOT EXISTS at the end of this file
--   (see the note above on why a column never goes into the CREATE TABLE):
--     timeline_seq     the run's timeline high-water mark, written by the
--                      owner's heartbeat and by the mirror's close
--     user_message_id  the question this run answers (chat_messages.id, an
--                      INTEGER as ana_turn_records.user_message_id is)
--     run_policy       'manual' | 'auto' | NULL, written at insert
--     hold             { reason, next } while a Manual hold or a person's
--                      pause is open (written from slice DT3)
--     last_watched_at  the asker's last watching poll (written from DT3)
--     released_at      when the owner finished trying to record the turn
--   Additive; nothing is dropped, renamed or narrowed, and no CHECK is added
--   (an ADD CONSTRAINT would re-validate every row on every deploy).
--   Companion table: migrations/20261008f_ana_run_events.sql.
--
-- AMENDMENT 2026-10-08, second (in place, per CLAUDE.md RULE 1; AnA detach
-- slice DT3, docs/design/ANA_DETACH_2026-10-08.md §2.1, §2.6, evidence
-- docs/evidence/ANA-SUMMARY/2026-10-08/DT3-detach/):
--   One column, its own ADD COLUMN IF NOT EXISTS at the end of this file:
--     detached_at  when the page that started the turn closed and the turn
--                  went on, written once by the owner. With last_watched_at
--                  and created_at it says when an unwatched turn stops
--                  (shared/ana/run-detach.ts unattendedDeadline), the same
--                  instant for the owner's clock and a follower's "stops by".
--   Additive and nullable; nothing is dropped, renamed or narrowed.
--   The DT1 note's "written from slice DT3" for hold and last_watched_at is
--   now true: holdForPerson and the hold's announcement write hold, and the
--   asker's visible poll stamps last_watched_at (server/routes/ana-ri/runs.ts).
--   stopped_reason gains values with no schema change (it has no CHECK):
--   unattended_limit, session_ended, server_shutdown, admin_cancelled.
--
-- AMENDMENT 2026-10-22 (in place, per CLAUDE.md RULE 1; the three independent
-- reviews of the uncommitted DT3 change, findings IAM-34, the cross-device
-- sign-out line and the session-end cause; evidence
-- docs/evidence/ANA-SUMMARY/2026-10-08/DT3-detach/, "Review findings"):
--   Two columns, each its own ADD COLUMN IF NOT EXISTS at the end of this file:
--     started_session_id  the `sid` of the session whose request started the
--                         run (services/session-inactivity.ts; kept through
--                         every refresh and rotation). A sign-out ends that one
--                         session, so it stops only the runs that session
--                         started: a turn running on the person's phone is not
--                         stopped by a sign-out on their desktop, and "the
--                         session that started this turn ended" stays true.
--                         Null for a run begun before this column, or by a
--                         token with no sid; such a run is stopped by its own
--                         round-boundary standing check.
--     stopped_detail      jsonb, for a `session_ended` stop only: what ended
--                         the session or the organisation ({cause, byUserId}:
--                         sign_out, password_change, deprovisioned,
--                         member_removed, org_suspended, purge, …) and who did
--                         it, so the record can say which act stopped the turn.
--                         Written by run-control.ts stopRunsFor; never a control
--                         event, because nobody decided to stop AnA.
--   Additive and nullable; nothing is dropped, renamed or narrowed.
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

-- AMENDMENT 2026-10-08 (DT1): see the header. Each column nullable or
-- defaulted, so the ADD is instant and every existing row stays valid.
ALTER TABLE ana_runs ADD COLUMN IF NOT EXISTS timeline_seq integer NOT NULL DEFAULT 0;
ALTER TABLE ana_runs ADD COLUMN IF NOT EXISTS user_message_id integer;
ALTER TABLE ana_runs ADD COLUMN IF NOT EXISTS run_policy text;
ALTER TABLE ana_runs ADD COLUMN IF NOT EXISTS hold jsonb;
ALTER TABLE ana_runs ADD COLUMN IF NOT EXISTS last_watched_at timestamptz;
ALTER TABLE ana_runs ADD COLUMN IF NOT EXISTS released_at timestamptz;

-- AMENDMENT 2026-10-08, second (DT3): see the header.
ALTER TABLE ana_runs ADD COLUMN IF NOT EXISTS detached_at timestamptz;

-- AMENDMENT 2026-10-22 (DT3 review): see the header.
ALTER TABLE ana_runs ADD COLUMN IF NOT EXISTS started_session_id text;
ALTER TABLE ana_runs ADD COLUMN IF NOT EXISTS stopped_detail jsonb;
