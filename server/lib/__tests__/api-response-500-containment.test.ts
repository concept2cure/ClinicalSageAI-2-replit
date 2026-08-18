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
