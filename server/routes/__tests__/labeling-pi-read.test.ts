/**
 * GET + POST /api/labeling-pi — the converged USPI label worklist read + write path.
 *
 * The route is thin: guard the org, delegate to the real labeling_pi_sections service,
 * and shape the render contract (section_no → n, status → st). No blob, no fallback —
 * an org with no label sections gets an honest empty list; POST records a section
 * (upsert, audited); 400 on invalid input. (The full store round-trip incl. USPI
 * document order is proven in labeling-pi-service.pglite.integration.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { upsertLabelingPiSection, listLabelingPiSections, LabelingPiValidationError, logAction } = vi.hoisted(() => {
  class LabelingPiValidationError extends Error {}
  return {
    upsertLabelingPiSection: vi.fn(),
    listLabelingPiSections: vi.fn(),
    LabelingPiValidationError,
    logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })),
  };
});
vi.mock('../../services/labeling/labeling-pi-service', () => ({
  upsertLabelingPiSection, listLabelingPiSections, LabelingPiValidationError,
}));
vi.mock('../../services/auditService', () => ({ default: { logAction } }));

import labelingPiRouter from '../labeling-pi.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 55 };
    next();
  });
  app.use('/api/labeling-pi', labelingPiRouter);
  return app;
}

function dbRow(over: Record<string, unknown> = {}) {
  return {
    id: 'sec-1', organization_id: 7, section_no: '1', label: 'Indications and usage',
    status: 'negotiation', flag: 'agency', program: 'BX-204 (rezatinib)',
    content: { heading: '1  Indications and usage', body: ['…'] },
    negotiation: { round: 'Labeling round 2', cycle: 'FDA — day 312', sponsor: 's', agency: 'a', rationale: 'r' },
    created_by: 55, created_at: 'now', updated_at: 'now',
    ...over,
  };
}

beforeEach(() => {
  upsertLabelingPiSection.mockReset();
  listLabelingPiSections.mockReset();
  logAction.mockReset();
});

describe('GET /api/labeling-pi', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/labeling-pi');
    expect(res.status).toBe(403);
    expect(listLabelingPiSections).not.toHaveBeenCalled();
  });

  it('returns the real-store sections shaped to the render contract, source = labeling_pi_sections', async () => {
    listLabelingPiSections.mockResolvedValueOnce([dbRow(), dbRow({ id: 'sec-2', section_no: '2', label: 'Dosage and administration', status: 'review', flag: null, content: null, negotiation: null })]);
    const res = await request(appWith(7)).get('/api/labeling-pi');
    expect(res.status).toBe(200);
    expect(listLabelingPiSections).toHaveBeenCalledWith(7);
    expect(res.body.meta.source).toBe('labeling_pi_sections');
    const first = res.body.data[0];
    for (const k of ['n', 'label', 'st', 'flag', 'content', 'negotiation']) expect(first).toHaveProperty(k);
    expect(first.n).toBe('1');                     // section_no → n
    expect(first.st).toBe('negotiation');          // status → st
    expect(res.body.data[1].content).toBeNull();   // null-safe rehydration
    expect(res.body.meta.count).toBe(2);
  });

  it('honest empty list when the org has no label sections — no fallback data', async () => {
    listLabelingPiSections.mockResolvedValueOnce([]);
    const res = await request(appWith(7)).get('/api/labeling-pi');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });

  it('fails closed to an honest empty list when the store is not provisioned (42P01)', async () => {
    listLabelingPiSections.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/labeling-pi');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});

describe('POST /api/labeling-pi', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).post('/api/labeling-pi').send({ sectionNo: '1', label: 'x' });
    expect(res.status).toBe(403);
    expect(upsertLabelingPiSection).not.toHaveBeenCalled();
  });

  it('records a section and returns the shaped view (audited)', async () => {
    upsertLabelingPiSection.mockResolvedValueOnce(dbRow({ id: 'sec-9', section_no: 'BW', label: 'Boxed warning', status: 'negotiation' }));
    const res = await request(appWith(7)).post('/api/labeling-pi').send({
      sectionNo: 'BW', label: 'Boxed warning', status: 'negotiation', flag: 'agency',
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('sec-9');
    expect(res.body.data.n).toBe('BW');
    expect(upsertLabelingPiSection).toHaveBeenCalledWith(7, expect.objectContaining({
      sectionNo: 'BW', label: 'Boxed warning', status: 'negotiation', flag: 'agency', createdBy: 55,
    }));
    expect(logAction).toHaveBeenCalled();
  });

  it('400 on invalid input', async () => {
    upsertLabelingPiSection.mockRejectedValueOnce(new LabelingPiValidationError('sectionNo must be …'));
    const res = await request(appWith(7)).post('/api/labeling-pi').send({ sectionNo: 'XX', label: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});
