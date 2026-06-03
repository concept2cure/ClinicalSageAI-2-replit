import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the service + storage so the router imports cleanly and we can observe
// exactly what org the handlers pass down. getSecureOrgId (tenantContext) is
// NOT mocked — we exercise the real JWT-derived org enforcement.
// vi.hoisted keeps the spies available to the hoisted vi.mock factory.
const m = vi.hoisted(() => ({
  getAllUnifiedTasks: vi.fn(),
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
    m.getAllUnifiedTasks.mockResolvedValue([{ id: 1, taskId: 'TASK-A', organizationId: 2 }]);
    const res = await request(makeApp(2))
      .patch('/api/regulatory/tasks/TASK-OTHER/status')
      .send({ status: 'completed' });
    expect(res.status).toBe(404);
    expect(m.updateTaskStatus).not.toHaveBeenCalled();
  });

  it('PATCH /:id/status updates a task that belongs to the caller org', async () => {
    m.getAllUnifiedTasks.mockResolvedValue([{ id: 1, taskId: 'TASK-A', organizationId: 2 }]);
    m.updateTaskStatus.mockResolvedValue({ id: 1, taskId: 'TASK-A', status: 'completed' });
    const res = await request(makeApp(2))
      .patch('/api/regulatory/tasks/TASK-A/status')
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(m.updateTaskStatus).toHaveBeenCalledWith('TASK-A', 'completed', undefined);
    // The mutation writes a transparent lineage record.
    expect(m.auditTaskAction).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'task.transition', taskId: 'TASK-A', orgId: 2 }),
    );
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
