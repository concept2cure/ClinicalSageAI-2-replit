-- =============================================================================
-- 20261015l — a memory entry nobody scored is stored unscored, not at 0.8
-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Drop the 0.8 default from client_memory_entries.confidence_score and
--          project_memory_entries.confidence_score on databases that have it.
--
-- eCTD/CTD Context:
--   - Module(s): none directly (client and project memory that AnA recalls)
--   - Integrity Risk Addressed: a confidence nobody assessed, stored by default
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - No table, row or column is created or removed; no stored value changes.
--   - Idempotent; conditional on each table and on the live column default.
-- =============================================================================
--
-- The companion half of the 2026-10-15 change to shared/schema.ts, which
-- dropped .default(0.8) from both columns. Those tables are created by drizzle
-- push (install-fresh) and deploy-migrate never pushes the schema, so every
-- database provisioned earlier kept DEFAULT 0.8, and a writer that named no
-- confidence (the feature store, the GA demo's HAQ seed) still stored an 80%
-- confidence nobody assessed. Both writers now state NULL; this drops the
-- default for every other. Stored scores are kept: a 0.8 written by default
-- cannot be told from one someone gave.
--
-- WHY THIS IS NOT THE DROP CLAUDE.md RULE 1 FORBIDS. It removes no object, and
-- nothing on any applier re-creates the default: shared/schema.ts declares
-- none, and no file in C2C_MIGRATION_FILES or the migrations/ overlay creates
-- either table. Each statement is conditional on the live default, so a fresh
-- install and every deploy after the first do nothing.

DO $memory_confidence_default$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'client_memory_entries'
       AND column_name = 'confidence_score' AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE IF EXISTS public.client_memory_entries ALTER COLUMN confidence_score DROP DEFAULT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'project_memory_entries'
       AND column_name = 'confidence_score' AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE IF EXISTS public.project_memory_entries ALTER COLUMN confidence_score DROP DEFAULT;
  END IF;
END
$memory_confidence_default$;
