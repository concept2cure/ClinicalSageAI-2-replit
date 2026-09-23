/**
 * The licensing decision history (GET /api/admin/master/licensing/history),
 * against real PostgreSQL, the way production runs it.
 *
 * ── Posture ──────────────────────────────────────────────────────────────────
 *   - The server's own pool (server/db/runtime.ts) connects as a NON-superuser,
 *     NOBYPASSRLS runtime role minted by the REAL scripts/db/provision-app-role.mjs
 *     (through tests/db/harness.ts), via APP_DATABASE_URL — the variable
 *     production uses to downgrade the request pool. `app.rls_enforce=on` rides
 *     in the startup packet exactly as buildRlsStartupOptions puts it there.
 *     The first test asserts all of that from inside a request.
 *   - The REAL licensing-history router is mounted at /api/admin/master behind
 *     the REAL establishRequestTenantScope (what the global /api gate calls).
 *     That prefix is in SYSTEM_SCOPE_PREFIXES, so the router runs under the
 *     SYSTEM scope (tenantId '0', app_super_admin) because the production
 *     middleware decides it from the path, not because this file says so.
 *   - The only test-owned middleware is an identity stub setting what
 *     server/auth.ts's authMiddleware sets. Authentication is not the subject.
 *   - Every audit row is written through the REAL auditService.logAction, under
 *     the system scope a /api/admin/master request carries — the same call the
 *     master-admin / master-licensing / licensing-trials handlers make. No row
 *     is hand-INSERTed: a second definition of the audit row shape would test
 *     itself.
 *   - The one owner-side write is the tamper: an UPDATE of a row's stored
 *     sha256_chain with the immutability triggers suspended
 *     (session_replication_role = replica, superuser only). It is restored in a
 *     `finally` within the same test, so the shared chain is broken for the
 *     length of one request.
 *
 * ── Isolation from the lanes sharing this database ───────────────────────────
 * Organizations 91500–91549 only; every module id starts `dbte_` and carries
 * this run's id. audit_logs is append-only and hash-chained, so audit rows are
 * never deleted — earlier runs' rows stay in these tenants' chains, and every
 * expectation below is computed either from this run's rows (per-run module
 * ids) or from an independent owner-side read of the same predicate.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { createScratchSchema, type ScratchSchema } from './harness';

/*
 * Resolve `server/db` the way PRODUCTION does. esbuild (scripts/build-server.mjs)
 * and tsx try `.ts` before `.js`, so the route's `import { query } from
 * '../../db'` is server/db.ts → db/runtime.ts. Vite tries `.js` first and would
 * hand it the legacy server/db.js wrapper instead: the same instrumented pool,
 * but inside a three-attempt retry loop production never runs. This is not a
 * fake — it is the real module production loads; the posture test proves it.
 */
vi.mock('../../server/db', () => vi.importActual('../../server/db.ts'));

// ─── Lane constants ──────────────────────────────────────────────────────────

const ORG_LO = 91500;
const ORG_HI = 91549;
const ORG_A = 91500;
const ORG_B = 91501;
/** The tenant the concurrent-writer (chain order) test writes into. */
const ORG_C = 91502;

/** The stub platform admin. audit_logs.user_id has no FK. */
const ADMIN_USER_ID = 91500001;
const ADMIN_EMAIL = 'dbte-admin@example.invalid';

const RUN = `${process.pid.toString(36)}${Date.now().toString(36)}`;
const reason = (what: string) => `dbte ${RUN} ${what}`;

/** Shared across A, B and the platform: one module, this run only. */
const MOD_S = `dbte_${RUN}_s`;
/** Only ORG_C's concurrent writes carry this one. */
const MOD_C = `dbte_${RUN}_c`;

const SYS = '/api/admin/master';
const PER_USER = '/api/dbte-peruser';
const HISTORY = `${SYS}/licensing/history`;

// ─── State ───────────────────────────────────────────────────────────────────

let owner: Pool;
let scratch: ScratchSchema;
let app: express.Express;
/** Same router, no scope middleware at all — what a mount outside the gate gets. */
let bareApp: express.Express;
let savedAppDatabaseUrl: string | undefined;
let savedHmacKey: string | undefined;
let serverPool: { end: () => Promise<void> } | null = null;

type AuditServiceT = typeof import('../../server/services/auditService').default;
/** The object call form of logAction — what the master-admin handlers pass. */
type AuditEntry = Extract<Parameters<AuditServiceT['logAction']>[0], object>;
let auditService: AuditServiceT;
let runWithSystemTenantScope: typeof import('../../server/db/tenantStore').runWithSystemTenantScope;
let clearIntegrityCache: () => void;
let verifyAuditChain: typeof import('../../server/services/audit/chain').verifyAuditChain;

