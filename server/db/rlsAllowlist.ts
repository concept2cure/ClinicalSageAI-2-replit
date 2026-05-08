/**
 * RLS allowlist — tables that have a tenant column (`organization_id`,
 * `org_id`, or `tenant_id`) but that PR B's blanket `ENABLE ROW LEVEL
 * SECURITY` migration must NOT enable RLS on.
 *
 * This file is the single source of truth for the allowlist. PR B's SQL
 * migration is generated from this list (or copy-pastes the array literal
 * into its DO block).
 *
 * ─────────────────────────────────────────────────────────────────────
 * Why each entry is here:
 *
 *   organization_users — read by `requireTenantContext` middleware to
 *     resolve the user's role BEFORE the tenant session variable is set.
 *     If RLS is on, the middleware's own membership lookup would be
 *     filtered out and every request would 403. Chicken-and-egg.
 *
 *   __drizzle_migrations — Drizzle's internal migration ledger. Has no
 *     tenant column today, so technically the audit migration won't try
 *     to enable RLS on it. Listed defensively in case a future schema
 *     drift adds one.
 *
 *   stripe_events — `organization_id` is NULLABLE: webhooks arrive from
 *     Stripe without tenant context, and resolution happens
 *     asynchronously. If we DO want RLS on this table later, the policy
 *     needs a `(organization_id IS NULL OR organization_id = ...)`
 *     variant. For PR B, allowlist it and revisit.
 *
 *   billing_budgets, billing_alerts — finance / super-admin dashboards
 *     aggregate across orgs. Could be served by the role-based bypass in
 *     the standard policy, but ergonomically simpler to allowlist for
 *     PR B and tighten later.
 *
 *   api_keys — super-admin key revocation tooling reads cross-org. Same
 *     trade-off: role bypass would work, but allowlist is simpler.
 *
 * ─────────────────────────────────────────────────────────────────────
 * What is NOT in the allowlist (notable cases):
 *
 *   organizations — no tenant column on itself (its PK is `id`); the
 *     audit migration won't touch it.
 *
 *   users — no tenant column; not in scope of the audit migration.
 *
 *   sharepoint_audit_log — fully tenant-keyed (org_id NOT NULL on every
 *     row). RLS is the right default; super-admin tooling can use the
 *     role-bypass clause in the standard policy.
 *
 * ─────────────────────────────────────────────────────────────────────
 * If you add an allowlist entry: bump the date, add the table name, AND
 * write a one-line "why" above so the next reader understands the
 * trade-off you accepted.
 */

export const RLS_ALLOWLIST: readonly string[] = [
  // Tenant-defining / middleware-dependent
  'organization_users',

  // System metadata
  '__drizzle_migrations',

  // Stripe webhooks (nullable org_id; revisit with NULL-aware policy)
  'stripe_events',

  // Cross-tenant by design (admin / billing dashboards)
  'billing_budgets',
  'billing_alerts',
  'api_keys',
] as const;

/**
 * Render the allowlist as a SQL array literal suitable for inclusion in a
 * `DO` block. Returns a string like `ARRAY['organization_users', ...]::text[]`.
 *
 * Example use in a migration generator:
 *
 *   const sql = `
 *     DECLARE allowlist text[] := ${rlsAllowlistSqlArray()};
 *     ...
 *   `;
 */
export function rlsAllowlistSqlArray(): string {
  const escaped = RLS_ALLOWLIST.map(t => {
    if (!/^[a-z_][a-z0-9_]*$/i.test(t)) {
      throw new Error(`RLS allowlist entry is not a safe identifier: ${t}`);
    }
    return `'${t}'`;
  }).join(', ');
  return `ARRAY[${escaped}]::text[]`;
}
