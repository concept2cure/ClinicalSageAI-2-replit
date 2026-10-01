/**
 * A 500 from POST /api/predicate-intelligence/se-discussion/author carries no
 * caught-error text (security audit 2026-09-24, IAM-18 (1); plan P1-17,
 * tranche 3 set-B).
 *
 * The catch answered `{ error: 'SE discussion authoring failed', detail:
 * err.message }`, so whatever failed inside the authoring pipeline — the model
 * call, the document build, the verifier's store — reached the browser
 * verbatim. It now answers through `serverError()`
 * (server/lib/api-response.ts): a static INTERNAL_ERROR envelope with the
 * request id, the detail in the log.
 *
 * Auth, the program-access read and the author are doubles (the same seams as
 * server/__tests__/routes/predicate-intelligence.test.ts); the route and the
 * helper are real. The 422 for a request with no matrix is pinned unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-DB-DETAIL: relation "se_set_b_secret" does not exist';
const REQUEST_ID = 'req-p117-set-b';
const PROGRAM_ID = '00000000-0000-0000-0000-000000000001';

const { author } = vi.hoisted(() => ({ author: vi.fn() }));

vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 1, organizationId: '2', role: 'admin' };
    next();
  },
}));
vi.mock('../../db.js', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: () => [{ id: PROGRAM_ID }] }) }) }) },
  // The program check (programInOrganization, D3) reads on the pool.
  pool: { query: async () => ({ rows: [{ id: PROGRAM_ID }] }) },
}));
vi.mock('../../services/ana/se-discussion/se-discussion-author.js', () => ({
  isSeDiscussionAuthoringEnabled: () => true,
  authorSEDiscussion: (...a: unknown[]) => author(...a),
}));

import router from '../predicate-intelligence';

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', REQUEST_ID);
    next();
  });
  a.use('/api/predicate-intelligence', router);
  return a;
}

const savedToken = process.env.REVIEW_ADMIN_TOKEN;
beforeEach(() => {
  process.env.REVIEW_ADMIN_TOKEN = 'test-token-secret';
  author.mockReset();
});
afterEach(() => {
  if (savedToken === undefined) delete process.env.REVIEW_ADMIN_TOKEN;
  else process.env.REVIEW_ADMIN_TOKEN = savedToken;
});

describe('POST /api/predicate-intelligence/se-discussion/author: the 500 body is contained', () => {
  it('answers an authoring failure with INTERNAL_ERROR and the request id, never the thrown text', async () => {
    author.mockRejectedValueOnce(new Error(SENTINEL));
    const r = await request(app())
      .post('/api/predicate-intelligence/se-discussion/author')
      .query({ program_id: PROGRAM_ID })
      .send({ matrix: { comparison_rows: [] }, subject_device_name: 'BX-204' });
    expect(r.status).toBe(500);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-DB-DETAIL');
    expect(body).not.toContain('se_set_b_secret');
    expect(r.body).toMatchObject({ error: 'INTERNAL_ERROR', correlationId: REQUEST_ID });
    expect(r.body.detail).toBeUndefined();
  });

  it('leaves the no-matrix 422 exactly as it was', async () => {
    const r = await request(app())
      .post('/api/predicate-intelligence/se-discussion/author')
      .query({ program_id: PROGRAM_ID })
      .send({});
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/comparison_rows/);
    expect(author).not.toHaveBeenCalled();
  });
});
