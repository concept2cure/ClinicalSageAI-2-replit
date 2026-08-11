import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the service + storage so the router imports cleanly and we can observe
// exactly what org the handlers pass down. getSecureOrgId (tenantContext) is
// NOT mocked — we exercise the real JWT-derived org enforcement.
// vi.hoisted keeps the spies available to the hoisted vi.mock factory.
const m = vi.hoisted(() => ({
  getAllUnifiedTasks: vi.fn(),
  getOrgTaskById: vi.fn(),
  updateTaskStatus: vi.fn(),
  getTasksByModule: vi.fn(),
  createUnifiedTask: vi.fn(),
  linkTasks: vi.fn(),
  getUnifiedDashboardMetrics: vi.fn(),
  syncTasksFromModule: vi.fn(),
  auditTaskAction: vi.fn(),
}));

vi.mock('../../services/unifiedTaskService', () => ({
  default: { ...m },
  MODULE_CONFIG: {},
}));
vi.mock('../../storage', () => ({ storage: { db: {} } }));
// Isolate the route from the real audit ledger (db/chain/bcrypt); assert it is invoked.
vi.mock('../../services/tasking/task-audit', () => ({ auditTaskAction: m.auditTaskAction }));
// The completion side-effects (dependency-unblock cascade + notifications) are a
// separate unit. This route test mocks the service/storage layer, so no real
// unified_tasks rows exist; the real cascade would issue its own org-scoped
// queries on the shared instrumented pool, which fail closed here
// (RLS_ENFORCE=on with no request-scoped tenant context in this unit harness —
// production runs them inside the JWT auth boundary's tenant scope). Mock them
// like the other collaborators so the route logic is exercised in isolation.
vi.mock('../../services/tasking/task-side-effects', () => ({
  cascadeUnblockOnCompletion: vi.fn(),
  notifyTaskEvent: vi.fn(),
  wouldCreateDependencyCycle: vi.fn(() => Promise.resolve(false)),
}));

import unifiedTaskRoutes from '../unifiedTasks.routes';

/** Build an app; `org`, when set, simulates the JWT org the auth middleware
 *  would attach to req.user. */
