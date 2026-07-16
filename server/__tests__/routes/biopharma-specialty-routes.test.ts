/**
 * Biopharma specialty route tests — pediatric / orphan / lifecycle.
 *
 * Each route reads an org-scoped store and returns rows shaped to its surface's
 * display contract, failing closed to an empty canonical envelope when the store
 * isn't provisioned (`42P01`). The contract that must hold: 403 without org
 * context, a `{ data }` envelope with it, org-scoped `WHERE organization_id`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction, type Router } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import specialtyRouter from '../../routes/biopharma-specialty.routes';

function appWith(router: Router, org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/biopharma', router);
  return app;
}

beforeEach(() => query.mockReset());

const CASES = [
  {
    name: 'pediatric',
    path: '/api/biopharma/pediatric',
    table: 'biopharma_pediatric_plans',
    row: { id: 'pip-420', product: 'BX-420', kind: 'EMA PIP', ageRange: '2--17', deferrals: 2, waivers: 1, milestones: 8, due: 'Q1 2027', status: 'agreed' },
    keys: ['id', 'product', 'kind', 'ageRange', 'deferrals', 'waivers', 'milestones', 'due', 'status'],
  },
  {
    name: 'orphan',
    path: '/api/biopharma/orphan',
    table: 'biopharma_orphan_designations',
    row: { id: 'orph-1', product: 'BX-256', agency: 'FDA', indication: 'RPE65', date: '2024-08-12', prevalence: '~3,000', benefit: '7-yr', status: 'designated' },
    keys: ['id', 'product', 'agency', 'indication', 'date', 'prevalence', 'benefit', 'status'],
  },
  {
    name: 'supplements',
    path: '/api/biopharma/supplements',
    table: 'biopharma_supplements',
    row: { id: 'sNDA-1', agency: 'FDA', product: 'BX-099', subject: 'sNDA', filed: '2026-03-04', due: 'PDUFA', status: 'filed' },
    keys: ['id', 'agency', 'product', 'subject', 'filed', 'due', 'status'],
  },
] as const;

for (const c of CASES) {
  describe(`biopharma ${c.name} route`, () => {
    it('403 without org context', async () => {
      const res = await request(appWith(specialtyRouter, null)).get(c.path);
      expect(res.status).toBe(403);
    });

    it('returns org-scoped rows shaped to the display contract', async () => {
      query.mockResolvedValueOnce({ rows: [c.row] });
      const res = await request(appWith(specialtyRouter, 7)).get(c.path);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      for (const k of c.keys) expect(res.body.data[0]).toHaveProperty(k);
      expect(query).toHaveBeenCalledWith(expect.stringContaining(c.table), [7]);
    });

    it('fails closed to an empty envelope when the store is not provisioned', async () => {
      query.mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
      const res = await request(appWith(specialtyRouter, 1)).get(c.path);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });
}
