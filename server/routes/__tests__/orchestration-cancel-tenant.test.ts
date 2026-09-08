/**
 * Cancelling a workflow run is tenant-scoped.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * POST /api/orchestration/cancel/:id read only the USER id and called
 * `cancelWorkflow(executionId, userId)`. `cancelWorkflow` looks a run up in a
 * process-global map BY ID ALONE — no organization is involved — so any
 * authenticated user who knew an execution id could cancel another tenant's
 * workflow run. It is reachable from the Cancel control on the Orchestration
 * surface, so it needed no crafted request.
 *
 * Its sibling two routes up, GET /executions/:id, has always verified
 * `execution.organizationId !== orgId` before answering. The READ was scoped
 * and the DESTRUCTIVE route was not.
 *
 * ── Why 404 and not 403 ──────────────────────────────────────────────────────
 * Matching the read. A run belonging to another tenant must not be
 * distinguishable from a run that does not exist, or the id space becomes an
 * oracle for probing which execution ids are live.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { getWorkflowExecution, cancelWorkflow } = vi.hoisted(() => ({
  getWorkflowExecution: vi.fn(),
  cancelWorkflow: vi.fn(),
}));

/* Spread the real module: the orchestrator's template files call
   `registerWorkflowTemplate` at import time, and a factory that replaces the
   module wholesale removes it, so importing the router throws before a single
   test is collected. Only the two functions under test are swapped. */
vi.mock('../../services/orchestration/workflow-orchestrator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/orchestration/workflow-orchestrator')>()),
  getWorkflowExecution,
  cancelWorkflow,
}));

import orchestrationRouter from '../orchestration';

function app(org: number) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: org, id: 5 };
    next();
  });
  a.use('/api/orchestration', orchestrationRouter);
  return a;
}

beforeEach(() => {
  getWorkflowExecution.mockReset();
  cancelWorkflow.mockReset();
  cancelWorkflow.mockReturnValue(true);
});

describe('POST /api/orchestration/cancel/:id', () => {
  it('refuses to cancel a run belonging to another organization', async () => {
    getWorkflowExecution.mockReturnValue({ id: 'exec-9', organizationId: 99 });
    const res = await request(app(7)).post('/api/orchestration/cancel/exec-9').send({});
    expect(res.status).toBe(404);
    // The whole point: the cancel never happens.
    expect(cancelWorkflow).not.toHaveBeenCalled();
  });

  it('does not distinguish another tenant’s run from one that does not exist', async () => {
    getWorkflowExecution.mockReturnValue({ id: 'exec-9', organizationId: 99 });
    const foreign = await request(app(7)).post('/api/orchestration/cancel/exec-9').send({});
    getWorkflowExecution.mockReturnValue(undefined);
    const missing = await request(app(7)).post('/api/orchestration/cancel/exec-nope').send({});
    expect(foreign.status).toBe(missing.status);
    expect(foreign.body).toEqual(missing.body);
  });

  it('checks ownership BEFORE cancelling, not after', async () => {
    getWorkflowExecution.mockReturnValue({ id: 'exec-9', organizationId: 99 });
    await request(app(7)).post('/api/orchestration/cancel/exec-9').send({});
    // A check that runs after the side effect is not a check.
    expect(getWorkflowExecution).toHaveBeenCalledWith('exec-9');
    expect(cancelWorkflow).not.toHaveBeenCalled();
  });

  it('cancels the caller’s OWN run', async () => {
    getWorkflowExecution.mockReturnValue({ id: 'exec-1', organizationId: 7 });
    const res = await request(app(7)).post('/api/orchestration/cancel/exec-1').send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(cancelWorkflow).toHaveBeenCalledWith('exec-1', 5);
  });

  it('still 404s when the run is the caller’s but is not cancellable', async () => {
    getWorkflowExecution.mockReturnValue({ id: 'exec-1', organizationId: 7 });
    cancelWorkflow.mockReturnValue(false);
    const res = await request(app(7)).post('/api/orchestration/cancel/exec-1').send({});
    expect(res.status).toBe(404);
  });
});
