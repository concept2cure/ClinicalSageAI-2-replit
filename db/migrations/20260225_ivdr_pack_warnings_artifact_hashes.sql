-- 2026-09-25 AMENDED IN PLACE (W2 / D1, docs/evidence/W2/2026-09-25-replay-rebuilds-nothing/):
-- ivdr_packs_status_check is now replaced only when the live definition
-- (pg_get_constraintdef) differs from the one below. Unconditional, every deploy dropped
-- and re-added it — a full validation scan under lock (ACCESS EXCLUSIVE for a CHECK;
-- writes blocked on child and parent for a FOREIGN KEY) while the application served.
-- The definitions are unchanged. Pinned by npm run ci:replay-rebuilds-nothing.
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

-- to_regclass-guarded as a whole, the convention every file this set applies
-- follows: a bare ALTER raises 42P01 on a lineage without the table (the
-- migration-set replay harness starts partway through the set), and COMMENT ON
-- has no IF EXISTS form. Wired into C2C_MIGRATION_FILES on 2026-09-20 after the
-- columns below were measured ABSENT on a database built by install-fresh plus
-- the whole set — see the header note added there.
DO $$
BEGIN
  IF to_regclass('public.ivdr_packs') IS NULL THEN
    RAISE NOTICE 'ivdr_packs not present in this schema; skipping.';
    RETURN;
  END IF;

  -- Replaced only when the live definition differs (2026-09-25, see the header):
  -- unconditionally, every deploy re-validated it under lock while the app served.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = to_regclass('public.ivdr_packs') AND conname = 'ivdr_packs_status_check'
       AND pg_get_constraintdef(oid) = $def$CHECK ((status = ANY (ARRAY['BUILDING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'REVOKED'::text])))$def$
  ) THEN
    ALTER TABLE ivdr_packs
    DROP CONSTRAINT IF EXISTS ivdr_packs_status_check;

    ALTER TABLE ivdr_packs
    ADD CONSTRAINT ivdr_packs_status_check
    CHECK (status IN ('BUILDING', 'SUCCEEDED', 'FAILED', 'REVOKED'));
  END IF;

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
END $$;
