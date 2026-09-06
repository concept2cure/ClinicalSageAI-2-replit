-- RLS coverage gate — every org-keyed base table must carry tenant_isolation_policy.
--
-- migrations/0021_enable_rls_everywhere.sql attaches the tenant policy to every
-- BASE TABLE with an integer organization_id/org_id/tenant_id column, minus a
-- pinned allowlist, and RAISEs (aborts) on a non-integer tenant column. So
-- coverage is guaranteed AT THE MOMENT 0021 runs — but a table shipped LATER via
-- the out-of-band C2C set on the deploy-migrate path (which does NOT re-run 0021)
-- would be created org-keyed yet unprotected. This query is the gate that catches
-- that: run it AFTER full provisioning + deploy-migrate and fail CI on any row.
--
-- The (bare-name) allowlist mirrors migrations/0021_enable_rls_everywhere.sql
-- (pinned from server/db/rlsAllowlist.ts; scripts/ci/check-rls-allowlist-sync.mjs
-- fails on drift between it, 0021, the deploy-time sweep and deploy-smoke-assert).
-- The INT-type filter mirrors 0021's own predicate.
--
-- NON-PUBLIC CROSS-TENANT ANALYTICS CARVE-OUT (ledger C-45). This gate scans EVERY
-- schema, not just public. The C2C set (deploy-migrate) provisions a handful of
-- integer-keyed tenant tables in the intelligence/ and precedent/ schemas that are
-- read ONLY by background jobs (pattern-maintenance, counterfactual-replay,
-- risk-model, calibration) on the RAW pool, which never establishes a tenant
-- context — and by NO route/request path. They are cross-tenant BY DESIGN: the
-- pattern library and risk models are trained across the whole dataset. Attaching
-- tenant_isolation_policy would, under RLS_ENFORCE=on, filter those context-less
-- background reads to zero rows and silently break the intelligence subsystem —
-- the exact failure mode that broke api-key auth in C-44 — while preventing no
-- leak, because nothing user-facing reads them. So they are exempt here, on the
-- same "cross-tenant by design (admin/analytics)" rationale as billing_* / api_keys
-- in the canonical allowlist. They are kept SCHEMA-QUALIFIED and SEPARATE from the
-- public RLS_ALLOWLIST so C-44's single source of truth for public tables stays
-- clean. If any of these ever gains a request-path reader, the correct fix is to
-- give the background jobs a super-admin-scoped connection and THEN policy the
-- table — not to widen this carve-out.
--
-- PARENT-SCOPED ISOLATION IS ISOLATION (ledger L170). This gate asks "does a
-- policy named tenant_isolation_policy exist?" as a PROXY for "is this table
-- isolated?". The proxy is right for every table the two sweeps policy, and
-- wrong for a table isolated by the codebase's other sanctioned mechanism: the
-- parent-scoped predicates core.can_access_program / core.can_write_program
-- (C-30), which resolve the parent row's owner and compare it to the request's
-- org. Twenty-two tables across six schemas are isolated that way, and the
-- deploy-time sweep already recognises them -- it "never clobbers a subsystem's
-- own, including C-30's parent-scoped ones". Only this gate did not.
--
-- vault.documents is the case that exposed it. It has been program-scoped since
-- 044c_gcc_vault_schema.sql (rls_vault_documents_select USING
-- core.can_access_program(program_id)); the gate never looked at it because it
-- had no integer tenant column. The moment 20260905_vault_documents_organization_id
-- gave it one, the gate began demanding a policy NAME from a table that was
-- already isolated -- and CI went red on every commit on the canonical branch.
-- Adding tenant_isolation_policy to satisfy the name would have been decoration;
-- widening the deploy sweep to cover the vault schema would have added FORCE ROW
-- LEVEL SECURITY, which that migration's header explains takes the vault offline.
--
-- So a table is ALSO covered when its SELECT policy delegates to a sanctioned
-- parent-scoped helper. Two limits keep that from becoming a hole:
--
--   * It is MECHANISM-based, not a table list. Any future table using the same
--     helpers is covered; anything else still fails. There is nothing to add an
--     exemption to.
--   * A trivially-true permissive SELECT policy DISQUALIFIES the table, because
--     permissive policies OR together -- a `USING (true)` alongside the scoped
--     one would defeat it while still matching the helper test.
--
-- The helpers' own fail-open branch (core.can_access_program RETURNs TRUE when
-- neither identity.* nor auth.* delegate exists) is what would make this
-- recognition hollow. It is asserted separately, in the same CI job, by
-- scripts/db/rls-parent-scope-delegates-check.sql -- this clause is only sound
-- while that assertion passes.
--
-- Emits one row per offending table (empty result = full coverage).
SELECT c.table_schema || '.' || c.table_name || ' (' || c.column_name || ')' AS unprotected
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema
 AND t.table_name = c.table_name
 AND t.table_type = 'BASE TABLE'
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
  AND c.column_name IN ('organization_id', 'org_id', 'tenant_id')
  AND c.data_type IN ('integer', 'bigint', 'smallint')
  AND c.table_name <> ALL (ARRAY[
    'organization_users',
    '__drizzle_migrations',
    'stripe_events',
    'billing_budgets',
    'billing_alerts',
    'api_keys'
  ])
  -- Non-public cross-tenant analytics carve-out (schema-qualified; see header).
  AND (c.table_schema || '.' || c.table_name) <> ALL (ARRAY[
    'intelligence.ana_interactions',
    'intelligence.outcome_feature_vectors',
    'intelligence.pattern_warnings',
    'intelligence.risk_predictions',
    'intelligence.template_validations',
    'precedent.quality_checkpoints'
  ])
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = c.table_schema
      AND p.tablename = c.table_name
      AND p.policyname = 'tenant_isolation_policy'
  )
  -- Parent-scoped isolation (see header): a SELECT policy delegating to a
  -- sanctioned helper counts as coverage...
  AND NOT (
    EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = c.table_schema
        AND p.tablename = c.table_name
        AND p.cmd IN ('SELECT', 'ALL')
        AND p.permissive = 'PERMISSIVE'
        AND p.qual ~ '\mcan_(access|write)_(program|org)\M'
    )
    -- ...but only if nothing beside it reads everything. Permissive policies OR
    -- together, so one `USING (true)` makes the scoped one decorative.
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = c.table_schema
        AND p.tablename = c.table_name
        AND p.cmd IN ('SELECT', 'ALL')
        AND p.permissive = 'PERMISSIVE'
        AND btrim(coalesce(p.qual, 'true')) IN ('true', '(true)')
    )
  )
ORDER BY 1;
