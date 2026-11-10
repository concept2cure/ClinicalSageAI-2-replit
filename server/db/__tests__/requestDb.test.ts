import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';

import { MissingRequestDbContextError, requestDb, requestPgClient, requestConnectable } from '../requestDb';
import { bindRequestDbClient } from '../requestDbLease';

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


describe('requestConnectable transaction ownership', () => {
  it('keeps a healthy borrowed connection pinned but propagates uncertain completion to its actual owner', async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })), discard: vi.fn(async (_error: Error) => {}) };
    const borrowed = await requestConnectable(fakeReq(client)).connect();
    borrowed.release();expect(client.discard).not.toHaveBeenCalled();
    const error = new Error('COMMIT reply lost');borrowed.release(error);
    expect(client.discard).toHaveBeenCalledExactlyOnceWith(error);
  });
});

/**
 * F1, 2026-11-01 (docs/evidence/F1/2026-11-01-request-db-context/). A request
 * whose caller went away has its client released by the lease when the
 * response ends (requestDbLease.ts, 11feb8d93). The handler, still running,
 * then asks for it. That refusal was REQUEST_DB_CONTEXT_REQUIRED, the code for a
 * route reached with no scope installer, so a page navigating away read in the
 * server log as a mount defect (the 2026-10-26 launch walk).
 */
describe('a request whose client was released because its response ended', () => {
  function endedRequest(): any {
    const req: any = {};
    const res = Object.assign(new EventEmitter(), { destroyed: false, writableFinished: false });
    bindRequestDbClient(req, res as any, { query: vi.fn() as any, release: vi.fn(async () => {}) });
    res.emit('close');
    expect(req.dbClient, 'the lease kept the client past the response').toBeNull();
    return req;
  }

  it('is refused as REQUEST_ENDED by requestPgClient, requestDb and requestConnectable, still failing closed as a missing context', async () => {
    for (const ask of [
      () => requestPgClient(endedRequest()),
      () => requestDb(endedRequest()),
      () => requestConnectable(endedRequest()).query('SELECT 1'),
    ]) {
      let caught: unknown;
      try { await ask(); } catch (error) { caught = error; }
      expect(caught, 'every caller that fails closed on a missing context must still do so').toBeInstanceOf(MissingRequestDbContextError);
      expect(caught).toMatchObject({ name: 'RequestEndedError', code: 'REQUEST_ENDED' });
    }
  });

  it('leaves REQUEST_DB_CONTEXT_REQUIRED to a request that never had a client', () => {
    for (const req of [fakeReq(undefined), fakeReq({})]) {
      let caught: unknown;
      try { requestPgClient(req); } catch (error) { caught = error; }
      expect(caught).toMatchObject({ name: 'MissingRequestDbContextError', code: 'REQUEST_DB_CONTEXT_REQUIRED' });
    }
  });

  it('serves a client retained past the response, and refuses it once its holder lets go', async () => {
    const { retainRequestDbClient } = await import('../requestDbLease');
    const req: any = {};
    const res = Object.assign(new EventEmitter(), { destroyed: false, writableFinished: false });
    const client = { query: vi.fn() as any, release: vi.fn(async () => {}) };
    bindRequestDbClient(req, res as any, client);
    const letGo = retainRequestDbClient(req)!;
    res.emit('close');
    expect(requestPgClient(req)).toBe(client);
    await letGo();
    expect(() => requestPgClient(req)).toThrow(expect.objectContaining({ code: 'REQUEST_ENDED' }));
  });
});
