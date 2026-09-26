/**
 * The entitlement core on the real database, as production runs it.
 *
 * Launch row D2 (launch catalog), workstream W1. Everything the launch catalog
 * claims rests on four functions: the one grant writer (writeModuleGrant), the
 * licence resolver (license-manager), the platform-owner designation lookup
 * (resolveMasterAdmin) and the rail's verdicts (resolveNavEntitlements). Each
 * of them was covered only by tests that stub the pool.
 *
 * ── Why a stubbed pool was not enough, with the receipt ─────────────────────
 * writeModuleGrant failed on real PostgreSQL with
 *
 *     could not determine data type of parameter $5
 *
 * and no grant was written, while every mocked test was green, because a mock
 * has no parser to fail. W1 fixed it with explicit casts. The matrix in the
 * first block below is the permanent pin on that fix, and running it on the
 * real server sharpened what the fix is (2026-09-22):
 *
 *   - Without the casts the statement fails on EVERY call, not only when
 *     actorEmail / expiresAt are null: all 12 cases (enabled × null/Date/ISO ×
 *     null/string actor) and both ON CONFLICT paths fail. node-pg sends every
 *     parameter untyped, so the value never mattered; the parse did.
 *   - The `$5::timestamptz` casts are the load-bearing ones. Stripping only
 *     them fails all 15 writer tests; stripping only the `$4::text` casts
 *     leaves them green (Postgres resolves $4 to text from the CASE). The text
 *     casts are defensive, and harmless.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * The REAL server modules are imported, and server/db's pool is routed through
 * a NON-SUPERUSER runtime role minted by the real
 * scripts/db/provision-app-role.mjs: APP_DATABASE_URL is set to that role
 * before server/db/runtime.ts is first imported, exactly the switch production
 * uses (server/db/getDatabaseUrl.ts getRuntimeDatabaseUrl). RLS_ENFORCE=on puts
 * `app.rls_enforce=on` in the startup packet, and the instrumented pool applies
 * the active AsyncLocalStorage tenant scope to every statement
 * (server/db/poolInstrumentation.ts runQueryScoped). So each call below runs
 * under the scope production would give its caller:
 *
 *   per-user  (the caller's org)  /api/module-subscriptions/* (toggle, nav),
 *                                 /api/module-access-requests/* — NOT in
 *                                 SYSTEM_SCOPE_PREFIXES
 *   system    (tenant 0, super)   /api/admin/master/* (toggle, trials),
 *                                 /api/setup, the Stripe webhook
 *   pre-auth  (tenant 0, no role) /api/auth/* — including /api/auth/signup
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane A: organization ids 91100–91149 only; every catalog row, slug and email
 * this file writes starts with `dbta`. The 111 real catalog rows are read,
 * never edited. Cleanup is by id range and prefix. No audit rows are written.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// Sign-up mails a verification link (IAM-17, P1-2): observed here, never sent.
vi.mock('../../server/services/emailService', async importOriginal => ({ ...(await importOriginal<typeof import('../../server/services/emailService')>()),
  isEmailConfigured: () => true, sendVerificationEmail: vi.fn(async () => undefined), sendWelcomeEmail: vi.fn(async () => undefined) }));
import { Pool } from 'pg';
import type { Request } from 'express';
import { databaseUrl } from '../setup.db';
import {
  provisionAppServiceRole,
  resolveAppServiceRole,
} from '../../scripts/db/provision-app-role.mjs';
import {
  runWithPreAuthScope,
  runWithSystemTenantScope,
  runWithTenantScope,
} from '../../server/db/tenantStore';
import {
  LAUNCH_APPS,
  LAUNCH_MODULE_IDS,
  LAUNCH_SCOPE_SOURCE,
  isLaunchSurface,
} from '../../shared/constants/launch-scope';
import { UI_SURFACES } from '../../shared/constants/ui-surface-registry';

type ModuleGrants = typeof import('../../server/services/entitlements/module-grants');
type LicenseManager = typeof import('../../server/services/license-manager');
type MasterAdmin = typeof import('../../server/services/entitlements/master-admin');
type NavEntitlements = typeof import('../../server/services/entitlements/navigation-entitlements');
type LaunchScope = typeof import('../../server/services/entitlements/launch-scope');
type Runtime = typeof import('../../server/db/runtime');

// ── Lane A fixtures ─────────────────────────────────────────────────────────
const ORG_MIN = 91100;
const ORG_MAX = 91149;
/** writeModuleGrant matrix: one fresh org per case, so every case is an INSERT. */
const ORG_MATRIX_BASE = 91110; // 91110..91121
const ORG_UPSERT_USER = 91122; // ON CONFLICT path, per-user scope
const ORG_UPSERT_SYSTEM = 91123; // ON CONFLICT path, system scope
const ORG_FOREIGN = 91124; // a tenant the per-user scope must not reach
const ORG_LICENSE = 91102; // license-manager, tier standard
const ORG_LAUNCH_SETUP = 91103; // D2 via /api/setup (system scope)
const ORG_LAUNCH_SIGNUP = 91104; // D2 via /api/auth/signup (pre-auth scope)
const ORG_OWNER = 91105; // master-admin designation lookups
const ORG_QUOTA = 91106; // checkProgramQuota (Projects create path)
const ORG_LEGACY_QUOTA = 91107; // checkProjectQuota / usage panel (legacy projects table)
/** An org id with NO organizations row — never inserted; inside the range so cleanup would catch a stray. */
const ORG_MISSING = 91149;

