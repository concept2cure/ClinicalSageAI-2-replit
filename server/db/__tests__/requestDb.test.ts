import { describe, it, expect, vi } from 'vitest';

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

    // Drizzle objects expose a `select` method.
    expect(typeof (built as any).select).toBe('function');
  });

  it.each([undefined, null, {}, { query: 'not-a-function' }])(
    'fails closed when dbClient is missing or invalid: %j',
    dbClient => {
      expect(() => requestDb(fakeReq(dbClient))).toThrow(/requires a tenant-scoped dbClient/);
    },
  );

  it('does not return a cached wrapper after tenant context is removed', () => {
    const req = fakeReq({ query: vi.fn() });
    requestDb(req);
    req.dbClient = null;
    expect(() => requestDb(req)).toThrow(/requires a tenant-scoped dbClient/);
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
