/**
 * GET /api/module-subscriptions/work-queue says when the queue could not be
 * read; it never reports an unread queue as an empty one.
 *
 * What the code used to do (until 2026-10-15): it answered
 * `queue: intelligence?.workQueue || []`. loadUserIntelligence reports a failed
 * work-queue read as `workQueue: null` (and names it in `unread`), so the route
 * turned "could not read the queue" into "you have nothing to do".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const H = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('../../services/license-manager.js', () => ({
  getLicenseInfo: vi.fn(),
  getModuleCatalog: vi.fn(),
  canAccessModule: vi.fn(),
  checkProjectQuota: vi.fn(),
  checkUserQuota: vi.fn(),
}));
vi.mock('../../services/user-intelligence.js', () => ({
  loadUserIntelligence: (...a: unknown[]) => H.load(...a),
  touchWorkSession: vi.fn(),
  generateWorkRecommendations: vi.fn(),
  addToWorkQueue: vi.fn(),
}));
vi.mock('../../db.js', () => ({ pool: { query: vi.fn() }, query: vi.fn() }));
vi.mock('../../db', () => ({ pool: { query: vi.fn() }, query: vi.fn() }));

import moduleSubscriptionsRouter from '../module-subscriptions';

const app = express();
app.use((req, _res, next) => {
  (req as any).user = { id: 42, organizationId: 7, role: 'member' };
  next();
});
app.use('/api/module-subscriptions', moduleSubscriptionsRouter);

const ITEM = { id: 1, title: 'Draft 2.5', priority: 'high' };
const intelligence = (workQueue: unknown) => ({ workQueue, activeProject: null, unread: workQueue === null ? ['work queue'] : [] });

beforeEach(() => H.load.mockReset());

describe('GET /work-queue', () => {
  it('answers 503 when the work queue could not be read, not an empty queue', async () => {
    H.load.mockResolvedValue(intelligence(null));
    const res = await request(app).get('/api/module-subscriptions/work-queue');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'The work queue could not be read' });
  });

  it('answers an empty queue when the queue was read and is empty', async () => {
    H.load.mockResolvedValue(intelligence([]));
    const res = await request(app).get('/api/module-subscriptions/work-queue');
    expect(res.status).toBe(200);
    expect(res.body.queue).toEqual([]);
  });

  it('answers the queue it read', async () => {
    H.load.mockResolvedValue(intelligence([ITEM]));
    const res = await request(app).get('/api/module-subscriptions/work-queue');
    expect(res.status).toBe(200);
    expect(res.body.queue).toEqual([ITEM]);
  });
});
