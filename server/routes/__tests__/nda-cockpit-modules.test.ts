/**
 * GET /api/nda-cockpit/modules — the CONVERGED CTD-readiness read for the v2 NdaCockpit
 * "CTD readiness" panel.
 *
 * The route is thin: guard the org, delegate to the real-store assembler
 * (assembleOrgNdaModules over submissions where application_type IN ('nda','bla') +
 * ectd_sequences + submission_leaves + coauthor_documents), and shape the envelope. It
 * reads ONLY the real eCTD submission core — no seed-only c2c_nda_modules blob and no
 * fallback — so an org with no NDA/BLA gets an honest empty list (meta.source =
 * 'submissions'), and a 42P01 (unprovisioned core) fails closed to []. The full field
 * mapping is proven against real SQL in
 * server/services/nda/__tests__/nda-modules-view-assembler.pglite.integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const assembleOrgNdaModules = vi.fn();
vi.mock('../../services/nda/nda-modules-view-assembler', () => ({
  assembleOrgNdaModules: (...a: unknown[]) => assembleOrgNdaModules(...a),
}));
// The route file also imports the DB pool for the /m1 and /rtf endpoints (not exercised
// here) — mock it so importing the router never opens a real connection.
vi.mock('../../db', () => ({ pool: { query: vi.fn() } }));

import ndaRouter from '../nda-cockpit.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/nda-cockpit', ndaRouter);
  return app;
}

beforeEach(() => assembleOrgNdaModules.mockReset());

describe('GET /api/nda-cockpit/modules', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/nda-cockpit/modules');
    expect(res.status).toBe(403);
    expect(assembleOrgNdaModules).not.toHaveBeenCalled();
  });

  it('returns the real-store CTD roll-up for the acting org, source = submissions', async () => {
    assembleOrgNdaModules.mockResolvedValue([
      { m: '1', label: 'Administrative & prescribing (Module 1)', pct: 80, docs: 5, open: 1, gate: 'Financial Disclosure in drafting' },
      { m: '4', label: 'Nonclinical study reports (Module 4)', pct: 100, docs: 3, open: 0, gate: null },
    ]);
    const res = await request(appWith(7)).get('/api/nda-cockpit/modules');
    expect(res.status).toBe(200);
    expect(assembleOrgNdaModules).toHaveBeenCalledWith(7);
    expect(res.body.meta.source).toBe('submissions');
    const first = res.body.data[0];
    for (const k of ['m', 'label', 'pct', 'docs', 'open', 'gate']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.m).toBe('1');
    expect(first.open).toBe(1);
    expect(res.body.data[1].gate).toBeNull();
    expect(res.body.meta.count).toBe(2);
  });

  it('honest empty list when the org has no NDA/BLA — no fallback data', async () => {
    assembleOrgNdaModules.mockResolvedValue([]);
    const res = await request(appWith(7)).get('/api/nda-cockpit/modules');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });

  it('fails closed to an empty list when the submission core is not provisioned (42P01)', async () => {
    assembleOrgNdaModules.mockImplementationOnce(async () => {
      throw Object.assign(new Error('relation missing'), { code: '42P01' });
    });
    const res = await request(appWith(7)).get('/api/nda-cockpit/modules');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
