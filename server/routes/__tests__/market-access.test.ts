/**
 * Market access API contract — code classification + coverage dossier. Auth
 * mocked; no DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

vi.mock('../../middleware/auth', () => ({
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

let app: express.Express;

beforeEach(async () => {
  const router = (await import('../market-access')).default;
  app = express();
  app.use(express.json());
  app.use('/api/market-access', router);
});

const post = (path: string, body: object) =>
  request(app).post(`/api/market-access${path}`).send(body);

describe('classify-code endpoint', () => {
  it('classifies a PLA code', async () => {
    const res = await post('/classify-code', { code: '0001U' });
    expect(res.status).toBe(200);
    expect(res.body.result.type).toBe('PLA');
    expect(res.body.result.valid).toBe(true);
  });

  it('flags an unknown code', async () => {
    const res = await post('/classify-code', { code: 'ZZ' });
    expect(res.status).toBe(200);
    expect(res.body.result.valid).toBe(false);
  });

  it('rejects an empty code with 400', async () => {
    const res = await post('/classify-code', { code: '' });
    expect(res.status).toBe(400);
  });
});

describe('coverage-dossier-completeness endpoint', () => {
  it('returns completeness and gaps', async () => {
    const res = await post('/coverage-dossier-completeness', { clinicalEvidence: true });
    expect(res.status).toBe(200);
    expect(res.body.result.complete).toBe(false);
    expect(res.body.result.gaps.length).toBeGreaterThan(0);
  });
});
