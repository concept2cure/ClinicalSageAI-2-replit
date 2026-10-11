/**
 * A pooled runtime connection cannot carry an isolation switch to the next
 * request (D3, 2026-10-08).
 *
 * ── What was wrong ─────────────────────────────────────────────────────────
 * Every tenant policy grants all rows when `app.rls_enforce` is not 'on', and
 * the four identity.can_* helpers grant when `app.bypass_rls` is 'true'.
 * Production turns enforcement on only in the connection's startup packet
 * (server/db/rlsEnforcement.ts), so a session-level `SET app.rls_enforce =
 * 'off'` on a runtime connection, from a bug or an injected statement, lasts
 * as long as the connection does. The per-request cleanups reset only the
 * three tenant variables, and nothing resets the switches, so the connection
 * went back to the pool with isolation off, and the next request, from any
 * tenant, read every tenant's rows.
 *
 * Measured here on PostgreSQL as the runtime role, through the real
 * primitives: a one-connection copy of production's runtime pool (the same
 * startup option and the same instrumentation), the lazy request client the
 * request scope uses, and the instrumented pool's own query and transaction
 * paths. The first case is the control: it shows the switch really does
 * survive a bare release, so the rest prove something.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import { provisionAppServiceRole } from '../../scripts/db/provision-app-role.mjs';

const RUNTIME_ROLE = process.env.APP_SERVICE_DB_ROLE || 'app_service';
const RUNTIME_PASSWORD = 'isolation-switch-runtime-pw-0001';
const TAG = `isw_${process.pid}_${Date.now().toString(36)}`;
const ORG_A = 90811;
const ORG_B = 90812;

let owner: Pool;
let runtime: Pool;
let LazyRequestDbClient: typeof import('../../server/middleware/lazyRequestDbClient').LazyRequestDbClient;
let applySessionScope: (c: PoolClient, s: { tenantId: string; role?: string | null; orgUuid?: string | null }) => Promise<void>;
let runWithTenantScope: typeof import('../../server/db/tenantStore').runWithTenantScope;

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  for (let attempt = 1; ; attempt++) {
    try {
      await provisionAppServiceRole(owner, { env: { APP_SERVICE_DB_ROLE: RUNTIME_ROLE, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD } });
      break;
    } catch (err) {
      if (attempt >= 5 || !/tuple concurrently updated/.test((err as Error).message)) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  await owner.query(
    `INSERT INTO organizations (id, name, slug) VALUES ($1, $3, $3 || '-a'), ($2, $3, $3 || '-b') ON CONFLICT (id) DO NOTHING`,
    [ORG_A, ORG_B, TAG],
  );
  await owner.query(
    `INSERT INTO regulatory_programs (organization_id, name, code, program_type, product_type, primary_agency, product_name)
     VALUES ($1, 'A', $3 || '-A', 'ind', 'drug', 'FDA', 'a'), ($2, 'B', $3 || '-B', 'ind', 'drug', 'FDA', 'b')`,
    [ORG_A, ORG_B, TAG],
  );

  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = RUNTIME_ROLE;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';

  const { buildRlsStartupOptions } = await import('../../server/db/rlsEnforcement');
  const { instrumentPool } = await import('../../server/db/poolInstrumentation');
  // Production's runtime pool, at one connection, so the connection a case
  // poisons is the one the next request gets.
  runtime = new Pool({ connectionString: runtimeUrl.toString(), max: 1, options: buildRlsStartupOptions(process.env) });
  instrumentPool(runtime);
  ({ LazyRequestDbClient } = await import('../../server/middleware/lazyRequestDbClient'));
  ({ applySessionScope } = await import('../../server/db/sessionScope'));
  ({ runWithTenantScope } = await import('../../server/db/tenantStore'));
});

afterAll(async () => {
  await runtime?.end();
  if (owner) {
    await owner.query(`DELETE FROM regulatory_programs WHERE code LIKE $1`, [`${TAG}-%`]);
    await owner.query(`DELETE FROM organizations WHERE id = ANY($1::int[]) AND name = $2`, [[ORG_A, ORG_B], TAG]);
    await owner.end();
  }
});

const fixturePrograms = "SELECT string_agg(name, ',' ORDER BY name) AS names FROM regulatory_programs WHERE code LIKE $1";

/** Run `fn` in a tenant scope, as a request or job does; the instrumented pool refuses a checkout outside one. */
const inScope = <T>(orgId: number, fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: String(orgId), role: null, orgUuid: null, source: 'test', caller: 'isolation-switch' }, fn);

