/**
 * A 500 from POST /api/ind-generation/generate-section carries no caught-error
 * text (security audit 2026-09-24, IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * The catch answered `{ success: false, error: error.message || 'Generation
 * failed' }`, so a gateway failure — the provider's own error text, the model
 * id, a timeout naming the upstream host — reached the browser verbatim. It now
 * answers through `serverError()` (server/lib/api-response.ts): a static
 * INTERNAL_ERROR envelope with the request id, the detail in the log.
 *
 * The AI gateway is the double that fails; the route and the helper are real.
 * The 400 for an unknown section code is pinned beside it unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-PROVIDER-DETAIL: 401 invalid x-api-key for model claude-set-b at api.example.internal';
const REQUEST_ID = 'req-p117-set-b';

const { route } = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock('../../services/ai-gateway/index.js', () => ({ getGateway: () => ({ route }) }));

import router from '../ind-generation';

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', REQUEST_ID);
    next();
  });
  a.use('/api/ind-generation', router);
  return a;
}

const BODY = { projectId: 'proj-1', sectionCode: '2.6', productName: 'BX-099', indication: 'NSCLC', sponsor: 'Acme', phase: 'Phase 1' };

beforeEach(() => route.mockReset());

describe('POST /api/ind-generation/generate-section: the 500 body is contained', () => {
  it('answers a gateway failure with INTERNAL_ERROR and the request id, never the thrown text', async () => {
    route.mockRejectedValueOnce(new Error(SENTINEL));
    const r = await request(app()).post('/api/ind-generation/generate-section').send(BODY);
    expect(r.status).toBe(500);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-PROVIDER-DETAIL');
    expect(body).not.toContain('x-api-key');
    expect(r.body).toMatchObject({ error: 'INTERNAL_ERROR', correlationId: REQUEST_ID });
  });

  it('leaves the unknown-section 400 exactly as it was', async () => {
    const r = await request(app()).post('/api/ind-generation/generate-section').send({ ...BODY, sectionCode: '9.9.9' });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ success: false, error: 'Unknown section code: 9.9.9' });
    expect(route).not.toHaveBeenCalled();
  });
});
