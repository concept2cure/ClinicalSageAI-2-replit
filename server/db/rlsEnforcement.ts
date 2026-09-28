/**
 * RLS enforcement mode — controls whether the policy installed by PR B
 * actually filters rows, or compiles to a no-op.
 *
 * The policy's leading clause is:
 *
 *   NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
 *   OR <tenant match>
 *   OR <super-admin match>
 *
 * When `app.rls_enforce` is unset (default) or anything other than `'on'`,
 * the leading clause is TRUE and every row passes — the table is effectively
 * not filtered. When the setting is `'on'`, the leading clause is FALSE and
 * the tenant/super-admin clauses do the real work.
 *
 * This gives the rollout three knobs without re-running migrations:
 *
 *   RLS_ENFORCE=off       — policy compiled, never filters.
 *   RLS_ENFORCE=shadow    — alias for off; intent: "I'm watching"
 *   RLS_ENFORCE=on        — policy filters. The flip.
 *
 * Outside production an unset RLS_ENFORCE defaults to off so dev/test keep
 * working with zero configuration. Production requires `on`; unset, invalid,
 * `off`, and `shadow` all refuse startup.
 *
 * The setting is applied in the PostgreSQL startup packet so it is active
 * before a pooled connection can be checked out or execute its first query.
 */

import type { Pool } from 'pg';
import { RLS_ALLOWLIST } from './rlsAllowlist';


export type RlsEnforcementMode = 'off' | 'shadow' | 'on';

/**
 * Raw RLS_ENFORCE values recognized as an explicit operator decision, keyed by
 * the mode they resolve to. Anything outside these lists is NOT a decision —
 * in production that refuses to boot rather than silently degrading to off.
 */
const EXPLICIT_MODE_VALUES: Record<RlsEnforcementMode, readonly string[]> = {
  on: ['on', 'enforce', 'true', '1'],
  shadow: ['shadow'],
  off: ['off', 'false', '0'],
};

export function readEnforcementMode(env: NodeJS.ProcessEnv = process.env): RlsEnforcementMode {
  const raw = (env.RLS_ENFORCE ?? '').trim().toLowerCase();
  if (EXPLICIT_MODE_VALUES.on.includes(raw)) return 'on';
  if (EXPLICIT_MODE_VALUES.shadow.includes(raw)) return 'shadow';
  return 'off';
}

/**
 * True when RLS_ENFORCE carries a recognized, deliberate value. An unset,
 * blank, or unrecognized (typo'd) value is not an operator decision.
 */
export function isExplicitEnforcementDecision(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.RLS_ENFORCE ?? '').trim().toLowerCase();
  return Object.values(EXPLICIT_MODE_VALUES).some(values => values.includes(raw));
}

/**
 * Production safety assertion for the RLS enforcement flip.
 *
 * Tenant isolation has two layers: (1) the PRIMARY app-layer boundary — the
 * global `/api` auth gate + JWT-derived org scoping — and (2) Postgres RLS as
 * defense-in-depth. RLS only actually filters rows when `RLS_ENFORCE=on`.
 *
 * Production boot matrix (non-production is always a no-op):
 *   - RLS_ENFORCE=on                    → boots, RLS filters rows.
 *   - any other value, including unset  → refuses to boot.
 *
 * @returns the resolved enforcement mode.
 */
export function assertRlsEnforcementForProduction(
  env: NodeJS.ProcessEnv = process.env
): RlsEnforcementMode {
  const mode = readEnforcementMode(env);
  const isProduction = (env.NODE_ENV ?? '').toLowerCase() === 'production';
  if (!isProduction) return mode;

  const raw = (env.RLS_ENFORCE ?? '').trim();
  if (raw.toLowerCase() === 'on') return 'on';

  if (mode === 'on') {
    // A truthy alias (enforce/true/1) resolves to `on` for developer
    // convenience OUTSIDE production, but the production kill-switch demands
    // the canonical literal so an audit of the deployed environment is
    // unambiguous — `grep RLS_ENFORCE=on` must be the whole check. (The
    // authorities-consolidation refactor briefly accepted aliases here,
    // silently weakening the boot contract this module's tests pin.)
    throw new Error(
      `[rls-enforcement] REFUSING TO BOOT: RLS_ENFORCE is set to "${raw}" in production. ` +
        'Aliases are not accepted for the production kill-switch. Set RLS_ENFORCE=on (canonical form).'
    );
  }

  const configured = raw === '' ? 'not set' : `set to "${raw}"`;
  throw new Error(
    `[rls-enforcement] FAIL-CLOSED: REFUSING TO BOOT because RLS_ENFORCE is ${configured} ` +
      `in production (resolved mode "${mode}"). Production requires RLS_ENFORCE=on; ` +
      'off and shadow modes are restricted to non-production environments.'
  );
}

