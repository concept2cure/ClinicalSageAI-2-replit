/**
 * GET + POST /api/cmc-changes — the converged CMC change-control read + write path.
 *
 * The route is thin: guard the org, delegate to the real cmc_change_controls service,
 * and project the read through the SUPAC classifier. Locks: 403 without org; GET projects
 * the real-store rows (risk/fdaCategory computed); GET fail-closed to an honest empty list
 * on a missing store (42P01); POST proposes a change (the real write path) and returns the
 * classified view; POST 400 on invalid input. (The full store round-trip is proven in
 * cmc-change-control-service.pglite.integration.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { createCmcChange, listCmcChanges, CmcChangeValidationError, logAction, writeThroughChangeControl } = vi.hoisted(() => {
  class CmcChangeValidationError extends Error {}
  return {
    createCmcChange: vi.fn(),
    listCmcChanges: vi.fn(),
    CmcChangeValidationError,
    logAction: vi.fn(),
    writeThroughChangeControl: vi.fn(),
  };
});
vi.mock('../../services/cmc/cmc-change-control-service', () => ({ createCmcChange, listCmcChanges, CmcChangeValidationError }));
vi.mock('../../services/auditService', () => ({ default: { logAction } }));
vi.mock('../../services/cmc-write-through', () => ({ writeThroughChangeControl }));

import cmcRouter from '../cmc-changes.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 55 };
    next();
  });
  app.use('/api/cmc-changes', cmcRouter);
  return app;
}

function dbRow(over: Record<string, unknown> = {}) {
  return {
    id: 'c-1', title: 'Bioreactor scale-up', area: 'Drug substance', programs: 'BX-099', status: 'evaluating',
    dosage_form_family: 'biologic', change_category: 'scale_up', scale_change_factor: 'within_10x',
    excipient_level_change: null, site_change_kind: null, process_change_kind: null,
    touches_critical_step: true, affects: 'drug_substance', has_comparability_data: false, description: null,
    ...over,
  };
}

beforeEach(() => { createCmcChange.mockReset(); listCmcChanges.mockReset(); logAction.mockReset(); writeThroughChangeControl.mockReset(); });

describe('GET /api/cmc-changes', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/cmc-changes');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
  });

  it('projects the real-store changes through the classifier, source = cmc_change_controls', async () => {
    listCmcChanges.mockResolvedValueOnce([dbRow(), dbRow({ title: 'Tighten spec', change_category: 'specifications', has_comparability_data: true, touches_critical_step: false })]);
    const res = await request(appWith(9)).get('/api/cmc-changes');
    expect(res.status).toBe(200);
    expect(listCmcChanges).toHaveBeenCalledWith(9);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toHaveProperty('risk');
    expect(res.body.data[0]).toHaveProperty('fdaCategory');
    expect(res.body.meta.source).toBe('cmc_change_controls');
  });

  it('fails closed to an empty list when the store is missing (42P01)', async () => {
    listCmcChanges.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(9)).get('/api/cmc-changes');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});

describe('POST /api/cmc-changes', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).post('/api/cmc-changes').send({ title: 'x' });
    expect(res.status).toBe(403);
    expect(createCmcChange).not.toHaveBeenCalled();
  });

  it('proposes a change and returns the classified view (audited)', async () => {
    createCmcChange.mockResolvedValueOnce(dbRow({ id: 'c-9', title: 'New scale-up' }));
    const res = await request(appWith(9)).post('/api/cmc-changes').send({
      title: 'New scale-up', dosageFormFamily: 'biologic', changeCategory: 'scale_up', touchesCriticalStep: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('c-9');
    expect(res.body.data).toHaveProperty('risk');
    expect(res.body.data.title).toBe('New scale-up');
    // Service called with parsed body + acting user as createdBy; audited.
    expect(createCmcChange).toHaveBeenCalledWith(9, expect.objectContaining({ title: 'New scale-up', dosageFormFamily: 'biologic', changeCategory: 'scale_up', createdBy: 55 }));
    expect(logAction).toHaveBeenCalled();
  });

  it('400 on invalid input', async () => {
    createCmcChange.mockRejectedValueOnce(new CmcChangeValidationError('changeCategory must be one of: ...'));
    const res = await request(appWith(9)).post('/api/cmc-changes').send({ title: 'x', dosageFormFamily: 'biologic', changeCategory: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  /* ── Module 3 convergence: a governed change marks its §3.2 sections stale ──
     The legacy register write-throughs on every save; this store never did, so
     the same conceptual event had two different downstream truths. */

  it('write-throughs to the canonical §3.2 source layer when a CMC project is stated', async () => {
    createCmcChange.mockResolvedValueOnce(dbRow({ id: 'c-9' }));
    writeThroughChangeControl.mockResolvedValueOnce({ sourceObjectId: 1, staleSections: ['3.2.P.3'] });
    const res = await request(appWith(9)).post('/api/cmc-changes').send({
      title: 'New scale-up', dosageFormFamily: 'biologic', changeCategory: 'scale_up',
      cmcProjectId: 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab',
    });
    expect(res.status).toBe(201);
    expect(writeThroughChangeControl).toHaveBeenCalledWith(
      9,
      'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab',
      'c-9',
      expect.objectContaining({ title: 'Bioreactor scale-up', change_type: 'scale_up' }),
      '55',
    );
    expect(res.body.meta.module3WriteThrough).toBe('recorded');
  });

  it('says skipped when no project is stated — the change persists org-wide but feeds nothing', async () => {
    createCmcChange.mockResolvedValueOnce(dbRow({ id: 'c-9' }));
    const res = await request(appWith(9)).post('/api/cmc-changes').send({
      title: 'New scale-up', dosageFormFamily: 'biologic', changeCategory: 'scale_up',
    });
    expect(res.status).toBe(201);
    expect(writeThroughChangeControl).not.toHaveBeenCalled();
    expect(res.body.meta.module3WriteThrough).toBe('skipped_no_project');
  });

  it('reports a failed write-through instead of pretending it recorded', async () => {
    createCmcChange.mockResolvedValueOnce(dbRow({ id: 'c-9' }));
    // writeThrough* swallows its own failures into null by design — the route
    // must surface that as 'failed', never as silence.
    writeThroughChangeControl.mockResolvedValueOnce(null);
    const res = await request(appWith(9)).post('/api/cmc-changes').send({
      title: 'New scale-up', dosageFormFamily: 'biologic', changeCategory: 'scale_up',
      cmcProjectId: 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab',
    });
    expect(res.status).toBe(201);
    expect(res.body.meta.module3WriteThrough).toBe('failed');
  });
});
