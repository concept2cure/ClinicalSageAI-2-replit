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
  forced_count  INT := 0;
  healed_count  INT := 0;
  rebuilt_count INT := 0;
  remaining_pol INT := 0;
  -- Tables that carry a tenant column but must NOT be policied — the canonical
  -- RLS allowlist. This list MUST equal server/db/rlsAllowlist.ts → RLS_ALLOWLIST
  -- (the single source of truth) exactly, byte-for-byte with 0021's copy and
  -- scripts/db/rls-coverage-check.sql; scripts/ci/check-rls-allowlist-sync.mjs
  -- fails the build on any drift between the four.
  --
  -- WHY IT MUST MATCH, NOT approximate (ledger C-44). An EARLIER version of this
  -- sweep used a hand-written 4-entry list that dropped api_keys, billing_budgets
  -- and billing_alerts. That silently policied api_keys — which is read PRE-AUTH
  -- by validateApiKey() (server/services/api-key-service.ts) to resolve which org
  -- a key belongs to, before any tenant context exists. Under RLS_ENFORCE=on
  -- (mandatory in production) the tenant_isolation_policy filtered that lookup to
  -- zero rows, breaking ALL api-key authentication. 0021 exempts these tables for
  -- exactly that reason; the sweep now honors the same exemption.
  allowlist TEXT[] := ARRAY[
    'organization_users',
    '__drizzle_migrations',
    'stripe_events',
    'billing_budgets',
    'billing_alerts',
    'api_keys'
  ];
