// @vitest-environment jsdom
/**
 * TaskBoard — completing an approval-gated task is an electronic signature,
 * taken in the product's one signing dialog (the shared EsignModal).
 *
 * The board used to open a bespoke dialog asking for a separate "signing PIN"
 * (VSR-001 §13.3 item 3). The server now re-verifies the account password,
 * and the authenticator code when one is enrolled (task-signoff.ts through
 * part11/reverify-signer.ts), so this drives the real dialog from the board's
 * own Advance button to the PATCH it sends: nothing is sent until the signer
 * has re-authenticated, and what is sent is the password and meaning, never a
 * PIN.
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

const GATED = {
  taskId: 't-9', title: 'Approve the CSR synopsis', project: '', moduleType: 'clinical', taskType: 'review',
  status: 'review', priority: 'high', assignee: 'u-1', assignedBy: 'u-1', progress: 90, impactScore: null,
  due: null, criticalPath: false, blocked: false, blockedReason: null, dependsOn: [], approvalHistory: [], blocks: [],
  approvalRequired: true, approvalStatus: 'pending', createdAt: '2026-08-01T00:00:00Z',
};
const REASON = 'Reviewed against the acceptance criteria.';

let patches: unknown[] = [];

beforeEach(() => {
  patches = [];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, rawPath: unknown, body?: unknown) => {
    const path = String(rawPath ?? '');
    if (method === 'PATCH' && path === '/api/tasks/tasks/t-9') {
      patches.push(body);
      const signature = (body as { signature?: unknown }).signature;
      if (!signature) {
        throw new ApiRequestError('Completing this task requires an electronic signature.', 428, {
          code: 'ESIGN_REQUIRED',
          error: 'Completing this task requires an electronic signature.',
        }, 'ESIGN_REQUIRED');
      }
      return { ok: true, status: 200, json: async () => ({ success: true }) } as Response;
    }
    const data = path === '/api/task-management/board' ? [GATED] : [];
    return { ok: true, status: 200, json: async () => ({ data }) } as Response;
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TaskBoard {...({ onAsk: () => {} } as unknown as React.ComponentProps<typeof TaskBoard>)} />
    </QueryClientProvider>,
  );
}

describe('TaskBoard — approval-gated completion', () => {
  it('opens the shared signing dialog, and sends the password and meaning, never a PIN', async () => {
    mount();
    await screen.findByText('Approve the CSR synopsis');
    fireEvent.click(screen.getByRole('button', { name: 'Advance' }));

    const dialog = await screen.findByRole('dialog');
    expect(patches).toHaveLength(1); // the unsigned attempt the server answered 428
    expect(within(dialog).queryByLabelText(/PIN/i)).toBeNull();
    const offered = within(dialog).getAllByRole('radio').map((r) => (r.textContent ?? '').replace(/You .*/, '').trim());
    expect(offered).toEqual(['Authorship', 'Review', 'Approval', 'Responsibility']);

    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));

    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1]).toEqual({
      status: 'completed',
      progress: 100,
      reason: REASON,
      signature: { password: 'correct horse', meaning: 'APPROVED' },
    });
  });
});
