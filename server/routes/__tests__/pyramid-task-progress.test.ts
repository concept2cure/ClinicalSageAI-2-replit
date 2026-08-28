/**
 * Pyramid task progress — the half of the model that had no storage.
 *
 * Pyramid.tsx held task status in `statusOverrides`, a component-state object.
 * A user marked a submission task "Done" or "Blocked", the completion ring and
 * the phase bars updated, and it was never sent anywhere: gone on reload, and
 * gone on merely switching submission type, which cleared the object outright.
 *
 * The engine has always modelled progress as separate from the immutable
 * pyramid STRUCTURE (docs/PYRAMID_UI_ADVISORY.md §1.3) — the structure read is
 * pure and shared, the progress over it is per-org. These endpoints are that
 * second half, and what they must not do is let progress be recorded against a
 * task that does not exist, or let "todo" accumulate rows that say nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { query, insert, update } = vi.hoisted(() => ({
  query: vi.fn(), insert: vi.fn(), update: vi.fn(),
}));
vi.mock('../../utils/feature-persistence.js', () => ({
  createFeatureStore: () => ({ query, insert, update, getById: vi.fn(), remove: vi.fn() }),
}));
// The router guards every route with authMiddleware (server/auth.ts) and
// enforceTenantLifecycle (server/middleware/tenantLifecycleGuard.ts). Both are
// passed through here: identity is injected per-app below (`req.user`), and the
// org-scoping contract under test lives in the route's own progressOrgId check,
// not in these middlewares.
vi.mock('../../auth.js', () => ({
  authMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../middleware/tenantLifecycleGuard.js', () => ({
  enforceTenantLifecycle: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import pyramidRouter from '../pyramid.routes';

function app(org: number | null = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 3 };
    next();
  });
  a.use('/api/v1', pyramidRouter);
  return a;
}

/** A real task id from the IND pyramid, read from the engine rather than invented. */
let realTaskId: string;

beforeEach(async () => {
  query.mockReset(); insert.mockReset(); update.mockReset();
  query.mockResolvedValue([]);
  const res = await request(app()).get('/api/v1/pyramids/IND');
  realTaskId = res.body.data.tasks[0].id;
  expect(realTaskId, 'the IND pyramid must have at least one task').toBeTruthy();
});

describe('GET /pyramids/:type/progress', () => {
  it('403 without org context', async () => {
    const res = await request(app(null)).get('/api/v1/pyramids/IND/progress');
    expect(res.status).toBe(403);
  });

  it('404 on an unknown submission type', async () => {
    const res = await request(app()).get('/api/v1/pyramids/NOT_A_TYPE/progress');
    expect(res.status).toBe(404);
  });

  it('returns the org’s recorded statuses', async () => {
    query.mockResolvedValue([{ id: 1, type: 'IND', statuses: { [realTaskId]: 'done' } }]);
    const res = await request(app()).get('/api/v1/pyramids/IND/progress');
    expect(res.status).toBe(200);
    expect(res.body.data.statuses).toEqual({ [realTaskId]: 'done' });
  });

  it('an empty store is no recorded progress, not an error', async () => {
    query.mockResolvedValue([]);
    const res = await request(app()).get('/api/v1/pyramids/IND/progress');
    expect(res.status).toBe(200);
    expect(res.body.data.statuses).toEqual({});
  });

  it('reports a BROKEN read rather than flattening it into a clean board', async () => {
    // "No task is done" and "the progress query failed" render identically.
    query.mockRejectedValue(new Error('connection reset'));
    const res = await request(app()).get('/api/v1/pyramids/IND/progress');
    expect(res.status).toBe(500);
  });
});

describe('PATCH /pyramids/:type/progress/:taskId', () => {
  it('refuses a status outside the state machine', async () => {
    const res = await request(app()).patch(`/api/v1/pyramids/IND/progress/${realTaskId}`).send({ status: 'shipped' });
    expect(res.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a task that is not in this pyramid — no orphan rows from a stale tab', async () => {
    const res = await request(app()).patch('/api/v1/pyramids/IND/progress/NOT-A-TASK').send({ status: 'done' });
    expect(res.status).toBe(404);
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts the org’s first progress row for a type', async () => {
    query.mockResolvedValue([]);
    const res = await request(app()).patch(`/api/v1/pyramids/IND/progress/${realTaskId}`).send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalled();
    const [orgId, subcategory, , payload] = insert.mock.calls[0];
    expect(orgId).toBe(7);
    expect(subcategory).toBe('IND');
    expect(payload.statuses).toEqual({ [realTaskId]: 'in_progress' });
  });

  it('merges into the existing row rather than replacing the map', async () => {
    query.mockResolvedValue([{ id: 5, type: 'IND', statuses: { 'OTHER-TASK': 'blocked' } }]);
    await request(app()).patch(`/api/v1/pyramids/IND/progress/${realTaskId}`).send({ status: 'done' });
    const [rowId, orgId, payload] = update.mock.calls[0];
    expect(rowId).toBe(5);
    expect(orgId).toBe(7);
    expect(payload.statuses).toEqual({ 'OTHER-TASK': 'blocked', [realTaskId]: 'done' });
  });

  it('recording "todo" CLEARS the entry — the absence of progress is not a stored status', async () => {
    // Otherwise the store fills with rows that say nothing and a reset never resets.
    query.mockResolvedValue([{ id: 5, type: 'IND', statuses: { [realTaskId]: 'done', KEEP: 'blocked' } }]);
    const res = await request(app()).patch(`/api/v1/pyramids/IND/progress/${realTaskId}`).send({ status: 'todo' });
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][2].statuses).toEqual({ KEEP: 'blocked' });
  });

  it('403 without org context — progress is per-organization', async () => {
    const res = await request(app(null)).patch(`/api/v1/pyramids/IND/progress/${realTaskId}`).send({ status: 'done' });
    expect(res.status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });
});
