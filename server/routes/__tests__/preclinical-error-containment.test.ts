/**
 * A 5xx from POST /api/preclinical/ingest carries no caught-error text
 * (security audit 2026-09-24, IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * Two answers carried the thrown text:
 *
 *  - the 503 for a disabled ingest sent `error: err.message`, which is
 *    "Preclinical ingest is disabled (PRECLINICAL_INGEST_ENABLED=false)" — the
 *    deployment's flag name (the baselined site). It now says the same static
 *    sentence the route's own pre-check already says, and keeps its code;
 *  - every failure that did not look like a validation error went out as
 *    `res.status(isZodLike ? 422 : 500).json({ error: message })` — the driver or
 *    model-provider text on a 500. The leak gate cannot see that one (its status
 *    is not a literal). The 500 now goes through `serverError()`
 *    (server/lib/api-response.ts): a static INTERNAL_ERROR envelope with the
 *    request id, the detail and the source PDF id in the log.
 *
 * The 422 for a validation-shaped failure is a 4xx and is pinned unchanged.
 *
 * The ingest service and the feature flag are doubles; the upload guard, the
 * route and the helper are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const REQUEST_ID = 'req-p117-set-b';

const { ingestStudy, DisabledError } = vi.hoisted(() => ({
  ingestStudy: vi.fn(),
  DisabledError: class PreclinicalIngestDisabledError extends Error {},
}));

vi.mock('../../services/preclinical/feature-flags', () => ({
  PRECLINICAL_INGEST_ENABLED: true,
  PRECLINICAL_REVIEWER_ENABLED: false,
}));
vi.mock('../../services/preclinical/preclinical-ingest-service', () => ({
  ingestStudy: (...a: unknown[]) => ingestStudy(...a),
  PreclinicalIngestDisabledError: DisabledError,
}));

import router from '../preclinical';

function app() {
  const a = express();
  a.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', REQUEST_ID);
    next();
  });
  a.use('/api/preclinical', router);
  return a;
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
const ingest = () =>
  request(app())
    .post('/api/preclinical/ingest')
    .field('programId', '42')
    .attach('file', PDF, { filename: 'study.pdf', contentType: 'application/pdf' });

beforeEach(() => ingestStudy.mockReset());

describe('POST /api/preclinical/ingest: the 5xx bodies are contained', () => {
  it('answers an ingest failure with INTERNAL_ERROR and the request id, never the thrown text', async () => {
    ingestStudy.mockRejectedValueOnce(new Error('SENTINEL-DB-DETAIL: relation "preclinical_set_b_secret" does not exist'));
    const r = await ingest();
    expect(r.status).toBe(500);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-DB-DETAIL');
    expect(body).not.toContain('preclinical_set_b_secret');
    expect(r.body).toMatchObject({ error: 'INTERNAL_ERROR', correlationId: REQUEST_ID });
  });

  it('answers a disabled ingest with its code and a static sentence, never the thrown text', async () => {
    ingestStudy.mockRejectedValueOnce(new DisabledError('SENTINEL-ENV-DETAIL (PRECLINICAL_INGEST_ENABLED=false)'));
    const r = await ingest();
    expect(r.status).toBe(503);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-ENV-DETAIL');
    expect(body).not.toContain('PRECLINICAL_INGEST_ENABLED');
    expect(r.body).toEqual({
      success: false,
      error: 'Preclinical ingest is disabled',
      code: 'PRECLINICAL_INGEST_DISABLED',
    });
  });

  it('leaves the validation-shaped 422 exactly as it was', async () => {
    ingestStudy.mockRejectedValueOnce(new Error('Invalid study: expected a dose table'));
    const r = await ingest();
    expect(r.status).toBe(422);
    expect(r.body).toEqual({
      success: false,
      error: 'Invalid study: expected a dose table',
      code: 'PRECLINICAL_INGEST_VALIDATION',
    });
  });
});
