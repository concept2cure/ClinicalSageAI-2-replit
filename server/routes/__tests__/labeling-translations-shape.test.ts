/**
 * GET /api/mdx/labeling/:id/translations display-shape contract.
 *
 * The v2 translation board adopts this list via useLiveList, which requires each
 * row to carry the LabelTranslation display keys
 * ({ id, language, name, method, btv, status }). The list keeps SELECT * for the
 * v1 labeling module and adds method/btv/name aliases for v2 — this locks that
 * those keys are present and that the org/doc guard holds.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import labelingRouter from '../mdx-labeling';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/mdx', labelingRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/mdx/labeling/:id/translations', () => {
  it('returns rows carrying the v2 display keys (method, btv, name)', async () => {
    // 1st query: requireDocInOrg → doc belongs to org. 2nd: the translations list.
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    query.mockResolvedValueOnce({
      rows: [{ id: 1, language: 'de', translation_method: 'human', back_translation_verified: true, method: 'human', btv: true, name: 'German', status: 'approved' }],
    });
    const res = await request(appWith(1)).get('/api/mdx/labeling/1/translations');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    for (const k of ['id', 'language', 'name', 'method', 'btv', 'status']) {
      expect(res.body.data[0]).toHaveProperty(k);
    }
    // the list query projected the aliases
    const listSql = String(query.mock.calls[1][0]);
    expect(listSql).toContain('translation_method');
    expect(listSql).toContain('back_translation_verified');
    expect(listSql).toContain('AS name');
  });

  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/mdx/labeling/1/translations');
    expect(res.status).toBe(403);
  });

  it('404 when the document is not in the org', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // requireDocInOrg → no match
    const res = await request(appWith(1)).get('/api/mdx/labeling/1/translations');
    expect(res.status).toBe(404);
  });
});
