-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Isolate 21 child tables that hold tenant data but carry no tenant
--          column, by scoping them to their tenant-keyed parent row.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting — CSR detail, document versions, CER exports,
--     chat/AI threads, RAG chunks, 510(k) stage progress, programme milestones
--   - Integrity Risk Addressed: cross-tenant read. These tables were fully
--     readable by any tenant: no tenant column, no RLS, no policy.
--
-- Determinism Contract:
--   - Visibility is derived from the parent row's tenant, so a child can never
--     disagree with its parent about who owns it.
-- =============================================================================
--
-- 20260813_child_table_parent_scoped_rls.sql
--
-- ── How these were found, and why exactly these 21 ──────────────────────────
-- Against a fully provisioned database (install-fresh + deploy-migrate), of 937
-- public base tables, 195 carry no organization_id / tenant_id / org_id. That
-- number alone is not a finding: most are reference data, config, or join
-- tables. Narrowing to what actually matters:
--
--   195  no tenant column
--   170  ... and no RLS policy AND RLS not enabled
--    78  ... and referenced by server SQL (reachable from a request)
--    21  ... and holding a FOREIGN KEY to a table that IS tenant-keyed
--
-- That last cut is the one this migration acts on, and it is mechanical rather
-- than a judgement call: if a row's parent belongs to a tenant, the row belongs
-- to that tenant. The FK is the evidence, so the fix is a parent-scoped policy
-- and NOT a new organization_id column — adding one would duplicate the truth
-- and let the copy drift away from the parent.
--
-- The remaining 57 are deliberately untouched here. Each needs its own decision
-- (estate-wide reference data, platform config, or a genuine missing tenant
-- key), and bulk-guessing them is how a schema acquires columns nothing writes.
-- They are recorded in docs/reports/unprotected-tables-baseline.json with the
-- evidence, and the guard there prevents the list from growing.
--
-- ── Why the policy shape is copied, not invented ────────────────────────────
-- The predicate is 20260801_tenant_isolation_sweep.sql's policy with the tenant
-- comparison redirected at the PARENT row: same session variables, same
-- `app.rls_enforce` bypass, same app_super_admin escape hatch. Matching matters
-- in both directions — a stricter policy here would make these tables fail in
-- non-enforcing environments where every sibling still reads fine, and a looser
-- one would leave a hole shaped exactly like the one being closed.
--
-- ── Tables with two tenant-keyed parents ────────────────────────────────────
-- ai_generation_runs references both ai_threads and ai_retrieval_runs;
-- lumen_atom_conflicts references lumen_data_atoms twice (atom_a_id, atom_b_id).
-- One owner is chosen per table — the thread, and atom_a — because the policy
-- must remain true for a row whose second reference is NULL. A conflict row
-- spanning two tenants' atoms is a separate integrity question and is not
-- something a visibility policy can express.
--
-- Idempotent: guarded on pg_policies and pg_class, safe to re-run every deploy.

BEGIN;

