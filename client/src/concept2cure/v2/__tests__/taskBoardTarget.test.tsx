// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { getSurface } from '@shared/constants/ui-surface-registry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { stashNavParamsForTarget, surfaceLeaveRefusal } from '../navParams';
import { ApiRequestError } from '@/lib/queryClient';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), setLocation: vi.fn(), onAsk: vi.fn(), onNav: vi.fn(), search: '', user: { id: 7, organizationId: 7, permissions: ['governed:write'] } }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('wouter', async original => ({ ...await original<typeof import('wouter')>(), useSearch: () => mocks.search, useLocation: () => ['/concept2cure/tasks', mocks.setLocation] }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: mocks.apiRequest }));
import { TaskBoard } from '../surfaces/TaskBoard';

const token = (userId = 7, organizationId = 7) => `fixture.${btoa(JSON.stringify({ userId, organizationId }))}.fixture`;
const target = (taskId = 'TASK-B', actor = 7, org = 7) => `?taskId=${encodeURIComponent(taskId)}&taskActor=${actor}&taskOrg=${org}`;
const base = {
  title: 'Review the study report', moduleType: 'clinical', taskType: 'review', status: 'pending', priority: 'high',
  assignee: '7', assignedBy: '9', progress: 0, impactScore: null, criticalPath: false, regulatoryImpact: false,
  approvalRequired: false, approvalStatus: 'not_started', approvalHistory: [], dependsOn: [], blocks: [],
  comments: 0, attachments: 0, source: 'unified', due: '', dueDateIso: null, phase: null, blocked: false, estimatedHours: null,
};
const first = { ...base, taskId: 'TASK-A', project: '12', description: 'Instructions for task A.' };
const second = { ...base, taskId: 'TASK-B', project: '13', description: 'Instructions for task B.' };
const response = (data: unknown, meta: Record<string, unknown> = {}, status = 200) => ({ ok: status < 400, status, json: async () => ({ data, meta }) }) as Response;
let board: unknown[];
let meta: Record<string, unknown>;
let readBoard: () => Promise<Response>;
let postWorkflow: () => Promise<Response>;
let patchTask: (() => Promise<Response>) | undefined;
const template = {
  templateId: 'workflow-1', name: 'Existing review workflow', description: null, category: 'clinical', isDefault: true,
  usageCount: 0, taskCount: 1, dependencyCount: 0, spanDays: 1, estimatedHours: 1, tasks: [], tasksTruncated: false,
};
const reads = () => mocks.apiRequest.mock.calls.filter(call => call[1] === '/api/task-management/board');
const props = () => ({ surface: getSurface('tasks')!, onAsk: mocks.onAsk, onNav: mocks.onNav, segment: 'biopharma' });
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const view = () => <QueryClientProvider client={client}><TaskBoard {...props()} /></QueryClientProvider>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const navigate = (mounted: ReturnType<typeof render>, search = target()) => { mocks.search = search; mounted.rerender(view()); };
const detail = () => screen.queryByRole('dialog', { name: 'Task detail' });
const closeDetail = () => fireEvent.click(within(screen.getByRole('dialog', { name: 'Task detail' })).getByRole('button', { name: 'Close' }));
const settleBoard = async () => { await screen.findAllByText(base.title); };

beforeEach(() => {
  mocks.onAsk.mockReset(); mocks.onNav.mockReset();
  mocks.setLocation.mockReset();
  mocks.setLocation.mockImplementation((location: string) => { mocks.search = location.includes('?') ? location.slice(location.indexOf('?')) : ''; });
  mocks.apiRequest.mockReset(); mocks.search = ''; mocks.user = { id: 7, organizationId: 7, permissions: ['governed:write'] };
  board = [first, second]; meta = { partial: false, unreadSources: [] }; setAuthToken(token());
  readBoard = async () => response(board, meta);
  postWorkflow = async () => response([]); patchTask = undefined;
  mocks.apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path.includes('/tasks/from-template/')) return postWorkflow();
    if (method === 'PATCH' && patchTask) return patchTask();
    if (path === '/api/task-management/templates') return response([template]);
    if (path === '/api/task-management/board') return readBoard();
    if (path === '/api/projects') return response([{ id: 12, name: 'Program A' }, { id: 13, name: 'Program B' }]);
    return response([]);
  });
});
afterEach(() => { cleanup(); clearAuthToken(); });

