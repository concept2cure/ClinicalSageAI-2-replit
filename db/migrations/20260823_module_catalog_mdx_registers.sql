-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Seed the two device design registers — design controls (DHF) and
--          human factors (HFE/UE) — into available_modules so they can be
--          licensed, provisioned and administered like every other app.
--
-- eCTD/CTD Context:
--   - Module(s): device technical documentation (FDA eSTAR / EU MDR Annex II)
--   - Integrity Risk Addressed: a surface with no catalog row cannot be granted,
--     cannot be disabled, and cannot be recorded against an organization at all
--     — module_subscriptions.module_id is a foreign key into this table, so the
--     absence of a row means no admin decision about these two registers can be
--     written down, let alone audited.
--
-- Determinism Contract:
--   - Data-only. No DDL, no canonical schema change, no evidence pointer moves.
--
-- Notes:
--   - available_modules is the GLOBAL catalog, not tenant-keyed; the per-org
--     grant lives in module_subscriptions, which already carries tenant policy.
--   - Idempotent: ON CONFLICT (module_id) DO UPDATE, re-runnable without drift.
-- =============================================================================

-- Seed the two MDX registers the catalog never knew about.
--
-- THE DEFECT. `design-controls` and `human-factors` are real, built surfaces:
-- both are declared 'mdx' in NAV_GROUP_OF, both resolve to a rendered component
-- in the v2 surface view map, both are reachable today by command palette, deep
-- link, the medtech segment focus list and the medtech quick actions, and both
-- are backed by live org-scoped stores with their own read and write routes.
--
-- CORRECTION (prose only — no statement below changed). This header originally
-- read "Neither has ever had a row in available_modules." That was wrong:
-- migrations/20260814j_catalog_missing_product_surfaces.sql seeded both, in the
-- ROOT migrations/ tree rather than db/migrations/, under different names
-- ('Design controls', 'Human factors'), a different category ('Device &
-- diagnostics' rather than 'Evidence & data') and different sort orders
-- (210/220 rather than 255/305) — and, being from before packaging was decided,
-- with `{"tiers": []}`, which is what actually made them unsellable.
--
-- So this file RE-KEYS two existing rows rather than adding two missing ones.
-- Nothing about the SQL needs to change for that: the INSERT is an upsert whose
-- DO UPDATE sets every column, C2C_MIGRATION_FILES orders this file after
-- 20260814j, and the DO block below asserts the end state — so the definition
-- here wins deterministically on every apply. The end state was always right;
-- only this description of how it was reached was not.
--
-- The reconciliation gate (moduleCatalogReconciliation.test.ts) records the
-- re-key in its KNOWN_RESEEDS list, so this pair is acknowledged and any NEW
-- accidental double-seed still fails.
--
-- A missing catalog row is not a cosmetic gap. It removes all three of the
-- things a catalog row is for, in three different layers:
--
--   UNSELLABLE.  Packaging is expressed as `metadata.tiers` ON THE CATALOG ROW.
--                No row means no tier can name them, so no plan — free through
--                enterprise — can include them, and provision_org_modules()
--                (which iterates available_modules) can never grant them.
--   UNGATABLE.   module_subscriptions.module_id REFERENCES
--                available_modules(module_id). With no parent row the admin
--                toggle has nothing to write against: an operator cannot
--                disable these registers for an org even deliberately.
--   SILENTLY FREE. The client entitlement layer holds, correctly, that AN
--                UNKNOWN ID IS NOT LICENSABLE — an id absent from the payload is
--                unconditionally available and renders no lock. That rule exists
--                so a failed or partial fetch never tells a paying customer they
--                do not own what they paid for, and it is right. But it means
--                the catalog's silence about these two reads as "included",
--                permanently and invisibly, for every organization on every
--                tier. Nothing is broken on screen; the entitlement is simply
--                not a decision anyone has made.
--
-- WHY THEY WERE MISSED. 20260810_reconcile_module_catalog.sql built its 84 rows
-- from the app list the shell presents on Home (SEGMENT_MODULES in the v2
-- registry model). These two ids are NOT in SEGMENT_MODULES. They sit in
-- NAV_HIDDEN — "reachable via ⌘K/deep-link but intentionally not rail entries"
-- — and are surfaced instead through the medtech segment's focus list and
-- quick-action row. So the seed was complete with respect to the list it was
-- derived from, and short by exactly the two surfaces that list omits. That is
-- also why nothing has noticed since: every check compares the catalog against
-- the same source the catalog was built from.
--
-- 20260823_module_catalog_commercial_packaging.sql found the gap while applying
-- tiers and named it as item 2 of what it surfaces but does not fix — "Either
-- seed them or decide they are permanently unrestricted." This file is that
-- decision: they are seeded, and they are sold.
--
-- WHY STANDARD. Standard is "do the work" — the whole authoring-to-filing path
-- for a company running its own programs. Every other device authoring and
-- evidence register already sits there, and the medtech Standard plan in
-- billing.ts PRICING already promises the surrounding set by name: 510(k)
-- Workflow, CER, Predicate Intelligence, eSTAR Builder, GSPR Mapping. A design
-- history file and a usability engineering file are not an upsell on top of a
-- 510(k) — they are two of the sections the submission is made of, and a device
-- customer who cannot open them cannot assemble the submission the tier already
-- sold them. Putting either at professional would reproduce exactly the
-- per-module unbundling the packaging file argues against.
--
-- `industries` stays [], for the reason the packaging file gives: industry is a
-- relevance filter, not a licence, and the segment switcher already scopes what
-- a medtech customer sees. An industry lock is the one lock no purchase can
-- remedy.
--
-- CATEGORY AND ORDER. 'Evidence & data', with device-engineering and
-- device-software, which are the closest siblings — the same regulated-record
-- registers, one program-scoped and one lifecycle. getModuleCatalog serves the
-- catalog with `ORDER BY am.sort_order` and nothing else, so a collision is a
-- non-deterministic tie, not a cosmetic one. 255 and 305 are unused and keep the
-- category in the alphabetical-by-id order the 20260810 seed laid down:
-- decision-lineage (250) · design-controls (255) · device-* (260-290) ·
-- evidence-search (300) · human-factors (305) · insights (310).
--
-- ── THE ORDER OF THIS FILE IS LOAD-BEARING ────────────────────────────────────
--
-- The out-of-band applier re-applies EVERY file on EVERY deploy, and two files
-- ahead of this one hold opinions about rows they have never heard of:
--
--   20260810 step 1 retires every catalog row NOT in its protected id list by
--   stamping {"deprecated": true}. That list was derived from the same source
--   that omitted these two ids, so BOTH ROWS ARE RE-RETIRED at the start of
--   every pass, for as long as that list stands.
--
--   The packaging file then asserts catalog completeness — it raises 'catalog
--   modules with no tier assigned' for any LIVE row its own fixed 84-id
--   module_packaging list does not name — and these two ids are not in it.
--
-- Those two facts happen to cancel, and only in this order: by the time the
-- packaging assertion runs, the seed has already marked these ids deprecated, so
-- the assertion skips them; this file, running after both, clears the flag and
-- restores the rows. Both halves were verified by execution rather than by
-- reading — with the flag set the packaging file applies clean, and with these
-- rows live it raises on exactly 'design-controls, human-factors'.
--
-- So ordering this file after BOTH of them is a correctness requirement, not
-- tidiness. Moved above the packaging migration, it breaks the next deploy.
--
-- The tidier end state is two edits that must land TOGETHER, and neither is made
-- here because both belong to files this change does not own: add these ids to
-- 20260810's protected list so they stop being retired, AND add
-- ('design-controls', 'standard') and ('human-factors', 'standard') to the
-- packaging file's module_packaging list so the completeness assertion — which
-- would then see them — is satisfied. Doing only the first breaks the deploy;
-- that is the branch proved above.
--
-- ── REVERSIBILITY ─────────────────────────────────────────────────────────────
-- Data-only, one transaction, no DDL, two rows. Re-running is a no-op.
--
-- Do NOT revert with DELETE. module_subscriptions.module_id carries
-- ON DELETE CASCADE, so by the time anyone rolls back, an organization may hold
-- a real grant for these ids and deleting the catalog row would destroy that
-- grant record silently — the same hazard 20260810 exists to avoid. Reverse
-- VISIBILITY instead, which is what "not in the catalog" meant before this file:
--   UPDATE available_modules
--      SET metadata = (metadata::jsonb || '{"deprecated": true}'::jsonb)::json,
--          updated_at = now()
--    WHERE module_id IN ('design-controls', 'human-factors');
-- getModuleCatalog and provision_org_modules both filter on `deprecated`, so
-- that restores the previous behaviour exactly — both surfaces stay reachable
-- and unconditionally available, and no subscription row is touched. Dropping
-- this file from the migration set reaches the same state on the next apply
-- without a statement being run, since 20260810 re-stamps the flag itself.

BEGIN;

INSERT INTO available_modules (module_id, name, description, category, path, icon, sort_order, metadata) VALUES
  ('design-controls', 'Design controls (DHF)', 'The design control register for ISO 13485 and 21 CFR 820.30 — design inputs and outputs, design reviews, verification and validation, and the traceability matrix that ties each requirement to the evidence that satisfies it.', 'Evidence & data', '/concept2cure/design-controls', 'gitBranch', 255, '{"tiers": ["standard"], "industries": []}'::json),
  ('human-factors', 'Human factors (IEC 62366-1)', 'Usability engineering under IEC 62366-1 — use-related risk analysis and critical tasks, formative and summative evaluation, and the usability engineering file that supports the submission.', 'Evidence & data', '/concept2cure/human-factors', 'users', 305, '{"tiers": ["standard"], "industries": []}'::json)
ON CONFLICT (module_id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  path        = EXCLUDED.path,
  icon        = EXCLUDED.icon,
  sort_order  = EXCLUDED.sort_order,
  -- Assign the policy outright, as 20260810 does. `metadata` is seed-only in
  -- this codebase — the admin toggle writes module_subscriptions.enabled and
  -- nothing anywhere UPDATEs available_modules.metadata — so there is no
  -- operator-authored tier to preserve here. Worth stating plainly: because no
  -- earlier file classifies these two ids, THIS file owns their tier, and it is
  -- ordered after the commercial-packaging migration, so it wins on every
  -- re-apply. A later decision to re-tier them must be ordered after this file
  -- or made in it; a re-tiering placed before it would be silently overwritten.
  metadata    = EXCLUDED.metadata,
  updated_at  = now()
-- Only write when something actually differs. Without this guard the DO UPDATE
-- fires on every conflict, so `updated_at` is bumped on every re-apply — and the
-- out-of-band applier re-applies every file on every deploy. That churn destroys
-- the only signal these rows carry about when their content last really changed,
-- and it does it silently, which is the same class of defect as a migration that
-- "succeeds" while changing nothing anyone intended. With the guard, re-running
-- reports INSERT 0 0 and the row version is untouched.
WHERE available_modules.name        IS DISTINCT FROM EXCLUDED.name
   OR available_modules.description IS DISTINCT FROM EXCLUDED.description
   OR available_modules.category    IS DISTINCT FROM EXCLUDED.category
   OR available_modules.path        IS DISTINCT FROM EXCLUDED.path
   OR available_modules.icon        IS DISTINCT FROM EXCLUDED.icon
   OR available_modules.sort_order  IS DISTINCT FROM EXCLUDED.sort_order
   OR available_modules.metadata::jsonb IS DISTINCT FROM EXCLUDED.metadata::jsonb;

-- Assert the end state rather than assuming the upsert did what it reads like.
-- A row that landed still deprecated — the flag 20260810 re-stamps on every pass
-- — or carrying any tier other than the one decided above is worse than a failed
-- migration: the catalog would look complete while the entitlement it expresses
-- is not the entitlement anyone agreed to. Fail closed instead.
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(want.module_id, ', ' ORDER BY want.module_id) INTO v_bad
  FROM (VALUES ('design-controls'::text), ('human-factors')) AS want(module_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM available_modules m
     WHERE m.module_id = want.module_id
       AND m.metadata::jsonb -> 'tiers' = '["standard"]'::jsonb
       AND COALESCE((m.metadata::jsonb->>'deprecated')::boolean, false) = false
  );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'MDX register rows are missing or not packaged at standard: %', v_bad;
  END IF;
END $$;

COMMIT;
