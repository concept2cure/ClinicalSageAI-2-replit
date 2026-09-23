-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- Compliance: 21 CFR Part 11 §11.10(e) (the import is audited in the same
--             transaction), ALCOA+ (the report's sha256 identifies the original)
-- Purpose: Keep an imported agency-validator report with the compilation whose
--          package it was run over. 2026-09-23 (W5/D7, WO-9 Click 6).
--
-- LORENZ eValidator is licensed software run outside the product, over the
-- exported package. Its JSON report is imported through
-- POST /api/ectd-compile/:projectIdent/validate and parsed fail-closed
-- (external-validator/lorenz-adapter.ts parseEvalidatorJsonReport). What is
-- kept: who imported it and when, the report file's name and sha256, the
-- findings, and the error/warning/info counts. The product did not run the
-- validator, and every place the report is shown says so.
--
-- Notes:
--   - ectd_compilations is public, organization_id NOT NULL, under the tenant
--     RLS policy already; no new table, no new policy.
--   - Additive and IF NOT EXISTS-guarded: this file re-runs on every deploy
--     (CLAUDE.md RULE 1), and every existing row stays valid (NULL = no report).
-- =============================================================================

ALTER TABLE IF EXISTS ectd_compilations
  ADD COLUMN IF NOT EXISTS external_validation JSONB;