const TAG = 'dbta';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbta-grants-resolution-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbta_rt_${RUN}` });

/** Catalog rows this lane owns. Real rows are never mutated. */
const MOD = {
  matrix: 'dbta-matrix',
  perp: 'dbta-perp',
  live: 'dbta-live-trial',
  lapsedAbove: 'dbta-lapsed-above',
  lapsedCovered: 'dbta-lapsed-covered',
  revokedAbove: 'dbta-revoked-above',
  revokedCovered: 'dbta-revoked-covered',
  noneAbove: 'dbta-none-above',
  boughtLater: 'dbta-bought-later',
  /** A revocation as writeModuleGrant writes it today: enabled=false, NO date. */
  revokedPlain: 'dbta-revoked-plain',
  /** Offered to another industry only (the org is biotech); no grant. */
  industryOther: 'dbta-industry-other',
  /** Offered to another industry only, with a lapsed trial on it. */
  industryLapsed: 'dbta-industry-lapsed',
} as const;
const OTHER_INDUSTRY = 'dbta-medical-device';
const MOD_INDUSTRIES: Record<string, string[]> = {
  [MOD.industryOther]: [OTHER_INDUSTRY],
  [MOD.industryLapsed]: [OTHER_INDUSTRY],
};
const MOD_TIERS: Record<string, string[]> = {
  [MOD.matrix]: ['free'],
  [MOD.perp]: ['enterprise'],
  [MOD.live]: ['enterprise'],
  [MOD.lapsedAbove]: ['professional'],
  [MOD.lapsedCovered]: ['standard'],
  [MOD.revokedAbove]: ['professional'],
  [MOD.revokedCovered]: ['standard'],
  [MOD.noneAbove]: ['professional'],
  [MOD.boughtLater]: ['free'],
  [MOD.revokedPlain]: ['professional'],
  [MOD.industryOther]: ['free'],
  [MOD.industryLapsed]: ['free'],
};

/** A lapsed instant late in its UTC day, so a raw instant and a calendar date differ visibly. */
const LAPSED_AT = '2025-03-14T23:30:00.000Z';
const LAPSED_DAY = '2025-03-14';
const FUTURE_AT = '2099-06-30T12:00:00.000Z';

let owner: Pool;
let grants: ModuleGrants;
let license: LicenseManager;
let masterAdmin: MasterAdmin;
let nav: NavEntitlements;
let launch: LaunchScope;
let runtime: Runtime;
const orgUuid = new Map<number, string>();
const users: Record<'active' | 'revoked' | 'support' | 'plain', { id: number; email: string }> =
  {} as never;

// ── Scopes, exactly as production builds them ──────────────────────────────

/**
 * The per-user scope establishRequestTenantScope opens for an authenticated
 * request on a path outside SYSTEM_SCOPE_PREFIXES: the caller's org id, the
 * org UUID from the token, and the caller's role.
 */
function asUser<T>(orgId: number, role: string, caller: string, fn: () => Promise<T>): Promise<T> {
  return runWithTenantScope(
    { tenantId: String(orgId), orgUuid: orgUuid.get(orgId) ?? null, role, source: 'request', caller },
    fn,
  );
}

/** The system scope establishRequestSystemScope opens (runWithSystemTenantScope). */
function asSystem<T>(caller: string, fn: () => Promise<T>): Promise<T> {
  return runWithSystemTenantScope(`system:${caller}`, fn);
}

/** The pre-auth scope every /api/auth/* request runs under (register-platform-routes.ts). */
function asPreAuth<T>(caller: string, fn: () => Promise<T>): Promise<T> {
  return runWithPreAuthScope(`auth:${caller}`, fn);
}

/** The minimal authenticated request resolveMasterAdmin reads. */
function fakeReq(user: { id: number; email: string }, orgId: number): Request {
  return {
    userId: user.id,
    userEmail: user.email,
    userRole: 'member',
    user: { id: user.id, email: user.email, role: 'member', organizationId: String(orgId) },
  } as unknown as Request;
}

/** Owner read of one grant row, every bookkeeping column. */
async function grantRow(orgId: number, moduleId: string) {
  const { rows } = await owner.query(
    `SELECT organization_id, module_id, enabled, enabled_at, disabled_at, enabled_by, disabled_by,
            expires_at, expiry_set_by, expiry_set_at
       FROM module_subscriptions WHERE organization_id = $1 AND module_id = $2`,
    [orgId, moduleId],
  );
  return rows;
}

async function cleanup(): Promise<void> {
  await owner.query('DELETE FROM module_subscriptions WHERE organization_id BETWEEN $1 AND $2', [ORG_MIN, ORG_MAX]);
  await owner.query(
    `DELETE FROM platform_role_grants
      WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'dbta-%@example.invalid')`,
  );
  await owner.query('DELETE FROM organization_users WHERE organization_id BETWEEN $1 AND $2', [ORG_MIN, ORG_MAX]);
  await owner.query('DELETE FROM regulatory_programs WHERE organization_id BETWEEN $1 AND $2', [ORG_MIN, ORG_MAX]);
  // Legacy projects before their workspaces (projects.client_workspace_id has no cascade).
  await owner.query('DELETE FROM projects WHERE organization_id BETWEEN $1 AND $2', [ORG_MIN, ORG_MAX]);
  await owner.query('DELETE FROM client_workspaces WHERE organization_id BETWEEN $1 AND $2', [ORG_MIN, ORG_MAX]);
  await owner.query(`DELETE FROM users WHERE email LIKE 'dbta-%@example.invalid'`);
  const uuids = (
    await owner.query('SELECT uuid::text AS uuid FROM organizations WHERE id BETWEEN $1 AND $2', [ORG_MIN, ORG_MAX])
  ).rows.map((r: { uuid: string }) => r.uuid);
  await owner.query('DELETE FROM organizations WHERE id BETWEEN $1 AND $2', [ORG_MIN, ORG_MAX]);
  if (uuids.length > 0) {
    // trg_sync_org_to_identity mirrors every organizations INSERT into
    // identity.organizations; remove only the mirrors of this lane's orgs.
    await owner
      .query(
        `DELETE FROM identity.organizations WHERE id = ANY($1::uuid[]) AND created_by = 'c48-stage1-sync'`,
        [uuids],
      )
      .catch(() => {/* mirror table absent or referenced — harmless leftover */});
  }
  await owner.query(`DELETE FROM available_modules WHERE module_id LIKE 'dbta-%'`);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await cleanup();

  // 1. The non-superuser runtime role, minted by the REAL provisioning script.
  //    Retried ONLY on `tuple concurrently updated`: the script's GRANT ... ON
  //    ALL TABLES rewrites catalog ACL rows, and a second suite provisioning its
  //    own role against the same database at the same moment collides there
  //    (observed 2026-09-22 with parallel lanes). Any other error is fatal.
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
  if (provisioned!.skipped) throw new Error('[dbta] provisionAppServiceRole skipped — no runtime role.');

  // 2. Route server/db through it, the way production does, BEFORE the first
  //    import of server/db/runtime.ts (the pool is built at module load).
  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';
  // The email signal must not be what grants the owner here: the DB fallback is
  // the thing under test. A replacement allowlist naming nobody in this file.
  process.env.MASTER_ADMIN_EMAILS = 'dbta-nobody@example.invalid';
  delete process.env.LAUNCH_SCOPE_ENFORCE;

  runtime = await import('../../server/db/runtime');
  grants = await import('../../server/services/entitlements/module-grants');
  license = await import('../../server/services/license-manager');
  masterAdmin = await import('../../server/services/entitlements/master-admin');
  nav = await import('../../server/services/entitlements/navigation-entitlements');
  launch = await import('../../server/services/entitlements/launch-scope');

  // 3. Fixtures, as the owner (how the installer / signup transaction would).
  const orgs: Array<[number, string]> = [
    [ORG_LICENSE, 'standard'],
    [ORG_LAUNCH_SETUP, 'free'],
    [ORG_LAUNCH_SIGNUP, 'free'],
    [ORG_OWNER, 'standard'],
    [ORG_QUOTA, 'standard'],
    [ORG_LEGACY_QUOTA, 'standard'],
    [ORG_UPSERT_USER, 'standard'],
    [ORG_UPSERT_SYSTEM, 'standard'],
    [ORG_FOREIGN, 'standard'],
    ...Array.from({ length: 12 }, (_, i) => [ORG_MATRIX_BASE + i, 'standard'] as [number, string]),
  ];
  for (const [id, tier] of orgs) {
    const { rows } = await owner.query(
      `INSERT INTO organizations (id, name, slug, tier, industry_mode, status)
       VALUES ($1, $2, $2, $3, 'biotech', 'active') RETURNING uuid::text AS uuid`,
      [id, `${TAG}-${id}-${RUN}`, tier],
    );
    orgUuid.set(id, rows[0].uuid);
  }
  let sort = 90_000;
  for (const [moduleId, tiers] of Object.entries(MOD_TIERS)) {
    await owner.query(
      `INSERT INTO available_modules (module_id, name, category, sort_order, metadata)
       VALUES ($1, $2, 'dbta', $3, $4::json)`,
      [moduleId, `Lane A ${moduleId}`, sort++, JSON.stringify({ tiers, industries: MOD_INDUSTRIES[moduleId] ?? [] })],
    );
  }
  for (const key of ['active', 'revoked', 'support', 'plain'] as const) {
    const email = `dbta-${key}-${RUN}@example.invalid`;
    const { rows } = await owner.query(
      `INSERT INTO users (email, name, password_hash, default_organization_id)
       VALUES ($1, $2, 'not-a-real-password', $3) RETURNING id`,
      [email, `Lane A ${key}`, ORG_OWNER],
    );
    users[key] = { id: rows[0].id, email };
    await owner.query(
      `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'member')`,
      [ORG_OWNER, rows[0].id],
    );
  }
  // The designations the Access Management console writes.
  await owner.query(
    `INSERT INTO platform_role_grants (user_id, role, granted_by, reason)
     VALUES ($1, 'super_admin', 'dbta', 'lane A: active owner designation'),
            ($2, 'super_admin', 'dbta', 'lane A: revoked owner designation'),
            ($3, 'support',     'dbta', 'lane A: support is not the owner')`,
    [users.active.id, users.revoked.id, users.support.id],
  );
  await owner.query(
    `UPDATE platform_role_grants SET revoked_at = now(), revoked_by = 'dbta' WHERE user_id = $1`,
    [users.revoked.id],
  );
}, 120_000);

afterAll(async () => {
  delete process.env.LAUNCH_SCOPE_ENFORCE;
  if (runtime) await runtime.getPool().end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbta] cleanup left rows:', err?.message));
    // Retried like the provisioning above. DROP OWNED revokes the role's table
    // grants, which rewrites the same catalog ACL rows another suite's
    // provisioning GRANTs are rewriting; a collision there used to be swallowed
    // silently and leave the role behind (observed 2026-09-22: one leaked
    // dbta_rt_* role across ~30 runs with parallel lanes).
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        const message = (err as Error).message;
        if (/does not exist/.test(message)) break; // never provisioned
        if (attempt >= 5 || !/tuple concurrently updated/.test(message)) {
          console.warn(`[dbta] runtime role ${runtimeRole} was NOT dropped:`, message);
          break;
        }
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
    await owner.end();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
describe('posture — the connection these tests run on is the production one', () => {
  it('server/db talks to Postgres as the non-superuser runtime role, RLS enforcing, scope applied', async () => {
    const { rows } = await asUser(ORG_LICENSE, 'member', 'dbta:posture', () =>
      runtime.query(
        `SELECT current_user AS role,
                current_setting('is_superuser')::boolean AS superuser,
                r.rolbypassrls,
                current_setting('app.rls_enforce', true) AS enforcement,
                current_setting('app.current_tenant_id', true) AS tenant
           FROM pg_roles r WHERE r.rolname = current_user`,
      ),
    );
    expect(rows).toEqual([
      { role: runtimeRole, superuser: false, rolbypassrls: false, enforcement: 'on', tenant: String(ORG_LICENSE) },
    ]);
  });

  it('the db handles the modules under test import (server/db.js `pool` and `query`) are that same runtime pool', async () => {
    // license-manager takes `pool`, and module-grants and master-admin take
    // `query`, from the server's db module (resolution: vitest.db.config.ts).
    // The check above ran through server/db/runtime directly. This one runs
    // through the exact handles the modules use.
    const legacy = await import('../../server/db.js');
    const sql = `SELECT current_user AS role, current_setting('app.current_tenant_id', true) AS tenant`;
    const viaPool = await asUser(ORG_LICENSE, 'member', 'dbta:posture', () => legacy.pool.query(sql));
    const viaQuery = await asUser(ORG_LICENSE, 'member', 'dbta:posture', () => legacy.query(sql));
    for (const r of [viaPool, viaQuery]) {
      expect(r.rows).toEqual([{ role: runtimeRole, tenant: String(ORG_LICENSE) }]);
    }
  });

  it('module_subscriptions is RLS-enabled and FORCED — the scope is load-bearing, not decorative', async () => {
    const { rows } = await owner.query(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.module_subscriptions'::regclass`,
    );
    expect(rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it('an unscoped server/db query fails closed (the instrumented pool refuses it)', async () => {
    await expect(runtime.query('SELECT 1 FROM module_subscriptions LIMIT 1')).rejects.toThrow(
      /FAIL-CLOSED: pool\.query requires an active tenant scope/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('writeModuleGrant — the one grant writer, on real Postgres', () => {
  type Case = { enabled: boolean; expires: 'null' | 'date' | 'iso'; actor: string | null };
  const matrix: Case[] = [];
  for (const enabled of [true, false]) {
    for (const expires of ['null', 'date', 'iso'] as const) {
      for (const actor of [null, 'dbta-actor@example.invalid']) matrix.push({ enabled, expires, actor });
    }
  }
  const EXPIRES_DATE = new Date('2031-01-02T03:04:05.000Z');
  const EXPIRES_ISO = '2032-06-07T08:09:10.000Z';
  const inputFor = (e: Case['expires']) => (e === 'null' ? null : e === 'date' ? EXPIRES_DATE : EXPIRES_ISO);
  const instantFor = (e: Case['expires']) =>
    e === 'null' ? null : e === 'date' ? EXPIRES_DATE.toISOString() : EXPIRES_ISO;

  it.each(matrix.map((c, i) => ({ ...c, org: ORG_MATRIX_BASE + i })))(
    'INSERT enabled=$enabled expiresAt=$expires actorEmail=$actor (per-user scope)',
    async ({ enabled, expires, actor, org }) => {
      const returned = await asUser(org, 'admin', '/api/module-subscriptions/dbta-matrix/toggle', () =>
        grants.writeModuleGrant({
          organizationId: org,
          moduleId: MOD.matrix,
          enabled,
          actorEmail: actor,
          expiresAt: inputFor(expires),
        }),
      );

      // A revocation carries no end date, whatever the caller passed.
      const expectedInstant = enabled ? instantFor(expires) : null;
      expect(returned.organization_id).toBe(org);
      expect(returned.module_id).toBe(MOD.matrix);
      expect(returned.enabled).toBe(enabled);
      expect(returned.expires_at == null ? null : new Date(returned.expires_at).toISOString()).toBe(expectedInstant);

      const [row] = await grantRow(org, MOD.matrix);
      expect(row.enabled).toBe(enabled);
      expect(row.enabled_by).toBe(enabled ? actor : null);
      expect(row.disabled_by).toBe(enabled ? null : actor);
      expect(row.enabled_at !== null).toBe(enabled);
      expect(row.disabled_at !== null).toBe(!enabled);
      expect(row.expires_at == null ? null : row.expires_at.toISOString()).toBe(expectedInstant);
      expect(row.expiry_set_by).toBe(expectedInstant ? actor : null);
      expect(row.expiry_set_at !== null).toBe(expectedInstant !== null);
    },
  );

  async function upsertSequence(org: number, scoped: <T>(fn: () => Promise<T>) => Promise<T>) {
    const write = (enabled: boolean, expiresAt: Date | string | null, actorEmail: string | null) =>
      scoped(() => grants.writeModuleGrant({ organizationId: org, moduleId: MOD.matrix, enabled, actorEmail, expiresAt }));

    // A lapsed trial left on the row — the state that made enable-beside-a-past-date a no-op.
    await write(true, new Date(LAPSED_AT), 'trial-opener@example.invalid');
    let [row] = await grantRow(org, MOD.matrix);
    expect(row.expires_at.toISOString()).toBe(LAPSED_AT);

    // Re-grant perpetual: the ON CONFLICT path must CLEAR the stale date, with a null actor.
    const perpetual = await write(true, null, null);
    expect(perpetual.enabled).toBe(true);
    expect(perpetual.expires_at).toBeNull();
    [row] = await grantRow(org, MOD.matrix);
    expect(row.expires_at).toBeNull();
    expect(row.expiry_set_by).toBeNull();
    expect(row.expiry_set_at).toBeNull();
    expect(row.enabled_by).toBeNull();

    // A new trial via an ISO string.
    await write(true, FUTURE_AT, 'second-trial@example.invalid');
    [row] = await grantRow(org, MOD.matrix);
    expect(row.expires_at.toISOString()).toBe(FUTURE_AT);
    expect(row.expiry_set_by).toBe('second-trial@example.invalid');
    // Back-date the enable instant so "the revocation kept it" is decided by a
    // six-year gap, not by the 1–2 ms between two round trips. Before this, a
    // revocation that overwrote enabled_at was caught only when the two writes
    // landed in different milliseconds (observed margin 2 ms, 2026-09-22).
    const ENABLED_LONG_AGO = '2020-01-02T03:04:05.000Z';
    await owner.query(
      'UPDATE module_subscriptions SET enabled_at = $3::timestamptz WHERE organization_id = $1 AND module_id = $2',
      [org, MOD.matrix, ENABLED_LONG_AGO],
    );

    // Revocation clears expires_at even when a date is passed, keeps the enable history.
    const revoked = await write(false, new Date(FUTURE_AT), 'revoker@example.invalid');
    expect(revoked.enabled).toBe(false);
    expect(revoked.expires_at).toBeNull();
    [row] = await grantRow(org, MOD.matrix);
    expect(row.enabled).toBe(false);
    expect(row.expires_at).toBeNull();
    expect(row.expiry_set_by).toBeNull();
    expect(row.disabled_by).toBe('revoker@example.invalid');
    expect(row.disabled_at).not.toBeNull();
    expect(row.enabled_by).toBe('second-trial@example.invalid');
    expect(row.enabled_at.toISOString()).toBe(ENABLED_LONG_AGO);

    // Grant again after a revocation, null actor: the "off" bookkeeping is cleared
    // and the enable instant is the new grant's, not the historical one.
    await write(true, null, null);
    const rows = await grantRow(org, MOD.matrix);
    expect(rows).toHaveLength(1); // idempotent on (organization_id, module_id)
    expect(rows[0].enabled).toBe(true);
    expect(rows[0].disabled_at).toBeNull();
    expect(rows[0].disabled_by).toBeNull();
    expect(rows[0].expires_at).toBeNull();
    expect(rows[0].enabled_at.getTime()).toBeGreaterThan(Date.parse('2026-01-01T00:00:00Z'));
  }

  it('ON CONFLICT update path, per-user scope (customer toggle / access-request approval)', async () => {
    await upsertSequence(ORG_UPSERT_USER, (fn) =>
      asUser(ORG_UPSERT_USER, 'admin', '/api/module-subscriptions/dbta-matrix/toggle', fn),
    );
  });

  it('ON CONFLICT update path, system scope (master-admin toggle, trials, billing webhook, setup)', async () => {
    await upsertSequence(ORG_UPSERT_SYSTEM, (fn) => asSystem('PUT /api/admin/master/tenants/x/modules', fn));
  });

  it("a per-user scope cannot write another tenant's grant — RLS refuses it", async () => {
    await expect(
      asUser(ORG_UPSERT_USER, 'admin', '/api/module-subscriptions/dbta-matrix/toggle', () =>
        grants.writeModuleGrant({
          organizationId: ORG_FOREIGN,
          moduleId: MOD.matrix,
          enabled: true,
          actorEmail: null,
          expiresAt: null,
        }),
      ),
    ).rejects.toThrow(/row-level security policy for table "module_subscriptions"/);
    expect(await grantRow(ORG_FOREIGN, MOD.matrix)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('license-manager with real rows, under the per-user scope of the org they concern', () => {
  const asLicensee = <T>(fn: () => Promise<T>) =>
    asUser(ORG_LICENSE, 'member', '/api/module-subscriptions/catalog', fn);

  beforeAll(async () => {
    // Trials are opened from the Master Admin console, which is under
    // /api/admin/master — a SYSTEM_SCOPE_PREFIXES path — so the grants are
    // written under the system scope, as production writes them.
    const write = (moduleId: string, expiresAt: Date | string | null, enabled = true) =>
      asSystem('POST /api/admin/master/licensing/trials', () =>
        grants.writeModuleGrant({ organizationId: ORG_LICENSE, moduleId, enabled, actorEmail: 'dbta-ops@example.invalid', expiresAt }),
      );
    await write(MOD.perp, null);
    await write(MOD.live, FUTURE_AT);
    await write(MOD.lapsedAbove, new Date(LAPSED_AT));
    await write(MOD.lapsedCovered, LAPSED_AT);
    await write(MOD.industryLapsed, LAPSED_AT);
    // A revocation exactly as the grant writer produces it now: enabled=false,
    // expires_at NULL. The seeded revocations below both carry a PAST date, so
    // a reader that forgot `enabled = true` would still drop them as "expired";
    // this row is the one that tells the two apart.
    await write(MOD.revokedPlain, null, false);
    // A revocation that carries a past end date. writeModuleGrant can no longer
    // produce this shape (it clears the date on a revocation), but rows written
    // before it existed can hold it, so it is seeded directly.
    await owner.query(
      `INSERT INTO module_subscriptions (organization_id, module_id, enabled, disabled_at, disabled_by, expires_at)
       VALUES ($1, $2, false, now(), 'dbta-admin', $4::timestamptz),
              ($1, $3, false, now(), 'dbta-admin', $4::timestamptz)`,
      [ORG_LICENSE, MOD.revokedAbove, MOD.revokedCovered, LAPSED_AT],
    );
  });

  it('getLicenseInfo: the plan, and only the LIVE grants as enabled modules', async () => {
    const info = await asLicensee(() => license.getLicenseInfo(ORG_LICENSE));
    expect(info).not.toBeNull();
    // The whole shape: the org row was inserted without limits, so the column
    // defaults (max_users 5, max_projects 10, max_storage 5) come back.
    expect({ ...info!, enabledModules: info!.enabledModules.slice().sort() }).toEqual({
      organizationId: ORG_LICENSE,
      tier: 'standard',
      industryMode: 'biotech',
      // NOT revokedPlain (enabled=false, no date): only `enabled = true` keeps it out.
      enabledModules: [MOD.live, MOD.perp].sort(),
      maxUsers: 5,
      maxProjects: 10,
      maxStorageGB: 5,
    });
  });

  it('getModuleCatalog: each grant shape reads as what it is', async () => {
    const catalog = await asLicensee(() => license.getModuleCatalog(ORG_LICENSE));
    const by = new Map(catalog.map((e) => [e.moduleId, e]));
    // The whole real catalog is visible, not just this lane's rows.
    expect(catalog.length).toBeGreaterThan(Object.keys(MOD_TIERS).length);

    expect(by.get(MOD.perp)).toMatchObject({
      isEnabled: true, subscriptionState: 'enabled', grantExpiresAt: null, grantExpired: false,
      isAvailable: false, requiredTier: 'enterprise', launchScope: 'later',
    });
    expect(by.get(MOD.live)).toMatchObject({
      isEnabled: true, subscriptionState: 'enabled', grantExpiresAt: FUTURE_AT, grantExpired: false,
    });
    expect(by.get(MOD.lapsedAbove)).toMatchObject({
      isEnabled: false, subscriptionState: 'none', grantExpiresAt: LAPSED_AT, grantExpired: true, isAvailable: false,
    });
    expect(by.get(MOD.lapsedCovered)).toMatchObject({
      isEnabled: false, subscriptionState: 'none', grantExpired: true, isAvailable: true,
    });
    // A revocation never lapses, date or not.
    for (const id of [MOD.revokedAbove, MOD.revokedCovered]) {
      expect(by.get(id)).toMatchObject({ isEnabled: false, subscriptionState: 'disabled', grantExpired: false });
    }
    expect(by.get(MOD.noneAbove)).toMatchObject({
      isEnabled: false, subscriptionState: 'none', grantExpiresAt: null, grantExpired: false,
    });
    expect(by.get(MOD.revokedPlain)).toMatchObject({
      isEnabled: false, subscriptionState: 'disabled', grantExpiresAt: null, grantExpired: false, isAvailable: false,
    });
    // Industry: the plan reaches the tier (free) but the module is offered to
    // another industry only, so it is NOT available — tier alone must not decide.
    expect(by.get(MOD.industryOther)).toMatchObject({
      isEnabled: false, subscriptionState: 'none', isAvailable: false, requiredTier: 'free',
    });
    expect(by.get(MOD.industryLapsed)).toMatchObject({
      isEnabled: false, subscriptionState: 'none', grantExpired: true, isAvailable: false,
    });
  });

  it('canAccessModule: perpetual grant and live trial are allowed above the plan', async () => {
    expect(await asLicensee(() => license.canAccessModule(ORG_LICENSE, MOD.perp))).toEqual({ allowed: true });
    expect(await asLicensee(() => license.canAccessModule(ORG_LICENSE, MOD.live))).toEqual({ allowed: true });
  });

  it('canAccessModule: a lapsed trial ABOVE the plan is refused, naming the calendar date, never the instant', async () => {
    const verdict = await asLicensee(() => license.canAccessModule(ORG_LICENSE, MOD.lapsedAbove));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe(
      `Access for '${MOD.lapsedAbove}' ended on ${LAPSED_DAY}; the standard plan does not include it (requires professional)`,
    );
    expect(verdict.reason).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('canAccessModule: a lapsed trial the plan COVERS is allowed — a lapse removes the override, not the entitlement', async () => {
    expect(await asLicensee(() => license.canAccessModule(ORG_LICENSE, MOD.lapsedCovered))).toEqual({ allowed: true });
  });

  it('canAccessModule: a disabled row with a past expires_at is a revocation, never read as a lapse', async () => {
    const above = await asLicensee(() => license.canAccessModule(ORG_LICENSE, MOD.revokedAbove));
    expect(above).toEqual({ allowed: false, reason: `Module '${MOD.revokedAbove}' has been turned off for this organization by an administrator` });
    const covered = await asLicensee(() => license.canAccessModule(ORG_LICENSE, MOD.revokedCovered));
    expect(covered.reason ?? '').not.toMatch(/ended on/);
  });

  /*
   * THE revocation defect (2026-09-22). A module an administrator switched off,
   * which the organisation's plan would otherwise include: the rail locks it as
   * 'disabled', and canAccessModule answered allowed:true — so the route gate,
   * requireModule and /check would all admit it. A revocation outranks the plan.
   */
  it('canAccessModule: a REVOKED module the plan covers is refused, agreeing with the rail', async () => {
    expect(await asLicensee(() => license.canAccessModule(ORG_LICENSE, MOD.revokedCovered))).toEqual({
      allowed: false,
      reason: `Module '${MOD.revokedCovered}' has been turned off for this organization by an administrator`,
    });
    const catalog = await asLicensee(() => license.getModuleCatalog(ORG_LICENSE));
    expect(catalog.find((m) => m.moduleId === MOD.revokedCovered)?.subscriptionState).toBe('disabled');
  });

  it('canAccessModule { ignoreRevocation }: the admin toggle still gets the PLAN answer, so a switched-off module can be switched back on', async () => {
    // Covered by the plan: the toggle may re-enable it.
    expect(
      await asLicensee(() => license.canAccessModule(ORG_LICENSE, MOD.revokedCovered, { ignoreRevocation: true })),
    ).toEqual({ allowed: true });
    // Above the plan: still refused, by tier — ignoring a revocation grants nothing.
    expect(
      await asLicensee(() => license.canAccessModule(ORG_LICENSE, MOD.revokedPlain, { ignoreRevocation: true })),
    ).toEqual({
      allowed: false,
      reason: `Module '${MOD.revokedPlain}' requires professional tier or higher (current: standard)`,
    });
  });

  it('canAccessModule: no row above the plan is the plain tier refusal', async () => {
    expect(await asLicensee(() => license.canAccessModule(ORG_LICENSE, MOD.noneAbove))).toEqual({
      allowed: false,
      reason: `Module '${MOD.noneAbove}' requires professional tier or higher (current: standard)`,
    });
  });

  it('canAccessModule: a revocation as the grant writer produces it (no date) is refused, as a revocation', async () => {
    expect(await asLicensee(() => license.canAccessModule(ORG_LICENSE, MOD.revokedPlain))).toEqual({
      allowed: false,
      reason: `Module '${MOD.revokedPlain}' has been turned off for this organization by an administrator`,
    });
  });

  it('canAccessModule: a module offered to another industry is refused, and a lapsed trial on one says so', async () => {
    expect(await asLicensee(() => license.canAccessModule(ORG_LICENSE, MOD.industryOther))).toEqual({
      allowed: false,
      reason: `Module '${MOD.industryOther}' is not available for biotech industry`,
    });
    expect(await asLicensee(() => license.canAccessModule(ORG_LICENSE, MOD.industryLapsed))).toEqual({
      allowed: false,
      reason: `Access for '${MOD.industryLapsed}' ended on ${LAPSED_DAY}; it is not offered for the biotech industry`,
    });
  });

  it('canAccessModule fails closed on a missing organization and on an unknown module', async () => {
    // moduleEntitlementGate relies on the first: an org row that cannot be read is a denial.
    expect(
      await asUser(ORG_MISSING, 'member', '/api/module-subscriptions/check/x', () =>
        license.canAccessModule(ORG_MISSING, MOD.perp),
      ),
    ).toEqual({ allowed: false, reason: 'Organization not found' });
    expect(await asLicensee(() => license.canAccessModule(ORG_LICENSE, 'dbta-no-such-module'))).toEqual({
      allowed: false,
      reason: "Module 'dbta-no-such-module' does not exist",
    });
  });

  it('the rail agrees: live grant subscribed, lapse falls to plan, revocation locked as disabled', async () => {
    const result = await asLicensee(() => nav.resolveNavEntitlements(ORG_LICENSE, { masterAdmin: false }));
    expect(result.resolved).toBe(true);
    const v = new Map(result.surfaces.map((s) => [s.id, s]));
    expect(v.get(MOD.perp)).toMatchObject({ entitled: true, source: 'subscribed' });
    expect(v.get(MOD.live)).toMatchObject({ entitled: true, source: 'subscribed' });
    expect(v.get(MOD.lapsedCovered)).toMatchObject({ entitled: true, source: 'included' });
    expect(v.get(MOD.lapsedAbove)).toMatchObject({ entitled: false, source: 'tier' });
    expect(v.get(MOD.revokedCovered)).toMatchObject({ entitled: false, source: 'disabled' });
    expect(v.get(MOD.revokedAbove)).toMatchObject({ entitled: false, source: 'disabled' });
    expect(v.get(MOD.revokedPlain)).toMatchObject({ entitled: false, source: 'disabled' });
    // The plan reaches the tier; the industry is what refuses — and the rail
    // must say industry, or the customer is told to buy a plan that changes nothing.
    expect(v.get(MOD.industryOther)).toMatchObject({ entitled: false, source: 'industry', requiredTier: 'free' });
    expect(v.get(MOD.industryLapsed)).toMatchObject({ entitled: false, source: 'industry' });
  });

  it('the rail reports NO verdict (resolved:false) when the organization row cannot be read', async () => {
    const result = await asUser(ORG_MISSING, 'member', '/api/module-subscriptions/navigation', () =>
      nav.resolveNavEntitlements(ORG_MISSING, { masterAdmin: false }),
    );
    expect(result).toMatchObject({ organizationId: ORG_MISSING, resolved: false, surfaces: [], tier: null, industryMode: null });
  });

  it("a per-user scope sees none of another org's grants (the licence cannot leak across tenants)", async () => {
    const info = await asUser(ORG_FOREIGN, 'member', '/api/module-subscriptions/license', () =>
      runtime.query(`SELECT module_id FROM module_subscriptions WHERE organization_id = $1`, [ORG_LICENSE]),
    );
    expect(info.rows).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('checkProgramQuota — the Projects create path, per-user scope, real rows', () => {
  const quotaFor = () =>
    asUser(ORG_QUOTA, 'admin', '/api/c2c/projects', () => license.checkProgramQuota(ORG_QUOTA));
  const setMax = (n: number | null) =>
    owner.query('UPDATE organizations SET max_projects = $2 WHERE id = $1', [ORG_QUOTA, n]);
  const addProgram = (code: string, status: string, deleted: boolean) =>
    owner.query(
      `INSERT INTO regulatory_programs
         (organization_id, name, code, program_type, product_type, primary_agency, product_name, status, deleted_at)
       VALUES ($1, $2, $3, 'IND', 'small_molecule', 'FDA', 'dbta product', $4, CASE WHEN $5 THEN now() END)`,
      [ORG_QUOTA, `dbta ${code}`, `dbta-${code}`, status, deleted],
    );

  beforeAll(async () => {
    await setMax(2);
    await addProgram('live-1', 'draft', false);
    await addProgram('archived', 'archived', false); // releases its seat
    await addProgram('deleted', 'draft', true); // soft-deleted: releases its seat
    // Another tenant's program must not be counted against this one.
    await owner.query(
      `INSERT INTO regulatory_programs
         (organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1, 'dbta foreign', 'dbta-foreign', 'IND', 'small_molecule', 'FDA', 'dbta product')`,
      [ORG_FOREIGN],
    );
  });

  it('archived and soft-deleted programs hold no seat', async () => {
    expect(await quotaFor()).toEqual({ withinQuota: true, currentCount: 1, maxAllowed: 2, unlimited: false });
  });

  it('at the limit it refuses', async () => {
    await addProgram('live-2', 'active', false);
    expect(await quotaFor()).toEqual({ withinQuota: false, currentCount: 2, maxAllowed: 2, unlimited: false });
  });

  it('a negative entitlement is unlimited; zero is zero seats; NULL is the default of 10', async () => {
    await setMax(-1);
    expect(await quotaFor()).toEqual({ withinQuota: true, currentCount: 2, maxAllowed: -1, unlimited: true });
    await setMax(0);
    expect(await quotaFor()).toEqual({ withinQuota: false, currentCount: 2, maxAllowed: 0, unlimited: false });
    await setMax(null);
    expect(await quotaFor()).toEqual({ withinQuota: true, currentCount: 2, maxAllowed: 10, unlimited: false });
  });

  it('fails CLOSED: a read the pool refuses, and a missing organization row, both deny', async () => {
    const DENY = { withinQuota: false, currentCount: 0, maxAllowed: 0, unlimited: false };
    // A real read failure, not a stub: outside any tenant scope the instrumented
    // pool refuses the statement (RLS_ENFORCE=on). The legacy helpers answer
    // "within quota" here; this one must not.
    expect(await license.checkProgramQuota(ORG_QUOTA)).toEqual(DENY);
    expect(
      await asUser(ORG_MISSING, 'admin', '/api/c2c/projects', () => license.checkProgramQuota(ORG_MISSING)),
    ).toEqual(DENY);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('checkProjectQuota / checkUserQuota — the usage-panel statements, per-user scope, real rows', () => {
  // GET /api/module-subscriptions/license and resolveEntitlements (/api/licensing) read
  // these. Both helpers FAIL OPEN on an error ({ withinQuota: true, count 0 }),
  // so every expectation below carries a non-zero count: a green result cannot
  // be the catch branch answering for a statement that failed.
  beforeAll(async () => {
    for (const org of [ORG_LEGACY_QUOTA, ORG_FOREIGN]) {
      const { rows } = await owner.query(
        `INSERT INTO client_workspaces (organization_id, name, slug) VALUES ($1, $2, $2) RETURNING id`,
        [org, `dbta-ws-${org}-${RUN}`],
      );
      const n = org === ORG_LEGACY_QUOTA ? 2 : 1;
      for (let i = 0; i < n; i++) {
        await owner.query(
          `INSERT INTO projects (organization_id, client_workspace_id, name, type) VALUES ($1, $2, $3, 'ind')`,
          [org, rows[0].id, `dbta project ${org}-${i}`],
        );
      }
    }
  });

  it("checkProjectQuota counts this org's legacy projects only, against the recorded limit", async () => {
    expect(
      await asUser(ORG_LEGACY_QUOTA, 'member', '/api/module-subscriptions/license', () =>
        license.checkProjectQuota(ORG_LEGACY_QUOTA),
      ),
    ).toEqual({ withinQuota: true, currentCount: 2, maxAllowed: 10 });
  });

  it("checkUserQuota counts this org's members only, against the recorded limit", async () => {
    // ORG_OWNER has the four lane users as members; max_users is the column default 5.
    expect(
      await asUser(ORG_OWNER, 'member', '/api/module-subscriptions/license', () => license.checkUserQuota(ORG_OWNER)),
    ).toEqual({ withinQuota: true, currentCount: 4, maxAllowed: 5 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('resolveMasterAdmin DB fallback, under the PER-USER scope the nav endpoint runs in', () => {
  const NAV = '/api/module-subscriptions/navigation';
  const resolveFor = (u: { id: number; email: string }) => {
    masterAdmin.clearMasterAdminGrantCache();
    return asUser(ORG_OWNER, 'member', NAV, () => masterAdmin.resolveMasterAdmin(fakeReq(u, ORG_OWNER)));
  };

  it('platform_role_grants is not RLS-governed, and the runtime role may read it', async () => {
    const { rows } = await owner.query(
      `SELECT c.relrowsecurity, c.relforcerowsecurity,
              has_table_privilege($1, 'public.platform_role_grants', 'SELECT') AS can_select
         FROM pg_class c WHERE c.oid = 'public.platform_role_grants'::regclass`,
      [runtimeRole],
    );
    expect(rows[0]).toEqual({ relrowsecurity: false, relforcerowsecurity: false, can_select: true });
  });

  it("the designation row is visible to the lookup's exact statement under a per-user scope", async () => {
    // Statement text copied from master-admin.ts hasMasterAdminGrant.
    const { rows } = await asUser(ORG_OWNER, 'member', NAV, () =>
      runtime.query(
        `SELECT 1 FROM platform_role_grants
        WHERE user_id = $1 AND revoked_at IS NULL AND LOWER(role) = ANY($2)
        LIMIT 1`,
        [users.active.id, [...masterAdmin.MASTER_ADMIN_ROLES]],
      ),
    );
    expect(rows).toHaveLength(1);
  });

  it('none of these identities is the owner by the synchronous signals — the DB decides', () => {
    for (const u of Object.values(users)) expect(masterAdmin.isMasterAdmin(fakeReq(u, ORG_OWNER))).toBe(false);
  });

  it('an active super_admin designation → owner', async () => {
    expect(await resolveFor(users.active)).toBe(true);
  });

  it('a revoked super_admin designation → not the owner', async () => {
    expect(await resolveFor(users.revoked)).toBe(false);
  });

  it("a 'support' designation → not the owner (console access is not a commercial unlock)", async () => {
    expect(await resolveFor(users.support)).toBe(false);
  });

  it('no designation → not the owner', async () => {
    expect(await resolveFor(users.plain)).toBe(false);
  });

  it('a FAILED lookup answers "not the owner" and is not cached — the next scoped read recognises the owner', async () => {
    masterAdmin.clearMasterAdminGrantCache();
    // Outside any tenant scope the instrumented pool refuses the statement
    // (FAIL-CLOSED under RLS_ENFORCE=on): a real lookup failure, not a stub.
    expect(await masterAdmin.resolveMasterAdmin(fakeReq(users.active, ORG_OWNER))).toBe(false);
    // Not pinned for the TTL: the very next properly scoped request sees the grant.
    expect(
      await asUser(ORG_OWNER, 'member', NAV, () => masterAdmin.resolveMasterAdmin(fakeReq(users.active, ORG_OWNER))),
    ).toBe(true);
  }, 30_000);

  it("the designation cache is per user: the owner's cached \"yes\" is never served to anyone else", async () => {
    // Every test above clears the cache before each lookup, so none of them can
    // see what the cache hands the NEXT caller. Here nothing is cleared between
    // users, in the order the nav endpoint would meet them under load.
    masterAdmin.clearMasterAdminGrantCache();
    const sequence: Array<[keyof typeof users, boolean]> = [
      ['active', true],
      ['plain', false],
      ['revoked', false],
      ['support', false],
      ['active', true], // served from the cache now
      ['plain', false], // and so is this
    ];
    const seen: Array<[string, boolean]> = [];
    for (const [key] of sequence) {
      const holds = await asUser(ORG_OWNER, 'member', NAV, () => masterAdmin.resolveMasterAdmin(fakeReq(users[key], ORG_OWNER)));
      seen.push([key, holds]);
    }
    expect(seen).toEqual(sequence);
  });

  it('the designated owner sees every catalog module unlocked on the rail, under the per-user scope', async () => {
    const result = await asUser(ORG_OWNER, 'member', NAV, async () => {
      masterAdmin.clearMasterAdminGrantCache();
      const isOwner = await masterAdmin.resolveMasterAdmin(fakeReq(users.active, ORG_OWNER));
      return nav.resolveNavEntitlements(ORG_OWNER, { masterAdmin: isOwner });
    });
    expect(result.masterAdmin).toBe(true);
    expect(result.resolved).toBe(true);
    expect(result.surfaces.length).toBeGreaterThan(0);
    expect(result.surfaces.every((s) => s.entitled && s.source === 'master_admin')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D2 end to end — a fresh org, the real launch provisioning, the rail with LAUNCH_SCOPE_ENFORCE on', () => {
  let liveCatalog: Map<string, { tiers: string[] }>;
  let deprecatedCatalog: Set<string>;
  let setupProvisioning: Awaited<ReturnType<LaunchScope['provisionLaunchModules']>>;

  beforeAll(async () => {
    // The /api/setup path: org created, then the launch catalog granted under the
    // system scope that mount applies. Done here, not in a test, so every test
    // below stands on its own under a -t filter (mutation runs use one).
    setupProvisioning = await asSystem('POST /api/setup (first-run install)', () =>
      launch.provisionLaunchModules(ORG_LAUNCH_SETUP, { actorEmail: null }),
    );

    const { rows } = await owner.query(
      `SELECT module_id, metadata FROM available_modules WHERE module_id NOT LIKE 'dbta-%'`,
    );
    liveCatalog = new Map();
    deprecatedCatalog = new Set();
    for (const r of rows) {
      const meta = r.metadata || {};
      if (meta.deprecated === true) deprecatedCatalog.add(r.module_id);
      else liveCatalog.set(r.module_id, { tiers: meta.tiers || [] });
    }
  });

  it('every launch module id has a catalog row (the grant FK would refuse one that did not)', () => {
    for (const id of LAUNCH_MODULE_IDS) {
      expect(liveCatalog.has(id) || deprecatedCatalog.has(id), id).toBe(true);
    }
  });

  it('the setup path (system scope) grants exactly the launch catalog, perpetual, with no failures', async () => {
    const result = setupProvisioning;
    expect(result.failed).toEqual([]);
    expect(result.granted.slice().sort()).toEqual([...LAUNCH_MODULE_IDS].sort());

    // Read back through the runtime role under the org's own per-user scope.
    const { rows } = await asUser(ORG_LAUNCH_SETUP, 'admin', '/api/module-subscriptions/catalog', () =>
      runtime.query(
        `SELECT module_id, enabled, expires_at, enabled_by FROM module_subscriptions WHERE organization_id = $1`,
        [ORG_LAUNCH_SETUP],
      ),
    );
    expect(rows.map((r: { module_id: string }) => r.module_id).sort()).toEqual([...LAUNCH_MODULE_IDS].sort());
    for (const r of rows) expect(r).toMatchObject({ enabled: true, expires_at: null, enabled_by: null });
  });

  it('the rail: launch apps resolve available, non-launch modules resolve locked by launch scope', async () => {
    process.env.LAUNCH_SCOPE_ENFORCE = 'on';
    try {
      const result = await asUser(ORG_LAUNCH_SETUP, 'member', '/api/module-subscriptions/navigation', () =>
        nav.resolveNavEntitlements(ORG_LAUNCH_SETUP, { masterAdmin: false }),
      );
      expect(result.resolved).toBe(true);
      expect(result.launchScope).toEqual({ enforced: true });
      expect(result.tier).toBe('free');
      const v = new Map(result.surfaces.map((s) => [s.id, s]));

      // Every launch module that is live in the catalog is entitled BY ITS GRANT —
      // on a free plan, so the grant (not the tier) is what makes them available.
      const liveLaunch = LAUNCH_MODULE_IDS.filter((id) => liveCatalog.has(id));
      expect(liveLaunch.length).toBeGreaterThan(0);
      for (const id of liveLaunch) expect(v.get(id), id).toMatchObject({ entitled: true, source: 'subscribed' });

      // Each launch app has at least one available module on the rail.
      for (const app of LAUNCH_APPS) {
        expect(app.modules.some((m) => v.get(m)?.entitled === true), app.id).toBe(true);
      }

      // Nothing in the launch scope is locked by launch scope.
      for (const s of result.surfaces) {
        if (isLaunchSurface(s.id)) expect(s.source, s.id).not.toBe(LAUNCH_SCOPE_SOURCE);
      }

      // A real, live, non-launch module the FREE plan includes is still locked —
      // by the release boundary, not by the licence.
      const freeNonLaunch = [...liveCatalog.entries()]
        .filter(([id, m]) => !isLaunchSurface(id) && m.tiers.includes('free'))
        .map(([id]) => id);
      expect(freeNonLaunch.length).toBeGreaterThan(0);
      for (const id of freeNonLaunch) {
        expect(v.get(id), id).toMatchObject({ entitled: false, source: LAUNCH_SCOPE_SOURCE, requiredTier: null });
      }
      // Every catalog verdict outside the launch scope is a launch-scope lock.
      for (const id of liveCatalog.keys()) {
        if (!isLaunchSurface(id)) expect(v.get(id)?.source, id).toBe(LAUNCH_SCOPE_SOURCE);
      }
      // And every REGISTERED surface outside the scope has a lock verdict too,
      // catalogued or not: the client reads "no verdict" as "not licensable, so
      // available", so a surface with no catalog row and no verdict would be open.
      const uncatalogued = UI_SURFACES.filter((s) => !isLaunchSurface(s.id) && !liveCatalog.has(s.id));
      expect(uncatalogued.length).toBeGreaterThan(0);
      for (const s of UI_SURFACES) {
        if (isLaunchSurface(s.id)) continue;
        expect(v.get(s.id), s.id).toMatchObject({ entitled: false, source: LAUNCH_SCOPE_SOURCE });
      }
      // A launch SHELL surface that is also licensable keeps its licence verdict:
      // the boundary never widens anything. identity-console is enterprise-tier.
      if (liveCatalog.get('identity-console')?.tiers.includes('enterprise')) {
        expect(v.get('identity-console')).toMatchObject({ entitled: false, source: 'tier' });
      }
    } finally {
      delete process.env.LAUNCH_SCOPE_ENFORCE;
    }
  });

  it('a bought module outside the launch scope stays locked; with enforcement off it is subscribed', async () => {
    await asUser(ORG_LAUNCH_SETUP, 'admin', '/api/module-subscriptions/dbta-bought-later/toggle', () =>
      grants.writeModuleGrant({
        organizationId: ORG_LAUNCH_SETUP, moduleId: MOD.boughtLater, enabled: true, actorEmail: null, expiresAt: null,
      }),
    );
    const resolveWith = async (mode: 'on' | 'off') => {
      process.env.LAUNCH_SCOPE_ENFORCE = mode;
      try {
        return await asUser(ORG_LAUNCH_SETUP, 'member', '/api/module-subscriptions/navigation', () =>
          nav.resolveNavEntitlements(ORG_LAUNCH_SETUP, { masterAdmin: false }),
        );
      } finally {
        delete process.env.LAUNCH_SCOPE_ENFORCE;
      }
    };
    const on = new Map((await resolveWith('on')).surfaces.map((s) => [s.id, s]));
    const off = new Map((await resolveWith('off')).surfaces.map((s) => [s.id, s]));
    expect(on.get(MOD.boughtLater)).toMatchObject({ entitled: false, source: LAUNCH_SCOPE_SOURCE });
    expect(off.get(MOD.boughtLater)).toMatchObject({ entitled: true, source: 'subscribed' });
  });

  /*
   * No launch module may be deprecated in the REPLAYED catalog. Until 2026-09-22,
   * db/migrations/20260810_reconcile_module_catalog.sql (which runs after
   * 20260814j and, under Rule 1, on every deploy) retired 'ectd-publishing' on
   * every replay; getModuleCatalog filters deprecated rows, so the launch
   * catalog silently lost it on any deploy-shaped database. Both 20260810 and
   * 20260823_module_catalog_commercial_packaging.sql were amended in place;
   * ci:launch-scope rule 2b catches the next one from the migration text alone.
   */
  it('no launch module is deprecated in the replayed catalog', () => {
    expect(LAUNCH_MODULE_IDS.filter((id) => deprecatedCatalog.has(id))).toEqual([]);
  });

  /*
   * Why signup provisions under the NEW ORGANISATION'S scope — pinned as the
   * property RLS must keep, not as a defect.
   *
   * Until 2026-09-22, POST /api/auth/signup called provisionLaunchModules while
   * the request was still under the PRE-AUTH scope every /api/auth/* request
   * runs in (tenant '0', no role). module_subscriptions' WITH CHECK refused every
   * INSERT, a new self-serve organisation got ZERO launch modules, the failures
   * were only logged, and signup reported success. server/routes/auth.ts now runs
   * the provisioning (and the industry-profile seed) under the new organisation's
   * own tenant scope; tests/db/signup-launch-catalog.dbtest.ts drives the real
   * handler end to end and proves 21/21 plus the profile row.
   *
   * This case keeps the other half true: the pre-auth scope itself must STILL be
   * unable to write a tenant's grants. If this ever passes grants through, RLS
   * has stopped doing its job for every unauthenticated request, not just this
   * one.
   */
  it('the pre-auth scope cannot write a tenant\'s launch grants — RLS refuses every one', async () => {
    const result = await asPreAuth('POST /signup', () =>
      launch.provisionLaunchModules(ORG_LAUNCH_SIGNUP, { actorEmail: null }),
    );
    expect(result.granted).toEqual([]);
    expect(result.failed.map((f) => f.moduleId).sort()).toEqual([...LAUNCH_MODULE_IDS].sort());
    for (const f of result.failed) {
      expect(f.error).toBe('new row violates row-level security policy for table "module_subscriptions"');
    }
    const { rows } = await owner.query(
      'SELECT count(*)::int AS n FROM module_subscriptions WHERE organization_id = $1',
      [ORG_LAUNCH_SIGNUP],
    );
    expect(rows[0].n).toBe(0);

    // What that would cost a customer, which is why the scope matters: a
    // self-serve org is on the FREE plan, so with no grants every launch module above free is locked
    // by tier on its rail, and two launch apps have no module it can open at all.
    process.env.LAUNCH_SCOPE_ENFORCE = 'on';
    let rail: Awaited<ReturnType<NavEntitlements['resolveNavEntitlements']>>;
    try {
      rail = await asUser(ORG_LAUNCH_SIGNUP, 'admin', '/api/module-subscriptions/navigation', () =>
        nav.resolveNavEntitlements(ORG_LAUNCH_SIGNUP, { masterAdmin: false }),
      );
    } finally {
      delete process.env.LAUNCH_SCOPE_ENFORCE;
    }
    const v = new Map(rail.surfaces.map((s) => [s.id, s]));
    const aboveFree = LAUNCH_MODULE_IDS.filter((id) => {
      const tiers = liveCatalog.get(id)?.tiers;
      return tiers !== undefined && tiers.length > 0 && !tiers.includes('free');
    });
    expect(aboveFree.length).toBeGreaterThan(0);
    for (const id of aboveFree) expect(v.get(id), id).toMatchObject({ entitled: false, source: 'tier' });
    const appsWithNothingOpen = LAUNCH_APPS.filter((app) => !app.modules.some((m) => v.get(m)?.entitled === true)).map(
      (app) => app.id,
    );
    expect(appsWithNothingOpen).toEqual(expect.arrayContaining(['submission-readiness', 'qms']));
    // 3 min: in this vitest lane `'../../db'` resolves to server/db.js, whose
    // query() retries a failed statement 3x with backoff (~2.5 s per module);
    // production's esbuild bundle resolves it to server/db.ts, which does not.
  }, 180_000);
});
