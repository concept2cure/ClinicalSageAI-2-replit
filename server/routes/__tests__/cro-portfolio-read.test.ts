/**
 * GET /api/cro-portfolio — the converged sponsor-portfolio read for the v2 surface.
 *
 * The route is thin: guard the org, delegate to the real-store assembler, and shape
 * the envelope. It reads ONLY the real CRO engagement store (cro_clients +
 * cro_studies + cro_regulatory_submissions + cro_milestones + cro_team_assignments)
 * — no legacy/seed blob and no fallback — so an org with no sponsor clients gets an
 * honest empty list. (The full mapping is proven against real SQL in
 * cro-portfolio-view-assembler.pglite.integration.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const assembleOrgCroPortfolio = vi.fn();
vi.mock('../../services/cro/cro-portfolio-view-assembler', () => ({
  assembleOrgCroPortfolio: (...a: unknown[]) => assembleOrgCroPortfolio(...a),
}));

import croRouter from '../cro-portfolio.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/cro-portfolio', croRouter);
  return app;
}

// Braces matter: mockReset() returns the mock (a function), and a function
// returned from beforeEach is treated as a cleanup callback — vitest would then
// CALL the mock after each test, and a sticky rejecting implementation would
// blow up that phantom call and fail the test from the hook.
beforeEach(() => {
  assembleOrgCroPortfolio.mockReset();
});

describe('GET /api/cro-portfolio', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/cro-portfolio');
    expect(res.status).toBe(403);
    expect(assembleOrgCroPortfolio).not.toHaveBeenCalled();
  });

  it('returns the real-store roster for the acting org, source = cro_clients', async () => {
    assembleOrgCroPortfolio.mockResolvedValue([
      {
        id: '1', name: 'Helix Therapeutics', type: 'biotech', lead: 'M. Webb',
        sow: 'on-track', sowNote: 'MSA + 2 active SOWs - renews Q1 2027',
        studies: [{ code: 'BX204-301', phase: 'Phase 3', ind: 'rezatinib - RTK-X+ solid tumors', status: 'Enrolling', n: '412 / 480' }],
        subs: [{ id: 'BLA 761204', type: 'BLA', region: 'FDA - CBER', state: 'assembling', gate: '2 gates open', due: 'Nov 2026' }],
      },
    ]);
    const res = await request(appWith(7)).get('/api/cro-portfolio');
    expect(res.status).toBe(200);
    expect(assembleOrgCroPortfolio).toHaveBeenCalledWith(7);
    expect(res.body.meta.source).toBe('cro_clients');
    const first = res.body.data[0];
    for (const k of ['id', 'name', 'type', 'lead', 'sow', 'sowNote', 'studies', 'subs']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.studies[0]).toMatchObject({ code: 'BX204-301', phase: 'Phase 3', status: 'Enrolling', n: '412 / 480' });
    expect(first.subs[0]).toMatchObject({ id: 'BLA 761204', type: 'BLA', state: 'assembling', gate: '2 gates open' });
    expect(res.body.meta.count).toBe(1);
  });

  it('honest empty list when the org has no sponsor clients — no fallback data', async () => {
    assembleOrgCroPortfolio.mockResolvedValue([]);
    const res = await request(appWith(7)).get('/api/cro-portfolio');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });

  it('fails closed to an empty list when the store is not provisioned (42P01)', async () => {
    assembleOrgCroPortfolio.mockRejectedValue(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/cro-portfolio');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });

  it('500 with a structured error on any other assembler failure', async () => {
    assembleOrgCroPortfolio.mockRejectedValue(new Error('boom'));
    const res = await request(appWith(7)).get('/api/cro-portfolio');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
  });
});
