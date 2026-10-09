/**
 * Entitlement schema posture — what the 2026-08-23 packaging migrations and the
 * three 2026-08-24 entitlement migrations actually leave on a deploy-shaped
 * database (install-fresh + the full RULE 1 replay), pinned in the CI job that
 * builds exactly that database.
 *
 *   db/migrations/20260824_module_grant_expiry.sql        module_subscriptions
 *                                                         .expires_at & co.
 *   db/migrations/20260824_module_access_requests.sql     module_access_requests
 *   db/migrations/20260824_enforcement_mode_setting.sql   platform_settings
 *
 * ── Why a test and not another catalog script ────────────────────────────────
 * scripts/db/deploy-smoke-assert.mjs and scripts/db/rls-coverage-check.sql
 * already prove, as the OWNER, that every integer-tenant table carries a forced
 * tenant_isolation_policy. Neither can say anything about a table with NO
 * tenant column (platform_settings is outside both populations by construction),
 * neither names these three tables, and neither ever connects as the role
 * production serves requests with. This file does both halves:
 *
 *   - CATALOG reads on the owner connection (types, indexes and their exact
 *     predicates, RLS enabled/forced, the policy set, grants, default ACLs);
 *   - BEHAVIOUR through the REAL server pool (server/db/runtime.ts), built from
 *     APP_DATABASE_URL pointing at a NOSUPERUSER/NOBYPASSRLS role minted by the
 *     REAL scripts/db/provision-app-role.mjs, with RLS_ENFORCE=on in the startup
 *     packet, under the scope production gives each path through
 *     runWithTenantScope / runWithSystemTenantScope — the same AsyncLocalStorage
 *     the request middleware populates and poolInstrumentation applies.
 *
 * ── What runs the real code, and what runs its exact text ────────────────────
 *   module_subscriptions writes  REAL writeModuleGrant()
 *                                (server/services/entitlements/module-grants.ts)
 *   module_access_requests       the route's statements, copied VERBATIM from
 *                                server/routes/module-access-requests.ts — the
 *                                route itself is driven end to end by
 *                                module-access-requests.dbtest.ts; this file
 *                                pins the table's isolation, not the handler.
 *   platform_settings            enforcement-mode.ts's read and write statements,
 *                                verbatim, with a lane-owned setting_key instead
 *                                of `module_enforcement_mode` — writing the real
 *                                key would change route enforcement for every
 *                                other suite sharing this database. The read is
 *                                ALSO run through the REAL readStoredMode(),
 *                                which is read-only and so safe on the real key.
 * Each verbatim statement is checked against its source file (whitespace-
 * normalised) so the copy cannot drift from what the module sends.
 *
 * ── The scope each statement runs under in production ────────────────────────
 *   module_access_requests reads/writes   per-user (the caller's org): neither
 *                                         /api/module-access-requests nor
 *                                         /api/module-subscriptions is in
 *                                         SYSTEM_SCOPE_PREFIXES.
 *   the `all` queue read                  SYSTEM — mounted only by
 *                                         admin/master-access-requests.ts under
 *                                         /api/admin/master.
 *   writeModuleGrant                      per-user (approve, org toggle) and
 *                                         SYSTEM (/api/admin/master console).
 *   platform_settings WRITE               SYSTEM (PATCH /api/admin/master/
 *                                         licensing/enforcement/mode).
 *   platform_settings READ                PRE-AUTH (tenant '0', NO role):
 *                                         readStoredMode() wraps its query in
 *                                         runWithPreAuthScope, which nests
 *                                         innermost, so it runs there whatever
 *                                         scope the request carries. Added
 *                                         2026-09-22 (4acbfd7); the read is
 *                                         pinned under that scope below.
 *
 * Lane: F-schema-posture. Organizations 91600–91649, tag `dbtf`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { databaseUrl } from '../setup.db';
import {
  provisionAppServiceRole,
  resolveAppServiceRole,
  auditRuntimeRoleGrants,
} from '../../scripts/db/provision-app-role.mjs';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ─── Lane fixtures ───────────────────────────────────────────────────────────
const ORG_LO = 91600;
const ORG_HI = 91649;
const ORG_A = 91600;
const ORG_B = 91601;
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const MOD_A = 'dbtf_mod_a';
const MOD_B = 'dbtf_mod_b';
/** requested_by is a bare integer (no FK) — lane-shaped ids, never a real user. */
const USER_A = 9160001;
const USER_B = 9160101;
const SETTING_KEY = `dbtf_probe_${RUN}`;
const PROBE_TABLE = `dbtf_grant_probe_${RUN}`;

/**
 * The per-run runtime role. The `dbtest_dbtf_` prefix is load-bearing for
 * mutation verification: a policy predicated on `current_user LIKE
 * 'dbtest\_dbtf\_%'` changes what THIS suite's role sees and nothing any other
 * lane's role sees, so the behavioural cases can be broken on the live table
 * without breaking a concurrent suite.
 */
const RUNTIME_PASSWORD = 'dbtf-schema-posture-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbtest_dbtf_${RUN}` });

/** The role production serves requests with — install-fresh step 7/8 mints it. */
const APP_ROLE = resolveAppServiceRole(process.env);

/** Tables the 2026-08-24 migrations create or extend, which the entitlement paths write. */
const ENTITLEMENT_TABLES = ['module_subscriptions', 'module_access_requests', 'platform_settings'];

// ─── Statements copied verbatim from the modules that send them ──────────────

const ROUTE_FILE = 'server/routes/module-access-requests.ts';
const ENFORCEMENT_FILE = 'server/services/entitlements/enforcement-mode.ts';

/** module-access-requests.ts SELECT_REQUEST — every read projects through it. */
const SELECT_REQUEST = `
  SELECT r.id, r.organization_id, r.module_id, r.requested_by, r.requester_email,
         r.requester_name, r.note, r.status, r.decided_by, r.decided_by_email,
         r.decided_at, r.decision_reason, r.created_at, r.updated_at,
         am.name AS module_name, o.name AS organization_name
    FROM module_access_requests r
    LEFT JOIN available_modules am ON am.module_id = r.module_id
    LEFT JOIN organizations o ON o.id = r.organization_id`;

