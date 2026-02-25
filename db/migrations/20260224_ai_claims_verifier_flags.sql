-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Add verifier_flags to ai_claims for Verifier v1
-- Date: 2026-02-24
-- Purpose: Store deterministic verifier rule results as JSONB array on each claim.
--          Used to downgrade SUPPORTED → WEAK when citations don't adequately
--          support the claim text.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE ai_claims
  ADD COLUMN IF NOT EXISTS verifier_flags JSONB NULL;

-- Index for querying claims that have flags (i.e., need attention)
CREATE INDEX IF NOT EXISTS idx_ai_claims_has_flags
  ON ai_claims ((verifier_flags IS NOT NULL))
  WHERE verifier_flags IS NOT NULL;

COMMENT ON COLUMN ai_claims.verifier_flags IS
  'Array of {rule, severity, message} objects from Verifier v1. Non-null means verifier ran.';