/** Seeded rows, by label → audit_logs.id. */
const ids: Record<string, string> = {};
/** Write order of the licensing rows this run seeded (oldest first). */
const seededOrder: string[] = [];
let seedStartedAt = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Write one audit row through the REAL auditService.logAction, inside the
 * system scope a /api/admin/master request runs under, and return its id
 * (found again by the run-unique reason, as the owner).
 */
async function seed(label: string, entry: AuditEntry): Promise<string> {
  const why = reason(label);
  const details = { ...entry.details, reason: why };
  const result = await runWithSystemTenantScope(`system:dbte-seed ${label}`, () =>
    auditService.logAction({ ...entry, details }),
  );
  // The chained audit_logs row is the one the history reads back.
  expect(result.chained, `logAction did not chain ${label}: ${result.error ?? ''}`).toBe(true);
  const { rows } = await owner.query(
    `SELECT id FROM audit_logs WHERE new_values::jsonb->>'reason' = $1`,
    [why],
  );
  expect(rows).toHaveLength(1);
  ids[label] = String(rows[0].id);
  return ids[label];
}

async function history(query: Record<string, string | number> = {}, base = HISTORY, on = app) {
  clearIntegrityCache();
  return request(on).get(base).query(query);
}

/**
 * Overwrite one row's stored sha256_chain as the OWNER, with the append-only
 * triggers suspended for this transaction only. Returns the previous value.
 */
async function setStoredHash(id: string, hash: string): Promise<string> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL session_replication_role = replica');
    const before = await c.query('SELECT sha256_chain FROM audit_logs WHERE id = $1', [id]);
    const upd = await c.query('UPDATE audit_logs SET sha256_chain = $2 WHERE id = $1', [id, hash]);
    if (upd.rowCount !== 1) throw new Error(`tamper touched ${upd.rowCount} rows`);
    await c.query('COMMIT');
    return String(before.rows[0].sha256_chain);
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

/** Flip the last hex digit: a hash that no predecessor derives. */
function tampered(hash: string): string {
  const last = hash.slice(-1);
  return hash.slice(0, -1) + (last === '0' ? '1' : '0');
}

/** Tamper `id`, run `fn`, and put the original hash back whatever happens. */
async function whileTampered<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const { rows } = await owner.query('SELECT sha256_chain FROM audit_logs WHERE id = $1', [id]);
  const original = String(rows[0].sha256_chain);
  await setStoredHash(id, tampered(original));
  try {
    return await fn();
  } finally {
    await setStoredHash(id, original);
  }
}

/** The route's comparison of append position: occurred_at (ms), then id. */
function writeOrderLess(a: { at: number; id: string }, b: { at: number; id: string }): boolean {
  return a.at !== b.at ? a.at < b.at : a.id < b.id;
}

async function chainedRowCount(): Promise<number> {
  const { rows } = await owner.query(
    `SELECT count(*)::int AS n FROM audit_logs WHERE sha256_chain IS NOT NULL`,
  );
  return rows[0].n;
}