function makeApp(org?: number) {
  const app = express();
  app.use(express.json());
  if (org != null) {
    app.use((req, _res, next) => {
      (req as any).user = { organizationId: org, id: 99 };
      next();
    });
  }
  app.use('/api/regulatory/tasks', unifiedTaskRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('unifiedTasks routes — tenant isolation', () => {
  it('GET /all returns 401 when there is no org context', async () => {
    const res = await request(makeApp(undefined)).get('/api/regulatory/tasks/all');
    expect(res.status).toBe(401);
    expect(m.getAllUnifiedTasks).not.toHaveBeenCalled();
  });

  it('GET /all scopes to the JWT org and ignores a client organizationId param', async () => {
    m.getAllUnifiedTasks.mockResolvedValue([]);
    const res = await request(makeApp(2)).get('/api/regulatory/tasks/all?organizationId=9');
    expect(res.status).toBe(200);
    expect(m.getAllUnifiedTasks).toHaveBeenCalledTimes(1);
    // The forged ?organizationId=9 must be ignored in favour of the JWT org 2.
    expect(m.getAllUnifiedTasks.mock.calls[0][0]).toMatchObject({ organizationId: 2 });
  });

  it("PATCH /:id/status blocks mutating another org's task (404) and does not write", async () => {
    // The org-scoped lookup finds nothing for the caller's org.
    m.getOrgTaskById.mockResolvedValue(null);
    const res = await request(makeApp(2))
      .patch('/api/regulatory/tasks/TASK-OTHER/status')
      .send({ status: 'completed' });
    expect(res.status).toBe(404);
    expect(m.getOrgTaskById).toHaveBeenCalledWith(2, 'TASK-OTHER');
    expect(m.updateTaskStatus).not.toHaveBeenCalled();
  });

  it('PATCH /:id/status updates a task that belongs to the caller org', async () => {
    // 'review' → 'completed' is a legal transition; no approval gate → no e-sign.
    m.getOrgTaskById.mockResolvedValue({
      id: 1, taskId: 'TASK-A', organizationId: 2, status: 'review',
      title: 'Freeze gate', approvalRequired: false, approvalStatus: null,
    });
    m.updateTaskStatus.mockResolvedValue({ id: 1, taskId: 'TASK-A', status: 'completed' });
    const res = await request(makeApp(2))
      .patch('/api/regulatory/tasks/TASK-A/status')
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(m.updateTaskStatus).toHaveBeenCalledWith('TASK-A', 'completed', undefined, {
      manifestation: null,
      organizationId: 2,
      // Compare-and-set: the write matches only while the row still holds the
      // status the handler validated the transition against.
      expectedStatus: 'review',
    });
    // The mutation writes a transparent lineage record.
    expect(m.auditTaskAction).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'task.transition', taskId: 'TASK-A', orgId: 2 }),
    );
  });

  // Regression: :id may be the numeric primary key — getOrgTaskById resolves
  // either form — but the write is keyed on task_id. Passing the raw path param
  // through matched ZERO rows while the audit entry, the cascade and the 200 all
  // still fired: a governed ledger record asserting a transition that never
  // happened, filed under `task:<pk>` so it chained to nothing.
  it('PATCH /:id/status addressed by numeric id writes with the resolved business key', async () => {
    m.getOrgTaskById.mockResolvedValue({
      id: 1234, taskId: 'TASK-X', organizationId: 2, status: 'in-progress',
      title: 'Numeric addressing', approvalRequired: false, approvalStatus: null,
    });
    m.updateTaskStatus.mockResolvedValue({ id: 1234, taskId: 'TASK-X', status: 'completed' });
    const res = await request(makeApp(2))
      .patch('/api/regulatory/tasks/1234/status')
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(m.updateTaskStatus.mock.calls[0][0]).toBe('TASK-X');
    expect(m.auditTaskAction).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'task.transition', taskId: 'TASK-X' }),
    );
  });

  it('PATCH /:id/status 409s without auditing when the write matches no row', async () => {
    m.getOrgTaskById.mockResolvedValue({
      id: 1, taskId: 'TASK-A', organizationId: 2, status: 'review',
      title: 'Raced', approvalRequired: false, approvalStatus: null,
    });
    // The compare-and-set lost: another transition moved the row first.
    m.updateTaskStatus.mockResolvedValue(undefined);
    const res = await request(makeApp(2))
      .patch('/api/regulatory/tasks/TASK-A/status')
      .send({ status: 'completed' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT_STALE');
    // Nothing may be asserted about a transition that did not commit.
    expect(m.auditTaskAction).not.toHaveBeenCalled();
  });

  it('PATCH /:id/status runs the state machine — an illegal move 409s without writing', async () => {
    m.getOrgTaskById.mockResolvedValue({
      id: 1, taskId: 'TASK-A', organizationId: 2, status: 'pending',
      title: 'Draft', approvalRequired: false, approvalStatus: null,
    });
    const res = await request(makeApp(2))
      .patch('/api/regulatory/tasks/TASK-A/status')
      .send({ status: 'completed' }); // pending cannot skip straight to completed
    expect(res.status).toBe(409);
    expect(m.updateTaskStatus).not.toHaveBeenCalled();
    expect(m.auditTaskAction).not.toHaveBeenCalled();
  });

  it('PATCH /:id/status demands the e-sign ceremony on approval-gated completion (428)', async () => {
    // This router previously completed gated tasks with no signature — the
    // ceremony was one URL away from optional. Now both routers gate.
    m.getOrgTaskById.mockResolvedValue({
      id: 1, taskId: 'TASK-A', organizationId: 2, status: 'review',
      title: 'Submission gate', approvalRequired: true, approvalStatus: 'pending',
    });
    const res = await request(makeApp(2))
      .patch('/api/regulatory/tasks/TASK-A/status')
      .send({ status: 'completed' }); // no signature
    expect(res.status).toBe(428);
    expect(res.body.code).toBe('ESIGN_REQUIRED');
    expect(m.updateTaskStatus).not.toHaveBeenCalled();
  });

  it('POST /unified forces the JWT org onto the created task', async () => {
    m.createUnifiedTask.mockImplementation(async (data: any) => ({ id: 5, taskId: 'TASK-N', ...data }));
    const res = await request(makeApp(2))
      .post('/api/regulatory/tasks/unified')
      .send({ moduleType: 'IND', title: 'Draft', organizationId: 9 });
    expect(res.status).toBe(201);
    expect(m.createUnifiedTask).toHaveBeenCalledTimes(1);
    // Body said org 9; the verified JWT org 2 must win.
    expect(m.createUnifiedTask.mock.calls[0][0]).toMatchObject({ organizationId: 2 });
  });
});
