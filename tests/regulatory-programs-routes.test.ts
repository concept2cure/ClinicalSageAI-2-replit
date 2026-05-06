/**
 * Integration tests for /api/regulatory-programs and
 * /api/saved-precedent-queries.
 *
 * Validates the HTTP-layer contract: envelope shapes, status codes,
 * auth gates, query-param validation, error envelopes. The service
 * functions are mocked so each test asserts route behavior in
 * isolation against a real (in-process) Express app via supertest.
 *
 * Coverage: 11 read endpoints on /api/regulatory-programs and 4 CRUD
 * endpoints on /api/saved-precedent-queries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/* Mock the regulatory-programs service module — the route file
   imports from it via `import * as svc from ...`. Each test stubs
   only the function the endpoint calls. */
vi.mock('../server/services/regulatory-programs.service', () => ({
  listPrograms:           vi.fn(),
  getProgramById:         vi.fn(),
  getActivity:            vi.fn(),
  getMilestones:          vi.fn(),
  getRimRecommendations:  vi.fn(),
  getChangeImpact:        vi.fn(),
  getSafetySignals:       vi.fn(),
  getLiterature:          vi.fn(),
  getPmaModules:          vi.fn(),
  getPmaTrialMetrics:     vi.fn(),
  getPortfolioInsights:   vi.fn(),
  requireProgramInOrg:    vi.fn(),
}));

/* Mock the database modules so saved-precedent-queries route handlers
   resolve without an actual db connection. */
vi.mock('../server/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: 1, label: 'l', query: 'q', scope: null, hits: -1, lastRunAt: null, userId: null, createdAt: new Date(), updatedAt: new Date(), organizationId: 99 }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => []),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => []),
      })),
    })),
  },
  pool: { query: vi.fn() },
}));

import * as svc from '../server/services/regulatory-programs.service';
import regulatoryProgramsRouter from '../server/routes/regulatory-programs';
import savedPrecedentQueriesRouter from '../server/routes/saved-precedent-queries';

const PROGRAM_ID = '11111111-2222-3333-4444-000000000204';

function makeApp(opts: { withAuth?: boolean } = { withAuth: true }) {
  const app = express();
  app.use(express.json());
  if (opts.withAuth) {
    app.use((req, _res, next) => {
      (req as express.Request & { organizationId?: number; user?: { id: number; organizationId: number } }).organizationId = 99;
      (req as express.Request & { organizationId?: number; user?: { id: number; organizationId: number } }).user = { id: 777, organizationId: 99 };
      next();
    });
  }
  app.use('/api/regulatory-programs', regulatoryProgramsRouter);
  app.use('/api/saved-precedent-queries', savedPrecedentQueriesRouter);
  return app;
}

