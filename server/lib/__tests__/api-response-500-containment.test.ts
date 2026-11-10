/**
 * A 500 must not tell the browser what broke inside the database.
 *
 * MDX_WORK_ORDER W0-3, acceptance criterion 3: "No endpoint returns a database
 * error message in its response body", with a verification step that greps for
 * `relation`, `Failed query`, `select "` and table names. BIOPHARMA_WORK_ORDER
 * guardrail 3 says the same for the client side.
 *
 * `serverError()` used to fail that outright — it copied `err.message` into the
 * envelope while its docstring claimed the envelope was sanitized. Every one of
 * the 272 call sites inherited it, so the leak was the default behaviour of
 * every MDX-owned endpoint that fails rather than one route's slip.
 *
 * These assertions are over the JSON that reaches the client. Client-side
 * redaction cannot satisfy them, which is the point: the earlier fix scrubbed
 * the string at render time and left the API still shipping it.
 */
import { describe, it, expect, vi } from 'vitest';
import { serverError } from '../api-response';

/** Minimal Express Response double: records status and body, carries headers. */
function fakeRes(headers: Record<string, string> = {}) {
  const state: { status?: number; body?: any } = {};
  const res: any = {
    getHeader: (n: string) => headers[n],
    status(code: number) {
      state.status = code;
      return res;
    },
    json(body: any) {
      state.body = body;
      return res;
    },
  };
  return { res, state };
}

const fakeLog = () => ({ error: vi.fn() });

/** The real shape of a missing-relation failure, as node-postgres raises it. */
function undefinedTable(relation: string) {
  const e: any = new Error(`relation "${relation}" does not exist`);
  e.code = '42P01';
  return e;
}

describe('serverError does not leak the underlying failure to the client', () => {
  it('answers a missing-relation error without naming the relation', () => {
    const { res, state } = fakeRes({ 'X-Request-Id': 'req-abc-123' });
    serverError(res, fakeLog(), 'loading the software lifecycle', undefinedTable('software_lifecycle_items'));

    expect(state.status).toBe(500);
    const body = JSON.stringify(state.body);
    // The exact strings the work order's verify step greps for.
    expect(body).not.toMatch(/relation /i);
    expect(body).not.toContain('software_lifecycle_items');
    expect(body).not.toMatch(/does not exist/i);
    expect(body).not.toMatch(/42P01/);
  });

  it('rejects the other driver-error shapes, not just the one that was reported', () => {
    for (const raw of [
      'Failed query: select "id" from "audit_logs" where "org" = $1',
      'column c.chain_sha256 does not exist',
      'duplicate key value violates unique constraint "programs_pkey"',
      'connect ECONNREFUSED 10.0.4.21:5432',
    ]) {
      const { res, state } = fakeRes({ 'X-Request-Id': 'r1' });
      serverError(res, fakeLog(), 'listing', new Error(raw));
      const body = JSON.stringify(state.body);
      expect(body, `leaked: ${raw}`).not.toContain(raw);
      expect(body).not.toMatch(/Failed query|select "|ECONNREFUSED|constraint/i);
    }
  });

  it('still gives the operator everything needed to find the real error', () => {
    const log = fakeLog();
    const { res, state } = fakeRes({ 'X-Request-Id': 'req-abc-123' });
    serverError(res, log, 'loading the audit trail', undefinedTable('audit_logs'));

    // The client is handed the id...
    expect(state.body.correlationId).toBe('req-abc-123');
    // ...and the log line, keyed by that id, carries the message it withheld.
    expect(log.error).toHaveBeenCalledWith(
      'loading the audit trail failed',
      expect.objectContaining({
        err: 'relation "audit_logs" does not exist',
        correlationId: 'req-abc-123',
        code: '42P01',
      }),
    );
  });

  it('sends a code the client will not display and a sentence it will', () => {
    const { res, state } = fakeRes({ 'X-Request-Id': 'r2' });
    serverError(res, fakeLog(), 'saving the section', new Error('boom'));
    expect(state.body.error).toBe('INTERNAL_ERROR');
    expect(state.body.message).toMatch(/something went wrong/i);
    expect(state.body.message).toContain('saving the section');
    expect(state.body.message).not.toContain('boom');
  });

  it('omits the reference rather than inventing one when no request id was set', () => {
    const { res, state } = fakeRes({});
    serverError(res, fakeLog(), 'listing', new Error('boom'));
    expect(state.body.correlationId).toBeUndefined();
    // And does not promise a reference it did not send.
    expect(state.body.message).not.toMatch(/reference below/i);
  });

  it('is falsifiable: the pre-fix behaviour would fail these assertions', () => {
    // The old implementation, restated, so the gate is anchored to a real
    // regression rather than to the current code's own shape.
    const leaky = { error: undefinedTable('software_lifecycle_items').message };
    expect(JSON.stringify(leaky)).toMatch(/relation /i);
  });
});

/**
 * F1, 2026-11-01 (docs/evidence/F1/2026-11-01-request-db-context/). A read whose
 * caller went away fails closed when it asks for its released request client
 * (server/db/requestDb.ts, RequestEndedError). Nothing failed on the server and
 * nobody is waiting, so it is not logged as a failure and no 500 is written to
 * a response that has already ended. Keyed on the code: any other error on the
 * same request is still a failure.
 */
describe('serverError on a request that ended before its database work ran', () => {
  const ended = () => Object.assign(new Error('The request ended before its database work ran'), { code: 'REQUEST_ENDED' });

  it('notes it, logs no failure and writes nothing to the ended response', () => {
    const { res, state } = fakeRes({ 'X-Request-Id': 'req-1' });
    const log = { error: vi.fn(), info: vi.fn() };
    serverError(res, log, 'doc-list', ended(), { programId: 'p-1' });
    expect(log.error).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith('doc-list stopped: the request ended before its database work ran',
      { programId: 'p-1', correlationId: 'req-1', code: 'REQUEST_ENDED' });
    expect(state.status).toBeUndefined();
    expect(state.body).toBeUndefined();
  });

  /* Only a request that was never answered is noted. A handler that sent its own
     response and then asked for its client lost work after that response (an
     audit row, a follow-up write): that is a defect in the handler, and it stays
     a logged failure, as it was before REQUEST_ENDED existed. */
  it('still logs it as a failure when the handler had already sent its own response', () => {
    const { res } = fakeRes({ 'X-Request-Id': 'req-2' });
    res.headersSent = true;
    const log = { error: vi.fn(), info: vi.fn() };
    serverError(res, log, 'doc-create', ended());
    expect(log.info).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith('doc-create failed', expect.objectContaining({ code: 'REQUEST_ENDED', correlationId: 'req-2' }));
  });

  it('still logs a request with no database context as a failure, with a 500', () => {
    const { res, state } = fakeRes();
    const log = { error: vi.fn(), info: vi.fn() };
    const missing = Object.assign(new Error('Request-scoped database context is required'), { code: 'REQUEST_DB_CONTEXT_REQUIRED' });
    serverError(res, log, 'doc-list', missing);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith('doc-list failed', expect.objectContaining({ code: 'REQUEST_DB_CONTEXT_REQUIRED' }));
    expect(state.status).toBe(500);
  });
});
