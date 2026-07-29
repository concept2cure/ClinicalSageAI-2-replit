/**
 * Tests for the tenant-scope enforcement layer added to instrumentPool
 * (RLS rollout PR B — server/db/poolInstrumentation.ts).
 *
 * These verify the WRAPPING MECHANISM against a mock pool: that when — and only
 * when — RLS_ENFORCE=on and a tenant scope is active, a pooled query runs inside
 * a micro-transaction that first applies the tenant vars LOCAL, and that the
 * transaction path (pool.connect + BEGIN) injects the same vars. Actual RLS
 * row-filtering against a live policy is covered separately by an integration
 * test (needs real Postgres with migrations/0021 applied).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'pool-instrumentation-test-secret-padded-32+';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

import { instrumentPool } from '../poolInstrumentation';
import { runWithTenantScope, type TenantScope } from '../tenantStore';

const SET_CONFIG_RE = /set_config\('app\.current_tenant_id'/;

function textOf(arg: unknown): string {
  return typeof arg === 'string' ? arg : ((arg as any)?.text ?? '');
}

function makeMockPool() {
  const clientCalls: Array<{ text: string; params?: unknown }> = [];
  const client: any = {
    query: vi.fn(async (text: unknown, params?: unknown) => {
      clientCalls.push({ text: textOf(text), params });
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  const poolCalls: Array<{ text: string; params?: unknown }> = [];
  const pool: any = {
    query: vi.fn(async (text: unknown, params?: unknown) => {
      poolCalls.push({ text: textOf(text), params });
      return { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => client),
    on: vi.fn(),
  };
  instrumentPool(pool);
  return { pool, client, clientCalls, poolCalls };
}

const SCOPE: TenantScope = {
  tenantId: '42',
  orgUuid: 'org-uuid-42',
  role: '',
  source: 'job',
  caller: 'test',
};

beforeEach(() => {
  delete process.env.RLS_ENFORCE;
});
afterEach(() => {
  delete process.env.RLS_ENFORCE;
  vi.restoreAllMocks();
});

describe('poolInstrumentation tenant-scope enforcement', () => {
  it('is INERT while RLS_ENFORCE is off — delegates straight to pool.query, no transaction', async () => {
    const { pool, poolCalls, clientCalls } = makeMockPool();
    // enforce unset (off), even with a scope present
    await runWithTenantScope(SCOPE, () => pool.query('SELECT * FROM projects'));
    expect(poolCalls.map(c => c.text)).toEqual(['SELECT * FROM projects']);
    expect(clientCalls).toHaveLength(0);
  });

  it('is inert when enforcing but NO tenant scope is set', async () => {
    process.env.RLS_ENFORCE = 'on';
    const { pool, poolCalls, clientCalls } = makeMockPool();
    await pool.query('SELECT * FROM projects'); // no runWithTenantScope
    expect(poolCalls.map(c => c.text)).toEqual(['SELECT * FROM projects']);
    expect(clientCalls).toHaveLength(0);
  });

  it('wraps a pooled query in a scoped micro-transaction when enforcing + scoped', async () => {
    process.env.RLS_ENFORCE = 'on';
    const { pool, poolCalls, clientCalls } = makeMockPool();
    await runWithTenantScope(SCOPE, () =>
      pool.query('SELECT * FROM projects WHERE id = $1', [7]),
    );
    // The statement did NOT go out on the shared pool.query...
    expect(poolCalls).toHaveLength(0);
    // ...it ran on a checked-out client: BEGIN -> set_config LOCAL -> query -> COMMIT.
    const texts = clientCalls.map(c => c.text);
    expect(texts[0]).toBe('BEGIN');
    expect(texts[1]).toMatch(SET_CONFIG_RE);
    expect(texts[2]).toBe('SELECT * FROM projects WHERE id = $1');
    expect(texts[3]).toBe('COMMIT');
    // tenant vars carried the active scope
    expect(clientCalls[1].params).toEqual(['42', 'org-uuid-42', '']);
  });

  it('does NOT wrap infrastructure queries even when enforcing + scoped', async () => {
    process.env.RLS_ENFORCE = 'on';
    const { pool, poolCalls, clientCalls } = makeMockPool();
    await runWithTenantScope(SCOPE, () => pool.query('SELECT 1'));
    expect(poolCalls.map(c => c.text)).toEqual(['SELECT 1']);
    expect(clientCalls).toHaveLength(0);
  });

  it('releases the client after a scoped query (even on error) so no connection leaks', async () => {
    process.env.RLS_ENFORCE = 'on';
    const { pool, client } = makeMockPool();
    client.query.mockImplementationOnce(async () => ({ rows: [], rowCount: 0 })); // BEGIN
    client.query.mockImplementationOnce(async () => ({ rows: [], rowCount: 0 })); // set_config
    client.query.mockImplementationOnce(async () => {
      throw new Error('boom');
    }); // the query
    await expect(
      runWithTenantScope(SCOPE, () => pool.query('SELECT * FROM projects')),
    ).rejects.toThrow('boom');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('injects LOCAL tenant vars right after BEGIN on the transaction (connect) path', async () => {
    process.env.RLS_ENFORCE = 'on';
    const { pool, clientCalls } = makeMockPool();
    await runWithTenantScope(SCOPE, async () => {
      const c: any = await pool.connect();
      await c.query('BEGIN');
      await c.query('SELECT * FROM projects');
      await c.query('COMMIT');
      c.release();
    });
    const texts = clientCalls.map(c => c.text);
    expect(texts[0]).toBe('BEGIN');
    expect(texts[1]).toMatch(SET_CONFIG_RE);
    expect(texts[2]).toBe('SELECT * FROM projects');
    expect(texts[3]).toBe('COMMIT');
  });

  it('connect path is inert while RLS_ENFORCE is off (no injected set_config)', async () => {
    const { pool, clientCalls } = makeMockPool();
    await runWithTenantScope(SCOPE, async () => {
      const c: any = await pool.connect();
      await c.query('BEGIN');
      await c.query('COMMIT');
      c.release();
    });
    expect(clientCalls.map(c => c.text)).toEqual(['BEGIN', 'COMMIT']);
  });
});