/** module-access-requests.ts POST / — the de-duplicating upsert. */
const UPSERT_REQUEST = `INSERT INTO module_access_requests
         (organization_id, module_id, requested_by, requester_email, requester_name, note, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'open')
       ON CONFLICT (organization_id, module_id, requested_by) WHERE status = 'open'
       DO UPDATE SET
         note = COALESCE(EXCLUDED.note, module_access_requests.note),
         requester_email = COALESCE(EXCLUDED.requester_email, module_access_requests.requester_email),
         requester_name = COALESCE(EXCLUDED.requester_name, module_access_requests.requester_name),
         updated_at = now()
       RETURNING id, (xmax = 0) AS inserted`;

/** module-access-requests.ts decide path — the row lock taken before any decision. */
const LOCK_REQUEST = `SELECT id, organization_id, module_id, requested_by, status
           FROM module_access_requests WHERE id = $1
            FOR UPDATE`;

/** module-access-requests.ts decide path — the recorded answer. */
const DECIDE_REQUEST = `UPDATE module_access_requests
            SET status = $2,
                decided_by = $3,
                decided_by_email = $4,
                decided_at = now(),
                decision_reason = $5,
                updated_at = now()
          WHERE id = $1 AND status = 'open'
          RETURNING id`;

/**
 * module-access-requests.ts GET /mine — the requester's own list. Sent as
 * `${SELECT_REQUEST}` + this tail; the drift check matches the tail with the
 * interpolation left in, exactly as the source spells it.
 */
const MINE_TAIL = `
        WHERE r.requested_by = $1 AND r.organization_id = $2
        ORDER BY r.created_at DESC
        LIMIT 50`;

/**
 * module-access-requests.ts readAccessRequestQueue — ONE statement for both
 * mounts. On the `all` mount (system scope) $1 is NULL, so the predicate lifts
 * and RLS alone decides how many workspaces the read spans. The source
 * interpolates `${QUEUE_LIMIT}`; it is kept literal here for the drift check
 * and substituted with the route's own constant before execution.
 */
const QUEUE_TAIL_SOURCE = `
          WHERE ($1::int IS NULL OR r.organization_id = $1)
            AND ($2::text IS NULL OR r.status = $2)
          ORDER BY (r.status = 'open') DESC, r.created_at DESC
          LIMIT \${QUEUE_LIMIT}`;

/** enforcement-mode.ts readStoredMode(). */
const READ_SETTING = `SELECT setting_value, updated_at, updated_by, reason
         FROM platform_settings
        WHERE setting_key = $1`;

/** enforcement-mode.ts writeEnforcementMode(). */
const WRITE_SETTING = `INSERT INTO platform_settings (setting_key, setting_value, updated_at, updated_by, reason)
     VALUES ($1, $2, now(), $3, $4)
     ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = EXCLUDED.setting_value,
           updated_at    = now(),
           updated_by    = EXCLUDED.updated_by,
           reason        = EXCLUDED.reason`;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

// ─── Handles ─────────────────────────────────────────────────────────────────

type ServerRuntime = typeof import('../../server/db/runtime');
type TenantStore = typeof import('../../server/db/tenantStore');
type ModuleGrants = typeof import('../../server/services/entitlements/module-grants');
type EnforcementModeModule = typeof import('../../server/services/entitlements/enforcement-mode');

let owner: Pool;
let server: ServerRuntime;
let tenants: TenantStore;
let grants: ModuleGrants;
let enforcement: EnforcementModeModule;
let savedAppDatabaseUrl: string | undefined;
const orgUuid: Record<number, string> = {};
/** Org B's open request, seeded by the owner. */
let requestB = 0;

/**
 * The per-user scope establishRequestTenantScope opens for a member of `org` on
 * a non-system mount — `/api/module-access-requests` and
 * `/api/module-subscriptions` are both outside SYSTEM_SCOPE_PREFIXES.
 */
function asMember<T>(org: number, fn: () => Promise<T>): Promise<T> {
  return tenants.runWithTenantScope(
    {
      tenantId: String(org),
      orgUuid: orgUuid[org],
      role: 'admin',
      source: 'request',
      caller: 'dbtf:/api/module-access-requests',
    },
    fn,
  );
}

/** The system scope `/api/admin/master` (a SYSTEM_SCOPE_PREFIXES entry) runs under. */
function asSystem<T>(fn: () => Promise<T>): Promise<T> {
  return tenants.runWithSystemTenantScope('dbtf:/api/admin/master', fn);
}

/**
 * The scope readStoredMode() actually reads platform_settings under: tenant
 * '0' and NO role — neither a tenant nor the super-admin arm of any policy.
 * Same caller string as the module, so the instrumentation labels match.
 */
function asPreAuth<T>(fn: () => Promise<T>): Promise<T> {
  return tenants.runWithPreAuthScope('entitlements:enforcement-mode-read', fn);
}

/** The route's own QUEUE_LIMIT, read from source so the executed text is the sent text. */
function routeQueueLimit(): number {
  const src = fs.readFileSync(path.join(REPO_ROOT, ROUTE_FILE), 'utf8');
  const m = /const QUEUE_LIMIT = (\d+);/.exec(src);
  if (!m) throw new Error(`${ROUTE_FILE} no longer declares QUEUE_LIMIT — update this suite`);
  return Number(m[1]);
}

/** The RLS violation an INSERT's WITH CHECK raises: SQLSTATE 42501. */
async function rlsViolation(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (err) {
    return err as { code?: string; message: string };
  }
  throw new Error('expected the statement to be refused by row-level security; it succeeded');
}

