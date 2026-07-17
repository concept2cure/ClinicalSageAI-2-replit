/**
 * GET /api/intelligence/biostat — SAP / sample-size / interims section contract.
 *
 * These sections were `{}` stubs; they now read the org-scoped c2c_biostat_*
 * store, failing closed per section (safeRows swallows 42P01/42703, so an
 * unprovisioned store yields the pre-existing stub shape rather than a 500).
 * This locks: rows populate the section keys the BiostatSurface renders, and a
 * missing store keeps the endpoint healthy with those sections absent/empty.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import intelligenceRouter from '../intelligence-cluster';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/intelligence', intelligenceRouter);
  return app;
}

beforeEach(() => query.mockReset());

const SAP_ROW = {
  id: 'sap-204-301', program: 'BX-204', study: 'BX204-301', primary: 'ORR at week 24',
  alpha: '0.025', power: '0.90', size: '412', status: 'final', owner: 'M. Brown',
  locked: true, updated_at: new Date('2026-06-01T00:00:00Z'),
};

describe('GET /api/intelligence/biostat sections', () => {
  it('populates saps/sampleSize/interims from the store', async () => {
    query.mockImplementation(async (q: string | { text?: string }) => {
      const sql = typeof q === 'string' ? q : String(q?.text ?? '');
      if (sql.includes('c2c_biostat_saps')) return { rows: [SAP_ROW] };
      if (sql.includes('c2c_biostat_sample_sizes')) return { rows: [{ alpha: '0.025', power: '0.9', delta: '0.15', sd: '0.4', expected: 412 }] };
      if (sql.includes('c2c_biostat_interims')) return { rows: [{ study: 'BX204-301', kind: 'efficacy', dsmb: 'DSMB-3', date: '2026-03-01' }] };
      return { rows: [] };
    });
    const res = await request(appWith(7)).get('/api/intelligence/biostat');
    expect(res.status).toBe(200);
    const body = res.body?.data ?? res.body;
    expect(Array.isArray(body.saps)).toBe(true);
    expect(body.saps[0]).toMatchObject({ id: 'sap-204-301', study: 'BX204-301' });
    expect(body.sampleSize).toBeTruthy();
    expect(Array.isArray(body.interims)).toBe(true);
    // org-scoped reads
    const sapCall = query.mock.calls.find((c) => String(c[0]).includes('c2c_biostat_saps'));
    expect(sapCall?.[1]).toEqual([7]);
  });

  it('fails closed per section when the store is unprovisioned', async () => {
    query.mockImplementation(async (q: string | { text?: string }) => {
      const sql = typeof q === 'string' ? q : String(q?.text ?? '');
      if (sql.includes('c2c_biostat_')) {
        throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      }
      return { rows: [] };
    });
    const res = await request(appWith(7)).get('/api/intelligence/biostat');
    expect(res.status).toBe(200);
    const body = res.body?.data ?? res.body;
    // sections revert to their stub state — absent or empty, never a 500
    expect(body.saps === undefined || (Array.isArray(body.saps) && body.saps.length === 0)).toBe(true);
  });
});
