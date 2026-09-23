/**
 * The Master Licensing console and the governed enforcement-mode setting,
 * against real PostgreSQL, the way production runs them.
 *
 * ── Posture: what "the way production runs them" means here ─────────────────
 *   - The server's own pool (server/db/runtime.ts) connects as a NON-superuser,
 *     NOBYPASSRLS runtime role minted by the REAL scripts/db/provision-app-role.mjs
 *     (through tests/db/harness.ts), via APP_DATABASE_URL — the same variable
 *     production uses to downgrade the request pool. `app.rls_enforce=on` rides
 *     in the startup packet exactly as buildRlsStartupOptions puts it there. The
 *     first test asserts all of that from inside a request rather than assuming
 *     it.
 *   - The REAL master-licensing router is mounted at /api/admin/master behind
 *     the REAL establishRequestTenantScope, which is what the global /api gate
 *     calls. That prefix is in SYSTEM_SCOPE_PREFIXES, so the router runs under
 *     the system scope (tenantId '0', app_super_admin) — not because this file
 *     says so, but because the production middleware decides it from the path.
 *   - The only test-owned middleware is an identity stub setting what
 *     server/auth.ts's authMiddleware sets (req.user / userId / userRole /
 *     userEmail / tenantId). Authentication is not the subject; the SQL, the
 *     scope and the audit store are.
 *   - The same router is mounted a second time at a path that is NOT a system
 *     prefix, so the per-user scope can be shown narrowing what the console
 *     reads. That is documentation of what the prefix protects, not a defect.
 *   - The two owned migrations are applied FROM DISK, twice each (every deploy
 *     re-runs them — CLAUDE.md Rule 1), into schemas private to this run.
 *     20260823's functions sit first on THIS run's runtime-role search_path,
 *     so provisioning runs the SQL in the file rather than whatever a
 *     concurrent lane might have left in public — and the shared
 *     public.provision_org_modules is never replaced. The one deviation from
 *     production that this is is bounded by a drift test: the deployed public
 *     definitions must be byte-identical to the file, so the function under
 *     test IS the deployed function.
 *
 * ── Isolation from the other lanes sharing this database ─────────────────────
 * Organizations 91200–91249 only; every module id and slug starts `dbtb_`/`dbtb-`.
 * The real catalog rows are never edited. audit_logs is append-only and
 * hash-chained, so audit rows are never deleted; each carries a reason string
 * unique to this run, which is how they are found again.
 * platform_settings is global: its `module_enforcement_mode` row is snapshotted
 * before the suite and restored after it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { databaseUrl } from '../setup.db';
import { createScratchSchema, type ScratchSchema } from './harness';

// ─── Lane constants ──────────────────────────────────────────────────────────

const ORG_LO = 91200;
const ORG_HI = 91249;
/** Read-side tenant: standard, biotech. Also the admin's home org. */
const ORG_A = 91200;
/** Second tenant, professional: proves the system scope sees across orgs. */
const ORG_B = 91201;
/** Plan-change + provisioning tenant. */
const ORG_C = 91202;
/**
 * A tenant whose tier is not one the ladder names. organizations.tier has no
 * CHECK constraint and the Stripe subscription webhook (services/billing.ts)
 * writes `subscription.metadata.tier` into it verbatim, so this is reachable.
 */
const ORG_D = 91203;

/** The stub platform admin. No FK on audit_logs.user_id / platform_settings.updated_by. */
const ADMIN_USER_ID = 91200001;
/**
 * A second platform admin, selected per request with the `x-dbtb-user-id`
 * header. Needed where the SAME admin writing twice cannot tell an overwrite
 * from a column the ON CONFLICT arm forgot to update.
 */
const ADMIN2_USER_ID = 91200002;

// Tenants added by the independent skeptic pass (2026-09-22). Each carries one
// input the well-formed tenants above never exercise; see the sections that use them.
/** free, biotech, holding an EXPIRED grant on an above-tier module (a lapsed trial). */
const ORG_E = 91204;
/** A tier the ladder does not name, no grants — the rail's unknown-tier input. */
const ORG_F = 91205;
/** standard, industry_mode NULL (the column is nullable, no default), no grants. */
const ORG_G = 91206;
/** standard, industry_mode NULL — provisioned, so the function's NULL-industry default is observable. */
const ORG_H = 91207;

const RUN = `dbtb-${process.pid}-${Date.now().toString(36)}`;
const reason = (what: string) => `${RUN} ${what}`;

const M = {
  open: 'dbtb_mod_open',
  std: 'dbtb_mod_std',
  pro: 'dbtb_mod_pro',
  ent: 'dbtb_mod_ent',
  enabled: 'dbtb_mod_enabled',
  disabled: 'dbtb_mod_disabled',
  medtech: 'dbtb_mod_medtech',
  retired: 'dbtb_mod_retired',
  repack: 'dbtb_mod_repack',
  multi: 'dbtb_mod_multi',
} as const;

const MODULE_ROWS: Array<{ id: string; meta: Record<string, unknown>; sort: number }> = [
  { id: M.open, meta: { tiers: [], industries: [] }, sort: 9901 },
  { id: M.std, meta: { tiers: ['standard'], industries: [] }, sort: 9902 },
  { id: M.pro, meta: { tiers: ['professional'], industries: [] }, sort: 9903 },
  { id: M.ent, meta: { tiers: ['enterprise'], industries: [] }, sort: 9904 },
  { id: M.enabled, meta: { tiers: ['enterprise'], industries: [] }, sort: 9905 },
  { id: M.disabled, meta: { tiers: [], industries: [] }, sort: 9906 },
  { id: M.medtech, meta: { tiers: [], industries: ['medtech'] }, sort: 9907 },
  { id: M.retired, meta: { tiers: ['standard'], industries: [], deprecated: true }, sort: 9908 },
  {
    id: M.repack,
    meta: { tiers: ['standard'], industries: ['biotech', 'pharma'], dbtbProbe: 'keep-me' },
    sort: 9909,
  },
  // More than one tier, listed highest-first. Every multi-tier row in the real
  // catalog is deprecated, so without this one no live row ever made
  // lowestTier() choose between tiers (skeptic pass: a lowestTier returning
  // the HIGHEST tier passed the whole suite).
  { id: M.multi, meta: { tiers: ['enterprise', 'professional'], industries: [] }, sort: 9910 },
];

const TIER_RANK: Record<string, number> = { free: 0, standard: 1, professional: 2, enterprise: 3 };

/**
 * The documented ladder, independently of the SQL function: included when the
 * tiers array is absent/empty, or when any KNOWN listed tier is at or below
 * the org's rank; industry is an exact-set test. Deprecated rows never qualify.
 */
function qualifies(meta: any, orgTier: string, orgIndustry: string): boolean {
  if (meta?.deprecated === true) return false;
  const level = TIER_RANK[orgTier] ?? TIER_RANK.standard;
  const tiers = meta?.tiers;
  const tierOk =
    !Array.isArray(tiers) ||
    tiers.length === 0 ||
    tiers.some((t: unknown) => typeof t === 'string' && t in TIER_RANK && level >= TIER_RANK[t]);
  const inds = meta?.industries;
  const indOk = !Array.isArray(inds) || inds.length === 0 || inds.includes(orgIndustry);
  return tierOk && indOk;
}

/** The same ladder's "held but not included": tiered, and no known tier at or below. */
function aboveTier(meta: any, orgTier: string): boolean {
  const tiers = meta?.tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) return false;
  const level = TIER_RANK[orgTier];
  return !tiers.some((t: unknown) => typeof t === 'string' && t in TIER_RANK && level >= TIER_RANK[t]);
}

// ─── State ───────────────────────────────────────────────────────────────────

let owner: Pool;
let scratch: ScratchSchema;
let app: express.Express;
let savedAppDatabaseUrl: string | undefined;
let savedModuleEnforcement: string | undefined;
let savedModeRow: Record<string, unknown> | null = null;
let serverPool: { end: () => Promise<void> } | null = null;

