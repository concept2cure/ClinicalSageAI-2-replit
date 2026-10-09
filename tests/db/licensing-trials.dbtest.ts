/**
 * Time-limited grants (server/routes/admin/licensing-trials.ts) against real
 * PostgreSQL, the way production runs them.
 *
 * ── Posture ──────────────────────────────────────────────────────────────────
 *   - The server's own pool (server/db/runtime.ts) connects as a NON-superuser,
 *     NOBYPASSRLS runtime role minted by the REAL scripts/db/provision-app-role.mjs
 *     (via tests/db/harness.ts), through APP_DATABASE_URL — the variable
 *     production uses to downgrade the request pool. `app.rls_enforce=on` rides
 *     in the startup packet, put there by buildRlsStartupOptions. The first test
 *     asserts all of that from inside a request instead of assuming it.
 *   - The REAL licensing-trials router is mounted at /api/admin/master behind
 *     the REAL establishRequestTenantScope (what the global /api gate calls) and
 *     the REAL requirePlatformAdmin (what ./master-admin puts in front of it).
 *     /api/admin/master is in SYSTEM_SCOPE_PREFIXES, so the router runs under
 *     the system scope (tenantId '0', app_super_admin) because the production
 *     middleware decides so from the path — not because this file says so.
 *   - The only test-owned middleware is an identity stub setting what
 *     server/auth.ts's authMiddleware sets (req.user / userId / userRole /
 *     userEmail). Authentication is not the subject here.
 *   - Entitlement resolution (license-manager getModuleCatalog / canAccessModule)
 *     is called under the PER-USER scope of the organization it concerns — the
 *     scope a customer's own request gets — on the same runtime-role pool.
 *   - Audit rows are read back from audit_logs twice: through auditService's own
 *     reader under the tenant's scope, and as the owner for the chain columns.
 *
 * ── Isolation from the other lanes sharing this database ─────────────────────
 * Organizations 91300–91349 only; every module id starts `dbtc_`, every slug
 * `dbtc-`. The real catalog is never edited. audit_logs is append-only and
 * hash-chained, so audit rows are never deleted; each carries a reason string
 * unique to this run, which is how it is found again.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { createScratchSchema, type ScratchSchema } from './harness';

// ─── Lane constants ──────────────────────────────────────────────────────────

const ORG_LO = 91300;
const ORG_HI = 91349;
/** standard / biotech — the main tenant, and the admin's home org. */
const ORG_STD = 91300;
/** professional / biotech. */
const ORG_PRO = 91301;
/**
 * A tier spelled the way the Stripe subscription webhook can leave it
 * (services/billing.ts writes `subscription.metadata.tier` verbatim, and
 * organizations.tier carries no CHECK constraint).
 */
const ORG_CASE = 91302;
/** standard / biotech — the end / convert flows, kept apart from the list. */
const ORG_ENDS = 91303;
/** standard / biotech — its tier is changed mid-test. */
const ORG_TIER = 91304;
/**
 * standard / industry_mode NULL. organizations.industry_mode is nullable with
 * no default, and resolution reads NULL as 'biotech' (getLicenseInfo), so the
 * console's coveredByPlan must fall back the same way. Added by the lane's
 * independent review: without this tenant, coveredByTier's `|| 'biotech'`
 * fallback could be changed to anything and every test stayed green.
 */
const ORG_NULLIND = 91305;
/** Never created. */
const ORG_UNKNOWN = 91348;

const ADMIN_USER_ID = 91300001;
const ADMIN_EMAIL = 'dbtc-admin@example.invalid';

const RUN = `dbtc-${process.pid}-${Date.now().toString(36)}`;
const reason = (what: string) => `${RUN} ${what}`;

const M = {
  std: 'dbtc_mod_std',
  pro: 'dbtc_mod_pro',
  ent: 'dbtc_mod_ent',
  open: 'dbtc_mod_open',
  medtech: 'dbtc_mod_medtech',
  biotech: 'dbtc_mod_biotech',
  absent: 'dbtc_mod_absent', // never inserted
} as const;

const MODULE_ROWS: Array<{ id: string; meta: Record<string, unknown>; sort: number }> = [
  { id: M.std, meta: { tiers: ['standard'], industries: [] }, sort: 9951 },
  { id: M.pro, meta: { tiers: ['professional'], industries: [] }, sort: 9952 },
  { id: M.ent, meta: { tiers: ['enterprise'], industries: [] }, sort: 9953 },
  { id: M.open, meta: { tiers: [], industries: [] }, sort: 9954 },
  // Open to every tier, offered only to medtech organizations.
  { id: M.medtech, meta: { tiers: [], industries: ['medtech'] }, sort: 9955 },
  // Open to every tier, offered only to biotech organizations.
  { id: M.biotech, meta: { tiers: [], industries: ['biotech'] }, sort: 9956 },
];

const SYS = '/api/admin/master';
const TRIALS = `${SYS}/licensing/trials`;

/** A calendar day `n` days from today (UTC), as the date input yields it. */
function dayPlus(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}
/** Exactly what TrialsPanel.tsx sends for a chosen day. */
const endOfDay = (day: string) => `${day}T23:59:59.000Z`;
/**
 * The two end dates section 1 writes and section 5 reads back from the audit
 * trail. Computed ONCE: recomputing `dayPlus(30)` in section 5 would name a
 * different day if the run crossed UTC midnight between the two.
 */