/** Any database refusal (e.g. a CHECK constraint, SQLSTATE 23514). */
async function refusedBy(what: string, p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (err) {
    return err as { code?: string; message: string };
  }
  throw new Error(`expected the statement to be refused by ${what}; it succeeded`);
}

async function cleanup(): Promise<void> {
  // One client, enforcement explicitly off: under FORCE ROW LEVEL SECURITY a
  // non-superuser owner would otherwise leave rows behind (CI and local both
  // run as a superuser today; this does not depend on it).
  const client = await owner.connect();
  try {
    await client.query("SELECT set_config('app.rls_enforce', 'off', false)");
    await client.query(
      `DELETE FROM module_access_requests
        WHERE organization_id BETWEEN $1 AND $2 OR module_id LIKE 'dbtf\\_%'`,
      [ORG_LO, ORG_HI],
    );
    await client.query(
      `DELETE FROM module_subscriptions
        WHERE organization_id BETWEEN $1 AND $2 OR module_id LIKE 'dbtf\\_%'`,
      [ORG_LO, ORG_HI],
    );
    await client.query(`DELETE FROM platform_settings WHERE setting_key LIKE 'dbtf\\_%'`);
    await client.query(`DELETE FROM available_modules WHERE module_id LIKE 'dbtf\\_%'`);
    const uuids = (
      await client.query('SELECT uuid::text AS uuid FROM organizations WHERE id BETWEEN $1 AND $2', [
        ORG_LO,
        ORG_HI,
      ])
    ).rows.map((r: { uuid: string }) => r.uuid);
    await client.query('DELETE FROM organizations WHERE id BETWEEN $1 AND $2', [ORG_LO, ORG_HI]);
    if (uuids.length > 0) {
      // trg_sync_org_to_identity mirrors every organizations INSERT; remove only
      // this lane's mirrors.
      await client
        .query(
          `DELETE FROM identity.organizations WHERE id = ANY($1::uuid[]) AND created_by = 'c48-stage1-sync'`,
          [uuids],
        )
        .catch(() => {/* mirror absent or referenced — harmless leftover */});
    }
    await client.query(`DROP TABLE IF EXISTS public.${PROBE_TABLE}`);
  } finally {
    await client.query('RESET ALL').catch(() => {});
    client.release();
  }
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  const present = await owner.query(
    `SELECT to_regclass('public.module_subscriptions') AS subs,
            to_regclass('public.module_access_requests') AS reqs,
            to_regclass('public.platform_settings') AS settings`,
  );
  const missing = Object.entries(present.rows[0]).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `[dbtf] entitlement tables absent (${missing.join(', ')}). Provision a deploy-shaped ` +
        'database first: node scripts/db/install-fresh.mjs && node scripts/db/deploy-migrate.mjs. ' +
        'Not skipped — a database test that silently does not run is the defect this suite prevents.',
    );
  }

  await cleanup();

  // 1. The runtime role, minted by the REAL provisioning script. Retried only on
  //    `tuple concurrently updated`: its GRANT ... ON ALL TABLES rewrites catalog
  //    ACL rows, and a concurrent suite provisioning its own role collides there.
  let provisioned: { skipped: boolean } | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      provisioned = await provisionAppServiceRole(owner, {
        env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
      });
      break;
    } catch (err) {
      if (attempt >= 5 || !/tuple concurrently updated/.test((err as Error).message)) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  if (provisioned!.skipped) throw new Error('[dbtf] provisionAppServiceRole skipped — no runtime role.');

  // 2. Route server/db through it BEFORE the first import (the pool is built at
  //    module load), with the enforcement mode production hard-requires.
  const url = new URL(databaseUrl);
  url.username = runtimeRole;
  url.password = RUNTIME_PASSWORD;
  savedAppDatabaseUrl = process.env.APP_DATABASE_URL;
  process.env.APP_DATABASE_URL = url.toString();
  process.env.RLS_ENFORCE = 'on';

  server = await import('../../server/db/runtime');
  tenants = await import('../../server/db/tenantStore');
  grants = await import('../../server/services/entitlements/module-grants');
  enforcement = await import('../../server/services/entitlements/enforcement-mode');

  // 3. Fixtures, as the owner.
  for (const [id, label] of [
    [ORG_A, 'a'],
    [ORG_B, 'b'],
  ] as const) {
    const r = await owner.query(
      `INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $3, 'active') RETURNING uuid::text AS uuid`,
      [id, `dbtf workspace ${label}`, `dbtf-${label}-${RUN}`],
    );
    orgUuid[id] = r.rows[0].uuid;
  }
  for (const [i, id] of [MOD_A, MOD_B].entries()) {
    await owner.query(
      `INSERT INTO available_modules (module_id, name, category, sort_order, metadata)
       VALUES ($1, $2, 'dbtf', $3, '{"tiers":["enterprise"],"industries":[]}'::json)`,
      [id, `dbtf ${id}`, 9960 + i],
    );
  }
  requestB = (
    await owner.query(
      `INSERT INTO module_access_requests (organization_id, module_id, requested_by, note, status)
       VALUES ($1, $2, $3, 'dbtf org B note', 'open') RETURNING id`,
      [ORG_B, MOD_B, USER_B],
    )
  ).rows[0].id;
  await owner.query(
    `INSERT INTO module_subscriptions (organization_id, module_id, enabled, enabled_by)
     VALUES ($1, $2, true, 'dbtf-fixture')`,
    [ORG_B, MOD_B],
  );
}, 180_000);

afterAll(async () => {
  try {
    if (owner) await cleanup();
  } finally {
    if (server) await server.getPool().end().catch(() => {});
    if (owner) {
      await owner
        .query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`)
        .catch(() => {});
      await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`).catch(() => {});
      await owner.end().catch(() => {});
    }
    if (savedAppDatabaseUrl === undefined) delete process.env.APP_DATABASE_URL;
    else process.env.APP_DATABASE_URL = savedAppDatabaseUrl;
  }
}, 120_000);

// ─── 0. The posture is production's ──────────────────────────────────────────