async function cleanupLaneRows(): Promise<void> {
  await owner.query(`DELETE FROM available_modules WHERE module_id LIKE 'dbte\\_%'`);
  await owner.query(`DELETE FROM organizations WHERE id BETWEEN $1 AND $2`, [ORG_LO, ORG_HI]);
  await owner.query(`DELETE FROM users WHERE id = $1`, [ADMIN_USER_ID]);
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  scratch = await createScratchSchema(databaseUrl);
  const runtimePool = await scratch.connectAsRuntimeRole();
  const runtimeUrl = (runtimePool as unknown as { options: { connectionString: string } }).options
    .connectionString;

  // server/db/runtime.ts builds its pool at import time from APP_DATABASE_URL.
  savedAppDatabaseUrl = process.env.APP_DATABASE_URL;
  process.env.APP_DATABASE_URL = runtimeUrl;
  // This deployment's HMAC configuration: sealing off. Pinned rather than
  // inherited so the expected "honest unsealed" variant cannot drift with the
  // developer's shell.
  savedHmacKey = process.env.AUDIT_HMAC_KEY;
  delete process.env.AUDIT_HMAC_KEY;

  await cleanupLaneRows();
  for (const id of [ORG_A, ORG_B, ORG_C]) {
    await owner.query(
      `INSERT INTO organizations (id, name, slug, tier, status) VALUES ($1, $2, $3, 'standard', 'active')`,
      [id, `dbte tenant ${id}`, `dbte-${RUN}-${id}`],
    );
  }
  await owner.query(
    `INSERT INTO available_modules (module_id, name, category, sort_order, metadata)
     VALUES ($1, $2, 'dbte', 9950, '{}'::json), ($3, $4, 'dbte', 9951, '{}'::json)`,
    [MOD_S, `dbte shared ${RUN}`, MOD_C, `dbte concurrent ${RUN}`],
  );
  await owner.query(
    `INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, 'dbte admin', 'not-a-hash')`,
    [ADMIN_USER_ID, ADMIN_EMAIL],
  );

  // Only now load the server.
  const { establishRequestTenantScope } = await import(
    '../../server/middleware/establishRequestTenantScope'
  );
  const historyMod = await import('../../server/routes/admin/licensing-history');
  clearIntegrityCache = historyMod.clearIntegrityCache;
  const db = await import('../../server/db');
  serverPool = db.getPool() as unknown as { end: () => Promise<void> };
  auditService = (await import('../../server/services/auditService')).default;
  runWithSystemTenantScope = (await import('../../server/db/tenantStore')).runWithSystemTenantScope;
  verifyAuditChain = (await import('../../server/services/audit/chain')).verifyAuditChain;

  /** Reports the connection the router's own queries run on. Test-owned, read-only. */
  const posture = express.Router();
  posture.get('/__dbte_posture', async (_req, res) => {
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

  const identity: express.RequestHandler = (req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = ADMIN_USER_ID;
    r.userRole = 'super_admin';
    r.userEmail = ADMIN_EMAIL;
    r.tenantId = ORG_A;
    r.user = {
      id: ADMIN_USER_ID,
      userId: ADMIN_USER_ID,
      email: ADMIN_EMAIL,
      role: 'super_admin',
      organizationId: ORG_A,
    };
    next();
  };

  app = express();
  app.use(identity);
  app.use(establishRequestTenantScope);
  app.use(SYS, posture, historyMod.default);
  // NOT a system prefix: the per-user (caller-org) scope. Documents what the
  // prefix protects; production never mounts the router here.
  app.use(PER_USER, posture, historyMod.default);

  bareApp = express();
  bareApp.use(identity);
  bareApp.use(SYS, historyMod.default);

  // ── The seed: every row through the real writer, oldest first ─────────────
  seedStartedAt = Date.now();
  const steps: Array<[string, AuditEntry, boolean]> = [
    ['A1', { tenantId: ORG_A, userId: ADMIN_USER_ID, action: 'data_modify', resourceType: 'module_subscription', resourceId: `${ORG_A}:${MOD_S}`, details: { masterAdminAction: 'tenant.module_toggle', moduleId: MOD_S, enabled: true } }, true],
    ['B1', { tenantId: ORG_B, userId: ADMIN_USER_ID, action: 'data_modify', resourceType: 'module_subscription', resourceId: `${ORG_B}:${MOD_S}`, details: { masterAdminAction: 'tenant.module_toggle', moduleId: MOD_S, enabled: true } }, true],
    // Platform-level: no tenantId, exactly as master-licensing's repackage writes it.
    ['P1', { userId: ADMIN_USER_ID, action: 'data_modify', resourceType: 'module_packaging', resourceId: MOD_S, details: { masterAdminAction: 'module.repackage', moduleId: MOD_S, previousTier: 'standard', minTier: 'professional' } }, true],
    ['A2', { tenantId: ORG_A, userId: ADMIN_USER_ID, action: 'data_modify', resourceType: 'module_subscription', resourceId: `${ORG_A}:${MOD_S}`, details: { masterAdminAction: 'trial.start', moduleId: MOD_S, days: 14 } }, true],
    // Excluded: a person's account state is not a licensing decision.
    ['X1', { tenantId: 0, userId: ADMIN_USER_ID, action: 'data_modify', resourceType: 'user', resourceId: String(ADMIN_USER_ID), details: { masterAdminAction: 'user.status_change', from: 'active', to: 'suspended' } }, false],
    // Not governed at all: no masterAdminAction.
    ['N1', { tenantId: ORG_A, userId: ADMIN_USER_ID, action: 'data_modify', resourceType: 'module_subscription', resourceId: `${ORG_A}:${MOD_S}`, details: { moduleId: MOD_S } }, false],
    // An action this route has never heard of: the vocabulary is open.
    ['U1', { tenantId: ORG_A, userId: ADMIN_USER_ID, action: 'data_modify', resourceType: 'module_subscription', resourceId: `${ORG_A}:${MOD_S}`, details: { masterAdminAction: 'dbte.seat_pool_resize', moduleId: MOD_S, seats: 7 } }, true],
    ['B2', { tenantId: ORG_B, userId: ADMIN_USER_ID, action: 'data_modify', resourceType: 'module_subscription', resourceId: `${ORG_B}:${MOD_S}`, details: { masterAdminAction: 'tenant.module_toggle', moduleId: MOD_S, enabled: false } }, true],
    ['A3', { tenantId: ORG_A, userId: ADMIN_USER_ID, action: 'data_modify', resourceType: 'module_subscription', resourceId: `${ORG_A}:${MOD_S}`, details: { masterAdminAction: 'tenant.module_toggle', moduleId: MOD_S, enabled: false } }, true],
    // A tier change carries no moduleId: in the workspace view, not the module view.
    ['A4', { tenantId: ORG_A, userId: ADMIN_USER_ID, action: 'data_modify', resourceType: 'organization', resourceId: String(ORG_A), details: { masterAdminAction: 'tenant.tier_change', previousTier: 'standard', tier: 'professional' } }, true],
    // A packaging row that names its module only as the audited record.
    ['P2', { userId: ADMIN_USER_ID, action: 'data_modify', resourceType: 'module_packaging', resourceId: MOD_S, details: { masterAdminAction: 'module.repackage', minTier: null } }, true],
  ];
  for (const [label, entry, licensing] of steps) {
    await seed(label, entry);
    if (licensing) seededOrder.push(label);
    // Distinct milliseconds, so "newest first" has one right answer.
    await sleep(4);
  }
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
    if (savedHmacKey === undefined) delete process.env.AUDIT_HMAC_KEY;
    else process.env.AUDIT_HMAC_KEY = savedHmacKey;
  }
}, 120_000);

