// @vitest-environment jsdom
/** Real session guards; all directory/message/task requests below are injected fixtures. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import type { AuthUser } from '@/services/portal/authService';
let authService: typeof import('@/services/portal/authService').authService;
let C2C: typeof import('../surfaces/CollabLauncher').C2C;
let CollabLayer: typeof import('../surfaces/CollabLauncher').CollabLayer;

const A: AuthUser = { id: '101', organizationId: '11', organizationName: 'Synthetic sponsor A',
  firstName: 'Member', lastName: 'A', displayName: 'Member A', email: 'a@example.test',
  roles: ['member'], permissions: ['tasks:read'], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
const B: AuthUser = { ...A, id: '202', organizationId: '22', organizationName: 'Synthetic sponsor B',
  displayName: 'Member B', email: 'b@example.test' };
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });
const rowsFor = (account: AuthUser, path: string) => path.includes('assignees')
  ? { data: [{ id: Number(account.id), name: account.displayName }] }
  : [{ id: account === A ? 41 : 42, name: `Project ${account.displayName}` }];
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(answer => { resolve = answer; });
  return { promise, resolve };
};
const directoryCalls = () => apiRequest.mock.calls.filter(([method]) => method === 'GET');
const writes = (path: string) => apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && url === path);
let directoryAccount = A;

beforeEach(async () => {
  vi.resetModules();
  ({ authService } = await import('@/services/portal/authService'));
  ({ C2C, CollabLayer } = await import('../surfaces/CollabLauncher'));
  authService.endSession(null);
  localStorage.clear(); sessionStorage.clear();
  apiRequest.mockReset();
  directoryAccount = A;
  authService.setToken('synthetic-directory-a', A, 'synthetic-refresh-a');
  apiRequest.mockImplementation(async (_method: string, path: string) => response(rowsFor(directoryAccount, path)));
});
afterEach(() => {
  cleanup(); authService.endSession(null);
  localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'C2C_PROJECT');
});
const adopt = (account: AuthUser) => {
  directoryAccount = account;
  authService.setToken(`synthetic-directory-${account.id}`, account, 'synthetic-refresh');
};
async function open(mode = 'collab') {
  await act(async () => { window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode } })); });
  if (mode === 'collab') await screen.findByTitle(directoryAccount.displayName);
  else await screen.findByRole('option', { name: `Project ${directoryAccount.displayName}` });
}
async function compose() {
  await open(); fireEvent.click(screen.getByTitle('Member A'));
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Private synthetic A draft.' } });
}

describe('collaboration directory and form ownership', () => {
  it('retires the cached roster/projects immediately when a different account is adopted', async () => {
    await C2C.loadDirectory();
    expect(C2C.team['101'].n).toBe('Member A');
    adopt(B);
    expect(C2C.team).toEqual({}); expect(C2C.projects).toEqual([]);
    await C2C.loadDirectory();
    expect(Object.keys(C2C.team)).toEqual(['202']); expect(C2C.projects[0].label).toBe('Project Member B');
  });

  it('removes prior directory and local task rows on sign-out', async () => {
    await C2C.loadDirectory();
    C2C.addTask({ taskId: 'synthetic-a-task', title: 'Private A task' });
    authService.endSession(null);
    expect(C2C.team).toEqual({}); expect(C2C.projects).toEqual([]); expect(C2C.list()).toEqual([]);
  });

  it('cannot publish a retired directory after the new account loaded its own rows', async () => {
    const people = deferred<ReturnType<typeof response>>(), projects = deferred<ReturnType<typeof response>>();
    apiRequest.mockImplementation(async (_method: string, path: string) => directoryAccount === A
      ? (path.includes('assignees') ? people.promise : projects.promise)
      : response(rowsFor(directoryAccount, path)));
    const oldRead = C2C.loadDirectory();
    adopt(B); await C2C.loadDirectory();
    people.resolve(response(rowsFor(A, '/assignees'))); projects.resolve(response(rowsFor(A, '/projects')));
    await oldRead;
    expect(directoryCalls()).toHaveLength(4);
    expect(Object.keys(C2C.team)).toEqual(['202']); expect(C2C.projects[0].label).toBe('Project Member B');
  });

  it('retires cached access when the same account receives changed permissions', async () => {
    await C2C.loadDirectory();
    vi.spyOn(authService.api, 'get').mockResolvedValue({ success: true,
      data: { authenticated: true, user: { ...A, permissions: [] } } });
    await authService.refreshUser();
    expect(C2C.team).toEqual({}); expect(C2C.projects).toEqual([]);
    await C2C.loadDirectory(); expect(directoryCalls()).toHaveLength(4);
  });

  it('keeps the same directory across same-access account re-reads and ordinary token refresh', async () => {
    await C2C.loadDirectory();
    vi.spyOn(authService.api, 'get').mockResolvedValue({ success: true,
      data: { authenticated: true, user: { ...A, permissions: [...A.permissions] } } });
    await authService.refreshUser();
    vi.spyOn(authService.api, 'post').mockResolvedValue({ success: true,
      data: { accessToken: 'synthetic-refreshed', refreshToken: 'synthetic-refresh-rotated', expiresIn: 3600 } });
    expect(await authService.refreshToken()).toBe(true);
    await C2C.loadDirectory();
    expect(directoryCalls()).toHaveLength(2); expect(C2C.team['101'].n).toBe('Member A');
  });

  it('accepts an in-flight directory after a harmless token refresh', async () => {
    const people = deferred<ReturnType<typeof response>>(), projects = deferred<ReturnType<typeof response>>();
    apiRequest.mockImplementation(async (_method: string, path: string) => path.includes('assignees') ? people.promise : projects.promise);
    const reading = C2C.loadDirectory();
    vi.spyOn(authService.api, 'post').mockResolvedValue({ success: true,
      data: { accessToken: 'synthetic-refreshed', refreshToken: 'synthetic-refresh-rotated', expiresIn: 3600 } });
    expect(await authService.refreshToken()).toBe(true);
    people.resolve(response(rowsFor(A, '/assignees'))); projects.resolve(response(rowsFor(A, '/projects')));
    await reading; expect(C2C.team['101'].n).toBe('Member A'); expect(directoryCalls()).toHaveLength(2);
  });

  it('closes the old composer and clears its recipient/body before another account can compose', async () => {
    render(<CollabLayer />); await compose();
    await act(async () => { adopt(B); });
    expect(screen.queryByRole('dialog')).toBeNull();
    await open();
    expect(screen.queryByTitle('Member A')).toBeNull();
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByTestId('collab-send') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not create an optional task under the replacement account after an old message returns', async () => {
    const message = deferred<ReturnType<typeof response>>();
    apiRequest.mockImplementation(async (method: string, path: string) => method === 'POST'
      ? path.endsWith('/messages') ? message.promise : response({ data: { taskId: 'synthetic-task' } }, 201)
      : response(rowsFor(directoryAccount, path)));
    render(<CollabLayer />); await compose();
    fireEvent.click(screen.getByRole('button', { name: /Also create a task/ }));
    fireEvent.click(screen.getByTestId('collab-send'));
    await waitFor(() => expect(writes('/api/tasks/messages')).toHaveLength(1));
    await act(async () => { adopt(B); message.resolve(response({ success: true, data: { id: 303 } }, 201)); });
    expect(writes('/api/tasks/tasks')).toHaveLength(0); expect(C2C.list()).toEqual([]);
  });

  it('does not publish a prior account task response into the new account store', async () => {
    const task = deferred<ReturnType<typeof response>>();
    apiRequest.mockImplementation(async (method: string, path: string) => method === 'POST' ? task.promise : response(rowsFor(directoryAccount, path)));
    render(<CollabLayer />); await open('task');
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: '41' } });
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\. Review/), { target: { value: 'Private A task' } });
    fireEvent.click(screen.getByRole('button', { name: /^.?Create task$/ }));
    await waitFor(() => expect(writes('/api/tasks/tasks')).toHaveLength(1));
    await act(async () => { adopt(B); task.resolve(response({ data: { taskId: 'synthetic-a-task', assigneeId: 101 } }, 201)); });
    expect(C2C.list()).toEqual([]); expect(screen.queryByText(/Saved to the task board, assigned/)).toBeNull();
  });
});
