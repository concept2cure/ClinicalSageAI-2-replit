/**
 * A 500 from the document-lifecycle router carries no caught-error text
 * (security audit 2026-09-24, IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * Every handler runs inside the router's `wrap()`, whose catch answered
 * `{ ok: false, error: 'internal_error', detail: err.message }` — for a
 * Drizzle failure that is "Failed query: select … params: …", table and column
 * names included. The catch now answers through `serverError()`
 * (server/lib/api-response.ts): a static INTERNAL_ERROR envelope with the
 * request id, the detail in the log.
 *
 * The injected `db` is a handle whose every property access throws the
 * sentinel, so the real GET /:id fails on its first query. The route's own
 * 403 for a request with no organization is pinned beside it unchanged.
 */
import { describe, expect, it } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { createDocumentLifecycleRouter } from '../document-lifecycle';

const SENTINEL = 'SENTINEL-DB-DETAIL: Failed query: select "set_b_secret_column" from "canonical_documents"';
const REQUEST_ID = 'req-p117-set-b';

const failingDb = new Proxy(
  {},
  {
    get() {
      throw new Error(SENTINEL);
    },
  },
);

function app(org: number | null) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', REQUEST_ID);
    if (org !== null) {
      (req as unknown as { user: unknown }).user = { id: 5, organizationId: org, role: 'admin', roles: ['admin'] };
    }
    next();
  });
  a.use('/api/regulatory/documents', createDocumentLifecycleRouter({ db: failingDb as never }));
  return a;
}

describe('GET /api/regulatory/documents/:id: the 500 body is contained', () => {
  it('answers a store failure with INTERNAL_ERROR and the request id, never the thrown text', async () => {
    const r = await request(app(7)).get('/api/regulatory/documents/doc-1');
    expect(r.status).toBe(500);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-DB-DETAIL');
    expect(body).not.toContain('set_b_secret_column');
    expect(body).not.toMatch(/Failed query/);
    expect(r.body).toMatchObject({ error: 'INTERNAL_ERROR', correlationId: REQUEST_ID });
    expect(r.body.detail).toBeUndefined();
  });

  it('leaves the no-organization 403 exactly as it was', async () => {
    const r = await request(app(null)).get('/api/regulatory/documents/doc-1');
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ ok: false, error: 'organization_context_required' });
  });
});
