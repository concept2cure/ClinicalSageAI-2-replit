-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Add an indexed ClinicalTrials.gov identifier to csr_reports so the
--          trial corpus can be ingested idempotently (dedupe by NCT id).
--
-- eCTD/CTD Context:
--   - Module(s): Module 5 (clinical study reports / trial evidence corpus)
--   - Integrity Risk Addressed: duplicate trial records on re-ingestion, which
--     would corrupt precedent counts and success-rate baselines.
--
-- Determinism Contract:
--   - nct_id is the stable external key for a registered study; using it as the
--     upsert key makes corpus ingestion deterministic and re-runnable.
--
-- Notes:
--   - Column is nullable: existing CSRs (manually uploaded) have no NCT id.
--   - Unique partial index enforces one row per NCT id where present, while
--     allowing many NULLs. Idempotent (IF NOT EXISTS).
-- =============================================================================

ALTER TABLE csr_reports
  ADD COLUMN IF NOT EXISTS nct_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_csr_reports_nct_id
  ON csr_reports (nct_id)
  WHERE nct_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_csr_reports_indication_phase
  ON csr_reports (indication, phase);
