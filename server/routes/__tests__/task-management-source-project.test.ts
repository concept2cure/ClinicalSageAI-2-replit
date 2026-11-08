/**
 * POST /tasks records the project of the document a task is raised on (QA
 * 2026-10-08, second walk, j1).
 *
 * Assign review (client/src/concept2cure/v2/editor/AssignReviewDialog.tsx)
 * creates the reviewer's task with sourceEntityType 'authoring_document' and the
 * document's program in moduleData — and no projectId, because the editor holds
 * a program UUID, not the integer projects.id. The route stored what it was
 * sent, so the task had project_id NULL and the program's Review tab, which
 * reads work by project, said "No tasks or approvals on this program".
 *
 * The route now asks projectForTaskSource (pinned on real SQL in
 * services/tasking/__tests__/task-project.pglite.test.ts) on the request's own
 * RLS client. Same harness as the governed-write tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../db', async () => (await import('./_task-management-governed-harness')).dbModule());
vi.mock('../c2c/actions', async () => (await import('./_task-management-governed-harness')).ledgerModule());
vi.mock('../../services/tasking/task-side-effects', async () =>
  (await import('./_task-management-governed-harness')).sideEffectsModule(),
);
vi.mock('../../services/notifications/notification-service', async () =>
  (await import('./_task-management-governed-harness')).notificationModule(),
);
vi.mock('../../services/tasking/task-signoff', async () =>
  (await import('./_task-management-governed-harness')).signoffModule(),
);
vi.mock('../../services/tasking/task-planning', async () =>
  (await import('./_task-management-governed-harness')).planningModule(),
);
// Observe the real request transaction; source resolution and admission still
// execute over the harness's pinned SQL client and the real canonical policy.
const REQUEST_DB = vi.hoisted(() => ({ transactions: [] as unknown[] }));
vi.mock('../../db/requestDb', async importOriginal => {
  const original = await importOriginal<typeof import('../../db/requestDb')>();
  return { ...original, requestDb: (req: Parameters<typeof original.requestDb>[0]) => {
    const db = original.requestDb(req);
    return new Proxy(db, { get(target, property) {
      if (property === 'transaction') return (callback: (tx: unknown) => Promise<unknown>) => target.transaction(tx => {
        REQUEST_DB.transactions.push(tx);
        return callback(tx);
      });
      return Reflect.get(target, property);
    } });
  } };
});
const projectForTaskSource = vi.hoisted(() => vi.fn(async (..._a: unknown[]): Promise<number | null> => 25));
// The real module's source list (PROJECT_TELLING_SOURCES, which the route reads since
// ee4e7d3c7f), with only the lookup stood in.
vi.mock('../../services/tasking/task-project', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/tasking/task-project')>()),
  projectForTaskSource,
}));

import taskManagementRoutes from '../taskManagement.routes';
import { h, spies, appFactory, BASE, wrote, resetHarness } from './_task-management-governed-harness';

const makeApp = appFactory(taskManagementRoutes);
const DOC = 'a96e686c-7098-4602-81db-5c762c234fe4';
const reviewTask = {
  title: 'Review: QA-W2 2.5 Clinical Overview — Tolvexa',
  moduleType: 'Authoring',
  moduleSource: 'document-workbench',
  category: 'review',
  taskType: 'review',
  sourceEntityType: 'authoring_document',
  sourceEntityId: DOC,
  moduleData: { authoringDocId: DOC, programId: '8a11b987-ac2d-4748-9e9c-5dc40c082662', sectionCode: '2.5.1' },
};

beforeEach(() => {
  resetHarness();
  REQUEST_DB.transactions = [];
  projectForTaskSource.mockReset();
  projectForTaskSource.mockResolvedValue(25);
});

describe('POST /tasks — a task raised on an authoring document is on that document’s project', () => {
  it('records the project the document’s program resolves to, read on the request’s RLS client', async () => {
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send(reviewTask);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(REQUEST_DB.transactions).toHaveLength(1);
    expect(projectForTaskSource).toHaveBeenCalledWith(REQUEST_DB.transactions[0], {
      orgId: 2, sourceEntityType: 'authoring_document', sourceEntityId: DOC,
    });
    expect((h.values[0] as Record<string, unknown>).projectId).toBe(25);
    expect((h.values[0] as Record<string, unknown>).clientWorkspaceId).toBe(75);
    expect(h.log[0]).toBe('BEGIN');
    expect(h.log.at(-1)).toBe('COMMIT');
  });

  it('a project the caller named is kept, and nothing is looked up', async () => {
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send({ ...reviewTask, projectId: 14 });
    expect(res.status).toBe(200);
    expect(projectForTaskSource).not.toHaveBeenCalled();
    expect((h.values[0] as Record<string, unknown>).projectId).toBe(14);
    expect((h.values[0] as Record<string, unknown>).clientWorkspaceId).toBe(74);
  });

  it.each([0, -1, 1.5, 2_147_483_648])('refuses explicit project %j before named assignee SQL or source fallback', async projectId => {
    h.selects = [[{ id: 42, name: 'Sarah Chen' }]];
    const res = await request(makeApp()).post(`${BASE}/tasks`).send({ ...reviewTask, projectId, assigneeId: 42 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TASK_PROJECT_INVALID');
    expect(h.log).toEqual([]);
    expect(projectForTaskSource).not.toHaveBeenCalled();
    expect(spies.getOptimalAssignee).not.toHaveBeenCalled();
    expect(wrote()).toEqual([]);
  });

  it('keeps protected review-route input refusal ahead of explicit project validation', async () => {
    const res = await request(makeApp()).post(`${BASE}/tasks`).send({ ...reviewTask, projectId: 0, reviewRouteId: DOC });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ROUTE_COLUMNS_NOT_ADMITTED');
    expect(h.log).toEqual([]);
    expect(projectForTaskSource).not.toHaveBeenCalled();
  });

  it('keeps automatic selection after source resolution and admission, and notifies only after commit', async () => {
    spies.getOptimalAssignee.mockImplementationOnce(async () => {
      expect(projectForTaskSource).toHaveBeenCalledWith(REQUEST_DB.transactions[0], expect.objectContaining({ sourceEntityId: DOC }));
      expect(h.rawQueries.some(statement => statement.includes('FROM projects p LEFT JOIN project_visibility_settings'))).toBe(true);
      expect(h.log).toEqual(['BEGIN']);
      expect(wrote()).toEqual([]);
      return { id: 9, name: 'Ana' };
    });
    spies.notifyTaskEvent.mockImplementationOnce(() => { expect(h.log.at(-1)).toBe('COMMIT'); });
    const res = await request(makeApp()).post(`${BASE}/tasks`).send(reviewTask);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(spies.getOptimalAssignee).toHaveBeenCalledTimes(1);
    expect(h.values[0]).toMatchObject({ projectId: 25, clientWorkspaceId: 75, assigneeId: 9, assigneeName: 'Ana' });
    expect(spies.notifyTaskEvent).toHaveBeenCalledOnce();
  });

  it('a document with no project record leaves the task without one', async () => {
    projectForTaskSource.mockResolvedValue(null);
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send(reviewTask);
    expect(res.status).toBe(200);
    expect((h.values[0] as Record<string, unknown>).projectId ?? null).toBeNull();
    expect((h.values[0] as Record<string, unknown>).clientWorkspaceId).toBeNull();
  });

  it('when the project cannot be read, nothing is created and the refusal says so', async () => {
    projectForTaskSource.mockRejectedValue(new Error('connection reset'));
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send(reviewTask);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('TASK_PROJECT_UNREADABLE');
    expect(JSON.stringify(res.body)).not.toMatch(/connection reset/);
    expect(wrote()).toEqual([]);
    expect(h.log).toEqual(['BEGIN', 'ROLLBACK']);
    expect(spies.getOptimalAssignee).not.toHaveBeenCalled();
    expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
  });
});
