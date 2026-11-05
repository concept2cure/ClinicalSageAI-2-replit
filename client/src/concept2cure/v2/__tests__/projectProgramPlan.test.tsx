// @vitest-environment jsdom
/**
 * The project's program plan in its Plan step (S11, P-82): the filing's work
 * breakdown with this project's progress. A status is written to the project's
 * own route, reverted and said when refused; a filing with no work breakdown is
 * told so; a failed read is said, never an empty plan.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
// No signed-in user: canGovernedWrite admits it, as for a writer (shared/constants/permissions.ts).
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
import { ProjectProgramPlan } from '../surfaces/PyramidProject';
import { planAssignments, PYRAMID_TASK_ENTITY, PLAN_TASK_ENTITY } from '../surfaces/PlanAssign';

const PROGRAM = '7abb1c22-1111-4222-8333-444455556666';
const PATH = `/api/v1/pyramids/by-project/${PROGRAM}`;
const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data, headers: new Headers() }) as Response;
const task = (id: string, phase: string, over: Record<string, unknown> = {}) => ({
  id, phase, name: `Task ${id}`, role: 'regulatory', hours: 10, status: 'todo', critical: false, deps: [], ctd: [], ...over });
const PYRAMID = { id: 'IND', label: 'Investigational New Drug', phases: [
  { id: 'p1', order: 1, name: 'Strategy', weeks: 2 }, { id: 'p2', order: 2, name: 'Authoring', weeks: 6 }],
  tasks: [task('t1', 'p1', { critical: true }), task('t2', 'p2'), task('t3', 'p2', { critical: true })] };
let reads: unknown;
beforeEach(() => {
  reads = { success: true, data: { programId: PROGRAM, type: 'IND', label: 'Investigational New Drug', filing: 'us_ind', pyramid: PYRAMID, statuses: { t1: 'done' } } };
  apiRequest.mockReset();
  apiRequest.mockImplementation((method: string) => Promise.resolve(method === 'PATCH' ? ok({ success: true, data: {} }) : ok(reads)));
});
afterEach(() => cleanup());

const mount = () => render(<ProjectProgramPlan programId={PROGRAM} onNav={vi.fn()} onAsk={vi.fn()} />);

describe("the project's program plan", () => {
  it("reads the project's own pyramid and states its progress from the project's statuses", async () => {
    mount();
    await screen.findByRole('heading', { name: 'Program plan' });
    expect(apiRequest.mock.calls[0][1]).toBe(PATH);
    // From the first render that shows the plan: it never claims, even for a moment, that nothing is done.
    expect(document.querySelector('[data-testid="pj-program-plan"] .pj-desc')?.textContent)
      .toMatch(/^1 of 3 tasks done · critical path 50% done · about 20 hours of work remaining\./);
    expect(screen.getByText('The work breakdown: 2 phases, 3 tasks')).toBeTruthy();
  });

  it("records a task's status on the project's route", async () => {
    mount();
    fireEvent.click(await screen.findByText('The work breakdown: 2 phases, 3 tasks'));
    fireEvent.change(screen.getByLabelText('Status of Task t2'), { target: { value: 'in-progress' } });
    await waitFor(() => expect(apiRequest.mock.calls.some(([m]) => m === 'PATCH')).toBe(true));
    const [, path, body] = apiRequest.mock.calls.find(([m]) => m === 'PATCH')!;
    expect(path).toBe(`${PATH}/progress/t2`);
    expect(body).toEqual({ status: 'in-progress' });
  });

  it('reverts a refused status and says it was not saved', async () => {
    apiRequest.mockImplementation((method: string) => Promise.resolve(method === 'PATCH'
      ? ok({ error: { code: 'PROJECT_ARCHIVED', message: 'This project is archived.' } }, 403) : ok(reads)));
    mount();
    fireEvent.click(await screen.findByText('The work breakdown: 2 phases, 3 tasks'));
    const select = screen.getByLabelText('Status of Task t2') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'done' } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/^The status was not saved/);
    expect(select.value).toBe('todo');
  });

  it('says a filing has no work breakdown, and invents none', async () => {
    reads = { success: true, data: { programId: PROGRAM, type: null, filing: 'ca_nds' } };
    mount();
    expect((await screen.findByTestId('pj-program-none')).textContent).toMatch(/This project.s filing \(ca_nds\) has none yet/);
    expect(screen.queryByRole('heading', { name: 'Program plan' })).toBeNull();
  });

  it('says the plan could not be read when the read fails', async () => {
    apiRequest.mockImplementation(() => Promise.resolve(ok({ error: 'down' }, 503)));
    mount();
    await screen.findByText("This project's program plan could not be read.");
  });
});

// S11 step 3 (THE_PROGRAM §3.3, §7.2): each task's owner and due date. The dates are the route's (the engine's
// back-schedule from the target date); the owner is a task in the one task store, made by the Plan step's Assign.
describe("the program plan's owners and due dates", () => {
  const SCHEDULE = { target: '2027-06-04', anchorTaskId: 't3', start: '2026-10-01', tasks: {
    t1: { start: '2026-10-01', due: '2026-10-30', workingDays: 22, basis: 'estimated-hours' },
    t2: { start: '2026-11-02', due: '2026-11-10', workingDays: 7, basis: 'estimated-hours' },
    t3: { start: '2027-06-01', due: '2027-06-04', workingDays: 4, basis: 'typical-duration' },
  } };
  const DANA = { id: '12', name: 'Dana Ruiz' };
  const owned = (taskId: string, over: Record<string, unknown> = {}) => ({
    taskId: 'task-9', sourceEntityType: PYRAMID_TASK_ENTITY, sourceEntityId: `${PROGRAM}:${taskId}`,
    assigneeName: 'Dana Ruiz', dueDate: '2027-06-04T17:00:00.000Z', status: 'pending', createdAt: '2026-11-05T10:00:00Z', ...over });
  let posted: Record<string, unknown> | null;
  beforeEach(() => {
    posted = null;
    reads = { success: true, data: { ...(reads as { data: object }).data, target: '2027-06-04', asOf: '2026-11-05', schedule: SCHEDULE } };
    apiRequest.mockImplementation((method: string, url: string, body?: Record<string, unknown>) => {
      if (url === '/api/task-management/assignees') return Promise.resolve(ok({ success: true, data: [DANA] }));
      if (method === 'POST' && url === '/api/tasks/tasks') {
        posted = body ?? null;
        return Promise.resolve(ok({ success: true, data: { taskId: 'task-9', sourceEntityType: body?.sourceEntityType,
          sourceEntityId: body?.sourceEntityId, assigneeId: body?.assigneeId, assigneeName: 'Dana Ruiz' } }, 201));
      }
      return Promise.resolve(ok(reads));
    });
  });
  const owners = (rows: unknown[]) => planAssignments(rows, PROGRAM, PYRAMID_TASK_ENTITY);
  const mountWith = (props: Partial<React.ComponentProps<typeof ProjectProgramPlan>> = {}) =>
    render(<ProjectProgramPlan programId={PROGRAM} projectId={51} owners={owners([owned('t3')])} onAssigned={vi.fn()} onNav={vi.fn()} onAsk={vi.fn()} {...props} />);
  const row = (name: string) => screen.getByText(name).closest('.py-row') as HTMLElement;

  it('says the schedule is built back from the target date, when the work starts, what is behind, and who owns what', async () => {
    mountWith();
    const line = (await screen.findByTestId('pj-program-schedule')).textContent ?? '';
    expect(line).toMatch(/^Scheduled back from the target submission date, Jun 4, 2027: the work starts by Oct 1, 2026\./);
    // t1 is done; t2 started on Nov 2 and is still To do on Nov 5.
    expect(line).toMatch(/One unfinished task is past its dates\./);
    expect(line).toMatch(/1 of 3 tasks have an owner\./);
  });

  it("puts each task's owner and due date on its row, with a word when it is behind", async () => {
    mountWith();
    fireEvent.click(await screen.findByText('The work breakdown: 2 phases, 3 tasks'));
    expect(within(row('Task t3')).getByText('Dana Ruiz')).toBeTruthy();
    expect(within(row('Task t3')).getByText('due Jun 4, 2027')).toBeTruthy();
    expect(within(row('Task t2')).getByText('No owner')).toBeTruthy();
    expect(within(row('Task t2')).getByText('due Nov 10, 2026 · should have started')).toBeTruthy();
    // t1's due date (Oct 30) has passed, but it is done: it is behind nothing.
    expect(within(row('Task t1')).getByText('due Oct 30, 2026').textContent).not.toMatch(/past due/);
  });

  it("makes an owner's task through the existing Assign, under the pyramid task's own origin, due on the schedule's date", async () => {
    const onAssigned = vi.fn();
    mountWith({ onAssigned });
    fireEvent.click(await screen.findByText('The work breakdown: 2 phases, 3 tasks'));
    fireEvent.click(within(row('Task t2')).getByRole('button', { name: /Task t2/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Task t2' });
    expect(within(sheet).getByTestId('py-task-plan').textContent).toMatch(/Starts by Nov 2, 2026, due Nov 10, 2026 · 7 working days from its estimated hours · should have started\./);
    expect(within(sheet).getByText('No owner yet.')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: /^.*Assign$/ }));
    const drawers = await screen.findAllByRole('dialog');
    const drawer = drawers[drawers.length - 1];
    fireEvent.change(await within(drawer).findByLabelText(/Person/), { target: { value: '12' } });
    expect((within(drawer).getByLabelText(/Due date/) as HTMLInputElement).value).toBe('2026-11-10');
    fireEvent.click(within(drawer).getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({
      title: 'Task t2', moduleType: 'Plan', projectId: 51, assigneeId: 12,
      sourceEntityType: PYRAMID_TASK_ENTITY, sourceEntityId: `${PROGRAM}:t2`,
      moduleData: { programId: PROGRAM, pyramidTaskId: 't2', phase: 'p2' },
    });
    expect(String(posted!.dueDate)).toMatch(/^2026-11-1[01]T/);
    await waitFor(() => expect(onAssigned).toHaveBeenCalled());
  });

  it("shows the owner's task and says when the schedule has moved since it was assigned", async () => {
    mountWith({ owners: owners([owned('t3', { dueDate: '2027-05-28T17:00:00.000Z' })]) });
    fireEvent.click(await screen.findByText('The work breakdown: 2 phases, 3 tasks'));
    fireEvent.click(within(row('Task t3')).getByRole('button', { name: /Task t3/ }));
    const plan = within(await screen.findByRole('dialog', { name: 'Task t3' })).getByTestId('py-task-plan');
    expect(plan.textContent).toMatch(/Assigned to Dana Ruiz, due May 28, 2027\. The schedule now says Jun 4, 2027\./);
    expect(within(plan).getByRole('button', { name: /Assign another person/ })).toBeTruthy();
  });

  it('gives no due dates when no target date is recorded, and says where to set one', async () => {
    reads = { success: true, data: { ...(reads as { data: object }).data, target: null, schedule: null } };
    mountWith();
    expect((await screen.findByTestId('pj-program-schedule')).textContent)
      .toBe('No target submission date is recorded, so the tasks have no due dates. Set one in Project settings, at the top of this page.');
    fireEvent.click(screen.getByText('The work breakdown: 2 phases, 3 tasks'));
    expect(within(row('Task t2')).queryByText(/^due /)).toBeNull();
  });

  it("reads the schedule again when the project's target date changes", async () => {
    const { rerender } = mountWith({ targetKey: '2027-06-04' });
    await screen.findByTestId('pj-program-schedule');
    const before = apiRequest.mock.calls.filter(([, u]) => u === PATH).length;
    rerender(<ProjectProgramPlan programId={PROGRAM} projectId={51} owners={owners([])} onAssigned={vi.fn()} targetKey="2027-09-01" onNav={vi.fn()} onAsk={vi.fn()} />);
    await waitFor(() => expect(apiRequest.mock.calls.filter(([, u]) => u === PATH).length).toBeGreaterThan(before));
  });

  it("keeps a deliverable's tasks and a work-breakdown task's apart", () => {
    const rows = [owned('t2'), { ...owned('t2'), sourceEntityType: PLAN_TASK_ENTITY, taskId: 'deliv' }];
    expect(planAssignments(rows, PROGRAM, PYRAMID_TASK_ENTITY).get('t2')?.taskId).toBe('task-9');
    expect(planAssignments(rows, PROGRAM).get('t2')?.taskId).toBe('deliv');
  });
});
