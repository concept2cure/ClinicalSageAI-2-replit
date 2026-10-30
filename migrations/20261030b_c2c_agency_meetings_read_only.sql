-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: c2c_agency_meetings, the earlier meetings store, is read-only. A
--          health-authority meeting is recorded on ha_interactions, through
--          Communication, and its minutes are an inbox letter (P-39 step 4,
--          2026-10-30).
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 meeting records (FDA formal meetings, EMA scientific
--     advice) as Communication records them.
--   - Integrity Risk Addressed: two meeting stores. c2c_agency_meetings took a
--     meeting with no reason, no project admission and a free-text programme,
--     and held minutes and briefing books as free JSON outside the governed
--     inbox, while ha_interactions governs every write.
--
-- Determinism Contract:
--   - No existing row is rewritten, moved or dropped; the rows stay as history.
-- =============================================================================
-- 20261030b_c2c_agency_meetings_read_only.sql
--
-- WHY. P-39 step 4 (docs/LAUNCH_DEFINITION_OF_DONE.md) converges the
-- c2c_agency_meetings minutes onto ha_interactions. Communication records and
-- moves meetings (docs/evidence/D2-MEETINGS-IN-COMMUNICATION/2026-10-30/) and a
-- meeting names its minutes letter (docs/evidence/D2-MEETING-MINUTES-IN-INBOX/
-- 2026-10-30/). The routes that wrote this table (/api/agency-meetings), refused
-- in production by launch scope, and the Agency Meetings surface are deleted in
-- the same change (docs/evidence/D2-AGENCY-MEETINGS-RETIRED/2026-10-30/). Nothing
-- in a deployed organisation wrote minutes or briefing books here; only the
-- laptop demo seed did, and it is deleted too.
--
-- WHAT. A trigger refuses INSERT and UPDATE on the table, and one refuses
-- TRUNCATE, as 20261029i did for c2c_commitments. DELETE is not refused: a
-- tenant's offboarding purge may remove its rows. The table and its rows are
-- kept: whether a deployed database holds rows is not known here, and a drop
-- would destroy them.
--
-- RULE 1: replayed on every deploy. CREATE OR REPLACE FUNCTION and CREATE OR
-- REPLACE TRIGGER are idempotent. db/migrations/20260717_agency_meetings_store.sql,
-- which creates the table, runs earlier in the set and creates nothing this file
-- removes: no create-then-drop ordering hazard. Creates no table.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.c2c_agency_meetings_read_only() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION
    'c2c_agency_meetings is read-only since 2026-10-30 (% refused): a health-authority meeting is recorded in Communication (ha_interactions), with a reason, and its minutes are an inbox letter.',
    TG_OP
    USING ERRCODE = 'raise_exception',
          HINT = 'Record the meeting through /api/ha-interactions. A correction to this file amends migrations/20261030b_c2c_agency_meetings_read_only.sql.';
END;
$fn$;

COMMENT ON FUNCTION public.c2c_agency_meetings_read_only() IS
  'Refuses INSERT, UPDATE and TRUNCATE on c2c_agency_meetings, the earlier meetings store, read-only since 2026-10-30 (P-39 step 4). DELETE stays open for a tenant purge.';

DO $$
BEGIN
  IF to_regclass('public.c2c_agency_meetings') IS NULL THEN
    RAISE NOTICE '[c2c-agency-meetings-read-only] public.c2c_agency_meetings not present; nothing to guard.';
    RETURN;
  END IF;
  CREATE OR REPLACE TRIGGER c2c_agency_meetings_read_only
    BEFORE INSERT OR UPDATE ON public.c2c_agency_meetings
    FOR EACH ROW EXECUTE FUNCTION public.c2c_agency_meetings_read_only();
  CREATE OR REPLACE TRIGGER c2c_agency_meetings_read_only_truncate
    BEFORE TRUNCATE ON public.c2c_agency_meetings
    FOR EACH STATEMENT EXECUTE FUNCTION public.c2c_agency_meetings_read_only();
  COMMENT ON TABLE public.c2c_agency_meetings IS
    'The earlier meetings store. Read-only since 2026-10-30: a meeting is recorded on ha_interactions, its minutes an inbox letter (P-39 step 4).';
END;
$$;
