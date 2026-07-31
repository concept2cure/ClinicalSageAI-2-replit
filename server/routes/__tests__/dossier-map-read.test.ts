/**
 * GET /api/dossier-map — the converged CTD module-map read for the v2 DossierMap grid.
 *
 * The route is thin: guard the org, delegate to the real-store assembler
 * (project_sections rolled up to module grain), and shape the envelope. No blob, no
 * fallback — an org with no tracked sections gets an honest empty list. (The full
 * roll-up is proven against real SQL in
 * dossier-map-view-assembler.pglite.integration.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const assembleProjectDossierMap = vi.fn();
vi.mock('../../services/dossier/dossier-map-view-assembler', () => ({
  assembleProjectDossierMap: (...a: unknown[]) => assembleProjectDossierMap(...a),
}));

import dossierMapRouter from '../dossier-map.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/dossier-map', dossierMapRouter);
  return app;
}

beforeEach(() => {
  assembleProjectDossierMap.mockReset();
});

describe('GET /api/dossier-map', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/dossier-map?projectId=5');
    expect(res.status).toBe(403);
    expect(assembleProjectDossierMap).not.toHaveBeenCalled();
  });

  it('400 when projectId is missing — a project-readiness read requires it, no org-wide fallback', async () => {
    const res = await request(appWith(7)).get('/api/dossier-map');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PROJECT_REQUIRED');
    expect(assembleProjectDossierMap).not.toHaveBeenCalled();
  });

  it('400 when projectId is not a positive integer', async () => {
    const res = await request(appWith(7)).get('/api/dossier-map?projectId=abc');
    expect(res.status).toBe(400);
    expect(assembleProjectDossierMap).not.toHaveBeenCalled();
  });

  it('returns the real-store module map for the acting org + project, source = project_sections', async () => {
    assembleProjectDossierMap.mockResolvedValueOnce([
      { m: '2', label: 'CTD summaries', pct: 50, tone: 'warn', sections: ['2.5 Clinical Overview', '2.7 Clinical Summary'] },
    ]);
    const res = await request(appWith(7)).get('/api/dossier-map?projectId=5');
    expect(res.status).toBe(200);
    expect(assembleProjectDossierMap).toHaveBeenCalledWith(7, 5);   // scoped by BOTH org and project
    expect(res.body.meta.source).toBe('project_sections');
    expect(res.body.meta.projectId).toBe(5);
    const row = res.body.data[0];
    for (const k of ['m', 'label', 'pct', 'tone', 'sections']) expect(row).toHaveProperty(k);
    expect(Array.isArray(row.sections)).toBe(true);
    expect(res.body.meta.count).toBe(1);
  });

  it('honest empty list when the project tracks no CTD sections — no fallback data', async () => {
    assembleProjectDossierMap.mockResolvedValueOnce([]);
    const res = await request(appWith(7)).get('/api/dossier-map?projectId=5');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });

  it('fails closed to an honest empty list when the store is not provisioned (42P01)', async () => {
    assembleProjectDossierMap.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/dossier-map?projectId=5');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