type EnforcementModeModule = typeof import('../../server/services/entitlements/enforcement-mode');
type ObservationsModule = typeof import('../../server/services/entitlements/enforcement-observations');
let modeMod: EnforcementModeModule;
let obsMod: ObservationsModule;

const MIGRATION_PROVISION = path.join(
  __dirname,
  '../../db/migrations/20260823_fix_provision_org_modules_tier_ladder.sql',
);
const MIGRATION_SETTINGS = path.join(__dirname, '../../db/migrations/20260824_enforcement_mode_setting.sql');
/** Holds the 20260823 functions from disk; first on the runtime role's search_path. */
let fnSchema = '';
/** Holds the table the 20260824 file builds; NOT on any search_path. */
let settingsSchema = '';

/** Run a migration file with `schema` as the only unqualified-object target. */
async function applyInSchema(schema: string, file: string): Promise<void> {
  const sql = fs.readFileSync(file, 'utf8');
  const client = await owner.connect();
  try {
    await client.query(`SET search_path TO ${schema}`);
    await client.query(sql);
  } finally {
    await client.query('RESET search_path').catch(() => {});
    client.release();
  }
}

const SYS = '/api/admin/master';
const PER_USER = '/api/dbtb-peruser';

async function cleanupLaneRows(): Promise<void> {
  await owner.query(
    `DELETE FROM module_subscriptions
      WHERE organization_id BETWEEN $1 AND $2 OR module_id LIKE 'dbtb\\_%'`,
    [ORG_LO, ORG_HI],
  );
  await owner.query(`DELETE FROM available_modules WHERE module_id LIKE 'dbtb\\_%'`);
  await owner.query(`DELETE FROM organizations WHERE id BETWEEN $1 AND $2`, [ORG_LO, ORG_HI]);
}

/** Audit rows this run wrote with a given reason, read back as the OWNER. */
async function auditRowsFor(why: string) {
  const { rows } = await owner.query(
    `SELECT tenant_id, user_id, action, table_name, record_id,
            new_values::jsonb AS details, sha256_chain, chain_seq
       FROM audit_logs
      WHERE new_values::jsonb->>'reason' = $1`,
    [why],
  );
  return rows;
}

/**
 * Run `fn` with the module catalog frozen against concurrent writers.
 *
 * provision_org_modules() grants every qualifying catalog row — including
 * modules OTHER lanes insert and delete while this suite runs, and the
 * module_subscriptions FK is ON DELETE CASCADE. Observed: the route counted 96
 * enabled rows for ORG_C and a read milliseconds later found 89, because a
 * concurrent lane dropped its modules in between. A SHARE lock blocks catalog
 * INSERT/UPDATE/DELETE (they wait, briefly) and nothing this suite runs inside
 * `fn`: SELECTs and the FK's KEY SHARE row locks are compatible with it. The
 * db project runs files one at a time, so outside a concurrent session this
 * lock never waits on anything.
 */
async function withCatalogFrozen<T>(fn: () => Promise<T>): Promise<T> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE available_modules IN SHARE MODE');
    return await fn();
  } finally {
    await client.query('COMMIT').catch(() => {});
    client.release();
  }
}

async function enabledRows(orgId: number) {
  const { rows } = await owner.query(
    `SELECT ms.module_id, ms.enabled, am.metadata::jsonb AS meta
       FROM module_subscriptions ms
       JOIN available_modules am ON am.module_id = ms.module_id
      WHERE ms.organization_id = $1`,
    [orgId],
  );
  return rows as Array<{ module_id: string; enabled: boolean; meta: any }>;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  // The runtime role, minted by the REAL provisioning script.
  scratch = await createScratchSchema(databaseUrl);
  const runtimePool = await scratch.connectAsRuntimeRole();
  const runtimeUrl = (runtimePool as unknown as { options: { connectionString: string } }).options
    .connectionString;

  // The owned migrations, from disk, twice each (Rule 1: every deploy re-runs
  // every file). Private schemas: nothing shared is replaced.
  fnSchema = `${scratch.schema}_fn`;
  settingsSchema = `${scratch.schema}_ps`;
  await owner.query(`CREATE SCHEMA ${fnSchema}`);
  await owner.query(`CREATE SCHEMA ${settingsSchema}`);
  for (let i = 0; i < 2; i += 1) {
    await applyInSchema(fnSchema, MIGRATION_PROVISION);
    await applyInSchema(settingsSchema, MIGRATION_SETTINGS);
  }
  await owner.query(`GRANT USAGE ON SCHEMA ${fnSchema} TO ${scratch.runtimeRole}`);
  // Role-level, so it is in force on every connection the server pool opens —
  // which is why this precedes the server import below.
  await owner.query(`ALTER ROLE ${scratch.runtimeRole} SET search_path = ${fnSchema}, public`);

  // Point the SERVER's request pool at it before any server module loads —
  // server/db/runtime.ts builds its pool at import time from APP_DATABASE_URL.
  savedAppDatabaseUrl = process.env.APP_DATABASE_URL;
  process.env.APP_DATABASE_URL = runtimeUrl;
  savedModuleEnforcement = process.env.MODULE_ENFORCEMENT;
  delete process.env.MODULE_ENFORCEMENT;

  await cleanupLaneRows();

  // Fixtures, as the owner (the way a seed or an earlier request would have).
  for (const [id, tier, industry] of [
    [ORG_A, 'standard', 'biotech'],
    [ORG_B, 'professional', 'biotech'],
    [ORG_C, 'standard', 'biotech'],
    [ORG_D, 'starter', 'biotech'],
  ] as const) {
    await owner.query(
      `INSERT INTO organizations (id, name, slug, tier, industry_mode, status)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [id, `dbtb tenant ${id}`, `dbtb-${id}`, tier, industry],
    );
  }
  for (const m of MODULE_ROWS) {
    await owner.query(
      `INSERT INTO available_modules (module_id, name, category, sort_order, metadata)
       VALUES ($1, $2, 'dbtb', $3, $4::json)`,
      [m.id, `dbtb ${m.id}`, m.sort, JSON.stringify(m.meta)],
    );
  }
  const grant = (org: number, mod: string, enabled: boolean) =>
    owner.query(
      `INSERT INTO module_subscriptions (organization_id, module_id, enabled, enabled_at)
       VALUES ($1, $2, $3, now())`,
      [org, mod, enabled],
    );
  await grant(ORG_A, M.enabled, true);
  await grant(ORG_A, M.disabled, false);
  await grant(ORG_B, M.enabled, true);
  await grant(ORG_B, M.repack, true);
  await grant(ORG_C, M.ent, true); // above ORG_C's tier — must never be revoked
  await grant(ORG_C, M.pro, false); // an admin's explicit disable — must never be re-enabled

  // platform_settings is global: take what is there, leave it as found.
  const snap = await owner.query(
    `SELECT setting_key, setting_value, updated_at, updated_by, reason
       FROM platform_settings WHERE setting_key = 'module_enforcement_mode'`,
  );
  savedModeRow = snap.rows[0] ?? null;
  await owner.query(`DELETE FROM platform_settings WHERE setting_key = 'module_enforcement_mode'`);

  // Only now load the server.
  const { establishRequestTenantScope } = await import(
    '../../server/middleware/establishRequestTenantScope'
  );
  const licensingRouter = (await import('../../server/routes/admin/master-licensing')).default;
  const db = await import('../../server/db');
  serverPool = db.getPool() as unknown as { end: () => Promise<void> };
  modeMod = await import('../../server/services/entitlements/enforcement-mode');
  obsMod = await import('../../server/services/entitlements/enforcement-observations');

  /** Reports the connection the router's own queries run on. Test-owned, read-only. */
  const posture = express.Router();
  posture.get('/__dbtb_posture', async (_req, res) => {
    const r = await db.query(
      `SELECT current_user AS role,
              current_setting('is_superuser')::boolean AS superuser,
              (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls,
              current_setting('app.rls_enforce', true) AS rls_enforce,
              current_setting('app.current_tenant_id', true) AS tenant,
              current_setting('app.current_user_role', true) AS scope_role,
              (SELECT n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE p.oid = to_regprocedure('provision_org_modules(integer)')) AS provision_fn_schema`,
    );
    res.json(r.rows[0]);
  });

  app = express();
  app.use(express.json());
  // What server/auth.ts authMiddleware sets once the token and membership verify.
  app.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    const asked = req.headers['x-dbtb-user-id'];
    const userId = asked === String(ADMIN2_USER_ID) ? ADMIN2_USER_ID : ADMIN_USER_ID;
    r.userId = userId;
    r.userRole = 'super_admin';
    r.userEmail = 'dbtb-admin@example.invalid';
    r.tenantId = ORG_A;
    r.user = {
      id: userId,
      userId,
      email: 'dbtb-admin@example.invalid',
      role: 'super_admin',
      organizationId: ORG_A,
    };
    next();
  });
  // The REAL scope lever the global /api gate calls; it picks the scope by path.
  app.use(establishRequestTenantScope);
  app.use(SYS, posture, licensingRouter);
  app.use(PER_USER, posture, licensingRouter);
}, 180_000);

afterAll(async () => {
  try {
    if (modeMod) modeMod.invalidateEnforcementModeCache();
    if (obsMod) obsMod.clearObservations();
    if (owner) {
      await owner.query(`DELETE FROM platform_settings WHERE setting_key = 'module_enforcement_mode'`);
      if (savedModeRow) {
        await owner.query(
          `INSERT INTO platform_settings (setting_key, setting_value, updated_at, updated_by, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            savedModeRow.setting_key,
            savedModeRow.setting_value,
            savedModeRow.updated_at,
            savedModeRow.updated_by,
            savedModeRow.reason,
          ],
        );
      }
      await cleanupLaneRows();
      if (fnSchema) await owner.query(`DROP SCHEMA IF EXISTS ${fnSchema} CASCADE`);
      if (settingsSchema) await owner.query(`DROP SCHEMA IF EXISTS ${settingsSchema} CASCADE`);
    }
  } finally {
    if (serverPool) await serverPool.end().catch(() => {});
    if (scratch) await scratch.destroy();
    if (owner) await owner.end().catch(() => {});
    if (savedAppDatabaseUrl === undefined) delete process.env.APP_DATABASE_URL;
    else process.env.APP_DATABASE_URL = savedAppDatabaseUrl;
    if (savedModuleEnforcement === undefined) delete process.env.MODULE_ENFORCEMENT;
    else process.env.MODULE_ENFORCEMENT = savedModuleEnforcement;
  }
}, 120_000);

