// @vitest-environment jsdom
/** Audit F19/F20: a saved task can be assigned again, and a notification opens
 * exactly the authorized task it names without creating or replacing one. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getSurface } from '@shared/constants/ui-surface-registry';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
const auth = vi.hoisted(() => ({ canWrite: true }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { id: '1', permissions: auth.canWrite ? ['governed:write'] : [] } }) }));
import { TaskBoard } from '../surfaces/TaskBoard';
import { stashNavParamsForTarget, clearNavParams } from '../navParams';
const TASK = {
  taskId: 'TASK-RECOVERY', title: 'Retry the saved workflow assignment', project: '12', moduleType: 'clinical', taskType: 'deliverable',
  status: 'pending', priority: 'high', assignee: '', assignedBy: null, progress: 0, impactScore: null,
  due: '', dueDateIso: null, phase: null, criticalPath: false, regulatoryImpact: false, blocked: false,
  approvalRequired: false, approvalStatus: 'not_started', approvalHistory: [], dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'template',
};
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
let board: typeof TASK[];
let assign: () => Promise<Response>;
let readFailed = false;
beforeEach(() => {
  auth.canWrite = true;
  board = [TASK];
  readFailed = false;
  clearNavParams();
  window.history.replaceState(null, '', '/concept2cure/tasks');
  assign = async () => { board = [{ ...TASK, assignee: '2' }]; return ok({ success: true, count: 1, data: [{ taskId: TASK.taskId, assigneeId: 2, assignedTo: 'Rae' }] }); };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === '/api/tasks/tasks/auto-assign') return assign();
    if (path === '/api/task-management/board') {
      if (readFailed) throw new Error('Board unavailable');
      return ok({ data: board });
    }
    if (path === '/api/projects') return ok([{ id: 12, name: 'BX-1' }]);
    if (path === '/api/task-management/assignees') return ok({ data: [{ id: 2, name: 'Rae' }] });
    return ok({ data: [] });
  });
});
afterEach(() => { cleanup(); clearNavParams(); window.history.replaceState(null, '', '/'); });
const mount = (strict = false) => {
  const props: React.ComponentProps<typeof TaskBoard> = {
    surface: getSurface('tasks')!, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma',
  };
  const content = <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TaskBoard {...props} /></QueryClientProvider>;
  return render(strict ? <React.StrictMode>{content}</React.StrictMode> : content);
};
async function open() {
  fireEvent.click(await screen.findByRole('button', { name: `Open ${TASK.title}` }));
  return screen.findByRole('dialog', { name: 'Task detail' });
}
describe('saved task assignment recovery', () => {
  it('reuses the saved task id, re-reads its assignee and creates no replacement', async () => {
    mount(); const detail = await open();
    fireEvent.click(within(detail).getByRole('button', { name: 'Auto-assign task' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/tasks/tasks/auto-assign', { taskIds: [TASK.taskId] }));
    await within(detail).findByText('Rae');
    expect(apiRequest.mock.calls.some(([method, path]) => method === 'POST' && path === '/api/tasks/tasks')).toBe(false);
  });
  it('shows a shortfall in the open detail and permits retry', async () => {
    assign = async () => ok({ success: true, count: 0, data: [] });
    mount(); const detail = await open();
    fireEvent.click(within(detail).getByRole('button', { name: 'Auto-assign task' }));
    expect((await within(detail).findByRole('alert')).textContent).toMatch(/not assigned/i);
    await waitFor(() => expect((within(detail).getByRole('button', { name: 'Auto-assign task' }) as HTMLButtonElement).disabled).toBe(false));
  });
  it('reports an expired assignment request without claiming the saved task was created', async () => {
    assign = async () => ({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) }) as Response;
    mount(); const detail = await open();
    fireEvent.click(within(detail).getByRole('button', { name: 'Auto-assign task' }));
    const note = await within(detail).findByRole('alert');
    expect(note.textContent).toMatch(/session has expired/i);
    expect(note.textContent).not.toMatch(/were created/i);
  });
  it('does not offer assignment to a viewer', async () => {
    auth.canWrite = false; mount(); const detail = await open();
    expect(within(detail).queryByRole('button', { name: 'Auto-assign task' })).toBeNull();
  });
});
describe('notification target', () => {
  it('opens the exact authorized task from a copied task URL under StrictMode', async () => {
    window.history.replaceState(null, '', `/concept2cure/tasks?taskId=${TASK.taskId}&program=00000000-0000-4000-8000-000000000007`);
    mount(true);
    expect((await screen.findByRole('dialog', { name: 'Task detail' })).textContent).toContain(TASK.title);
    expect(apiRequest.mock.calls.some(([method]) => method !== 'GET')).toBe(false);
  });
  it('refuses a copied URL task absent from the authorized board', async () => {
    window.history.replaceState(null, '', '/concept2cure/tasks?taskId=TASK-ANOTHER-ORG');
    mount();
    expect((await screen.findByRole('alert')).textContent).toMatch(/not available.*board/i);
    expect(screen.queryByRole('dialog', { name: 'Task detail' })).toBeNull();
  });
  it('reports an unread board rather than treating a copied URL task as missing', async () => {
    readFailed = true;
    window.history.replaceState(null, '', `/concept2cure/tasks?taskId=${TASK.taskId}`);
    mount();
    expect(await screen.findByText(/The task board could not be read, so the requested task/)).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Task detail' })).toBeNull();
  });
  it.each(['TASK-RECOVERY%2Fother', 'TASK-RECOVERY&taskId=TASK-SECOND', 'OTHER-RECOVERY'])('does not select a malformed or ambiguous task query: %s', async query => {
    window.history.replaceState(null, '', `/concept2cure/tasks?taskId=${query}`);
    mount();
    await screen.findByRole('button', { name: `Open ${TASK.title}` });
    expect(screen.queryByRole('dialog', { name: 'Task detail' })).toBeNull();
  });
  it('prefers a new navigation handoff over the copied URL without StrictMode replay', async () => {
    board = [TASK, { ...TASK, taskId: 'TASK-SECOND', title: 'New notification task' }];
    window.history.replaceState(null, '', `/concept2cure/tasks?taskId=${TASK.taskId}`);
    stashNavParamsForTarget('tasks', { taskId: 'TASK-SECOND' });
    mount(true);
    const detail = await screen.findByRole('dialog', { name: 'Task detail' });
    expect(detail.textContent).toContain('New notification task');
    expect(within(detail).queryByText(/Finish or close/)).toBeNull();
  });
  it('does not reopen the initial URL task after unrelated navigation events', async () => {
    window.history.replaceState(null, '', `/concept2cure/tasks?taskId=${TASK.taskId}`);
    mount();
    const detail = await screen.findByRole('dialog', { name: 'Task detail' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Close' }));
    act(() => { stashNavParamsForTarget('project-home', { workId: 'CORRESPONDENCE-12' }); });
    expect(screen.queryByRole('dialog', { name: 'Task detail' })).toBeNull();
  });
  it('opens the exact saved task after the authorized board loads', async () => {
    stashNavParamsForTarget('tasks', { taskId: TASK.taskId }); mount();
    expect((await screen.findByRole('dialog', { name: 'Task detail' })).textContent).toContain(TASK.title);
    expect(window.C2C_NAV_PARAMS).toBeUndefined();
  });
  it('opens a notification while the board is already mounted', async () => {
    mount(); await screen.findByRole('button', { name: `Open ${TASK.title}` });
    act(() => { stashNavParamsForTarget('tasks', { taskId: TASK.taskId }); });
    expect((await screen.findByRole('dialog', { name: 'Task detail' })).textContent).toContain(TASK.title);
  });
  it('keeps the one-shot notification target through StrictMode rendering', async () => {
    stashNavParamsForTarget('tasks', { taskId: TASK.taskId }); mount(true);
    expect((await screen.findByRole('dialog', { name: 'Task detail' })).textContent).toContain(TASK.title);
  });
  it('preserves an archive justification while a second notification waits', async () => {
    board = [TASK, { ...TASK, taskId: 'TASK-SECOND', title: 'Second notification' }];
    mount(); const detail = await open();
    fireEvent.click(within(detail).getByRole('button', { name: `Archive "${TASK.title}"` }));
    const reason = within(detail).getByLabelText(/Reason for archiving/);
    fireEvent.change(reason, { target: { value: 'Keep this unsaved reason' } });
    act(() => { stashNavParamsForTarget('tasks', { taskId: 'TASK-SECOND' }); });
    expect((reason as HTMLTextAreaElement).value).toBe('Keep this unsaved reason');
    expect(within(detail).getByText(/Finish or close/)).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: 'Close' }));
    expect((await screen.findByRole('dialog', { name: 'Task detail' })).textContent).toContain('Second notification');
  });
  it('says a missing task is unavailable, never opens another task', async () => {
    stashNavParamsForTarget('tasks', { taskId: 'TASK-ANOTHER-ORG' }); mount();
    expect((await screen.findByRole('alert')).textContent).toMatch(/not available.*board/i);
    expect(screen.queryByRole('dialog', { name: 'Task detail' })).toBeNull();
  });
  it('does not call an unread board a missing task', async () => {
    readFailed = true; stashNavParamsForTarget('tasks', { taskId: TASK.taskId }); mount();
    expect(await screen.findByText(/The task board could not be read, so the requested task/)).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Task detail' })).toBeNull();
  });
});
