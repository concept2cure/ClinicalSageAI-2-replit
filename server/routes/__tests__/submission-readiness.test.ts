/**
 * Submission-readiness API contract. Auth mocked; no DB.
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
  const router = (await import('../submission-readiness')).default;
  app = express();
  app.use(express.json());
  app.use('/api/submission-readiness', router);
});

describe('submission-readiness API', () => {
  // 2026-10-15: pinned 'not-ready' with gaps for the five domains it did not send (scored 0).
  it('assesses a pathway and returns a verdict, prioritized gaps and the domains not assessed', async () => {
    const res = await request(app)
      .post('/api/submission-readiness/assess')
      .send({ pathway: '510k', domainScores: { substantialEquivalence: 1, udiGudid: 0.4 } });
    expect(res.status).toBe(200);
    expect(res.body.result.verdict).toBe('incomplete');
    expect(res.body.result.prioritizedGaps.map((g: { domain: string }) => g.domain)).toEqual(['udiGudid']);
    expect(res.body.result.notAssessedDomains).toEqual(['cybersecurity', 'humanFactors', 'labelingSpl', 'postMarketPlan']);
  });

  it('rejects an unknown pathway with 400', async () => {
    const res = await request(app)
      .post('/api/submission-readiness/assess')
      .send({ pathway: 'nope', domainScores: {} });
    expect(res.status).toBe(400);
  });

  it('exposes the pathway → domains map', async () => {
    const res = await request(app).get('/api/submission-readiness/pathways');
    expect(res.status).toBe(200);
    expect(res.body.result['510k']).toContain('substantialEquivalence');
  });
});