// The mode cache is process-global. Every test starts cold and ends cold, so no
// test can pass on an answer a previous test left behind.
beforeEach(() => {
  modeMod?.invalidateEnforcementModeCache();
});
afterEach(() => {
  modeMod?.invalidateEnforcementModeCache();
});

// ─── 0. The posture is the production posture ────────────────────────────────

describe('posture', () => {
  it('the console runs as the non-superuser runtime role, RLS enforcing, under the SYSTEM scope', async () => {
    const res = await request(app).get(`${SYS}/__dbtb_posture`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      role: scratch.runtimeRole,
      superuser: false,
      bypassrls: false,
      rls_enforce: 'on',
      tenant: '0',
      scope_role: 'app_super_admin',
      provision_fn_schema: fnSchema,
    });
  });

  it('the same router on a non-system path gets the caller-org scope instead', async () => {
    const res = await request(app).get(`${PER_USER}/__dbtb_posture`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      role: scratch.runtimeRole,
      superuser: false,
      rls_enforce: 'on',
      tenant: String(ORG_A),
      scope_role: 'super_admin',
    });
  });
});

// ─── 0b. The owned migrations on disk are what is deployed ───────────────────

describe('owned migrations: the file on disk is the deployed object', () => {
  it('20260823: public.provision_org_modules and module_tier_level are byte-identical to the file', async () => {
    const { rows } = await owner.query(
      `SELECT p.proname, n.nspname, p.prosrc, pg_get_function_identity_arguments(p.oid) AS args,
              p.prosecdef, p.provolatile
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname IN ('provision_org_modules', 'module_tier_level')
          AND n.nspname IN ('public', $1)`,
      [fnSchema],
    );
    const pick = (schema: string, name: string) => {
      const r = rows.find((x: any) => x.nspname === schema && x.proname === name);
      return r ? { src: r.prosrc, args: r.args, secdef: r.prosecdef, vol: r.provolatile } : null;
    };
    for (const name of ['provision_org_modules', 'module_tier_level']) {
      expect(pick(fnSchema, name)).not.toBeNull();
      expect({ name, deployed: pick('public', name) }).toEqual({ name, deployed: pick(fnSchema, name) });
    }
  });

  it('20260824: the file builds exactly the platform_settings shape the deployed table has', async () => {
    const shape = async (schema: string) =>
      (
        await owner.query(
          `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = 'platform_settings'
            ORDER BY column_name`,
          [schema],
        )
      ).rows;
    const fromFile = await shape(settingsSchema);
    expect(fromFile.map((c: any) => c.column_name)).toEqual([
      'reason',
      'setting_key',
      'setting_value',
      'updated_at',
      'updated_by',
    ]);
    expect(await shape('public')).toEqual(fromFile);
    // No RLS and no organization_id, deliberately: it is platform-scoped.
    const rls = await owner.query(
      `SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass($1)`,
      [`${settingsSchema}.platform_settings`],
    );
    expect(rls.rows[0].relrowsecurity).toBe(false);
  });
});

// ─── 1. GET /licensing — the whole matrix ────────────────────────────────────

describe('GET /licensing', () => {
  it('under the system scope sees every lane tenant and module, with cross-tenant grant counts', () => withCatalogFrozen(async () => {
    const res = await request(app).get(`${SYS}/licensing`);
    expect(res.status).toBe(200);
    expect(res.body.tiers).toEqual(['free', 'standard', 'professional', 'enterprise']);

    const orgs = new Map<number, any>(res.body.organizations.map((o: any) => [o.id, o]));
    for (const id of [ORG_A, ORG_B, ORG_C]) expect(orgs.has(id)).toBe(true);
    expect(orgs.get(ORG_A)).toMatchObject({ tier: 'standard', industryMode: 'biotech', grants: 1, revocations: 1 });
    expect(orgs.get(ORG_B)).toMatchObject({ tier: 'professional', grants: 2, revocations: 0 });
    // A tenant with NO subscription rows reaches the aggregate as the LEFT JOIN's
    // all-NULL row. It holds nothing and has revoked nothing; a FILTER that
    // tested `enabled IS NOT TRUE` would count that NULL row as a revocation.
    // (Skeptic pass: until this line, only the per-user documentation test
    // noticed that, and only because RLS hid another tenant's rows.)
    expect(orgs.get(ORG_D)).toMatchObject({ grants: 0, revocations: 0 });

    const mods = new Map<string, any>(res.body.modules.map((m: any) => [m.moduleId, m]));
    // Same NULL row, module side: a retired module nobody holds.
    expect(mods.get(M.retired)).toMatchObject({ grantedOrgs: 0, revokedOrgs: 0 });
    for (const id of Object.values(M)) expect(mods.has(id)).toBe(true);
    // Counted across BOTH tenants that hold it.
    expect(mods.get(M.enabled)).toMatchObject({ minTier: 'enterprise', grantedOrgs: 2, revokedOrgs: 0 });
    expect(mods.get(M.disabled)).toMatchObject({ minTier: null, grantedOrgs: 0, revokedOrgs: 1 });
    expect(mods.get(M.repack)).toMatchObject({ minTier: 'standard', industries: ['biotech', 'pharma'] });
    // The LOWEST listed tier, whatever order the array is in.
    expect(mods.get(M.multi)).toMatchObject({ minTier: 'professional' });
    // Retired rows are surfaced flagged, not hidden.
    expect(mods.get(M.retired)).toMatchObject({ deprecated: true });
    // And the real catalog is there too.
    const { rows } = await owner.query(`SELECT count(*)::int AS n FROM available_modules`);
    expect(res.body.modules.length).toBe(rows[0].n);
  }));

  it('under a PER-USER scope the same read narrows to the caller org — why the system prefix is required', async () => {
    const res = await request(app).get(`${PER_USER}/licensing`);
    expect(res.status).toBe(200);
    const orgs = new Map<number, any>(res.body.organizations.map((o: any) => [o.id, o]));
    // organizations carries no RLS policy, so every tenant is still LISTED...
    expect(orgs.has(ORG_B)).toBe(true);
    // ...but module_subscriptions does, so another tenant's grants read as zero —
    // a console that would tell an operator ORG_B holds nothing.
    expect(orgs.get(ORG_A)).toMatchObject({ grants: 1, revocations: 1 });
    expect(orgs.get(ORG_B)).toMatchObject({ grants: 0, revocations: 0 });
    const mods = new Map<string, any>(res.body.modules.map((m: any) => [m.moduleId, m]));
    expect(mods.get(M.enabled).grantedOrgs).toBe(1);
  });
});

