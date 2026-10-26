/** A2.9 retains the scoped stored-journey read while separate writers retire. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { listProgramJourneys } = vi.hoisted(() => ({ listProgramJourneys: vi.fn() }));
vi.mock('../../services/program-journey/program-journey-service', () => ({ listProgramJourneys }));

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
  listProgramJourneys.mockReset();
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