describe('0. the server pool runs as production does', () => {
  it('connects as the non-superuser runtime role with app.rls_enforce=on, and fails closed with no scope', async () => {
    const posture = await asMember(ORG_A, async () =>
      (
        await server.query(
          `SELECT current_user AS role,
                  current_setting('is_superuser')::boolean AS superuser,
                  (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls,
                  current_setting('app.rls_enforce', true) AS rls_enforce,
                  current_setting('app.current_tenant_id', true) AS tenant`,
        )
      ).rows[0],
    );
    expect(posture).toEqual({
      role: runtimeRole,
      superuser: false,
      bypassrls: false,
      rls_enforce: 'on',
      tenant: String(ORG_A),
    });

    // No scope at all is refused before a packet leaves the process.
    await expect(server.query(`SELECT 1 FROM module_access_requests LIMIT 1`)).rejects.toThrow(
      /requires an active tenant scope while RLS_ENFORCE=on/,
    );
  });

  it('the statements exercised below are the ones the modules send (no drift from the copy)', () => {
    const route = squash(fs.readFileSync(path.join(REPO_ROOT, ROUTE_FILE), 'utf8'));
    for (const stmt of [
      SELECT_REQUEST,
      UPSERT_REQUEST,
      LOCK_REQUEST,
      DECIDE_REQUEST,
      // Sent as `${SELECT_REQUEST}<tail>` — matched with the interpolation literal.
      '`${SELECT_REQUEST}' + MINE_TAIL + '`',
      '`${SELECT_REQUEST}' + QUEUE_TAIL_SOURCE + '`',
    ]) {
      expect(route, `${ROUTE_FILE} no longer sends:\n${stmt}`).toContain(squash(stmt));
    }
    const enforcement = squash(fs.readFileSync(path.join(REPO_ROOT, ENFORCEMENT_FILE), 'utf8'));
    for (const stmt of [READ_SETTING, WRITE_SETTING]) {
      expect(enforcement, `${ENFORCEMENT_FILE} no longer sends:\n${stmt}`).toContain(squash(stmt));
    }
  });
});

// ─── Catalog helpers ─────────────────────────────────────────────────────────

async function columns(table: string): Promise<Record<string, { type: string; nullable: boolean }>> {
  const { rows } = await owner.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return Object.fromEntries(
    rows.map((r) => [r.column_name, { type: r.data_type, nullable: r.is_nullable === 'YES' }]),
  );
}

async function indexes(
  table: string,
): Promise<Record<string, { unique: boolean; columns: string[]; predicate: string | null }>> {
  const { rows } = await owner.query(
    `SELECT i.relname AS name, ix.indisunique AS unique,
            pg_get_expr(ix.indpred, ix.indrelid) AS predicate,
            ARRAY(
              SELECT a.attname::text
                FROM unnest(ix.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
               ORDER BY k.ord
            ) AS columns
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
      WHERE ix.indrelid = to_regclass($1)`,
    [`public.${table}`],
  );
  return Object.fromEntries(
    rows.map((r) => [r.name, { unique: r.unique, columns: r.columns, predicate: r.predicate }]),
  );
}

async function rlsPosture(table: string) {
  const { rows } = await owner.query(
    `SELECT c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = $1`,
    [table],
  );
  const policies = (
    await owner.query(
      `SELECT policyname, permissive, cmd, roles::text[] AS roles, qual, with_check
         FROM pg_policies WHERE schemaname = 'public' AND tablename = $1
        ORDER BY policyname`,
      [table],
    )
  ).rows;
  return { ...rows[0], policies };
}

/**
 * The canonical per-tenant policy, attached by the sweep, and NOTHING beside it.
 * Permissive policies OR together, so a second permissive policy — a `USING
 * (true)` added to "unblock" something — makes the tenant one decorative while
 * every presence check still passes. Hence: exactly one.
 */
function expectOnlyCanonicalTenantPolicy(posture: Awaited<ReturnType<typeof rlsPosture>>): void {
  expect(posture.policies.map((p: { policyname: string }) => p.policyname)).toEqual([
    'tenant_isolation_policy',
  ]);
  const [p] = posture.policies;
  expect(p.permissive).toBe('PERMISSIVE');
  expect(p.cmd).toBe('ALL');
  expect(p.roles).toEqual(['public']);
  for (const clause of [p.qual, p.with_check]) {
    expect(clause).toContain("(organization_id = (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::integer)");
    expect(clause).toContain("(current_setting('app.current_user_role'::text, true) = 'app_super_admin'::text)");
  }
}

// ─── 1. module_subscriptions — grant expiry (20260824_module_grant_expiry.sql) ─

describe('1. module_subscriptions carries the grant-expiry columns and indexes', () => {
  it('expires_at is an instant (timestamptz); expiry_set_by / expiry_set_at exist with their declared types', async () => {
    const cols = await columns('module_subscriptions');
    expect(cols.expires_at).toEqual({ type: 'timestamp with time zone', nullable: true });
    expect(cols.expiry_set_by).toEqual({ type: 'text', nullable: true });
    expect(cols.expiry_set_at).toEqual({ type: 'timestamp with time zone', nullable: true });
  });

  it('both partial expiry indexes exist, non-unique, on exactly their columns and predicate', async () => {
    const idx = await indexes('module_subscriptions');
    expect(idx.module_subscriptions_expires_at_idx).toEqual({
      unique: false,
      columns: ['expires_at'],
      predicate: '(expires_at IS NOT NULL)',
    });
    expect(idx.module_subscriptions_org_expiry_idx).toEqual({
      unique: false,
      columns: ['organization_id', 'expires_at'],
      predicate: '(expires_at IS NOT NULL)',
    });
  });
});

// ─── 2. module_access_requests (20260824_module_access_requests.sql) ─────────

