/**
 * GET + POST /api/program-journey — the converged journey read + write path.
 *
 * The route is thin: guard the org, delegate to the real program_journeys service
 * (overlay assembled from REAL stage rows), and shape the envelope. No blob, no
 * fallback — an org with no journeys gets an honest empty list; POST records a
 * journey; POST /:id/stages/:stageId advances a stage; 400 on invalid input. (The
 * full store round-trip is proven in
 * program-journey-service.pglite.integration.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { createProgramJourney, listProgramJourneys, updateJourneyStage, ProgramJourneyValidationError, logAction } = vi.hoisted(() => {
  class ProgramJourneyValidationError extends Error {}
  return {
    createProgramJourney: vi.fn(),
    listProgramJourneys: vi.fn(),
    updateJourneyStage: vi.fn(),
    ProgramJourneyValidationError,
    logAction: vi.fn(),
  };
});
vi.mock('../../services/program-journey/program-journey-service', () => ({
  createProgramJourney, listProgramJourneys, updateJourneyStage, ProgramJourneyValidationError,
}));
vi.mock('../../services/auditService', () => ({ default: { logAction } }));

import programJourneyRouter from '../program-journey.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 55 };
    next();
  });
  app.use('/api/program-journey', programJourneyRouter);
  return app;
}

function view(over: Record<string, unknown> = {}) {
  return {
    id: 'j-1', seg: 'pharma', code: 'BX-204', name: '', app: 'NDA 212345',
    modality: 'Small molecule', indication: 'Oncology', pathway: 'NDA · 505(b)(1)',
    sponsor: 'Concept2Cure', agency: 'FDA', readiness: 88, current: 'review',
    target: { label: 'PDUFA target action', v: '04 Apr 2027', agency: 'FDA · 41 days out' },
    overlay: { discovery: ['done', 100], review: ['active', 60] },
    modules: [], clock: [], haqs: [], contra: {}, blockers: [],
    ...over,
  };
}

beforeEach(() => {
  createProgramJourney.mockReset();
  listProgramJourneys.mockReset();
  updateJourneyStage.mockReset();
  logAction.mockReset();
});

describe('GET /api/program-journey', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/program-journey');
    expect(res.status).toBe(403);
    expect(listProgramJourneys).not.toHaveBeenCalled();
  });

  it('returns the real-store journeys, source = program_journeys', async () => {
    listProgramJourneys.mockResolvedValueOnce([view()]);
    const res = await request(appWith(7)).get('/api/program-journey');
    expect(res.status).toBe(200);
    expect(listProgramJourneys).toHaveBeenCalledWith(7);
    expect(res.body.meta.source).toBe('program_journeys');
    const j = res.body.data[0];
    for (const k of ['seg', 'code', 'app', 'readiness', 'current', 'target', 'overlay', 'modules', 'clock', 'haqs', 'contra', 'blockers']) {
      expect(j).toHaveProperty(k);
    }
    expect(j.overlay.review).toEqual(['active', 60]);
    expect(res.body.meta.count).toBe(1);
  });

  it('honest empty list when the org has no journeys — no fallback data', async () => {
    listProgramJourneys.mockResolvedValueOnce([]);
    const res = await request(appWith(7)).get('/api/program-journey');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });

  it('fails closed to an honest empty list when the store is not provisioned (42P01)', async () => {
    listProgramJourneys.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/program-journey');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});

describe('POST /api/program-journey', () => {
  it('records a journey and returns the assembled view (audited)', async () => {
    createProgramJourney.mockResolvedValueOnce(view({ id: 'j-9' }));
    const res = await request(appWith(7)).post('/api/program-journey').send({
      seg: 'pharma', code: 'BX-204', currentStage: 'review', readiness: 88,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('j-9');
    expect(createProgramJourney).toHaveBeenCalledWith(7, expect.objectContaining({
      seg: 'pharma', code: 'BX-204', currentStage: 'review', createdBy: 55,
    }));
    expect(logAction).toHaveBeenCalled();
  });

  it('400 on invalid input', async () => {
    createProgramJourney.mockRejectedValueOnce(new ProgramJourneyValidationError('seg must be …'));
    const res = await request(appWith(7)).post('/api/program-journey').send({ seg: 'devices', code: 'X', currentStage: 'review' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});

describe('POST /api/program-journey/:id/stages/:stageId', () => {
  it('advances a stage (audited)', async () => {
    updateJourneyStage.mockResolvedValueOnce({ journey_id: 'j-1', stage_id: 'review', status: 'done', pct: 100 });
    const res = await request(appWith(7)).post('/api/program-journey/j-1/stages/review').send({ status: 'done', pct: 100 });
    expect(res.status).toBe(200);
    expect(updateJourneyStage).toHaveBeenCalledWith(7, 'j-1', 'review', 'done', 100);
    expect(res.body.data.status).toBe('done');
    expect(logAction).toHaveBeenCalled();
  });

  it('400 on an invalid stage/status', async () => {
    updateJourneyStage.mockRejectedValueOnce(new ProgramJourneyValidationError('stageId must be …'));
    const res = await request(appWith(7)).post('/api/program-journey/j-1/stages/warp').send({ status: 'done', pct: 1 });
    expect(res.status).toBe(400);
  });
});