BEGIN
  FOR rec IN
    -- DISTINCT ON, so a table with more than one tenant column yields exactly
    -- one row — the highest-precedence column (see the ORDER BY below).
    SELECT DISTINCT ON (c.table_schema, c.table_name)
           c.table_schema, c.table_name, c.column_name, c.data_type
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
    -- Precedence, not alphabetical order: on a table with more than one tenant
    -- column, organization_id / org_id is the NOT NULL key writers stamp and
    -- tenant_id is a nullable adapter column. Attaching the policy to the
    -- adapter makes every read return zero rows and every INSERT fail. Same
    -- order as migrations/0021_enable_rls_everywhere.sql, server/db/rlsEnforcement.ts
    -- and scripts/db/rls-coverage-check.sql. (The execution-time re-check below
    -- already made "first row wins"; this makes the winner the right one.)
    ORDER BY
      c.table_schema,
      c.table_name,
      CASE c.column_name
        WHEN 'organization_id' THEN 1
        WHEN 'org_id'          THEN 2
        WHEN 'tenant_id'       THEN 3
        ELSE 4
      END
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
          OR %I = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR %I = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
          OR %I = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
    $pol$, rec.table_schema, rec.table_name,
           rec.column_name, rec.column_name, rec.column_name, rec.column_name);

    applied_count := applied_count + 1;
  END LOOP;

  -- Self-heal pass: REBUILD a tenant_isolation_policy that is not the canonical
  -- shape — wrong tenant column, or the org-id cast that made it throw.
  --
  -- ── Defect 2: the cast that turned every tenant read into a 500 ────────────
  -- The canonical policy carried this disjunct:
  --
  --     OR <col> = NULLIF(current_setting('app.current_org_id', TRUE), '')::INT
  --
  -- `app.current_org_id` holds the org UUID. server/middleware/establishRequestTenantScope.ts
  -- sets `app.current_tenant_id` to the integer org id and `app.current_org_id`
  -- to the uuid, and every non-public policy compares that GUC as ::uuid. Casting
  -- it to INT is a category error, and PostgreSQL does not guarantee OR
  -- short-circuiting, so for any row the earlier disjuncts do not satisfy the
  -- cast IS evaluated and the whole query dies with
  --
  --     ERROR: invalid input syntax for type integer: "d0211565-…"
  --
  -- That is every read and every write of every integer tenant-keyed public
  -- table, for any connection carrying a real request scope — in EVERY RLS mode,
  -- because the shadow-mode bypass is just another disjunct and does not stop
  -- the cast being evaluated. It never showed up because RLS only filters for a
  -- connection that is neither a superuser nor the table's owner, so nothing
  -- exercises the policy until the split role is in use — and because every test
  -- that sets these GUCs sets `app.current_org_id` to '' — the one value that
  -- avoids it. It surfaces the moment a runtime connects as app_service, which
  -- production requires: no tenant table is readable at all.
  --
  -- Fixed by extracting an integer instead of casting whatever is there:
  -- `substring(current_setting(...) from '^[0-9]+$')::INT` yields NULL for a
  -- uuid (so the disjunct is simply not satisfied) and still resolves an actual
  -- integer, so no caller that worked before stops working. The disjunct is left
  -- in place rather than deleted: narrowing an RLS policy is a security change,
  -- and this is only meant to stop it crashing.
  --
  -- ── Defect 1: the wrong tenant column ─────────────────────────────────────
  --
  -- The loop above only ever ADDS a policy where none exists, so it cannot
  -- correct a policy an earlier run attached to the wrong column — and
  -- migrations/0021_enable_rls_everywhere.sql used to do exactly that. It
  -- yielded a table once per matching tenant column and dropped/recreated the
  -- policy on each pass, so on the six tables carrying BOTH organization_id (or
  -- org_id) and tenant_id, the alphabetically-last column won and the policy
  -- ended up on `tenant_id` — a NULLABLE adapter column added by
  -- db/migrations/20260401_cmc_convergence_os.sql that no writer stamps.
  --
  -- The consequence is not a leak, it is a dead surface: `NULL = <tenant>` is
  -- NULL, so under RLS_ENFORCE=on no row passes USING and no row passes WITH
  -- CHECK. Reads return nothing, writes fail with "new row violates row-level
  -- security policy". Every coverage gate stayed green throughout, because a
  -- policy WAS attached.
  --
  -- 0021 is fixed at the source for both defects, but it is ledger-guarded and
  -- will not re-run on a database that already has it. This pass is how those
  -- databases converge. It touches ONLY our own generated policy name, on public
  -- tables whose preferred tenant column is an integer — so the uuid-keyed
  -- non-public policies, and any hand-tuned or parent-scoped policy under a
  -- different name, are never rewritten.
  --
  -- A policy is rebuilt only when it WAS generated from the canonical template,
  -- identified by the shadow-mode clause `app.rls_enforce IS DISTINCT FROM 'on'`
  -- that only this template emits — and then when EITHER
  --   (a) it does not reference the table's highest-precedence tenant column, or
  --   (b) its qual lacks the '^[0-9]+$' marker, which only the fixed org-id
  --       extraction produces — so its absence means the old, throwing cast.
  -- Both rebuild to the same canonical text below, so the pass converges in one
  -- run and does nothing on the next.
  --
  -- THE TEMPLATE MARKER IS LOAD-BEARING, not belt-and-braces. The sweep's
  -- original comment assumed a subsystem's own policy would carry a different
  -- NAME, and one does not: db/migrations/20260813_knowledge_graph_tenant_keys.sql
  -- installs a policy CALLED tenant_isolation_policy on the knowledge-graph
  -- tables whose body is deliberately STRICTER — a bare
  -- `organization_id = current_setting('app.current_tenant_id')`, with no
  -- shadow-mode bypass and no super-admin escape, because the point of that
  -- migration is that unattributed rows are served to nobody and an unscoped
  -- connection sees nothing. Rebuilding on name alone replaced it with the
  -- canonical, permissive-in-shadow-mode text and silently weakened isolation on
  -- those tables. tests/db/knowledge-graph-tenant-isolation.dbtest.ts caught it.
  -- Matching on the template's own marker means this pass can only ever repair
  -- policies it (or 0021) wrote.
  FOR rec IN
    SELECT preferred.table_schema, preferred.table_name, preferred.column_name, preferred.data_type
    FROM (
      SELECT DISTINCT ON (c.table_schema, c.table_name)
        c.table_schema, c.table_name, c.column_name, c.data_type
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name IN ('organization_id', 'org_id', 'tenant_id')
        AND EXISTS (
          SELECT 1 FROM information_schema.tables t
          WHERE t.table_schema = c.table_schema
            AND t.table_name = c.table_name
            AND t.table_type = 'BASE TABLE'
        )
      ORDER BY c.table_schema, c.table_name,
        CASE c.column_name
          WHEN 'organization_id' THEN 1
          WHEN 'org_id'          THEN 2
          WHEN 'tenant_id'       THEN 3
          ELSE 4
        END
    ) preferred
    JOIN pg_policies p
      ON p.schemaname = preferred.table_schema
     AND p.tablename  = preferred.table_name
     AND p.policyname = 'tenant_isolation_policy'
    WHERE preferred.table_name <> ALL (allowlist)
      AND preferred.data_type IN ('integer', 'bigint', 'smallint')
      -- The deparsed policy renders the predicate as `(<column> = (NULLIF(…))::integer)`.
      -- If the preferred column does not appear that way, the policy is on another one.
      -- Only policies generated from the canonical template. A same-named
      -- policy with a different body belongs to whoever wrote it.
      AND strpos(COALESCE(p.qual, ''), 'app.rls_enforce') > 0
      AND (
        -- (a) attached to the wrong tenant column
        strpos(COALESCE(p.qual, ''), '(' || preferred.column_name || ' = ') = 0
        -- (b) built before the org-id cast was made safe
        OR strpos(COALESCE(p.qual, ''), '^[0-9]+$') = 0
      )
  LOOP
    EXECUTE format('DROP POLICY tenant_isolation_policy ON %I.%I', rec.table_schema, rec.table_name);
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', rec.table_schema, rec.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', rec.table_schema, rec.table_name);
    EXECUTE format($pol$
      CREATE POLICY tenant_isolation_policy ON %I.%I
        FOR ALL
        USING (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR %I = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
          OR %I = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR %I = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
          OR %I = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
    $pol$, rec.table_schema, rec.table_name,
           rec.column_name, rec.column_name, rec.column_name, rec.column_name);
    rebuilt_count := rebuilt_count + 1;
    RAISE NOTICE '[rls-sweep] REBUILT %.% — tenant_isolation_policy now keys on % and extracts app.current_org_id safely',
      rec.table_schema, rec.table_name, rec.column_name;
  END LOOP;

  -- Self-heal pass (ledger C-44): REMOVE tenant_isolation_policy from any
  -- allowlisted table that wrongly carries it, restoring the exempt state.
  --
  -- WHY THIS EXISTS. An earlier revision of this sweep carried a hand-written
  -- allowlist that dropped api_keys / billing_budgets / billing_alerts, so it
  -- POLICIED them. api_keys is read PRE-AUTH by validateApiKey() to resolve which
  -- org a key belongs to, before any tenant context is set; under RLS_ENFORCE=on
  -- the policy filtered that lookup to zero rows and broke ALL api-key auth. The
  -- forward fix (correct allowlist above) stops NEW databases from hitting it, but
  -- the first loop only ever ADDS a policy — it cannot undo one an earlier run
  -- already created. Any environment that applied the buggy revision would stay
  -- broken. This pass heals it: an allowlisted table means "must not be policied",
  -- so a tenant_isolation_policy on one is unambiguously wrong and safe to drop.
  -- We touch ONLY our own policy name, never a subsystem's differently-named one.
  FOR rec IN
    SELECT p.schemaname, p.tablename
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.policyname = 'tenant_isolation_policy'
      AND p.tablename = ANY (allowlist)
  LOOP
    EXECUTE format('DROP POLICY tenant_isolation_policy ON %I.%I', rec.schemaname, rec.tablename);
    healed_count := healed_count + 1;
    -- If that was the only policy, fully restore the exempt state: NO FORCE and
    -- DISABLE RLS, so the table is not left as an owner default-deny surprise.
    SELECT count(*) INTO remaining_pol
      FROM pg_policies p2
     WHERE p2.schemaname = rec.schemaname AND p2.tablename = rec.tablename;
    IF remaining_pol = 0 THEN
      EXECUTE format('ALTER TABLE %I.%I NO FORCE ROW LEVEL SECURITY', rec.schemaname, rec.tablename);
      EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', rec.schemaname, rec.tablename);
    END IF;
    RAISE NOTICE '[rls-sweep] HEALED %.% — dropped a tenant_isolation_policy from an allowlisted (must-not-be-policied) table (C-44)',
      rec.schemaname, rec.tablename;
  END LOOP;

  -- Second pass (ledger C-43): FORCE row-level security on every table that
  -- ALREADY carries the tenant_isolation_policy but was left un-FORCED by whatever
  -- source created it.
  --
  -- WHY THIS IS SEPARATE FROM THE LOOP ABOVE. That loop only touches tables the
  -- policy does not yet exist on (so it never clobbers a subsystem's own). But a
  -- table can arrive here already carrying tenant_isolation_policy from another
  -- source that ran ENABLE + CREATE POLICY without FORCE — and the loop above
  -- then skips it, so the missing FORCE is never added. A policy WITHOUT force is
  -- silently bypassed for the table OWNER. The boot guard
  -- (server/db/rlsEnforcement.ts) verifies the runtime role is not a superuser and
  -- does not hold BYPASSRLS, but NOT that it is a non-owner — so relying on
  -- "the app never connects as the table owner" is an unproven assumption. FORCE
  -- closes it unconditionally, at no cost.
  --
  -- Only tables that HAVE the policy are forced, so a policy-less RLS table is
  -- never turned into an owner default-deny surprise. Idempotent: re-running
  -- forces nothing once every policied table is covered.
  FOR rec IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_policies p
      ON p.schemaname = n.nspname AND p.tablename = c.relname
     AND p.policyname = 'tenant_isolation_policy'
    WHERE c.relkind = 'r' AND c.relforcerowsecurity = false
    GROUP BY n.nspname, c.relname
  LOOP
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', rec.schema_name, rec.table_name);
    forced_count := forced_count + 1;
    RAISE NOTICE '[rls-sweep] FORCED row-level security on %.% (it carried tenant_isolation_policy but not FORCE)',
      rec.schema_name, rec.table_name;
  END LOOP;

  RAISE NOTICE '[rls-sweep] tenant_isolation_policy applied to % newly-provisioned table(s); % rebuilt to the canonical shape; % forced retroactively; % healed off allowlisted tables; % skipped for non-integer tenant key',
    applied_count, rebuilt_count, forced_count, healed_count, skipped_drift;
END $$;
