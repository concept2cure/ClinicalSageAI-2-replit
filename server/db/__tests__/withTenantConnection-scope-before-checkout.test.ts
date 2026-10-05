/**
 * withTenantConnection must enter its own scope BEFORE it checks out a client.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * withTenantConnection called `pool.connect()` first and only then entered
 * `runWithTenantScope(scope, ...)` around the callback. Under RLS_ENFORCE=on
 * (the only mode production boots in) the instrumented pool refuses a checkout
 * that has no active tenant scope (poolInstrumentation.ts, "FAIL-CLOSED:
 * pool.connect"). A caller that brings no ambient scope — the nightly AnA
 * memory-consolidation job is exactly that — therefore failed on every run,
 * before any of its own tenant setup could happen.
 *
 * Callers that already run inside a scope (the request-path callers in
 * audit-trail-ledger.routes.ts and c2c/actions.ts) never saw it, which is why
 * it survived: the checkout borrowed the REQUEST's scope. That borrowing is the
 * second half of this suite — the checkout must carry the scope the caller asked
 * withTenantConnection for, not whatever happened to be ambient.
 *
 * These tests drive the real instrumentPool over a fake driver pool so the
 * failure is the production refusal, not an imitation of it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const driverLog: Array<{ sql: string; params?: unknown[] }> = [];

// The instrumentation's client wrapper swaps `query`/`release` for its own and
// restores BOUND copies on release, so the spies are held separately and the
// client is rebuilt before each test.
const driverRelease = vi.fn();
const driverQuery = vi.fn(async (sql: string, params?: unknown[]) => {
  driverLog.push({ sql, params });
  return { rows: [], rowCount: 0 };
});
const fakeClient: any = {};

// Kept as its own reference: instrumentPool replaces `driverPool.connect` with
// the enforcing wrapper, and this spy is the driver underneath it.
const driverConnect = vi.fn(async () => fakeClient);
const driverPool: any = {
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  connect: driverConnect,
};

vi.mock('../runtime', () => ({ getPool: () => driverPool }));

import { instrumentPool } from '../poolInstrumentation';
import { withTenantConnection } from '../withTenantConnection';
import { getTenantScope, runWithTenantScope } from '../tenantStore';

const TENANT_LOCAL_SQL_PREFIX = "SELECT set_config('app.current_tenant_id', $1, true)";

let previousEnforce: string | undefined;

beforeAll(() => {
  previousEnforce = process.env.RLS_ENFORCE;
  process.env.RLS_ENFORCE = 'on';
  instrumentPool(driverPool);
});

afterAll(() => {
  if (previousEnforce === undefined) delete process.env.RLS_ENFORCE;
  else process.env.RLS_ENFORCE = previousEnforce;
});

beforeEach(() => {
  driverLog.length = 0;
  driverRelease.mockClear();
  fakeClient.query = driverQuery;
  fakeClient.release = driverRelease;
  fakeClient.__tenantScopeWrapped = false;
  driverConnect.mockClear();
});

describe('a caller with NO ambient tenant scope (the nightly consolidation job)', () => {
  it('CONTROL: the instrumented pool refuses an unscoped checkout under RLS_ENFORCE=on', async () => {
    // Without this, the test below could pass against a pool that never
    // enforced anything and would prove nothing about withTenantConnection.
    await expect(driverPool.connect()).rejects.toThrow(/FAIL-CLOSED: pool\.connect/);
  });

  it('gets a connection, runs the callback, and releases it', async () => {
    expect(getTenantScope()).toBeUndefined();

    const out = await withTenantConnection(
      { tenantId: '0', role: 'app_super_admin', source: 'job', caller: 'test:no-ambient-scope' },
      async client => {
        await client.query('SELECT 42');
        return getTenantScope()?.caller;
      },
    );

    expect(out).toBe('test:no-ambient-scope');
    expect(driverConnect).toHaveBeenCalledTimes(1);
    expect(driverRelease).toHaveBeenCalledTimes(1);
    expect(driverRelease).toHaveBeenCalledWith(undefined);
  });
});

describe('the checkout carries the scope withTenantConnection was asked for', () => {
  it('a transaction opened inside the callback gets the requested tenant, not the ambient one', async () => {
    // Ambient: a request in tenant 5 as an ordinary member. Requested: the
    // super-admin scope the audit-chain verifier asks for.
    await runWithTenantScope({ tenantId: '5', role: 'member', source: 'request', caller: 'req' }, () =>
      withTenantConnection({ tenantId: '0', role: 'app_super_admin', caller: 'verifier' }, async client => {
        await client.query('BEGIN');
        await client.query('COMMIT');
      }),
    );

    const local = driverLog.find(e => e.sql.startsWith(TENANT_LOCAL_SQL_PREFIX));
    expect(local, 'BEGIN must be followed by the LOCAL tenant vars').toBeDefined();
    expect(local!.params).toEqual(['0', '', 'app_super_admin', '']);
  });
});

describe('request-path callers that already hold a scope keep today\'s behaviour', () => {
  it('same session set_config sequence, callback sees the requested scope, ambient scope restored', async () => {
    let inside: ReturnType<typeof getTenantScope>;
    let after: ReturnType<typeof getTenantScope>;

    await runWithTenantScope({ tenantId: '5', role: 'member', source: 'request', caller: 'req' }, async () => {
      await withTenantConnection(
        { tenantId: '0', role: 'app_super_admin', source: 'request', caller: 'c2c/actions/verify-chain' },
        async client => {
          inside = getTenantScope();
          await client.query('SELECT 1 FROM audit_logs');
        },
      );
      after = getTenantScope();
    });

    expect(inside).toMatchObject({ tenantId: '0', role: 'app_super_admin', caller: 'c2c/actions/verify-chain' });
    expect(after).toMatchObject({ tenantId: '5', role: 'member', caller: 'req' });
    expect(driverLog.map(e => e.sql)).toEqual([
      "SELECT set_config('app.current_tenant_id', $1, false)",
      "SELECT set_config('app.current_org_id', $1, false)",
      "SELECT set_config('app.current_user_role', $1, false)",
      'SELECT 1 FROM audit_logs',
      "SELECT set_config('app.current_tenant_id', '', false)",
      "SELECT set_config('app.current_org_id', '', false)",
      "SELECT set_config('app.current_user_role', '', false)",
    ]);
    expect(driverRelease).toHaveBeenCalledWith(undefined);
  });
});
