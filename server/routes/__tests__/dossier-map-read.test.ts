/**
 * GET /api/dossier-map — CTD / eCTD module-map read contract.
 *
 * The v2 DossierMap grid adopts this list on shape match. Locks: 403 without
 * org, the { data } envelope with the display keys ({ m, label, pct, tone,
 * sections }, sections rehydrated to an array), and 42P01 fail-closed to an
 * empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

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

beforeEach(() => query.mockReset());

describe('GET /api/dossier-map', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/dossier-map');
    expect(res.status).toBe(403);
  });

  it('returns module-map rows shaped to the display contract', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { m: '1', label: 'Administrative & prescribing', pct: 92, tone: 'ok', sections: ['1.1 Forms', '1.3 Labeling'] },
        { m: '2', label: 'CTD summaries', pct: 64, tone: 'warn', sections: ['2.5 Clinical'] },
      ],
    });
    const res = await request(appWith(7)).get('/api/dossier-map');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of ['m', 'label', 'pct', 'tone', 'sections']) {
      expect(first).toHaveProperty(k);
    }
    expect(Array.isArray(first.sections)).toBe(true);
    expect(first.sections).toEqual(['1.1 Forms', '1.3 Labeling']);
    expect(res.body.meta.count).toBe(2);
  });

  it('rehydrates a non-array sections value to an empty array', async () => {
    query.mockResolvedValueOnce({
      rows: [{ m: '4', label: 'Nonclinical reports', pct: 100, tone: 'ok', sections: null }],
    });
    const res = await request(appWith(7)).get('/api/dossier-map');
    expect(res.status).toBe(200);
    expect(res.body.data[0].sections).toEqual([]);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/dossier-map');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