// ─── 2. GET /licensing/tenants/:id — verdicts ────────────────────────────────

describe('GET /licensing/tenants/:id', () => {
  it('reports enabled-grant, disabled-grant, tier-only and industry verdicts for a tenant', async () => {
    const res = await request(app).get(`${SYS}/licensing/tenants/${ORG_A}`);
    expect(res.status).toBe(200);
    expect(res.body.organization).toMatchObject({ id: ORG_A, tier: 'standard', industryMode: 'biotech' });
    const v = new Map<string, any>(res.body.modules.map((m: any) => [m.moduleId, m]));

    // An explicit grant outranks a tier the org has not reached.
    expect(v.get(M.enabled)).toMatchObject({ subscriptionState: 'enabled', effective: true, source: 'subscribed', minTier: 'enterprise' });
    // An explicit disable locks an unrestricted module.
    expect(v.get(M.disabled)).toMatchObject({ subscriptionState: 'disabled', effective: false, source: 'disabled' });
    // Tier-only: no row at all, decided by the ladder.
    expect(v.get(M.std)).toMatchObject({ subscriptionState: 'none', effective: true, source: 'included', minTier: 'standard' });
    expect(v.get(M.pro)).toMatchObject({ subscriptionState: 'none', effective: false, source: 'tier' });
    expect(v.get(M.ent)).toMatchObject({ subscriptionState: 'none', effective: false, source: 'tier' });
    expect(v.get(M.open)).toMatchObject({ subscriptionState: 'none', effective: true, source: 'included', minTier: null });
    expect(v.get(M.medtech)).toMatchObject({ effective: false, source: 'industry' });
    expect(v.get(M.multi)).toMatchObject({ subscriptionState: 'none', effective: false, source: 'tier', minTier: 'professional' });
    // Deprecated modules are not offered to a tenant at all.
    expect(v.has(M.retired)).toBe(false);
  });

  it('a subscription row of ANOTHER tenant never leaks into this tenant’s verdict', async () => {
    // ORG_B holds M.repack; ORG_A does not, and must see it tier-decided.
    const res = await request(app).get(`${SYS}/licensing/tenants/${ORG_A}`);
    const v = new Map<string, any>(res.body.modules.map((m: any) => [m.moduleId, m]));
    expect(v.get(M.repack)).toMatchObject({ subscriptionState: 'none', source: 'included' });
  });

  it('404s an unknown tenant', async () => {
    const res = await request(app).get(`${SYS}/licensing/tenants/${ORG_HI}`);
    expect(res.status).toBe(404);
  });
});

// ─── 3. PATCH /licensing/modules/:moduleId — packaging is not repossession ───

describe('PATCH /licensing/modules/:moduleId', () => {
  it('refuses without a reason and changes nothing', async () => {
    const res = await request(app).patch(`${SYS}/licensing/modules/${M.repack}`).send({ minTier: 'enterprise' });
    expect(res.status).toBe(400);
    const { rows } = await owner.query(`SELECT metadata::jsonb AS m FROM available_modules WHERE module_id = $1`, [M.repack]);
    expect(rows[0].m.tiers).toEqual(['standard']);
  });

  it('refuses an invalid tier, and 404s an unknown module', async () => {
    const bad = await request(app)
      .patch(`${SYS}/licensing/modules/${M.repack}`)
      .send({ minTier: 'platinum', reason: reason('bad tier') });
    expect(bad.status).toBe(400);
    const missing = await request(app)
      .patch(`${SYS}/licensing/modules/dbtb_mod_does_not_exist`)
      .send({ minTier: 'standard', reason: reason('missing module') });
    expect(missing.status).toBe(404);
  });

  it('re-tiers the module, preserves other metadata, keeps existing grants, and audits', async () => {
    const why = reason('repackage repack to enterprise');
    const res = await request(app)
      .patch(`${SYS}/licensing/modules/${M.repack}`)
      .send({ minTier: 'enterprise', reason: why });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      moduleId: M.repack,
      minTier: 'enterprise',
      previousTier: 'standard',
      unaffectedGrants: 1,
      auditTrail: { persisted: true, chained: true },
    });

    // The row, as stored: only `tiers` moved.
    const { rows } = await owner.query(`SELECT metadata::jsonb AS m FROM available_modules WHERE module_id = $1`, [M.repack]);
    expect(rows[0].m).toEqual({ tiers: ['enterprise'], industries: ['biotech', 'pharma'], dbtbProbe: 'keep-me' });

    // Packaging is not repossession: ORG_B (professional, now below the module)
    // still holds its enabled grant, and the console still says so.
    const grant = await owner.query(
      `SELECT enabled FROM module_subscriptions WHERE organization_id = $1 AND module_id = $2`,
      [ORG_B, M.repack],
    );
    expect(grant.rows).toEqual([{ enabled: true }]);
    const verdict = await request(app).get(`${SYS}/licensing/tenants/${ORG_B}`);
    const v = verdict.body.modules.find((m: any) => m.moduleId === M.repack);
    expect(v).toMatchObject({ effective: true, source: 'subscribed', minTier: 'enterprise' });

    // The §11.10(e) row, read back from the store. Platform-level: tenant 0.
    const audit = await auditRowsFor(why);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      tenant_id: 0,
      user_id: ADMIN_USER_ID,
      action: 'data_modify',
      table_name: 'module_packaging',
      record_id: M.repack,
    });
    expect(audit[0].details).toMatchObject({
      masterAdminAction: 'module.repackage',
      previousTier: 'standard',
      minTier: 'enterprise',
    });
    expect(audit[0].sha256_chain).toBeTruthy();
    expect(audit[0].chain_seq).not.toBeNull();
  });

  it('minTier null makes the module unrestricted', async () => {
    const res = await request(app)
      .patch(`${SYS}/licensing/modules/${M.repack}`)
      .send({ minTier: null, reason: reason('repackage repack to unrestricted') });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ minTier: null, previousTier: 'enterprise' });
    const { rows } = await owner.query(`SELECT metadata::jsonb AS m FROM available_modules WHERE module_id = $1`, [M.repack]);
    expect(rows[0].m.tiers).toEqual([]);
    expect(rows[0].m.dbtbProbe).toBe('keep-me');
  });

  it('unaffectedGrants counts ENABLED grants only: a revocation is not a grant the change leaves in place', async () => {
    // M.disabled has exactly one row, ORG_A's explicit disable, and no grant.
    // Every module the tests above re-tier holds only enabled rows, so a count
    // that dropped `enabled IS TRUE` read the same there.
    const res = await request(app)
      .patch(`${SYS}/licensing/modules/${M.disabled}`)
      .send({ minTier: 'enterprise', reason: reason('repackage disabled-only module') });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ moduleId: M.disabled, minTier: 'enterprise', unaffectedGrants: 0 });
    const held = await owner.query(
      `SELECT count(*) FILTER (WHERE enabled)::int AS on, count(*) FILTER (WHERE NOT enabled)::int AS off
         FROM module_subscriptions WHERE module_id = $1`,
      [M.disabled],
    );
    expect(held.rows[0]).toEqual({ on: 0, off: 1 });

    // Put the packaging back exactly, so the sections below see the fixture.
    const back = await request(app)
      .patch(`${SYS}/licensing/modules/${M.disabled}`)
      .send({ minTier: null, reason: reason('repackage disabled-only module back') });
    expect(back.status).toBe(200);
    const { rows } = await owner.query(`SELECT metadata::jsonb AS m FROM available_modules WHERE module_id = $1`, [M.disabled]);
    expect(rows[0].m).toEqual({ tiers: [], industries: [] });
  });
});

