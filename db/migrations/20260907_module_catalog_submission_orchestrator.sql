-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Seed the submission-orchestrator surface into available_modules so
--          it can be licensed, provisioned and administered like every other
--          app now that the shell presents it in the "Submit & file" group.
--
-- eCTD/CTD Context:
--   - Module(s): the whole eCTD build pipeline — Module 2 summaries, Module 3
--     composition, CSR tabulation, package assembly, hardened validation, and
--     the 21 CFR Part 11 release signature.
--   - Integrity Risk Addressed: a surface the shell offers but the catalog does
--     not know is UNGATABLE (module_subscriptions.module_id is a foreign key
--     into this table, so no admin decision about it can be written down or
--     audited) and SILENTLY FREE (the client entitlement layer holds,
--     correctly, that an unknown id is not licensable — so catalog silence
--     reads as "included" for every organization on every tier). For a surface
--     that can e-sign and release a regulatory submission, an entitlement
--     nobody can record or revoke is the wrong default.
--
-- Determinism Contract:
--   - Data-only. No DDL, no canonical schema change, no evidence pointer moves.
--
-- Notes:
--   - available_modules is the GLOBAL catalog, not tenant-keyed; the per-org
--     grant lives in module_subscriptions, which already carries tenant policy.
--   - Idempotent: ON CONFLICT (module_id) DO UPDATE, re-runnable without drift.
-- =============================================================================

BEGIN;

-- WHY THIS FILE EXISTS.
--
-- `submission-orchestrator` shipped as a registered, routed surface with a
-- working component and passing tests, and was still unreachable: it appeared
-- in none of the four segment "Submit & file" groups and was absent from the
-- shared/navigation NAVIGATION_TARGETS list AnA navigates by. Adding it to
-- both — which is what makes it reachable — also makes it a SHELL APP, and
-- moduleCatalogReconciliation.test.ts holds the invariant that the shell must
-- never present an app the catalog cannot express an entitlement for.
--
-- That test is the reason this migration exists, and it caught a real gap
-- rather than an incidental one: without this row an operator could not grant,
-- disable, or audit access to the surface that performs package release.
--
-- TIERING. 'standard' matches its siblings in the Submit & file group
-- (submission-center, submission-twin, gateway-transmittals are all reachable
-- on standard). No earlier file classifies this id, so THIS file owns its tier;
-- a later re-tiering must be ordered after this file or made in it.
--
-- CATEGORY. 'Submit & file' mirrors the nav group the shell renders it in, so
-- the catalog reads the way the product does.

-- One row per line: moduleCatalogReconciliation.test.ts parses these files
-- structurally with /^\s*\('([a-z0-9-]+)'/ , so a row whose opening paren and
-- module_id sit on different lines is invisible to the guard — the catalog
-- would read as missing this row while the database held it.
INSERT INTO available_modules (module_id, name, description, category, path, icon, sort_order, metadata) VALUES
  ('submission-orchestrator', 'Submission orchestrator', 'The eCTD build pipeline — composes Module 3 (drug substance, drug product, appendices, regional), tabulates the CSR under ICH E3 §10-§12, builds the Module 2 summaries, assembles and validates the package against the target gateway, and takes the 21 CFR Part 11 release signature. Reports per-step status, an append-only audit trail, and the verified record that signature binds.', 'Submit & file', '/concept2cure/submission-orchestrator', 'workflow', 150, '{"tiers": ["standard"], "industries": []}'::json)
ON CONFLICT (module_id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  path        = EXCLUDED.path,
  icon        = EXCLUDED.icon,
  sort_order  = EXCLUDED.sort_order,
  -- Seed-only, as everywhere else in this catalog: the admin toggle writes
  -- module_subscriptions.enabled and nothing UPDATEs available_modules.metadata,
  -- so there is no operator-authored tier to preserve here.
  metadata    = EXCLUDED.metadata,
  updated_at  = now()
-- Only write when something actually differs. The out-of-band applier re-applies
-- every file on every deploy (see CLAUDE.md RULE 1), so an unguarded DO UPDATE
-- bumps updated_at on every deploy and destroys the column's meaning.
WHERE available_modules.name        IS DISTINCT FROM EXCLUDED.name
   OR available_modules.description IS DISTINCT FROM EXCLUDED.description
   OR available_modules.category    IS DISTINCT FROM EXCLUDED.category
   OR available_modules.path        IS DISTINCT FROM EXCLUDED.path
   OR available_modules.icon        IS DISTINCT FROM EXCLUDED.icon
   OR available_modules.sort_order  IS DISTINCT FROM EXCLUDED.sort_order
   OR available_modules.metadata::jsonb IS DISTINCT FROM EXCLUDED.metadata::jsonb;

-- Assert the end state rather than assuming the upsert did what it reads like.
-- A row that landed deprecated, or carrying a tier other than the one decided
-- above, is worse than a failed migration: the catalog would look complete
-- while the entitlement it expresses is not the one anyone agreed to. For a
-- surface that releases regulatory submissions, fail closed instead.
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(want.module_id, ', ' ORDER BY want.module_id) INTO v_bad
  FROM (VALUES ('submission-orchestrator'::text)) AS want(module_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM available_modules m
     WHERE m.module_id = want.module_id
       AND m.metadata::jsonb -> 'tiers' = '["standard"]'::jsonb
       AND COALESCE((m.metadata::jsonb->>'deprecated')::boolean, false) = false
  );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'submission-orchestrator catalog row is missing or not packaged at standard: %', v_bad;
  END IF;
END $$;

COMMIT;
