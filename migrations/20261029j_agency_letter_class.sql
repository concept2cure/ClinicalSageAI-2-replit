-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: A letter in the project's agency inbox records its class, so the
--          response clock can run on it (P-39 step 3, S4; 2026-10-29).
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 regional correspondence — the agency's letters and
--     the response each one is owed.
--   - Integrity Risk Addressed: the inbox kept only the agency's free-text
--     wording (communication_type) and a typed due date. The response clock
--     (server/services/regulatory-correspondence/response-clock.ts) runs on a
--     letter class, so it ran only on the duplicate store
--     (c2c_correspondence), which no screen of Communication shows.
--
-- Determinism Contract:
--   - No existing row is rewritten. A letter logged before this file has no
--     class, and its clock says so (untracked) rather than guessing one from
--     its wording.
-- =============================================================================
-- 20261029j_agency_letter_class.sql
--
-- WHAT. concept2cure_agency_communications.letter_class TEXT, nullable. The
-- vocabulary is AGENCY_LETTER_CLASSES (shared/regulatory/agency-interaction.ts),
-- held by the create route's schema (communication-center.ts). It is not held
-- by a CHECK, because adding a class would then need a conditional constraint
-- replacement on every replay (RULE 1).
--
-- RULE 1: replayed on every deploy. ADD COLUMN IF NOT EXISTS is a no-op on
-- replay. The table is created by db/migrations/20260331_communication_center_
-- scaffold.sql, earlier in the set; if it is absent this file does nothing.
-- Additive only. It creates no table.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.concept2cure_agency_communications') IS NULL THEN
    RAISE NOTICE '[agency-letter-class] concept2cure_agency_communications absent; nothing to add.';
    RETURN;
  END IF;
  ALTER TABLE public.concept2cure_agency_communications ADD COLUMN IF NOT EXISTS letter_class TEXT;
END;
$$;
