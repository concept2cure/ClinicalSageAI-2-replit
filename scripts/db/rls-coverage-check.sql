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
ORDER BY 1;
