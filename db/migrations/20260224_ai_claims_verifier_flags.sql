-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Add verifier_flags to ai_claims for Verifier v1
-- Date: 2026-02-24
-- Purpose: Store deterministic verifier rule results as JSONB array on each claim.
--          Used to downgrade SUPPORTED → WEAK when citations don't adequately
--          support the claim text.
--
-- Invariant: verifier_flags is ALWAYS an array (possibly empty).
--   Empty [] = verifier ran, no issues found.
--   Non-empty = verifier ran, issues detected.
--   Never NULL = we always know the verifier ran.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Add column with default (nullable first for backfill, then tighten)

-- to_regclass-guarded as a whole, the convention every file this set applies
-- follows: a bare ALTER raises 42P01 on a lineage without the table (the
-- migration-set replay harness starts partway through the set), and COMMENT ON
-- has no IF EXISTS form. Wired into C2C_MIGRATION_FILES on 2026-09-20 after the
-- columns below were measured ABSENT on a database built by install-fresh plus
-- the whole set — see the header note added there.
DO $$
BEGIN
  IF to_regclass('public.ai_claims') IS NULL THEN
    RAISE NOTICE 'ai_claims not present in this schema; skipping.';
    RETURN;
  END IF;

  ALTER TABLE ai_claims
  ADD COLUMN IF NOT EXISTS verifier_flags JSONB;

  -- 2. Backfill any existing NULLs to empty array
  UPDATE ai_claims
  SET verifier_flags = '[]'::jsonb
  WHERE verifier_flags IS NULL;

  -- 3. Set default and enforce NOT NULL
  ALTER TABLE ai_claims
  ALTER COLUMN verifier_flags SET DEFAULT '[]'::jsonb;

  ALTER TABLE ai_claims
  ALTER COLUMN verifier_flags SET NOT NULL;

  -- 4. Drop old useless index
  DROP INDEX IF EXISTS idx_ai_claims_has_flags;

  -- 5. Partial index: claims with at least one flag (need attention)
  CREATE INDEX IF NOT EXISTS idx_ai_claims_flagged
  ON ai_claims (generation_run_id)
  WHERE jsonb_array_length(verifier_flags) > 0;

  -- 6. GIN index: flexible querying by rule name or flag content
  CREATE INDEX IF NOT EXISTS idx_ai_claims_verifier_flags_gin
  ON ai_claims USING GIN (verifier_flags);

  EXECUTE $c$
    COMMENT ON COLUMN ai_claims.verifier_flags IS
  'Array of {rule, severity, message} objects from Verifier v1. Always present (empty [] = no issues).'
  $c$;
END $$;