describe('regulatory-programs routes — auth gate', () => {
  it('GET / returns 403 when no org context attached', async () => {
    const app = makeApp({ withAuth: false });
    const res = await request(app).get('/api/regulatory-programs');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Organization context required' });
  });

  it('GET /:id returns 403 when no org context attached', async () => {
    const app = makeApp({ withAuth: false });
    const res = await request(app).get(`/api/regulatory-programs/${PROGRAM_ID}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Organization context required' });
  });

  it('GET /:id/activity returns 403 when no org context attached', async () => {
    const app = makeApp({ withAuth: false });
    const res = await request(app).get(`/api/regulatory-programs/${PROGRAM_ID}/activity`);
    expect(res.status).toBe(403);
  });

  it('GET /portfolio-insights returns 403 when no org context attached', async () => {
    const app = makeApp({ withAuth: false });
    const res = await request(app).get('/api/regulatory-programs/portfolio-insights');
    expect(res.status).toBe(403);
  });
});

describe('regulatory-programs routes — list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET / returns 200 with { data: Program[] } envelope', async () => {
    vi.mocked(svc.listPrograms).mockResolvedValueOnce([
      { id: PROGRAM_ID, name: 'BX-204', code: 'BX-204', description: null, programType: '510K',
        productType: 'device', deviceClass: 'II', regulatoryPath: '510k', primaryAgency: 'FDA',
        productName: 'BX-204 CGM', status: 'active', phase: 'authoring', priority: 'high',
        targetSubmissionDate: null, progressPercent: 50, completedMilestones: 2,
        totalMilestones: 5, leadUserId: 1, leadUserName: 'Test', teamMembers: null,
        metadata: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
    const res = await request(makeApp()).get('/api/regulatory-programs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].code).toBe('BX-204');
    expect(res.body).not.toHaveProperty('error');
  });

  it('GET /?programType=510K passes the filter to the service', async () => {
    vi.mocked(svc.listPrograms).mockResolvedValueOnce([]);
    await request(makeApp()).get('/api/regulatory-programs?programType=510K');
    expect(svc.listPrograms).toHaveBeenCalledWith(99, { programType: '510K' });
  });

  it('GET /?programType=invalid returns 422 with field errors', async () => {
    const res = await request(makeApp()).get('/api/regulatory-programs?programType=invalid');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Invalid query parameters');
    expect(res.body.details).toBeDefined();
    expect(svc.listPrograms).not.toHaveBeenCalled();
  });

  it('GET / returns 500 with sanitized envelope on service error', async () => {
    vi.mocked(svc.listPrograms).mockRejectedValueOnce(new Error('DB down'));
    const res = await request(makeApp()).get('/api/regulatory-programs');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'DB down' });
  });
});

describe('regulatory-programs routes — single program', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /:id returns 200 + { data } when program found', async () => {
    vi.mocked(svc.getProgramById).mockResolvedValueOnce({
      id: PROGRAM_ID, name: 'BX-204', code: 'BX-204', description: null,
      programType: '510K', productType: 'device', deviceClass: 'II',
      regulatoryPath: '510k', primaryAgency: 'FDA', productName: 'BX-204',
      status: 'active', phase: null, priority: null, targetSubmissionDate: null,
      progressPercent: 0, completedMilestones: 0, totalMilestones: 0,
      leadUserId: null, leadUserName: null, teamMembers: null, metadata: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    });
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(PROGRAM_ID);
  });

  it('GET /:id returns 404 with notFoundInTenant envelope when program missing', async () => {
    vi.mocked(svc.getProgramById).mockResolvedValueOnce(null);
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Program not found' });
  });
});

describe('regulatory-programs routes — sidecar feeds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /:id/activity returns 200 + { data: ActivityEvent[] }', async () => {
    vi.mocked(svc.getActivity).mockResolvedValueOnce([
      { id: 'aud-1', when: '2026-01-01T00:00:00Z', who: 'Sofia', what: 'updated phase', action: 'update', changedFields: ['phase'] },
    ]);
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/activity`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(svc.getActivity).toHaveBeenCalledWith(99, PROGRAM_ID, 50);
  });

  it('GET /:id/activity respects ?limit query param via Zod', async () => {
    vi.mocked(svc.getActivity).mockResolvedValueOnce([]);
    await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/activity?limit=10`);
    expect(svc.getActivity).toHaveBeenCalledWith(99, PROGRAM_ID, 10);
  });

  it('GET /:id/activity returns 422 when limit is out of range', async () => {
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/activity?limit=10000`);
    expect(res.status).toBe(422);
    expect(res.body.details).toBeDefined();
  });

  it('GET /:id/activity returns 404 when program not in tenant', async () => {
    vi.mocked(svc.getActivity).mockResolvedValueOnce(null);
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/activity`);
    expect(res.status).toBe(404);
  });

  it('GET /:id/milestones returns 200 + { data: Milestone[] }', async () => {
    vi.mocked(svc.getMilestones).mockResolvedValueOnce([
      { id: 'm-qsub', label: 'Q-Sub meeting', date: '2025-06-03', state: 'complete' },
    ]);
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/milestones`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].state).toBe('complete');
  });

  it('GET /:id/rim-recommendations returns 200 + { data: RimRec[] }', async () => {
    vi.mocked(svc.getRimRecommendations).mockResolvedValueOnce([
      { id: 'rec-1', body: 'Close 3 gaps', kind: 'mapping', impact: 'high' },
    ]);
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/rim-recommendations`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].impact).toBe('high');
  });

  it('GET /:id/change-impact returns 200 + { data: ChangeImpact[] }', async () => {
    vi.mocked(svc.getChangeImpact).mockResolvedValueOnce([
      { id: '1', who: 'Sofia', when: '2026-01-01', what: 'edited §11', affects: ['§13'] },
    ]);
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/change-impact`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].affects).toEqual(['§13']);
  });

  it('GET /:id/safety-signals returns 200 + { data: SafetySignalRow[] }', async () => {
    vi.mocked(svc.getSafetySignals).mockResolvedValueOnce([
      { id: 's1', source: 'FAERS', event: 'AE', count: 5, severity: 'serious', status: 'review', detectedAt: '2026-01-01' },
    ]);
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/safety-signals`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].source).toBe('FAERS');
  });

  it('GET /:id/literature returns 200 + { data: buckets, meta: { total, productName } }', async () => {
    vi.mocked(svc.getLiterature).mockResolvedValueOnce({
      buckets: [{ year: 2026, hits: 12 }, { year: 2025, hits: 8 }],
      total:   20,
      productName: 'BX-204',
    });
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/literature`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toEqual({ total: 20, productName: 'BX-204' });
  });

  it('GET /:id/pma-modules returns 200 + { data: PmaModule[] }', async () => {
    vi.mocked(svc.getPmaModules).mockResolvedValueOnce([
      { id: 'preclinical', label: 'Preclinical', desc: 'Bench', docs: 47, status: 'complete' },
    ]);
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/pma-modules`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe('preclinical');
  });

  it('GET /:id/pma-trial-metrics returns 200 + { data: TrialMetric[], meta: { study } }', async () => {
    vi.mocked(svc.getPmaTrialMetrics).mockResolvedValueOnce({
      metrics: [{ label: 'Enrolled', metric: '412/680', meta: '60% of target' }],
      study:   { id: 's1', name: 'CV-330 IDE', phase: 'pivotal', status: 'active' },
    });
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/pma-trial-metrics`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.study).toEqual({ id: 's1', name: 'CV-330 IDE', phase: 'pivotal', status: 'active' });
  });

  it('GET /:id/pma-trial-metrics returns meta.study=null when no study linked', async () => {
    vi.mocked(svc.getPmaTrialMetrics).mockResolvedValueOnce({
      metrics: [{ label: 'Enrolled', metric: '—', meta: 'No study linked', tone: 'warn' }],
      study:   null,
    });
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/pma-trial-metrics`);
    expect(res.body.meta.study).toBeNull();
  });

  it('GET /portfolio-insights returns 200 + { data: PortfolioInsight[] }', async () => {
    vi.mocked(svc.getPortfolioInsights).mockResolvedValueOnce([
      { kind: 'clearance-mix', body: '3 of 4 cleared via 510(k)' },
    ]);
    const res = await request(makeApp()).get('/api/regulatory-programs/portfolio-insights');
    expect(res.status).toBe(200);
    expect(res.body.data[0].kind).toBe('clearance-mix');
    /* Confirm /portfolio-insights routes BEFORE /:id (literal path
       wins) — if it didn't, getProgramById would have been called
       with id='portfolio-insights' instead of getPortfolioInsights. */
    expect(svc.getProgramById).not.toHaveBeenCalled();
    expect(svc.getPortfolioInsights).toHaveBeenCalledWith(99);
  });
});

describe('saved-precedent-queries routes — auth + validation gates', () => {
  it('GET / returns 403 without org context', async () => {
    const app = makeApp({ withAuth: false });
    const res = await request(app).get('/api/saved-precedent-queries');
    expect(res.status).toBe(403);
  });

  it('POST / returns 422 when body is missing required fields', async () => {
    const res = await request(makeApp()).post('/api/saved-precedent-queries').send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toBeDefined();
  });

  it('POST / returns 422 when label is empty string', async () => {
    const res = await request(makeApp())
      .post('/api/saved-precedent-queries')
      .send({ label: '   ', query: 'something' });
    expect(res.status).toBe(422);
  });

  it('POST / returns 422 when scope contains an unknown pathway', async () => {
    const res = await request(makeApp())
      .post('/api/saved-precedent-queries')
      .send({ label: 'l', query: 'q', scope: { pathway: 'ind' } });
    expect(res.status).toBe(422);
  });

  it('POST / returns 201 + { data } on successful create', async () => {
    const res = await request(makeApp())
      .post('/api/saved-precedent-queries')
      .send({ label: 'CGM 14-day wear', query: 'continuous glucose 14-day' });
    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body).not.toHaveProperty('error');
  });

  it('PATCH /:id returns 422 when id is non-numeric', async () => {
    const res = await request(makeApp())
      .patch('/api/saved-precedent-queries/abc')
      .send({ hits: 10 });
    expect(res.status).toBe(422);
  });

  it('DELETE /:id returns 422 when id is non-numeric', async () => {
    const res = await request(makeApp()).delete('/api/saved-precedent-queries/abc');
    expect(res.status).toBe(422);
  });
});

describe('envelope shape — every successful response is { data } or { data, meta }', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list endpoint never sets sibling fields outside meta', async () => {
    vi.mocked(svc.listPrograms).mockResolvedValueOnce([]);
    const res = await request(makeApp()).get('/api/regulatory-programs');
    const keys = Object.keys(res.body);
    expect(keys).toEqual(['data']);
  });

  it('literature endpoint puts total + productName under meta (no sibling fields)', async () => {
    vi.mocked(svc.getLiterature).mockResolvedValueOnce({ buckets: [], total: 0, productName: 'X' });
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/literature`);
    const keys = Object.keys(res.body).sort();
    expect(keys).toEqual(['data', 'meta']);
    expect(Object.keys(res.body.meta).sort()).toEqual(['productName', 'total']);
  });

  it('pma-trial-metrics puts study under meta (no sibling fields)', async () => {
    vi.mocked(svc.getPmaTrialMetrics).mockResolvedValueOnce({ metrics: [], study: null });
    const res = await request(makeApp()).get(`/api/regulatory-programs/${PROGRAM_ID}/pma-trial-metrics`);
    const keys = Object.keys(res.body).sort();
    expect(keys).toEqual(['data', 'meta']);
    expect(Object.keys(res.body.meta)).toEqual(['study']);
  });
});