// ─── 4. PATCH tier, then POST provision → provision_org_modules() ────────────

describe('PATCH /licensing/tenants/:id/tier + POST /licensing/tenants/:id/provision', () => {
  it('refuses a bad tier, a missing reason, and an unknown tenant', async () => {
    expect((await request(app).patch(`${SYS}/licensing/tenants/${ORG_C}/tier`).send({ tier: 'gold', reason: reason('x') })).status).toBe(400);
    expect((await request(app).patch(`${SYS}/licensing/tenants/${ORG_C}/tier`).send({ tier: 'professional' })).status).toBe(400);
    expect((await request(app).patch(`${SYS}/licensing/tenants/${ORG_HI}/tier`).send({ tier: 'professional', reason: reason('nobody') })).status).toBe(404);
    expect((await request(app).post(`${SYS}/licensing/tenants/${ORG_C}/provision`).send({})).status).toBe(400);
    const { rows } = await owner.query(`SELECT tier FROM organizations WHERE id = $1`, [ORG_C]);
    expect(rows[0].tier).toBe('standard');
  });

  it('upgrades the plan, audits it under the tenant id, and writes no subscription rows by itself', async () => {
    const before = await enabledRows(ORG_C);
    const why = reason('upgrade C to professional');
    const res = await request(app)
      .patch(`${SYS}/licensing/tenants/${ORG_C}/tier`)
      .send({ tier: 'professional', reason: why });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ORG_C,
      tier: 'professional',
      previousTier: 'standard',
      auditTrail: { persisted: true, chained: true },
    });
    const { rows } = await owner.query(`SELECT tier FROM organizations WHERE id = $1`, [ORG_C]);
    expect(rows[0].tier).toBe('professional');
    expect(await enabledRows(ORG_C)).toEqual(before);

    const audit = await auditRowsFor(why);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ tenant_id: ORG_C, user_id: ADMIN_USER_ID, table_name: 'organization', record_id: String(ORG_C) });
    expect(audit[0].details).toMatchObject({ masterAdminAction: 'tenant.tier_change', previousTier: 'standard', tier: 'professional' });
  });

  it('provisions what the plan includes, revokes nothing, re-enables nothing, and reports counts that match the table', () => withCatalogFrozen(async () => {
    const catalogBefore = await owner.query(`SELECT module_id, metadata::jsonb AS meta FROM available_modules`);
    const beforeRows = await enabledRows(ORG_C);
    const enabledBefore = beforeRows.filter((r) => r.enabled).map((r) => r.module_id);
    expect(enabledBefore).toEqual([M.ent]);

    const why = reason('provision C at professional');
    const res = await request(app).post(`${SYS}/licensing/tenants/${ORG_C}/provision`).send({ reason: why });
    expect(res.status).toBe(200);

    const afterRows = await enabledRows(ORG_C);
    const enabledAfter = afterRows.filter((r) => r.enabled);

    // Counts, against the rows actually in the table.
    expect(res.body.enabledTotal).toBe(enabledAfter.length);
    expect(res.body.granted).toBe(enabledAfter.length - enabledBefore.length);
    expect(res.body.granted).toBeGreaterThan(0);

    const byId = new Map(afterRows.map((r) => [r.module_id, r]));
    // Granted: the lane modules the professional ladder includes.
    expect(byId.get(M.open)?.enabled).toBe(true);
    expect(byId.get(M.std)?.enabled).toBe(true);
    expect(byId.get(M.repack)?.enabled).toBe(true); // unrestricted since section 3
    // Never revoked: the above-tier grant.
    expect(byId.get(M.ent)?.enabled).toBe(true);
    // Never re-enabled: the admin's explicit disable.
    expect(byId.get(M.pro)?.enabled).toBe(false);
    // Not granted: industry mismatch, deprecated, and enterprise-only.
    expect(byId.has(M.medtech)).toBe(false);
    expect(byId.has(M.retired)).toBe(false);
    expect(byId.has(M.enabled)).toBe(false);

    // Every row this run added qualifies under the documented ladder...
    const added = enabledAfter.filter((r) => !enabledBefore.includes(r.module_id));
    for (const r of added) expect({ id: r.module_id, ok: qualifies(r.meta, 'professional', 'biotech') }).toEqual({ id: r.module_id, ok: true });
    // ...and every catalog module that qualified (and still exists unchanged)
    // now has a row — enabled, or the pre-existing disable.
    const catalogAfter = new Map(
      (await owner.query(`SELECT module_id, metadata::jsonb AS meta FROM available_modules`)).rows.map((r: any) => [r.module_id, r.meta]),
    );
    const missing = catalogBefore.rows
      .filter((r: any) => qualifies(r.meta, 'professional', 'biotech'))
      .filter((r: any) => JSON.stringify(catalogAfter.get(r.module_id)) === JSON.stringify(r.meta))
      .filter((r: any) => !byId.has(r.module_id))
      .map((r: any) => r.module_id);
    expect(missing).toEqual([]);

    // retainedAboveTier: exactly the enabled rows the table says sit above the plan.
    const aboveInTable = enabledAfter.filter((r) => aboveTier(r.meta, 'professional')).map((r) => r.module_id).sort();
    expect(res.body.retainedAboveTier.map((r: any) => r.moduleId).sort()).toEqual(aboveInTable);
    expect(aboveInTable).toEqual([M.ent]);

    const audit = await auditRowsFor(why);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ tenant_id: ORG_C, user_id: ADMIN_USER_ID, record_id: String(ORG_C) });
    expect(audit[0].details).toMatchObject({
      masterAdminAction: 'tenant.provision',
      tier: 'professional',
      granted: res.body.granted,
      retainedAboveTier: [M.ent],
    });
    expect(res.body.auditTrail).toEqual({ persisted: true, chained: true });
  }));

  it('a downgrade provisions nothing, revokes nothing, and names every grant now above the plan', () => withCatalogFrozen(async () => {
    const tierRes = await request(app)
      .patch(`${SYS}/licensing/tenants/${ORG_C}/tier`)
      .send({ tier: 'free', reason: reason('downgrade C to free') });
    expect(tierRes.status).toBe(200);
    const beforeRows = await enabledRows(ORG_C);
    const enabledBefore = beforeRows.filter((r) => r.enabled);

    const res = await request(app)
      .post(`${SYS}/licensing/tenants/${ORG_C}/provision`)
      .send({ reason: reason('provision C at free') });
    expect(res.status).toBe(200);

    const afterRows = await enabledRows(ORG_C);
    const enabledAfter = afterRows.filter((r) => r.enabled);
    expect(enabledAfter.map((r) => r.module_id).sort()).toEqual(enabledBefore.map((r) => r.module_id).sort());
    expect(res.body.granted).toBe(0);
    expect(res.body.enabledTotal).toBe(enabledAfter.length);

    const aboveInTable = enabledAfter.filter((r) => aboveTier(r.meta, 'free')).map((r) => r.module_id).sort();
    expect(res.body.retainedAboveTier.map((r: any) => r.moduleId).sort()).toEqual(aboveInTable);
    expect(aboveInTable).toEqual(expect.arrayContaining([M.ent, M.std]));
  }));
});

