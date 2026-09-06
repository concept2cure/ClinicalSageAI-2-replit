-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Tenant-isolate the three IVDR append-only history tables, which the
--          C-33 sweep cannot see because they carry no tenant column of their
--          own — their tenant is their parent's.
--
-- eCTD/CTD Context:
--   - Module(s): all (cross-cutting isolation)
--   - Integrity Risk Addressed: tenant isolation — an RLS-less table under
--     RLS_ENFORCE=on is fully readable across tenants
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - Additive and fully idempotent: guarded on pg_policies, re-running policies
--     nothing new. It creates no object any other file drops (see CLAUDE.md
--     RULE 1 — this appends, and appends only CREATEs).
-- =============================================================================
--
-- THE HOLE, MEASURED 2026-09-06 on the dev database as the app role `c2c`
-- (not a superuser), with app.rls_enforce='on' and app.current_tenant_id='9002':
--
--   parent  ivdr_analytical_validations       1 of 2 rows visible   (policied)
--   child   ivdr_validation_parameter_history 2 of 2 rows visible   (NO RLS)
--
-- The second row read "org 9001 secret LoD". One IVD manufacturer could read
-- another's limit-of-detection history — and these three tables are the
-- append-only audit trails whose whole value is that nobody else can touch them.
--
-- WHY THE C-33 SWEEP MISSES THEM. db/migrations/20260801_tenant_isolation_sweep.sql
-- policies every table carrying organization_id / org_id / tenant_id. These three
-- carry none: their tenant reaches them through a foreign key
-- (validation_id / workflow_id / evidence_id). They are invisible to the sweep,
-- so they have sat with relrowsecurity = false and zero policies.
--
-- WHY A PARENT-SCOPED POLICY RATHER THAN A LOCAL organization_id COLUMN.
-- Denormalising the tenant onto an append-only audit row creates a second copy
-- of a fact that can disagree with the first — and on an audit trail, two
-- answers to "whose row is this?" is worse than the join. The sweep's own header
-- names this shape as legitimate and promises not to clobber it: it "never
-- overwrites a hand-tuned policy a subsystem installed for itself (e.g. ... the
-- parent-scoped doc-scoped policies from C-30, which key on a parent's tenant
-- rather than a local column)". The EXISTS form is copied from C-30's
-- vault.document_chunks policies; the tenant predicate inside it is the sweep's
-- own canonical disjunction, so the two converge.
--
-- RELATIONSHIP TO THE APPLICATION FIX OF THE SAME DAY. server/routes/ivdr-routes.ts
-- wrote these history rows FIRST and UNSCOPED, then ran a tenant-scoped UPDATE
-- nobody checked; that is now one statement whose INSERT selects from the scoped
-- UPDATE. This migration is the second line of defence that fix turned out not
-- to have: with no RLS on these tables, the application predicate was the only
-- thing standing between one manufacturer's audit trail and another's.

DO $$
DECLARE
  rec           RECORD;
  applied_count INT := 0;
  -- child table, the FK that reaches its parent, the parent, and the parent's
  -- tenant column. All four are verified below before anything is executed.
  targets CONSTANT TEXT[][] := ARRAY[
    ['ivdr_validation_parameter_history', 'validation_id', 'ivdr_analytical_validations', 'organization_id'],
    ['ivdr_cdx_status_history',           'workflow_id',   'ivdr_cdx_workflows',          'organization_id'],
    ['ivdr_evidence_result_history',      'evidence_id',   'ivdr_clinical_evidence',      'organization_id']
  ];
  child_t  TEXT;
  fk_col   TEXT;
  parent_t TEXT;
  ten_col  TEXT;
  i        INT;
BEGIN
  FOR i IN 1 .. array_length(targets, 1) LOOP
    child_t  := targets[i][1];
    fk_col   := targets[i][2];
    parent_t := targets[i][3];
    ten_col  := targets[i][4];

    -- Skip quietly on a database where the pair is not provisioned; RAISE would
    -- halt a production deploy over a table this file did not create.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = child_t AND column_name = fk_col
    );
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = parent_t AND column_name = ten_col
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', child_t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',  child_t);

    -- Never clobber a policy a later change may have hand-tuned.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = child_t
         AND policyname = 'tenant_isolation_policy'
    );

    -- The tenant disjunction is the sweep's canonical shape, evaluated against
    -- the PARENT's tenant column. `app.current_org_id` holds a uuid, so it is
    -- matched with substring(... from '^[0-9]+$') exactly as the sweep does —
    -- a bare ::INT cast on that GUC throws, and PostgreSQL does not guarantee
    -- OR short-circuiting.
    EXECUTE format($pol$
      CREATE POLICY tenant_isolation_policy ON public.%I
        FOR ALL
        USING (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          OR EXISTS (
               SELECT 1 FROM public.%I p
                WHERE p.id = %I
                  AND (p.%I = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
                       OR p.%I = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT)
             )
        )
        WITH CHECK (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          OR EXISTS (
               SELECT 1 FROM public.%I p
                WHERE p.id = %I
                  AND (p.%I = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
                       OR p.%I = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT)
             )
        )
    $pol$, child_t,
           parent_t, fk_col, ten_col, ten_col,
           parent_t, fk_col, ten_col, ten_col);

    applied_count := applied_count + 1;
  END LOOP;

  RAISE NOTICE '[ivdr-history-rls] parent-scoped tenant_isolation_policy applied to % table(s)', applied_count;
END $$;
