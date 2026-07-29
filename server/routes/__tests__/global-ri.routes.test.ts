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

describe('regulatory fees', () => {
  it('GET /fees/schedule/:market → 200', async () => {
    const res = await request(app).get('/api/global-ri/fees/schedule/FDA');
    expect(res.status).toBe(200);
    expect(res.body.schedule.currency).toBe('USD');
  });

  it('GET /fees/schedule/:market → 404 for an unmodeled market', async () => {
    const res = await request(app).get('/api/global-ri/fees/schedule/ZZZ');
    expect(res.status).toBe(404);
  });

  it('POST /fees/estimate → 200 with a total', async () => {
    const res = await request(app).post('/api/global-ri/fees/estimate').send({ market: 'FDA' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.caveats.length).toBeGreaterThan(0);
  });

  it('POST /fees/estimate → orphan waives to zero', async () => {
    const res = await request(app).post('/api/global-ri/fees/estimate').send({ market: 'FDA', orphan: true });
    expect(res.body.total).toBe(0);
  });

  it('POST /fees/estimate → 400 without market', async () => {
    const res = await request(app).post('/api/global-ri/fees/estimate').send({});
    expect(res.status).toBe(400);
  });
});

describe('cross-market labeling', () => {
  it('GET /labeling/requirements/:market → 200', async () => {
    const res = await request(app).get('/api/global-ri/labeling/requirements/FDA');
    expect(res.status).toBe(200);
    expect(res.body.sections.length).toBeGreaterThan(0);
  });

  it('POST /labeling/assess → 200 not-ready when a section is missing', async () => {
    const res = await request(app).post('/api/global-ri/labeling/assess').send({ market: 'FDA', providedSections: [] });
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.missing.length).toBeGreaterThan(0);
  });

  it('POST /labeling/assess → 400 without market/providedSections', async () => {
    const res = await request(app).post('/api/global-ri/labeling/assess').send({ market: 'FDA' });
    expect(res.status).toBe(400);
  });
});

describe('clinical-trial-application requirements', () => {
  it('GET /cta/requirements/:market → 200', async () => {
    const res = await request(app).get('/api/global-ri/cta/requirements/FDA');
    expect(res.status).toBe(200);
    expect(res.body.requirements.length).toBeGreaterThan(0);
  });

  it('POST /cta/assess → 200 not-ready when a component is missing', async () => {
    const res = await request(app).post('/api/global-ri/cta/assess').send({ market: 'FDA', providedComponents: [] });
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(false);
  });

  it('POST /cta/assess → 400 without required fields', async () => {
    const res = await request(app).post('/api/global-ri/cta/assess').send({ market: 'FDA' });
    expect(res.status).toBe(400);
  });
});

describe('post-approval changes', () => {
  it('GET /changes/vehicles/:market → 200 with categories + vehicles', async () => {
    const res = await request(app).get('/api/global-ri/changes/vehicles/FDA');
    expect(res.status).toBe(200);
    expect(res.body.categories.length).toBeGreaterThan(0);
    expect(res.body.vehicles.manufacturing_process_major.reportingCategory).toBe('PAS');
  });

  it('POST /changes/classify → 200 (EMA major → Type II)', async () => {
    const res = await request(app).post('/api/global-ri/changes/classify').send({ market: 'EMA', category: 'manufacturing_process_major' });
    expect(res.status).toBe(200);
    expect(res.body.vehicle.reportingCategory).toBe('Type II');
    expect(res.body.vehicle.priorApprovalRequired).toBe(true);
  });

  it('POST /changes/classify → 400 for an unknown category', async () => {
    const res = await request(app).post('/api/global-ri/changes/classify').send({ market: 'FDA', category: 'not_a_change' });
    expect(res.status).toBe(400);
  });

  it('POST /changes/classify → 400 without market/category', async () => {
    const res = await request(app).post('/api/global-ri/changes/classify').send({ market: 'FDA' });
    expect(res.status).toBe(400);
  });
});

describe('ICH guideline catalog', () => {
  it('GET /ich-guidelines → 200 catalog; ?q= searches; ?category= filters', async () => {
    const all = await request(app).get('/api/global-ri/ich-guidelines');
    expect(all.status).toBe(200);
    expect(all.body.guidelines.length).toBeGreaterThan(0);
    const search = await request(app).get('/api/global-ri/ich-guidelines?q=stability');
    expect(search.body.guidelines.some((g: any) => g.code === 'Q1')).toBe(true);
    const cat = await request(app).get('/api/global-ri/ich-guidelines?category=Efficacy');
    expect(cat.body.guidelines.every((g: any) => g.category === 'Efficacy')).toBe(true);
  });

  it('GET /ich-guidelines/:code → 200 (E6 = GCP); unknown → 404', async () => {
    const e6 = await request(app).get('/api/global-ri/ich-guidelines/E6');
    expect(e6.status).toBe(200);
    expect(e6.body.title.toLowerCase()).toContain('clinical practice');
    expect((await request(app).get('/api/global-ri/ich-guidelines/ZZ99')).status).toBe(404);
  });
});

describe('regulatory guidance map', () => {
  it('GET /guidance/topics → 200 list', async () => {
    const res = await request(app).get('/api/global-ri/guidance/topics');
    expect(res.status).toBe(200);
    expect(res.body.topics.length).toBeGreaterThan(10);
  });

  it('GET /guidance/:topic → 200 grounds CSR in E3', async () => {
    const res = await request(app).get('/api/global-ri/guidance/clinical_study_report');
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);
    expect(res.body.ichGuidelines.map((g: any) => g.code)).toContain('E3');
  });

  it('GET /guidance/:topic → 404 for an unmodeled topic', async () => {
    expect((await request(app).get('/api/global-ri/guidance/not_a_topic')).status).toBe(404);
  });
});

describe('submission economics', () => {
  it('POST /submission-economics → 200 with fees + timeline + summary', async () => {
    const res = await request(app).post('/api/global-ri/submission-economics').send({ market: 'FDA', procedure: 'NDA_STANDARD', startDate: '2026-01-01' });
    expect(res.status).toBe(200);
    expect(res.body.summary.totalFee).toBeGreaterThan(0);
    expect(res.body.summary.reviewDays).toBeGreaterThan(0);
    expect(res.body.summary.targetDecisionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('POST /submission-economics → 400 for an unknown procedure', async () => {
    const res = await request(app).post('/api/global-ri/submission-economics').send({ market: 'FDA', procedure: 'NOPE', startDate: '2026-01-01' });
    expect(res.status).toBe(400);
  });

  it('POST /submission-economics → 400 without required fields', async () => {
    const res = await request(app).post('/api/global-ri/submission-economics').send({ market: 'FDA' });
    expect(res.status).toBe(400);
  });
});
