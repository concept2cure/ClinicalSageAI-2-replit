-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: a health-authority meeting names the inbox letter that holds its
--          minutes (P-39 step 4c, 2026-10-30).
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 meeting records (FDA formal meeting minutes, EMA
--     scientific advice letters) as Communication records them.
--   - Integrity Risk Addressed: a meeting marked "minutes received" pointed at
--     nothing, so its agreements and commitments lived only in a free-text store
--     (c2c_agency_meetings.minutes) outside the governed inbox.
--
-- Determinism Contract:
--   - No existing row is rewritten, moved or dropped.
-- =============================================================================
-- 20261030_ha_interaction_minutes_letter.sql
--
-- WHY. P-39 step 4 (docs/LAUNCH_DEFINITION_OF_DONE.md) puts a meeting's minutes
-- in the project inbox: a letter with source_type 'meeting_minutes', whose
-- questions carry the agreements and whose answers carry the commitments
-- (regulatory_commitments, meeting_commitment). The meeting names that letter.
--
-- WHAT. ha_interactions.minutes_event_id text, nullable, a foreign key to
-- concept2cure_agency_communications(event_id) ON DELETE SET NULL, so a purged
-- letter clears the link and never blocks the purge. Same organisation, the
-- meeting's own project and the minutes source type are the server's checks
-- (ha-service.ts updateInteractionStatusTx); a foreign key bypasses RLS and
-- cannot express them.
--
-- RULE 1: replayed on every deploy. ADD COLUMN IF NOT EXISTS; the constraint is
-- added only when pg_constraint lacks it, and it validates nothing but NULLs on
-- the first run. Creates no table; drops nothing. After
-- 20260610_ha_interactions_commitments.sql (the table) and
-- 20260331_communication_center_scaffold.sql (the letters).
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.ha_interactions') IS NULL OR to_regclass('public.concept2cure_agency_communications') IS NULL THEN
    RAISE NOTICE '[ha-interaction-minutes] ha_interactions or the inbox is not present; nothing to link.';
    RETURN;
  END IF;
  ALTER TABLE public.ha_interactions ADD COLUMN IF NOT EXISTS minutes_event_id text;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'ha_interactions_minutes_event_fk' AND conrelid = 'public.ha_interactions'::regclass) THEN
    ALTER TABLE public.ha_interactions
      ADD CONSTRAINT ha_interactions_minutes_event_fk FOREIGN KEY (minutes_event_id)
      REFERENCES public.concept2cure_agency_communications(event_id) ON DELETE SET NULL;
  END IF;
  COMMENT ON COLUMN public.ha_interactions.minutes_event_id IS
    'The inbox letter (source_type meeting_minutes) that holds this meeting''s minutes, in the meeting''s project (P-39 step 4c, 2026-10-30).';
END;
$$;
