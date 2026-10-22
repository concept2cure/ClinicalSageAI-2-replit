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
const REQUEST_DB = vi.hoisted(() => ({ marker: 'the request-scoped RLS client' }));
vi.mock('../../db/requestDb', () => ({ requestDb: () => REQUEST_DB }));
const projectForTaskSource = vi.hoisted(() => vi.fn(async (..._a: unknown[]): Promise<number | null> => 25));
vi.mock('../../services/tasking/task-project', () => ({ projectForTaskSource, AUTHORING_DOCUMENT_SOURCE: 'authoring_document' }));

import taskManagementRoutes from '../taskManagement.routes';
import { h, appFactory, BASE, wrote, resetHarness } from './_task-management-governed-harness';

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
  projectForTaskSource.mockReset();
  projectForTaskSource.mockResolvedValue(25);
});

describe('POST /tasks — a task raised on an authoring document is on that document’s project', () => {
  it('records the project the document’s program resolves to, read on the request’s RLS client', async () => {
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send(reviewTask);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(projectForTaskSource).toHaveBeenCalledWith(REQUEST_DB, {
      orgId: 2, sourceEntityType: 'authoring_document', sourceEntityId: DOC,
    });
    expect((h.values[0] as Record<string, unknown>).projectId).toBe(25);
  });

  it('a project the caller named is kept, and nothing is looked up', async () => {
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send({ ...reviewTask, projectId: 14 });
    expect(res.status).toBe(200);
    expect(projectForTaskSource).not.toHaveBeenCalled();
    expect((h.values[0] as Record<string, unknown>).projectId).toBe(14);
  });

  it('a document with no project record leaves the task without one', async () => {
    projectForTaskSource.mockResolvedValue(null);
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send(reviewTask);
    expect(res.status).toBe(200);
    expect((h.values[0] as Record<string, unknown>).projectId ?? null).toBeNull();
  });

  it('when the project cannot be read, nothing is created and the refusal says so', async () => {
    projectForTaskSource.mockRejectedValue(new Error('connection reset'));
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send(reviewTask);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('TASK_PROJECT_UNREADABLE');
    expect(JSON.stringify(res.body)).not.toMatch(/connection reset/);
    expect(wrote()).toEqual([]);
  });
});
