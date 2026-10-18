/**
 * Plan routes report only what happened, under the actor who made the request.
 *
 * Until 2026-10-15:
 *  - POST /plan/:id/execute-next answered 200. It also recorded a 'decision'
 *    protocol event by actor system/kernel-runtime saying "Automatically
 *    executed next dependency-satisfied step". No executor exists: the step was
 *    only marked completed and persisted.
 *  - When the read failed, GET /plan/:id answered 404 "Plan run not found" and
 *    GET /plan/:id/events and /plan/:id/protocol answered 200 { events: [] }.
 *    GET /kernel/metrics answered zeros with qualityBand 'weak'.
 *  - POST /plan/:id/protocol stored actorType and actorId straight from the
 *    request body, so a caller could write an event as anyone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const poolQuery = vi.fn();
const clientQuery = vi.fn();
const poolConnect = vi.fn();
vi.mock('../../db.js', () => ({
  getPool: () => ({ query: (...args: unknown[]) => poolQuery(...args) }),
  pool: {
    query: (...args: unknown[]) => poolQuery(...args),
    connect: (...args: unknown[]) => poolConnect(...args),
  },
}));

import { mountPlanRoutes } from '../ana-ri/plan';
import { mountKernelRoutes } from '../ana-ri/kernel';

/** A request authenticated as `userId` (none when null) in organization 7. */
function appAs(userId: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (userId !== null) (req as any).user = { id: userId };
    (req as any).tenantId = 7;
    next();
  });
  const router = Router();
  mountPlanRoutes(router);
  mountKernelRoutes(router);
  app.use('/api/ana-ri', router);
  return app;
}

const PLAN = {
  planId: 'plan_1',
  goal: 'Audit the IND summary',
  intentLens: 'audit',
  riskTier: 'medium',
  generatedAt: '2026-10-15T00:00:00.000Z',
  replanCount: 0,
  steps: [
    { id: 's1', title: 'Run quality/risk checks', objective: '', dependsOn: [], successCriteria: [], status: 'pending' },
  ],
};
const DECISION = { decision: 'ship', rationale: 'evidence complete' };
const DB_DOWN = 'connection terminated unexpectedly';

const insertCalls = () =>
  poolQuery.mock.calls.filter(([sql]) => /INSERT INTO ai_kernel_agent_protocol_events/.test(String(sql)));

beforeEach(() => {
  poolQuery.mockReset();
  clientQuery.mockReset();
  poolConnect.mockReset();
  poolConnect.mockResolvedValue({ query: clientQuery, release: vi.fn() });
});

describe('POST /api/ana-ri/plan/:planRunId/execute-next', () => {
  it('answers 501 naming the step it did not run, and records no step or decision', async () => {
    poolQuery.mockResolvedValue({ rows: [{ id: 'gpr_1', status: 'active', goal_plan: PLAN }] });

    const res = await request(appAs(41)).post('/api/ana-ri/plan/gpr_1/execute-next');

    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('NO_STEP_EXECUTOR');
    expect(res.body.error.details).toEqual({ nextStepId: 's1' });
    expect(poolConnect).not.toHaveBeenCalled();
    expect(insertCalls()).toHaveLength(0);
  });
});

describe('a failed read answers 500, not absence', () => {
  beforeEach(() => {
    poolQuery.mockRejectedValue(new Error(DB_DOWN));
  });

  it('GET /plan/:planRunId does not answer 404 "not found"', async () => {
    const res = await request(appAs(41)).get('/api/ana-ri/plan/gpr_1');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PLAN_READ_FAILED');
    expect(JSON.stringify(res.body)).not.toContain(DB_DOWN);
  });

  it('GET /plan/:planRunId/events does not answer an empty list', async () => {
    const res = await request(appAs(41)).get('/api/ana-ri/plan/gpr_1/events');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PLAN_EVENTS_READ_FAILED');
  });

  it('GET /plan/:planRunId/protocol does not answer an empty list', async () => {
    const res = await request(appAs(41)).get('/api/ana-ri/plan/gpr_1/protocol');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PROTOCOL_EVENTS_READ_FAILED');
  });

  it('POST /plan/:planRunId/advance does not answer "Plan run not found"', async () => {
    const res = await request(appAs(41))
      .post('/api/ana-ri/plan/gpr_1/advance')
      .send({ stepId: 's1', nextStatus: 'in_progress' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PLAN_READ_FAILED');
  });

  it('GET /kernel/metrics does not answer zeros and a "weak" band', async () => {
    const res = await request(appAs(41)).get('/api/ana-ri/kernel/metrics');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('weak');
  });
});

describe('POST /api/ana-ri/plan/:planRunId/protocol records the session user as the actor', () => {
  beforeEach(() => {
    poolQuery.mockResolvedValue({ rows: [] });
  });

  it('refuses a body that names another actor, and writes nothing', async () => {
    const res = await request(appAs(41))
      .post('/api/ana-ri/plan/gpr_1/protocol')
      .send({ actorType: 'system', actorId: 'kernel-runtime', messageType: 'decision', payload: DECISION });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ACTOR_NOT_SESSION_USER');
    expect(insertCalls()).toHaveLength(0);
  });

  it('records the authenticated user when the body names no actor', async () => {
    const res = await request(appAs(41))
      .post('/api/ana-ri/plan/gpr_1/protocol')
      .send({ messageType: 'decision', payload: DECISION });

    expect(res.status).toBe(200);
    const [, params] = insertCalls()[0] as [string, unknown[]];
    expect(params[2]).toBe('human');
    expect(params[3]).toBe('41');
  });

  it('accepts a body that names the session user', async () => {
    const res = await request(appAs(41))
      .post('/api/ana-ri/plan/gpr_1/protocol')
      .send({ actorType: 'human', actorId: '41', messageType: 'decision', payload: DECISION });
    expect(res.status).toBe(200);
  });

  it('refuses with no authenticated user rather than recording an unattributed event', async () => {
    const res = await request(appAs(null))
      .post('/api/ana-ri/plan/gpr_1/protocol')
      .send({ actorType: 'human', actorId: '41', messageType: 'decision', payload: DECISION });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACTOR_REQUIRED');
    expect(insertCalls()).toHaveLength(0);
  });
});
