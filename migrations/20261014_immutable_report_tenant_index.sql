-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure — Report OS and authenticated onboarding validation
-- Compliance: 21 CFR Part 11, ALCOA+ provenance and tenant isolation
-- Purpose: Ensure the canonical immutable-report tenant lookup index is present.
-- Date: 2026-10-14
-- eCTD/CTD Context: Reporting and the controlled evidence record across modules.
-- Integrity Risk Addressed: Fresh provisioning stopped before browser checks
--   because immutable_report_records lacked its declared organization index.
-- Determinism Contract: Table, columns, rows, signatures and RLS remain unchanged.
-- Replay Safety: IF NOT EXISTS preserves an already provisioned canonical index.
-- Evidence: docs/evidence/D2-CLIENT-ONBOARDING/2026-10-14/report-index-repair.md
-- =============================================================================

-- The table is provisioned by the canonical Drizzle model before this overlay.
-- A missing base table is a provisioning failure, never an accepted no-op.
DO $$
BEGIN
  IF to_regclass('public.immutable_report_records') IS NULL THEN
    RAISE EXCEPTION 'Provision immutable_report_records before its tenant index';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS irr_org_idx
  ON public.immutable_report_records (organization_id);
