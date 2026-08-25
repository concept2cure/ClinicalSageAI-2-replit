-- 20260821_regulatory_twin_simulations_tenant_scope.sql
--
-- Give public.regulatory_twin_simulations a tenant key, so the digital-twin
-- routes stop serving every tenant's simulations to every tenant.
--
-- ── The exposure ─────────────────────────────────────────────────────────────
-- The table had no tenant column at all, and server/routes/regulatory-digital-twin.ts
-- listed from it with no predicate:
--
--     SELECT id, submission_type, therapeutic_area, created_at, results
--       FROM regulatory_twin_simulations ORDER BY created_at DESC LIMIT 100
--
-- so GET /simulations returned every tenant's rows, and GET /simulations/:id
-- returned any tenant's row to anyone holding the id. The stored
-- submission_profile carries the submission type, therapeutic area and target
-- agencies — on a platform holding unannounced programmes, that is the
-- confidential part. The simulations themselves are disclosed in-code as
-- illustrative RNG output rather than predictions, which bounds the harm but
-- does not remove it.
--
-- ── Why this file is separate from the table's creator ───────────────────────
-- migrations/20260821_regulatory_twin_simulations.sql puts the table on a
-- durable apply path with the shape it already had. This one changes that shape.
-- Keeping them apart means the port is reviewable as a no-op and the tenant
-- change is reviewable on its own, and it matches the pattern the
-- workflow_document_versions trio already set (provision, then add the tenant
-- column, then tighten).
--
-- ── NOT NULL only when it can be honest ──────────────────────────────────────
-- The column is added NULLABLE first, then tightened to NOT NULL only if no row
-- is left without one. On any database provisioned from scratch the table is
-- empty and it tightens immediately. On a database where the old runtime DDL
-- ran and rows accumulated, there is nothing to backfill FROM — those rows were
-- written with no tenant and no way to infer one — so inventing an owner would
-- be worse than leaving them. They stay NULL, which the tenant policy treats as
-- matching nobody: previously visible to everyone, now visible to no one, and
-- no data destroyed. The NOTICE says exactly how many are in that state so an
-- operator can attribute or delete them and re-run.

ALTER TABLE public.regulatory_twin_simulations
  ADD COLUMN IF NOT EXISTS organization_id integer;

-- FK to organizations so the column cannot hold an org that does not exist.
-- Guarded: a re-run must not fail on the constraint it created last time.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
     WHERE n.nspname = 'public'
       AND r.relname = 'regulatory_twin_simulations'
       AND c.conname = 'fk_reg_twin_sim_org'
  ) THEN
    ALTER TABLE public.regulatory_twin_simulations
      ADD CONSTRAINT fk_reg_twin_sim_org
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reg_twin_sim_org
  ON public.regulatory_twin_simulations (organization_id);

-- Tighten only when it is true.
DO $$
DECLARE orphaned BIGINT;
BEGIN
  SELECT count(*) INTO orphaned
    FROM public.regulatory_twin_simulations WHERE organization_id IS NULL;

  IF orphaned = 0 THEN
    ALTER TABLE public.regulatory_twin_simulations
      ALTER COLUMN organization_id SET NOT NULL;
    RAISE NOTICE '[reg-twin-tenant] organization_id is NOT NULL — every simulation is tenant-owned';
  ELSE
    RAISE NOTICE '[reg-twin-tenant] % pre-existing simulation(s) have no tenant and cannot be attributed. '
                 'organization_id is left NULLABLE. Those rows now match no tenant policy, so they are '
                 'visible to nobody rather than to everybody. Attribute or delete them, then re-run this '
                 'migration to tighten the column.', orphaned;
  END IF;
END $$;

-- RLS is attached by the canonical sweep (db/migrations/20260801_tenant_isolation_sweep.sql),
-- which runs last on this path and now sees an integer-keyed tenant column here.
-- Deliberately not written by hand: one policy shape, one allowlist.