beforeEach(() => {
  clearIntegrityCache?.();
});

const labelOf = (id: string) => Object.entries(ids).find(([, v]) => v === id)?.[0] ?? id;

// ─── 0. Posture ──────────────────────────────────────────────────────────────

describe('posture', () => {
  it('the router runs as the non-superuser runtime role, RLS enforcing, under the SYSTEM scope', async () => {
    const res = await request(app).get(`${SYS}/__dbte_posture`);
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

  it('the route\'s `query` is the production one (server/db.ts → db/runtime.ts), not the db.js wrapper', async () => {
    const viaFacade = await import('../../server/db');
    const runtime = await import('../../server/db/runtime');
    expect(viaFacade.query).toBe(runtime.query);
  });

  it('the seed went through the real writer: each row holds a per-tenant chain position', async () => {
    const { rows } = await owner.query(
      `SELECT id, tenant_id, chain_seq, sha256_chain FROM audit_logs WHERE id = ANY($1::uuid[])`,
      [Object.values(ids)],
    );
    expect(rows).toHaveLength(Object.keys(ids).length);
    for (const r of rows) {
      expect(r.sha256_chain, labelOf(r.id)).toMatch(/^[0-9a-f]{64}$/);
      expect(r.chain_seq, labelOf(r.id)).not.toBeNull();
    }
    const tenantOf = Object.fromEntries(rows.map((r) => [labelOf(r.id), r.tenant_id]));
    // Platform-level writes land in tenant 0's chain.
    expect(tenantOf).toMatchObject({ A1: ORG_A, B1: ORG_B, P1: 0, X1: 0, P2: 0 });
  });
});

// ─── 1. Newest first; open vocabulary; the exclusion ─────────────────────────

describe('what is listed', () => {
  it('lists this run\'s decisions newest first, with who, where, which module and why', async () => {
    const res = await history({ moduleId: MOD_S, limit: 100 });
    expect(res.status).toBe(200);
    const got = res.body.entries.map((e: any) => labelOf(e.id));
    const expected = seededOrder.filter((l) => l !== 'A4').reverse();
    expect(got).toEqual(expected);

    const a1 = res.body.entries.find((e: any) => e.id === ids.A1);
    expect(a1).toMatchObject({
      action: 'tenant.module_toggle',
      readable: true,
      actorId: ADMIN_USER_ID,
      actorEmail: ADMIN_EMAIL,
      organizationId: ORG_A,
      organizationName: `dbte tenant ${ORG_A}`,
      moduleId: MOD_S,
      moduleName: `dbte shared ${RUN}`,
      reason: reason('A1'),
      changed: { moduleId: MOD_S, enabled: true },
    });
    // The packaging row that names its module only as its record still resolves it.
    const p2 = res.body.entries.find((e: any) => e.id === ids.P2);
    expect(p2).toMatchObject({ action: 'module.repackage', organizationId: 0, moduleId: MOD_S });
  });

  it('an action the route has never heard of is listed, with what it recorded', async () => {
    const res = await history({ moduleId: MOD_S, limit: 100 });
    const u1 = res.body.entries.find((e: any) => e.id === ids.U1);
    expect(u1).toMatchObject({
      action: 'dbte.seat_pool_resize',
      readable: true,
      reason: reason('U1'),
      changed: { moduleId: MOD_S, seats: 7 },
    });
  });

  it('the estate-wide view lists every decision of this run and omits user.status_change and ungoverned rows', async () => {
    // Paged back to the start of the seed. Other lanes write concurrently;
    // offset paging over an append-only newest-first list can repeat a row
    // across pages but never skip one, so a Set is exact.
    const seen = new Set<string>();
    let offset = 0;
    for (let page = 0; page < 200; page += 1) {
      const res = await history({ limit: 100, offset });
      expect(res.status).toBe(200);
      for (const e of res.body.entries) seen.add(e.id);
      const last = res.body.entries[res.body.entries.length - 1];
      if (!res.body.page.hasMore || !last || Date.parse(last.occurredAt) < seedStartedAt - 1000) break;
      offset += 100;
    }
    for (const l of seededOrder) expect(seen.has(ids[l]), `${l} missing`).toBe(true);
    expect(seen.has(ids.X1), 'user.status_change is not a licensing decision').toBe(false);
    expect(seen.has(ids.N1), 'a row with no governed action is not a decision').toBe(false);

    // And the excluded row really is in the store, readable by the owner.
    const { rows } = await owner.query(
      `SELECT new_values::jsonb->>'masterAdminAction' AS a FROM audit_logs WHERE id = $1`,
      [ids.X1],
    );
    expect(rows[0].a).toBe('user.status_change');
  });
});

// ─── 2. Pagination ───────────────────────────────────────────────────────────

describe('pagination', () => {
  it('total and hasMore are right on both sides of a page boundary', async () => {
    const q = { moduleId: MOD_S, organizationId: ORG_A };
    const expected = ['A3', 'U1', 'A2', 'A1'].map((l) => ids[l]);

    const p0 = await history({ ...q, limit: 3, offset: 0 });
    expect(p0.body.entries.map((e: any) => e.id)).toEqual(expected.slice(0, 3));
    expect(p0.body.page).toEqual({ limit: 3, offset: 0, returned: 3, total: 4, hasMore: true });

    const p1 = await history({ ...q, limit: 3, offset: 3 });
    expect(p1.body.entries.map((e: any) => e.id)).toEqual(expected.slice(3));
    expect(p1.body.page).toEqual({ limit: 3, offset: 3, returned: 1, total: 4, hasMore: false });

    // Exactly on the boundary: the second page ends where the set ends.
    const e0 = await history({ ...q, limit: 2, offset: 0 });
    expect(e0.body.page).toMatchObject({ returned: 2, total: 4, hasMore: true });
    const e1 = await history({ ...q, limit: 2, offset: 2 });
    expect(e1.body.entries.map((e: any) => e.id)).toEqual(expected.slice(2));
    expect(e1.body.page).toMatchObject({ returned: 2, total: 4, hasMore: false });

    // Past the end: nothing withheld, and no size claimed from an empty page.
    const past = await history({ ...q, limit: 3, offset: 4 });
    expect(past.body.entries).toEqual([]);
    expect(past.body.page).toMatchObject({ returned: 0, total: null, hasMore: false });
  });

  it('the workspace total matches an independent owner-side count of the same predicate', async () => {
    const res = await history({ organizationId: ORG_A, limit: 2 });
    const { rows } = await owner.query(
      `SELECT count(*)::int AS n FROM audit_logs
        WHERE tenant_id = $1
          AND new_values::jsonb->>'masterAdminAction' IS NOT NULL
          AND new_values::jsonb->>'masterAdminAction' NOT IN ('user.status_change', 'billing_alert.acknowledge')`,
      [ORG_A],
    );
    expect(res.body.page.total).toBe(rows[0].n);
    expect(res.body.page.hasMore).toBe(rows[0].n > 2);
    // Newest first: this run's latest ORG_A decision heads the workspace view.
    expect(res.body.entries.map((e: any) => labelOf(e.id))).toEqual(['A4', 'A3']);
  });
});

// ─── 3. Filters ──────────────────────────────────────────────────────────────

describe('filters', () => {
  it('organizationId narrows to one workspace; moduleId matches details.moduleId and the packaging record', async () => {
    const all = await history({ moduleId: MOD_S, limit: 100 });
    const onlyB = await history({ moduleId: MOD_S, organizationId: ORG_B, limit: 100 });
    expect(onlyB.body.entries.map((e: any) => labelOf(e.id))).toEqual(['B2', 'B1']);
    expect(onlyB.body.filters).toEqual({ organizationId: ORG_B, moduleId: MOD_S });
    // A narrowing, never a widening: every filtered row is in the unfiltered set.
    const allIds = new Set(all.body.entries.map((e: any) => e.id));
    for (const e of onlyB.body.entries) expect(allIds.has(e.id)).toBe(true);

    // The platform-level rows: tenant 0.
    const platform = await history({ moduleId: MOD_S, organizationId: 0, limit: 100 });
    expect(platform.body.entries.map((e: any) => labelOf(e.id))).toEqual(['P2', 'P1']);

    // A module no row names: nothing.
    const none = await history({ moduleId: `dbte_${RUN}_absent`, limit: 100 });
    expect(none.status).toBe(200);
    expect(none.body.entries).toEqual([]);
  });

  it('the filter cannot widen past the connection\'s scope: a per-user scope sees only its own workspace', async () => {
    // Same router, a non-system path: the caller-org (ORG_A) scope. Asking for
    // ORG_B through the query string cannot reach ORG_B's rows — RLS decides.
    const asB = await history({ moduleId: MOD_S, organizationId: ORG_B, limit: 100 }, `${PER_USER}/licensing/history`);
    expect(asB.status).toBe(200);
    expect(asB.body.entries).toEqual([]);
    const own = await history({ moduleId: MOD_S, limit: 100 }, `${PER_USER}/licensing/history`);
    expect(own.body.entries.map((e: any) => labelOf(e.id))).toEqual(['A3', 'U1', 'A2', 'A1']);
  });

  it('a malformed filter is refused, not silently dropped or reported as a failed read', async () => {
    // Before the fix: 'abc' and '-3'... were read as "no filter" and answered
    // with every workspace's decisions; '1.5' and an out-of-range id reached
    // the database and came back as the 500 that means "the record could not
    // be read". Neither is what the caller asked.
    const outcome: Record<string, { status: number; entries: unknown }> = {};
    for (const bad of ['abc', '1.5', '99999999999', '2147483648', '-3', '12abc']) {
      const res = await history({ organizationId: bad, moduleId: MOD_S, limit: 100 });
      outcome[bad] = { status: res.status, entries: res.body.entries === undefined ? 'absent' : 'present' };
    }
    // A repeated parameter arrives as an array: it was read as "no filter" too.
    const repeated: Array<[string, Record<string, string[]>]> = [
      ['organizationId twice', { organizationId: [String(ORG_A), String(ORG_B)] }],
      ['moduleId twice', { moduleId: [MOD_S, MOD_C] }],
    ];
    for (const [label, q] of repeated) {
      clearIntegrityCache();
      const res = await request(app).get(HISTORY).query(q);
      outcome[label] = { status: res.status, entries: res.body.entries === undefined ? 'absent' : 'present' };
    }
    const refused = { status: 400, entries: 'absent' };
    expect(outcome).toEqual({
      abc: refused,
      '1.5': refused,
      '99999999999': refused,
      // One past INTEGER's maximum: ten digits, so only the range check stops it.
      '2147483648': refused,
      '-3': refused,
      '12abc': refused,
      'organizationId twice': refused,
      'moduleId twice': refused,
    });
    // The valid edges still filter.
    expect((await history({ organizationId: ` ${ORG_B} `, moduleId: MOD_S })).status).toBe(200);
    expect((await history({ organizationId: '2147483647', moduleId: MOD_S })).body.entries).toEqual([]);
  });
});

// ─── 4. Integrity ────────────────────────────────────────────────────────────

/*
 * What the WHOLE store's chain says, per the canonical verifier, as the owner.
 *
 * The history's headline `integrity.status` summarises every tenant's chain,
 * not just this suite's, and in a shared database other suites legitimately
 * leave breaks: eight existing dbtests DELETE the audit rows they wrote during
 * cleanup, which truthfully breaks those tenants' chains. The first version of
 * these cases asserted the headline was 'verified', so they passed alone and
 * failed in the full run after one of those suites (found 2026-09-22: tenant 5,
 * a genesis row whose prev hash is not zero). The headline was RIGHT; the
 * assumption was not. So the headline is asserted to AGREE with the canonical
 * verifier over the whole store, whatever state that is, and this suite's own
 * tenants are asserted intact separately — the per-row verdicts are what an
 * operator reads, and they are judged per tenant.
 */
async function storeVerdict(): Promise<'verified' | 'broken'> {
  const { rows } = await owner.query(
    `SELECT DISTINCT tenant_id FROM audit_logs WHERE sha256_chain IS NOT NULL ORDER BY tenant_id`,
  );
  for (const r of rows) {
    const w = await verifyAuditChain(
      { query: (sql: string, a?: unknown[]) => owner.query(sql, a as unknown[]) as never },
      { tenantId: Number(r.tenant_id) },
    );
    if (!w.ok) return 'broken';
  }
  return 'verified';
}

async function expectOwnChainsIntact(): Promise<void> {
  for (const tenantId of [ORG_A, ORG_B, ORG_C, 0]) {
    const w = await verifyAuditChain(
      { query: (sql: string, a?: unknown[]) => owner.query(sql, a as unknown[]) as never },
      { tenantId },
    );
    expect(w.ok, `tenant ${tenantId} chain`).toBe(true);
  }
}

/** The headline agrees with the canonical verifier over the whole store. */
async function expectHeadlineHonest(integrity: { status: string; reason: string }): Promise<void> {
  const expected = await storeVerdict();
  expect(integrity.status).toBe(expected);
  // AUDIT_HMAC_KEY is not configured here: the honest variants.
  expect(integrity.reason).toBe(expected === 'verified' ? 'chain-verified-seals-not-configured' : 'chain-broken');
}

describe('integrity', () => {
  it('rows the verifier walked are verified, unsealed on this deployment, and the walk covered every tenant', async () => {
    const before = await chainedRowCount();
    const res = await history({ moduleId: MOD_S, limit: 100 });
    const after = await chainedRowCount();

    await expectOwnChainsIntact();
    await expectHeadlineHonest(res.body.integrity);
    for (const e of res.body.entries) {
      expect(e.integrity, labelOf(e.id)).toEqual({ chain: 'verified', seal: 'not-sealed' });
    }

    // NOT A SUBSET. chain.ts refuses a cross-tenant walk on a tenant-scoped
    // connection; under the system scope the walk must cover every chained
    // row in the store — bracketed, because other lanes write concurrently.
    // On an intact store every chained row is walked, so the count is exact
    // within the bracket. When another tenant's chain is broken, the rows past
    // its break are rightly NOT counted as checked, so only the upper bound
    // holds — and the cross-tenant assertion below still proves no subset.
    if ((await storeVerdict()) === 'verified') {
      expect(res.body.integrity.rowsChecked).toBeGreaterThanOrEqual(before);
    }
    expect(res.body.integrity.rowsChecked).toBeLessThanOrEqual(after);
    const { rows } = await owner.query(
      `SELECT count(*)::int AS n FROM audit_logs WHERE sha256_chain IS NOT NULL AND tenant_id = 0`,
    );
    expect(res.body.integrity.rowsChecked).toBeGreaterThan(rows[0].n);
  });

  it('on a tenant-scoped connection the walk refuses rather than verifying a subset', async () => {
    const res = await history({ moduleId: MOD_S, limit: 100 }, `${PER_USER}/licensing/history`);
    expect(res.status).toBe(200);
    expect(res.body.integrity).toMatchObject({ status: 'unavailable', reason: 'check-failed', rowsChecked: 0 });
    expect(res.body.entries.length).toBeGreaterThan(0);
    for (const e of res.body.entries) expect(e.integrity.chain).toBe('not-checked');
  });

  it('a tampered row does not match; later rows of ITS chain cannot be proven; earlier rows and other tenants stay verified', async () => {
    const res = await whileTampered(ids.A2, () => history({ moduleId: MOD_S, limit: 100 }));
    expect(res.status).toBe(200);
    expect(res.body.integrity).toMatchObject({ status: 'broken', reason: 'chain-broken' });

    const chain = Object.fromEntries(res.body.entries.map((e: any) => [labelOf(e.id), e.integrity.chain]));
    expect(chain).toEqual({
      A1: 'verified', // before the break in ORG_A's chain
      A2: 'broken', // the tampered row
      U1: 'after-break', // after it, same chain
      A3: 'after-break',
      // Other tenants' chains are independent (one chain per tenant): a break
      // in ORG_A says nothing about ORG_B or the platform, which were walked.
      B1: 'verified',
      B2: 'verified',
      P1: 'verified',
      P2: 'verified',
    });

    // Restored: this suite's chains are intact again, and the headline goes back
    // to whatever the rest of the store says.
    const again = await history({ moduleId: MOD_S, limit: 100 });
    await expectOwnChainsIntact();
    await expectHeadlineHonest(again.body.integrity);
    for (const e of again.body.entries) expect(e.integrity.chain, labelOf(e.id)).toBe('verified');
  });

  it('within one tenant, position is the chain order (chain_seq), not the timestamp', async () => {
    // Concurrent writers of one tenant: occurred_at is stamped BEFORE the
    // per-tenant chain lock is taken, so the chain order (chain_seq) and the
    // (occurred_at, id) order can disagree — through the real writer, not a
    // hand-made row. Find such a pair.
    let pair: { p: any; q: any } | null = null;
    for (let batch = 0; batch < 30 && !pair; batch += 1) {
      await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          runWithSystemTenantScope(`system:dbte-concurrent ${batch}-${i}`, () =>
            auditService.logAction({
              tenantId: ORG_C,
              userId: ADMIN_USER_ID,
              action: 'data_modify',
              resourceType: 'module_subscription',
              resourceId: `${ORG_C}:${MOD_C}`,
              details: { masterAdminAction: 'tenant.module_toggle', moduleId: MOD_C, enabled: i % 2 === 0, reason: reason(`C${batch}-${i}`) },
            }),
          ),
        ),
      );
      const { rows } = await owner.query(
        `SELECT id, occurred_at, chain_seq FROM audit_logs
          WHERE tenant_id = $1 AND new_values::jsonb->>'moduleId' = $2
          ORDER BY chain_seq`,
        [ORG_C, MOD_C],
      );
      const rs = rows.map((r) => ({ id: String(r.id), at: new Date(r.occurred_at).getTime(), seq: Number(r.chain_seq) }));
      for (let i = 0; i < rs.length && !pair; i += 1) {
        for (let j = i + 1; j < rs.length; j += 1) {
          // rs[i] precedes rs[j] in the chain, but rs[j] precedes rs[i] by time.
          if (writeOrderLess(rs[j], rs[i])) {
            pair = { p: rs[i], q: rs[j] };
            break;
          }
        }
      }
    }
    expect(pair, 'no chain-order / time-order disagreement produced by concurrent writers').not.toBeNull();
    const { p, q } = pair!;

    const { res, walk } = await whileTampered(p.id, async () => {
      const r = await history({ moduleId: MOD_C, organizationId: ORG_C, limit: 100 });
      // The canonical verifier, as the owner: where does ORG_C's chain break?
      const w = await verifyAuditChain(
        { query: (s: string, a?: unknown[]) => owner.query(s, a as unknown[]) as never },
        { tenantId: ORG_C },
      );
      return { res: r, walk: w };
    });
    // The canonical walk breaks at p, so nothing after p in ORG_C's chain —
    // q included — was linked by it.
    expect(walk.ok).toBe(false);
    expect(walk.brokenAt?.id).toBe(p.id);

    const { rows: seqs } = await owner.query(
      `SELECT id, chain_seq FROM audit_logs WHERE id = ANY($1::uuid[])`,
      [res.body.entries.map((e: any) => e.id)],
    );
    const seqOf = new Map<string, number>(seqs.map((r) => [String(r.id), Number(r.chain_seq)] as [string, number]));
    const byId = new Map<string, string>(res.body.entries.map((e: any) => [e.id, e.integrity.chain] as [string, string]));
    expect(byId.get(p.id)).toBe('broken');
    // THE CLAIM UNDER TEST: q sits after the break in its chain. It must not
    // be reported as verified merely because its timestamp is earlier.
    expect(byId.get(q.id)).toBe('after-break');
    for (const e of res.body.entries) {
      const s = seqOf.get(e.id)!;
      if (s < p.seq) expect(e.integrity.chain).toBe('verified');
      if (s > p.seq) expect(e.integrity.chain).toBe('after-break');
    }
  });

  it('a row written after the verification ran is never reported as verified by it', async () => {
    // Load once: the walk runs and is memoised.
    const first = await history({ organizationId: ORG_A, limit: 5 });
    await expectOwnChainsIntact();
    await expectHeadlineHonest(first.body.integrity);

    // A new decision, tampered at once — then the same view reloaded inside the
    // memo window (no clearIntegrityCache here).
    const id = await seed('A5', {
      tenantId: ORG_A,
      userId: ADMIN_USER_ID,
      action: 'data_modify',
      resourceType: 'organization',
      resourceId: String(ORG_A),
      details: { masterAdminAction: 'tenant.tier_change', previousTier: 'professional', tier: 'enterprise' },
    });
    const res = await whileTampered(id, () =>
      request(app).get(HISTORY).query({ organizationId: ORG_A, limit: 5 }),
    );
    const a5 = res.body.entries.find((e: any) => e.id === id);
    expect(a5).toBeDefined();
    // The memoised walk never saw this row; it cannot vouch for it.
    expect(a5.integrity.chain).not.toBe('verified');
    expect(a5.integrity.chain).toBe('broken');
  });
});

