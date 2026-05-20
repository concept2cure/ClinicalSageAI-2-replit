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
import { getTenantScope } from '../tenantStore';

beforeEach(() => {
  fakeClient.query.mockReset();
  fakeClient.release.mockReset();
  fakePool.connect.mockClear();
  fakeClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('withTenantConnection', () => {
  it('sets app.current_tenant_id, app.current_org_id, and app.current_user_role before the callback runs', async () => {
    let queriesAtCallbackTime: any[] = [];
    await withTenantConnection(
      { tenantId: 42, orgUuid: 'uuid-x', role: 'member' },
      async () => {
        // Snapshot the query log at callback time so we know the SET
        // happened BEFORE us, not after.
        queriesAtCallbackTime = [...fakeClient.query.mock.calls];
      }
    );

    const sets = queriesAtCallbackTime.map(c => c[0]);
    expect(sets).toContain("SELECT set_config('app.current_tenant_id', $1, false)");
    expect(sets).toContain("SELECT set_config('app.current_org_id', $1, false)");
    expect(sets).toContain("SELECT set_config('app.current_user_role', $1, false)");

    // Values were what we passed.
    const values = queriesAtCallbackTime.map(c => c[1]);
    expect(values).toContainEqual(['42']);
    expect(values).toContainEqual(['uuid-x']);
    expect(values).toContainEqual(['member']);
  });

  it('makes the tenant scope visible to getTenantScope inside the callback', async () => {
    let scopeInside: ReturnType<typeof getTenantScope>;
    await withTenantConnection(
      { tenantId: '7', source: 'cli', caller: 'test' },
      async () => {
        scopeInside = getTenantScope();
      }
    );
    expect(scopeInside?.tenantId).toBe('7');
    expect(scopeInside?.source).toBe('cli');
    expect(scopeInside?.caller).toBe('test');
  });

  it('clears the session vars and releases the client even when the callback throws', async () => {
    await expect(
      withTenantConnection({ tenantId: '1' }, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    // The cleanup queries fire after the throw.
    const cleared = fakeClient.query.mock.calls.filter(
      c => c[0] === "SELECT set_config('app.current_tenant_id', '', false)"
    );
    expect(cleared.length).toBe(1);
    expect(fakeClient.release).toHaveBeenCalledTimes(1);
  });

  it('passes role="app_super_admin" through to the session var (cross-tenant scan path)', async () => {
    await withTenantConnection(
      { tenantId: '0', role: 'app_super_admin' },
      async () => undefined
    );

    const setRole = fakeClient.query.mock.calls.find(
      c => c[0] === "SELECT set_config('app.current_user_role', $1, false)" && c[1]?.[0] === 'app_super_admin'
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
  });
});
