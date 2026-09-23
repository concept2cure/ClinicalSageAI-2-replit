// @vitest-environment jsdom
/**
 * TaskBoard — a refused write is reported as a refusal, never as nothing.
 *
 * `apiRequest` THROWS on every non-OK status except 401, which it RETURNS. The
 * board's move() handled that; archive(), the §11.50 signing ceremony and the
 * workflow auto-assign step did not — an expired session made each a silent
 * no-op: the archive form reset, the signature modal cleared the PIN and said
 * nothing, and auto-assign reported the workflow as created-and-assigned.
 *
 * The task routes now also refuse an org viewer with 403 (requireEditorAccess)
 * and a write whose ledger row failed with 500 AUDIT_WRITE_FAILED. Those arrive
 * as ApiRequestError, and must reach the user in the server's words where the
 * user is looking — not as "Network error", and not behind a modal backdrop.
 *
 * Three more of the same kind: an archive reason past the server's 1000-character
 * ceiling, an auto-assign that answered 200 having assigned fewer than it was
 * sent, and the sign-off's own 401 (no verified signer) shown as an expired session.
 *
 * And a move whose COMMIT was lost (500 OUTCOME_UNKNOWN): shown in the server's
 * words — never as "not completed" — and followed by a re-read of the board, so
 * what the user sees next is the state that actually holds.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Tester', email: 't@example.com' } }),
}));

import { ApiRequestError } from '@/lib/queryClient';
import { TaskBoard } from '../surfaces/TaskBoard';

const TASK = {
  taskId: 'TASK-1', title: 'Freeze CSR shell', project: '', moduleType: 'clinical', taskType: 'authoring',
  status: 'review', priority: 'high', assignee: 'u-2', assignedBy: 'u-1', progress: 60, impactScore: null,
  due: '—', dueDateIso: null, phase: null, criticalPath: false, regulatoryImpact: false, blocked: false,
  approvalRequired: true, approvalStatus: 'pending', approvalHistory: [], dependsOn: [], blocks: [],
  comments: 0, attachments: 0, source: 'unified', createdAt: '2026-08-01T00:00:00Z',
};
const TEMPLATE = {
  templateId: 'tpl-1', name: 'NDA filing', isDefault: true, taskCount: 1, spanDays: 1, estimatedHours: 2,
  dependencyCount: 0, description: '', tasksTruncated: false,
  tasks: [{ id: 't1', title: 'Draft', moduleType: 'IND', dayOffset: 0, duration: 1, priority: 'low' }],
};

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const expired = () => ({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) }) as Response;

/** Reads served for the board; `writes` decides each mutation's answer. */
let writes: (method: string, path: string) => Promise<Response>;
beforeEach(() => {
  apiRequest.mockReset();
  writes = async () => ok({ success: true });
  apiRequest.mockImplementation(async (method: string, rawPath: unknown) => {
    const path = String(rawPath ?? '');
    if (method !== 'GET') return writes(method, path);
    if (path === '/api/task-management/board') return ok({ data: [TASK] });
    if (path === '/api/task-management/templates') return ok({ data: [TEMPLATE] });
    if (path === '/api/projects') return ok({ data: [{ id: 3, name: 'BX-1 programme' }] });
    return ok({ data: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The signing ceremony is the shared EsignModal, whose password re-check is a
// react-query mutation, so the board mounts inside a provider.
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <TaskBoard {...({ onAsk: () => {} } as unknown as React.ComponentProps<typeof TaskBoard>)} />
    </QueryClientProvider>,
  );

async function openArchiveConfirm() {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: `Open ${TASK.title}` }));
  const detail = await screen.findByRole('dialog', { name: 'Task detail' });
  fireEvent.click(within(detail).getByRole('button', { name: `Archive "${TASK.title}"` }));
  fireEvent.change(within(detail).getByLabelText(/Reason for archiving/), {
    target: { value: 'Superseded by TASK-2' },
  });
  fireEvent.click(within(detail).getByRole('button', { name: `Confirm archiving "${TASK.title}"` }));
  return detail;
}

describe('archive — a refusal is shown in the panel, and the task is not reported archived', () => {
  it('says the session expired when the DELETE comes back 401', async () => {
    writes = async () => expired();
    const detail = await openArchiveConfirm();

    const alert = await within(detail).findByRole('alert');
    expect(alert.textContent).toMatch(/session has expired/i);
    expect(alert.textContent).toMatch(/not archived/i);
    // Still open: nothing claimed the archive happened.
    expect(screen.getByRole('dialog', { name: 'Task detail' })).toBeTruthy();
  });

  it('shows a viewer the server’s refusal, in the panel they are looking at', async () => {
    writes = async () => {
      throw new ApiRequestError('Insufficient permissions', 403, { error: 'Insufficient permissions' });
    };
    const detail = await openArchiveConfirm();

    const alert = await within(detail).findByRole('alert');
    expect(alert.textContent).toMatch(/Insufficient permissions/);
  });

  it('refuses a reason over 1000 characters with a sentence that says so, and sends nothing', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: `Open ${TASK.title}` }));
    const detail = await screen.findByRole('dialog', { name: 'Task detail' });
    fireEvent.click(within(detail).getByRole('button', { name: `Archive "${TASK.title}"` }));
    const box = within(detail).getByLabelText(/Reason for archiving/) as HTMLTextAreaElement;
    // The same ceiling as the server (archiveTaskSchema) — typing stops there.
    expect(box.maxLength).toBe(1000);

    // A value set past it (a paste, a programmatic fill) must still be refused.
    fireEvent.change(box, { target: { value: 'x'.repeat(1001) } });
    expect(within(detail).getByText(/at most 1000 characters/)).toBeTruthy();
    const confirm = within(detail).getByRole('button', { name: `Confirm archiving "${TASK.title}"` }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(apiRequest.mock.calls.some(([m]) => m === 'DELETE')).toBe(false);
  });

  it('shows an unrecorded archive as a failure in the server’s words', async () => {
    const message = 'The archive could not be recorded in the audit trail, so nothing was changed. Try again.';
    writes = async () => {
      throw new ApiRequestError(message, 500, { error: 'AUDIT_WRITE_FAILED', message }, 'AUDIT_WRITE_FAILED');
    };
    const detail = await openArchiveConfirm();

    expect((await within(detail).findByRole('alert')).textContent).toContain(message);
  });
});

