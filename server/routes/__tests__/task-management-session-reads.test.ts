/**
 * The two task routes outside the governed-write gate still resolve "me" from
 * the session with the canonical governedActorId: GET /my-work (a read) and
 * POST /messages (a notification, no ledger row).
 *
 * Neither had a test. When the private actor helper was replaced by the shared
 * governed-task-write module (2026-09-23), the governedActorId import went with
 * it while both routes still called it: every request would have thrown a
 * ReferenceError and answered 500. These pin that each route reaches its own
 * answer — 401 without an organization or a user — and never a 500.
 */
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../db', () => ({ db: {}, pool: {} }));
vi.mock('../../utils/tenantContext', () => ({
  getSecureOrgId: (req: { __org?: number }) => req.__org ?? null,
}));

import taskRoutes from '../taskManagement.routes';

function app(ctx: { org?: number; userId?: number }) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, { __org: ctx.org, userId: ctx.userId });
    next();
  });
  a.use('/api/tasks', taskRoutes);
  return a;
}

describe('session-scoped task routes resolve the actor, and answer 401 without one', () => {
  it('GET /my-work with an organization but no user is 401, not a 500', async () => {
    const res = await request(app({ org: 7 })).get('/api/tasks/my-work');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/user context required/i);
  });

  it('POST /messages with no organization is 401, not a 500', async () => {
    const res = await request(app({ userId: 11 }))
      .post('/api/tasks/messages')
      .send({ recipientUserId: 12, message: 'Please review section 2.5' });
    expect(res.status).toBe(401);
  });
});
