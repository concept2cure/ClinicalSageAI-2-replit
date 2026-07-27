/**
 * GET /api/c2c/projects/:id/regulatory-context — access contract.
 *
 * The plan's content is covered by project-plan.test.ts. What is locked HERE is
 * the part that only exists at the route boundary, and the one that would be
 * expensive to get wrong: an id belonging to another tenant must 404 before any
 * program-scoped read happens.
 *
 * An empty plan is not an acceptable answer for someone else's project. "This
 * project has no regulatory work" is a statement about their programme, and a
 * caller who can distinguish "empty" from "not found" can enumerate which
 * programme uuids exist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import projectsRouter from '../projects';

const PROGRAM = '11111111-2222-3333-4444-555555555555';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { organizationId: number }).organizationId = org;
    next();
  });
  app.use('/api/c2c/projects', projectsRouter);
  return app;
}

const get = (org: number | null, id = PROGRAM) =>
  request(appWith(org)).get(`/api/c2c/projects/${id}/regulatory-context`);

beforeEach(() => query.mockReset());

describe('GET /:id/regulatory-context — access', () => {
  it('403 without org context', async () => {
    const res = await get(null);
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('404 for a non-uuid id, without touching the database', async () => {
    // The uuid cast would otherwise throw 22P02 and surface as a 500.
    const res = await get(7, 'not-a-uuid');
    expect(res.status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });

  it('404 for a program in another tenant, and reads nothing scoped to it', async () => {
    query.mockResolvedValueOnce({ rows: [] });          // ownership check: no match
    const res = await get(7);
    expect(res.status).toBe(404);
    // Exactly one query — the ownership check. Nothing program-scoped ran.
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('regulatory_programs');
    expect(sql).toContain('organization_id = $2');
    expect(params).toEqual([PROGRAM, 7]);
  });

  it('checks ownership BEFORE resolving any context', async () => {
    // Ordering is the whole point: a resolver read that ran first would touch
    // organization_industry_profiles for a caller who has no business here.
    query.mockResolvedValueOnce({ rows: [] });
    await get(7);
    const sqls = query.mock.calls.map(c => String(c[0]));
    expect(sqls.some(s => s.includes('industry_profiles'))).toBe(false);
    expect(sqls.some(s => s.includes('regulatory_work_packages'))).toBe(false);
  });

  it('excludes a soft-deleted program', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await get(7);
    expect(String(query.mock.calls[0][0])).toContain('deleted_at IS NULL');
  });

  it('returns a { data } envelope carrying the plan for an owned program', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })          // ownership
      .mockResolvedValueOnce({ rows: [] })                            // org profile
      .mockResolvedValueOnce({ rows: [] })                            // entitlement
      .mockResolvedValueOnce({ rows: [] })                            // program profile
      .mockResolvedValueOnce({ rows: [{ industry_mode: 'biotech' }] }); // legacy
    const res = await get(7);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('context');
    expect(res.body.data).toHaveProperty('sections');
    expect(res.body.data).toHaveProperty('packages');
    expect(res.body.data).toHaveProperty('registryVersion');
  });

  it('404s rather than 500s when regulatory_programs is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: '42P01' }));
    const res = await get(7);
    expect(res.status).toBe(404);
  });

  it('500s on a real database fault rather than reporting an empty plan', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('reset'), { code: '08006' }));
    const res = await get(7);
    expect(res.status).toBe(500);
  });
});
