/**
 * A 502 from POST /api/external-evidence/route carries no caught-error text
 * (security audit 2026-09-24, IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * The catch answered `firecrawlError('provider_error', error.message)`, so the
 * thrown text became the envelope's sentence — for a Firecrawl failure that is
 * `provider_error:<status>:<provider body>` or
 * `provider_error:FIRECRAWL_API_KEY missing`. The 502 keeps its status and its
 * `provider_error` code and now says the code's own static sentence; the thrown
 * text goes to the log.
 *
 * The evidence router is the double that fails; the route is real. The 400 for
 * a missing message is pinned beside it unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = 'provider_error:FIRECRAWL_API_KEY missing SENTINEL-UPSTREAM-DETAIL';

const { routeEvidence } = vi.hoisted(() => ({ routeEvidence: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../db', () => ({ getPool: vi.fn() }));
vi.mock('../../services/research-intelligence', () => ({
  routeEvidenceRequest: (...a: unknown[]) => routeEvidence(...a),
}));

import router from '../external-evidence';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/external-evidence', router);
  return a;
}

beforeEach(() => routeEvidence.mockReset());

describe('POST /api/external-evidence/route: the 502 body is contained', () => {
  it('answers a provider failure with provider_error and the static sentence, never the thrown text', async () => {
    routeEvidence.mockRejectedValueOnce(new Error(SENTINEL));
    const r = await request(app())
      .post('/api/external-evidence/route')
      .send({ message: 'Find recent biomarker evidence for NSCLC', useFirecrawl: true });
    expect(r.status).toBe(502);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-UPSTREAM-DETAIL');
    expect(body).not.toContain('FIRECRAWL_API_KEY');
    expect(r.body).toMatchObject({
      success: false,
      error: { code: 'provider_error', message: 'Firecrawl provider returned an error.' },
    });
  });

  it('leaves the missing-message 400 exactly as it was', async () => {
    const r = await request(app()).post('/api/external-evidence/route').send({});
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ success: false, error: { code: 'INVALID_MESSAGE' } });
    expect(routeEvidence).not.toHaveBeenCalled();
  });
});