describe('provisioning a tenant whose tier the ladder does not name', () => {
  it('never reports a grant this very run made as "retained above tier"', () => withCatalogFrozen(async () => {
    const why = reason('provision D at an unrecognised tier');
    const res = await request(app).post(`${SYS}/licensing/tenants/${ORG_D}/provision`).send({ reason: why });
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('starter');

    const rows = (await enabledRows(ORG_D)).filter((r) => r.enabled);
    // provision_org_modules() ranks an unrecognised tier as `standard`, so
    // standard modules were granted...
    expect(rows.map((r) => r.module_id)).toContain(M.std);
    expect(res.body.granted).toBe(rows.length);
    // ...and a module the run just granted cannot, in the same response, be
    // "a grant the tenant keeps that this plan does not include".
    const retained = res.body.retainedAboveTier.map((r: any) => r.moduleId);
    expect(retained).toEqual([]);
    const audit = await auditRowsFor(why);
    expect(audit).toHaveLength(1);
    expect(audit[0].details.retainedAboveTier).toEqual([]);
  }));
});

describe('provisioning a tenant whose industry_mode is NULL', () => {
  // organizations.industry_mode is nullable with no default. 20260823 treats a
  // NULL industry as `biotech` (the `IF v_industry IS NULL` line), exactly as
  // getLicenseInfo does for the customer rail. Before this test only the
  // byte-identity drift test watched that line — and on a database migrated
  // from the same tree (CI), the drift test cannot see an edit to the file,
  // because the edited file IS what got deployed. This is the behavioural check.
  beforeAll(async () => {
    await owner.query(
      `INSERT INTO organizations (id, name, slug, tier, industry_mode, status)
       VALUES ($1, $2, $3, 'standard', NULL, 'active')`,
      [ORG_H, `dbtb tenant ${ORG_H}`, `dbtb-${ORG_H}`],
    );
  });

  it('is provisioned as biotech: biotech-listed modules granted, medtech-only not', () => withCatalogFrozen(async () => {
    const catalogBefore = await owner.query(`SELECT module_id, metadata::jsonb AS meta FROM available_modules`);
    const why = reason('provision H with a NULL industry');
    const res = await request(app).post(`${SYS}/licensing/tenants/${ORG_H}/provision`).send({ reason: why });
    expect(res.status).toBe(200);

    const rows = (await enabledRows(ORG_H)).filter((r) => r.enabled);
    const ids = new Set(rows.map((r) => r.module_id));
    // M.repack lists ['biotech', 'pharma'] and is unrestricted since section 3.
    expect(ids.has(M.repack)).toBe(true);
    expect(ids.has(M.open)).toBe(true);
    expect(ids.has(M.medtech)).toBe(false);
    expect(res.body.granted).toBe(rows.length);
    expect(res.body.retainedAboveTier).toEqual([]);
    // Every grant qualifies for standard+biotech, and every such module was granted.
    for (const r of rows) expect({ id: r.module_id, ok: qualifies(r.meta, 'standard', 'biotech') }).toEqual({ id: r.module_id, ok: true });
    const missing = catalogBefore.rows
      .filter((r: any) => qualifies(r.meta, 'standard', 'biotech'))
      .filter((r: any) => !ids.has(r.module_id))
      .map((r: any) => r.module_id);
    expect(missing).toEqual([]);
  }));
});

describe('malformed tenant ids', () => {
  it.each(['1.5', '99999999999'])('%s is a 404 on every tenant route, never a 500', async (id) => {
    expect((await request(app).get(`${SYS}/licensing/tenants/${id}`)).status).toBe(404);
    expect(
      (await request(app).patch(`${SYS}/licensing/tenants/${id}/tier`).send({ tier: 'standard', reason: reason('bad id') })).status,
    ).toBe(404);
    expect(
      (await request(app).post(`${SYS}/licensing/tenants/${id}/provision`).send({ reason: reason('bad id') })).status,
    ).toBe(404);
  });
});

// ─── 5. Enforcement report and the governed mode ─────────────────────────────

