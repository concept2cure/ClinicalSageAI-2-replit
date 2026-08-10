/**
 * /api/c2c/projects — portfolio list + detail guard contract.
 *
 * The v2 Projects surface adopts the list via useLiveList, which requires each
 * row to carry the ProjPortfolioEntry display keys ({ id, title, ws, code,
 * stage, readiness, status, lead, blocker, due, activity }). This locks the
 * `{ data }` envelope + key set, the org scoping, and the uuid guard on the
 * detail route (a non-uuid id must 404, not 500 on the failed uuid cast).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import projectsRouter from '../projects';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { organizationId: number }).organizationId = org;
    next();
  });
  app.use('/api/c2c/projects', projectsRouter);
  return app;
}

beforeEach(() => query.mockReset());

const KEYS = ['id', 'title', 'ws', 'code', 'stage', 'readiness', 'status', 'lead', 'blocker', 'due', 'activity'];

describe('GET /api/c2c/projects', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/c2c/projects');
    expect(res.status).toBe(403);
  });

  it('returns { data } rows shaped to the portfolio display contract', async () => {
    const row = Object.fromEntries(KEYS.map((k) => [k, k === 'readiness' ? 62 : k === 'blocker' ? null : 'x']));
    query.mockResolvedValueOnce({ rows: [row] });
    const res = await request(appWith(7)).get('/api/c2c/projects');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    for (const k of KEYS) expect(res.body.data[0]).toHaveProperty(k);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('regulatory_programs');
    expect(sql).toContain('progress_percent');
    // Paged: org, then the default page size + 1 (the extra row is how hasMore
    // is decided without a second COUNT(*)), then the offset.
    expect(params).toEqual([7, 51, 0]);
  });

  it('clamps ?limit to its maximum and never issues an unbounded read', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(appWith(7)).get('/api/c2c/projects?limit=100000&offset=5');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('LIMIT $2 OFFSET $3');
    expect(params).toEqual([7, 201, 5]);
  });

  it('reports hasMore and trims the extra probe row off the page', async () => {
    const row = Object.fromEntries(KEYS.map((k) => [k, k === 'readiness' ? 0 : k === 'blocker' ? null : 'x']));
    // Two rows back for a page size of one: the second exists only to prove
    // there is more, and must not be served to the client.
    query.mockResolvedValueOnce({ rows: [row, row] });
    const res = await request(appWith(7)).get('/api/c2c/projects?limit=1');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ count: 1, limit: 1, offset: 0, hasMore: true });
  });

  it('fails closed to an empty envelope when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/c2c/projects');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('GET /api/c2c/projects/:id', () => {
  it('404s a non-uuid id instead of 500ing on the uuid cast', async () => {
    const res = await request(appWith(7)).get('/api/c2c/projects/not-a-uuid');
    expect(res.status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });

  it('selects only columns that exist on regulatory_programs', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'u', name: 'p' }] });
    const res = await request(appWith(7)).get('/api/c2c/projects/b6d3e141-7abb-4f1d-9b8b-f0f334604a05');
    expect(res.status).toBe(200);
    const [sql] = query.mock.calls[0] as [string];
    // regression: these columns do not exist and used to 500 the read
    for (const bad of ['sponsor_name', 'lead_indication', 'filing_date', 'pdufa_date', 'completion_percentage']) {
      expect(sql).not.toContain(bad);
    }
    expect(sql).toContain('progress_percent');
  });
});
