// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...await original<typeof import('@/lib/queryClient')>(), apiRequest,
}));
import { ApiRequestError } from '@/lib/queryClient';
import { C2C, CollabLayer } from '../surfaces/CollabLauncher';
import { authService, type AuthUser } from '@/services/portal/authService';

const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });
const calls = (path: string) => apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && url === path);
const messageCalls = () => calls('/api/tasks/messages');
const taskCalls = () => calls('/api/tasks/tasks');
let sendMessage: () => Promise<ReturnType<typeof response>>;
let createTask: () => Promise<ReturnType<typeof response>>;
const author: AuthUser = { id: '101', organizationId: '11', organizationName: 'Synthetic receipt sponsor',
  email: 'receipt@example.test', firstName: 'Receipt', lastName: 'Author', displayName: 'Receipt Author',
  roles: ['member'], permissions: ['tasks:read'], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
const replacement: AuthUser = { ...author, id: '202', organizationId: '22', email: 'other-receipt@example.test' };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
};

beforeEach(() => {
  authService.endSession(null); localStorage.clear(); sessionStorage.clear();
  authService.setToken('synthetic-receipt-author', author, 'synthetic-receipt-refresh');
  apiRequest.mockReset();
  sendMessage = async () => response({ success: true, data: { id: 101 } }, 201);
  createTask = async () => response({ success: false, error: 'Current project access does not allow this task.' }, 403);
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === '/api/task-management/assignees') return response({ data: [{ id: 8801, name: 'Priya Raman' }] });
    if (method === 'GET' && path === '/api/projects') return response([{ id: 41, name: 'BX-204' }]);
    if (method === 'POST' && path === '/api/tasks/messages') return sendMessage();
    if (method === 'POST' && path === '/api/tasks/tasks') return createTask();
    return response({ data: [] });
  });
});
afterEach(() => {
  cleanup(); authService.endSession(null); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'C2C_PROJECT');
});

async function openComposer(mount = true) {
  if (mount) render(<CollabLayer onNav={vi.fn()} />);
  await act(async () => { window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode: 'collab' } })); });
  fireEvent.click(await screen.findByTitle('Priya Raman'));
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Please review the protocol endpoints.' } });
}
async function send() { await act(async () => { fireEvent.click(screen.getByTestId('collab-send')); }); }

describe('a confirmed collaboration message is never resent to retry its optional task', () => {
  it.each(['HTTP refusal', 'thrown refusal'])('retains delivery after an optional task %s', async kind => {
    if (kind === 'thrown refusal') createTask = async () => { throw new ApiRequestError('Current project access does not allow this task.', 403); };
    await openComposer(); fireEvent.click(screen.getByRole('button', { name: /Also create a task/ }));
    await send();
    expect((await screen.findByRole('alert')).textContent).toMatch(/message was sent.*task was not created/i);
    await send();
    expect(messageCalls()).toHaveLength(1); expect(taskCalls()).toHaveLength(1);
    expect((screen.getByTestId('collab-send') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByTitle('Priya Raman') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Also create a task/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(['HTTP refusal', 'thrown refusal'])('keeps a known message %s editable and retryable, without creating a task', async kind => {
    let attempts = 0;
    sendMessage = async () => {
      if (++attempts > 1) return response({ success: true, data: { id: 102 } }, 201);
      if (kind === 'thrown refusal') throw new ApiRequestError('Recipient is unavailable.', 403);
      return response({ error: 'Recipient is unavailable.' }, 403);
    };
    await openComposer(); await send();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Not sent/);
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).disabled).toBe(false);
    await send();
    expect(messageCalls()).toHaveLength(2); expect(taskCalls()).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('does not report a lost message acknowledgement as definitely unsent or permit an automatic repeat', async () => {
    sendMessage = async () => { throw new TypeError('Failed to fetch'); };
    await openComposer(); await send();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/whether.*message.*sent.*unknown/i);
    expect(alert.textContent).not.toMatch(/Not sent|Nothing was delivered/);
    await send(); expect(messageCalls()).toHaveLength(1); expect(taskCalls()).toHaveLength(0);
  });

  it('does not claim a lost task acknowledgement means no task was created', async () => {
    createTask = async () => { throw new ApiRequestError('Whether this task was saved is unknown.', 500, { code: 'OUTCOME_UNKNOWN' }, 'OUTCOME_UNKNOWN'); };
    await openComposer(); fireEvent.click(screen.getByRole('button', { name: /Also create a task/ })); await send();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/message was sent.*whether.*task.*created.*unknown/i);
    expect(alert.textContent).not.toMatch(/task was not created|Create it from/);
    await send(); expect(messageCalls()).toHaveLength(1); expect(taskCalls()).toHaveLength(1);
  });

  it('closing a partial result and opening a new composer starts fresh intake', async () => {
    await openComposer(); fireEvent.click(screen.getByRole('button', { name: /Also create a task/ })); await send();
    await screen.findByRole('alert'); fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    await act(async () => { window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode: 'collab' } })); });
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).disabled).toBe(false);
    fireEvent.click(await screen.findByTitle('Priya Raman'));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'A distinct follow-up.' } }); await send();
    expect(messageCalls()).toHaveLength(2); expect(taskCalls()).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});


