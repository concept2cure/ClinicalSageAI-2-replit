-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Let coauthor_validation_history.agency be null on
--          already-provisioned databases.
--
-- eCTD/CTD Context:
--   - Module(s): all (validation runs over any authored content)
--   - Integrity Risk Addressed: a validation record naming an agency nobody
--     named
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - No row or column is added or removed; existing rows keep their values.
--   - Idempotent and conditional on the live constraint.
-- =============================================================================
--
-- run_validation recorded agency 'FDA' for every run that named no agency,
-- though nothing in its checks is agency-specific (realTimeValidationService).
-- It now records the agency the caller named, or null — and the column was
-- NOT NULL.
--
-- WHY THIS FILE. The table comes from the drizzle schema (install-fresh step
-- 2, `drizzle-kit push` of shared/schema.ts, amended alike on 2026-10-15) and
-- is on no applier in C2C_MIGRATION_FILES, so the amendment reaches only
-- databases provisioned after it. This file is in the set and runs on every
-- deploy.
--
-- WHY THIS IS NOT THE DROP CLAUDE.md RULE 1 FORBIDS. It removes no object and
-- discards no data: it relaxes a constraint. The one other declaration of it,
-- migrations/0000_sweet_joseph.sql, is a raw-overlay file whose CREATE TABLE
-- no-ops against the table push already made, and this file re-runs after it
-- on every deploy regardless.

DO $validation_history_agency$
BEGIN
  IF to_regclass('public.coauthor_validation_history') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'coauthor_validation_history'
       AND column_name = 'agency' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.coauthor_validation_history ALTER COLUMN agency DROP NOT NULL;
  END IF;
END
$validation_history_agency$;
