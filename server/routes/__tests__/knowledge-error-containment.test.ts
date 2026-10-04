/**
 * A 500 from GET /api/knowledge/validation-rules carries no caught-error text
 * (security audit 2026-09-24, IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * The catch answered `{ error: 'Validation-rule corpus unavailable', detail:
 * err.message }`; a failed dynamic import puts the module's absolute path in
 * that message. It now answers through `serverError()`
 * (server/lib/api-response.ts): a static INTERNAL_ERROR envelope with the
 * request id, the detail in the log.
 *
 * The corpus module is the double that fails; the route and the helper are
 * real. The 422 for an unknown region is pinned beside it unchanged.
 */
import { describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const SENTINEL = "SENTINEL-FS-DETAIL: Cannot find module '/app/server/services/ectd/validation-rule-corpus.js'";
const REQUEST_ID = 'req-p117-set-b';

vi.mock('../../services/ectd/validation-rule-corpus.js', () => ({
  RULE_CORPUS: [],
  rulesForRegion: () => [],
  corpusSummary: () => {
    throw new Error(SENTINEL);
  },
}));

import router from '../knowledge';

function app() {
  const a = express();
  a.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', REQUEST_ID);
    next();
  });
  a.use('/api/knowledge', router);
  return a;
}

describe('GET /api/knowledge/validation-rules: the 500 body is contained', () => {
  it('answers a corpus failure with INTERNAL_ERROR and the request id, never the thrown text', async () => {
    const r = await request(app()).get('/api/knowledge/validation-rules');
    expect(r.status).toBe(500);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-FS-DETAIL');
    expect(body).not.toContain('/app/server');
    expect(r.body).toMatchObject({ error: 'INTERNAL_ERROR', correlationId: REQUEST_ID });
    expect(r.body.detail).toBeUndefined();
  });

  it('leaves the unknown-region 422 exactly as it was', async () => {
    const r = await request(app()).get('/api/knowledge/validation-rules?region=zz');
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ error: 'region must be one of: fda, eu, jp, ca, au, ch' });
  });
});
