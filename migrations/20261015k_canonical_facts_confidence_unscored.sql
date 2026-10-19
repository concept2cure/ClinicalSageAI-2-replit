-- =============================================================================
-- 20261015k — a governed fact nobody scored is stored unscored, not at 0.5
-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Relax canonical_facts.confidence on databases that have the table.
--
-- eCTD/CTD Context:
--   - Module(s): Modules 2–5 (governed values cited across CTD sections)
--   - Integrity Risk Addressed: a governed value stored with a confidence
--     nobody assigned
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - No table, row or column is created or removed; no stored value changes.
--   - Idempotent; conditional on the table and on the live column shape.
-- =============================================================================
--
-- The companion half of an in-place amendment to
-- migrations/20260603_living_record_spine.sql (see its header note). That file
-- declared canonical_facts.confidence NOT NULL DEFAULT 0.5000, so every fact
-- nobody scored was stored at 0.5. It is applied by install-fresh only, so the
-- amendment reaches only databases provisioned after it. This file is in the
-- set and relaxes the column wherever an earlier install created it: the
-- canonical fact store now writes NULL (unscored) when no score was stated,
-- which the old NOT NULL would refuse. Stored scores are kept — a 0.5000
-- written before cannot be told from one someone gave.
--
-- WHY THIS IS NOT THE DROP CLAUDE.md RULE 1 FORBIDS. It removes no object, and
-- nothing on any applier re-creates the default or NOT NULL: the amended
-- creator declares neither. The block is conditional on the live shape.

DO $canonical_facts_confidence$
BEGIN
  IF to_regclass('public.canonical_facts') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'canonical_facts'
       AND column_name = 'confidence'
       AND (is_nullable = 'NO' OR column_default IS NOT NULL)
  ) THEN
    ALTER TABLE public.canonical_facts ALTER COLUMN confidence DROP DEFAULT;
    ALTER TABLE public.canonical_facts ALTER COLUMN confidence DROP NOT NULL;
  END IF;
END
$canonical_facts_confidence$;