describe('2. module_access_requests is a policied tenant table', () => {
  it('organization_id is INTEGER NOT NULL — the shape the integer sweep policies', async () => {
    const cols = await columns('module_access_requests');
    expect(cols.organization_id).toEqual({ type: 'integer', nullable: false });
  });

  it('RLS is enabled AND forced', async () => {
    const posture = await rlsPosture('module_access_requests');
    expect(posture.enabled).toBe(true);
    expect(posture.forced).toBe(true);
  });

  it('tenant_isolation_policy is attached, keyed on organization_id, and is the only policy', async () => {
    expectOnlyCanonicalTenantPolicy(await rlsPosture('module_access_requests'));
  });

  it("the de-duplication index is UNIQUE on (organization_id, module_id, requested_by) WHERE status = 'open', exactly", async () => {
    const idx = await indexes('module_access_requests');
    expect(idx.module_access_requests_open_uniq).toEqual({
      unique: true,
      columns: ['organization_id', 'module_id', 'requested_by'],
      predicate: "(status = 'open'::text)",
    });
  });

  it('every declared column has its declared type, nullability and default', async () => {
    const { rows } = await owner.query(
      `SELECT column_name, data_type, is_nullable = 'YES' AS nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'module_access_requests'`,
    );
    const shape = Object.fromEntries(
      rows.map((r) => [r.column_name, { type: r.data_type, nullable: r.nullable, default: r.column_default }]),
    );
    const tz = 'timestamp with time zone';
    // toMatchObject, not toEqual: a later additive column (amended in place,
    // RULE 1) must not break this; a changed declared column must.
    expect(shape).toMatchObject({
      id: { type: 'integer', nullable: false, default: "nextval('module_access_requests_id_seq'::regclass)" },
      organization_id: { type: 'integer', nullable: false, default: null },
      module_id: { type: 'text', nullable: false, default: null },
      requested_by: { type: 'integer', nullable: false, default: null },
      requester_email: { type: 'text', nullable: true },
      requester_name: { type: 'text', nullable: true },
      note: { type: 'text', nullable: true },
      status: { type: 'text', nullable: false, default: "'open'::text" },
      decided_by: { type: 'integer', nullable: true },
      decided_by_email: { type: 'text', nullable: true },
      decided_at: { type: tz, nullable: true },
      decision_reason: { type: 'text', nullable: true },
      created_at: { type: tz, nullable: false, default: 'now()' },
      updated_at: { type: tz, nullable: false, default: 'now()' },
    });
  });

  it("the status vocabulary CHECK is exactly ('open', 'approved', 'declined')", async () => {
    const { rows } = await owner.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'public.module_access_requests'::regclass AND conname = 'module_access_requests_status_ck'`,
    );
    expect(rows).toEqual([
      { def: "CHECK ((status = ANY (ARRAY['open'::text, 'approved'::text, 'declined'::text])))" },
    ]);
  });

  it('the decide UPDATE cannot record a status outside that vocabulary, even on its own open request', async () => {
    // Behaviour, as the runtime role in the caller's own scope, on its OWN open
    // request — so RLS admits the row and only the CHECK can refuse it.
    const own = (
      await asMember(ORG_A, () =>
        server.query(UPSERT_REQUEST, [ORG_A, MOD_B, USER_A, 'dbtf-a@example.invalid', 'dbtf a', 'status probe']),
      )
    ).rows[0];
    const refused = await refusedBy(
      'module_access_requests_status_ck',
      asMember(ORG_A, () =>
        server.query(DECIDE_REQUEST, [own.id, 'withdrawn', USER_A, 'dbtf-a@example.invalid', 'dbtf probe']),
      ),
    );
    expect(refused.code).toBe('23514');
    expect(refused.message).toMatch(/module_access_requests_status_ck/);
    const still = await owner.query('SELECT status FROM module_access_requests WHERE id = $1', [own.id]);
    expect(still.rows).toEqual([{ status: 'open' }]);
  });

  it('the queue and requester indexes the route reads through exist, exactly as declared', async () => {
    const { rows } = await owner.query(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'module_access_requests'
          AND indexname IN ('module_access_requests_org_status_idx', 'module_access_requests_requester_idx')
        ORDER BY indexname`,
    );
    expect(rows).toEqual([
      {
        indexname: 'module_access_requests_org_status_idx',
        indexdef:
          'CREATE INDEX module_access_requests_org_status_idx ON public.module_access_requests USING btree (organization_id, status, created_at DESC)',
      },
      {
        indexname: 'module_access_requests_requester_idx',
        indexdef:
          'CREATE INDEX module_access_requests_requester_idx ON public.module_access_requests USING btree (requested_by, status)',
      },
    ]);
  });

  it("GET /mine's read, asked for org B's requester from org A's scope, returns nothing", async () => {
    const mine = `${SELECT_REQUEST}${MINE_TAIL}`;
    const fromA = await asMember(ORG_A, () => server.query(mine, [USER_B, ORG_B]));
    expect(fromA.rows).toEqual([]);
    // Positive control: the same statement in B's own scope returns B's request.
    const fromB = await asMember(ORG_B, () => server.query(mine, [USER_B, ORG_B]));
    expect(fromB.rows.map((r: { id: number }) => r.id)).toEqual([requestB]);
  });

  it('the queue read with its org predicate lifted ($1 NULL) spans one workspace per-user, and more only under the /api/admin/master system scope', async () => {
    const queue = `${SELECT_REQUEST}${QUEUE_TAIL_SOURCE.replace('${QUEUE_LIMIT}', String(routeQueueLimit()))}`;
    // Org A holds an open request of its own, so an empty result cannot pass.
    const own = (
      await asMember(ORG_A, () =>
        server.query(UPSERT_REQUEST, [ORG_A, MOD_B, USER_A, 'dbtf-a@example.invalid', 'dbtf a', 'queue probe']),
      )
    ).rows[0];

    // Per-user scope, predicate lifted: RLS is the ONLY thing confining this.
    const perUser = await asMember(ORG_A, () => server.query(queue, [null, null]));
    const orgs = [...new Set(perUser.rows.map((r: { organization_id: number }) => r.organization_id))];
    expect(orgs).toEqual([ORG_A]);
    expect(perUser.rows.map((r: { id: number }) => r.id)).toContain(own.id);
    expect(perUser.rows.map((r: { id: number }) => r.id)).not.toContain(requestB);

    // System scope, predicate lifted: the cross-workspace owner view.
    const system = await asSystem(() => server.query(queue, [null, 'open']));
    const ids = system.rows.map((r: { id: number }) => r.id);
    if (ids.length < routeQueueLimit()) {
      // Not truncated by other suites' open requests: both workspaces are in it.
      expect(ids).toContain(requestB);
      expect(ids).toContain(own.id);
    } else {
      expect(new Set(system.rows.map((r: { organization_id: number }) => r.organization_id)).size).toBeGreaterThan(1);
    }
  });

  it("org A cannot read org B's request — the route's projection and its row lock both see nothing", async () => {
    const projected = await asMember(ORG_A, () =>
      server.query(`${SELECT_REQUEST} WHERE r.id = $1`, [requestB]),
    );
    expect(projected.rows).toEqual([]);

    const locked = await asMember(ORG_A, async () => {
      const client = await server.getPool().connect();
      try {
        await client.query('BEGIN');
        const r = await client.query(LOCK_REQUEST, [requestB]);
        await client.query('ROLLBACK');
        return r.rows;
      } finally {
        client.release();
      }
    });
    expect(locked).toEqual([]);

    // Positive control: org B's own scope reads it, so the empty result above is
    // isolation and not a missing row.
    const own = await asMember(ORG_B, () =>
      server.query(`${SELECT_REQUEST} WHERE r.id = $1`, [requestB]),
    );
    expect(own.rows.map((r: { organization_id: number }) => r.organization_id)).toEqual([ORG_B]);
  });

  it("org A cannot answer org B's request — the decide UPDATE touches no row", async () => {
    const updated = await asMember(ORG_A, () =>
      server.query(DECIDE_REQUEST, [requestB, 'approved', USER_A, 'dbtf-a@example.invalid', 'dbtf cross-tenant attempt']),
    );
    expect(updated.rows).toEqual([]);
    const still = await owner.query('SELECT status, decided_by FROM module_access_requests WHERE id = $1', [requestB]);
    expect(still.rows[0]).toEqual({ status: 'open', decided_by: null });
  });

  it("org A cannot insert a request into org B — fresh row or onto B's open key — and B's row is untouched", async () => {
    const fresh = await rlsViolation(
      asMember(ORG_A, () =>
        server.query(UPSERT_REQUEST, [ORG_B, MOD_A, USER_A, 'dbtf-a@example.invalid', 'dbtf a', 'planted']),
      ),
    );
    expect(fresh.code).toBe('42501');
    expect(fresh.message).toMatch(/row-level security policy for table "module_access_requests"/);

    const onto = await rlsViolation(
      asMember(ORG_A, () =>
        server.query(UPSERT_REQUEST, [ORG_B, MOD_B, USER_B, 'dbtf-a@example.invalid', 'dbtf a', 'overwritten']),
      ),
    );
    expect(onto.code).toBe('42501');

    const rows = await owner.query(
      'SELECT id, note FROM module_access_requests WHERE organization_id = $1 ORDER BY id',
      [ORG_B],
    );
    expect(rows.rows).toEqual([{ id: requestB, note: 'dbtf org B note' }]);
  });

  it('under its own scope the upsert de-duplicates on the partial index, and an answered request may be asked again', async () => {
    const ask = () =>
      asMember(ORG_A, () =>
        server.query(UPSERT_REQUEST, [ORG_A, MOD_A, USER_A, 'dbtf-a@example.invalid', 'dbtf a', 'need it']),
      );
    const first = (await ask()).rows[0];
    expect(first.inserted).toBe(true);
    const again = (await ask()).rows[0];
    expect(again).toEqual({ id: first.id, inserted: false });

    const declined = await asMember(ORG_A, () =>
      server.query(DECIDE_REQUEST, [first.id, 'declined', USER_A, 'dbtf-a@example.invalid', 'dbtf not this quarter']),
    );
    expect(declined.rows).toEqual([{ id: first.id }]);

    const reopened = (await ask()).rows[0];
    expect(reopened.inserted).toBe(true);
    expect(reopened.id).not.toBe(first.id);
  });
});

