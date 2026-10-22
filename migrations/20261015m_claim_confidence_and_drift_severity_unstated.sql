-- =============================================================================
-- 20261015m — an unscored claim is stored unscored; an unrated drift is not 'medium'
-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Relax evidence_claims.confidence and fact_drift.severity on databases
--          that have the tables.
--
-- eCTD/CTD Context:
--   - Module(s): Modules 2–5 (claims and the governed values cited across CTD sections)
--   - Integrity Risk Addressed: a claim confidence nobody scored, and a drift
--     severity nobody rated
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - No table, row or column is created or removed; no stored value changes.
--   - Idempotent; conditional on each table and on the live column shape.
-- =============================================================================
--
-- The companion half of two in-place amendments (see their header notes):
--
--   evidence_claims.confidence was NUMERIC(3,2) NOT NULL DEFAULT 0.50 — in
--   shared/schema.ts, which install-fresh pushes, and in db/migrations/20260319_
--   evidence_fabric.sql. A claim written with no score read back as 0.5, and
--   reconcileClaim established its governed fact at 0.5. Now nullable, no default.
--
--   fact_drift.severity was NOT NULL DEFAULT 'medium' (migrations/20260603_
--   living_record_spine.sql), so a drift whose writer rated nothing read as a
--   medium one. Every writer states a severity ('unrated' included); the column
--   stays NOT NULL and loses the default.
--
-- Neither creator runs on a deploy, so the amendments reach only databases
-- provisioned after them. This file is in the set and relaxes the columns
-- wherever an earlier install created them. Stored values are kept: a 0.50 or a
-- 'medium' written before cannot be told from one someone gave.
--
-- WHY THIS IS NOT THE DROP CLAUDE.md RULE 1 FORBIDS. It removes no object, and
-- nothing on any applier re-creates either default or the NOT NULL it drops:
-- the amended creators declare neither. Each block is conditional on the live shape.

DO $claim_confidence$
BEGIN
  IF to_regclass('public.evidence_claims') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'evidence_claims'
       AND column_name = 'confidence'
       AND (is_nullable = 'NO' OR column_default IS NOT NULL)
  ) THEN
    ALTER TABLE public.evidence_claims ALTER COLUMN confidence DROP DEFAULT;
    ALTER TABLE public.evidence_claims ALTER COLUMN confidence DROP NOT NULL;
  END IF;
END
$claim_confidence$;

DO $drift_severity$
BEGIN
  IF to_regclass('public.fact_drift') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'fact_drift'
       AND column_name = 'severity' AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE public.fact_drift ALTER COLUMN severity DROP DEFAULT;
  END IF;
END
$drift_severity$;