describe('exact retained task target', () => {
  it('opens a genuinely unscoped copied native link only after a fresh current-actor board read', async () => {
    const pending = deferred<Response>();
    let count = 0;
    readBoard = () => ++count === 1 ? Promise.resolve(response(board, meta)) : pending.promise;
    mocks.search = '?taskId=TASK-B'; render(view());
    await waitFor(() => expect(reads().length).toBeGreaterThan(1));
    expect(detail()).toBeNull();
    await act(async () => pending.resolve(response([second])));
    expect(within(await screen.findByRole('dialog', { name: 'Task detail' })).getByText('TASK-B')).toBeTruthy();
    expect(mocks.apiRequest.mock.calls.every(call => call[0] === 'GET')).toBe(true);
  });

  it('opens the requested business ID rather than another task with the same title', async () => {
    mocks.search = target(); render(view());
    const detail = await screen.findByRole('dialog', { name: 'Task detail' });
    expect(within(detail).getByText('TASK-B')).toBeTruthy();
    expect(within(detail).getByText(second.description)).toBeTruthy();
    expect(within(detail).queryByText(first.description)).toBeNull();
    expect(mocks.apiRequest.mock.calls.every(call => call[0] === 'GET')).toBe(true);
  });

  it('refreshes and focuses an exact target hidden by filters while Tasks is already mounted', async () => {
    const mounted = render(view());
    fireEvent.change(await screen.findByLabelText('Filter by project'), { target: { value: '12' } });
    const before = reads().length;
    mocks.search = target(); mounted.rerender(view());
    const detail = await screen.findByRole('dialog', { name: 'Task detail' });
    expect(within(detail).getByText('TASK-B')).toBeTruthy();
    expect(reads().length).toBeGreaterThan(before);
    expect((screen.getByLabelText('Filter by project') as HTMLSelectElement).value).toBe('all');
  });

  it('refuses another store’s ID rather than opening it through unified-task controls', async () => {
    board = [{ ...second, taskId: 'schedule:41', source: 'schedule', readOnly: true }];
    mocks.search = target('schedule:41'); render(view());
    expect((await screen.findByRole('alert')).textContent).toMatch(/unified|available|owning store/i);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});


describe('task targets require a fresh readable unified-store result', () => {
  it('retires an earlier pending target when the latest handoff supplies only partial scope', async () => {
    const mounted = render(view()); await settleBoard();
    const pending = deferred<Response>(); readBoard = () => pending.promise;
    navigate(mounted);
    await waitFor(() => expect(reads()).toHaveLength(2));
    act(() => { stashNavParamsForTarget('tasks', { taskActor: '7' }); });
    expect((await screen.findByRole('alert')).textContent).toMatch(/invalid|missing/i);
    expect(window.C2C_NAV_PARAMS).toBeUndefined();
    await act(async () => { pending.resolve(response([second])); });
    expect(detail()).toBeNull();
  });

  it('refuses a duplicate pending target requested while a native form owns the screen', async () => {
    const mounted = render(view()); await settleBoard();
    const pending = deferred<Response>(); readBoard = () => pending.promise;
    navigate(mounted);
    await waitFor(() => expect(reads()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    await screen.findByRole('dialog', { name: 'New task' });
    act(() => { stashNavParamsForTarget('tasks', { taskId: 'TASK-B', taskActor: '7', taskOrg: '7' }); });
    expect((await screen.findByRole('alert')).textContent).toMatch(/new-task form is open/i);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => { pending.resolve(response([second])); });
    expect(detail()).toBeNull();
  });

  it('keeps cached matching rows closed until the requested refresh settles', async () => {
    const mounted = render(view()); await settleBoard();
    const next = deferred<Response>(); readBoard = () => next.promise;
    const before = reads().length; navigate(mounted);
    await waitFor(() => expect(reads().length).toBeGreaterThan(before));
    expect(detail()).toBeNull();
    expect(screen.getByText(/Refreshing the current task/)).toBeTruthy();
    await act(async () => next.resolve(response([first])));
    expect((await screen.findByRole('alert')).textContent).toMatch(/no longer available/);
    expect(detail()).toBeNull();
  });

  it('discards an earlier target read when a later exact target is requested', async () => {
    const mounted = render(view()); await settleBoard();
    const a = deferred<Response>(); const b = deferred<Response>();
    readBoard = () => a.promise; navigate(mounted, target('TASK-A'));
    await waitFor(() => expect(reads()).toHaveLength(2));
    readBoard = () => b.promise; navigate(mounted);
    await waitFor(() => expect(reads()).toHaveLength(3));
    await act(async () => b.resolve(response([second])));
    expect(within(await screen.findByRole('dialog', { name: 'Task detail' })).getByText('TASK-B')).toBeTruthy();
    await act(async () => a.resolve(response([first])));
    expect(within(screen.getByRole('dialog', { name: 'Task detail' })).queryByText('TASK-A')).toBeNull();
  });

  it.each([
    { label: 'unread unified store', metadata: { partial: true, unreadSources: ['unified_tasks'] } },
    { label: 'unprovisioned store', metadata: { pendingStore: true } },
  ])('refuses a target when the $label cannot support it', async ({ metadata }) => {
    meta = metadata; mocks.search = target(); render(view());
    expect((await screen.findByRole('alert')).textContent).toMatch(/store is unavailable/);
    expect(detail()).toBeNull();
  });

  it('allows a verified native task while honestly retaining an unrelated partial-store notice', async () => {
    meta = { partial: true, unreadSources: ['project_schedules'] };
    board = [{ ...second, source: 'section' }]; mocks.search = target(); render(view());
    expect(await screen.findByRole('dialog', { name: 'Task detail' })).toBeTruthy();
    expect(screen.getByText(/Not every task store could be read/)).toBeTruthy();
  });

  it.each([
    { label: 'forbidden', read: async () => response([], {}, 403), text: /could not be read/ },
    { label: 'missing task', read: async () => response([first]), text: /no longer available/ },
    { label: 'archived task', read: async () => response([{ ...second, status: 'cancelled' }]), text: /archived/ },
    { label: 'duplicate exact ID', read: async () => response([second, { ...second, status: 'in_progress' }]), text: /no longer available/ },
  ])('refuses a $label without falling back to a title match', async ({ read, text }) => {
    readBoard = read; mocks.search = target(); render(view());
    expect(await screen.findByText(text)).toBeTruthy();
    expect(detail()).toBeNull();
  });
});

describe('target scope and retained ownership', () => {
  it.each([
    target('TASK-B', 8, 7), target('TASK-B', 7, 8),
    `${target()}&taskId=TASK-A`, '?taskId=TASK-B&taskActor=7', '?taskId=TASK-B&taskOrg=7',
    '?taskId=TASK-B&taskActor=&taskOrg=',
  ])('refuses malformed or foreign target %s without opening a detail', async search => {
    mocks.search = search; render(view());
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(detail()).toBeNull();
    await settleBoard(); expect(reads()).toHaveLength(1);
  });

  it('does not bind a copied link to a bearer that replaced the rendered owner', async () => {
    setAuthToken(token(8, 7)); mocks.search = '?taskId=TASK-B'; render(view());
    expect((await screen.findByRole('alert')).textContent).toMatch(/account or organization changed/);
    expect(detail()).toBeNull();
    await settleBoard(); expect(reads()).toHaveLength(1);
  });

  it('refuses an identity token swap before React has published the new actor', async () => {
    const mounted = render(view()); await settleBoard();
    setAuthToken(token(8, 7)); navigate(mounted);
    expect((await screen.findByRole('alert')).textContent).toMatch(/account or organization changed/);
    expect(reads()).toHaveLength(1); expect(detail()).toBeNull();
  });

  it('refuses a token swap while the fresh target read is pending', async () => {
    const mounted = render(view()); await settleBoard();
    const next = deferred<Response>(); readBoard = () => next.promise; navigate(mounted);
    await waitFor(() => expect(reads()).toHaveLength(2));
    setAuthToken(token(8, 7)); await act(async () => next.resolve(response([second])));
    expect((await screen.findByRole('alert')).textContent).toMatch(/account or organization changed/);
    expect(detail()).toBeNull();
  });

  it('permits a refreshed bearer for the same actor and organization', async () => {
    const mounted = render(view()); await settleBoard();
    const next = deferred<Response>(); readBoard = () => next.promise; navigate(mounted);
    await waitFor(() => expect(reads()).toHaveLength(2));
    setAuthToken(`fresh.${btoa(JSON.stringify({ userId: 7, organizationId: 7, jti: 'renewed' }))}.fixture`);
    await act(async () => next.resolve(response([second])));
    expect(await screen.findByRole('dialog', { name: 'Task detail' })).toBeTruthy();
  });

  it('retires old-owner reads and forms immediately on an actor or organization replacement', async () => {
    const mounted = render(view()); await settleBoard();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Old account draft' } });
    mocks.user = { id: 8, organizationId: 8, permissions: ['governed:write'] }; setAuthToken(token(8, 8));
    board = []; mounted.rerender(view());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByDisplayValue('Old account draft')).toBeNull();
    await screen.findByText('No tasks on the board yet');
    expect(screen.queryByText(base.title)).toBeNull(); expect(surfaceLeaveRefusal()).toBeNull();
  });

  it('does not publish a late old-owner response under a replacement account', async () => {
    const mounted = render(view()); await settleBoard();
    const next = deferred<Response>(); readBoard = () => next.promise; navigate(mounted);
    await waitFor(() => expect(reads()).toHaveLength(2));
    mocks.user = { id: 8, organizationId: 8, permissions: ['governed:write'] }; setAuthToken(token(8, 8));
    mocks.search = ''; readBoard = async () => response([]); mounted.rerender(view());
    await screen.findByText('No tasks on the board yet');
    await act(async () => next.resolve(response([second])));
    expect(detail()).toBeNull(); expect(screen.queryByText(base.title)).toBeNull();
  });
});

describe('native work owns its task screen', () => {
  it('preserves an open task and its archive reason without deferred replacement', async () => {
    const mounted = render(view()); await settleBoard();
    fireEvent.click(screen.getAllByText(base.title)[0]);
    const original = screen.getByRole('dialog', { name: 'Task detail' });
    fireEvent.click(within(original).getByRole('button', { name: /^Archive / }));
    fireEvent.change(within(original).getByLabelText(/Reason for archiving/), { target: { value: 'Keep this unfinished justification.' } });
    expect(surfaceLeaveRefusal()).toMatch(/task detail is open/);
    navigate(mounted);
    expect((await screen.findByRole('alert')).textContent).toMatch(/task detail is open/);
    expect(within(original).getByDisplayValue('Keep this unfinished justification.')).toBeTruthy();
    expect(within(original).getByText('TASK-A')).toBeTruthy(); expect(reads()).toHaveLength(1);
    closeDetail(); expect(detail()).toBeNull(); expect(surfaceLeaveRefusal()).toBeNull();
    await act(async () => {}); expect(detail()).toBeNull();
  });

  it('preserves an unfinished create form and refuses its target without a delayed opening', async () => {
    const mounted = render(view()); await settleBoard();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Keep my task draft' } });
    expect(surfaceLeaveRefusal()).toMatch(/new-task form/); navigate(mounted);
    expect((await screen.findByRole('alert')).textContent).toMatch(/new-task form/);
    expect(screen.getByDisplayValue('Keep my task draft')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await act(async () => {}); expect(detail()).toBeNull(); expect(surfaceLeaveRefusal()).toBeNull();
  });

  it('preserves the native workflow picker', async () => {
    const mounted = render(view()); await settleBoard();
    fireEvent.click(screen.getByRole('button', { name: /Start workflow/ }));
    const picker = screen.getByRole('dialog', { name: 'Start workflow from template' });
    expect(surfaceLeaveRefusal()).toMatch(/workflow picker/); navigate(mounted);
    expect((await screen.findByRole('alert')).textContent).toMatch(/workflow picker/);
    expect(screen.getByRole('dialog')).toBe(picker); expect(reads()).toHaveLength(1);
  });

  it('rechecks native ownership if a form opens during the fresh read', async () => {
    const mounted = render(view()); await settleBoard();
    const next = deferred<Response>(); readBoard = () => next.promise; navigate(mounted);
    await waitFor(() => expect(reads()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Started during read' } });
    await act(async () => next.resolve(response([second])));
    expect((await screen.findByRole('alert')).textContent).toMatch(/new-task form/);
    expect(screen.getByDisplayValue('Started during read')).toBeTruthy(); expect(detail()).toBeNull();
  });

  it('consumes only the task target and can reopen the same exact task after closing', async () => {
    mocks.search = `${target()}&view=table`; const mounted = render(view());
    await screen.findByRole('dialog', { name: 'Task detail' });
    expect(mocks.setLocation).toHaveBeenCalledWith('/concept2cure/tasks?view=table', { replace: true });
    expect(screen.getAllByRole('dialog')).toHaveLength(1); closeDetail();
    expect(detail()).toBeNull(); const before = reads().length;
    navigate(mounted, `${target()}&view=table`);
    expect(await screen.findByRole('dialog', { name: 'Task detail' })).toBeTruthy();
    expect(reads().length).toBeGreaterThan(before); expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});


async function workflowReady(autoAssign = false) {
  fireEvent.click(screen.getByRole('button', { name: /Start workflow/ }));
  const picker = screen.getByRole('dialog', { name: 'Start workflow from template' });
  const project = await within(picker).findByLabelText('Project');
  fireEvent.change(project, { target: { value: '12' } });
  if (!autoAssign) fireEvent.click(within(picker).getByRole('button', { name: /Workload-balanced auto-assign/ }));
  await waitFor(() => expect((within(picker).getByRole('button', { name: 'Create 1 tasks' }) as HTMLButtonElement).disabled).toBe(false));
  return within(picker).getByRole('button', { name: 'Create 1 tasks' });
}
async function startWorkflow(autoAssign = false) {
  fireEvent.click(await workflowReady(autoAssign));
  await waitFor(() => expect(mocks.apiRequest.mock.calls.some(call => call[0] === 'POST')).toBe(true));
}
const workflowCreated = () => ({ ok: true, status: 200, json: async () => ({ success: true, data: [{ taskId: 'NEW-1' }] }) }) as Response;

describe('native callbacks cannot outlive their actor session', () => {
  it('does not call AnA after the bearer changes before React rerenders', async () => {
    const pending = deferred<Response>(); postWorkflow = () => pending.promise;
    render(view()); await settleBoard(); await startWorkflow();
    setAuthToken(token(8, 7)); await act(async () => pending.resolve(workflowCreated()));
    expect(mocks.onAsk).not.toHaveBeenCalled(); expect(mocks.onNav).not.toHaveBeenCalled();
  });

  it('does not resurrect an original actor callback after A→B→A replacement', async () => {
    const pending = deferred<Response>(); postWorkflow = () => pending.promise;
    const mounted = render(view()); await settleBoard(); await startWorkflow();
    mocks.user = { id: 8, organizationId: 8, permissions: ['governed:write'] }; setAuthToken(token(8, 8));
    mounted.rerender(view()); await settleBoard();
    mocks.user = { id: 7, organizationId: 7, permissions: ['governed:write'] }; setAuthToken(token());
    mounted.rerender(view()); await settleBoard();
    await act(async () => pending.resolve(workflowCreated()));
    expect(mocks.onAsk).not.toHaveBeenCalled(); expect(mocks.onNav).not.toHaveBeenCalled();
  });

  it('does not call the shell after its board has unmounted', async () => {
    const pending = deferred<Response>(); postWorkflow = () => pending.promise;
    const mounted = render(view()); await settleBoard(); await startWorkflow(); mounted.unmount();
    await act(async () => pending.resolve(workflowCreated()));
    expect(mocks.onAsk).not.toHaveBeenCalled(); expect(surfaceLeaveRefusal()).toBeNull();
  });

  it('preserves an in-progress native signature when another task is requested', async () => {
    board = [{ ...first, status: 'review', progress: 90, approvalRequired: true }];
    patchTask = async () => { throw new ApiRequestError('A signature is required.', 428, { code: 'ESIGN_REQUIRED' }, 'ESIGN_REQUIRED'); };
    const mounted = render(view()); await settleBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Advance' }));
    const signer = await screen.findByRole('dialog');
    const reason = within(signer).getByLabelText(/Reason for this action/);
    fireEvent.change(reason, { target: { value: 'Keep my signing justification.' } });
    expect(surfaceLeaveRefusal()).toMatch(/signature is in progress/); navigate(mounted);
    expect((await screen.findByRole('alert')).textContent).toMatch(/signature is in progress/);
    expect(screen.getByRole('dialog')).toBe(signer);
    expect(within(signer).getByDisplayValue('Keep my signing justification.')).toBeTruthy();
    expect(reads()).toHaveLength(1);
  });
});


describe('workflow follow-up writes stay with their captured actor', () => {
  const assignments = () => mocks.apiRequest.mock.calls.filter(call => call[1] === '/api/tasks/tasks/auto-assign');

  it('refuses the initial workflow write after a same-tick token replacement', async () => {
    render(view()); await settleBoard(); const button = await workflowReady(true);
    setAuthToken(token(8, 7)); fireEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toMatch(/account or organization changed/);
    expect(mocks.apiRequest.mock.calls.filter(call => call[0] === 'POST')).toHaveLength(0);
  });

  it('does not auto-assign original tasks under an account that replaced the actor during creation', async () => {
    const pending = deferred<Response>(); postWorkflow = () => pending.promise;
    render(view()); await settleBoard(); await startWorkflow(true);
    setAuthToken(token(8, 7)); await act(async () => pending.resolve(workflowCreated()));
    expect(assignments()).toHaveLength(0);
    expect((await screen.findByRole('alert')).textContent).toMatch(/tasks were created.*assignment was not attempted/i);
    expect(mocks.onAsk).not.toHaveBeenCalled();
  });

  it('does not resurrect auto-assignment after the original actor returns', async () => {
    const pending = deferred<Response>(); postWorkflow = () => pending.promise;
    const mounted = render(view()); await settleBoard(); await startWorkflow(true);
    mocks.user = { id: 8, organizationId: 8, permissions: ['governed:write'] }; setAuthToken(token(8, 8));
    mounted.rerender(view()); await settleBoard();
    mocks.user = { id: 7, organizationId: 7, permissions: ['governed:write'] }; setAuthToken(token());
    mounted.rerender(view()); await settleBoard();
    await act(async () => pending.resolve(workflowCreated()));
    expect(assignments()).toHaveLength(0); expect(mocks.onAsk).not.toHaveBeenCalled();
  });

  it('rechecks the actor after awaiting the creation response body', async () => {
    const body = deferred<unknown>();
    postWorkflow = async () => ({ ok: true, status: 200, json: () => body.promise }) as Response;
    render(view()); await settleBoard(); await startWorkflow(true);
    setAuthToken(token(8, 7));
    await act(async () => body.resolve({ success: true, data: [{ taskId: 'NEW-1' }] }));
    expect(assignments()).toHaveLength(0);
    expect((await screen.findByRole('alert')).textContent).toMatch(/tasks were created.*assignment was not attempted/i);
  });

  it('allows same-actor refresh and pins the matched bearer for each workflow write', async () => {
    const pending = deferred<Response>(); postWorkflow = () => pending.promise;
    render(view()); await settleBoard(); await startWorkflow(true);
    const initial = mocks.apiRequest.mock.calls.find(call => call[1].includes('/tasks/from-template/'))!;
    expect(initial[3]).toEqual({ Authorization: `Bearer ${token()}`, 'x-organization-id': '7' });
    const refreshed = `refresh.${btoa(JSON.stringify({ userId: 7, organizationId: 7 }))}.fixture`;
    setAuthToken(refreshed); await act(async () => pending.resolve(workflowCreated()));
    expect(assignments()).toHaveLength(1);
    expect(assignments()[0][3]).toEqual({ Authorization: `Bearer ${refreshed}`, 'x-organization-id': '7' });
  });
});
