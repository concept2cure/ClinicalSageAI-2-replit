-- ============================================================================
-- Reconciliation Move 6 — allow `awaiting-async` on submission_orchestrator_runs.status
-- ============================================================================
-- Date: 2026-06-29
-- Audit: docs/reports/RECONCILIATION_AUDIT_2026-06-29.md (Move 6)
--
-- Move 6 wires csr-job-runner (async ICH-E3 §1-§9/§13-§16 AI narrative
-- drafting) into the orchestrator as a new `csr.draft-narrative` step. That
-- step kicks off a long-running CSR build job (minutes) and returns the
-- orchestrator run to the caller in a NEW intermediate run state:
--
--   running       -> in progress, still doing synchronous work
--   awaiting-async-> kicked off external async work, waiting for completion;
--                    caller polls and resumes via runOrchestrator(_, {resumeRunId})
--   complete      -> all steps complete
--   failed        -> a hard error
--   partial       -> some steps complete, some failed
--
-- Migration 0018 created submission_orchestrator_runs with
--   CHECK (status IN ('running', 'complete', 'failed', 'partial'))
-- which would reject an awaiting-async row at persist time (caught by the
-- service-layer try/catch as a schema-shape error and re-thrown, surfacing as
-- a 500 to the route). This migration replaces the CHECK with one that
-- includes `awaiting-async` so the orchestrator can persist the intermediate
-- state cleanly.
--
-- NOTE: submission_orchestrator_steps.status is `TEXT NOT NULL` with NO
-- CHECK constraint (see 0018 line 47), so the new StepStatus value
-- `awaiting-async` does not require any schema change there. Only the
-- run-level status enum needs widening.
--
-- Forward-only. Does NOT modify migration 0018.
-- ============================================================================

BEGIN;

ALTER TABLE submission_orchestrator_runs
  DROP CONSTRAINT IF EXISTS submission_orchestrator_runs_status_check;

ALTER TABLE submission_orchestrator_runs
  ADD CONSTRAINT submission_orchestrator_runs_status_check
  CHECK (status IN ('running', 'awaiting-async', 'complete', 'failed', 'partial'));

COMMIT;
