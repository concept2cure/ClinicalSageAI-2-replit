// @vitest-environment jsdom
/** Task create acknowledgements are evidence; transport loss is not a rollback. */
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

const user: AuthUser = { id: '101', organizationId: '11', organizationName: 'Fictional task test sponsor',
  email: 'fixture@example.test', firstName: 'Fixture', lastName: 'Member', displayName: 'Fixture Member',
  roles: ['member'], permissions: ['tasks:read'], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const saved = () => response({ success: true, data: { taskId: 'synthetic-confirmed-task', assigneeId: 101 } }, 201);
const UNKNOWN = 'Whether this change was saved is unknown. Reload to see the task’s current state before trying again.';
const AUDIT = 'The task could not be recorded in the audit trail, so nothing was changed. Try again.';
const failed = (status: number, message: string, code?: string) => new ApiRequestError(message, status, { error: code, message }, code);
let post: () => Promise<ReturnType<typeof response>>;
const writes = () => apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && path === '/api/tasks/tasks');
const create = () => document.querySelector('.cl-foot button.btn.primary') as HTMLButtonElement;
const another = () => screen.getByRole('button', { name: /Create & add another/ });
const title = () => screen.getByPlaceholderText(/^e\.g\. Review/) as HTMLInputElement;

beforeEach(() => {
  authService.endSession(null); localStorage.clear(); sessionStorage.clear();
  authService.setToken('synthetic-task-outcome', user, 'synthetic-refresh'); apiRequest.mockReset();
  post = async () => saved();
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST') return post();
    return response(path.includes('assignees') ? { data: [{ id: 101, name: 'Fixture Member' }] }
      : [{ id: 41, name: 'Fictional endpoint project' }]);
  });
});
afterEach(() => {
  cleanup(); authService.endSession(null); localStorage.clear(); sessionStorage.clear();
  Reflect.deleteProperty(window, 'C2C_PROJECT');
});
async function compose(onNav?: (id: string) => void) {
  render(<CollabLayer onNav={onNav} />);
  await act(async () => { window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode: 'task' } })); });
  await screen.findByRole('option', { name: 'Fictional endpoint project' });
  fireEvent.change(screen.getByLabelText('Project'), { target: { value: '41' } });
  fireEvent.change(title(), { target: { value: 'Review the fictional endpoint summary' } });
}
async function submit(button: HTMLElement = create()) { await act(async () => { fireEvent.click(button); }); }

const ambiguous: Array<[string, () => Promise<ReturnType<typeof response>>]> = [
  ['lost network acknowledgement', async () => { throw new TypeError('Failed to fetch'); }],
  ['thrown OUTCOME_UNKNOWN', async () => { throw failed(500, UNKNOWN, 'OUTCOME_UNKNOWN'); }],
  ['returned OUTCOME_UNKNOWN', async () => response({ success: false, error: 'OUTCOME_UNKNOWN', message: UNKNOWN }, 500)],
  ['successful response without a persisted task identifier', async () => response({ success: true, data: {} }, 201)],
  ['unreadable success receipt', async () => ({ ok: true, status: 201,
    json: async () => { throw new SyntaxError('Synthetic truncated body'); } })],
  ['unclassified server failure', async () => { throw failed(502, 'The service could not confirm the result.'); }],
  ...[42, {}, '   '].map(taskId => [`invalid persisted task identifier ${JSON.stringify(taskId)}`,
    async () => response({ success: true, data: { taskId } }, 201)] as [string, () => Promise<ReturnType<typeof response>>]),
  ['contradictory success receipt', async () => response({ success: false, data: { taskId: 'synthetic-contradiction' } }, 201)],
  ['request timeout', async () => response({ error: 'The request timed out.' }, 408)],
];

describe('unknown task create outcomes', () => {
  it.each(ambiguous)('does not repeat or claim rollback after %s', async (_name, attempt) => {
    post = attempt; await compose(); await submit();
    const message = (await screen.findByRole('alert')).textContent || '';
    await submit();
    expect({ posts: writes().length, claimsUnwritten: /Nothing was saved|Nothing was created|task was not created/i.test(message) })
      .toEqual({ posts: 1, claimsUnwritten: false });
    expect(message).toMatch(/unknown/i); expect(message).toMatch(/task|board|reload/i);
    expect(C2C.list()).toEqual([]);
  });

  it('protects both create actions after an ambiguous Create and add another', async () => {
    post = async () => { throw new TypeError('Failed to fetch'); };
    await compose(); await submit(another()); await screen.findByRole('alert');
    await submit(); await submit(another());
    expect(writes()).toHaveLength(1); expect(C2C.list()).toEqual([]);
  });
});

const refused: Array<[string, () => Promise<ReturnType<typeof response>>]> = [
  ['returned validation refusal', async () => response({ success: false, error: 'Task title needs correction. Nothing was saved.' }, 400)],
  ['thrown project refusal', async () => { throw failed(403, 'The selected project is unavailable. Nothing was created.'); }],
  ['confirmed audit rollback', async () => { throw failed(500, AUDIT, 'AUDIT_WRITE_FAILED'); }],
  ['returned audit rollback', async () => response({ success: false, error: 'AUDIT_WRITE_FAILED', message: AUDIT }, 500)],
];

describe('known refusal and confirmed create controls', () => {
  it.each(refused)('allows a corrected task after %s', async (_name, refusal) => {
    let attempts = 0; post = async () => ++attempts === 1 ? refusal() : saved();
    await compose(); await submit(); await screen.findByRole('alert');
    expect(title().matches(':disabled')).toBe(false);
    fireEvent.change(title(), { target: { value: 'Corrected fictional endpoint request' } });
    await submit(); await waitFor(() => expect(writes()).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(C2C.list()).toHaveLength(1);
  });

  it('keeps the existing task board navigation usable after an unknown outcome', async () => {
    post = async () => { throw new TypeError('Failed to fetch'); };
    const navigate = vi.fn(); await compose(navigate); await submit(); await screen.findByRole('alert');
    const board = screen.getByTestId('collab-go-to-board') as HTMLButtonElement;
    expect(board.disabled).toBe(false); fireEvent.click(board);
    expect(navigate).toHaveBeenCalledWith('tasks'); expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('permits an explicit second intake only after confirmed Create and add another', async () => {
    await compose(); await submit(another());
    await waitFor(() => expect(title().value).toBe(''));
    fireEvent.change(title(), { target: { value: 'A distinct fictional follow-up' } });
    await submit(); await waitFor(() => expect(writes()).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('admits only one create write when both create actions are invoked before acknowledgement', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    const pending = new Promise<ReturnType<typeof response>>(answer => { resolve = answer; });
    post = async () => pending;
    await compose();
    try {
      await act(async () => { fireEvent.click(create()); fireEvent.click(another()); });
      expect(writes()).toHaveLength(1);
    } finally { await act(async () => { resolve(saved()); }); }
  });
});
