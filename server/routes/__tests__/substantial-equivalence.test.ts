/**
 * Substantial-equivalence API contract — evaluate + compare endpoints. Auth
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
  const router = (await import('../substantial-equivalence')).default;
  app = express();
  app.use(express.json());
  app.use('/api/substantial-equivalence', router);
});

const post = (path: string, body: object) =>
  request(app).post(`/api/substantial-equivalence${path}`).send(body);

describe('evaluate endpoint', () => {
  it('returns SE for the same-use/same-tech/supportive-data path', async () => {
    const res = await post('/evaluate', {
      sameIntendedUse: true,
      sameTechnologicalCharacteristics: true,
      performanceDataSupportsEquivalence: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.result.determination).toBe('SE');
    expect(Array.isArray(res.body.result.decisionPath)).toBe(true);
  });

  it('returns NSE for a different intended use', async () => {
    const res = await post('/evaluate', {
      sameIntendedUse: false,
      sameTechnologicalCharacteristics: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.result.determination).toBe('NSE');
  });

  it('rejects a missing required field with 400', async () => {
    const res = await post('/evaluate', { sameIntendedUse: true });
    expect(res.status).toBe(400);
  });
});

describe('compare-characteristics endpoint', () => {
  it('returns the per-characteristic comparison and differences', async () => {
    const res = await post('/compare-characteristics', {
      characteristics: [
        { name: 'Material', subjectValue: 'Titanium', predicateValue: 'Stainless steel' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.result.sameOverall).toBe(false);
    expect(res.body.result.differences).toEqual(['Material']);
  });

  it('rejects an empty list with 400', async () => {
    const res = await post('/compare-characteristics', { characteristics: [] });
    expect(res.status).toBe(400);
  });
});
