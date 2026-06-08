/**
 * Diagnostics performance API contract — analytical + clinical endpoints return
 * computed results and 400 on invalid input. Auth is mocked; no DB.
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
  const router = (await import('../diagnostics-performance')).default;
  app = express();
  app.use(express.json());
  app.use('/api/diagnostics-performance', router);
});

const post = (path: string, body: unknown) =>
  request(app).post(`/api/diagnostics-performance${path}`).send(body);

describe('analytical endpoints', () => {
  it('imprecision returns ANOVA-derived SDs', async () => {
    const res = await post('/analytical/imprecision', { runs: [[10, 12], [14, 16]] });
    expect(res.status).toBe(200);
    expect(res.body.result.withinLabSd).toBeCloseTo(3, 6);
  });

  it('detection-capability returns LoB/LoD', async () => {
    const res = await post('/analytical/detection-capability', {
      blankReplicates: [0, 0, 0, 0],
      lowSamples: [[2, 4]],
    });
    expect(res.status).toBe(200);
    expect(res.body.result.lob).toBeCloseTo(0, 6);
    expect(res.body.result.lod).toBeGreaterThan(0);
  });

  it('method-comparison returns slope and bias', async () => {
    const res = await post('/analytical/method-comparison', {
      reference: [1, 2, 3, 4],
      test: [2, 4, 6, 8],
      decisionLevel: 5,
    });
    expect(res.status).toBe(200);
    expect(res.body.result.slope).toBeCloseTo(2, 6);
    expect(res.body.result.biasAtDecisionLevel).toBeCloseTo(5, 6);
  });

  it('rejects an unbalanced imprecision design with 400', async () => {
    const res = await post('/analytical/imprecision', { runs: [[1, 2], [3]] });
    expect(res.status).toBe(400);
  });
});

describe('clinical endpoint', () => {
  it('accuracy returns sens/spec and adjusted PVs', async () => {
    const res = await post('/clinical/accuracy', {
      tp: 90,
      fp: 20,
      fn: 10,
      tn: 80,
      prevalence: 0.1,
    });
    expect(res.status).toBe(200);
    expect(res.body.result.sensitivity).toBeCloseTo(0.9, 10);
    expect(res.body.result.specificity).toBeCloseTo(0.8, 10);
    expect(res.body.result.ppvAdjusted).toBeCloseTo(1 / 3, 8);
  });

  it('rejects a degenerate 2×2 with 400', async () => {
    const res = await post('/clinical/accuracy', { tp: 0, fp: 0, fn: 0, tn: 10 });
    expect(res.status).toBe(400);
  });

  it('rejects invalid body with 400', async () => {
    const res = await post('/clinical/accuracy', { tp: -1, fp: 0, fn: 0, tn: 0 });
    expect(res.status).toBe(400);
  });
});
