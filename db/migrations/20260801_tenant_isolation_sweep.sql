-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Attach tenant_isolation_policy to every integer-keyed tenant table
--          provisioned AFTER 0021 ran, so tables added on the apply-c2c /
--          deploy-migrate path are never left cross-tenant readable.
--
-- eCTD/CTD Context:
--   - Module(s): all (this is a cross-cutting isolation sweep)
--   - Integrity Risk Addressed: tenant isolation — an RLS-less table under
--     RLS_ENFORCE=on is fully readable across tenants
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS).
-- =============================================================================
--
-- Ledger C-33.
--
-- migrations/0021_enable_rls_everywhere.sql dynamically policies every table
-- carrying organization_id / org_id / tenant_id. But it runs ONCE, on the
-- install-fresh path, and only sees the tables that exist AT THAT MOMENT. Every
-- table added afterwards by the apply-c2c / deploy-migrate set — including the
-- forty previously-deploy-dead files C-33 wires onto that path — lands on an
-- already-provisioned database where 0021 has long since run and will never
-- revisit it. Under RLS_ENFORCE=on a table with no RLS is fully readable across
-- tenants, so without this sweep, wiring those files would provision ~27 new
-- tenant-keyed tables with no isolation at all.
--
-- This is 0021's loop, made re-runnable and deploy-safe, and placed LAST in
-- C2C_MIGRATION_FILES so it sees everything the set just created.
--
-- TWO DELIBERATE DIFFERENCES FROM 0021:
--
--   1. It SKIPS a non-integer tenant column instead of RAISE EXCEPTION. 0021
--      aborts on a TEXT/uuid tenant key (correctly — at install time that is
--      unconverted drift 0020 should have coerced). Here, aborting would halt a
--      PRODUCTION deploy over a pre-existing drift the deploy did not introduce,
--      and deploy-migrate stops at the first failure. A loud NOTICE plus a
--      skipped table is the safe posture: the table stays exactly as it was, and
--      the condition is reported rather than turned into an outage. (This is also
--      why the three uuid/text-keyed files found alongside C-33's batch are NOT
--      wired — see the ledger entry.)
--
--   2. It only ADDS a policy where none exists (guarded on pg_policies), so it
--      never overwrites a hand-tuned policy a subsystem installed for itself
--      (e.g. the authoring subsystem's, or the parent-scoped doc-scoped policies
--      from C-30, which key on a parent's tenant rather than a local column).
--
-- The policy shape is copied from 0021 so the two converge byte-for-byte:
-- shadow-mode bypass when app.rls_enforce != 'on', match against either session
-- var, super-admin escape hatch.
--
-- Fully idempotent: re-running policies nothing new once every table is covered.

DO $$
DECLARE
  rec           RECORD;
  applied_count INT := 0;
  skipped_drift INT := 0;
  -- Tables that intentionally hold no tenant-scoped rows, mirroring 0021's own
  -- allowlist: cross-tenant reference/registry data every tenant reads.
  allowlist TEXT[] := ARRAY[
    'organizations',
    'organization_users',
    'stripe_events',
    'ectd_agency_configs'
  ];
BEGIN
  FOR rec IN
    SELECT DISTINCT c.table_schema, c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name IN ('organization_id', 'org_id', 'tenant_id')
      -- BASE TABLES only: ENABLE ROW LEVEL SECURITY errors on a view/matview, and
      -- a tenant-scoped view inherits isolation from its underlying tables.
      AND EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_schema = c.table_schema
          AND t.table_name = c.table_name
          AND t.table_type = 'BASE TABLE'
      )
      -- Only tables that do not already carry the policy — never clobber a
      -- subsystem's own (C-30's parent-scoped policies included).
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = c.table_schema
          AND p.tablename = c.table_name
          AND p.policyname = 'tenant_isolation_policy'
      )
    ORDER BY c.table_schema, c.table_name, c.column_name
  LOOP
    IF rec.table_name = ANY (allowlist) THEN
      CONTINUE;
    END IF;

    -- Skip, do not abort: see note 1 above.
    IF rec.data_type NOT IN ('integer', 'bigint', 'smallint') THEN
      skipped_drift := skipped_drift + 1;
      RAISE NOTICE '[rls-sweep] SKIPPED %.% — column % is %, not an integer tenant key (run 0020_coerce_text_tenant_columns.sql, or reconcile the identity model)',
        rec.table_schema, rec.table_name, rec.column_name, rec.data_type;
      CONTINUE;
    END IF;

    -- A table may expose more than one tenant column (e.g. organization_id AND
    -- tenant_id). The FOR-loop's SELECT is a single snapshot whose NOT EXISTS
    -- guard is evaluated ONCE, before the loop creates anything, so such a table
    -- is yielded once per column and both rows pass the guard. The first
    -- iteration attaches the policy; the second then aborts
    -- 'policy "tenant_isolation_policy" ... already exists' — which broke this
    -- migration when applied through install-fresh's C2C step (audit_logs).
    -- Re-check at execution time so a table already handled this run is skipped.
    IF EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = rec.table_schema
        AND p.tablename = rec.table_name
        AND p.policyname = 'tenant_isolation_policy'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', rec.table_schema, rec.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', rec.table_schema, rec.table_name);
    EXECUTE format($pol$
      CREATE POLICY tenant_isolation_policy ON %I.%I
        FOR ALL
        USING (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR %I = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
          OR %I = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR %I = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
          OR %I = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
    $pol$, rec.table_schema, rec.table_name,
           rec.column_name, rec.column_name, rec.column_name, rec.column_name);

    applied_count := applied_count + 1;
  END LOOP;

  RAISE NOTICE '[rls-sweep] tenant_isolation_policy applied to % newly-provisioned table(s); % skipped for non-integer tenant key',
    applied_count, skipped_drift;
END $$;
