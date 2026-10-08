/**
 * GET /api/concept2cure/reviews/my-queue?programId= — the review inbox for the
 * OPEN program.
 *
 * QA 2026-10-08 (j1, "Project screens show other programs' documents and
 * records"): with BX-256 open, Review & approval's "Threads & change requests —
 * assigned to you" listed BX-204's device items. The inbox had no program
 * filter at all. It now takes the program's regulatory_programs UUID and the
 * server resolves the program's anchored projects row — the id the review
 * threads and tasks carry — through the one anchor reader. A program with no
 * row has no threads here; a lookup that could not complete is a 500, never an
 * empty inbox. With no programId the inbox is the person's whole inbox, as
 * before (the task tray reads it so).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { PgDialect } from 'drizzle-orm/pg-core';

const h = vi.hoisted(() => ({ wheres: [] as unknown[], results: [] as unknown[][], anchor: vi.fn() }));

/* A drizzle select chain: records each where(), resolves to the next queued result. */
function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'innerJoin', 'orderBy', 'limit']) c[m] = () => c;
  c.where = (w: unknown) => { h.wheres.push(w); return c; };
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(h.results.shift() ?? []).then(res, rej);
  return c;
}
vi.mock('../../../db', () => ({ db: { select: () => chain() }, pool: {} }));
vi.mock('../../../middleware/redisRateLimiter', () => ({ createRedisRateLimiter: () => (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: unknown, _s: unknown, next: () => void) => next(),
  requireOrganizationContext: (_q: unknown, _s: unknown, next: () => void) => next(),
}));
vi.mock('../../../services/c2c/program-project-anchor', () => ({ resolveProgramProjectAnchor: h.anchor }));

import router from '../reviews';

const app = express();
app.use((req: Request, _res: Response, next: NextFunction) => {
  Object.assign(req, { userId: 5, organizationId: 1, tenantId: 1, tenantContext: { organizationId: 1 }, userRole: 'member' });
  next();
});
app.use('/api/concept2cure', router);

const PROGRAM = '099991d1-dac8-43c5-b88a-8baab26194ee';
const dialect = new PgDialect();
const params = (w: unknown) => dialect.sqlToQuery(w as never).params;

beforeEach(() => {
  h.wheres.length = 0;
  h.results.length = 0;
  h.anchor.mockReset();
});

describe('GET /reviews/my-queue?programId=', () => {
  it('narrows threads and tasks to the program’s anchored project', async () => {
    h.anchor.mockResolvedValue(11);
    h.results.push([{ threadId: 't1', title: 'HCP spec', projectId: 11 }], [{ taskId: 'k1', title: 'Approve', projectId: 11, dueAt: null }], [{ count: 0 }]);
    const res = await request(app).get(`/api/concept2cure/reviews/my-queue?programId=${PROGRAM}`);
    expect(res.status).toBe(200);
    expect(h.anchor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ programId: PROGRAM, orgId: 1, strict: true }));
    // Both the thread and the task read are bound to project 11.
    expect(params(h.wheres[0])).toContain(11);
    expect(params(h.wheres[1])).toContain(11);
    expect(res.body.data.totalThreads).toBe(1);
  });

  it('a program with no project record has an empty inbox here, and nothing is read for it', async () => {
    h.anchor.mockResolvedValue(null);
    h.results.push([{ count: 2 }]);
    const res = await request(app).get(`/api/concept2cure/reviews/my-queue?programId=${PROGRAM}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ threads: [], tasks: [], totalThreads: 0, totalTasks: 0 });
    // Only the unread-notification count was read; no thread or task query ran unfiltered.
    expect(h.wheres).toHaveLength(1);
  });

  it('a lookup that could not complete is a 500, never an empty inbox', async () => {
    h.anchor.mockRejectedValue(new Error('connection terminated'));
    const res = await request(app).get(`/api/concept2cure/reviews/my-queue?programId=${PROGRAM}`);
    expect(res.status).toBe(500);
  });

  it('a programId that is not a program UUID is refused', async () => {
    const res = await request(app).get('/api/concept2cure/reviews/my-queue?programId=11');
    expect(res.status).toBe(400);
    expect(h.anchor).not.toHaveBeenCalled();
  });

  it('with no programId the whole inbox is read, as before', async () => {
    h.results.push([{ threadId: 't1', projectId: 3 }, { threadId: 't2', projectId: 11 }], [], [{ count: 0 }]);
    const res = await request(app).get('/api/concept2cure/reviews/my-queue');
    expect(res.status).toBe(200);
    expect(h.anchor).not.toHaveBeenCalled();
    expect(params(h.wheres[0])).not.toContain(11);
    expect(res.body.data.totalThreads).toBe(2);
  });
});
