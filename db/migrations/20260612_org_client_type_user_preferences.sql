-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure RIAI — Biopharma surface refresh (Phase 10.2, issue #619 §4)
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Adds organizations.client_type (tenant IA: medtech | biotech | pharma
--          drives which biopharma rail/tab surfaces a tenant sees) and
--          users.preferences (per-user UI preferences: density, rail collapse
--          state, AnA dock open state) per docs/legacy/PHASE_10_2_INSTALL.md §2.
--
-- eCTD/CTD Context:
--   - Module(s): N/A — platform shell configuration (no dossier content).
--   - Integrity Risk Addressed: tenant-type surface filtering must come from
--     the organization row (server-derived), not client-editable local state;
--     user preferences are display-only and never alter governed content.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--     (No canonical document schema is touched here.)
--
-- Notes:
--   - Both columns are additive and idempotent (IF NOT EXISTS guards).
--   - users.preferences holds display preferences only (density, railGroups,
--     dockOpen) — validated key-by-key at the API layer; no PII, no tenancy.
--   - users deliberately has no organization column (membership lives in
--     organization_users); this migration does not touch tenancy.
-- =============================================================================

-- 1) Client type — biotech vs pharma vs medtech (medtech tenants stay on /mdx).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'pharma';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_client_type_check'
      AND conrelid = 'organizations'::regclass
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_client_type_check
      CHECK (client_type IN ('medtech', 'biotech', 'pharma'));
  END IF;
END $$;

-- 2) User preferences — density + rail collapse state + dock open state.
--    Stored keys: density ('compact' | 'comfortable' | 'spacious'),
--                 railGroups (object: rail group id -> open boolean),
--                 dockOpen (boolean).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- If the column pre-existed (legacy nullable json without a default),
-- normalize it so the column contract matches the declaration above.
UPDATE users SET preferences = '{}' WHERE preferences IS NULL;
ALTER TABLE users ALTER COLUMN preferences SET DEFAULT '{}';
ALTER TABLE users ALTER COLUMN preferences SET NOT NULL;