/**
 * Build PostgreSQL startup options for the resolved RLS mode. Startup packet
 * options are applied by PostgreSQL before node-postgres exposes a connected
 * client, avoiding the first-query race inherent in an async `connect` event.
 */
export function buildRlsStartupOptions(
  env: NodeJS.ProcessEnv = process.env,
  existingOptions = '',
): string | undefined {
  const mode = assertRlsEnforcementForProduction(env);
  const tokens = existingOptions.trim() ? [existingOptions.trim()] : [];
  if (mode === 'on') tokens.push('-c app.rls_enforce=on');
  return tokens.length > 0 ? tokens.join(' ') : undefined;
}

export interface RlsPostureFinding {
  table: string;
  rlsEnabled: boolean;
  rlsForced: boolean;
  policyCount: number;
}

/**
 * A table whose RLS policy provably cannot run: RLS is enabled, FORCE is not,
 * and the runtime role OWNS the table. Postgres exempts a table's owner from
 * its policies unless FORCE ROW LEVEL SECURITY is set, so every policy on such
 * a table is inert for this connection however correct the policy itself is.
 */
export interface RlsOwnerExemptionFinding {
  /** schema-qualified, because these are overwhelmingly not in `public`. */
  table: string;
  owner: string;
  policyCount: number;
}

export interface RlsPostureReport {
  role: string;
  roleIsSuperuser: boolean;
  roleBypassesRls: boolean;
  tables: RlsPostureFinding[];
  /** Tables the runtime role owns whose policies are inert. See above. */
  ownerExempt: RlsOwnerExemptionFinding[];
  failures: string[];
}

/**
 * Runtime form of the RLS catalog checks used by readiness tooling and by the
 * production boot gate.
 *
 * ── What this answers, and what it used to miss ──────────────────────────────
 * Three questions, not two:
 *
 *   1. Is the runtime role itself exempt?  (superuser, or BYPASSRLS)
 *   2. Is every tenant-keyed table in `public` RLS-enabled, FORCEd and policied?
 *   3. Does the runtime role OWN any RLS-enabled table that is not FORCEd?
 *
 * The third was missing, and it is the one that matters most on a real
 * deployment. Postgres exempts a table's owner from its own policies unless
 * FORCE ROW LEVEL SECURITY is set — so a runtime that connects as the table
 * owner reads every tenant's rows on such a table with RLS_ENFORCE=on, a
 * correct policy installed, and nothing anywhere reporting a problem.
 *
 * Question 2 could not catch it because it reads `table_schema = 'public'`
 * alone, and this product keeps its Part 11 core outside public:
 * vault.documents, identity.users, signing.signatures, evidence.hash_ledger.
 * Measured on the reference database: 117 RLS-enabled, non-FORCE tables across
 * 16 schemas, every one owned by the runtime role — and this assessment
 * returned ZERO failures. Reproduced end to end before the fix: two rows for
 * two organisations in a policied, owner-owned, non-FORCE table, a session
 * with app.rls_enforce=on and app.current_org_id=1, and the session read both.
 *
 * The single-role posture install-fresh warns about ("Production boot will FAIL
 * CLOSED if it connects as a superuser under RLS_ENFORCE=on") is therefore
 * narrower than the risk: a non-superuser that merely OWNS the tables was the
 * same bypass and boot did not fail closed on it. IQ-07 already checks
 * ownership (scripts/validation/run-iq.mjs raises IQ-DEV-006 on exactly this);
 * the server did not, so a deployment could pass boot and fail its own IQ.
 */