const FIRST_UNTIL = endOfDay(dayPlus(30));
const MOVED_UNTIL = endOfDay(dayPlus(45));

// ─── State ───────────────────────────────────────────────────────────────────

let owner: Pool;
let scratch: ScratchSchema;
let app: express.Express;
let savedAppDatabaseUrl: string | undefined;
let serverPool: { end: () => Promise<void> } | null = null;

type DbModule = typeof import('../../server/db');
type LicenseModule = typeof import('../../server/services/license-manager');
type AuditModule = typeof import('../../server/services/auditService');
type StoreModule = typeof import('../../server/db/tenantStore');
let db: DbModule;
let license: LicenseModule;
let audit: AuditModule['default'];
let store: StoreModule;

/** The per-user scope establishRequestTenantScope opens for a member of `org`. */
function asTenant<T>(org: number, fn: () => Promise<T>): Promise<T> {
  return store.runWithTenantScope(
    { tenantId: String(org), role: 'member', source: 'request', caller: '/api/module-subscriptions/catalog' },
    fn,
  );
}

async function catalogEntry(org: number, moduleId: string) {
  const catalog = await asTenant(org, () => license.getModuleCatalog(org));
  // getModuleCatalog answers [] on ANY failure — an empty catalog here means
  // the read failed, not that the module is absent, so say which.
  expect(catalog.length, 'getModuleCatalog returned [] — the read failed').toBeGreaterThan(0);
  const entry = catalog.find((e) => e.moduleId === moduleId);
  expect(entry, `${moduleId} missing from ${org}'s catalog`).toBeDefined();
  return entry!;
}

const access = (org: number, moduleId: string) =>
  asTenant(org, () => license.canAccessModule(org, moduleId));

