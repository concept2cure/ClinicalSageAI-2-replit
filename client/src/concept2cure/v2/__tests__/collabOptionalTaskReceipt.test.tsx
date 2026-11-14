// @vitest-environment jsdom
/** A sent message is not evidence that its optional task was persisted. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...await original<typeof import('@/lib/queryClient')>(), apiRequest,
}));
import { ApiRequestError } from '@/lib/queryClient';
import { authService, type AuthUser } from '@/services/portal/authService';
import { C2C, CollabLayer } from '../surfaces/CollabLauncher';

const author: AuthUser = { id: '101', organizationId: '11', organizationName: 'Fictional sponsor',
  firstName: 'Fixture', lastName: 'Author', displayName: 'Fixture Author', email: 'author@example.test',
  roles: ['member'], permissions: ['tasks:read'], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });
const savedTask = () => response({ success: true, data: { taskId: 'synthetic-stored-task', assigneeId: 101 } }, 201);
const failure = (status: number, code: string, message: string) =>
  new ApiRequestError(message, status, { error: code, message }, code);
let createTask: () => Promise<ReturnType<typeof response>>;
const writes = (path: string) => apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && url === path);

beforeEach(() => {
  authService.endSession(null); localStorage.clear(); sessionStorage.clear();
  authService.setToken('synthetic-optional-task-author', author, 'synthetic-refresh');
  apiRequest.mockReset(); createTask = async () => savedTask();
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET') return response(path.includes('assignees')
      ? { data: [{ id: 101, name: 'Fixture Author' }] } : [{ id: 41, name: 'Fictional project' }]);
    if (path === '/api/tasks/messages') return response({ success: true, data: { id: 303 } }, 201);
    if (path === '/api/tasks/tasks') return createTask();
    throw new Error('Unexpected synthetic request');
  });
});
afterEach(() => {
  cleanup(); authService.endSession(null); localStorage.clear(); sessionStorage.clear();
  Reflect.deleteProperty(window, 'C2C_PROJECT');
});

async function compose() {
  render(<CollabLayer />);
  await act(async () => { window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode: 'collab' } })); });
  fireEvent.click(await screen.findByTitle('Fixture Author'));
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Please review the fictional endpoint summary.' } });
  fireEvent.click(screen.getByRole('button', { name: /Also create a task/ }));
}
async function send() { await act(async () => { fireEvent.click(screen.getByTestId('collab-send')); }); }
function assertPartialIsLocked() {
  expect(writes('/api/tasks/messages')).toHaveLength(1);
  expect(writes('/api/tasks/tasks')).toHaveLength(1);
  expect((screen.getByTestId('collab-send') as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).disabled).toBe(true);
}

const unknown: Array<[string, () => Promise<ReturnType<typeof response>>]> = [
  ['missing task identity', async () => response({ success: true, data: {} }, 201)],
  ...[42, {}, true, '   '].map(taskId => [`invalid identity ${JSON.stringify(taskId)}`,
    async () => response({ success: true, data: { taskId } }, 201)] as [string, () => Promise<ReturnType<typeof response>>]),
  ['contradictory success envelope', async () => response({ success: false, data: { taskId: 'synthetic-contradiction' } }, 201)],
  ['unreadable successful receipt', async () => ({ ok: true, status: 201,
    json: async () => { throw new SyntaxError('Synthetic truncated task receipt'); } })],
  ['returned unknown outcome', async () => response({ error: 'OUTCOME_UNKNOWN' }, 500)],
  ['thrown unknown outcome', async () => { throw failure(500, 'OUTCOME_UNKNOWN', 'The task result could not be confirmed.'); }],
  ['returned unknown code with client status', async () => response({ error: 'OUTCOME_UNKNOWN' }, 403)],
  ['thrown unknown code with client status', async () => { throw failure(403, 'OUTCOME_UNKNOWN', 'The task result could not be confirmed.'); }],
  ['request timeout', async () => response({ error: 'Request timed out.' }, 408)],
  ['unclassified server failure', async () => { throw new ApiRequestError('Service unavailable.', 502); }],
  ['network acknowledgement loss', async () => { throw new TypeError('Failed to fetch'); }],
];

describe('a confirmed message with an unconfirmed optional task', () => {
  it.each(unknown)('preserves uncertainty without a made-up row after %s', async (_name, task) => {
    createTask = task; await compose(); await send();
    expect(C2C.list().map(row => row.taskId)).toEqual([]);
    const text = screen.queryByRole('alert')?.textContent || '';
    expect(text).toMatch(/message was sent.*whether.*task.*created.*unknown/i);
    expect(text).not.toMatch(/task was not created|Create it from/);
    assertPartialIsLocked(); await send(); assertPartialIsLocked();
  });
});

const refused: Array<[string, () => Promise<ReturnType<typeof response>>]> = [
  ['validation refusal', async () => response({ error: 'Task needs correction.' }, 400)],
  ['project refusal', async () => { throw new ApiRequestError('The project is unavailable.', 403); }],
  ['returned explicit audit rollback', async () => response({ error: 'AUDIT_WRITE_FAILED',
    message: 'The audit could not be recorded, so nothing was changed.' }, 500)],
  ['thrown explicit audit rollback', async () => { throw failure(500, 'AUDIT_WRITE_FAILED',
    'The audit could not be recorded, so nothing was changed.'); }],
];

describe('known optional-task refusal and successful receipt controls', () => {
  it.each(refused)('reports a sent message and a task not created after %s', async (_name, task) => {
    createTask = task; await compose(); await send();
    expect(C2C.list()).toEqual([]);
    expect((await screen.findByRole('alert')).textContent).toMatch(/message was sent.*task was not created/i);
    assertPartialIsLocked(); await send(); assertPartialIsLocked();
  });

  it('projects exactly the persisted task identity and closes the successful intake', async () => {
    await compose(); await send();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(C2C.list().map(row => row.taskId)).toEqual(['synthetic-stored-task']);
    expect(writes('/api/tasks/messages')).toHaveLength(1); expect(writes('/api/tasks/tasks')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toMatch(/Message sent, and the task is saved/);
  });

  it('does not adopt a pending task receipt into a replacement account', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    createTask = () => new Promise(answer => { resolve = answer; });
    await compose(); fireEvent.click(screen.getByTestId('collab-send'));
    await waitFor(() => expect(writes('/api/tasks/tasks')).toHaveLength(1));
    await act(async () => {
      authService.setToken('synthetic-replacement', { ...author, id: '202', organizationId: '22' }, 'synthetic-refresh-b');
      resolve(savedTask());
    });
    expect(C2C.list()).toEqual([]); expect(screen.queryByRole('dialog')).toBeNull();
    expect(writes('/api/tasks/tasks')).toHaveLength(1);
  });
});