// ─── 3. module_subscriptions isolation (the grant writer and trials write it) ─

describe('3. module_subscriptions is a policied tenant table', () => {
  it('RLS is enabled AND forced, and tenant_isolation_policy is the only policy', async () => {
    const posture = await rlsPosture('module_subscriptions');
    expect(posture.enabled).toBe(true);
    expect(posture.forced).toBe(true);
    expectOnlyCanonicalTenantPolicy(posture);
  });

  it('the REAL writeModuleGrant: a member scope writes its own org and is refused on another', async () => {
    const expiresAt = '2031-01-01T00:00:00.000Z';
    const own = await asMember(ORG_A, () =>
      grants.writeModuleGrant({
        organizationId: ORG_A,
        moduleId: MOD_A,
        enabled: true,
        actorEmail: 'dbtf-a@example.invalid',
        expiresAt,
      }),
    );
    expect(own.organization_id).toBe(ORG_A);
    expect(new Date(own.expires_at as string).toISOString()).toBe(expiresAt);

    const cross = await rlsViolation(
      asMember(ORG_A, () =>
        grants.writeModuleGrant({
          organizationId: ORG_B,
          moduleId: MOD_B,
          enabled: false,
          actorEmail: 'dbtf-a@example.invalid',
          expiresAt: null,
        }),
      ),
    );
    expect(cross.code).toBe('42501');
    expect(cross.message).toMatch(/row-level security policy for table "module_subscriptions"/);

    const b = await owner.query(
      'SELECT enabled, enabled_by FROM module_subscriptions WHERE organization_id = $1 AND module_id = $2',
      [ORG_B, MOD_B],
    );
    expect(b.rows).toEqual([{ enabled: true, enabled_by: 'dbtf-fixture' }]);

    const seenFromA = await asMember(ORG_A, () =>
      server.query('SELECT organization_id FROM module_subscriptions WHERE organization_id = $1', [ORG_B]),
    );
    expect(seenFromA.rows).toEqual([]);
  });

  it('the REAL writeModuleGrant under the /api/admin/master system scope reaches any org (the console path)', async () => {
    const row = await asSystem(() =>
      grants.writeModuleGrant({
        organizationId: ORG_B,
        moduleId: MOD_A,
        enabled: true,
        actorEmail: 'dbtf-platform@example.invalid',
        expiresAt: null,
      }),
    );
    expect(row).toMatchObject({ organization_id: ORG_B, module_id: MOD_A, enabled: true, expires_at: null });
  });
});