DO $$
DECLARE
  rec RECORD;
  -- child, fk column, parent, parent key column, parent tenant column.
  -- Derived from pg_constraint against the provisioned schema, not hand-typed.
  specs TEXT[][] := ARRAY[
    ['ai_generation_runs',         'thread_id',        'ai_threads',           'id',       'organization_id'],
    ['ai_messages',                'thread_id',        'ai_threads',           'id',       'organization_id'],
    ['ai_retrieval_chunks',        'retrieval_run_id', 'ai_retrieval_runs',    'id',       'organization_id'],
    ['approval_checkpoints',       'workflow_run_id',  'workflow_runs',        'id',       'organization_id'],
    ['audit_trail',                'leaf_id',          'leaves',               'leaf_id',  'organization_id'],
    ['c2c_correspondence_issues',  'correspondence_id','c2c_correspondence',   'id',       'organization_id'],
    ['c2c_document_sections',      'document_id',      'c2c_documents',        'id',       'org_id'],
    ['cer_exports',                'report_id',        'cer_reports',          'report_id','organization_id'],
    ['chat_messages',              'thread_id',        'chat_threads',         'id',       'organization_id'],
    ['cmc_document_versions',      'document_id',      'cmc_documents',        'id',       'organization_id'],
    ['coauthor_document_versions', 'document_id',      'coauthor_documents',   'id',       'organization_id'],
    ['csr_details',                'report_id',        'csr_reports',          'id',       'organization_id'],
    ['document_versions',          'document_id',      'documents',            'id',       'organization_id'],
    ['embedding_audit_log',        'atom_id',          'lumen_data_atoms',     'id',       'organization_id'],
    ['fda_510k_stage_progress',    'project_id',       'fda_510k_projects',    'id',       'organization_id'],
    ['lumen_atom_citations',       'atom_id',          'lumen_data_atoms',     'id',       'organization_id'],
    ['lumen_atom_conflicts',       'atom_a_id',        'lumen_data_atoms',     'id',       'organization_id'],
    ['lumen_atom_quality_scores',  'atom_id',          'lumen_data_atoms',     'id',       'organization_id'],
    ['lumen_atom_versions',        'atom_id',          'lumen_data_atoms',     'id',       'organization_id'],
    ['program_milestones',         'program_id',       'regulatory_programs',  'id',       'organization_id'],
    ['rag_chunks',                 'document_id',      'rag_documents',        'id',       'organization_id']
  ];
  i INT;
  child TEXT; fk_col TEXT; parent TEXT; parent_col TEXT; parent_tenant TEXT;
  predicate TEXT;
  applied INT := 0;
  skipped INT := 0;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    child         := specs[i][1];
    fk_col        := specs[i][2];
    parent        := specs[i][3];
    parent_col    := specs[i][4];
    parent_tenant := specs[i][5];

    -- Every reference is verified against the LIVE catalog before use. A
    -- deployment that never created one of these tables (or renamed a column)
    -- must be skipped with a notice, not abort the deploy.
    IF to_regclass('public.' || child) IS NULL OR to_regclass('public.' || parent) IS NULL THEN
      RAISE NOTICE '[child-rls] % or % absent — skipping', child, parent;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=child AND column_name=fk_col)
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=parent AND column_name=parent_col)
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=parent AND column_name=parent_tenant) THEN
      RAISE NOTICE '[child-rls] % column shape differs from expectation — skipping', child;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    -- ENABLE alone leaves the table OWNER unfiltered; FORCE is what subjects it.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', child);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', child);

    IF EXISTS (SELECT 1 FROM pg_policies
                WHERE schemaname='public' AND tablename=child
                  AND policyname='tenant_isolation_policy') THEN
      -- Never clobber a subsystem's own policy — the sweep makes the same
      -- promise, and two migrations racing to redefine one table's visibility
      -- is how a policy silently loosens.
      RAISE NOTICE '[child-rls] % already policied — leaving it alone', child;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    -- The sweep's predicate with the tenant comparison redirected at the parent.
    predicate := format(
      $p$EXISTS (
           SELECT 1 FROM public.%I p
            WHERE p.%I = public.%I.%I
              AND ( p.%I = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
                 OR p.%I = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT )
         )$p$,
      parent, parent_col, child, fk_col, parent_tenant, parent_tenant);

    EXECUTE format($pol$
      CREATE POLICY tenant_isolation_policy ON public.%I
        FOR ALL
        USING (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          OR %s
        )
        WITH CHECK (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          OR %s
        )
    $pol$, child, predicate, predicate);

    applied := applied + 1;
    RAISE NOTICE '[child-rls] % scoped to %(%)', child, parent, parent_tenant;
  END LOOP;

  RAISE NOTICE '[child-rls] % policied, % skipped', applied, skipped;
END
$$;

COMMIT;