describe('§11.50 signing — an expired session is not a silent reset', () => {
  it('reports a 401 on the signed completion inside the ceremony', async () => {
    let signed = false;
    writes = async (_m, path) => {
      if (!path.startsWith('/api/tasks/tasks/')) return ok({ success: true });
      if (!signed) {
        signed = true;
        throw new ApiRequestError('Signature required', 428, { code: 'ESIGN_REQUIRED' }, 'ESIGN_REQUIRED');
      }
      return expired();
    };
    // The dialog's own password re-check passes; the session then fails on the PATCH.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) })));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Advance' }));
    const modal = await screen.findByRole('dialog');
    fireEvent.change(within(modal).getByLabelText(/Reason for this action/), { target: { value: 'Reviewed against the criteria.' } });
    fireEvent.change(within(modal).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(modal).getByRole('button', { name: /Sign and commit/ }));

    const alert = await within(modal).findByRole('alert');
    expect(alert.textContent).toMatch(/not signed in/i);
    expect(alert.textContent).toMatch(/not completed/i);
  });

  it('shows the sign-off’s own 401 sentence when the server sent one', async () => {
    // task-signoff answers 401 ESIGN_IDENTITY_REQUIRED when the session carries
    // no verified signer identity — a different fact from an expired session.
    const sentence = 'A verified signer identity is required to sign.';
    let signed = false;
    writes = async (_m, path) => {
      if (!path.startsWith('/api/tasks/tasks/')) return ok({ success: true });
      if (!signed) {
        signed = true;
        throw new ApiRequestError('Signature required', 428, { code: 'ESIGN_REQUIRED' }, 'ESIGN_REQUIRED');
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ success: false, code: 'ESIGN_IDENTITY_REQUIRED', error: sentence }),
      } as Response;
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) })));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Advance' }));
    const modal = await screen.findByRole('dialog');
    fireEvent.change(within(modal).getByLabelText(/Reason for this action/), { target: { value: 'Reviewed against the criteria.' } });
    fireEvent.change(within(modal).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(modal).getByRole('button', { name: /Sign and commit/ }));

    const alert = await within(modal).findByRole('alert');
    expect(alert.textContent).toContain(sentence);
    expect(alert.textContent).toMatch(/not completed/i);
    expect(alert.textContent).not.toMatch(/not signed in any more/i);
  });
});

describe('stale board — a completion someone else already made is not reported as this user\'s', () => {
  it('shows the server\'s CONFLICT_STALE sentence and re-reads the board', async () => {
    // The card still says "review"; the row is already completed. The PATCH is
    // completed → completed, which the server refuses rather than rewriting.
    const message = 'This task is already "completed", so nothing was changed. Reload to see its current state.';
    writes = async () => {
      throw new ApiRequestError(message, 409, { code: 'CONFLICT_STALE', error: message }, 'CONFLICT_STALE');
    };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Advance' }));

    await waitFor(() => expect(document.body.textContent).toContain(message));
    const boardReads = () => apiRequest.mock.calls.filter(([m, p]) => m === 'GET' && p === '/api/task-management/board').length;
    await waitFor(() => expect(boardReads()).toBeGreaterThanOrEqual(2));
    expect(screen.queryByRole('dialog', { name: 'Electronic signature required' })).toBeNull();
  });
});

