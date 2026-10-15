-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — sign-in sessions
-- Compliance: 21 CFR Part 11 §11.300(c) (deauthorize lost or compromised
--             tokens), §11.10(d) (limiting system access to authorized
--             individuals); HIPAA §164.312(a)(2)(iii) (automatic logoff).
-- Purpose: One stamp per account that ends every session the account held
--          before it: a sign-out everywhere, and the account being taken out
--          of use (suspended, deprovisioned).
--
-- eCTD/CTD Context:
--   - Module(s): none directly; identity behind every governed action and
--     signature.
--   - Integrity Risk Addressed: a session the account holder or an
--     administrator meant to end that kept acting.
--
-- Determinism Contract:
--   - One additive column, IF NOT EXISTS; CREATE OR REPLACE FUNCTION; the
--     trigger is this file's own name, dropped IF EXISTS and created again in
--     the same file, so every replay (CLAUDE.md Rule 1) re-arms it. No row is
--     written by the file itself.
--
-- Notes:
--   - Plan P0-4b; security audit 2026-09-24 IAM-04 (b) "no per-user
--     session_version; terminateAllSessions ignored". Row D6, 2026-10-01.
--     Evidence: docs/evidence/D6/2026-10-01-tranche-4/P0-4b/.
-- =============================================================================
--
-- WHAT WAS WRONG (reproduced 2026-10-01 against PostgreSQL 16 as a NOSUPERUSER
-- NOBYPASSRLS runtime role, RLS enforcing; tests/db/session-termination.dbtest.ts):
--   · POST /api/auth/logout with terminateAllSessions: true (the client sends it,
--     client/src/services/portal/authService.tsx logout(true)) revoked the pair it
--     was handed and answered "Tokens invalidated."; every other session of the
--     account, access and refresh, carried on.
--   · Suspending or deprovisioning an account paused its sessions instead of
--     ending them. users.status is read on every request, so a session was
--     refused while the account was out of use and admitted again, token
--     unchanged, the moment an administrator reactivated it.
--
-- THE MECHANISM IS THE ONE THE SCHEMA ALREADY USES. A password change stamps
-- users.password_changed_at, and every authenticator refuses a session that
-- began before it (server/services/account-standing.ts, read in the one
-- statement that also reads users.status). This column is that stamp's sibling
-- for the two other events that end every session; the standing reads both, in
-- the same statement, and a session that began before the later of the two is
-- over. It is the per-user session version the plan names, kept as a time so
-- that a token's own claims (its session start, `sst`) can be compared with it
-- without a lookup per session. password_changed_at is not reused: it is also
-- the password's age (auth-security-service.ts expiry; the access-review report).
--
-- WHO WRITES IT
--   · POST /api/auth/logout with terminateAllSessions (routes/auth.ts), from the
--     server's clock, the clock that stamps a session's start.
--   · This trigger, when users.status leaves 'active', from the database's
--     clock. A trigger rather than each writer: the status is set by
--     routes/admin/master-admin.ts (suspend), routes/scim.ts (deprovision), the
--     tenant purge and operators' SQL alike, and a writer that forgot would leave
--     the defect in place. Leaving 'active' is the event; a sign-up's
--     'pending_verification' → 'active' ends nothing.
-- Neither ever moves the stamp backwards: GREATEST with what is there, so no
-- write can revive a session an earlier one ended.
--
-- THE STAMP IS THE FIRST WHOLE SECOND AFTER THE EVENT (P0-4b fix round R3,
-- 2026-10-01). A token records its session's start in whole seconds, and every
-- door compares strictly (start < stamp). Stamping the event's own second let a
-- session begun in that second, before the event, survive it. Both writers
-- stamp date_trunc('second', event) + 1 s: the trigger here, and the app
-- through account-standing.ts endingStampOf, which also waits for that second
-- before answering so the sign-in that follows is current. Decided by
-- tests/db/session-termination.dbtest.ts (6).
--
-- timestamptz, not the naive timestamp password_changed_at uses: the trigger
-- writes now(), which a naive column would store in the session's TimeZone.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS sessions_ended_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.sessions_ended_at IS
  'Every session of the account that began before this moment is over: set by a sign-out everywhere and when the account leaves status ''active'' (P0-4b, IAM-04). Read with password_changed_at by server/services/account-standing.ts.';

CREATE OR REPLACE FUNCTION public.users_end_sessions_on_leaving_active()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active' THEN
    NEW.sessions_ended_at := GREATEST(
      COALESCE(NEW.sessions_ended_at, '-infinity'::timestamptz),
      date_trunc('second', now()) + interval '1 second'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_end_sessions_on_leaving_active ON public.users;
CREATE TRIGGER trg_users_end_sessions_on_leaving_active
  BEFORE UPDATE OF status ON public.users
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.users_end_sessions_on_leaving_active();