export async function assessRlsCatalogPosture(pool: Pick<Pool, 'query'>): Promise<RlsPostureReport> {
  const [roleResult, tableResult, ownerExemptResult] = await Promise.all([
    pool.query(`SELECT current_user AS role, r.rolsuper, r.rolbypassrls
      FROM pg_roles r WHERE r.rolname = current_user`),
    pool.query(`WITH tenant_tables AS (
        SELECT DISTINCT c.table_schema, c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
          -- The canonical tenant columns: the same three the install-time and
          -- deploy-time sweeps police (0021, 20260801), rls-coverage-check.sql
          -- and deploy-smoke-assert.mjs use. This probe also listed client_id,
          -- which no sweep polices, so it failed boot on a table the sweep
          -- correctly leaves alone: mcp_oauth_clients, whose client_id is an
          -- OAuth client identifier, not a tenant (a global, pre-auth registry
          -- — scripts/ci/unkeyed-request-tables-baseline.json). On a
          -- deploy-shaped database that was the only table keyed by client_id
          -- alone; every other client_id table also carries organization_id.
          -- (2026-09-23)
          AND c.column_name IN ('organization_id', 'org_id', 'tenant_id')
      )
      SELECT tt.table_name, cls.relrowsecurity, cls.relforcerowsecurity,
             COUNT(pol.policyname)::int AS policy_count
      FROM tenant_tables tt
      JOIN pg_namespace ns ON ns.nspname = tt.table_schema
      JOIN pg_class cls ON cls.relnamespace = ns.oid AND cls.relname = tt.table_name
      LEFT JOIN pg_policies pol ON pol.schemaname = tt.table_schema AND pol.tablename = tt.table_name
      GROUP BY tt.table_name, cls.relrowsecurity, cls.relforcerowsecurity
      ORDER BY tt.table_name`),
    /* ── The bypass the two checks above cannot see ────────────────────────
       Postgres exempts a table's OWNER from its own policies unless FORCE ROW
       LEVEL SECURITY is set. So an RLS-enabled, policied, non-FORCE table that
       the runtime role owns is fully readable across tenants, and the policy on
       it is inert however correct the policy is.

       Neither check above catches that. The tenant-table probe reads
       `table_schema = 'public'` only, and the product keeps its Part 11 core
       outside public — vault.documents, identity.users, signing.signatures,
       evidence.hash_ledger. On the reference database 117 tables across 16
       schemas are in exactly this state and the whole assessment returned zero
       failures.

       Deliberately NOT keyed on a tenant column: an RLS-ENABLED table is one
       somebody decided to police, and a policy that cannot run is a defect
       whatever the column is called. That also means no heuristic and no false
       positives — a table with RLS off is not reported here, and one the
       runtime role does not own is not either, because for that connection the
       policy does run. */
    pool.query(`SELECT ns.nspname AS schema_name, cls.relname AS table_name,
             pg_get_userbyid(cls.relowner) AS owner,
             (SELECT count(*) FROM pg_policies p
               WHERE p.schemaname = ns.nspname AND p.tablename = cls.relname)::int AS policy_count
      FROM pg_class cls
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE cls.relkind = 'r'
        AND cls.relrowsecurity
        AND NOT cls.relforcerowsecurity
        AND pg_get_userbyid(cls.relowner) = current_user
        AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
        AND ns.nspname NOT LIKE 'pg\\_%'
      ORDER BY ns.nspname, cls.relname`),
  ]);
  const roleRow = roleResult.rows[0] ?? {};
  const tables = tableResult.rows.map(row => ({
    table: String(row.table_name),
    rlsEnabled: Boolean(row.relrowsecurity),
    rlsForced: Boolean(row.relforcerowsecurity),
    policyCount: Number(row.policy_count ?? 0),
  }));
  const failures: string[] = [];
  if (!roleRow.role) failures.push('runtime database role could not be resolved');
  if (roleRow.rolsuper) failures.push(`runtime role ${roleRow.role} is a PostgreSQL superuser`);
  if (roleRow.rolbypassrls) failures.push(`runtime role ${roleRow.role} has BYPASSRLS`);
  if (tables.length === 0) failures.push('no tenant-keyed public tables were discovered');
  // Honor the single-source-of-truth RLS allowlist (server/db/rlsAllowlist.ts):
  // tables that carry a tenant column but are deliberately NOT policied (cross-
  // tenant admin/billing dashboards, nullable-org Stripe webhooks, the
  // membership-bootstrap table). The install-time sweep (0021), the deploy-time
  // sweep, the coverage check and the deploy smoke all exclude exactly these —
  // and ci:rls-allowlist-sync pins every copy to the same source — so the boot
  // posture assertion must exclude them too, or it fails closed on tables the
  // rest of the system intentionally leaves unpoliced.
  const allowlisted = new Set<string>(RLS_ALLOWLIST);
  for (const table of tables) {
    if (allowlisted.has(table.table)) continue;
    if (!table.rlsEnabled) failures.push(`${table.table}: RLS is not enabled`);
    if (!table.rlsForced) failures.push(`${table.table}: FORCE ROW LEVEL SECURITY is not enabled`);
    if (table.policyCount < 1) failures.push(`${table.table}: no RLS policy exists`);
  }
  /* The owner exemption is reported as ONE failure, not 117. A boot error the
     operator cannot read is a boot error nobody acts on, and the remedy is the
     same sentence for every table on the list. The full list stays on the
     report for readiness tooling and for the evidence file. */
  const ownerExempt: RlsOwnerExemptionFinding[] = ownerExemptResult.rows
    .map(row => ({
      table: `${String(row.schema_name)}.${String(row.table_name)}`,
      owner: String(row.owner ?? ''),
      policyCount: Number(row.policy_count ?? 0),
    }))
    .filter(f => !(f.table.startsWith('public.') && allowlisted.has(f.table.slice('public.'.length))));
  if (ownerExempt.length > 0) {
    const shown = ownerExempt.slice(0, 5).map(f => f.table).join(', ');
    const more = ownerExempt.length > 5 ? `, +${ownerExempt.length - 5} more` : '';
    failures.push(
      `runtime role ${roleRow.role} OWNS ${ownerExempt.length} RLS-enabled table(s) that are not ` +
        `FORCE ROW LEVEL SECURITY (${shown}${more}). Postgres exempts a table's owner from its own ` +
        'policies unless FORCE is set, so every policy on those tables is inert on this connection ' +
        'and they are readable across tenants. Remedy: connect as the non-owner runtime role ' +
        '(set APP_SERVICE_DB_PASSWORD when provisioning and APP_DATABASE_URL for the runtime), or ' +
        'apply FORCE ROW LEVEL SECURITY to the tables listed.'
    );
  }
  return {
    role: String(roleRow.role ?? ''),
    roleIsSuperuser: Boolean(roleRow.rolsuper),
    roleBypassesRls: Boolean(roleRow.rolbypassrls),
    tables,
    ownerExempt,
    failures,
  };
}

