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
-- The allowlist mirrors migrations/0021_enable_rls_everywhere.sql (pinned from
-- server/db/rlsAllowlist.ts; scripts/ci/check-rls-allowlist-sync.mjs already fails
-- on drift between those two). The INT-type filter mirrors 0021's own predicate.
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
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = c.table_schema
      AND p.tablename = c.table_name
      AND p.policyname = 'tenant_isolation_policy'
  )
ORDER BY 1;
