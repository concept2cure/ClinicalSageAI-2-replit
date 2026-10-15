/**
 * A 500 from GET /api/protocol-reviews/documents/:id/summary carries no caught-error text (security audit 2026-09-24,
 * IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * The router's per-file `fail()` helper answered every uncoded failure with
 * `{ error: { code: 'INTERNAL', message: err.message } }`, so a driver error
 * (relation and column names, SQLSTATE text, the connection target) reached the
 * browser verbatim. The 500 now goes through `serverError()`
 * (server/lib/api-response.ts): a static INTERNAL_ERROR envelope carrying the
 * request id, the detail in the log.
 *
 * A coded refusal (NOT_FOUND and the other CODE_STATUS entries) is unchanged:
 * its sentence is written for the user and still reaches them.
 *
 * The service is a double; the route, its `fail()` and the helper are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-DB-DETAIL: relation "set_b_secret_table" does not exist';
const REQUEST_ID = 'req-p117-set-b';

const { svc } = vi.hoisted(() => ({ svc: vi.fn() }));
vi.mock('../../services/protocol-reviews/protocol-reviews-service', () => ({ getReviewSummary: (...a: unknown[]) => svc(...a) }));
vi.mock('../../db', () => ({ pool: { connect: vi.fn(), query: vi.fn() } }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: vi.fn(), verifyReauth: vi.fn() }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn() }));

import router from '../protocol-reviews';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, res: Response, next: NextFunction) => {
    // What the requestId middleware and the auth boundary leave on a request.
    res.setHeader('X-Request-Id', REQUEST_ID);
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: 7 };
    next();
  });
  a.use('/api/protocol-reviews', router);
  return a;
}

beforeEach(() => svc.mockReset());

describe('GET /api/protocol-reviews/documents/:id/summary: the 500 body is contained', () => {
  it('answers an uncoded failure with INTERNAL_ERROR and the request id, never the thrown text', async () => {
    svc.mockRejectedValueOnce(new Error(SENTINEL));
    const r = await request(app()).get('/api/protocol-reviews/documents/3/summary');
    expect(r.status).toBe(500);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-DB-DETAIL');
    expect(body).not.toContain('set_b_secret_table');
    expect(r.body).toMatchObject({ error: 'INTERNAL_ERROR', correlationId: REQUEST_ID });
    expect(typeof r.body.message).toBe('string');
  });

  it('leaves a coded 4xx exactly as it was (the refusal is the user\'s to read)', async () => {
    svc.mockRejectedValueOnce(Object.assign(new Error('That record was not found.'), { code: 'NOT_FOUND' }));
    const r = await request(app()).get('/api/protocol-reviews/documents/3/summary');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: { code: 'NOT_FOUND', message: 'That record was not found.' } });
  });
});
