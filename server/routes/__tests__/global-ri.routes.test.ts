/**
 * Global RI router HTTP contract — Module 1 requirements, review-timeline,
 * expedited programs, and pathway advice over the mounted router (supertest),
 * faked auth. The services are pure (no DB), so no db mock is needed.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  default: (_req: any, _res: any, next: any) => next(),
}));

import globalRiRouter from '../global-ri.routes';

let currentUser: any = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
let app: express.Express;

beforeAll(() => {
  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    if (currentUser) (req as any).user = currentUser;
    next();
  });
  app.use('/api/global-ri', globalRiRouter);
});

describe('regional Module 1 requirements', () => {
  it('403 without the regulatory-author role', async () => {
    currentUser = { id: 9, organizationId: 1, roles: ['viewer'] };
    const res = await request(app).get('/api/global-ri/module1/requirements/FDA');
    expect(res.status).toBe(403);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });

  it('GET /module1/requirements/:market → 200 list', async () => {
    const res = await request(app).get('/api/global-ri/module1/requirements/EMA');
    expect(res.status).toBe(200);
    expect(res.body.market).toBe('EMA');
    expect(res.body.requirements.length).toBeGreaterThan(0);
  });

  it('GET /module1/requirements/:market → 404 for an unmodeled market', async () => {
    const res = await request(app).get('/api/global-ri/module1/requirements/ZZZ');
    expect(res.status).toBe(404);
  });

  it('POST /module1/assess → 200 not-ready when a component is missing', async () => {
    const res = await request(app).post('/api/global-ri/module1/assess').send({ market: 'FDA', providedComponents: ['us_cover_letter'] });
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.missing).toContain('us_356h');
  });

  it('POST /module1/assess → 400 without market/providedComponents', async () => {
    const res = await request(app).post('/api/global-ri/module1/assess').send({ market: 'FDA' });
    expect(res.status).toBe(400);
  });
});

describe('review-timeline projection', () => {
  it('POST /review-timeline → 200 with milestones for FDA IND', async () => {
    const res = await request(app).post('/api/global-ri/review-timeline').send({ region: 'FDA', procedure: 'IND', startDate: '2026-01-01' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.milestones)).toBe(true);
    expect(res.body.milestones.length).toBeGreaterThan(0);
  });

  it('POST /review-timeline → 400 for an unknown region/procedure', async () => {
    const res = await request(app).post('/api/global-ri/review-timeline').send({ region: 'FDA', procedure: 'NOT_A_PROCEDURE', startDate: '2026-01-01' });
    expect(res.status).toBe(400);
  });

  it('POST /review-timeline → 400 without required fields', async () => {
    const res = await request(app).post('/api/global-ri/review-timeline').send({ region: 'FDA' });
    expect(res.status).toBe(400);
  });
});

describe('expedited programs', () => {
  it('GET /expedited-programs → 200 catalog', async () => {
    const res = await request(app).get('/api/global-ri/expedited-programs');
    expect(res.status).toBe(200);
    expect(res.body.programs.length).toBeGreaterThan(0);
  });

  it('POST /expedited-programs/match → 200', async () => {
    const res = await request(app).post('/api/global-ri/expedited-programs/match').send({ region: 'FDA', seriousOrLifeThreatening: true, unmetMedicalNeed: true });
    expect(res.status).toBe(200);
  });

  it('POST /expedited-programs/match → 400 without region', async () => {
    const res = await request(app).post('/api/global-ri/expedited-programs/match').send({});
    expect(res.status).toBe(400);
  });
});

describe('pathway advice', () => {
  it('POST /pathway → 200 with per-market recommendations', async () => {
    const res = await request(app).post('/api/global-ri/pathway').send({ productType: 'biologic', targetMarkets: ['US', 'EU'] });
    expect(res.status).toBe(200);
    expect(res.body.recommendations.length).toBe(2);
    expect(res.body.recommendations[0].market).toBe('US');
  });

  it('POST /pathway → 400 without productType/targetMarkets', async () => {
    const res = await request(app).post('/api/global-ri/pathway').send({ productType: 'biologic' });
    expect(res.status).toBe(400);
  });
});

describe('HA meetings', () => {
  it('GET /meetings → 200 catalog; ?market=FDA filters', async () => {
    const all = await request(app).get('/api/global-ri/meetings');
    expect(all.status).toBe(200);
    expect(all.body.meetings.length).toBeGreaterThan(0);
    const fda = await request(app).get('/api/global-ri/meetings?market=FDA');
    expect(fda.body.meetings.every((m: any) => m.market === 'FDA')).toBe(true);
  });

  it('POST /meetings/recommend → 200 with a Pre-IND meeting', async () => {
    const res = await request(app).post('/api/global-ri/meetings/recommend').send({ market: 'FDA', milestone: 'pre_ind' });
    expect(res.status).toBe(200);
    expect(res.body.recommended.length).toBeGreaterThan(0);
  });

  it('POST /meetings/recommend → 400 without market/milestone', async () => {
    const res = await request(app).post('/api/global-ri/meetings/recommend').send({ market: 'FDA' });
    expect(res.status).toBe(400);
  });
});

describe('special designations', () => {
  it('GET /designations/criteria/:market → 200', async () => {
    const res = await request(app).get('/api/global-ri/designations/criteria/FDA');
    expect(res.status).toBe(200);
    expect(res.body.market).toBe('FDA');
  });

  it('POST /designations/assess → 200 orphan-eligible for low US prevalence', async () => {
    const res = await request(app).post('/api/global-ri/designations/assess').send({ market: 'FDA', usPrevalence: 150000 });
    expect(res.status).toBe(200);
    expect(res.body.orphan.eligible).toBe(true);
  });

  it('POST /designations/assess → 400 without market', async () => {
    const res = await request(app).post('/api/global-ri/designations/assess').send({});
    expect(res.status).toBe(400);
  });
});

describe('strategy brief', () => {
  it('POST /strategy-brief → 200 cross-market brief', async () => {
    const res = await request(app)
      .post('/api/global-ri/strategy-brief')
      .send({ productType: 'biologic', targetMarkets: ['US', 'EU'], nextMilestone: 'pre_ind', disease: { usPrevalence: 150000, seriousOrLifeThreatening: true, unmetMedicalNeed: true } });
    expect(res.status).toBe(200);
    expect(res.body.markets.length).toBe(2);
    expect(res.body.markets[0].agency).toBe('FDA');
    expect(res.body.summary).toHaveProperty('orphanEligibleMarkets');
  });

  it('POST /strategy-brief → 400 without productType/targetMarkets', async () => {
    const res = await request(app).post('/api/global-ri/strategy-brief').send({ productType: 'biologic' });
    expect(res.status).toBe(400);
  });
});