async function grantRow(org: number, moduleId: string) {
  const { rows } = await owner.query(
    `SELECT enabled, expires_at, expiry_set_by, expiry_set_at, disabled_at, disabled_by,
            to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS expires_utc
       FROM module_subscriptions WHERE organization_id = $1 AND module_id = $2`,
    [org, moduleId],
  );
  return rows[0] ?? null;
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

async function seedGrant(
  org: number,
  moduleId: string,
  enabled: boolean,
  expiresAtSql: string | null,
) {
  await owner.query(
    `INSERT INTO module_subscriptions
       (organization_id, module_id, enabled, enabled_at, disabled_at, disabled_by,
        expires_at, expiry_set_by, expiry_set_at)
     VALUES ($1, $2, $3, CASE WHEN $3 THEN now() END, CASE WHEN $3 THEN NULL ELSE now() END,
             CASE WHEN $3 THEN NULL ELSE 'dbtc-other-admin' END,
             ${expiresAtSql ?? 'NULL'}, ${expiresAtSql ? "'dbtc-seed'" : 'NULL'},
             ${expiresAtSql ? 'now()' : 'NULL'})`,
    [org, moduleId, enabled],
  );
}

async function cleanupLaneRows(): Promise<void> {
  await owner.query(
    `DELETE FROM module_subscriptions
      WHERE organization_id BETWEEN $1 AND $2 OR module_id LIKE 'dbtc\\_%'`,
    [ORG_LO, ORG_HI],
  );
  await owner.query(`DELETE FROM available_modules WHERE module_id LIKE 'dbtc\\_%'`);
  await owner.query(`DELETE FROM organizations WHERE id BETWEEN $1 AND $2`, [ORG_LO, ORG_HI]);
}

const laneTrials = (body: any) =>
  (body.trials as any[]).filter((t) => t.organizationId >= ORG_LO && t.organizationId <= ORG_HI);
const key = (t: { organizationId: number; moduleId: string }) => `${t.organizationId}:${t.moduleId}`;

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  scratch = await createScratchSchema(databaseUrl);
  const runtimePool = await scratch.connectAsRuntimeRole();
  const runtimeUrl = (runtimePool as unknown as { options: { connectionString: string } }).options
    .connectionString;

  // server/db/runtime.ts builds its pool at import time from APP_DATABASE_URL,
  // so this precedes every server import below.
  savedAppDatabaseUrl = process.env.APP_DATABASE_URL;
  process.env.APP_DATABASE_URL = runtimeUrl;

  await cleanupLaneRows();

  for (const [id, tier, industry] of [
    [ORG_STD, 'standard', 'biotech'],
    [ORG_PRO, 'professional', 'biotech'],
    [ORG_CASE, 'Professional', 'biotech'],
    [ORG_ENDS, 'standard', 'biotech'],
    [ORG_TIER, 'standard', 'biotech'],
    [ORG_NULLIND, 'standard', null],
  ] as const) {
    await owner.query(
      `INSERT INTO organizations (id, name, slug, tier, industry_mode, status)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [id, `dbtc tenant ${id}`, `dbtc-${id}`, tier, industry],
    );
  }
  for (const m of MODULE_ROWS) {
    await owner.query(
      `INSERT INTO available_modules (module_id, name, category, sort_order, metadata)
       VALUES ($1, $2, 'dbtc', $3, $4::json)`,
      [m.id, `dbtc ${m.id}`, m.sort, JSON.stringify(m.meta)],
    );
  }
  const unknown = await owner.query('SELECT 1 FROM organizations WHERE id = $1', [ORG_UNKNOWN]);
  expect(unknown.rows).toHaveLength(0);

  const { establishRequestTenantScope } = await import(
    '../../server/middleware/establishRequestTenantScope'
  );
  const { requirePlatformAdmin } = await import('../../server/middleware/requirePlatformAdmin');
  const trialsRouter = (await import('../../server/routes/admin/licensing-trials')).default;
  db = await import('../../server/db');
  serverPool = db.getPool() as unknown as { end: () => Promise<void> };
  license = await import('../../server/services/license-manager');
  audit = (await import('../../server/services/auditService')).default;
  store = await import('../../server/db/tenantStore');

  /** Reports the connection the router's own queries run on. Test-owned, read-only. */
  const posture = express.Router();
  posture.get('/__dbtc_posture', async (_req, res) => {
    const r = await db.query(
      `SELECT current_user AS role,
              current_setting('is_superuser')::boolean AS superuser,
              (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls,
              current_setting('app.rls_enforce', true) AS rls_enforce,
              current_setting('app.current_tenant_id', true) AS tenant,
              current_setting('app.current_user_role', true) AS scope_role`,
    );
    res.json(r.rows[0]);
  });

  app = express();
  app.use(express.json());
  // What server/auth.ts authMiddleware sets once the token and membership verify.
  app.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = ADMIN_USER_ID;
    r.userRole = 'super_admin';
    r.userEmail = ADMIN_EMAIL;
    r.tenantId = ORG_STD;
    r.user = {
      id: ADMIN_USER_ID,
      userId: ADMIN_USER_ID,
      email: ADMIN_EMAIL,
      role: 'super_admin',
      organizationId: ORG_STD,
    };
    next();
  });
  // The REAL scope lever the global /api gate calls; it picks the scope by path.
  app.use(establishRequestTenantScope);
  // ./master-admin mounts this router behind requirePlatformAdmin.
  app.use(SYS, requirePlatformAdmin, posture, trialsRouter);
}, 180_000);

afterAll(async () => {
  try {
    if (owner) await cleanupLaneRows();
  } finally {
    if (serverPool) await serverPool.end().catch(() => {});
    if (scratch) await scratch.destroy();
    if (owner) await owner.end().catch(() => {});
    if (savedAppDatabaseUrl === undefined) delete process.env.APP_DATABASE_URL;
    else process.env.APP_DATABASE_URL = savedAppDatabaseUrl;
  }
}, 120_000);

// ─── 0. The posture is the production posture ────────────────────────────────

describe('posture', () => {
  it('the router runs as the non-superuser runtime role, RLS enforcing, under the SYSTEM scope', async () => {
    const res = await request(app).get(`${SYS}/__dbtc_posture`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      role: scratch.runtimeRole,
      superuser: false,
      bypassrls: false,
      rls_enforce: 'on',
      tenant: '0',
      scope_role: 'app_super_admin',
    });
  });

  it('resolution runs under the per-user scope, and that scope really narrows module_subscriptions', async () => {
    await seedGrant(ORG_PRO, M.ent, true, null);
    try {
      const seen = await asTenant(ORG_STD, () =>
        db.query(
          `SELECT current_user AS role,
                  current_setting('app.current_tenant_id', true) AS tenant,
                  current_setting('app.rls_enforce', true) AS rls_enforce,
                  (SELECT count(*)::int FROM module_subscriptions WHERE organization_id = $1) AS foreign_rows`,
          [ORG_PRO],
        ),
      );
      expect(seen.rows[0]).toEqual({
        role: scratch.runtimeRole,
        tenant: String(ORG_STD),
        rls_enforce: 'on',
        foreign_rows: 0,
      });
      expect((await grantRow(ORG_PRO, M.ent))?.enabled).toBe(true); // the row IS there
    } finally {
      await owner.query('DELETE FROM module_subscriptions WHERE organization_id = $1 AND module_id = $2', [
        ORG_PRO,
        M.ent,
      ]);
    }
  });
});

// ─── 1. POST /licensing/trials — open, with the body the client sends ────────

describe('POST /licensing/trials', () => {
  const firstUntil = FIRST_UNTIL;
  const movedUntil = MOVED_UNTIL;

  it('stores the end-of-day UTC instant the client sends, and it round-trips exactly', async () => {
    const res = await request(app)
      .post(TRIALS)
      .send({ organizationId: ORG_STD, moduleId: M.ent, until: firstUntil, reason: reason('open ent') });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      organizationId: ORG_STD,
      moduleId: M.ent,
      expiresAt: firstUntil,
      previousExpiry: null,
    });

    const row = await grantRow(ORG_STD, M.ent);
    expect(row.enabled).toBe(true);
    // Rendered by PostgreSQL itself, in UTC — independent of how the driver
    // or this process parses a timestamptz.
    expect(row.expires_utc).toBe(firstUntil);
    expect((row.expires_at as Date).toISOString()).toBe(firstUntil);
    const same = await owner.query(
      `SELECT expires_at = $3::timestamptz AS same FROM module_subscriptions
        WHERE organization_id = $1 AND module_id = $2`,
      [ORG_STD, M.ent, firstUntil],
    );
    expect(same.rows[0].same).toBe(true);
    expect(row.expiry_set_by).toBe(ADMIN_EMAIL);
    expect(row.expiry_set_at).not.toBeNull();

    // ...and the list reads back the same instant, as live.
    const list = await request(app).get(TRIALS);
    const listed = laneTrials(list.body).find((t) => key(t) === `${ORG_STD}:${M.ent}`);
    expect(listed).toMatchObject({ expiresAt: firstUntil, expired: false, setBy: ADMIN_EMAIL });
  });

  it('moving the end date reports the previous one and stores the new one', async () => {
    const res = await request(app)
      .post(TRIALS)
      .send({ organizationId: ORG_STD, moduleId: M.ent, until: movedUntil, reason: reason('extend ent') });
    expect(res.status).toBe(200);
    expect(res.body.expiresAt).toBe(movedUntil);
    expect(res.body.previousExpiry).toBe(firstUntil);
    expect((await grantRow(ORG_STD, M.ent)).expires_utc).toBe(movedUntil);
  });

  it('a past end date is refused with 400 and writes nothing — new grant or existing one', async () => {
    const past = endOfDay(dayPlus(-1));

    const fresh = await request(app)
      .post(TRIALS)
      .send({ organizationId: ORG_PRO, moduleId: M.std, until: past, reason: reason('past fresh') });
    expect(fresh.status).toBe(400);
    expect(fresh.body.error).toMatch(/in the past/i);
    expect(await grantRow(ORG_PRO, M.std)).toBeNull();
    expect(await auditRowsFor(reason('past fresh'))).toHaveLength(0);

    const existing = await request(app)
      .post(TRIALS)
      .send({ organizationId: ORG_STD, moduleId: M.ent, until: past, reason: reason('past existing') });
    expect(existing.status).toBe(400);
    expect((await grantRow(ORG_STD, M.ent)).expires_utc).toBe(movedUntil);
    expect(await auditRowsFor(reason('past existing'))).toHaveLength(0);
  });
});

// ─── 2. GET /licensing/trials ────────────────────────────────────────────────

describe('GET /licensing/trials', () => {
  beforeAll(async () => {
    await seedGrant(ORG_STD, M.pro, true, `now() - interval '3 days'`); // lapsed, plan does not cover
    await seedGrant(ORG_STD, M.std, true, `now() - interval '2 days'`); // lapsed, plan covers
    await seedGrant(ORG_STD, M.open, true, `now() + interval '10 days'`); // live, unrestricted
    await seedGrant(ORG_STD, M.medtech, true, `now() - interval '1 day'`); // lapsed, wrong industry
    await seedGrant(ORG_PRO, M.pro, true, `now() + interval '12 days'`); // live, plan covers
    await seedGrant(ORG_CASE, M.pro, true, `now() - interval '4 days'`); // lapsed, verbatim tier
    await seedGrant(ORG_TIER, M.pro, true, `now() - interval '5 days'`); // lapsed; tier changes below
    // industry_mode NULL: resolution reads it as biotech.
    await seedGrant(ORG_NULLIND, M.biotech, true, `now() - interval '7 days'`); // lapsed, plan covers
    await seedGrant(ORG_NULLIND, M.medtech, true, `now() - interval '8 days'`); // lapsed, wrong industry
    // Not trials: a revocation carrying a legacy end date, and a perpetual grant.
    await seedGrant(ORG_PRO, M.std, false, `now() - interval '6 days'`);
    await seedGrant(ORG_PRO, M.open, true, null);
  });

  const expectedLapsed = [
    `${ORG_STD}:${M.pro}`,
    `${ORG_STD}:${M.std}`,
    `${ORG_STD}:${M.medtech}`,
    `${ORG_CASE}:${M.pro}`,
    `${ORG_TIER}:${M.pro}`,
    `${ORG_NULLIND}:${M.biotech}`,
    `${ORG_NULLIND}:${M.medtech}`,
  ];
  const expectedLive = [`${ORG_STD}:${M.ent}`, `${ORG_STD}:${M.open}`, `${ORG_PRO}:${M.pro}`];

  it('lists live and lapsed grants together; revocations and perpetual grants are not trials', async () => {
    const res = await request(app).get(TRIALS);
    expect(res.status).toBe(200);
    const mine = laneTrials(res.body);

    expect(mine.filter((t) => t.expired).map(key).sort()).toEqual([...expectedLapsed].sort());
    expect(mine.filter((t) => !t.expired).map(key).sort()).toEqual([...expectedLive].sort());
    expect(mine.map(key)).not.toContain(`${ORG_PRO}:${M.std}`);
    expect(mine.map(key)).not.toContain(`${ORG_PRO}:${M.open}`);

    // The totals are over every tenant (the system scope sees all of them), so
    // they are checked against the list they summarise.
    const all = res.body.trials as any[];
    expect(res.body.live).toBe(all.filter((t) => !t.expired).length);
    expect(res.body.lapsed).toBe(all.filter((t) => t.expired).length);
    expect(res.body.live + res.body.lapsed).toBe(all.length);
    expect(res.body.lapsed).toBeGreaterThanOrEqual(expectedLapsed.length);
    expect(res.body.live).toBeGreaterThanOrEqual(expectedLive.length);

    // Soonest end first.
    const instants = mine.map((t) => Date.parse(t.expiresAt));
    expect(instants).toEqual([...instants].sort((a, b) => a - b));

    const lapsed = mine.find((t) => key(t) === `${ORG_STD}:${M.pro}`);
    expect(lapsed).toMatchObject({
      organizationName: `dbtc tenant ${ORG_STD}`,
      organizationSlug: `dbtc-${ORG_STD}`,
      tier: 'standard',
      moduleName: `dbtc ${M.pro}`,
      setBy: 'dbtc-seed',
      expired: true,
    });
    expect(lapsed.setAt).toEqual(expect.any(String));
  });

  it("coveredByPlan follows the catalog's tier metadata and the org's real tier", async () => {
    const before = laneTrials((await request(app).get(TRIALS)).body);
    const covered = (k: string) => before.find((t) => key(t) === k)?.coveredByPlan;
    expect(covered(`${ORG_STD}:${M.pro}`)).toBe(false); // standard < professional
    expect(covered(`${ORG_STD}:${M.std}`)).toBe(true);
    expect(covered(`${ORG_STD}:${M.open}`)).toBe(true); // no tier list: unrestricted
    expect(covered(`${ORG_STD}:${M.ent}`)).toBe(false);
    expect(covered(`${ORG_PRO}:${M.pro}`)).toBe(true);
    expect(covered(`${ORG_TIER}:${M.pro}`)).toBe(false);
    // industry_mode NULL is biotech, exactly as resolution reads it.
    expect(covered(`${ORG_NULLIND}:${M.biotech}`)).toBe(true);
    expect(covered(`${ORG_NULLIND}:${M.medtech}`)).toBe(false);

    // The org's REAL tier, read per request — not a value cached anywhere.
    await owner.query(`UPDATE organizations SET tier = 'professional' WHERE id = $1`, [ORG_TIER]);
    try {
      const after = laneTrials((await request(app).get(TRIALS)).body);
      expect(after.find((t) => key(t) === `${ORG_TIER}:${M.pro}`)?.coveredByPlan).toBe(true);
    } finally {
      await owner.query(`UPDATE organizations SET tier = 'standard' WHERE id = $1`, [ORG_TIER]);
    }
  });

  it("coveredByPlan says what the customer's own resolution says — for every lane row", async () => {
    // TrialsPanel turns this flag into "the workspace still has it" or "the
    // workspace has lost access". The only authority on which is true is the
    // resolution the customer's request runs, so each row is checked against it.
    const mine = laneTrials((await request(app).get(TRIALS)).body);
    const disagreements: string[] = [];
    for (const t of mine) {
      const entry = await catalogEntry(t.organizationId, t.moduleId);
      if (entry.isAvailable !== t.coveredByPlan) {
        disagreements.push(`${key(t)} catalog.isAvailable=${entry.isAvailable} coveredByPlan=${t.coveredByPlan}`);
      }
      if (t.expired) {
        // A lapsed grant no longer overrides, so access IS the plan's answer.
        const verdict = await access(t.organizationId, t.moduleId);
        if (verdict.allowed !== t.coveredByPlan) {
          disagreements.push(
            `${key(t)} canAccessModule.allowed=${verdict.allowed} (${verdict.reason}) coveredByPlan=${t.coveredByPlan}`,
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  });
});

// ─── 3. POST /licensing/trials/convert ───────────────────────────────────────

describe('POST /licensing/trials/convert', () => {
  it('makes an already-lapsed grant perpetual: expiry cleared, still enabled, access restored', async () => {
    const seeded = await grantRow(ORG_STD, M.pro);
    expect(seeded.enabled).toBe(true);
    const seededIso = (seeded.expires_at as Date).toISOString();
    // Lapsed, and the standard plan does not include it: no access today.
    expect((await access(ORG_STD, M.pro)).allowed).toBe(false);

    const res = await request(app)
      .post(`${TRIALS}/convert`)
      .send({ organizationId: ORG_STD, moduleId: M.pro, reason: reason('convert pro') });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      organizationId: ORG_STD,
      moduleId: M.pro,
      expiresAt: null,
      previousExpiry: seededIso,
    });

    const row = await grantRow(ORG_STD, M.pro);
    expect(row).toMatchObject({ enabled: true, expires_at: null, expiry_set_by: null, expiry_set_at: null });

    const entry = await catalogEntry(ORG_STD, M.pro);
    expect(entry).toMatchObject({
      subscriptionState: 'enabled',
      isEnabled: true,
      grantExpired: false,
      grantExpiresAt: null,
    });
    expect(await access(ORG_STD, M.pro)).toEqual({ allowed: true });

    const list = laneTrials((await request(app).get(TRIALS)).body);
    expect(list.map(key)).not.toContain(`${ORG_STD}:${M.pro}`);
  });
});

// ─── 4. POST /licensing/trials/end — a lapse, never a revocation ─────────────

describe('POST /licensing/trials/end', () => {
  async function openThenEnd(moduleId: string, tag: string) {
    const opened = await request(app)
      .post(TRIALS)
      .send({ organizationId: ORG_ENDS, moduleId, until: endOfDay(dayPlus(20)), reason: reason(`open ${tag}`) });
    expect(opened.status).toBe(200);
    // Live grant: it overrides the plan.
    expect((await catalogEntry(ORG_ENDS, moduleId)).subscriptionState).toBe('enabled');

    const t0 = Date.now();
    const ended = await request(app)
      .post(`${TRIALS}/end`)
      .send({ organizationId: ORG_ENDS, moduleId, reason: reason(`end ${tag}`) });
    const t1 = Date.now();
    expect(ended.status).toBe(200);
    return { ended, t0, t1 };
  }

  it('keeps enabled = true and moves the expiry to now; resolution reads it as no override (not revoked)', async () => {
    const { ended, t0, t1 } = await openThenEnd(M.pro, 'pro');

    const row = await grantRow(ORG_ENDS, M.pro);
    // THE DISTINCTION: enabled stays true. false would be a revocation.
    expect(row.enabled).toBe(true);
    expect(row.disabled_at).toBeNull();
    expect(row.disabled_by).toBeNull();
    const at = (row.expires_at as Date).getTime();
    expect(at).toBeGreaterThanOrEqual(t0 - 1);
    expect(at).toBeLessThanOrEqual(t1 + 1);
    expect(ended.body.expiresAt).toBe((row.expires_at as Date).toISOString());
    expect(ended.body.note).toMatch(/plan itself includes is unchanged/i);

    // The customer's resolution, under their own scope.
    const entry = await catalogEntry(ORG_ENDS, M.pro);
    expect(entry.subscriptionState).toBe('none');
    expect(entry.subscriptionState).not.toBe('disabled');
    expect(entry).toMatchObject({ isEnabled: false, grantExpired: true, isAvailable: false });
    const verdict = await access(ORG_ENDS, M.pro);
    expect(verdict.allowed).toBe(false);
    // The reason names the trial, not an administrator switching it off.
    expect(verdict.reason).toMatch(/ended on \d{4}-\d{2}-\d{2}/);

    const listed = laneTrials((await request(app).get(TRIALS)).body).find(
      (t) => key(t) === `${ORG_ENDS}:${M.pro}`,
    );
    expect(listed).toMatchObject({ expired: true, coveredByPlan: false });
  });

  it('on a module the plan includes, the customer KEEPS it — which a revocation would have taken', async () => {
    await openThenEnd(M.std, 'std');
    expect((await grantRow(ORG_ENDS, M.std)).enabled).toBe(true);
    const entry = await catalogEntry(ORG_ENDS, M.std);
    expect(entry).toMatchObject({ subscriptionState: 'none', isAvailable: true, grantExpired: true });
    expect(await access(ORG_ENDS, M.std)).toEqual({ allowed: true });
  });
});

// ─── 4b. end / convert act only on a time-limited grant ──────────────────────

describe('end and convert act only on a grant that carries an end date', () => {
  /*
   * The console lists a grant, a second administrator revokes it (or converts
   * it) through another surface, and the first presses "End" or "Convert" on
   * the row still on their screen. Both actions are one upsert with
   * enabled = true, so without a check the revocation is overwritten: the
   * module comes back — perpetually, on convert — and the audit trail records
   * it as a trial ending or converting, which is not what happened.
   */
  it('refuses to end or convert a REVOCATION, and leaves it revoked', async () => {
    // A revocation as the toggle writes it today (no end date), and one as a
    // row written before writeModuleGrant cleared the date on a revocation
    // can still hold it: enabled = false WITH a past end date. The second is
    // the shape that looks like a trial if `enabled` is not read.
    await seedGrant(ORG_ENDS, M.open, false, null);
    await seedGrant(ORG_ENDS, M.ent, false, `now() - interval '6 days'`);

    for (const moduleId of [M.open, M.ent]) {
      const before = await grantRow(ORG_ENDS, moduleId);
      expect((await catalogEntry(ORG_ENDS, moduleId)).subscriptionState).toBe('disabled');

      for (const path of ['end', 'convert']) {
        const why = reason(`${path} a revocation of ${moduleId}`);
        const res = await request(app)
          .post(`${TRIALS}/${path}`)
          .send({ organizationId: ORG_ENDS, moduleId, reason: why });
        expect(res.status, `${path} on a revocation of ${moduleId}`).toBe(409);
        expect(res.body.error).toMatch(/revoked/i);
        expect(await grantRow(ORG_ENDS, moduleId)).toEqual(before);
        expect(await auditRowsFor(why)).toHaveLength(0);
      }
      expect((await catalogEntry(ORG_ENDS, moduleId)).subscriptionState).toBe('disabled');
    }
  });

  it('refuses to end or convert where no grant exists, and creates none', async () => {
    expect(await grantRow(ORG_ENDS, M.medtech)).toBeNull();
    for (const path of ['end', 'convert']) {
      const why = reason(`${path} nothing`);
      const res = await request(app)
        .post(`${TRIALS}/${path}`)
        .send({ organizationId: ORG_ENDS, moduleId: M.medtech, reason: why });
      expect(res.status, `${path} with no grant`).toBe(409);
      expect(await grantRow(ORG_ENDS, M.medtech)).toBeNull();
      expect(await auditRowsFor(why)).toHaveLength(0);
    }
  });

  it('refuses to end or convert a PERPETUAL grant (a converted trial), and leaves it perpetual', async () => {
    // ORG_STD × M.pro was converted above.
    for (const path of ['end', 'convert']) {
      const why = reason(`${path} a perpetual grant`);
      const res = await request(app)
        .post(`${TRIALS}/${path}`)
        .send({ organizationId: ORG_STD, moduleId: M.pro, reason: why });
      expect(res.status, `${path} on a perpetual grant`).toBe(409);
      expect(await grantRow(ORG_STD, M.pro)).toMatchObject({ enabled: true, expires_at: null });
      expect(await access(ORG_STD, M.pro)).toEqual({ allowed: true });
      expect(await auditRowsFor(why)).toHaveLength(0);
    }
  });
});

// ─── 5. Every write is audited, with the action that says what it was ───────

describe('audit trail', () => {
  const record = (org: number, moduleId: string) => `${org}:${moduleId}`;

  async function oneAuditRow(why: string, org: number, moduleId: string, masterAdminAction: string) {
    const rows = await auditRowsFor(why);
    expect(rows, `audit rows for "${why}"`).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({
      tenant_id: org,
      user_id: ADMIN_USER_ID,
      action: 'data_modify',
      table_name: 'module_subscription',
      record_id: record(org, moduleId),
    });
    expect(row.details).toMatchObject({ masterAdminAction, moduleId, reason: why });
    // In the sha256 chain, not beside it.
    expect(row.sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    expect(row.chain_seq).not.toBeNull();
    return row;
  }

  it('tenant.trial_set — for the open and for the moved end date', async () => {
    const opened = await oneAuditRow(reason('open ent'), ORG_STD, M.ent, 'tenant.trial_set');
    expect(opened.details.expiresAt).toBe(FIRST_UNTIL);
    expect(opened.details.previousExpiry).toBeNull();
    const moved = await oneAuditRow(reason('extend ent'), ORG_STD, M.ent, 'tenant.trial_set');
    expect(moved.details.expiresAt).toBe(MOVED_UNTIL);
    expect(moved.details.previousExpiry).toBe(FIRST_UNTIL);
  });

  it('tenant.trial_converted — carrying the end date it removed', async () => {
    const row = await oneAuditRow(reason('convert pro'), ORG_STD, M.pro, 'tenant.trial_converted');
    expect(row.details.previousExpiry).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });

  it('tenant.trial_ended — carrying the instant the grant now ends', async () => {
    const row = await oneAuditRow(reason('end pro'), ORG_ENDS, M.pro, 'tenant.trial_ended');
    const stored = await grantRow(ORG_ENDS, M.pro);
    expect(row.details.endedAt).toBe((stored.expires_at as Date).toISOString());
    await oneAuditRow(reason('end std'), ORG_ENDS, M.std, 'tenant.trial_ended');
  });

  it("the tenant reads its own record through the audit service, under its own scope", async () => {
    const rows = await asTenant(ORG_ENDS, () =>
      audit.getAuditLog({
        tenantId: ORG_ENDS,
        resourceType: 'module_subscription',
        resourceId: record(ORG_ENDS, M.pro),
        limit: 50,
      }),
    );
    const actions = rows
      .filter((r: any) => (r.newValues as any)?.reason?.startsWith(RUN))
      .map((r: any) => (r.newValues as any).masterAdminAction)
      .sort();
    expect(actions).toEqual(['tenant.trial_ended', 'tenant.trial_set']);
  });
});

// ─── 6. Unknown tenant / unknown module ──────────────────────────────────────

describe('an unknown tenant or module is a 404 and writes nothing', () => {
  const bodies = (organizationId: number, moduleId: string, tag: string) => [
    { path: '', body: { organizationId, moduleId, until: endOfDay(dayPlus(30)), reason: reason(`${tag} set`) } },
    { path: '/convert', body: { organizationId, moduleId, reason: reason(`${tag} convert`) } },
    { path: '/end', body: { organizationId, moduleId, reason: reason(`${tag} end`) } },
  ];

  it('unknown tenant', async () => {
    for (const { path, body } of bodies(ORG_UNKNOWN, M.std, 'unknown tenant')) {
      const res = await request(app).post(`${TRIALS}${path}`).send(body);
      expect(res.status, `POST trials${path}`).toBe(404);
      expect(res.body.error).toBe('Tenant not found.');
      expect(await auditRowsFor(body.reason)).toHaveLength(0);
    }
    const rows = await owner.query('SELECT 1 FROM module_subscriptions WHERE organization_id = $1', [ORG_UNKNOWN]);
    expect(rows.rows).toHaveLength(0);
  });

  it('unknown module', async () => {
    for (const { path, body } of bodies(ORG_STD, M.absent, 'unknown module')) {
      const res = await request(app).post(`${TRIALS}${path}`).send(body);
      expect(res.status, `POST trials${path}`).toBe(404);
      expect(res.body.error).toBe('Unknown module.');
      expect(await auditRowsFor(body.reason)).toHaveLength(0);
    }
    const rows = await owner.query('SELECT 1 FROM module_subscriptions WHERE module_id = $1', [M.absent]);
    expect(rows.rows).toHaveLength(0);
  });
});

// ─── 7. Every write needs a target and a reason, or nothing is written ───────
//
// Added by the lane's independent review (2026-09-22). Before this section,
// deleting the reason check from POST /licensing/trials or from /end, or the
// "a tenant and a module are required" check from POST /licensing/trials, left
// all 20 tests green: every request above sends a valid target and a reason.
// The reason is what the Part 11 chain records as WHY a customer's commercial
// position changed, so its absence must stop the write, not merely go unlogged.

describe('a write without a target or a reason is a 400 and writes nothing', () => {
  const ORG = ORG_TIER;
  /** A LIVE trial: /end and /convert would act on it if nothing stopped them. */
  const LIVE = M.open;
  /** No row: POST /licensing/trials would create one if nothing stopped it. */
  const FRESH = M.std;
  let liveBefore: Record<string, unknown>;

  async function auditCount(org: number | string, moduleId: string): Promise<number> {
    const { rows } = await owner.query(
      `SELECT count(*)::int AS n FROM audit_logs
        WHERE table_name = 'module_subscription' AND record_id = $1`,
      [`${org}:${moduleId}`],
    );
    return rows[0].n;
  }

  beforeAll(async () => {
    await seedGrant(ORG, LIVE, true, `now() + interval '9 days'`);
    liveBefore = await grantRow(ORG, LIVE);
    expect(liveBefore).toMatchObject({ enabled: true });
    expect(await grantRow(ORG, FRESH)).toBeNull();
  });

  const writes = (target: Record<string, unknown>, extra: Record<string, unknown>) => [
    { path: '', body: { ...target, until: endOfDay(dayPlus(30)), ...extra } },
    { path: '/convert', body: { ...target, ...extra } },
    { path: '/end', body: { ...target, ...extra } },
  ];

  it('no reason, a blank one, or one under 3 characters: 400, nothing written, nothing audited', async () => {
    const auditsBefore = [await auditCount(ORG, FRESH), await auditCount(ORG, LIVE)];
    for (const why of [undefined, '', '   ', 'ab', 7]) {
      const extra = why === undefined ? {} : { reason: why };
      // POST /licensing/trials targets the module with no row; /convert and
      // /end target the live trial — so each refusal is the ONLY thing between
      // the request and a real write.
      for (const { path, body } of [
        ...writes({ organizationId: ORG, moduleId: FRESH }, extra).slice(0, 1),
        ...writes({ organizationId: ORG, moduleId: LIVE }, extra).slice(1),
      ]) {
        const res = await request(app).post(`${TRIALS}${path}`).send(body);
        expect(res.status, `POST trials${path} with reason ${JSON.stringify(why)}`).toBe(400);
        expect(res.body.error).toMatch(/reason \(min 3 chars\) is required/i);
      }
    }
    expect(await grantRow(ORG, FRESH)).toBeNull();
    expect(await grantRow(ORG, LIVE)).toEqual(liveBefore);
    expect([await auditCount(ORG, FRESH), await auditCount(ORG, LIVE)]).toEqual(auditsBefore);
  });

  it('no tenant, no module, or a tenant id that is not a number: 400, nothing written', async () => {
    const targets: Array<Record<string, unknown>> = [
      { moduleId: LIVE },
      { organizationId: ORG },
      { organizationId: ORG, moduleId: '   ' },
      { organizationId: ORG, moduleId: 42 },
      { organizationId: 'dbtc', moduleId: LIVE },
      { organizationId: 'Infinity', moduleId: LIVE },
    ];
    for (const [i, target] of targets.entries()) {
      for (const { path, body } of writes(target, { reason: reason(`bad target ${i}`) })) {
        const res = await request(app).post(`${TRIALS}${path}`).send(body);
        expect(res.status, `POST trials${path} with ${JSON.stringify(target)}`).toBe(400);
        expect(res.body.error).toBe('A tenant and a module are required.');
      }
      expect(await auditRowsFor(reason(`bad target ${i}`))).toHaveLength(0);
    }
    expect(await grantRow(ORG, FRESH)).toBeNull();
    expect(await grantRow(ORG, LIVE)).toEqual(liveBefore);
  });

  it('a fractional tenant id is refused and writes nothing', async () => {
    /*
     * KNOWN DEFECT, reproduced here on real PostgreSQL and NOT fixed (the
     * review that found it may not edit the route): readTarget accepts any
     * finite number, so 91304.5 reaches `SELECT id FROM organizations WHERE
     * id = $1`, PostgreSQL answers 22P02 "invalid input syntax for type
     * integer", the pool retries it three times, and the route answers 500
     * "Failed to …" — a caller's mistake reported as a server failure. The
     * fix is `Number.isSafeInteger(organizationId) && organizationId > 0` in
     * readTarget, after which every status below is 400.
     *
     * What this test holds TODAY is the property that matters most: the
     * request is refused and nothing is written or audited. Tighten the
     * status to 400 alone once readTarget is fixed.
     */
    const statuses: Record<string, number> = {};
    for (const { path, body } of writes(
      { organizationId: ORG + 0.5, moduleId: LIVE },
      { reason: reason('fractional tenant') },
    )) {
      const res = await request(app).post(`${TRIALS}${path}`).send(body);
      statuses[`POST trials${path}`] = res.status;
      expect([400, 500], `POST trials${path} with organizationId ${ORG + 0.5}`).toContain(res.status);
    }
    expect(await auditRowsFor(reason('fractional tenant')), JSON.stringify(statuses)).toHaveLength(0);
    // Neither neighbour a rounding would land on was touched.
    expect(await grantRow(ORG, LIVE)).toEqual(liveBefore);
    expect(await grantRow(ORG + 1, LIVE)).toBeNull();
  });
});
