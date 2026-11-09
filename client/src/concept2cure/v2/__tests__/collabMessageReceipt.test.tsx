// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...await original<typeof import('@/lib/queryClient')>(), apiRequest,
}));
import { ApiRequestError } from '@/lib/queryClient';
import { CollabLayer } from '../surfaces/CollabLauncher';

const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });
const calls = (path: string) => apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && url === path);
const messageCalls = () => calls('/api/tasks/messages');
const taskCalls = () => calls('/api/tasks/tasks');
let sendMessage: () => Promise<ReturnType<typeof response>>;
let createTask: () => Promise<ReturnType<typeof response>>;

beforeEach(() => {
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
afterEach(() => { cleanup(); Reflect.deleteProperty(window, 'C2C_PROJECT'); });

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