/** One request, as the request scope runs it: a lazy client with the tenant applied, then released. */
function request<T>(orgId: number, work: (q: InstanceType<typeof LazyRequestDbClient>) => Promise<T>): Promise<T> {
  return inScope(orgId, async () => {
    const lazy = new LazyRequestDbClient(runtime, (c) => applySessionScope(c, { tenantId: String(orgId) }));
    try {
      return await work(lazy);
    } finally {
      await lazy.release();
    }
  });
}

const programsSeenBy = (orgId: number) =>
  request(orgId, async (q) => (await q.query(fixturePrograms, [`${TAG}-%`])).rows[0].names as string | null);

/** Poison the pool's one connection with `sql` and release it with no cleanup at all. */
const poisonAndBareRelease = (orgId: number, sql: string) =>
  inScope(orgId, async () => {
    const c = await runtime.connect();
    await c.query(sql);
    c.release();
  });

describe('an isolation switch set during one request does not reach the next', () => {
  it('CONTROL: a bare release does carry a session switch to the next checkout', async () => {
    await poisonAndBareRelease(ORG_A, "SET app.rls_enforce = 'off'");
    const leaked = await inScope(ORG_B, async () => {
      const next = await runtime.connect();
      try {
        return (await next.query("SELECT current_setting('app.rls_enforce', true) AS v")).rows[0].v;
      } finally {
        await next.query('RESET app.rls_enforce');
        next.release();
      }
    });
    expect(leaked, 'the leak this suite exists to close must be real').toBe('off');
  });

  it('each tenant sees only its own program, before anything is switched', async () => {
    expect(await programsSeenBy(ORG_A)).toBe('A');
    expect(await programsSeenBy(ORG_B)).toBe('B');
  });

  it("a request that turns rls_enforce off leaves the next tenant's request isolated", async () => {
    await request(ORG_A, (q) => q.query("SET app.rls_enforce = 'off'"));
    expect(await programsSeenBy(ORG_B)).toBe('B');
  });

  it('a request that sets app.bypass_rls and app.is_admin leaves neither for the next request', async () => {
    await request(ORG_A, (q) => q.query("SET app.bypass_rls = 'true'; SET app.is_admin = 'true'"));
    const flags = await request(ORG_B, async (q) => (await q.query(
      "SELECT current_setting('app.rls_enforce', true) AS e, coalesce(current_setting('app.bypass_rls', true), '') AS b, coalesce(current_setting('app.is_admin', true), '') AS a",
    )).rows[0]);
    expect(flags).toEqual({ e: 'on', b: '', a: '' });
  });

  it('the request client clears the switches on release, before any next borrower applies anything', async () => {
    await request(ORG_A, (q) => q.query("SET app.rls_enforce = 'off'; SET app.bypass_rls = 'true'; SET app.is_admin = 'true'"));
    // A bare checkout: no scope applied, so this reads exactly what the release left.
    const left = await inScope(ORG_B, async () => {
      const c = await runtime.connect();
      try {
        return (await c.query(
          "SELECT current_setting('app.rls_enforce', true) AS e, coalesce(current_setting('app.bypass_rls', true), '') AS b, " +
            "coalesce(current_setting('app.is_admin', true), '') AS a, coalesce(current_setting('app.current_tenant_id', true), '') AS t",
        )).rows[0];
      } finally {
        c.release();
      }
    });
    expect(left).toEqual({ e: 'on', b: '', a: '', t: '' });
  });

  it('a switch left on a connection by any path is pinned when the next request applies its scope', async () => {
    await poisonAndBareRelease(ORG_A, "SET app.rls_enforce = 'off'; SET app.bypass_rls = 'true'");
    expect(await programsSeenBy(ORG_B)).toBe('B');
  });

  it("the instrumented pool's own statements run isolated on a poisoned connection", async () => {
    await poisonAndBareRelease(ORG_A, "SET app.rls_enforce = 'off'");
    const seen = await inScope(ORG_B, async () => (await runtime.query(fixturePrograms, [`${TAG}-%`])).rows[0].names);
    expect(seen).toBe('B');
  });
});
