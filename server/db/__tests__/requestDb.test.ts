import { describe, it, expect, vi } from 'vitest';

// Mock the runtime module before importing requestDb so the pool-bound
// fallback doesn't try to construct a real pg pool.
vi.mock('../runtime', () => ({
  db: { __sentinel: 'pool-bound' },
}));

import { requestDb } from '../requestDb';

function fakeReq(dbClient?: unknown): any {
  return { dbClient };
}

describe('requestDb', () => {
  it('returns a Drizzle wrapper bound to req.dbClient when one is set', () => {
    const fakeClient = {
      query: vi.fn(() => Promise.resolve({ rows: [], rowCount: 0 })),
    };
    const req = fakeReq(fakeClient);
    const built = requestDb(req);

    // Built object should be a Drizzle instance, not the pool-bound sentinel.
    expect((built as any).__sentinel).not.toBe('pool-bound');
    // Drizzle objects expose a `select` method.
    expect(typeof (built as any).select).toBe('function');
  });

  it('falls back to the pool-bound db when no dbClient is on the request', () => {
    const req = fakeReq(undefined);
    const built = requestDb(req);
    expect((built as any).__sentinel).toBe('pool-bound');
  });

  it('caches the wrapper on the request to avoid rebuilding per call', () => {
    const fakeClient = { query: vi.fn() };
    const req = fakeReq(fakeClient);
    const a = requestDb(req);
    const b = requestDb(req);
    expect(a).toBe(b);
    expect((req as any).__requestDb).toBe(a);
  });
});
