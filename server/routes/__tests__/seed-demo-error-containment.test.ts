/**
 * A 500 from POST /api/demo/seed carries no caught-error text (security audit
 * 2026-09-24, IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * The catch answered `{ success: false, message: 'Failed to seed demo
 * projects', error: error.message }`, so the insert's driver text (relation,
 * column and constraint names) reached the browser. The route is mounted only
 * when demo routes are enabled and refuses in production, but a demo or staging
 * deployment is still one a person signs into. It now answers through
 * `serverError()` (server/lib/api-response.ts): a static INTERNAL_ERROR envelope
 * with the request id, the detail in the log.
 *
 * The database is the double that fails; the route and the helper are real.
 */
import { describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-DB-DETAIL: duplicate key value violates unique constraint "projects_set_b_secret_key"';
const REQUEST_ID = 'req-p117-set-b';

vi.mock('../../db', () => ({
  db: {
    insert: () => {
      throw new Error(SENTINEL);
    },
  },
}));

import router from '../seed-demo';

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', REQUEST_ID);
    next();
  });
  a.use('/api/demo', router);
  return a;
}

describe('POST /api/demo/seed: the 500 body is contained', () => {
  it('answers a seeding failure with INTERNAL_ERROR and the request id, never the thrown text', async () => {
    const r = await request(app()).post('/api/demo/seed').send({});
    expect(r.status).toBe(500);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-DB-DETAIL');
    expect(body).not.toContain('projects_set_b_secret_key');
    expect(r.body).toMatchObject({ error: 'INTERNAL_ERROR', correlationId: REQUEST_ID });
  });
});
