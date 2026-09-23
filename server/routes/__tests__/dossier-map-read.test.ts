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

/* The program → PM-spine bridge (`projects.regulatory_program_id`), the ONE
   reader of that anchor; mocked so each case states whether the program is
   anchored. The route must resolve a UUID through it and never through parseInt. */
const resolveProgramProjectAnchor = vi.fn();
vi.mock('../../services/c2c/program-project-anchor', () => ({
  resolveProgramProjectAnchor: (...a: unknown[]) => resolveProgramProjectAnchor(...a),
}));
vi.mock('../../db/requestDb', () => ({ requestDb: () => ({}) }));
/* Org-scoped program existence read (regulatory_programs). */
const poolQuery = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => poolQuery(...a) } }));

import dossierMapRouter from '../dossier-map.routes';

/* A program UUID whose LEADING characters are digits — the OQ-SUBC-10 id.
   parseInt('6191805f-…', 10) === 6191805: an integer that belongs to nobody. */
const PROGRAM_UUID = '6191805f-e83d-4327-af00-aa2c6f4d43b0';

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
  resolveProgramProjectAnchor.mockReset();
  poolQuery.mockReset();
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

  /* ── F-7: the shell supplies the program UUID; the route must never parseInt it ── */

  it('resolves a program UUID through the anchor lookup — never parseInt — and reads the anchored project (F-7)', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ id: PROGRAM_UUID }] });
    resolveProgramProjectAnchor.mockResolvedValueOnce(42);
    assembleProjectDossierMap.mockResolvedValueOnce([
      { m: '3', label: 'Quality', pct: 25, tone: 'warn', sections: ['3.2.P'] },
    ]);
    const res = await request(appWith(7)).get(`/api/dossier-map?projectId=${PROGRAM_UUID}`);
    expect(res.status).toBe(200);
    // Pre-fix: assembleProjectDossierMap(7, 6191805) — an unrelated integer id.
    expect(assembleProjectDossierMap).not.toHaveBeenCalledWith(7, 6191805);
    expect(assembleProjectDossierMap).toHaveBeenCalledWith(7, 42);
    expect(resolveProgramProjectAnchor).toHaveBeenCalledTimes(1);
    expect(resolveProgramProjectAnchor.mock.calls[0][1]).toMatchObject({ programId: PROGRAM_UUID, orgId: 7 });
    expect(res.body.meta).toMatchObject({ programId: PROGRAM_UUID, projectId: 42, anchored: true, source: 'project_sections' });
    expect(res.body.data).toHaveLength(1);
  });

  it('a program in the org with no PM-spine anchor answers an honest empty map that SAYS it is unanchored (F-7)', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ id: PROGRAM_UUID }] });
    resolveProgramProjectAnchor.mockResolvedValueOnce(null);
    const res = await request(appWith(7)).get(`/api/dossier-map?projectId=${PROGRAM_UUID}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({ count: 0, programId: PROGRAM_UUID, projectId: null, anchored: false, reason: 'PROGRAM_UNANCHORED' });
    expect(assembleProjectDossierMap).not.toHaveBeenCalled();
  });

  it('a program UUID that is not in the acting org answers 404, and nothing is read for it (F-7)', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith(7)).get(`/api/dossier-map?projectId=${PROGRAM_UUID}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROGRAM_NOT_FOUND');
    expect(resolveProgramProjectAnchor).not.toHaveBeenCalled();
    expect(assembleProjectDossierMap).not.toHaveBeenCalled();
  });

  it('an id that parseInt would truncate ("12abc") is 400, never project 12 (F-7)', async () => {
    const res = await request(appWith(7)).get('/api/dossier-map?projectId=12abc');
    expect(res.status).toBe(400);
    expect(assembleProjectDossierMap).not.toHaveBeenCalled();
  });

  it('fails closed to an honest empty list when the store is not provisioned (42P01)', async () => {
    assembleProjectDossierMap.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/dossier-map?projectId=5');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
