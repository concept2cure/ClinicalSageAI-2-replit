/**
 * Tenant-isolation contract test — Foresight AI Advanced family.
 *
 * Regression guard for cross-tenant writes to clinical trial data:
 * server/routes/foresight-ai-advanced.ts persisted/scoped nine POST handlers on
 * a body-supplied organizationId, wrote DLT events against any cohort, and
 * served study intelligence for any study id. The org must come from the JWT
 * (forceJwtOrg), and cohort/study access must be limited to the caller's org.
 *
 * The router relies on the global /api auth gate, so auth is injected here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { ORG_A, TARGET_ORG, engine, valuesSpy, selectResults, authState } = vi.hoisted(() => ({
  ORG_A: 7,
  TARGET_ORG: 999,
  engine: {
    generateAdvancedPrediction: vi.fn(async (_p: any) => ({ ok: true })),
    calculateOptimalDoseEscalation: vi.fn(async (_id?: any) => ({ rec: 'hold' })),
    monitorStudyIntelligence: vi.fn(async (_id?: any) => ({ alerts: [] })),
  },
  valuesSpy: vi.fn((_v: any) => ({ returning: vi.fn(async () => [{ id: 'STUDY-1' }]) })),
  selectResults: { queue: [] as any[][], default: [] as any[] },
  authState: { orgId: 7 as number | null },
}));

function makeSelectChain(result: any[]) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
  };
  return chain;
}

vi.mock('../../services/foresight-ai-engine', () => ({
  ForesightAIEngine: class {
    generateAdvancedPrediction = engine.generateAdvancedPrediction;
    calculateOptimalDoseEscalation = engine.calculateOptimalDoseEscalation;
    monitorStudyIntelligence = engine.monitorStudyIntelligence;
  },
}));
vi.mock('../../db', () => ({
  db: {
    insert: vi.fn(() => ({ values: valuesSpy })),
    update: vi.fn(() => ({ set: () => ({ where: vi.fn(async () => undefined) }) })),
    select: vi.fn(() =>
      makeSelectChain(selectResults.queue.length ? selectResults.queue.shift()! : selectResults.default)
    ),
  },
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.orgId = ORG_A;
  selectResults.queue = [];
  selectResults.default = [];
  const router = (await import('../../routes/foresight-ai-advanced')).default;
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (authState.orgId != null) (req as any).user = { id: 1, organizationId: authState.orgId };
    next();
  });
  app.use('/api/foresight', router);
});

describe('Tenant isolation — foresight writes', () => {
  it('POST /predictions/advanced forces the JWT org over a spoofed body org', async () => {
    const res = await request(app)
      .post('/api/foresight/predictions/advanced')
      .send({ organizationId: String(TARGET_ORG), studyPhase: 'I', biomarkerData: [] });
    expect(res.status).toBe(200);
    expect(engine.generateAdvancedPrediction.mock.calls[0][0].organizationId).toBe(String(ORG_A));
  });

  it('POST /dose-escalation/optimize persists the JWT org, not the body org', async () => {
    const res = await request(app)
      .post('/api/foresight/dose-escalation/optimize')
      .send({ organizationId: String(TARGET_ORG), compound: 'X', indication: 'Y' });
    expect(res.status).toBe(200);
    expect(valuesSpy.mock.calls[0][0].organizationId).toBe(ORG_A);
  });

  it('POST /dose-escalation/report-dlt 404s on a cohort whose study is another org', async () => {
    // 1st select → the cohort exists; 2nd select → no study owned by caller org.
    selectResults.queue = [[{ id: 'c1', studyId: 's-foreign' }], []];
    const res = await request(app)
      .post('/api/foresight/dose-escalation/report-dlt')
      .send({
        cohortId: 'c1',
        patientId: 'p1',
        dltType: 'neutropenia',
        grade: 3,
        onsetDay: 5,
        description: 'x',
        outcome: 'resolved',
        attribution: 'possible',
      });
    expect(res.status).toBe(404);
  });
});

describe('Tenant isolation — foresight reads', () => {
  it('GET /monitor/study/:id 404s on a study not owned by the caller', async () => {
    selectResults.default = []; // no study under caller org
    const res = await request(app).get(
      '/api/foresight/monitor/study/11111111-1111-1111-1111-111111111111'
    );
    expect(res.status).toBe(404);
    expect(engine.monitorStudyIntelligence).not.toHaveBeenCalled();
  });
});

describe('Tenant isolation — foresight auth', () => {
  it('403s without an authenticated org', async () => {
    authState.orgId = null;
    await request(app)
      .post('/api/foresight/predictions/advanced')
      .send({ organizationId: String(ORG_A), studyPhase: 'I', biomarkerData: [] })
      .expect(403);
    expect(engine.generateAdvancedPrediction).not.toHaveBeenCalled();
  });
});
