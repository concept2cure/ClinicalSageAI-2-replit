/**
 * GET /api/biopharma/bla/assessments — the BLA 351(a) biologics assessment list
 * that backs the NdaCockpit "BLA biologics" tab.
 *
 * Locks: 403 without org; the live { assessments: [...] } contract (org-scoped
 * query, org id passed as $1); and fail-closed to an honest empty list with
 * pendingStore:true when the store is not yet provisioned (42P01) so the surface
 * shows its sample fallback rather than a 500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import blaRouter from '../bla-workbench';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/biopharma/bla', blaRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/biopharma/bla/assessments', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/biopharma/bla/assessments');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('lists the org-scoped assessments live', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'a1', program_id: null, kind: 'filing_risk', title: 'BLA 761xxx', modality: 'mAb', status: 'draft', verdict: 'moderate' },
      ],
    });
    const res = await request(appWith(42)).get('/api/biopharma/bla/assessments');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1][0]).toBe(42); // org id is the first bound param
    expect(res.body.assessments).toHaveLength(1);
    expect(res.body.assessments[0].kind).toBe('filing_risk');
  });

  it('fails closed to an empty list when the store is missing (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(42)).get('/api/biopharma/bla/assessments');
    expect(res.status).toBe(200);
    expect(res.body.assessments).toEqual([]);
    expect(res.body.pendingStore).toBe(true);
  });

  it('still surfaces a genuine store error as 500', async () => {
    query.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appWith(42)).get('/api/biopharma/bla/assessments');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });
});
