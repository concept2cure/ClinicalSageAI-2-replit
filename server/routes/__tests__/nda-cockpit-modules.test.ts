/**
 * GET /api/nda-cockpit/modules — CTD module readiness read contract.
 *
 * The v2 NdaCockpit "CTD readiness" panel adopts this list and derives the
 * overall % ready from it. Locks: 403 without org, the { data } envelope with
 * the display keys ({ m, label, pct, docs, open, gate }, with open_count →
 * open), and 42P01 fail-closed to an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

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

beforeEach(() => query.mockReset());

describe('GET /api/nda-cockpit/modules', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/nda-cockpit/modules');
    expect(res.status).toBe(403);
  });

  it('returns modules shaped to the display contract (open_count → open)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { m: '1', label: 'Administrative (Module 1)', pct: 78, docs: 14, open_count: 3, gate: 'Financial disclosure outstanding' },
        { m: '4', label: 'Nonclinical (Module 4)', pct: 96, docs: 22, open_count: 0, gate: null },
      ],
    });
    const res = await request(appWith(7)).get('/api/nda-cockpit/modules');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of ['m', 'label', 'pct', 'docs', 'open', 'gate']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.open).toBe(3);
    expect(res.body.data[1].gate).toBeNull();
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/nda-cockpit/modules');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