// ─── 4. platform_settings — deliberately global ──────────────────────────────

describe('4. platform_settings is deliberately global, and registered as such', () => {
  it('has no tenant column, no RLS and no policy', async () => {
    const cols = await columns('platform_settings');
    expect(Object.keys(cols).sort()).toEqual(
      ['reason', 'setting_key', 'setting_value', 'updated_at', 'updated_by'],
    );
    for (const tenantKey of ['organization_id', 'org_id', 'tenant_id', 'workspace_id', 'company_id']) {
      expect(cols[tenantKey], `platform_settings unexpectedly carries ${tenantKey}`).toBeUndefined();
    }
    const posture = await rlsPosture('platform_settings');
    expect(posture.enabled).toBe(false);
    expect(posture.forced).toBe(false);
    expect(posture.policies).toEqual([]);
  });

  it('each column has its declared type and nullability, and setting_key is the primary key the upsert conflicts on', async () => {
    expect(await columns('platform_settings')).toEqual({
      setting_key: { type: 'text', nullable: false },
      // NOT NULL: a NULL value would reach resolveMode as "a row this build
      // does not understand" — a warning, not the absence the file promises.
      setting_value: { type: 'text', nullable: false },
      updated_at: { type: 'timestamp with time zone', nullable: false },
      // integer, matching the platform user id the route writes; nullable
      // because an operational script has no user (never a sentinel actor).
      updated_by: { type: 'integer', nullable: true },
      reason: { type: 'text', nullable: true },
    });
    const pk = await owner.query(
      `SELECT ARRAY(SELECT a.attname::text FROM unnest(ix.indkey::int2[]) k(attnum)
                      JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum) AS cols
         FROM pg_index ix WHERE ix.indrelid = 'public.platform_settings'::regclass AND ix.indisprimary`,
    );
    expect(pk.rows).toEqual([{ cols: ['setting_key'] }]);
  });

  it('is classified `global` (with a reason) in the unkeyed-table registry, not left `unreviewed`', () => {
    const baseline = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'scripts/ci/unkeyed-request-tables-baseline.json'), 'utf8'),
    ) as { entries: Record<string, string> };
    const reason = baseline.entries.platform_settings;
    expect(reason).toMatch(/^global — /);
    // A classification is a written decision, not a word: it must say why.
    expect(reason.length).toBeGreaterThan(80);
  });

  it('the stored setting reads identically under the pre-auth scope readStoredMode() uses, and under every other scope', async () => {
    // Written the way PATCH /api/admin/master/licensing/enforcement/mode writes:
    // system scope, enforcement-mode.ts's own statement.
    await asSystem(() =>
      server.query(WRITE_SETTING, [SETTING_KEY, 'report', null, 'dbtf posture probe']),
    );

    const read = (scope: () => Promise<{ rows: Array<{ setting_value: string }> }>) =>
      scope().then((r) => r.rows.map((x) => x.setting_value));
    // THE production read: readStoredMode() wraps its query in
    // runWithPreAuthScope — tenant '0', NO role — and that scope nests
    // innermost, so this is the scope the gate's read runs under on every
    // request, not the request's own. It satisfies neither the tenant arm nor
    // the super-admin arm of any policy. A policy that admits "any real tenant
    // or a platform admin" passes the three reads below and hides the stored
    // mode here — and the module then answers "nothing stored" (no error, not
    // degraded) and silently falls back to the deployment value.
    expect(await read(() => asPreAuth(() => server.query(READ_SETTING, [SETTING_KEY])))).toEqual(['report']);
    // The remaining scopes any code path reading this table can carry.
    expect(await read(() => asMember(ORG_A, () => server.query(READ_SETTING, [SETTING_KEY])))).toEqual(['report']);
    expect(await read(() => asMember(ORG_B, () => server.query(READ_SETTING, [SETTING_KEY])))).toEqual(['report']);
    expect(await read(() => asSystem(() => server.query(READ_SETTING, [SETTING_KEY])))).toEqual(['report']);
  });

  it('the REAL readStoredMode(), called with no ambient scope as the background refresh calls it, reads as the runtime role', async () => {
    // Read-only, so it is safe on the real `module_enforcement_mode` key. That
    // key is written concurrently by master-licensing-console.dbtest.ts, so the
    // value is compared only when the owner's view is stable across the call.
    const ownerView = async () =>
      (
        await owner.query(`SELECT setting_value FROM platform_settings WHERE setting_key = $1`, [
          enforcement.ENFORCEMENT_MODE_KEY,
        ])
      ).rows[0]?.setting_value ?? null;
    expect(tenants.getTenantScope()).toBeUndefined();
    const before = await ownerView();
    // Must not throw: with RLS_ENFORCE=on an unscoped pool query fails closed
    // (test 0), so this resolving at all proves the module supplies its own
    // scope, and that the runtime role can read the table under it.
    const row = await enforcement.readStoredMode();
    const after = await ownerView();
    if (before === after) expect(row?.setting_value ?? null).toBe(before);
  });
});