// ─── 5. A failed read is a 500 ───────────────────────────────────────────────

describe('a failed read', () => {
  it('is a 500 with no entries when the store refuses the read', async () => {
    await owner.query(`REVOKE SELECT ON audit_logs FROM ${scratch.runtimeRole}`);
    try {
      const { rows } = await owner.query(
        `SELECT has_table_privilege($1, 'audit_logs', 'SELECT') AS ok`,
        [scratch.runtimeRole],
      );
      expect(rows[0].ok, 'precondition: the runtime role has lost SELECT').toBe(false);
      const res = await history({ moduleId: MOD_S });
      expect(res.status).toBe(500);
      expect(res.body.entries).toBeUndefined();
      expect(res.body.error).toBeTruthy();
      expect(JSON.stringify(res.body)).not.toMatch(/permission denied|audit_logs/);
    } finally {
      await owner.query(`GRANT SELECT ON audit_logs TO ${scratch.runtimeRole}`);
    }
    const ok = await history({ moduleId: MOD_S });
    expect(ok.status).toBe(200);
  });

  it('is a 500 when mounted with no tenant scope (the pool fails closed under RLS_ENFORCE=on)', async () => {
    const res = await history({ moduleId: MOD_S }, HISTORY, bareApp);
    expect(res.status).toBe(500);
    expect(res.body.entries).toBeUndefined();
  });
});
