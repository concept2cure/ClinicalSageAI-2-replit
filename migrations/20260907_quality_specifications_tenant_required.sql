-- ============================================================================
-- quality_specifications.tenant_id is REQUIRED — a tenant-less specification
-- belongs to nobody, not to everybody.
--
-- WHY
-- ---
-- server/api/cmc/specificationRoutes.ts scoped every read of this table with
-- `(tenant_id = $n OR tenant_id IS NULL)`, and its PUT carried no tenant
-- predicate on the UPDATE at all. A NULL-tenant row was therefore readable AND
-- writable by every organization, and the governed approve path would e-sign
-- it under the wrong org — contaminating 3.2.S.4 / 3.2.P.5 content in a
-- submission-bound record. Those routes are now strictly `tenant_id = $n`
-- (same rationale server/routes/part11-compliance.ts:479-486 records for
-- dropping its own unattributed-row disjunct: the application scope must not
-- be looser than the RLS policy behind it, and migrations/0021's policy
-- excludes NULL because `NULL = <int>` is NULL).
--
-- This file closes the store half. Nothing in the product creates a global
-- specification: the only INSERT stamps the caller's tenant behind a 401, and
-- no seeder, script or fixture writes this table. So a NULL tenant_id is
-- always an accident, and the two ways it happens are latent rather than
-- historical:
--   * db/migrations/20260401_cmc_convergence_os.sql:127 added tenant_id to an
--     ALREADY POPULATED quality_specifications on hand-provisioned databases,
--     with no backfill anywhere;
--   * shared/cmc-schema.ts's `qualitySpecifications` pgTable declares no
--     tenantId at all, so any future writer routed through drizzle would
--     insert NULL.
--
-- WHY `NOT VALID`, NOT `SET NOT NULL`
-- -----------------------------------
-- Legacy NULL rows exist on exactly the installs this ships to; SET NOT NULL
-- would abort the deploy on the first one. NOT VALID enforces the constraint
-- on every row INSERTed or UPDATEd from here on while leaving historical rows
-- in place. Nothing is deleted.
--
-- OPERATOR NOTE — legacy rows become invisible
-- --------------------------------------------
-- After the route fix, a pre-existing NULL-tenant specification is returned to
-- no organization. That is the fail-closed outcome and it is what RLS_ENFORCE=on
-- already did in production; on an upgraded install with RLS off a CMC user may
-- notice such rows disappear from the Module 3 Specifications register. The
-- rows are still there. The remedy is to attribute them once ownership is
-- established from specification_audit_log:
--     UPDATE quality_specifications SET tenant_id = <org>
--      WHERE id = '<uuid>' AND tenant_id IS NULL;
-- Do NOT bulk-assign: nothing in the data says who they belong to.
--
-- Type-agnostic on purpose: on a legacy install 20260401 left the column TEXT,
-- and `IS NOT NULL` holds either way.
-- Idempotent: guarded on to_regclass and on the constraint not already existing.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.quality_specifications') IS NULL THEN
    RAISE NOTICE 'quality_specifications absent; skipping tenant_id constraint';
  ELSIF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.quality_specifications'::regclass
       AND conname  = 'quality_specifications_tenant_id_required'
  ) THEN
    RAISE NOTICE 'quality_specifications_tenant_id_required already present';
  ELSE
    EXECUTE $ddl$
      ALTER TABLE public.quality_specifications
        ADD CONSTRAINT quality_specifications_tenant_id_required
        CHECK (tenant_id IS NOT NULL) NOT VALID
    $ddl$;
  END IF;
END $$;