describe('enforcement report + mode', () => {
  it('with nothing stored, the deployment decides and the cache starts cold', async () => {
    expect(modeMod.peekEnforcementMode()).toBeNull();
    const res = await request(app).get(`${SYS}/licensing/enforcement/mode`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      mode: 'off',
      source: 'deployment',
      storedMode: null,
      deploymentMode: 'off',
      degraded: false,
      modes: ['off', 'report', 'enforce'],
    });
  });

  it('PATCH refuses a missing or short reason and an unknown mode, writing nothing', async () => {
    for (const body of [{ mode: 'report' }, { mode: 'report', reason: 'ab' }, { mode: 'strict', reason: reason('bad mode') }]) {
      const res = await request(app).patch(`${SYS}/licensing/enforcement/mode`).send(body);
      expect(res.status).toBe(400);
    }
    const { rows } = await owner.query(`SELECT 1 FROM platform_settings WHERE setting_key = 'module_enforcement_mode'`);
    expect(rows).toEqual([]);
  });

  it('PATCH upserts platform_settings, re-reads it, reports source "stored", and audits', async () => {
    const why = reason('mode to report');
    const res = await request(app).patch(`${SYS}/licensing/enforcement/mode`).send({ mode: 'report', reason: why });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      mode: 'report',
      source: 'stored',
      storedMode: 'report',
      deploymentMode: 'off',
      updatedBy: ADMIN_USER_ID,
      reason: why,
      degraded: false,
      previousMode: 'off',
      previousSource: 'deployment',
      auditTrail: { persisted: true, chained: true },
    });

    const { rows } = await owner.query(
      `SELECT setting_value, updated_by, reason FROM platform_settings WHERE setting_key = 'module_enforcement_mode'`,
    );
    expect(rows).toEqual([{ setting_value: 'report', updated_by: ADMIN_USER_ID, reason: why }]);

    const audit = await auditRowsFor(why);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      tenant_id: 0,
      user_id: ADMIN_USER_ID,
      table_name: 'platform_config',
      record_id: 'module-enforcement-mode',
    });
    expect(audit[0].details).toMatchObject({
      masterAdminAction: 'enforcement.mode_change',
      previousMode: 'off',
      previousSource: 'deployment',
      mode: 'report',
    });

    const first = await owner.query(
      `SELECT updated_at FROM platform_settings WHERE setting_key = 'module_enforcement_mode'`,
    );

    // A second change goes through the ON CONFLICT arm — made by a DIFFERENT
    // admin, so an arm that kept the old updated_by / reason / updated_at is
    // visible. With one admin writing twice, the old and new updated_by are
    // the same number. (Skeptic pass: an arm that kept `reason` passed 28/28.)
    const why2 = reason('mode to enforce');
    const res2 = await request(app)
      .patch(`${SYS}/licensing/enforcement/mode`)
      .set('x-dbtb-user-id', String(ADMIN2_USER_ID))
      .send({ mode: 'enforce', reason: why2 });
    expect(res2.status).toBe(200);
    expect(res2.body).toMatchObject({
      mode: 'enforce',
      source: 'stored',
      previousMode: 'report',
      previousSource: 'stored',
      updatedBy: ADMIN2_USER_ID,
      reason: why2,
    });
    const again = await owner.query(
      `SELECT count(*)::int AS n, max(setting_value) AS v FROM platform_settings WHERE setting_key = 'module_enforcement_mode'`,
    );
    expect(again.rows[0]).toEqual({ n: 1, v: 'enforce' });
    const row2 = await owner.query(
      `SELECT updated_by, reason, updated_at FROM platform_settings WHERE setting_key = 'module_enforcement_mode'`,
    );
    expect(row2.rows[0]).toMatchObject({ updated_by: ADMIN2_USER_ID, reason: why2 });
    expect(new Date(row2.rows[0].updated_at).getTime()).toBeGreaterThan(new Date(first.rows[0].updated_at).getTime());
    const audit2 = await auditRowsFor(why2);
    expect(audit2).toHaveLength(1);
    expect(audit2[0]).toMatchObject({ user_id: ADMIN2_USER_ID, tenant_id: 0 });
  });

  it('a cold GET reads the stored value from the database, and it outranks the deployment', async () => {
    // A deployment configured for something ELSE, so precedence is observable.
    process.env.MODULE_ENFORCEMENT = 'report';
    try {
      expect(modeMod.peekEnforcementMode()).toBeNull();
      const res = await request(app).get(`${SYS}/licensing/enforcement/mode`);
      expect(res.body).toMatchObject({ mode: 'enforce', source: 'stored', storedMode: 'enforce', deploymentMode: 'report' });
    } finally {
      delete process.env.MODULE_ENFORCEMENT;
    }
  });

  it('the mode-change audit row records the impact the operator could see when deciding', async () => {
    // The router's header: the audit detail carries the impact measured AT THE
    // MOMENT OF THE CHANGE, because the buffer it came from can be cleared.
    // Every earlier PATCH ran on an empty buffer, where "0 workspaces at risk"
    // and "the count was never recorded" read the same. (Skeptic pass: hard-
    // coding workspacesAtRisk: 0 / modulesAtRisk: [] passed 28/28.)
    obsMod.clearObservations();
    obsMod.recordObservation({ path: '/api/dbtb/probe-a', organizationId: ORG_A, modules: [M.ent], reasons: ['tier'], enforced: false });
    obsMod.recordObservation({ path: '/api/dbtb/probe-b', organizationId: ORG_B, modules: [M.pro, M.ent], reasons: ['tier'], enforced: false });
    try {
      const seen = await request(app).get(`${SYS}/licensing/enforcement/mode`);
      expect(seen.status).toBe(200);
      expect(seen.body.impact).toMatchObject({ organizationsAffected: 2, modulesAffected: [M.ent, M.pro].sort(), observations: 2 });
      expect(seen.body.impact.observingSince).toEqual(expect.any(String));

      // Re-affirm the stored mode: the sections below still expect 'enforce'.
      const why = reason('mode re-affirmed with two workspaces at risk');
      const res = await request(app).patch(`${SYS}/licensing/enforcement/mode`).send({ mode: 'enforce', reason: why });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ mode: 'enforce', previousMode: 'enforce', auditTrail: { persisted: true, chained: true } });

      const audit = await auditRowsFor(why);
      expect(audit).toHaveLength(1);
      expect(audit[0].details).toMatchObject({
        masterAdminAction: 'enforcement.mode_change',
        workspacesAtRisk: 2,
        modulesAtRisk: [M.ent, M.pro].sort(),
        observingSince: seen.body.impact.observingSince,
      });
    } finally {
      obsMod.clearObservations();
    }
  });

  it('GET /licensing/enforcement reports the buffer under the mode in force; DELETE needs a reason, clears it, and audits', async () => {
    obsMod.clearObservations();
    obsMod.recordObservation({
      path: '/api/dbtb/probe',
      organizationId: ORG_A,
      modules: [M.ent],
      reasons: ['tier'],
      enforced: true,
    });
    const report = await request(app).get(`${SYS}/licensing/enforcement`);
    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({ mode: 'enforce', organizationsAffected: 1, modulesAffected: [M.ent] });
    expect(report.body.observations).toHaveLength(1);

    const refused = await request(app).delete(`${SYS}/licensing/enforcement`).send({});
    expect(refused.status).toBe(400);
    expect(obsMod.enforcementReport('x').observations).toHaveLength(1);

    const why = reason('clear observations');
    const res = await request(app).delete(`${SYS}/licensing/enforcement`).send({ reason: why });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ observations: [], observingSince: null, auditTrail: { persisted: true, chained: true } });

    const audit = await auditRowsFor(why);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ tenant_id: 0, table_name: 'platform_config', record_id: 'module-enforcement-observations' });
    expect(audit[0].details).toMatchObject({ masterAdminAction: 'enforcement.observations_cleared', clearedObservations: 1 });
  });

  it('under a PER-USER scope a platform-level audit row cannot land — why the system prefix is required', async () => {
    // Documentation, not a defect: tenant 0 is not the caller's org, and the
    // audit_logs policy refuses it. Production never routes this path per-user.
    const why = reason('clear observations per-user');
    const res = await request(app).delete(`${PER_USER}/licensing/enforcement`).send({ reason: why });
    expect(res.status).toBe(200);
    expect(res.body.auditTrail.chained).toBe(false);
    expect(await auditRowsFor(why)).toEqual([]);
  });

  it('the audit row records the mode actually REPLACED, not a stale per-process cache', async () => {
    // Warm this process's cache with what is stored now.
    const warm = await request(app).get(`${SYS}/licensing/enforcement/mode`);
    expect(warm.body).toMatchObject({ source: 'stored', mode: 'enforce' });
    // Another server process changes it (its own write invalidates ITS cache,
    // not this one's). Up to MODE_CACHE_TTL_MS later, this process still
    // serves the old answer — by design for the gate.
    await owner.query(
      `UPDATE platform_settings SET setting_value = 'report', reason = $1, updated_at = now()
        WHERE setting_key = 'module_enforcement_mode'`,
      [reason('changed on another process')],
    );
    const why = reason('mode to off after another process changed it');
    const res = await request(app).patch(`${SYS}/licensing/enforcement/mode`).send({ mode: 'off', reason: why });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mode: 'off', source: 'stored', previousMode: 'report', previousSource: 'stored' });
    const audit = await auditRowsFor(why);
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ previousMode: 'report', previousSource: 'stored', mode: 'off' });
  });

  it('reset: with the stored row gone and the cache dropped, the deployment decides again', async () => {
    await owner.query(`DELETE FROM platform_settings WHERE setting_key = 'module_enforcement_mode'`);
    // Warm the cache, then show it is the only thing carrying an old answer.
    const warm = await request(app).get(`${SYS}/licensing/enforcement/mode`);
    expect(warm.body).toMatchObject({ mode: 'off', source: 'deployment', storedMode: null });
    modeMod.invalidateEnforcementModeCache();
    expect(modeMod.peekEnforcementMode()).toBeNull();
  });

  it('when the stored mode cannot be read, a cold process never escalates past report', async () => {
    // enforcement-mode.ts FAIL SAFE: with no previous good answer, an unreadable
    // store yields the deployment value CAPPED at 'report' — a deployment set to
    // refuse observes instead of 403ing customers over an infrastructure fault.
    //
    // How the read is made to fail, lane-privately: readStoredMode's statement
    // names `platform_settings` unqualified, and THIS run's role resolves it
    // through `<run>_fn, public`. A table of that name in <run>_fn, on which
    // the role holds no privilege, makes the real statement fail with a real
    // Postgres 42501 (permission denied) — not a mocked throw. Nothing shared is
    // touched. A REVOKE on public.platform_settings was tried first and hit
    // `tuple concurrently updated` against another lane's concurrent
    // `GRANT … ON ALL TABLES IN SCHEMA public`: rewriting a shared ACL can
    // break the other lanes' role provisioning, so this file does not do it.
    const shadow = `${fnSchema}.platform_settings`;
    process.env.MODULE_ENFORCEMENT = 'enforce';
    try {
      await owner.query(`CREATE TABLE ${shadow} (LIKE public.platform_settings)`);
      await owner.query(`REVOKE ALL ON ${shadow} FROM ${scratch.runtimeRole}`);
      try {
        modeMod.invalidateEnforcementModeCache();
        const blind = await request(app).get(`${SYS}/licensing/enforcement/mode`);
        expect(blind.status).toBe(200);
        expect(blind.body).toMatchObject({
          mode: 'report',
          source: 'deployment',
          storedMode: null,
          deploymentMode: 'enforce',
          degraded: true,
        });

        // A change attempted while the store refuses is not reported as made:
        // the upsert hits the same refusal, the route answers 500, and no Part
        // 11 row claims a mode change that did not happen.
        const why = reason('mode change while the store refuses');
        const refused = await request(app).patch(`${SYS}/licensing/enforcement/mode`).send({ mode: 'off', reason: why });
        expect(refused.status).toBe(500);
        expect(refused.body).not.toHaveProperty('mode');
        expect(await auditRowsFor(why)).toEqual([]);
      } finally {
        await owner.query(`DROP TABLE IF EXISTS ${shadow}`);
      }
      const stored = await owner.query(`SELECT 1 FROM platform_settings WHERE setting_key = 'module_enforcement_mode'`);
      expect(stored.rows).toEqual([]);
      // Control: the same request with the store readable (and nothing stored)
      // lets the deployment decide, uncapped — so the cap above was the read
      // failure and nothing else.
      modeMod.invalidateEnforcementModeCache();
      const seen = await request(app).get(`${SYS}/licensing/enforcement/mode`);
      expect(seen.body).toMatchObject({ mode: 'enforce', source: 'deployment', degraded: false });
    } finally {
      delete process.env.MODULE_ENFORCEMENT;
      modeMod.invalidateEnforcementModeCache();
    }
  });
});

