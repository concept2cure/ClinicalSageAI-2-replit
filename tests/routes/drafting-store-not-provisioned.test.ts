/**
 * Contract: the defensible-drafting routes say what is wrong, and say nothing
 * the database told them.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Every query in server/api/drafting/routes.ts reads `vault.drafting_sessions`,
 * `vault.extracted_entities`, or the `vault.hybrid_search` /
 * `vault.table_priority_search` functions. All four exist only in
 * db/migrations/_legacy/044_gcc_cognitive_fabric_rag.sql, which is on no apply
 * path — so on a database built by install-fresh + deploy-migrate none of them
 * are there. Verified live:
 *
 *   GET /api/gcc/drafting/stats
 *     → 500 {"error":"relation \"vault.drafting_sessions\" does not exist"}
 *
 * Two defects in one response: a 500 for what is a provisioning state, and the
 * database's own error text handed to the caller — the class
 * scripts/ci/check-server-error-leaks.mjs exists to shrink.
 *
 * This suite pins the honest answers. It does NOT claim the store is fixed:
 * reconstructing the chunk and entity tables and the two search functions is
 * its own change, and the 503 is what the product should say until then.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

/** A pg error for a relation (or function) the database does not have. */
const undefinedTable = Object.assign(new Error('relation "vault.drafting_sessions" does not exist'), {
  code: '42P01',
});
const undefinedFunction = Object.assign(new Error('function vault.hybrid_search(...) does not exist'), {
  code: '42883',
});
/** Anything else: a real fault, which must be logged and correlated, not echoed. */
const realFault = Object.assign(new Error('deadlock detected on relation 16428'), { code: '40P01' });

const state = vi.hoisted(() => ({ error: null as unknown }));

vi.mock('../../server/middleware/tenantContext', () => ({
  getRequestDbClient: () => ({
    query: async () => {
      if (state.error) throw state.error;
      return { rows: [], rowCount: 0 };
    },
  }),
}));
vi.mock('../../server/lib/unified-ai-client', () => ({ ai: { complete: async () => ({ text: '' }) } }));

function mockRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {
    status(code: number) {
      res.statusCode = code;
      return res as Response;
    },
    json(payload: unknown) {
      res.body = payload;
      return res as Response;
    },
    getHeader: () => 'req-test-1',
    setHeader: () => res as Response,
  };
  return res as Response & { statusCode?: number; body?: Record<string, unknown> };
}

async function callGet(path: string, res: Response) {
  const { default: router } = await import('../../server/api/drafting/routes');
  const layer = (router as unknown as { stack: any[] }).stack.find(
    l => l.route?.path === path && l.route?.methods?.get,
  );
  expect(layer, `no GET ${path}`).toBeDefined();
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  await handler({ query: {}, params: {}, body: {} } as unknown as Request, res, () => {});
}

beforeEach(() => {
  state.error = null;
});

describe('an unprovisioned store is a 503 that names itself', () => {
  it.each([
    ['a missing table', undefinedTable],
    ['a missing function', undefinedFunction],
  ])('%s → 503 DRAFTING_STORE_NOT_PROVISIONED', async (_label, error) => {
    state.error = error;
    const res = mockRes();
    await callGet('/stats', res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: 'DRAFTING_STORE_NOT_PROVISIONED' });
    // The caller learns the state, never the schema.
    expect(JSON.stringify(res.body)).not.toMatch(/does not exist|vault\.|relation/i);
  });

  it('the sessions listing answers the same way — one state, one answer', async () => {
    state.error = undefinedTable;
    const res = mockRes();
    await callGet('/sessions', res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: 'DRAFTING_STORE_NOT_PROVISIONED' });
  });
});

describe('a real fault is a 500 that keeps the driver’s words out of the response', () => {
  it('does not echo the database message, and offers a correlation id instead', async () => {
    state.error = realFault;
    const res = mockRes();
    await callGet('/stats', res);
    expect(res.statusCode).toBe(500);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('deadlock detected');
    expect(body).not.toContain('16428');
    expect(res.body).toMatchObject({ error: 'INTERNAL_ERROR', correlationId: 'req-test-1' });
  });
});
