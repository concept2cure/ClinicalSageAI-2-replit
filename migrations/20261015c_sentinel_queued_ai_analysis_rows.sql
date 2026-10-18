-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Remove the sentinel "findings" that recorded an AI analysis request
--          nothing ever performed.
--
-- eCTD/CTD Context:
--   - Module(s): none (project oversight signals)
--   - Integrity Risk Addressed: open, medium-severity quality-drift findings
--     that found nothing, counted in the sentinel findings and statistics
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - No schema change. Deletes only rows matching everything the removed
--     writer stamped; idempotent, and a no-op once nothing writes them.
-- =============================================================================
--
-- The rules engine's trigger_ai_analysis action (TriggerAIAnalysisHandler,
-- server/services/rules-engine/actions/index.ts) wrote a sentinel_findings row
-- titled "AI Analysis Requested: <type>", analyzer 'quality_drift', severity
-- 'medium', status 'open', metadata {"ruleId", "priority", "queued": true},
-- and reported success. Nothing reads that queue: no analysis ran, and each
-- row is a finding of nothing (fixed in code 2026-10-15 — the action now fails
-- and writes nothing). A genuine finding carries what it found, and a real AI
-- analysis its ai_request_id; these carry neither.
--
-- Nothing references sentinel_findings by key.

DO $sentinel_queued_ai$
BEGIN
  IF to_regclass('public.sentinel_findings') IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.sentinel_findings f
   WHERE f.analyzer_type = 'quality_drift'
     AND f.title LIKE 'AI Analysis Requested: %'
     AND f.ai_request_id IS NULL
     AND f.metadata IS NOT NULL
     AND (f.metadata::jsonb ->> 'queued') = 'true'
     AND (f.metadata::jsonb ? 'ruleId');
END
$sentinel_queued_ai$;