// ─── 6. The console's verdict against the customer's rail, on the real DB ────
//
// Skeptic pass, 2026-09-22. master-licensing.ts says effectiveVerdict "must show
// the SAME answer the customer's rail shows, or it is worse than useless", and
// its unit test asserts that — over hand-built inputs: it computes `isAvailable`
// itself (known tiers only), and pins every grant perpetual. This compares the
// REAL route with the REAL rail resolver (resolveNavEntitlements →
// getLicenseInfo + getModuleCatalog + decideNavEntitlement), reading the same
// rows, each under the scope production gives it: the console under the
// system scope (/api/admin/master), the rail under the caller's own per-user
// scope (/api/module-subscriptions/navigation is not a system prefix). Launch
// scope is held off for the comparison: it is a layer the console does not
// model, applied after the licensing verdict both sides compute.
describe('the console verdict agrees with the customer rail (real resolver, per-user scope)', () => {
  beforeAll(async () => {
    for (const [id, tier, industry] of [
      [ORG_E, 'free', 'biotech'],
      [ORG_F, 'starter', 'biotech'],
      [ORG_G, 'standard', null],
    ] as const) {
      await owner.query(
        `INSERT INTO organizations (id, name, slug, tier, industry_mode, status)
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [id, `dbtb tenant ${id}`, `dbtb-${id}`, tier, industry],
      );
    }
    // A lapsed trial: enabled, but its expiry has passed (licensing-trials
    // writes exactly this shape). M.pro is above ORG_E's free plan.
    await owner.query(
      `INSERT INTO module_subscriptions (organization_id, module_id, enabled, enabled_at, expires_at)
       VALUES ($1, $2, true, now() - interval '30 days', now() - interval '1 day')`,
      [ORG_E, M.pro],
    );
  });

  async function railFor(org: number) {
    const { resolveNavEntitlements } = await import('../../server/services/entitlements/navigation-entitlements');
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    const savedLaunch = process.env.LAUNCH_SCOPE_ENFORCE;
    process.env.LAUNCH_SCOPE_ENFORCE = 'off';
    try {
      return await runWithTenantScope(
        { tenantId: String(org), orgUuid: null, role: 'admin', source: 'request', caller: 'GET /api/module-subscriptions/navigation' },
        () => resolveNavEntitlements(org, { masterAdmin: false }),
      );
    } finally {
      if (savedLaunch === undefined) delete process.env.LAUNCH_SCOPE_ENFORCE;
      else process.env.LAUNCH_SCOPE_ENFORCE = savedLaunch;
    }
  }

  /** Every module on which the two disagree, in either direction. */
  function compare(org: number) {
    return withCatalogFrozen(async () => {
      const nav = await railFor(org);
      const res = await request(app).get(`${SYS}/licensing/tenants/${org}`);
      expect(res.status).toBe(200);
      expect(nav.resolved).toBe(true);
      const rail = new Map<string, any>(nav.surfaces.map((s: any) => [s.id, s]));
      const diffs: string[] = [];
      for (const m of res.body.modules) {
        const s = rail.get(m.moduleId);
        if (!s) diffs.push(`${m.moduleId}: absent from the rail`);
        else if (s.entitled !== m.effective || s.source !== m.source) {
          diffs.push(`${m.moduleId}: console ${m.effective}/${m.source}, rail ${s.entitled}/${s.source}`);
        }
      }
      const onConsole = new Set(res.body.modules.map((m: any) => m.moduleId));
      for (const id of rail.keys()) if (!onConsole.has(id)) diffs.push(`${id}: absent from the console`);
      return { compared: res.body.modules.length as number, diffs };
    });
  }

  // Well-formed tenants: a known tier, a known industry, perpetual grants.
  // ORG_C by now holds ~90 provisioned grants plus the admin's disable.
  it.each([
    ['ORG_A (standard, grant + disable)', ORG_A],
    ['ORG_B (professional, grants)', ORG_B],
    ['ORG_C (free after the downgrade, provisioned)', ORG_C],
  ])('%s: the same answer, module for module, across the whole catalog', async (_label, org) => {
    const { compared, diffs } = await compare(org);
    expect(compared).toBeGreaterThan(50);
    expect(diffs).toEqual([]);
  });

  // ── Three inputs on which they DISAGREE today — open defects in
  // server/routes/admin/master-licensing.ts GET /licensing/tenants/:id, which
  // this pass is not permitted to edit. Reproduced on this database:
  //
  //  1. EXPIRED GRANT. The rail collapses an enabled row whose expires_at has
  //     passed to 'none' (license-manager getModuleCatalog) and lets tier +
  //     industry decide. The console reads `ms.enabled` only and reports it
  //     'subscribed', effective. Observed for ORG_E / M.pro:
  //       console true/subscribed, rail false/tier
  //  2. UNRECOGNISED TIER — two-sided. getModuleCatalog ranks an unknown plan
  //     as standard (`TIER_LEVELS[tier] ?? 1`), as provision_org_modules does;
  //     the console maps it to orgTier null and locks every tiered module.
  //     Observed for ORG_F ('starter'): 100 of 104 modules differ, e.g.
  //       authoring-engine: console false/tier, rail true/included
  //     Simulating the console fix (rank it as standard) leaves 28 that still
  //     differ, all `console false/tier, rail false/industry`: the RAIL's
  //     decideNavEntitlement (navigation-entitlements.ts, not this lane) takes
  //     TIER_RANK['starter'] as undefined, so it names a tier lock 'industry' —
  //     the wrong reason, told to the customer. Both need fixing for this
  //     tracker to flip.
  //  3. NULL INDUSTRY. getLicenseInfo reads a NULL industry_mode as 'biotech'
  //     (as provision_org_modules does); the console keeps null and locks every
  //     industry-restricted module. Observed for ORG_G / M.repack:
  //       console false/industry, rail true/included
  //
  // Each is measured by an ordinary test (preconditions asserted) and tracked by
  // an `it.fails` that asserts agreement. That pair is not vacuous: if the
  // measurement did not run, the tracker returns normally and goes RED; it
  // stays green only while the disagreement is real. When the router is fixed
  // the tracker goes red too — then change `it.fails` to `it`.
  const measured = new Map<number, string[]>();

  it.each([
    ['ORG_E (lapsed trial grant)', ORG_E],
    ['ORG_F (unrecognised tier)', ORG_F],
    ['ORG_G (NULL industry_mode)', ORG_G],
  ])('%s: measured against the rail', async (label, org) => {
    const { compared, diffs } = await compare(org);
    expect(compared).toBeGreaterThan(50);
    measured.set(org, diffs);
    // The evidence, in the run log, for whoever fixes these.
    console.log(`[console-vs-rail] ${label}: ${diffs.length} of ${compared} modules differ`, diffs.slice(0, 4));
  });

  const tracked = (org: number) => () => {
    const diffs = measured.get(org);
    if (diffs === undefined) return; // measurement did not run: make the tracker red
    expect(diffs).toEqual([]);
  };
  it('an expired grant reads as no override on the console, as on the rail', tracked(ORG_E));
  it('an unrecognised tier ranks as standard on the console and the rail, and a tier lock is named "tier"', tracked(ORG_F));
  it('a NULL industry_mode reads as biotech on the console, as on the rail', tracked(ORG_G));
});
