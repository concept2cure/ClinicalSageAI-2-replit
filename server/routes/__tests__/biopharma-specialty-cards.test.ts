/**
 * Biopharma specialty sub-card read routes (batch 2) — PREA milestones, orphan
 * RPD vouchers/grants, orphan patient-advocacy.
 *
 * Locks: 403 without org; the org-scoped list contract (org id as $1); and
 * fail-closed to an empty canonical envelope (pendingStore, never 500) when the
 * store isn't provisioned (42P01), so the surface keeps its fixture.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { preaMilestonesRouter, orphanRpdRouter, orphanAdvocacyRouter } from '../biopharma-specialty.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/biopharma/prea-milestones', preaMilestonesRouter);
  app.use('/api/biopharma/orphan-rpd', orphanRpdRouter);
  app.use('/api/biopharma/orphan-advocacy', orphanAdvocacyRouter);
  return app;
}

const PATHS = ['/api/biopharma/prea-milestones', '/api/biopharma/orphan-rpd', '/api/biopharma/orphan-advocacy'];

beforeEach(() => query.mockReset());

describe.each(PATHS)('GET %s', (path) => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get(path);
    expect(res.status).toBe(403);
  });

  it('returns the org-scoped list', async () => {
    query.mockResolvedValueOnce({ rows: [{ product: 'BX-204' }] });
    const res = await request(appWith(5)).get(path);
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([5]);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('fails closed to an empty list when the store is missing (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(5)).get(path);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
