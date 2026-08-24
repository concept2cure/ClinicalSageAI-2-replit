/**
 * GET /api/clinical-operations/studies display-shape contract.
 *
 * The v2 studies & enrollment board adopts this list via useLiveList, which
 * requires each row to carry the CoStudy display keys
 * ({ studyId, id, phase, design, n, target, status, note }). This locks that the
 * route projects that shape (id AS studyId, protocol AS id, enrolled AS n,
 * target_enrollment AS target) under a `{ data }` envelope, scoped to the org.
 *
 * `studyId` is load-bearing, not decorative: it is the only handle the org-wide
 * board has for the study-scoped write and read endpoints in this router
 * (deviations especially). Drop it from the projection and "Log deviation"
 * silently becomes a React-state row again.
 */
import { describe, it, expect, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import createClinicalOperationsRoutes from '../clinical-operations-routes';

function mockPool(row: Record<string, unknown>) {
  return {
    // ensureTables() runs DDL (resolve empty); the studies projection returns the row.
    query: vi.fn(async (sql: string) =>
      sql.includes('AS "studyId"') ? { rows: [row] } : { rows: [] },
    ),
  } as any;
}

function appWith(pool: any, org: string | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as any).tenantId = org;
    next();
  });
  app.use('/api/clinical-operations', createClinicalOperationsRoutes(pool));
  return app;
}

describe('GET /api/clinical-operations/studies', () => {
  it('returns a { data } envelope shaped to the CoStudy display contract', async () => {
    const row = { studyId: '6f1d7d2e-3b4a-4f5c-8d9e-0a1b2c3d4e5f', id: 'BX204-301', phase: '3', design: 'Randomized · pivotal', n: 412, target: 412, status: 'active', note: 'Primary ORR readout Q4 2026' };
    const pool = mockPool(row);
    const res = await request(appWith(pool, '1')).get('/api/clinical-operations/studies');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    for (const k of ['studyId', 'id', 'phase', 'design', 'n', 'target', 'status', 'note']) {
      expect(res.body.data[0]).toHaveProperty(k);
    }
    // the projection query ran with the display aliases + org scope
    const selects = pool.query.mock.calls.map((c: any[]) => String(c[0]));
    const projection = selects.find((s: string) => s.includes('AS "studyId"'));
    expect(projection).toContain('protocol');
    expect(projection).toContain('enrolled');
    expect(projection).toContain('target_enrollment');
  });
});
