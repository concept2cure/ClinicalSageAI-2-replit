/**
 * GET /api/research-admin — CITI training-matrix read contract.
 *
 * The v2 ResearchAdmin surface adopts this list only when it carries the full
 * display shape. Locks: 403 without org, the { data } envelope with the display
 * keys ({ id, name, role, cells }, cells rehydrated from JSONB), and 42P01
 * fail-closed to an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

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

beforeEach(() => query.mockReset());

describe('GET /api/research-admin', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/research-admin');
    expect(res.status).toBe(403);
  });

  it('returns personnel shaped to the display contract (cells from JSONB)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'tp1', name: 'Dr. Elena Vasquez', role: 'PI',
          cells: ['current', 'current', 'n/a', 'n/a', 'current'],
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/research-admin');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of ['id', 'name', 'role', 'cells']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.name).toBe('Dr. Elena Vasquez');
    expect(Array.isArray(first.cells)).toBe(true);
    expect(first.cells).toEqual(['current', 'current', 'n/a', 'n/a', 'current']);
    expect(res.body.meta.count).toBe(1);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/research-admin');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
