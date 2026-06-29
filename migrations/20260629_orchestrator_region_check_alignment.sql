-- ============================================================================
-- Reconciliation Move 7 — align orchestrator region CHECK with route Zod
-- ============================================================================
-- Date: 2026-06-29
-- Audit: docs/reports/RECONCILIATION_AUDIT_2026-06-29.md (Move 7)
--
-- Migration 0018 created submission_orchestrator_runs with
--   CHECK (region IN ('US', 'EU', 'JP', 'CA'))
-- while server/routes/submission-orchestrator.ts:41 accepts 13 regions:
--   ['US', 'EU', 'JP', 'CA', 'UK', 'CN', 'AU', 'CH', 'BR', 'IN', 'KR', 'SG', 'GLOBAL']
--
-- A submission targeting any of the 9 missing regions silently fails at
-- persist (caught by submission-package-orchestrator.ts's try/catch and only
-- logged as a warning — the run still proceeds in memory with no DB row).
-- The route returned 200 + a runId; auditors saw no row. This is exactly
-- the kind of silent data loss that surfaces in a regulatory inspection
-- months later.
--
-- This migration drops the narrow constraint and replaces it with one that
-- mirrors the Zod enum. Forward-only — does NOT modify migration 0018.
-- ============================================================================

BEGIN;

ALTER TABLE submission_orchestrator_runs
  DROP CONSTRAINT IF EXISTS submission_orchestrator_runs_region_check;

ALTER TABLE submission_orchestrator_runs
  ADD CONSTRAINT submission_orchestrator_runs_region_check
  CHECK (region IN (
    'US', 'EU', 'JP', 'CA', 'UK', 'CN',
    'AU', 'CH', 'BR', 'IN', 'KR', 'SG', 'GLOBAL'
  ));

COMMIT;