describe('an unknown outcome — a move whose COMMIT was lost is not reported as failed', () => {
  const unknown = 'Whether this change was saved is unknown. Reload to see the task’s current state before trying again.';
  const lost = () => new ApiRequestError(unknown, 500, { success: false, error: 'OUTCOME_UNKNOWN', message: unknown }, 'OUTCOME_UNKNOWN');
  const boardReads = () => apiRequest.mock.calls.filter(([m, p]) => m === 'GET' && p === '/api/task-management/board').length;

  it('a board move shows the server’s sentence and re-reads the board', async () => {
    writes = async () => {
      throw lost();
    };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Advance' }));

    await waitFor(() => expect(document.body.textContent).toContain(unknown));
    await waitFor(() => expect(boardReads()).toBeGreaterThanOrEqual(2));
  });

  it('a signed completion says it is unknown, not "not completed", and closing the dialog re-reads the board', async () => {
    let signed = false;
    writes = async (_m, path) => {
      if (!path.startsWith('/api/tasks/tasks/')) return ok({ success: true });
      if (!signed) {
        signed = true;
        throw new ApiRequestError('Signature required', 428, { code: 'ESIGN_REQUIRED' }, 'ESIGN_REQUIRED');
      }
      throw lost();
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) })));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Advance' }));
    const modal = await screen.findByRole('dialog');
    fireEvent.change(within(modal).getByLabelText(/Reason for this action/), { target: { value: 'Reviewed against the criteria.' } });
    fireEvent.change(within(modal).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(modal).getByRole('button', { name: /Sign and commit/ }));

    const alert = await within(modal).findByRole('alert');
    expect(alert.textContent).toContain(unknown);
    expect(alert.textContent).not.toMatch(/not completed/i);

    const before = boardReads();
    fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(boardReads()).toBeGreaterThan(before));
  });
});

describe('new task — a refusal is not a "network error"', () => {
  it('shows a viewer’s 403 in the server’s words', async () => {
    writes = async () => {
      throw new ApiRequestError('Insufficient permissions', 403, { error: 'Insufficient permissions' });
    };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /New task/i }));
    const dialog = await screen.findByRole('dialog', { name: /New task/i });
    fireEvent.change(within(dialog).getByLabelText(/^Title/), { target: { value: 'Draft 2.7.3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create task/ }));

    await waitFor(() => expect(dialog.textContent).toMatch(/Insufficient permissions/));
    expect(dialog.textContent).not.toMatch(/Network error/);
  });
});

describe('workflow auto-assign — an assignment that did not happen is not reported as done', () => {
  async function startWorkflow() {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Start workflow/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Start workflow from template' });
    await within(dialog).findByText('Draft');
    fireEvent.change(within(dialog).getByLabelText('Project'), { target: { value: '3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create 1 tasks/ }));
  }

  it('surfaces a 401 on the auto-assign step after the tasks were created', async () => {
    writes = async (_m, path) =>
      path.includes('/auto-assign') ? expired() : ok({ success: true, data: [{ taskId: 'TASK-9' }] });
    await startWorkflow();

    await waitFor(() => expect(document.body.textContent).toMatch(/auto-assign/i));
    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toMatch(/created/i);
    expect(banner.textContent).toMatch(/not assigned|auto-assignment/i);
  });

  it('reports the tasks auto-assign did not assign when it answers 200 with fewer than it was sent', async () => {
    // The route answers 200 with the assignments it made: a task nobody could
    // take, or one archived meanwhile, is simply absent from the count.
    writes = async (_m, path) =>
      path.includes('/auto-assign')
        ? ok({ success: true, data: [{ taskId: 'TASK-9', assignedTo: 'Ana', assigneeId: 9 }], count: 1 })
        : ok({ success: true, data: [{ taskId: 'TASK-9' }, { taskId: 'TASK-10' }] });
    await startWorkflow();

    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toMatch(/1 of 2/);
    expect(banner.textContent).toMatch(/not assigned/i);
  });

  it('keeps a thrown auto-assign refusal visible after the dialog closes', async () => {
    writes = async (_m, path) => {
      if (path.includes('/auto-assign')) {
        throw new ApiRequestError('Insufficient permissions', 403, { error: 'Insufficient permissions' });
      }
      return ok({ success: true, data: [{ taskId: 'TASK-9' }] });
    };
    await startWorkflow();

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Start workflow from template' })).toBeNull(),
    );
    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toMatch(/Insufficient permissions/);
  });
});
