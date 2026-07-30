/**
 * GET /api/research-admin — the converged CITI training-matrix read for the v2 surface.
 *
 * The route is thin: guard the org, delegate to the real-store assembler, and shape
 * the envelope. It reads ONLY the real research-compliance roster
 * (research_personnel + personnel_training) — no legacy/seed blob and no fallback —
 * so an org with no roster gets an honest empty list. (The full mapping is proven
 * against real SQL in research-admin-view-assembler.pglite.integration.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const assembleOrgResearchAdmin = vi.fn();
vi.mock('../../services/research-admin/research-admin-view-assembler', () => ({
  assembleOrgResearchAdmin: (...a: unknown[]) => assembleOrgResearchAdmin(...a),
}));

import researchAdminRouter from '../research-admin.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/research-admin', researchAdminRouter);
  return app;
}

beforeEach(() => assembleOrgResearchAdmin.mockReset());

describe('GET /api/research-admin', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/research-admin');
    expect(res.status).toBe(403);
    expect(assembleOrgResearchAdmin).not.toHaveBeenCalled();
  });

  it('returns the real-roster matrix for the acting org, source = personnel_training', async () => {
    assembleOrgResearchAdmin.mockResolvedValue([
      {
        id: '41', name: 'Dr. Elena Vasquez', role: 'PI',
        cells: ['current', 'expiring', 'n/a', 'missing', 'expired'],
      },
    ]);
    const res = await request(appWith(7)).get('/api/research-admin');
    expect(res.status).toBe(200);
    expect(assembleOrgResearchAdmin).toHaveBeenCalledWith(7);
    expect(res.body.meta.source).toBe('personnel_training');
    const first = res.body.data[0];
    for (const k of ['id', 'name', 'role', 'cells']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.name).toBe('Dr. Elena Vasquez');
    expect(first.cells).toEqual(['current', 'expiring', 'n/a', 'missing', 'expired']);
    expect(res.body.meta.count).toBe(1);
  });

  it('honest empty list when the org has no roster — no fallback data', async () => {
    assembleOrgResearchAdmin.mockResolvedValue([]);
    const res = await request(appWith(7)).get('/api/research-admin');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });

  it('fails closed to an empty list when the store is not provisioned (42P01)', async () => {
    assembleOrgResearchAdmin.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/research-admin');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
