-- =============================================================================
-- 20261015g — innovation.calculate_readiness_score answers no invented score
-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Replace a placeholder readiness function on databases that have it.
--
-- eCTD/CTD Context:
--   - Module(s): none directly (a submission-readiness figure about any program)
--   - Integrity Risk Addressed: a readiness score nobody computed
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - No table, row or column is created, changed or removed.
--   - Idempotent; conditional on the function existing.
-- =============================================================================
--
-- db/migrations/072_gcc_innovation_platform_core.sql — applied by
-- install-fresh, never by a deploy — created this SECURITY DEFINER function
-- returning a constant 75% overall, 80% complete, 70% quality and "15 of 20
-- criteria met" for any program ("-- Placeholder"). 072 is amended in place
-- the same day, which reaches only databases installed after it; this file is
-- in the deploy set and replaces the function wherever an earlier install
-- created it. Nothing calls it. It now raises feature_not_supported and runs
-- as its caller (SECURITY INVOKER), the same definition 072 now creates.

DO $innovation_readiness$
BEGIN
  IF to_regprocedure('innovation.calculate_readiness_score(uuid, character varying, character varying)') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION innovation.calculate_readiness_score(
      p_program_id UUID,
      p_submission_type VARCHAR,
      p_agency VARCHAR
    ) RETURNS TABLE (
      overall_score FLOAT,
      completeness_score FLOAT,
      quality_score FLOAT,
      criteria_met INT,
      criteria_total INT
    )
    LANGUAGE plpgsql
    SECURITY INVOKER
    AS $body$
    BEGIN
      RAISE EXCEPTION 'innovation.calculate_readiness_score computes no readiness: no implementation exists'
        USING ERRCODE = 'feature_not_supported';
    END;
    $body$
  $fn$;
END
$innovation_readiness$;
