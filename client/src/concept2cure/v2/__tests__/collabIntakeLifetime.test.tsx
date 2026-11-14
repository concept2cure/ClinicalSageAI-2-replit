// @vitest-environment jsdom
/** Pending intake callbacks cannot act on a replacement form; requests are synthetic. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AuthUser } from '@/services/portal/authService';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
let authService: typeof import('@/services/portal/authService').authService;
let C2C: typeof import('../surfaces/CollabLauncher').C2C;
let CollabLayer: typeof import('../surfaces/CollabLauncher').CollabLayer;
const AUTHOR: AuthUser = { id: '101', organizationId: '11', organizationName: 'Synthetic sponsor',
  firstName: 'Member', lastName: 'A', displayName: 'Member A', email: 'a@example.test',
  roles: ['member'], permissions: ['tasks:read'], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });
const taskReceipt = () => response({ success: true, data: { taskId: 'synthetic-persisted-task', assigneeId: 101 } }, 201);
const messageReceipt = () => response({ success: true, data: { id: 303 } }, 201);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
};
const writes = (path: string) => apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && url === path);
let createTask: () => Promise<ReturnType<typeof response>>;
let sendMessage: () => Promise<ReturnType<typeof response>>;

beforeEach(async () => {
  vi.resetModules();
  ({ authService } = await import('@/services/portal/authService'));
  ({ C2C, CollabLayer } = await import('../surfaces/CollabLauncher'));
  localStorage.clear(); sessionStorage.clear(); apiRequest.mockReset();
  authService.setToken('synthetic-intake-author', AUTHOR, 'synthetic-intake-refresh');
  window.C2C_PROJECT = { id: '41' };
  createTask = async () => taskReceipt(); sendMessage = async () => messageReceipt();
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === '/api/task-management/assignees') return response({ data: [{ id: 101, name: 'Member A' }] });
    if (method === 'GET' && path === '/api/projects') return response([{ id: 41, name: 'Synthetic project' }]);
    if (method === 'POST' && path === '/api/tasks/tasks') return createTask();
    if (method === 'POST' && path === '/api/tasks/messages') return sendMessage();
    throw new Error('Unexpected synthetic request');
  });
});
afterEach(() => {
  cleanup(); authService.endSession(null); vi.restoreAllMocks();
  localStorage.clear(); sessionStorage.clear(); Reflect.deleteProperty(window, 'C2C_PROJECT');
});
async function open(mode: 'task' | 'collab') {
  await act(async () => { window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode } })); });
  if (mode === 'task') await screen.findByRole('option', { name: 'Synthetic project' });
  else await screen.findByTitle('Member A');
}
const title = (value: string) => fireEvent.change(screen.getByPlaceholderText(/^e\.g\. Review/), { target: { value } });
const message = (value: string) => fireEvent.change(screen.getByLabelText('Message'), { target: { value } });
async function submitTask() {
  await open('task'); title('First submitted task');
  fireEvent.click(screen.getByRole('button', { name: /^.?Create task$/ }));
  await waitFor(() => expect(writes('/api/tasks/tasks')).toHaveLength(1));
}
async function submitMessage(optionalTask: boolean) {
  await open('collab'); fireEvent.click(screen.getByTitle('Member A')); message('First submitted message');
  if (optionalTask) fireEvent.click(screen.getByRole('button', { name: /Also create a task/ }));
  fireEvent.click(screen.getByTestId('collab-send'));
  await waitFor(() => expect(writes('/api/tasks/messages')).toHaveLength(1));
}

describe('the lifetime of one collaboration intake', () => {
  it('cannot close a reopened message draft when an old task is acknowledged', async () => {
    const pending = deferred<ReturnType<typeof response>>(); createTask = () => pending.promise;
    render(<CollabLayer />); await submitTask();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await open('collab'); message('New unsent message draft');
    await act(async () => { pending.resolve(taskReceipt()); });
    // The old task request remains a real acknowledged write. Its UI callback
    // must not dismiss another intake or discard the replacement's text.
    expect(writes('/api/tasks/tasks')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('New unsent message draft');
  });

  it('cannot close the Collaborate tab when a retired task form is acknowledged', async () => {
    const pending = deferred<ReturnType<typeof response>>(); createTask = () => pending.promise;
    render(<CollabLayer />); await submitTask();
    fireEvent.click(screen.getByRole('tab', { name: 'Collaborate' })); message('Keep the replacement tab draft');
    await act(async () => { pending.resolve(taskReceipt()); });
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Keep the replacement tab draft');
  });

  it('cannot close a reopened message draft when an old message is acknowledged', async () => {
    const pending = deferred<ReturnType<typeof response>>(); sendMessage = () => pending.promise;
    render(<CollabLayer />); await submitMessage(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await open('collab'); message('Distinct unsent follow-up');
    await act(async () => { pending.resolve(messageReceipt()); });
    expect(writes('/api/tasks/messages')).toHaveLength(1); expect(writes('/api/tasks/tasks')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Distinct unsent follow-up');
  });

  it.each(['close/reopen', 'tab switch'])('finishes the submitted optional task after %s without closing a replacement intake', async retirement => {
    const pending = deferred<ReturnType<typeof response>>(); sendMessage = () => pending.promise;
    render(<CollabLayer />); await submitMessage(true);
    if (retirement === 'close/reopen') {
      fireEvent.click(screen.getByRole('button', { name: 'Close' })); await open('task');
    } else fireEvent.click(screen.getByRole('tab', { name: 'New task' }));
    title('Replacement task draft');
    await act(async () => { pending.resolve(messageReceipt()); });
    // Dismissal does not cancel the submitted Send & assign operation. Its
    // truthful receipt may update this same account's board, not another form.
    expect(writes('/api/tasks/messages')).toHaveLength(1); expect(writes('/api/tasks/tasks')).toHaveLength(1);
    expect(C2C.list()[0].taskId).toBe('synthetic-persisted-task');
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect((screen.getByPlaceholderText(/^e\.g\. Review/) as HTMLInputElement).value).toBe('Replacement task draft');
  });

  it.each(['close/reopen', 'tab A to B to A'])('cannot reset a replacement task after batched %s', async visit => {
    const pending = deferred<ReturnType<typeof response>>(); createTask = () => pending.promise;
    render(<CollabLayer />); await open('task'); title('Original Create and add another');
    fireEvent.click(screen.getByRole('button', { name: /Create & add another/ }));
    await waitFor(() => expect(writes('/api/tasks/tasks')).toHaveLength(1));
    await act(async () => {
      if (visit === 'close/reopen') {
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode: 'task' } }));
      } else {
        fireEvent.click(screen.getByRole('tab', { name: 'Collaborate' }));
        fireEvent.click(screen.getByRole('tab', { name: 'New task' }));
      }
    });
    title('Replacement draft survives old acknowledgement');
    await act(async () => { pending.resolve(taskReceipt()); });
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect((screen.getByPlaceholderText(/^e\.g\. Review/) as HTMLInputElement).value)
      .toBe('Replacement draft survives old acknowledgement');
    expect(writes('/api/tasks/tasks')).toHaveLength(1);
  });

  it('keeps a new draft open when an old task returns a known refusal', async () => {
    const pending = deferred<ReturnType<typeof response>>(); createTask = () => pending.promise;
    render(<CollabLayer />); await submitTask();
    fireEvent.click(screen.getByRole('button', { name: 'Close' })); await open('task'); title('Keep this new draft');
    await act(async () => { pending.resolve(response({ error: 'Old task was refused.' }, 403)); });
    expect(screen.getByRole('dialog')).toBeTruthy(); expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByPlaceholderText(/^e\.g\. Review/) as HTMLInputElement).value).toBe('Keep this new draft');
  });

  it('still acknowledges and closes an active task intake on successful creation', async () => {
    render(<CollabLayer />); await submitTask();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(C2C.list()[0].taskId).toBe('synthetic-persisted-task');
    expect(screen.getByRole('status').textContent).toMatch(/Saved to the task board/);
  });

  it('still creates the requested optional task while the original message intake remains active', async () => {
    render(<CollabLayer />); await submitMessage(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes('/api/tasks/messages')).toHaveLength(1); expect(writes('/api/tasks/tasks')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toMatch(/Message sent, and the task is saved/);
  });

  it('preserves an active pending intake across an ordinary bearer refresh', async () => {
    const pending = deferred<ReturnType<typeof response>>(); createTask = () => pending.promise;
    render(<CollabLayer />); await submitTask();
    vi.spyOn(authService.api, 'post').mockResolvedValue({ success: true,
      data: { accessToken: 'synthetic-refreshed', refreshToken: 'synthetic-rotated', expiresIn: 3600 } });
    await act(async () => { expect(await authService.refreshToken()).toBe(true); pending.resolve(taskReceipt()); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(C2C.list()[0].taskId).toBe('synthetic-persisted-task');
  });
});
