/**
 * HTTP integration tests for the pure design-statistics endpoints added to the
 * biostatistics platform router. The underlying statistics are unit-tested in
 * tests/services/*; these assert the *served* layer — that each route is mounted,
 * authenticated, validates its input (400), and returns the expected success
 * shape (200). DB and auth are mocked; the handlers under test are pure.
 */

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// The router transitively imports services that touch the DB at module load.
vi.mock('../server/db', () => {
  const q = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return { pool: { query: q, connect: vi.fn() }, getPool: () => ({ query: q, connect: vi.fn() }), db: {} };
});

// Authenticate as a fixed org so resolveOrganizationId succeeds.
vi.mock('../server/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/middleware/auth')>();
  return {
    ...actual,
    authenticateToken: (req: any, _res: any, next: any) => {
      req.user = { id: 1, organizationId: 7 };
      next();
    },
  };
});

const { default: biostatRouter } = await import('../server/routes/biostatPlatform');

const app = express();
app.use(express.json());
app.use('/api/biostat', biostatRouter);

const post = (path: string, body: unknown) => request(app).post(`/api/biostat${path}`).send(body as object);

describe('biostat design-stats routes — success (200) and shape', () => {
  it('POST /adaptive/oc-exact', async () => {
    const r = await post('/adaptive/oc-exact', {
      informationFractions: [0.5, 1], spendingFunction: 'obrien-fleming', alpha: 0.025,
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it('POST /assurance', async () => {
    const r = await post('/assurance', { priorMean: 0.4, priorSd: 0.15, nPerArm: 100 });
    expect(r.status).toBe(200);
    expect(typeof r.body.data.assurance).toBe('number');
  });

  it('POST /multiplicity/test', async () => {
    const r = await post('/multiplicity/test', { pValues: [0.01, 0.04, 0.2], alpha: 0.05, procedure: 'holm' });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.rejectedIds)).toBe(true);
  });

  it('POST /diagnostic/sizing (single + co-primary)', async () => {
    const single = await post('/diagnostic/sizing', { goal: 0.8, expected: 0.9 });
    expect(single.status).toBe(200);
    expect(single.body.data.nNormalApprox).toBe(137); // default power 0.9 ⇒ 137 (108 at power 0.8)
    const co = await post('/diagnostic/sizing', {
      mode: 'co-primary', sensitivityGoal: 0.8, sensitivityExpected: 0.92,
      specificityGoal: 0.85, specificityExpected: 0.95, prevalence: 0.3,
    });
    expect(co.status).toBe(200);
    expect(typeof co.body.data.nTotal).toBe('number');
  });

  it('POST /diagnostic/mrmc', async () => {
    const r = await post('/diagnostic/mrmc', {
      aucDifference: 0.05, nReaders: 6, varTR: 0.0005, varError: 0.001,
      cov1: 0.0003, cov2: 0.0002, cov3: 0.0001,
    });
    expect(r.status).toBe(200);
    expect(typeof r.body.data.power).toBe('number');
  });

  it('POST /diagnostic/bayesian-device', async () => {
    const r = await post('/diagnostic/bayesian-device', {
      goal: 0.7, expected: 0.85, successThreshold: 0.975, targetPower: 0.9,
    });
    expect(r.status).toBe(200);
    expect(r.body.data.n).not.toBeNull();
  });

  it('POST /external-control/sensitivity', async () => {
    const r = await post('/external-control/sensitivity', {
      endpoint: 'change in HbA1c', meanT: 12, seT: 1, meanC: 10, seC: 1, nC: 100,
      meanH: 8, seH: 1, nH: 100, method: 'power-prior', a0: 0.5,
    });
    expect(r.status).toBe(200);
    expect(typeof r.body.data.memo).toBe('string');
  });

  it('POST /region-rules/evaluate and GET /region-rules/catalog', async () => {
    const r = await post('/region-rules/evaluate', { targetAgencies: ['PMDA', 'NMPA'] });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.findings)).toBe(true);
    const cat = await request(app).get('/api/biostat/region-rules/catalog?agency=PMDA');
    expect(cat.status).toBe(200);
    expect(cat.body.data.length).toBeGreaterThan(0);
  });

  it('POST /enrollment/forecast', async () => {
    const r = await post('/enrollment/forecast', { sites: [{ meanRate: 5 }, { meanRate: 3 }], targetN: 50, nSim: 200 });
    expect(r.status).toBe(200);
    expect(typeof r.body.data.completion.expectedTime).toBe('number');
  });

  it('POST /adaptive/event-projection', async () => {
    const r = await post('/adaptive/event-projection', {
      accrualRate: 10, accrualPeriod: 12, medianControl: 12, hazardRatio: 0.7,
      targetEvents: 40, dropoutHazard: 0.02, nSim: 200,
    });
    expect(r.status).toBe(200);
    expect(typeof r.body.data.forecast.medianTime).toBe('number');
  });

  it('POST /win-ratio', async () => {
    const r = await post('/win-ratio', {
      treatment: [{ levels: [{ value: 3 }] }, { levels: [{ value: 1 }] }],
      control: [{ levels: [{ value: 2 }] }, { levels: [{ value: 4 }] }],
      hierarchy: [{ type: 'continuous', direction: 'higher-better' }],
    });
    expect(r.status).toBe(200);
    expect(r.body.data.wins).toBe(1);
    expect(r.body.data.losses).toBe(3);
  });

  it('POST /dose-finding/boin', async () => {
    const r = await post('/dose-finding/boin', { target: 0.3, cohortSizes: [3, 6] });
    expect(r.status).toBe(200);
    expect(r.body.data.boundaries.lambdaE).toBeCloseTo(0.236491, 4);
    const dec = await post('/dose-finding/boin', { mode: 'decision', target: 0.3, nPatients: 3, nDlt: 0 });
    expect(dec.body.data.decision).toBe('escalate');
  });

  it('POST /survival/rmst (single + difference)', async () => {
    const one = await post('/survival/rmst', { tau: 5, treatment: { times: [1, 2, 3, 4], events: [1, 1, 1, 1] } });
    expect(one.status).toBe(200);
    expect(one.body.data.rmst).toBeCloseTo(2.5, 6);
    const diff = await post('/survival/rmst', {
      tau: 6,
      treatment: { times: [3, 4, 5, 6], events: [1, 1, 1, 1] },
      control: { times: [1, 2, 3, 4], events: [1, 1, 1, 1] },
    });
    expect(diff.status).toBe(200);
    expect(diff.body.data.difference).toBeGreaterThan(0);
  });
});

describe('biostat design-stats routes — validation (400)', () => {
  it('rejects missing required fields', async () => {
    expect((await post('/assurance', {})).status).toBe(400);
    expect((await post('/multiplicity/test', { pValues: [0.1], alpha: 0.05, procedure: 'nope' })).status).toBe(400);
    expect((await post('/region-rules/evaluate', { targetAgencies: [] })).status).toBe(400);
    expect((await post('/win-ratio', { treatment: [], control: [], hierarchy: [] })).status).toBe(400);
    expect((await post('/survival/rmst', { tau: 5 })).status).toBe(400);
  });
});
