// @vitest-environment jsdom
/** The real board and surface-action bus must distinguish unread work from
 * missing work, and refuse a combined filter without partially applying it. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const apiRequest = vi.hoisted(() => vi.fn());
const user = vi.hoisted(() => ({ id: '7', organizationId: 7, permissions: ['governed:write'] }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user }) }));

import { TaskBoard } from '../surfaces/TaskBoard';
import { __resetSurfaceActionBus, applySurfaceAction, registeredSurfaceId } from '../surfaceActions';
import { clearNavParams } from '../navParams';
import { useActiveSurfaceContext } from '../surfaceContext';

const TASKS = [
  {
    taskId: 'TASK-31', title: 'Draft stability summary', project: '31', moduleType: 'cmc', taskType: 'document',
    status: 'pending', priority: 'high', assignee: '7', assignedBy: '7', progress: 0, impactScore: null,
    criticalPath: false, regulatoryImpact: false, approvalRequired: false, approvalStatus: 'not_started',
    approvalHistory: [], dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'unified',
    due: '', dueDateIso: null, phase: null, blocked: false,
  },
  {
    taskId: 'TASK-32', title: 'Review predicate table', project: '32', moduleType: 'mdx', taskType: 'document',
    status: 'pending', priority: 'high', assignee: '9', assignedBy: '7', progress: 0, impactScore: null,
    criticalPath: false, regulatoryImpact: false, approvalRequired: false, approvalStatus: 'not_started',
    approvalHistory: [], dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'unified',
    due: '', dueDateIso: null, phase: null, blocked: false,
  },
];
const PROJECTS = [{ id: 31, name: 'BX-204 Oncology IND' }, { id: 32, name: 'MD-11 510(k)' }];
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
let boardRows: typeof TASKS;
let meta: Record<string, unknown>;
let readBoard: () => Promise<Response>;
let readProjects: () => Promise<Response>;

beforeEach(() => {
  setAuthToken(`fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 7 }))}.fixture`);
  clearNavParams();
  window.history.replaceState(null, '', '/concept2cure/tasks');
  boardRows = TASKS;
  meta = { partial: false, unreadSources: [] };
  readBoard = async () => ok({ data: boardRows, meta });
  readProjects = async () => ok({ data: PROJECTS });
  apiRequest.mockReset().mockImplementation(async (_method: string, path: string) => {
    if (path === '/api/task-management/board') return readBoard();
    if (path === '/api/projects') return readProjects();
    return ok({ data: [] });
  });
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  clearAuthToken();
  clearNavParams();
  Reflect.deleteProperty(window, 'C2C_TASK_FILTER');
  window.history.replaceState(null, '', '/');
});

function ContextProbe() {
  const context = useActiveSurfaceContext('tasks');
  return <output data-testid="task-read-context">{context?.summary}</output>;
}
class BoardBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div role="alert">Task board render failed</div> : this.props.children; }
}
async function mount() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BoardBoundary><TaskBoard {...({ onAsk: vi.fn(), onNav: vi.fn() } as unknown as React.ComponentProps<typeof TaskBoard>)} /></BoardBoundary>
      <ContextProbe />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(registeredSurfaceId()).toBe('tasks'));
}
function apply(action: string, params: Record<string, string>) {
  const resolved = resolveSurfaceAction(action, params);
  if (!resolved.ok) throw new Error(resolved.error);
  let outcome!: ReturnType<typeof applySurfaceAction>;
  act(() => { outcome = applySurfaceAction(resolved.directive, vi.fn()); });
  return outcome;
}
function expectRefusal(outcome: ReturnType<typeof applySurfaceAction>, reason: RegExp) {
  expect(outcome.status).toBe('failed');
  if (outcome.status === 'failed') expect(outcome.reason).toMatch(reason);
}
async function expectRows() {
  await screen.findByRole('button', { name: `Open ${TASKS[0].title}` });
  await screen.findByRole('button', { name: `Open ${TASKS[1].title}` });
}
const readCount = (path: string) => apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && url === path).length;

describe('opening a task on an incomplete board', () => {
  it.each([
    { label: 'an anonymous partial read', metadata: { partial: true } },
    { label: 'named unread stores without a partial flag', metadata: { unreadSources: ['project_tasks'] } },
  ])('keeps $label unavailable in the UI and context when no cards were read', async ({ metadata }) => {
    boardRows = [];
    meta = metadata;
    await mount();
    await screen.findByText("Couldn't load the task board");
    expect(screen.queryByText('No tasks on the board yet')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('task-read-context').textContent).toMatch(/incomplete.*counts.*unknown/i));
    expectRefusal(apply('tasking.open-task', { task: 'Missing task' }), /incomplete/i);
  });

  it('warns about anonymous partial nonempty results while retaining readable cards', async () => {
    meta = { partial: true };
    await mount(); await expectRows();
    expect(screen.getByTestId('tb-partial').textContent).toMatch(/not every task store could be read/i);
  });

  it('qualifies anonymous partial counts in the published context', async () => {
    meta = { partial: true };
    await mount(); await expectRows();
    await waitFor(() => expect(screen.getByTestId('task-read-context').textContent).toMatch(/these counts are incomplete.*could not be read/i));
  });

  it('does not call an unread empty board a board with no tasks', async () => {
    boardRows = [];
    meta = { partial: true, unreadSources: ['unified_tasks'] };
    await mount();
    await screen.findByText("Couldn't load the task board");
    const outcome = apply('tasking.open-task', { task: 'Missing draft' });
    expectRefusal(outcome, /incomplete.*board's own tasks.*could not be read/i);
    if (outcome.status === 'failed') expect(outcome.reason).not.toMatch(/there are no tasks/i);
    expect(screen.queryByRole('dialog', { name: 'Task detail' })).toBeNull();
  });

  it('does not claim a named task is missing when another source is unread', async () => {
    meta = { partial: true, unreadSources: ['project_tasks'] };
    await mount(); await expectRows();
    const outcome = apply('tasking.open-task', { task: 'Missing schedule milestone' });
    expectRefusal(outcome, /incomplete.*schedule.*could not be read/i);
    if (outcome.status === 'failed') expect(outcome.reason).not.toMatch(/no task named/i);
  });

  it('names every unread store before refusing an incomplete empty read', async () => {
    boardRows = [];
    meta = { partial: true, unreadSources: ['unified_tasks', 'project_tasks'] };
    await mount();
    await screen.findByText("Couldn't load the task board");
    expectRefusal(apply('tasking.open-task', { task: 'Missing task' }), /incomplete.*board's own tasks.*schedule.*could not be read/i);
  });

  it('can open the matching readable task without pretending other stores were read', async () => {
    meta = { partial: true, unreadSources: ['project_tasks'] };
    await mount(); await expectRows();
    expect(apply('tasking.open-task', { task: TASKS[0].taskId }).status).toBe('applied');
    expect((await screen.findByRole('dialog', { name: 'Task detail' })).textContent).toContain(TASKS[0].title);
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('keeps a complete empty board distinct from an incomplete read', async () => {
    boardRows = [];
    await mount(); await screen.findByText('No tasks on the board yet');
    expectRefusal(apply('tasking.open-task', { task: 'Missing task' }), /there are no tasks on the board/i);
  });

  it('keeps a genuine complete miss distinct from an incomplete read', async () => {
    await mount(); await expectRows();
    expectRefusal(apply('tasking.open-task', { task: 'Absent task' }), /no task named "Absent task"/i);
  });

  it('preserves the detail archive reason before considering another open', async () => {
    meta = { partial: true, unreadSources: ['project_tasks'] };
    await mount(); await expectRows();
    apply('tasking.open-task', { task: TASKS[0].taskId });
    const detail = await screen.findByRole('dialog', { name: 'Task detail' });
    fireEvent.click(within(detail).getByRole('button', { name: `Archive "${TASKS[0].title}"` }));
    const reason = within(detail).getByLabelText(/Reason for archiving/);
    fireEvent.change(reason, { target: { value: 'Keep this unfinished justification' } });
    expectRefusal(apply('tasking.open-task', { task: TASKS[1].taskId }), /task detail is open/i);
    expect((reason as HTMLTextAreaElement).value).toBe('Keep this unfinished justification');
    expect(detail.textContent).toContain(TASKS[0].title);
  });
});

describe('project read failure and complete filter validation', () => {
  it.each([
    { label: 'a non-array container', data: { unexpected: 'project container' } },
    { label: 'a malformed name', data: [{ id: 31, name: null }] },
    { label: 'a nonnumeric project identity', data: [{ id: '31', name: 'BX-204 Oncology IND' }] },
    { label: 'a later null row', data: [PROJECTS[0], null] },
  ])('treats $label as an unread project list without crashing the task board', async ({ data }) => {
    readProjects = async () => ok({ data });
    await mount(); await expectRows();
    expectRefusal(apply('tasking.filter', { project: 'BX-204' }), /project.*could not be read/i);
    expect(screen.queryByText('Task board render failed')).toBeNull();
    await expectRows();
  });

  it('reports a named-project lookup failure instead of a nonexistent project', async () => {
    readProjects = async () => { throw new Error('Project service unavailable'); };
    await mount(); await expectRows();
    const outcome = apply('tasking.filter', { project: 'BX-204', module: 'cmc', mine: 'true' });
    expectRefusal(outcome, /project.*could not be read/i);
    if (outcome.status === 'failed') expect(outcome.reason).not.toMatch(/no project named/i);
    expect((screen.getByRole('combobox', { name: 'Filter by module' }) as HTMLSelectElement).value).toBe('all');
    expect(screen.getByRole('button', { name: 'My tasks' }).classList.contains('on')).toBe(false);
    await expectRows();
  });

  it('can clear to all projects after the project-options read fails', async () => {
    Object.assign(window, { C2C_TASK_FILTER: '31' });
    readProjects = async () => { throw new Error('Project service unavailable'); };
    await mount(); await screen.findByRole('button', { name: `Open ${TASKS[0].title}` });
    expect(screen.queryByRole('button', { name: `Open ${TASKS[1].title}` })).toBeNull();
    expect(apply('tasking.filter', { project: 'all' }).status).toBe('applied');
    await expectRows();
    expect((screen.getByRole('combobox', { name: 'Filter by project' }) as HTMLSelectElement).value).toBe('all');
  });

  it('can apply module and mine-only filters without reading project names', async () => {
    readProjects = async () => { throw new Error('Project service unavailable'); };
    await mount(); await expectRows();
    expect(apply('tasking.filter', { module: 'cmc', mine: 'true' }).status).toBe('applied');
    expect((screen.getByRole('combobox', { name: 'Filter by module' }) as HTMLSelectElement).value).toBe('cmc');
    expect(screen.getByRole('button', { name: 'My tasks' }).classList.contains('on')).toBe(true);
    expect(screen.queryByRole('button', { name: `Open ${TASKS[1].title}` })).toBeNull();
  });

  it('refuses an invalid combined module without applying its valid project or mine filter', async () => {
    await mount(); await expectRows();
    expectRefusal(apply('tasking.filter', { project: 'BX-204', module: 'absent-module', mine: 'true' }), /no module named/i);
    expect((screen.getByRole('combobox', { name: 'Filter by project' }) as HTMLSelectElement).value).toBe('all');
    expect((screen.getByRole('combobox', { name: 'Filter by module' }) as HTMLSelectElement).value).toBe('all');
    expect(screen.getByRole('button', { name: 'My tasks' }).classList.contains('on')).toBe(false);
    await expectRows();
  });

  it('applies a valid combined filter to the same controls together', async () => {
    await mount(); await expectRows();
    expect(apply('tasking.filter', { project: 'BX-204', module: 'cmc', mine: 'true' }).status).toBe('applied');
    expect((screen.getByRole('combobox', { name: 'Filter by project' }) as HTMLSelectElement).value).toBe('31');
    expect((screen.getByRole('combobox', { name: 'Filter by module' }) as HTMLSelectElement).value).toBe('cmc');
    expect(screen.getByRole('button', { name: 'My tasks' }).classList.contains('on')).toBe(true);
    expect(screen.queryByRole('button', { name: `Open ${TASKS[1].title}` })).toBeNull();
  });

  it('keeps a genuine missing project refusal when its read succeeded', async () => {
    await mount(); await expectRows();
    expectRefusal(apply('tasking.filter', { project: 'Absent project' }), /no project named/i);
    await expectRows();
  });

  it('holds a named-project directive until the project lookup finishes', async () => {
    let finish!: (response: Response) => void;
    readProjects = () => new Promise(resolve => { finish = resolve; });
    await mount(); await expectRows();
    expect(apply('tasking.filter', { project: 'BX-204' }).status).toBe('stashed');
    await act(async () => { finish(ok({ data: PROJECTS })); });
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Filter by project' }) as HTMLSelectElement).value).toBe('31'));
    expect(screen.queryByRole('button', { name: `Open ${TASKS[1].title}` })).toBeNull();
  });
});

describe('explicit independent read recovery', () => {
  it.each(['unavailable', 'malformed'] as const)('retries a %s project list once, keeps saved cards, and restores named filtering', async failure => {
    let finish!: (response: Response) => void;
    let attempt = 0;
    readProjects = () => {
      attempt += 1;
      if (attempt === 1) return failure === 'unavailable'
        ? Promise.reject(new Error('Project service unavailable'))
        : Promise.resolve(ok({ data: [PROJECTS[0], null] }));
      return new Promise(resolve => { finish = resolve; });
    };
    await mount(); await expectRows();
    const retry = await screen.findByRole('button', { name: 'Retry project list' });
    act(() => { fireEvent.click(retry); fireEvent.click(retry); });
    expect((await screen.findByRole('button', { name: 'Retrying…' }) as HTMLButtonElement).disabled).toBe(true);
    await expectRows();
    expect(readCount('/api/projects')).toBe(2);
    expect(readCount('/api/task-management/board')).toBe(1);
    await act(async () => { finish(ok({ data: PROJECTS })); });
    await waitFor(() => expect(screen.queryByText("Couldn't load the project list")).toBeNull());
    expect(apply('tasking.filter', { project: 'BX-204' }).status).toBe('applied');
    expect((screen.getByRole('combobox', { name: 'Filter by project' }) as HTMLSelectElement).value).toBe('31');
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('allows another explicit project retry after an identical repeated read failure', async () => {
    let attempt = 0;
    readProjects = async () => {
      if (++attempt < 3) throw new Error('Project service unavailable');
      return ok({ data: PROJECTS });
    };
    await mount(); await expectRows();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry project list' }));
    await waitFor(() => expect(readCount('/api/projects')).toBe(2));
    const retry = await screen.findByRole('button', { name: 'Retry project list' });
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByText("Couldn't load the project list")).toBeNull());
    expect(readCount('/api/projects')).toBe(3);
    expect(readCount('/api/task-management/board')).toBe(1);
    await expectRows();
  });

  it('keeps project recovery reachable when the task board is genuinely empty', async () => {
    boardRows = [];
    readProjects = async () => { throw new Error('Project service unavailable'); };
    await mount(); await screen.findByText('No tasks on the board yet');
    expect(await screen.findByRole('button', { name: 'Retry project list' })).toBeTruthy();
  });

  it('retries an incomplete nonempty board once and leaves the project read alone', async () => {
    let finish!: (response: Response) => void;
    let attempt = 0;
    readBoard = () => ++attempt === 1
      ? Promise.resolve(ok({ data: TASKS, meta: { partial: true, unreadSources: ['project_tasks'] } }))
      : new Promise(resolve => { finish = resolve; });
    await mount(); await expectRows();
    const retry = within(screen.getByTestId('tb-partial')).getByRole('button', { name: 'Retry task board' });
    act(() => { fireEvent.click(retry); fireEvent.click(retry); });
    await screen.findByText('Loading the task board…');
    expect(screen.queryByText('No tasks on the board yet')).toBeNull();
    expect(readCount('/api/task-management/board')).toBe(2);
    expect(readCount('/api/projects')).toBe(1);
    await act(async () => { finish(ok({ data: TASKS, meta: { partial: false, unreadSources: [] } })); });
    await expectRows();
    expect(screen.queryByTestId('tb-partial')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('task-read-context').textContent).not.toMatch(/incomplete/i));
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('permits another explicit board retry after an identical incomplete result', async () => {
    let attempt = 0;
    readBoard = async () => ok({ data: TASKS, meta: ++attempt < 3 ? { partial: true } : { partial: false } });
    await mount(); await expectRows();
    fireEvent.click(within(screen.getByTestId('tb-partial')).getByRole('button', { name: 'Retry task board' }));
    await waitFor(() => expect(readCount('/api/task-management/board')).toBe(2));
    const retry = await screen.findByRole('button', { name: 'Retry task board' });
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(retry);
    await expectRows();
    await waitFor(() => expect(screen.queryByTestId('tb-partial')).toBeNull());
    expect(readCount('/api/task-management/board')).toBe(3);
    expect(readCount('/api/projects')).toBe(1);
  });

  it('keeps a failed board retry unavailable and offers a further explicit retry', async () => {
    let attempt = 0;
    readBoard = async () => {
      attempt += 1;
      if (attempt === 2) throw new Error('Board service unavailable');
      return ok({ data: TASKS, meta: { partial: attempt === 1 } });
    };
    await mount(); await expectRows();
    fireEvent.click(within(screen.getByTestId('tb-partial')).getByRole('button', { name: 'Retry task board' }));
    await screen.findByText("Couldn't load the task board");
    expect(screen.queryByText('No tasks on the board yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await expectRows();
    expect(readCount('/api/task-management/board')).toBe(3);
    expect(readCount('/api/projects')).toBe(1);
  });
});
