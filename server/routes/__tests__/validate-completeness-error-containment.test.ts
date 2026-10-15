/**
 * A 500 from POST /api/validate-completeness/validate carries no caught-error text (security audit 2026-09-24,
 * IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * The catch logged `err.message` and then answered
 * `{ success: false, error: err.message }`, so the engine's failure text
 * reached the browser verbatim. It now answers through `serverError()`
 * (server/lib/api-response.ts): a static INTERNAL_ERROR envelope with the
 * request id, the detail in the log (once, against that id).
 *
 * The engine is the double that fails; the route and the helper are real. The
 * Zod 400 is pinned beside it unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-ENGINE-DETAIL: relation "set_b_secret_table" does not exist';
const REQUEST_ID = 'req-p117-set-b';

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../../services/validate-completeness-engine', () => ({ validateCompletenessEngine: { validate: (...a: unknown[]) => run(...a) } }));
vi.mock('../../auth.js', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));

import router from '../validate-completeness';

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', REQUEST_ID);
    next();
  });
  a.use('/api/validate-completeness', router);
  return a;
}

beforeEach(() => run.mockReset());

describe('POST /api/validate-completeness/validate: the 500 body is contained', () => {
  it('answers an engine failure with INTERNAL_ERROR and the request id, never the thrown text', async () => {
    run.mockRejectedValueOnce(new Error(SENTINEL));
    const r = await request(app()).post('/api/validate-completeness/validate').send({ submissionType: 'NDA', presentSections: ['1.1', '2.3'] });
    expect(r.status).toBe(500);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-ENGINE-DETAIL');
    expect(body).not.toContain('set_b_secret_table');
    expect(r.body).toMatchObject({ error: 'INTERNAL_ERROR', correlationId: REQUEST_ID });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('leaves the validation 400 exactly as it was', async () => {
    const r = await request(app()).post('/api/validate-completeness/validate').send({});
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, error: 'Validation failed' });
    expect(Array.isArray(r.body.details)).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
});
