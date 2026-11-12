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
import { ProjectProgramPlan, producingTaskId } from '../surfaces/PyramidProject';
import { planAssignments, planDueFor, DueForYou, PYRAMID_TASK_ENTITY, PLAN_TASK_ENTITY } from '../surfaces/PlanAssign';

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

/** Opens every workstream, so each one's tasks are listed (the work breakdown, by workstream). */
async function openWorkstreams() {
  const ws = await screen.findByTestId('pj-workstreams');
  for (const d of Array.from(ws.querySelectorAll('details.py-ws-row'))) {
    (d as HTMLElement & { open: boolean }).open = true;
    fireEvent(d, new Event('toggle'));
  }
}

const mount = () => render(<ProjectProgramPlan programId={PROGRAM} onNav={vi.fn()} onAsk={vi.fn()} />);

describe("the project's program plan", () => {
  it("reads the project's own pyramid and states its progress from the project's statuses", async () => {
    mount();
    await screen.findByRole('heading', { name: 'Program plan' });
    expect(apiRequest.mock.calls[0][1]).toBe(PATH);
    // From the first render that shows the plan: it never claims, even for a moment, that nothing is done.
    expect(document.querySelector('[data-testid="pj-program-plan"] .pj-desc')?.textContent)
      .toMatch(/^1 of 3 tasks done · critical path 50% done · about 20 hours of work remaining\./);
    expect(screen.getByTestId('pj-workstreams').querySelectorAll('details.py-ws-row')).toHaveLength(2);
  });

  it("records a task's status on the project's route", async () => {
    mount();
    await openWorkstreams();
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
    await openWorkstreams();
    const select = screen.getByLabelText('Status of Task t2') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'done' } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/^The status was not saved/);
    expect(select.value).toBe('todo');
  });

  it('says a filing has no work breakdown, and invents none', async () => {
    reads = { success: true, data: { programId: PROGRAM, type: null, filing: 'ca_nds' } };
    mount();
    expect((await screen.findByTestId('pj-program-none')).textContent).toMatch(/This project.s filing, New Drug Submission \(NDS\), has none yet/);
    expect(screen.queryByRole('heading', { name: 'Program plan' })).toBeNull();
  });

  // Human test J1 (2026-11-06): "510(k)s" beside "(us_510k_ivd) has none" read as a contradiction and a stored key.
  it("names the filing in words, never its key: a 510(k) for IVD", async () => {
    reads = { success: true, data: { programId: PROGRAM, type: null, filing: 'us_510k_ivd' } };
    mount();
    const note = (await screen.findByTestId('pj-program-none')).textContent ?? '';
    expect(note).toMatch(/This project.s filing, 510\(k\) for IVD, has none yet/);
    expect(note).not.toContain('us_510k_ivd');
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
    expect(line).toMatch(/1 of 3 task has an owner\./);
  });

  it("puts each task's owner and due date on its row, with a word when it is behind", async () => {
    mountWith();
    await openWorkstreams();
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
    await openWorkstreams();
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
    await openWorkstreams();
    fireEvent.click(within(row('Task t3')).getByRole('button', { name: /Task t3/ }));
    const plan = within(await screen.findByRole('dialog', { name: 'Task t3' })).getByTestId('py-task-plan');
    expect(plan.textContent).toMatch(/Assigned to Dana Ruiz, due May 28, 2027\. The schedule now says Jun 4, 2027\./);
    expect(within(plan).getByRole('button', { name: /Assign another person/ })).toBeTruthy();
    // The owner's task can be moved to the schedule's date (tasking's governed reschedule).
    expect(within(plan).getByRole('button', { name: /Use the schedule.s date/ })).toBeTruthy();

  });

  it('gives no due dates when no target date is recorded, and says where to set one', async () => {
    reads = { success: true, data: { ...(reads as { data: object }).data, target: null, schedule: null } };
    mountWith();
    expect((await screen.findByTestId('pj-program-schedule')).textContent)
      .toBe('No target submission date is recorded, so the tasks have no due dates. Set one in Project settings, at the top of this page.');
    await openWorkstreams();
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

// S11 step 4: the content plan's key and "Due for you".
describe('the content plan join and due-for-you, as functions', () => {
  it("reads a catalogue document's producing task from its id, and only from the catalogue's two shapes", () => {
    expect(producingTaskId('phase1.product_profile:deliverable:0')).toBe('phase1.product_profile');
    expect(producingTaskId('phase5.design:subtask:sap')).toBe('phase5.design');
    expect(producingTaskId('device-workstream-3')).toBeNull();
  });

  it("lists only the person's open tasks of this project's plan, by due date, none last", () => {
    const row = (taskId: string, over: Record<string, unknown>) => ({ taskId, title: taskId, sourceEntityType: PYRAMID_TASK_ENTITY,
      sourceEntityId: `${PROGRAM}:${taskId}`, assigneeId: 3, status: 'pending', dueDate: null, ...over });
    const items = planDueFor([
      row('late', { dueDate: '2027-01-02T17:00:00Z' }),
      row('early', { dueDate: '2026-12-01T17:00:00Z', sourceEntityType: PLAN_TASK_ENTITY }),
      row('undated', {}),
      row('someone-else', { assigneeId: 4 }),
      row('other-project', { sourceEntityId: 'another:x' }),
      row('done', { status: 'completed' }),
      row('not-plan', { sourceEntityType: 'review' }),
    ], PROGRAM, '3');
    expect(items.map((i) => `${i.taskId}/${i.kind}`)).toEqual(['early/document', 'late/work', 'undated/work']);
    expect(planDueFor([row('late', {})], PROGRAM, null)).toEqual([]);
  });

  it('says a past-due task in words, and an unread list as unread', () => {
    const { rerender } = render(<DueForYou today={new Date(2026, 10, 5)} unread={false}
      items={[{ taskId: 'a', kind: 'work', title: 'Submit IND', dueDate: '2026-11-03T17:00:00Z', status: 'in-progress' }]} />);
    expect(screen.getByTestId('pj-due-for-you').querySelector('.pj-due-d')?.textContent).toMatch(/^Due Nov 3, 2026 · past due · /);
    rerender(<DueForYou unread items={[]} />);
    expect(screen.getByText('Your tasks in this project could not be read.')).toBeTruthy();
  });
});

// THE_PROGRAM §8 items 3–4: the workstreams and the schedule line.
describe("the program plan's workstreams and schedule line", () => {
  const GATED = { ...PYRAMID, phases: [{ id: 'p1', order: 1, name: 'Strategy', gate: 't1' }, { id: 'p2', order: 2, name: 'Authoring', gate: 't3' }],
    tasks: [task('t1', 'p1', { critical: true }), task('t2', 'p2', { deps: ['t1'] }), task('t3', 'p2', { critical: true, deps: ['t2'] })] };
  const SCHEDULE = { target: '2027-06-04', anchorTaskId: 't3', start: '2026-10-01', tasks: {
    t1: { start: '2026-10-01', due: '2026-10-30', workingDays: 22, basis: 'estimated-hours' },
    t2: { start: '2026-11-02', due: '2027-05-31', workingDays: 150, basis: 'estimated-hours' },
    t3: { start: '2027-06-01', due: '2027-06-04', workingDays: 4, basis: 'typical-duration' },
  } };
  const CLOCK = { authority: 'FDA', basis: '21 CFR 312.40', days: 30, ends: '2027-07-04', label: 'Study may proceed',
    caveat: 'x', clockStops: false, milestones: [] };
  const DANA_T3 = { taskId: 'w', title: 'Task t3', sourceEntityType: PYRAMID_TASK_ENTITY, sourceEntityId: `${PROGRAM}:t3`,
    assigneeName: 'Dana Ruiz', dueDate: null, status: 'pending', createdAt: '2026-11-05T10:00:00Z' };
  const serveRead = (over: Record<string, unknown>) => {
    reads = { success: true, data: { programId: PROGRAM, type: 'IND', label: 'IND', filing: 'us_ind', pyramid: GATED, statuses: {},
      target: '2027-06-04', asOf: '2026-11-05', schedule: SCHEDULE, reviewClock: CLOCK, ...over } };
  };
  const rowOf = (name: string) => Array.from(document.querySelectorAll<HTMLElement>('details.py-ws-row'))
    .find((r) => r.querySelector('.py-ws-name')?.textContent === name)!;

  it('lists one row per workstream: lead, tasks done, completion date and a status word', async () => {
    serveRead({ statuses: { t1: 'done' } });
    render(<ProjectProgramPlan programId={PROGRAM} owners={planAssignments([DANA_T3], PROGRAM, PYRAMID_TASK_ENTITY)} onNav={vi.fn()} onAsk={vi.fn()} />);
    await screen.findByTestId('pj-workstreams');
    expect(rowOf('Strategy').querySelector('summary')?.textContent).toBe('StrategyNo lead1 of 1 doneCompletedDone');
    // t2 should have started on Nov 2 and is still To do on Nov 5: at risk, said in words.
    expect(rowOf('Authoring').querySelector('summary')?.textContent).toBe('AuthoringLead Dana Ruiz0 of 2 doneCompletes Jun 4, 2027At risk');
    expect(rowOf('Authoring').dataset.status).toBe('at-risk');
    expect(screen.getByText(/A workstream.s lead is the owner of the task that completes it\./)).toBeTruthy();
  });

  it('says Blocked when a task is recorded blocked, and Not scheduled without a target date', async () => {
    serveRead({ statuses: { t2: 'blocked' } });
    const { unmount } = render(<ProjectProgramPlan programId={PROGRAM} onNav={vi.fn()} onAsk={vi.fn()} />);
    await screen.findByTestId('pj-workstreams');
    expect(rowOf('Authoring').querySelector('.py-ws-status')?.textContent).toBe('Blocked');
    unmount();
    serveRead({ target: null, schedule: null, reviewClock: null });
    render(<ProjectProgramPlan programId={PROGRAM} onNav={vi.fn()} onAsk={vi.fn()} />);
    await screen.findByTestId('pj-workstreams');
    expect(rowOf('Authoring').querySelector('summary')?.textContent).toMatch(/No dateNot scheduled$/);
    expect(screen.queryByTestId('pj-schedule-line')).toBeNull();
  });

  it("opens a workstream to its own tasks only", async () => {
    serveRead({});
    render(<ProjectProgramPlan programId={PROGRAM} onNav={vi.fn()} onAsk={vi.fn()} />);
    await screen.findByTestId('pj-workstreams');
    const row = rowOf('Strategy');
    (row as HTMLElement & { open: boolean }).open = true;
    fireEvent(row, new Event('toggle'));
    expect(within(row).getByText('Task t1')).toBeTruthy();
    expect(within(row).queryByText('Task t2')).toBeNull();
  });

  it("says, under a device plan, that its own workstreams are not counted here", async () => {
    serveRead({});
    render(<ProjectProgramPlan programId={PROGRAM} workstreamNote="The device workstreams above are tracked by their own items." onNav={vi.fn()} onAsk={vi.fn()} />);
    expect((await screen.findByTestId('pj-workstreams-note')).textContent).toBe('The device workstreams above are tracked by their own items.');
  });

  it('draws the schedule: phase completions as dots, the submission, the review clock and today, the critical path darker', async () => {
    serveRead({});
    render(<ProjectProgramPlan programId={PROGRAM} onNav={vi.fn()} onAsk={vi.fn()} />);
    const line = await screen.findByTestId('pj-schedule-line');
    const dots = Array.from(line.querySelectorAll<HTMLElement>('.py-line-dot')).map((d) => `${d.dataset.kind}:${d.title}`);
    expect(dots).toEqual([
      'milestone:Strategy complete · Oct 30, 2026',
      'submission:Submission (target date) · Jun 4, 2027',
      'decision:Study may proceed (day 30) · Jul 4, 2027',
    ]);
    expect(line.querySelectorAll('.py-line-crit')).toHaveLength(2);
    // Keyboard and screen reader: the track is a named group; each dot is reachable and names itself with its date.
    expect(line.querySelector('.py-line-track')?.getAttribute('role')).toBe('group');
    const dot = line.querySelector<HTMLElement>('.py-line-dot')!;
    expect([dot.getAttribute('role'), dot.tabIndex, dot.getAttribute('aria-label')]).toEqual(['img', 0, 'Strategy complete, Oct 30, 2026']);
    expect(line.querySelector<HTMLElement>('.py-line-today')?.style.left).toMatch(/%$/);
    expect(line.querySelector('figcaption')?.textContent).toMatch(/^Starts Oct 1, 2026 · submission Jun 4, 2027 · Study may proceed by Jul 4, 2027 \(FDA, 21 CFR 312\.40\)\./);
  });

  it('says when no agency review clock is on record for the filing', async () => {
    serveRead({ reviewClock: null });
    render(<ProjectProgramPlan programId={PROGRAM} onNav={vi.fn()} onAsk={vi.fn()} />);
    expect((await screen.findByTestId('pj-schedule-line')).querySelector('figcaption')?.textContent).toMatch(/No agency review clock is on record for this filing type\./);
  });
});

// The client's rule is the engine's: pyStanding and pyWorkStatus against taskStanding and scheduleSummary.
describe("the client's schedule rule matches the engine's", () => {
  it('pyStanding equals taskStanding on every combination', async () => {
    const { taskStanding } = await import('../../../../../services/regulatory/SubmissionPyramidEngine');
    const { pyStanding } = await import('../fixtures/pyramid-data');
    const slot = { start: '2026-11-02', due: '2026-11-10', workingDays: 7, basis: 'estimated-hours' as const };
    for (const status of ['todo', 'in-progress', 'review', 'done', 'blocked'])
      for (const asOf of ['2026-11-01', '2026-11-02', '2026-11-05', '2026-11-10', '2026-11-11'])
        for (const s of [slot, undefined]) expect(pyStanding(status, s, asOf), `${status} ${asOf} ${!!s}`).toBe(taskStanding(status, s, asOf));
  });

  it("pyWorkStatus gives the engine's summary status for a whole pyramid", async () => {
    const engine = await import('../../../../../services/regulatory/SubmissionPyramidEngine');
    const { pyWorkStatus } = await import('../fixtures/pyramid-data');
    const ind = engine.getPyramidForProject('IND');
    const s = engine.backSchedule(ind, '2027-06-04');
    const cases: Record<string, string>[] = [{}, { [ind.tasks[0].id]: 'blocked' }, Object.fromEntries(ind.tasks.map((t) => [t.id, 'done']))];
    for (const statuses of cases) for (const asOf of [s.start, '2027-03-01']) for (const sched of [s, null]) {
      const tasks = ind.tasks.map((t) => ({ id: t.id, phase: t.phaseId, name: t.name, role: '', hours: 0, deps: [], ctd: [], status: statuses[t.id] ?? 'todo' }));
      expect(pyWorkStatus(tasks, sched ? sched.tasks : null, asOf)).toBe(engine.scheduleSummary(ind, sched, statuses, asOf).status);
    }
  });
});

// GA: a person who may not change the project (a viewer, an archived project) is shown each status, not offered it.
describe('the program plan for a person who may not change the project', () => {
  it('shows each task status without offering to change it, in the rows and in the sheet', async () => {
    render(<ProjectProgramPlan programId={PROGRAM} canEdit={false} onNav={vi.fn()} onAsk={vi.fn()} />);
    await openWorkstreams();
    const select = screen.getByLabelText('Status of Task t2') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    fireEvent.click(screen.getByText('Task t2'));
    const sheet = await screen.findByRole('dialog', { name: 'Task t2' });
    expect((within(sheet).getByLabelText('Status of Task t2') as HTMLSelectElement).disabled).toBe(true);
    expect(apiRequest.mock.calls.some(([m]) => m === 'PATCH')).toBe(false);
  });

  it('offers the status to a person who may change it', async () => {
    render(<ProjectProgramPlan programId={PROGRAM} onNav={vi.fn()} onAsk={vi.fn()} />);
    await openWorkstreams();
    expect((screen.getByLabelText('Status of Task t2') as HTMLSelectElement).disabled).toBe(false);
  });
});

// GA: hours laid end to end are never shown as a forecast.
describe('a plan whose dates rest on working hours alone', () => {
  const SCHEDULE = { target: '2027-06-04', anchorTaskId: 't3', start: '2027-05-20', tasks: {
    t1: { start: '2027-05-20', due: '2027-05-21', workingDays: 2, basis: 'estimated-hours' },
    t2: { start: '2027-05-24', due: '2027-05-25', workingDays: 2, basis: 'estimated-hours' },
    t3: { start: '2027-05-26', due: '2027-06-04', workingDays: 8, basis: 'estimated-hours' } } };
  const serve = (durations: string) => {
    reads = { success: true, data: { programId: PROGRAM, type: '510K', label: '510(k)', filing: '510k', pyramid: PYRAMID, statuses: {},
      target: '2027-06-04', asOf: '2026-11-05', schedule: { ...SCHEDULE, durations }, reviewClock: null } };
  };
  it('says the dates are the earliest possible, not a forecast', async () => {
    serve('hours-only');
    render(<ProjectProgramPlan programId={PROGRAM} onNav={vi.fn()} onAsk={vi.fn()} />);
    expect((await screen.findByTestId('pj-program-minimum')).textContent).toMatch(/^These are the earliest possible dates, not a forecast\./);
  });
  it('says nothing of the kind where typical durations are on record', async () => {
    serve('mixed');
    render(<ProjectProgramPlan programId={PROGRAM} onNav={vi.fn()} onAsk={vi.fn()} />);
    await screen.findByTestId('pj-program-schedule');
    expect(screen.queryByTestId('pj-program-minimum')).toBeNull();
  });
});