export async function assertRlsCatalogPosture(pool: Pick<Pool, 'query'>): Promise<RlsPostureReport> {
  const report = await assessRlsCatalogPosture(pool);
  if (report.failures.length > 0) {
    throw new Error(`[rls-enforcement] FAIL-CLOSED: ${report.failures.length} catalog/role failure(s): ${report.failures.slice(0, 20).join('; ')}`);
  }
  return report;
}

/**
 * Refuse to create an ADDITIONAL organization while RLS is not filtering.
 *
 * ── Why a boot check is not enough ────────────────────────────────────────────
 * assertRlsEnforcementForProduction now requires active filtering in production.
 * This admission check remains defense-in-depth for staging/preview deployments,
 * direct service use, and configuration drift after startup.
 *
 * The moment a second organization exists, that reasoning stops holding — and
 * nothing noticed, because the condition arises long after boot. The pilot
 * go/no-go gate says exactly this ("tolerable at 0 organization(s) … RLS_ENFORCE=on
 * is REQUIRED before a second organization is created — this gate turns HARD the
 * moment one is"), but that gate is a script a human runs, not a control in the
 * running system. This is the control.
 *
 * ── What it does ──────────────────────────────────────────────────────────────
 * Called before inserting an organization. If this insert would create the
 * SECOND (or later) organization, and RLS is not `on`, it throws. Creating the
 * FIRST organization is allowed by this specific guard; production startup has
 * already required active RLS, while non-production may need a founding tenant.
 *
 * Scoped to deployed environments (anything not explicitly `development` or
 * `test`), matching the repo's established prod-fail-closed idiom — an unset,
 * blank, `staging` or `preview` NODE_ENV all enforce. Local development keeps
 * working with zero configuration.
 *
 * The remedy is one environment variable, and it is named in the error.
 *
 * @param existingOrgCount organizations already present.
 * @throws when adding a tenant would put a deployed system into multi-tenant
 *         operation without row filtering.
 */
export function assertTenantIsolationBeforeNewOrg(
  existingOrgCount: number,
  env: NodeJS.ProcessEnv = process.env
): void {
  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  const isLocal = nodeEnv === 'development' || nodeEnv === 'test';
  if (isLocal) return;

  // The founding tenant is always permitted — nothing to leak between.
  if (existingOrgCount < 1) return;

  const mode = readEnforcementMode(env);
  if (mode === 'on') return;

  throw new Error(
    `[rls-enforcement] FAIL-CLOSED: refusing to create organization #${existingOrgCount + 1} ` +
      `while RLS_ENFORCE is "${mode}". Postgres Row-Level Security is not filtering rows, so ` +
      'this deployment would hold more than one tenant with tenant isolation resting solely on ' +
      'the app-layer auth gate — a single missed org predicate in any query becomes a ' +
      'cross-tenant read. Accepting that risk is defensible with ONE tenant and is not with two. ' +
      'Set RLS_ENFORCE=on (the policies are already provisioned; this only flips them from ' +
      'compiled-but-inert to filtering) and retry.'
  );
}
