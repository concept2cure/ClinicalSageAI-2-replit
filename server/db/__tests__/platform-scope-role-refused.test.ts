/**
 * The platform role string never opens a tenant, per-user or request scope
 * (D6, P-72 slice 1a; docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1a/).
 *
 * About 977 tenant policies admit every row when `app.current_user_role` is
 * 'app_super_admin'. Until P-72 retires that arm, the role string a scope
 * carries is the platform scope. Measured in slice 0, as app_service with
 * RLS_ENFORCE=on: a tenant-A scope whose role string was 'app_super_admin' read
 * B's tasks, audit trail, users and legal holds, updated B's task, and wrote the
 * string onto A's own membership. So:
 *
 *   - runWithTenantScope refuses it on every scope but the system scope's own
 *     shape (tenant '0', no organization, no bound account), before the
 *     callback runs. runWithSystemTenantScope and the explicit tenant-'0'
 *     platform scopes still open;
 *   - the instrumented pool re-checks the scope it is about to send, so a scope
 *     object changed after it was entered reaches no connection.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'platform-scope-role-test-secret-padded-32+';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

import { instrumentPool } from '../poolInstrumentation';
import {
  getTenantScope,
  runWithSystemTenantScope,
  runWithTenantScope,
  type TenantScope,
} from '../tenantStore';
import { withTenantConnection } from '../withTenantConnection';

function makeMockPool() {
  const calls: string[] = [];
  const params: unknown[] = [];
  const client: any = {
    query: vi.fn((text: unknown, p?: unknown) => {
      calls.push(typeof text === 'string' ? text : (text as any)?.text ?? '');
      if (Array.isArray(p)) params.push(p);
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
    release: vi.fn(),
  };
  const pool: any = {
    query: vi.fn(async (text: unknown) => {
      calls.push(`pool:${String(text)}`);
      return { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(() => Promise.resolve(client)),
    on: vi.fn(),
  };
  const rawConnect = pool.connect;
  instrumentPool(pool);
  return { pool, client, calls, params, rawConnect };
}

const REFUSED = /platform role 'app_super_admin' is refused/;

beforeEach(() => {
  process.env.RLS_ENFORCE = 'on';
});
afterEach(() => {
  delete process.env.RLS_ENFORCE;
  vi.restoreAllMocks();
});

describe('runWithTenantScope refuses the platform role string outside the system scope', () => {
  const cases: Array<[string, TenantScope]> = [
    ["a tenant's request scope", { tenantId: '7', orgUuid: 'uuid-7', role: 'app_super_admin', source: 'request', caller: 't' }],
    ['a tenant scope with no organization uuid', { tenantId: '7', role: 'app_super_admin', source: 'request', caller: 't' }],
    ['the string cased or padded', { tenantId: '7', role: ' App_Super_Admin ', source: 'request', caller: 't' }],
    ["tenant '0' that names an organization", { tenantId: '0', orgUuid: 'uuid-7', role: 'app_super_admin', source: 'request', caller: 't' }],
    ["tenant '0' bound to an account", { tenantId: '0', role: 'app_super_admin', accountId: 5, source: 'request', caller: 't' }],
    ["tenant '0' with the string padded", { tenantId: '0', role: 'APP_SUPER_ADMIN', source: 'job', caller: 't' }],
  ];
  for (const [name, scope] of cases) {
    it(`refuses ${name}, before the callback runs`, () => {
      const fn = vi.fn();
      expect(() => runWithTenantScope(scope, fn)).toThrow(REFUSED);
      expect(fn).not.toHaveBeenCalled();
    });
  }

  it('refuses it through withTenantConnection, before any checkout', async () => {
    const fn = vi.fn();
    await expect(withTenantConnection({ tenantId: 7, role: 'app_super_admin' }, fn)).rejects.toThrow(REFUSED);
    expect(fn).not.toHaveBeenCalled();
  });

  it('opens an ordinary role, and the system scope by its helper or its explicit shape', () => {
    expect(runWithTenantScope({ tenantId: '7', role: 'admin', source: 'request', caller: 't' }, () => getTenantScope()?.role)).toBe('admin');
    expect(runWithSystemTenantScope('platform-scope-role.test', () => getTenantScope())).toMatchObject({ tenantId: '0', role: 'app_super_admin' });
    // The explicit platform scopes (public-api, sso, firecrawl-webhooks, the chain verdicts) use this shape.
    expect(runWithTenantScope({ tenantId: '0', role: 'app_super_admin', source: 'request', caller: 't' }, () => getTenantScope()?.tenantId)).toBe('0');
  });
});

describe('the instrumented pool sends no scope that carries the platform role outside the system scope', () => {
  it('refuses a pooled statement whose scope was changed after it was entered, taking no connection', async () => {
    const { pool, calls, rawConnect } = makeMockPool();
    await runWithTenantScope({ tenantId: '7', orgUuid: 'uuid-7', role: 'admin', source: 'request', caller: 't' }, async () => {
      getTenantScope()!.role = 'app_super_admin';
      await expect(pool.query('SELECT 1 FROM unified_tasks')).rejects.toThrow(REFUSED);
      await expect(pool.connect()).rejects.toThrow(REFUSED);
    });
    expect(rawConnect).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('refuses the scope at BEGIN on a client checked out before the change', async () => {
    const { pool, params } = makeMockPool();
    await runWithTenantScope({ tenantId: '7', orgUuid: 'uuid-7', role: 'admin', source: 'request', caller: 't' }, async () => {
      const client = await pool.connect();
      getTenantScope()!.role = 'app_super_admin';
      await expect(client.query('BEGIN')).rejects.toThrow(REFUSED);
      client.release();
    });
    // The tenant vars were never sent with the platform role.
    expect(params.some((p) => Array.isArray(p) && p.includes('app_super_admin'))).toBe(false);
  });

  it('sends the system scope as it is, and an ordinary scope with its role', async () => {
    const { pool, params } = makeMockPool();
    await runWithSystemTenantScope('platform-scope-role.test', () => pool.query('SELECT 1 FROM unified_tasks'));
    await runWithTenantScope({ tenantId: '7', role: 'admin', source: 'request', caller: 't' }, () => pool.query('SELECT 1 FROM unified_tasks'));
    expect(params).toEqual([
      ['0', '', 'app_super_admin', ''],
      ['7', '', 'admin', ''],
    ]);
  });
});
