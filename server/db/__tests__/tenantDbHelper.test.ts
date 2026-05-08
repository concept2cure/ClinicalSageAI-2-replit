/**
 * Pin the contract that `getDb(req)` now delegates to `requestDb`.
 *
 * Before this rollout: `getDb` returned a `TenantDb` instance (broken —
 * the constructor was passed a string id where it expected a context
 * object, so tenant filtering never engaged) or fell back to a
 * pool-bound Drizzle from `server/db`.
 *
 * After: `getDb` returns whatever `requestDb` returns. Routes that
 * chain `.select().from(...).where(...)` keep working; queries now
 * route through the request-scoped client so the RLS policy and the
 * pool instrumentation see them.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../runtime', () => ({
  db: { __sentinel: 'pool-bound' },
}));

import { getDb, ensureTenantId } from '../tenantDbHelper';
import { requestDb } from '../requestDb';

function fakeReq(opts: { dbClient?: unknown; tenantContext?: any; tenantId?: number | string }) {
  return opts as any;
}

describe('getDb', () => {
  it('returns the same Drizzle instance as requestDb(req)', () => {
    const fakeClient = { query: vi.fn() };
    const req = fakeReq({ dbClient: fakeClient });

    const a = getDb(req);
    const b = requestDb(req);
    // Both call requestDb under the hood — the cache means same instance.
    expect(a).toBe(b);
  });

  it('falls back to the pool-bound db when no dbClient is on the request', () => {
    const req = fakeReq({});
    expect((getDb(req) as any).__sentinel).toBe('pool-bound');
  });
});

describe('ensureTenantId', () => {
  it('reads from req.tenantContext.organizationId', () => {
    expect(ensureTenantId(fakeReq({ tenantContext: { organizationId: 7 } }))).toBe(7);
  });

  it('coerces a string organizationId to number', () => {
    expect(ensureTenantId(fakeReq({ tenantContext: { organizationId: '42' } }))).toBe(42);
  });

  it('falls back to req.tenantId', () => {
    expect(ensureTenantId(fakeReq({ tenantId: 13 }))).toBe(13);
  });

  it('throws when neither is set', () => {
    expect(() => ensureTenantId(fakeReq({}))).toThrow(/Tenant ID is required/);
  });
});