// ─── 5. app_service holds DML on the tables deploy-migrate created ───────────

describe(`5. ${APP_ROLE} can reach the entitlement tables, by the real grant mechanism`, () => {
  it(`${APP_ROLE} exists as production requires it: LOGIN, not superuser, no BYPASSRLS`, async () => {
    const { rows } = await owner.query(
      'SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1',
      [APP_ROLE],
    );
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false, rolcanlogin: true }]);
  });

  it(`${APP_ROLE} holds SELECT/INSERT/UPDATE/DELETE on all three, and USAGE on the request id sequence`, async () => {
    const { rows } = await owner.query(
      `SELECT t AS table,
              has_table_privilege($1, 'public.' || t, 'SELECT') AS s,
              has_table_privilege($1, 'public.' || t, 'INSERT') AS i,
              has_table_privilege($1, 'public.' || t, 'UPDATE') AS u,
              has_table_privilege($1, 'public.' || t, 'DELETE') AS d
         FROM unnest($2::text[]) AS t ORDER BY t`,
      [APP_ROLE, ENTITLEMENT_TABLES],
    );
    for (const r of rows) expect(r, r.table).toEqual({ table: r.table, s: true, i: true, u: true, d: true });
    expect(rows).toHaveLength(3);

    const seq = await owner.query(
      `SELECT has_sequence_privilege($1, 'public.module_access_requests_id_seq', 'USAGE') AS usage`,
      [APP_ROLE],
    );
    expect(seq.rows[0].usage).toBe(true);
  });

  it("the deploy's own grant audit (auditRuntimeRoleGrants, deploy-migrate step 5/5) denies none of them", async () => {
    const audit = await auditRuntimeRoleGrants(owner, APP_ROLE);
    expect(audit.exists).toBe(true);
    const denied = audit.denied
      .map((d: { relation: string }) => d.relation)
      .filter((r: string) => ENTITLEMENT_TABLES.some((t) => r === `public.${t}`));
    expect(denied).toEqual([]);
  });

  /**
   * THE MECHANISM. These tables are created by deploy-migrate step 3/5, AFTER
   * install-fresh step 7/8 ran provisionAppServiceRole — whose GRANT ... ON ALL
   * TABLES could not have reached them. What does is the ALTER DEFAULT
   * PRIVILEGES that same call issues (grantRuntimeRolePrivileges): every table
   * the OWNER creates later in `public` is born granted. It only applies to
   * tables created BY the role the default ACL belongs to, so that is asserted
   * too. (deploy-migrate step 4/5, ensureRuntimeRole, re-runs GRANT ... ON ALL
   * TABLES as a second, catch-up path.)
   */
  it(`public's default ACL — held by the owner that created these tables — grants ${APP_ROLE} DML on new tables`, async () => {
    const owners = await owner.query(
      `SELECT DISTINCT pg_get_userbyid(relowner) AS owner FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[])`,
      [ENTITLEMENT_TABLES],
    );
    expect(owners.rows).toHaveLength(1);
    const tableOwner = owners.rows[0].owner;

    const { rows } = await owner.query(
      `SELECT d.defaclobjtype AS kind,
              ARRAY(SELECT x.privilege_type::text FROM aclexplode(d.defaclacl) x
                     WHERE x.grantee = (SELECT oid FROM pg_roles WHERE rolname = $2)
                     ORDER BY 1) AS privs
         FROM pg_default_acl d
        WHERE d.defaclnamespace = 'public'::regnamespace
          AND d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = $1)`,
      [tableOwner, APP_ROLE],
    );
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.privs]));
    expect(byKind.r).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    expect(byKind.S).toEqual(['SELECT', 'USAGE']);
  });

  it(`a table the owner creates now, with no GRANT, is born reachable by ${APP_ROLE}`, async () => {
    const who = await owner.query(`SELECT current_user AS me`);
    const tableOwner = (
      await owner.query(`SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid = 'public.platform_settings'::regclass`)
    ).rows[0].owner;
    // The probe proves the mechanism for the role deploy-migrate runs as.
    expect(who.rows[0].me).toBe(tableOwner);

    await owner.query(`CREATE TABLE public.${PROBE_TABLE} (id SERIAL PRIMARY KEY)`);
    try {
      const { rows } = await owner.query(
        `SELECT has_table_privilege($1, $2, 'SELECT') AS s,
                has_table_privilege($1, $2, 'INSERT') AS i,
                has_table_privilege($1, $2, 'UPDATE') AS u,
                has_table_privilege($1, $2, 'DELETE') AS d,
                has_sequence_privilege($1, $3, 'USAGE') AS seq`,
        [APP_ROLE, `public.${PROBE_TABLE}`, `public.${PROBE_TABLE}_id_seq`],
      );
      expect(rows[0]).toEqual({ s: true, i: true, u: true, d: true, seq: true });
    } finally {
      await owner.query(`DROP TABLE IF EXISTS public.${PROBE_TABLE}`);
    }
  });
});

// ─── 6. RULE 1 — the replay-safe DROP gate ───────────────────────────────────

describe('6. the replay-safe DROP gate and its self-test pass', () => {
  // ci:migration-drop-safety is wired into .husky/pre-push only, and its
  // self-test into nothing. Running both here puts them in CI's real-database
  // job, which is where this suite runs. The gate is executed, not re-implemented.
  for (const [label, script] of [
    ['ci:migration-drop-safety', 'scripts/ci/check-migration-drop-safety.mjs'],
    ['ci:migration-drop-safety:selftest', 'scripts/ci/check-migration-drop-safety.selftest.mjs'],
  ] as const) {
    it(`${label} exits 0`, () => {
      const r = spawnSync(process.execPath, [script], { cwd: REPO_ROOT, encoding: 'utf8' });
      expect(r.status, `${label} failed:\n${r.stdout}\n${r.stderr}`).toBe(0);
      expect(r.stdout).toMatch(/\bOK\b/);
    });
  }
});
