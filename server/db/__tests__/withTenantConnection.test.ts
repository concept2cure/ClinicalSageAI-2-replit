import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock `./runtime` so withTenantConnection grabs a fake client instead
// of trying to connect to a real Postgres. The fake records every query so
// we can assert on the order of set_config calls.

const fakeClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const fakePool = {
  connect: vi.fn(() => Promise.resolve(fakeClient)),
};

vi.mock('../runtime', () => ({
  getPool: () => fakePool,
}));

import { withTenantConnection } from '../withTenantConnection';
import { CLEAR_SESSION_SCOPE_SQL, RESET_ENFORCEMENT_SQL } from '../sessionScope';
import { getTenantScope, runWithSystemTenantScope } from '../tenantStore';

beforeEach(() => {
  fakeClient.query.mockReset();
  fakeClient.release.mockReset();
  fakePool.connect.mockClear();
  fakeClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('withTenantConnection', () => {
  it('provides a named, least-privilege system scope for cross-tenant jobs', async () => {
    await runWithSystemTenantScope('test-sweep', async () => {
      expect(getTenantScope()).toEqual({
        tenantId: '0',
        role: 'app_super_admin',
        source: 'job',
        caller: 'test-sweep',
      });
    });
  });
  it('sets app.current_tenant_id, app.current_org_id, and app.current_user_role before the callback runs', async () => {
    let queriesAtCallbackTime: any[] = [];
    await withTenantConnection({ tenantId: 42, orgUuid: 'uuid-x', role: 'member' }, async () => {
      // Snapshot the query log at callback time so we know the SET
      // happened BEFORE us, not after.
      queriesAtCallbackTime = [...fakeClient.query.mock.calls];
    });

    // One statement: the three tenant variables and the isolation-switch pins
    // (server/db/sessionScope.ts), with the values we passed.
    expect(queriesAtCallbackTime).toHaveLength(1);
    const [sql, values] = queriesAtCallbackTime[0];
    for (const v of ['app.current_tenant_id', 'app.current_user_role', 'app.current_org_id', 'app.rls_enforce', 'app.bypass_rls', 'app.is_admin']) {
      expect(sql).toContain(`set_config('${v}'`);
    }
    expect(values).toEqual(['42', 'member', 'uuid-x']);
  });

  it('makes the tenant scope visible to getTenantScope inside the callback', async () => {
    let scopeInside: ReturnType<typeof getTenantScope>;
    await withTenantConnection({ tenantId: '7', source: 'cli', caller: 'test' }, async () => {
      scopeInside = getTenantScope();
    });
    expect(scopeInside?.tenantId).toBe('7');
    expect(scopeInside?.source).toBe('cli');
    expect(scopeInside?.caller).toBe('test');
  });

  it('clears the session vars and releases the client even when the callback throws', async () => {
    const callbackError = new Error('boom');
    await expect(
      withTenantConnection({ tenantId: '1' }, async () => {
        throw callbackError;
      })
    ).rejects.toThrow('boom');

    // The cleanup queries fire after the throw.
    const sql = fakeClient.query.mock.calls.map(c => c[0]);
    expect(sql.slice(-2)).toEqual([CLEAR_SESSION_SCOPE_SQL, RESET_ENFORCEMENT_SQL]);
    expect(fakeClient.release).toHaveBeenCalledTimes(1);
    expect(fakeClient.release).toHaveBeenCalledWith(callbackError);
  });

  it('evicts when tenant session setup fails (one statement: a failed apply sets nothing)', async () => {
    const setupError = new Error('setup failed');
    fakeClient.query.mockRejectedValueOnce(setupError);

    await expect(
      withTenantConnection({ tenantId: '1' }, async () => 'unreachable'),
    ).rejects.toBe(setupError);

    expect(fakeClient.release).toHaveBeenCalledWith(setupError);
  });

  it('evicts when tenant session cleanup fails', async () => {
    const cleanupError = new Error('cleanup failed');
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql === CLEAR_SESSION_SCOPE_SQL) throw cleanupError;
      return { rows: [], rowCount: 0 };
    });

    await withTenantConnection({ tenantId: '1' }, async () => 'ok');

    expect(fakeClient.release).toHaveBeenCalledWith(cleanupError);
  });

  it('passes role="app_super_admin" through to the session var (cross-tenant scan path)', async () => {
    await withTenantConnection({ tenantId: '0', role: 'app_super_admin' }, async () => undefined);

    const setRole = fakeClient.query.mock.calls.find(
      c => String(c[0]).includes("set_config('app.current_user_role', $2, false)") && c[1]?.[1] === 'app_super_admin'
    );
    expect(setRole, 'super-admin role must be propagated to the connection').toBeDefined();
  });

  it('rejects an empty tenantId before touching the pool', async () => {
    await expect(withTenantConnection({ tenantId: '' }, async () => 'unreachable')).rejects.toThrow(
      /tenantId is required/
    );
    expect(fakePool.connect).not.toHaveBeenCalled();
  });

  it('returns the callback result', async () => {
    const out = await withTenantConnection({ tenantId: '1' }, async () => ({ ok: true }));
    expect(out).toEqual({ ok: true });
    expect(fakeClient.release).toHaveBeenCalledWith(undefined);
  });
});
