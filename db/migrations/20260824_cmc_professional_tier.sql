-- ── CMC / Module 3 moves to the professional band ────────────────────────────
--
-- Pricing decision (product owner, 2026-08-24): the CMC / Module 3 workspace
-- is the flagship professional capability — the full operating system from
-- register capture through compile, contradiction sweep, fail-closed export
-- gate, Part 11 approvals, placement and eCTD build. The 20260823 packaging
-- put it at 'standard' with a stated argument ("an IND without Module 3 is
-- not an IND"); that argument is ANSWERED here, not ignored:
--
--   1. No organization entitled today loses the filing path. Every org whose
--      CURRENT tier qualifies under the old band but not the new one (exactly
--      the 'standard' orgs) receives an explicit, auditable
--      module_subscriptions grant below — and grants outrank tier permanently
--      (navigation-entitlements reads subscription state before tier).
--      'free' orgs were not entitled before and are not after; 'professional'
--      and 'enterprise' orgs keep their tier match.
--   2. The band governs organizations provisioned FROM HERE ON — which is
--      what a pricing band is for. New standard customers buy up to
--      professional for Module 3, or receive a negotiated grant.
--
-- ON CONFLICT DO NOTHING is load-bearing: an existing row with
-- enabled = false is a deliberate, audited revocation and must NOT be
-- re-enabled by a packaging migration.
--
-- Ordering (scripts/db/migration-set.mjs): this file must run AFTER
-- 20260810_reconcile_module_catalog.sql (which resets tiers to [] on
-- conflict) and AFTER 20260823_module_catalog_commercial_packaging.sql
-- (which sets 'standard') — it is registered after both, and after the
-- mdx-registers catalog writer, so the professional band is the final word.
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────────
-- Data-only, one transaction, no DDL. To revert the band:
--   UPDATE available_modules
--      SET metadata = jsonb_set(metadata::jsonb, '{tiers}', '["standard"]'::jsonb)::json
--    WHERE module_id = 'cmc';
-- The grandfather grants are ordinary auditable subscription rows
-- (enabled_by = 'migration:20260824_cmc_professional_tier') and may be kept
-- or revoked per tenant through the master-admin console; reverting the band
-- makes them redundant, never harmful.

BEGIN;

-- 1. Grandfather first, while the OLD band still tells us who qualifies by
--    tier alone: exactly the 'standard' orgs are entitled today and would
--    lose tier-match the moment the band moves.
INSERT INTO module_subscriptions
  (organization_id, module_id, enabled, enabled_at, enabled_by, metadata)
SELECT o.id, 'cmc', true, NOW(), 'migration:20260824_cmc_professional_tier',
       json_build_object(
         'reason', 'grandfathered: cmc band moved standard -> professional',
         'grantedAtTier', o.tier
       )
FROM organizations o
WHERE o.tier = 'standard'
ON CONFLICT (organization_id, module_id) DO NOTHING;

-- 2. The band itself.
UPDATE available_modules
   SET metadata = jsonb_set(metadata::jsonb, '{tiers}', '["professional"]'::jsonb)::json
 WHERE module_id = 'cmc';

-- 3. Fail loud if the row is absent or the write did not land — a catalog
--    without a cmc row is a broken catalog, and this migration must say so
--    rather than "succeed" over it.
DO $$
DECLARE band jsonb;
BEGIN
  SELECT metadata::jsonb->'tiers' INTO band FROM available_modules WHERE module_id = 'cmc';
  IF band IS NULL OR band <> '["professional"]'::jsonb THEN
    RAISE EXCEPTION 'cmc tier band not applied (found %)', band;
  END IF;
END $$;

COMMIT;
