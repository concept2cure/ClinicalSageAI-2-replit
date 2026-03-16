-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: IVDR Pack Warnings + Artifact Integrity Columns
-- Date: 2026-02-25
--
-- 1. Expand status CHECK to include BUILDING and FAILED
-- 2. Add has_warnings + warnings_jsonb for fallback tracking
-- 3. Add per-artifact sha256 + size columns for server-side integrity checks
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1) Expand status constraint to include worker lifecycle states
--    BUILDING = artifacts in progress, FAILED = build failed
--    Original constraint only allowed SUCCEEDED and REVOKED

ALTER TABLE ivdr_packs
  DROP CONSTRAINT IF EXISTS ivdr_packs_status_check;

ALTER TABLE ivdr_packs
  ADD CONSTRAINT ivdr_packs_status_check
  CHECK (status IN ('BUILDING', 'SUCCEEDED', 'FAILED', 'REVOKED'));

-- 2) Warning tracking columns
--    has_warnings: quick filter for packs that have quality warnings
--    warnings_jsonb: structured detail (e.g. PDF fallback, missing evidence)

ALTER TABLE ivdr_packs
  ADD COLUMN IF NOT EXISTS has_warnings BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE ivdr_packs
  ADD COLUMN IF NOT EXISTS warnings_jsonb JSONB NULL;

-- 3) Per-artifact integrity columns
--    Store sha256 + size alongside vault refs so server can verify
--    without re-reading vault content

ALTER TABLE ivdr_packs
  ADD COLUMN IF NOT EXISTS manifest_sha256 TEXT NULL;

ALTER TABLE ivdr_packs
  ADD COLUMN IF NOT EXISTS manifest_size_bytes BIGINT NULL;

ALTER TABLE ivdr_packs
  ADD COLUMN IF NOT EXISTS pdf_sha256 TEXT NULL;

ALTER TABLE ivdr_packs
  ADD COLUMN IF NOT EXISTS pdf_size_bytes BIGINT NULL;

ALTER TABLE ivdr_packs
  ADD COLUMN IF NOT EXISTS docx_sha256 TEXT NULL;

ALTER TABLE ivdr_packs
  ADD COLUMN IF NOT EXISTS docx_size_bytes BIGINT NULL;

ALTER TABLE ivdr_packs
  ADD COLUMN IF NOT EXISTS zip_sha256 TEXT NULL;

ALTER TABLE ivdr_packs
  ADD COLUMN IF NOT EXISTS zip_size_bytes BIGINT NULL;

-- 4) Partial index: quickly find packs with warnings (admin/QA review)
CREATE INDEX IF NOT EXISTS idx_ivdr_packs_warnings
  ON ivdr_packs(organization_id, project_id)
  WHERE has_warnings = true;
