import { describe, it, expect, vi } from 'vitest';

import { MissingRequestDbContextError, requestDb, requestPgClient } from '../requestDb';

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

  it('fails closed with a typed error when dbClient is missing', () => {
    expect(() => requestDb(fakeReq(undefined))).toThrow(MissingRequestDbContextError);
    try {
      requestDb(fakeReq(undefined));
    } catch (error) {
      expect(error).toMatchObject({
        code: 'REQUEST_DB_CONTEXT_REQUIRED',
        statusCode: 500,
      });
    }
  });

  it('fails closed when dbClient does not implement query', () => {
    expect(() => requestDb(fakeReq({}))).toThrow(MissingRequestDbContextError);
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

describe('requestPgClient (raw-SQL sibling for tables without a Drizzle schema)', () => {
  it('hands back the request-scoped client itself', () => {
    const fakeClient = { query: vi.fn(() => Promise.resolve({ rows: [] })) };
    const req = fakeReq(fakeClient);
    expect(requestPgClient(req)).toBe(fakeClient);
  });

  it('fails closed with the same typed error when context is missing', () => {
    expect(() => requestPgClient(fakeReq(undefined))).toThrow(MissingRequestDbContextError);
    expect(() => requestPgClient(fakeReq({}))).toThrow(MissingRequestDbContextError);
  });
});
