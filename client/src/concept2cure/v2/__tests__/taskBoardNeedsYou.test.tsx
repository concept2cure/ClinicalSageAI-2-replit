// @vitest-environment jsdom
/**
 * Tasks opens on what is needed of the person, in the order of need, with AnA's
 * greeting and one sentence (P-131; D6.md §A.4 steps 1-6 and 9 as amended by §A.7).
 *
 *   - The List is the first view: Overdue, Due within 7 days, Later, No due date,
 *     each in the order of need (taskOrderOfNeed.ts). Board, Critical path and
 *     Analytics are one click away; the view id `table` is kept.
 *   - The header is the page's own: no "Project — collaboration" eyebrow, no
 *     critical-path answer lead. Its line is computed by code from the reads the
 *     page makes, and it is said only when they succeeded.
 *   - Mine lists everything needed: the assigned tasks as the grouped list, then
 *     the approvals and reviews from the one component the tray and Home use.
 *   - "Needs an owner" is a value of the existing tasking.filter action.
 *   - AnA is told the person's items, the work with no owner, one overdue rule and
 *     only the filters the page has.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const apiRequest = vi.hoisted(() => vi.fn());
const onAsk = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', organizationId: 7, firstName: 'Rae', permissions: ['governed:write'] } }),
}));

import { TaskBoard } from '../surfaces/TaskBoard';
import { TRIAGE_ASK } from '../TaskTray';
import { __resetSurfaceActionBus, applySurfaceAction, registeredSurfaceId } from '../surfaceActions';
import { clearNavParams } from '../navParams';
import { clearShellProject } from '../shellProject';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const base = {
  project: '31', moduleType: 'cmc', taskType: 'review', status: 'pending', priority: 'medium', assignee: '7', assignedBy: '7',
  progress: 0, impactScore: null, criticalPath: false, regulatoryImpact: false, approvalRequired: false,
  approvalStatus: 'not_started', approvalHistory: [], dependsOn: [], blocks: [], comments: 0, attachments: 0,
  source: 'unified', due: '', dueDateIso: null as string | null, phase: null, blocked: false,
};
const LOW_2D = { ...base, taskId: 'T-LOW', title: 'Low task due in two days', priority: 'low', dueDateIso: at(2), due: 'in 2 days' };
const CRIT_6D = { ...base, taskId: 'T-CRIT', title: 'Critical task due in six days', priority: 'critical', dueDateIso: at(6), due: 'in 6 days' };
const LATE = { ...base, taskId: 'T-LATE', title: 'Overdue low task', priority: 'low', dueDateIso: at(-3.2), due: 'overdue 3 days' };
const LATER = { ...base, taskId: 'T-LATER', title: 'Task due next month', priority: 'high', dueDateIso: at(30), due: 'in 30 days' };
const UNDATED = { ...base, taskId: 'T-NONE', title: 'Task with no date', priority: 'high' };
const DONE = { ...base, taskId: 'T-DONE', title: 'Finished task', status: 'completed', dueDateIso: at(-1) };
const OTHERS = { ...base, taskId: 'T-OTHER', title: 'Someone else’s task', assignee: '9', dueDateIso: at(1) };
const NO_OWNER = { ...base, taskId: 'T-NOOWNER', title: 'Task nobody owns', assignee: '', dueDateIso: at(4) };
const NO_OWNER_DONE = { ...base, taskId: 'T-NOOWNER-DONE', title: 'Finished task nobody owns', assignee: '', status: 'completed' };
const SCHEDULE = { ...base, taskId: 'pt-1', title: 'Schedule milestone', assignee: '', assignedBy: null, readOnly: true, source: 'schedule' };
const DUE_EARLIER_TODAY = { ...base, taskId: 'T-TODAY', title: 'Due earlier today', assignee: '9', dueDateIso: new Date(Date.now() - 60_000).toISOString(), due: 'today' };
const BOARD = [LOW_2D, CRIT_6D, LATE, LATER, UNDATED, DONE, OTHERS, NO_OWNER, NO_OWNER_DONE, SCHEDULE];

const mine = (t: typeof base & { taskId: string; title: string }) => ({
  taskId: t.taskId, title: t.title, projectId: 31, projectName: 'BX-204 Oncology IND', moduleType: t.moduleType,
  status: t.status, priority: t.priority, dueDate: t.dueDateIso,
  overdue: !!t.dueDateIso && Date.parse(t.dueDateIso) < Date.now(),
  dueSoon: false, blocked: false, approvalRequired: false, approvalStatus: 'not_started', criticalPath: false,
});
const MY_ITEMS = [LOW_2D, CRIT_6D, LATE, LATER, UNDATED].map(mine);
const APPROVAL = { id: 'r-1', doc: 'Clinical protocol v2', prog: 'BX-204', role: 'Medical monitor', atMySignOff: true };

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = () => ({ ok: false, status: 503, json: async () => ({}) }) as Response;
let board: unknown[];
let myWork: () => Response;

beforeEach(() => {
  setAuthToken(`fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 7 }))}.fixture`);
  clearNavParams();
  onAsk.mockReset();
  board = BOARD;
  myWork = () => ok({ success: true, data: { items: MY_ITEMS, total: MY_ITEMS.length, overdue: 1, dueSoon: 0, blocked: 0, approvalsPending: 0 } });
  apiRequest.mockReset().mockImplementation(async (_m: string, path: string) => {
    if (path === '/api/task-management/board') return ok({ data: board, meta: { partial: false, unreadSources: [] } });
    if (path === '/api/projects') return ok([{ id: 31, name: 'BX-204 Oncology IND' }]);
    if (path === '/api/task-management/assignees') return ok({ data: [{ id: 7, name: 'Rae Okafor' }, { id: 9, name: 'Sam Lee' }] });
    if (path === '/api/task-management/my-work') return myWork();
    if (path.startsWith('/api/review/board')) return ok({ success: true, data: { queue: [APPROVAL] } });
    if (path === '/api/concept2cure/reviews/my-queue') {
      return ok({ success: true, data: { threads: [], tasks: [], totalThreads: 0, totalTasks: 0, unreadNotifications: 0, overdueTasks: 0 } });
    }
    return ok({ data: [] });
  });
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  clearAuthToken();
  clearNavParams();
  clearShellProject();
});

let published: SurfaceContext | null = null;
function ContextProbe() {
  published = useActiveSurfaceContext('tasks');
  return null;
}
async function mount() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TaskBoard {...({ onAsk, onNav: vi.fn() } as unknown as React.ComponentProps<typeof TaskBoard>)} />
      <ContextProbe />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(registeredSurfaceId()).toBe('tasks'));
  await screen.findByRole('button', { name: `Open ${CRIT_6D.title}` });
}
function apply(params: Record<string, string>) {
  const resolved = resolveSurfaceAction('tasking.filter', params);
  if (!resolved.ok) throw new Error(resolved.error);
  let outcome!: ReturnType<typeof applySurfaceAction>;
  act(() => { outcome = applySurfaceAction(resolved.directive, vi.fn()); });
  return outcome;
}
const rowNames = () => screen.getAllByRole('button', { name: /^Open / }).map((b) => b.getAttribute('aria-label'));
const say = () => screen.getByTestId('tb-say').textContent ?? '';
const group = (name: string) => screen.getByRole('region', { name });

describe('Tasks opens on the List, in the order of need', () => {
  it('groups the open tasks by when, and orders each group by priority then date (acceptance 1, 9)', async () => {
    await mount();
    expect(screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true');
    for (const name of ['Overdue', 'Due within 7 days', 'Later', 'No due date']) expect(group(name)).toBeTruthy();
    const week = within(group('Due within 7 days')).getAllByRole('button', { name: /^Open / }).map((b) => b.getAttribute('aria-label'));
    expect(week.indexOf(`Open ${CRIT_6D.title}`)).toBeLessThan(week.indexOf(`Open ${LOW_2D.title}`));
    const all = rowNames();
    expect(all.indexOf(`Open ${LATE.title}`)).toBeLessThan(all.indexOf(`Open ${CRIT_6D.title}`));
    expect(within(group('Later')).getByRole('button', { name: `Open ${LATER.title}` })).toBeTruthy();
    expect(within(group('No due date')).getByRole('button', { name: `Open ${UNDATED.title}` })).toBeTruthy();
  });

  it('keeps finished work in a closed Done disclosure, and the board one click away', async () => {
    await mount();
    const done = screen.getByText(/^Done \(\d+\)$/).closest('details') as (HTMLElement & { open: boolean });
    expect(done.open).toBe(false);
    expect(within(done).getByRole('button', { name: `Open ${DONE.title}` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(document.querySelector('.tb-kanban')).toBeTruthy();
  });

  it('orders a board column by need as well', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    const todo = document.querySelector('.tb-col') as HTMLElement;
    const names = within(todo).getAllByRole('button', { name: /^Open / }).map((b) => b.getAttribute('aria-label'));
    expect(names.slice(0, 3)).toEqual([`Open ${LATE.title}`, `Open ${CRIT_6D.title}`, `Open ${OTHERS.title}`]);
    expect(names.indexOf(`Open ${CRIT_6D.title}`)).toBeLessThan(names.indexOf(`Open ${LOW_2D.title}`));
  });
});

describe('the header is the page’s own', () => {
  it('drops the project eyebrow and the critical-path lead, and asks AnA what needs me first', async () => {
    await mount();
    expect(screen.queryByText('Project — collaboration')).toBeNull();
    expect(document.querySelector('.al-lead')).toBeNull();
    expect(screen.queryByText(/marked critical-path, so there is no path/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'What needs me first?' }));
    expect(onAsk).toHaveBeenCalledWith(TRIAGE_ASK);
  });

  it('greets the person by Home’s rule', async () => {
    await mount();
    expect(screen.getByText(/^Good (morning|afternoon|evening), Rae$/)).toBeTruthy();
  });

  it('says, in Everyone, what is open, due and overdue', async () => {
    await mount();
    expect(say()).toMatch(/^8 open · 4 due within 7 days · 1 overdue\.$/);
  });
});

describe('Mine: everything needed of the person', () => {
  it('names what to start with, and it is the first row under the first group that has one (acceptance 8)', async () => {
    await mount();
    expect(apply({ mine: 'true' }).status).toBe('applied');
    expect(screen.getByRole('button', { name: 'Mine' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(say()).toMatch(/^5 tasks need you: 1 overdue, 2 due within 7 days\. Start with “Overdue low task”: it is 3 days overdue\./));
    expect(say()).toMatch(/1 document waits on your sign-off\./);
    expect(say()).toMatch(/1 needs an owner\./);
    const first = within(group('Overdue')).getAllByRole('button', { name: /^Open / })[0];
    expect(first.getAttribute('aria-label')).toBe(`Open ${LATE.title}`);
    expect(within(group('Due within 7 days')).queryByRole('button', { name: `Open ${OTHERS.title}` })).toBeNull();
  });

  it('opens the named item from the sentence', async () => {
    await mount();
    apply({ mine: 'true' });
    fireEvent.click(await screen.findByRole('button', { name: `Overdue low task` }));
    const drawer = await screen.findByRole('dialog', { name: 'Task detail' });
    expect(drawer.textContent).toContain(LATE.title);
  });

  it('lists the approvals at their sign-off from the component the tray and Home use', async () => {
    await mount();
    apply({ mine: 'true' });
    expect(await screen.findByText('Approvals — you sign')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Clinical protocol v2/ })).toBeTruthy();
    // The assigned tasks are the grouped list; they are not listed a second time.
    expect(screen.queryByText('Assigned to you')).toBeNull();
  });

  it('does not say "Nothing is assigned to you" when the person’s work could not be read (acceptance 10)', async () => {
    myWork = fail;
    board = [OTHERS];
    await mount().catch(() => undefined);
    await screen.findByRole('button', { name: `Open ${OTHERS.title}` });
    apply({ mine: 'true' });
    await waitFor(() => expect(say()).toMatch(/could not be read/));
    expect(say()).toMatch(/the tasks assigned to you/);
    expect(say()).not.toMatch(/Nothing is assigned to you/);
  });

  it('says "Nothing is assigned to you." when the reads succeeded and there is nothing (control)', async () => {
    myWork = () => ok({ success: true, data: { items: [], total: 0, overdue: 0, dueSoon: 0, blocked: 0, approvalsPending: 0 } });
    apiRequest.mockImplementation(async (_m: string, path: string) => {
      if (path === '/api/task-management/board') return ok({ data: [OTHERS], meta: { partial: false, unreadSources: [] } });
      if (path === '/api/task-management/my-work') return myWork();
      if (path.startsWith('/api/review/board')) return ok({ success: true, data: { queue: [] } });
      if (path === '/api/concept2cure/reviews/my-queue') return ok({ success: true, data: { threads: [], tasks: [] } });
      if (path === '/api/projects') return ok([{ id: 31, name: 'BX-204 Oncology IND' }]);
      return ok({ data: [] });
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TaskBoard {...({ onAsk, onNav: vi.fn() } as unknown as React.ComponentProps<typeof TaskBoard>)} />
      </QueryClientProvider>,
    );
    await screen.findByRole('button', { name: `Open ${OTHERS.title}` });
    apply({ mine: 'true' });
    await waitFor(() => expect(say()).toBe('Nothing is assigned to you.'));
  });
});

describe('Needs an owner', () => {
  it('is a value of tasking.filter, and lists exactly the open, assignable tasks with no assignee (acceptance 11)', async () => {
    await mount();
    expect(apply({ mine: 'unassigned' }).status).toBe('applied');
    expect(screen.getByRole('button', { name: 'Needs an owner' }).getAttribute('aria-pressed')).toBe('true');
    const open = rowNames().filter((n) => !/Finished/.test(n ?? ''));
    expect(open).toEqual([`Open ${NO_OWNER.title}`]);
    expect(screen.queryByRole('button', { name: `Open ${SCHEDULE.title}` })).toBeNull();
    expect(screen.queryByRole('button', { name: `Open ${NO_OWNER_DONE.title}` })).toBeNull();
  });
});

describe('what AnA is told on this page', () => {
  it('counts overdue by the one rule, names the work with no owner and the person’s items, and claims only real filters', async () => {
    board = [...BOARD, DUE_EARLIER_TODAY];
    await mount();
    await waitFor(() => expect(published?.facts).toBeTruthy());
    const facts = published!.facts as Record<string, any>;
    expect(facts.totals.overdue).toBe(2);
    expect(facts.needsAnOwner.count).toBe(1);
    expect(facts.needsAnOwner.tasks.map((t: { title: string }) => t.title)).toEqual([NO_OWNER.title]);
    await waitFor(() => expect((published!.facts as Record<string, any>).yourOpenItems?.length).toBe(5));
    expect((published!.facts as Record<string, any>).yourOpenItems[0].title).toBe(LATE.title);
    expect(published!.availableActions!.join(' ')).not.toMatch(/priority|search text/i);
  });
});

describe('Analytics names the work with no owner', () => {
  it('shows Unassigned, and other stores’ work on its own row', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));
    const card = screen.getByText('Team productivity').closest('.tb-an-card') as HTMLElement;
    expect(within(card).getByText('Unassigned')).toBeTruthy();
    expect(within(card).getByText(/schedule, correspondence and filings/i)).toBeTruthy();
  });
});
