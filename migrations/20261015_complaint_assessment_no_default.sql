-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Drop the 'none' / 'minor' defaults from complaints.patient_harm and
--          complaints.severity_assessment on already-provisioned databases.
--
-- eCTD/CTD Context:
--   - Module(s): none (post-market quality records: 21 CFR 820.198, 803)
--   - Integrity Risk Addressed: a reportability determination made from a
--     value nobody assessed
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - No row, column or constraint changes; existing rows keep their values.
--   - Idempotent and conditional on the live column default.
-- =============================================================================
--
-- The companion half of an in-place amendment to
-- migrations/20260504_capa_mdr.sql (see its dated header note). The intake
-- triage computes preliminary MDR reportability from patient_harm, and the
-- column defaulted to 'none' — so a complaint filed without a harm assessment
-- was classified "No harm reported — log under 820.198, no MDR". The route, the
-- service and AnA's create_complaint tool now require both assessments; with
-- no default, any other insert that omits them fails NOT NULL rather than
-- inventing them.
--
-- WHY THIS FILE AS WELL AS THE AMENDMENT. The creator is applied by the raw
-- migrations/ overlay (install-fresh step 3) and is not in C2C_MIGRATION_FILES,
-- so the amendment fixes only databases provisioned after it. This file is in
-- the set and runs on every deploy.
--
-- WHY THIS IS NOT THE DROP CLAUDE.md RULE 1 FORBIDS. It removes no object, and
-- nothing on any applier re-creates the default: the amended creator declares
-- none. Each statement is conditional on the live default, so on a fresh
-- install and on every deploy after the first it does nothing.

DO $complaint_assessment$
BEGIN
  IF to_regclass('public.complaints') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'complaints'
       AND column_name = 'patient_harm' AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE public.complaints ALTER COLUMN patient_harm DROP DEFAULT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'complaints'
       AND column_name = 'severity_assessment' AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE public.complaints ALTER COLUMN severity_assessment DROP DEFAULT;
  END IF;
END
$complaint_assessment$;
