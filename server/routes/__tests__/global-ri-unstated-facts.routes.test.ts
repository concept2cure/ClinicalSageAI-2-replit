/**
 * Global RI over HTTP: a fact nobody stated is reported as not assessed or
 * refused by name, never answered as if it had been stated.
 *
 * Until 2026-10-15, over these routes:
 *  - POST /safety-reporting/classify {region:'FDA'} returned reportable:false,
 *    "not serious, not unexpected, no suspected causal relationship";
 *  - POST /strategy-brief costed a met orphan prevalence screen as a held
 *    designation (fee total 0) and counted EU exclusivity at 144 months, and
 *    with no disease facts summarised orphan/expedited as none;
 *  - POST /expedited-programs/match {region:'FDA'} listed every program as
 *    not suitable;
 *  - POST /combination/classify {region:'EU'} answered the integral (Notified
 *    Body Opinion) route without being told the device is integral.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import globalRiRouter from '../global-ri.routes';

let app: express.Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
    next();
  });
  app.use('/api/global-ri', globalRiRouter);
});

describe('global-RI routes — unstated facts', () => {
  it('POST /safety-reporting/classify with no criteria → not_assessed with the missing criteria', async () => {
    const res = await request(app).post('/api/global-ri/safety-reporting/classify').send({ region: 'FDA' });
    expect(res.status).toBe(200);
    expect(res.body.reportable).toBe('not_assessed');
    expect(res.body.missing).toEqual(['serious', 'unexpected', 'suspectedCausality']);
    expect(res.body.rationale).not.toMatch(/not serious/);
  });

  it('POST /strategy-brief → fees charged in full and base exclusivity only, on a met orphan screen', async () => {
    const res = await request(app)
      .post('/api/global-ri/strategy-brief')
      .send({
        productType: 'small_molecule_nce',
        targetMarkets: ['US', 'EU'],
        disease: { usPrevalence: 150000, euPrevalencePer10k: 3, seriousOrLifeThreatening: true, significantBenefit: true },
        pediatricDevelopment: true,
      });
    expect(res.status).toBe(200);
    for (const m of res.body.markets) expect(m.feeEstimate.total).toBeGreaterThan(0);
    expect(res.body.summary.maxExclusivityMonths).toBe(120);
  });

  it('POST /strategy-brief with no disease facts → not assessed, not none', async () => {
    const res = await request(app)
      .post('/api/global-ri/strategy-brief')
      .send({ productType: 'small_molecule_nce', targetMarkets: ['US', 'EU'] });
    expect(res.status).toBe(200);
    expect(res.body.summary.orphanNotAssessedMarkets).toEqual(['FDA', 'EMA']);
    expect(res.body.summary.expeditedProgramsNotAssessed).toBeGreaterThan(0);
  });

  it('POST /expedited-programs/match with no facts → nothing called not suitable', async () => {
    const res = await request(app).post('/api/global-ri/expedited-programs/match').send({ region: 'FDA' });
    expect(res.status).toBe(200);
    expect(res.body.notSuitable).toEqual([]);
    expect(res.body.notAssessed.length).toBe(5);
  });

  it('POST /combination/classify for EU without integral → 400 naming integral', async () => {
    const res = await request(app).post('/api/global-ri/combination/classify').send({ region: 'EU' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/integral/);
  });

  it('POST /combination/classify for EU with integral stated → 200', async () => {
    const res = await request(app).post('/api/global-ri/combination/classify').send({ region: 'EU', integral: false });
    expect(res.status).toBe(200);
    expect(res.body.regulatoryRoute).toContain('non-integral');
  });
});
