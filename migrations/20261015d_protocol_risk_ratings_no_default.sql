-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Drop the 'possible' / 'moderate' defaults from
--          protocol_risks.likelihood / impact on already-provisioned databases.
--
-- eCTD/CTD Context:
--   - Module(s): Module 5 (clinical protocol risk management)
--   - Integrity Risk Addressed: a risk level recorded from ratings nobody made
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
-- migrations/20260622_protocol_risks.sql (see its header note). A risk added
-- without ratings was recorded 'possible' x 'moderate' = 9 and banded 'high'.
-- The route, the service and AnA's add_protocol_risk tool now require both
-- ratings; with no default, any other insert that omits them fails NOT NULL
-- rather than inventing them.
--
-- WHY THIS FILE AS WELL AS THE AMENDMENT. The creator is applied by the raw
-- migrations/ overlay (install-fresh step 3) and is not in C2C_MIGRATION_FILES,
-- so the amendment fixes only databases provisioned after it. This file is in
-- the set and runs on every deploy.
--
-- WHY THIS IS NOT THE DROP CLAUDE.md RULE 1 FORBIDS. It removes no object, and
-- nothing on any applier re-creates the default: the amended creator declares
-- none. Each statement is conditional on the live default.

DO $protocol_risk_ratings$
BEGIN
  IF to_regclass('public.protocol_risks') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'protocol_risks'
       AND column_name = 'likelihood' AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE public.protocol_risks ALTER COLUMN likelihood DROP DEFAULT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'protocol_risks'
       AND column_name = 'impact' AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE public.protocol_risks ALTER COLUMN impact DROP DEFAULT;
  END IF;
END
$protocol_risk_ratings$;
