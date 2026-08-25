-- Repair provision_org_modules(): it has never provisioned anything, and its
-- tier ladder runs upside down.
--
-- ── DEFECT 1: the function errors on every call, today ───────────────────────
--
-- `available_modules.metadata` is declared `json` (shared/schema.ts:725,
-- `metadata: json('metadata')`), and every catalog row is written `::json`
-- (20260810_reconcile_module_catalog.sql). The function body calls
--
--     jsonb_array_elements_text(v_mod.metadata->'tiers')
--
-- `json -> text` yields `json`, and PostgreSQL has no implicit json→jsonb cast,
-- so function resolution fails. Reproduced on PostgreSQL 16 against this exact
-- function body and column type:
--
--     ERROR:  function jsonb_array_elements_text(json) does not exist
--     CONTEXT: PL/pgSQL function provision_org_modules(integer) line 18 at IF
--
-- The IF is evaluated per row, so the very first row aborts the call. That is
-- true RIGHT NOW, with every module carrying `{"tiers": [], "industries": []}`:
-- the failure does not need packaging to be applied, it only needed the
-- function to be called. `POST /api/module-subscriptions/provision`
-- (server/routes/module-subscriptions.ts) has therefore never written a
-- subscription row in its life — it raises, the route catches, and the client
-- is told "Failed to provision modules".
--
-- Nobody noticed because the OTHER provisioning path — provisionModulesForTier
-- in server/services/billing.ts, which runs on Stripe checkout and on the
-- subscription webhook — is TypeScript, reads the same metadata through the pg
-- driver, and works. So orgs that went through billing were provisioned and
-- orgs provisioned by an admin were not, with no error anyone connected.
--
-- ── DEFECT 2: `=` where the ladder needs `>=` ────────────────────────────────
--
-- The tier test was `v_tier = ANY(tiers)` — exact equality. With the cast fixed
-- and an org on `professional`, a module tagged `{"tiers": ["standard"]}` does
-- NOT provision. Measured, same harness:
--
--     org tier = professional  →  pro-only provisioned, std-only absent
--
-- That is an inverted ladder: the more a customer pays, the fewer modules they
-- receive. It contradicts all three sibling implementations, which are
-- consistent with each other and with the documented model —
--   server/services/billing.ts  provisionModulesForTier: orgLevel >= tierLevel[t]
--   server/services/license-manager.ts  getModuleCatalog: orgTierLevel >= TIER_LEVELS[t]
--   server/services/license-manager.ts  canAccessModule:  same
--   server/services/license-manager.ts  header: "Each tier includes everything
--                                       from the tier below."
-- — so this function was the only dissenter, and only its own callers saw it.
--
-- These two defects mask each other. Fixing the cast alone would turn a loud,
-- never-triggered error into a silent, wrong catalog, and the resulting mess
-- would read as a packaging mistake rather than a SQL one. Both are fixed here,
-- in one change, because shipping either alone is worse than shipping neither.
--
-- ── ALSO: deprecated modules are no longer provisioned ───────────────────────
--
-- 20260810_reconcile_module_catalog.sql retires the legacy module taxonomy by
-- marking those rows {"deprecated": true} rather than deleting them (the
-- module_subscriptions FK is ON DELETE CASCADE, so deleting would destroy every
-- organization's entitlement history). getModuleCatalog already filters them
-- out of what it serves. This function did not, so it was eligible to write
-- fresh subscription rows for modules no user can open. It now applies the same
-- filter, so the two agree on what the catalog contains.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--
-- Function bodies only — no DDL on any table, no data written. Re-runnable.
-- To roll back, re-apply the definition from
-- db/migrations/20260220_user_intelligence_platform.sql; note that doing so
-- restores a function that raises on every call.

BEGIN;

-- The tier ladder as a single SQL definition, so the ordering stops being
-- re-spelled in each place that needs it. Mirrors TIER_LEVELS in
-- license-manager.ts and TIER_RANK in entitlements/mdx-entitlements.ts.
--
-- Returns NULL for an unknown tier rather than a number: a tier this function
-- does not recognise must not silently rank as free (which would lock a paying
-- customer out of everything) or as enterprise (which would hand them the lot).
-- Callers decide what to do with the NULL, and both callers below choose
-- `standard` — the same default getLicenseInfo applies.
CREATE OR REPLACE FUNCTION module_tier_level(p_tier TEXT)
RETURNS INTEGER AS $$
  SELECT CASE lower(coalesce(p_tier, ''))
           WHEN 'free' THEN 0
           WHEN 'standard' THEN 1
           WHEN 'professional' THEN 2
           WHEN 'enterprise' THEN 3
           ELSE NULL
         END;
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION module_tier_level(TEXT) IS
  'Ascending rank of a subscription tier (free 0 … enterprise 3); NULL when unrecognised. Mirrors TIER_LEVELS in server/services/license-manager.ts.';

CREATE OR REPLACE FUNCTION provision_org_modules(p_org_id INTEGER)
RETURNS void AS $$
DECLARE
  v_tier     TEXT;
  v_industry TEXT;
  v_level    INTEGER;
  v_mod      RECORD;
BEGIN
  SELECT tier, industry_mode INTO v_tier, v_industry
  FROM organizations WHERE id = p_org_id;

  IF v_tier IS NULL THEN v_tier := 'standard'; END IF;
  IF v_industry IS NULL THEN v_industry := 'biotech'; END IF;

  v_level := module_tier_level(v_tier);
  IF v_level IS NULL THEN v_level := module_tier_level('standard'); END IF;

  FOR v_mod IN
    -- `metadata::jsonb` once, here, rather than at each use: this is the cast
    -- whose absence was defect 1.
    SELECT module_id, COALESCE(metadata::jsonb, '{}'::jsonb) AS meta
    FROM available_modules
    WHERE COALESCE((metadata::jsonb->>'deprecated')::boolean, false) = false
  LOOP
    IF (
         -- UNRESTRICTED means every tier. Absent key, wrong type, and empty
         -- array all mean the same thing, and all three occur: the catalog
         -- seeds `"tiers": []`, older rows have no key, and a hand-edited row
         -- can hold anything. `jsonb_typeof(...) IS DISTINCT FROM 'array'`
         -- covers absent and malformed in one test without raising on either.
         jsonb_typeof(v_mod.meta->'tiers') IS DISTINCT FROM 'array'
         OR jsonb_array_length(v_mod.meta->'tiers') = 0
         -- Otherwise: entitled from the LOWEST listed tier upward. This is
         -- defect 2 — it was `=`.
         OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(v_mod.meta->'tiers') AS t
              WHERE module_tier_level(t) IS NOT NULL
                AND v_level >= module_tier_level(t)
            )
       )
       AND (
         -- Industry is an exact-set test, not a ladder — there is no ordering
         -- over 'biotech' / 'medtech', so `>=` would be meaningless here.
         jsonb_typeof(v_mod.meta->'industries') IS DISTINCT FROM 'array'
         OR jsonb_array_length(v_mod.meta->'industries') = 0
         OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(v_mod.meta->'industries') AS i
              WHERE i = v_industry
            )
       )
    THEN
      -- DO NOTHING, not DO UPDATE: a row that already exists carries a
      -- decision — an admin's explicit disable, or an earlier grant — and
      -- re-provisioning must not silently re-enable something someone turned
      -- off. This matches the original and is deliberate.
      INSERT INTO module_subscriptions (organization_id, module_id, enabled, enabled_at)
      VALUES (p_org_id, v_mod.module_id, true, NOW())
      ON CONFLICT (organization_id, module_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION provision_org_modules(INTEGER) IS
  'Grants an organization every catalog module its tier and industry_mode qualify for, inclusive of lower tiers. Never re-enables a module an admin disabled.';

COMMIT;
