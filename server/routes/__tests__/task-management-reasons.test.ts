/**
 * /api/task-management task events record the reason the person stated, or
 * null — never a sentence the code wrote (D5, 21 CFR 11.10(e)).
 *
 * Until 2026-10-01 a write sent with no `reason` was recorded with
 * task-audit.ts `defaultReason` ("Task created via tasking API", …), and four
 * routes wrote their own: a workflow template ("Created from workflow
 * template …", "Linked by workflow template …"), a blocking dependency
 * ("Blocked by new dependency on …") and auto-assign ("Workload-balanced
 * auto-assign"). Those sentences describe what happened; they now ride the
 * row's payload as `summary`, and `reason` is null.
 *
 * Run through the real router and the real task-audit code; the ledger
 * primitive (recordGovernedAction) is the harness's recorder, so `h.audits`
 * holds each row exactly as it would be written.
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

import taskManagementRoutes from '../taskManagement.routes';
import { BUILTIN_WORKFLOW_TEMPLATES } from '../../services/tasking/workflow-templates';
import { h, spies, appFactory, BASE, TEMPLATE_ID, resetHarness } from './_task-management-governed-harness';

const makeApp = appFactory(taskManagementRoutes);

beforeEach(resetHarness);

describe('a stated reason is recorded verbatim (trimmed); none is recorded as null', () => {
  it('POST /tasks with no reason records null', async () => {
    const res = await request(makeApp()).post(`${BASE}/tasks`).send({ title: 'T', moduleType: 'IND' });

    expect(res.status).toBe(200);
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({ command: 'task.create', reason: null });
  });

  it('POST /tasks with a blank reason records null', async () => {
    await request(makeApp()).post(`${BASE}/tasks`).send({ title: 'T', moduleType: 'IND', reason: '   ' });

    expect(h.audits[0].reason).toBeNull();
  });

  it('POST /tasks with a stated reason records it, trimmed', async () => {
    await request(makeApp())
      .post(`${BASE}/tasks`)
      .send({ title: 'T', moduleType: 'IND', reason: '  Requested at the CMC review  ' });

    expect(h.audits[0].reason).toBe('Requested at the CMC review');
  });

  it('POST /tasks/bulk-create records null for each task', async () => {
    await request(makeApp()).post(`${BASE}/tasks/bulk-create`).send({ tasks: [{ title: 'T', moduleType: 'IND' }] });

    expect(h.audits.length).toBeGreaterThan(0);
    expect(h.audits.map((a) => a.reason)).toEqual(h.audits.map(() => null));
  });

  it('POST /tasks/:id/notify records null', async () => {
    h.selects = [[{ taskId: 'TASK-1', title: 'T', assigneeId: 42 }]];

    await request(makeApp()).post(`${BASE}/tasks/TASK-1/notify`).send({ message: 'Please review' });

    expect(h.audits).toEqual([expect.objectContaining({ command: 'task.notify', reason: null })]);
  });
});

describe('what the system did is the payload summary, never the reason', () => {
  it('a blocking dependency: the successor’s transition records null and says why in its summary', async () => {
    h.selects = [[{ taskId: 'TASK-A', status: 'in-progress' }], [{ taskId: 'TASK-B', status: 'pending', title: 'B', assigneeId: 4 }]];

    const res = await request(makeApp()).post(`${BASE}/tasks/dependencies`).send({
      predecessorTaskId: 'TASK-A', successorTaskId: 'TASK-B', dependencyType: 'finish-to-start',
    });

    expect(res.status).toBe(200);
    expect(h.audits.map((a) => [a.command, a.reason])).toEqual([['task.link', null], ['task.transition', null]]);
    expect(h.audits[1].payload).toMatchObject({ from: 'pending', to: 'blocked', summary: 'Blocked by new dependency on TASK-A' });
  });

  it('auto-assign records null and names its method in the summary', async () => {
    h.selects = [[{ taskId: 'TASK-1', title: 'T' }]];
    spies.getOptimalAssignee.mockResolvedValue({ id: 9, name: 'Ana' });

    await request(makeApp()).post(`${BASE}/tasks/auto-assign`).send({ taskIds: ['TASK-1'] });

    expect(h.audits).toEqual([expect.objectContaining({ command: 'task.assign', reason: null })]);
    expect(h.audits[0].payload).toMatchObject({ assigneeId: 9, summary: 'Workload-balanced auto-assign' });
  });

  it('a workflow template records null on every row; each summary names the template', async () => {
    const template = BUILTIN_WORKFLOW_TEMPLATES.find((t) => t.templateId === TEMPLATE_ID)!;

    await request(makeApp()).post(`${BASE}/tasks/from-template/${TEMPLATE_ID}`).send({ projectId: 3 });

    expect(h.audits.length).toBeGreaterThan(0);
    for (const row of h.audits) {
      expect(row.reason, `${row.command} recorded a reason nobody gave`).toBeNull();
      expect(row.payload.summary).toContain(`workflow template "${template.name}"`);
    }
  });
});
