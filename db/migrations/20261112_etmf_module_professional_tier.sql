-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure — the Vault's trial master file (eTMF)
-- Compliance: 21 CFR Part 11 (auditability), ICH E6(R3) Appendix C (essential
--             records), ALCOA+ principles
-- Purpose: The eTMF module moves to the professional band, as decided (P-75),
--          when it is admitted to the Vault app (P-74 item 1, P-124 item 6).
--
-- eCTD/CTD Context:
--   - Module(s): clinical (a study's trial master file, in the Vault)
--   - Integrity Risk Addressed: commercial packaging only. Entitlement is not
--     a security boundary (server/middleware/moduleEntitlementGate.ts); who may
--     read or write a study's trial master file is the study admission's
--     (server/services/etmf/tmf-study-access.ts).
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Data only, one transaction, no DDL. Idempotent on every deploy.
--
-- Notes:
--   - 2026-11-12, session …01KnUGoX3g (the Vault parity lane), plan F1.
--   - Evidence: docs/evidence/D2-ETMF/2026-11-12-admission/.
-- =============================================================================
--
-- WHY
-- P-75 (2026-10-30): "eTMF is a professional-tier module. Its catalog row is kept
-- and healed with that tier; it is not listed in the launch modules, which would
-- grant it to every organisation." The row (migrations/20260814j_catalog_missing_
-- product_surfaces.sql) carries tiers [], which canAccessModule reads as every
-- plan (server/services/license-manager.ts). The module was outside the launch
-- scope until now, so the empty band reached no release. On admission it would
-- have: the trial master file would have been every organisation's.
--
-- WHO KEEPS IT
-- An organisation whose plan is below professional and that already holds
-- trial master file filings keeps the module by an explicit, auditable
-- subscription row (enabled_by names this file), as the CMC band did
-- (db/migrations/20260824_cmc_professional_tier.sql). Only filings made before
-- admission count. A filing made later, while entitlement enforcement is off or
-- reporting, earns no grant at the next deploy. ON CONFLICT DO NOTHING keeps a
-- deliberate revocation (enabled = false) as it is.
--
-- ORDER (scripts/db/migration-set.mjs)
-- After every catalog writer: 20260814j inserts the row with tiers [] and does
-- nothing on conflict, and 20260810's step 1 no longer retires it (its keep-list
-- names 'etmf' from 2026-11-12), so this band is the final word on each deploy.
--
-- REVERSIBILITY
--   UPDATE available_modules
--      SET metadata = jsonb_set(metadata::jsonb, '{tiers}', '[]'::jsonb)::json
--    WHERE module_id = 'etmf';
-- The grants are ordinary subscription rows and may be kept or revoked per tenant.

BEGIN;

-- 1. Keep the module for an organisation below the band that already has records in it.
INSERT INTO module_subscriptions
  (organization_id, module_id, enabled, enabled_at, enabled_by, metadata)
SELECT o.id, 'etmf', true, NOW(), 'migration:20261112_etmf_module_professional_tier',
       json_build_object(
         'reason', 'kept: the organisation held trial master file filings when the eTMF moved to the professional band',
         'grantedAtTier', o.tier
       )
FROM organizations o
WHERE COALESCE(o.tier, 'standard') IN ('free', 'standard')
  AND EXISTS (
    SELECT 1 FROM tmf_artifact_filings f
     WHERE f.organization_id = o.id
       AND f.filed_at < TIMESTAMPTZ '2026-11-13 00:00:00+00'
  )
ON CONFLICT (organization_id, module_id) DO NOTHING;

-- 2. The band, on a live row. 20260810_reconcile_module_catalog.sql retired the row on every replay until its
--    keep-list named 'etmf' (amended 2026-11-12); the flag those replays left is cleared here, beside the band.
UPDATE available_modules
   SET metadata = (jsonb_set(COALESCE(metadata::jsonb, '{}'::jsonb), '{tiers}', '["professional"]'::jsonb) - 'deprecated')::json
 WHERE module_id = 'etmf';

-- 3. Fail loud if the row is absent or the write did not land.
DO $$
DECLARE band jsonb;
BEGIN
  SELECT metadata::jsonb->'tiers' INTO band FROM available_modules WHERE module_id = 'etmf';
  IF band IS NULL OR band <> '["professional"]'::jsonb THEN
    RAISE EXCEPTION 'etmf tier band not applied (found %)', band;
  END IF;
  IF EXISTS (SELECT 1 FROM available_modules WHERE module_id = 'etmf' AND metadata::jsonb ? 'deprecated') THEN
    RAISE EXCEPTION 'etmf catalogue row is still retired';
  END IF;
END $$;

COMMIT;