const unconfirmedMessages: Array<[string, () => Promise<ReturnType<typeof response>>]> = [
  ['missing response body', async () => response(null, 201)],
  ['missing persisted notification identity', async () => response({ success: true, data: {} }, 201)],
  ['string identity', async () => response({ success: true, data: { id: '101' } }, 201)],
  ['object identity', async () => response({ success: true, data: { id: {} } }, 201)],
  ['negative identity', async () => response({ success: true, data: { id: -1 } }, 201)],
  ['fractional identity', async () => response({ success: true, data: { id: 1.5 } }, 201)],
  ['unsafe integer identity', async () => response({ success: true, data: { id: Number.MAX_SAFE_INTEGER + 1 } }, 201)],
  ['contradictory success flag', async () => response({ success: false, data: { id: 101 } }, 201)],
  ['nonboolean success flag', async () => response({ success: 'true', data: { id: 101 } }, 201)],
  ['array receipt', async () => response([{ success: true, data: { id: 101 } }], 201)],
  ['truncated success receipt', async () => ({ ok: true, status: 201,
    json: async () => { throw new SyntaxError('Synthetic truncated receipt'); } })],
  ['empty successful acknowledgement', async () => response(null, 204)],
];

describe('a collaboration message needs its persisted notification receipt', () => {
  it.each(unconfirmedMessages)('does not confirm delivery or start its optional task after %s', async (_name, receipt) => {
    sendMessage = receipt; await openComposer();
    fireEvent.click(screen.getByRole('button', { name: /Also create a task/ })); await send();
    const alert = (await screen.findByRole('alert')).textContent || '';
    expect({ messages: messageCalls().length, tasks: taskCalls().length, localTasks: C2C.list().length,
      claimedDelivery: /^(?:The )?message was sent|Nothing was delivered|^Not sent/i.test(alert) })
      .toEqual({ messages: 1, tasks: 0, localTasks: 0, claimedDelivery: false });
    expect(alert).toMatch(/whether.*message.*sent.*unknown/i);
    expect((screen.getByTestId('collab-send') as HTMLButtonElement).disabled).toBe(true);
    await send(); expect(messageCalls()).toHaveLength(1); expect(taskCalls()).toHaveLength(0);
  });

  it('keeps a plain message draft visible when its successful response has no receipt', async () => {
    sendMessage = async () => response(null, 204); await openComposer(); await send();
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Please review the protocol endpoints.');
    expect(screen.getByRole('alert').textContent).toMatch(/unknown/i);
    expect(messageCalls()).toHaveLength(1); expect(taskCalls()).toHaveLength(0);
  });

  it.each([0, 101])('still acknowledges a service-valid numeric notification identity %s', async id => {
    sendMessage = async () => response({ success: true, data: { id } }, 201);
    await openComposer(); await send();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(messageCalls()).toHaveLength(1); expect(taskCalls()).toHaveLength(0);
  });

  it('still creates the optional task after a confirmed notification receipt', async () => {
    createTask = async () => response({ success: true, data: { taskId: 'synthetic-confirmed-review', assigneeId: 8801 } }, 201);
    await openComposer(); fireEvent.click(screen.getByRole('button', { name: /Also create a task/ })); await send();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(messageCalls()).toHaveLength(1); expect(taskCalls()).toHaveLength(1);
    expect(C2C.list()[0].taskId).toBe('synthetic-confirmed-review');
  });

  it('retires a message receipt body still being read when the account changes', async () => {
    const body = deferred<unknown>(); const read = vi.fn(() => body.promise);
    sendMessage = async () => ({ ok: true, status: 201, json: read });
    await openComposer(); fireEvent.click(screen.getByRole('button', { name: /Also create a task/ }));
    fireEvent.click(screen.getByTestId('collab-send'));
    try {
      await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      await act(async () => {
        authService.setToken('synthetic-replacement', replacement, 'synthetic-replacement-refresh');
        body.resolve({ success: true, data: { id: 303 } });
      });
      expect(taskCalls()).toHaveLength(0); expect(C2C.list()).toEqual([]);
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally { await act(async () => { body.resolve({ success: true, data: { id: 303 } }); }); }
  });

  it('accepts a message receipt body after an ordinary bearer refresh', async () => {
    const body = deferred<unknown>(); const read = vi.fn(() => body.promise);
    sendMessage = async () => ({ ok: true, status: 201, json: read });
    createTask = async () => response({ success: true, data: { taskId: 'synthetic-refreshed-review', assigneeId: 8801 } }, 201);
    await openComposer(); fireEvent.click(screen.getByRole('button', { name: /Also create a task/ }));
    fireEvent.click(screen.getByTestId('collab-send'));
    try {
      await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      vi.spyOn(authService.api, 'post').mockResolvedValue({ success: true,
        data: { accessToken: 'synthetic-receipt-rotated', refreshToken: 'synthetic-receipt-rotated-refresh', expiresIn: 3600 } });
      await act(async () => {
        expect(await authService.refreshToken()).toBe(true); body.resolve({ success: true, data: { id: 303 } });
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(messageCalls()).toHaveLength(1); expect(taskCalls()).toHaveLength(1);
      expect(C2C.list()[0].taskId).toBe('synthetic-refreshed-review');
    } finally { await act(async () => { body.resolve({ success: true, data: { id: 303 } }); }); }
  });
});
