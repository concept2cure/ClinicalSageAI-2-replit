// @vitest-environment jsdom
/**
 * The Task board signs an approval-gated completion with the product's one
 * task sign-off, editor/TaskSignOffDialog.tsx (wave 2D; outside-file request B
 * of wave 2C).
 *
 * Until 2026-10-08 the board held its own copy of that ceremony, a private
 * `ESignTaskModal`, while the document's Tasks rail mounted the shared one. The
 * two had already drifted: the board's confirmation showed a manifestation the
 * client made up (the signed-in user as the board held it, and the browser's
 * clock), where the shared dialog shows the one the server recorded, the last
 * approval-history entry the PATCH returns, and shows no signature at all when
 * the response carries none. taskBoardSignature.test.tsx keeps pinning what the
 * board sends; this pins what it then claims.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
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
const RECORDED = { signedById: 1, signedByName: 'Olivia Q. Signer', meaning: 'APPROVED', reason: REASON, signedAt: '2026-10-08T09:15:00.000Z', method: 'password' };

/** What the signed PATCH answers with: the task, carrying the recorded signature or not. */
let history: unknown[] | null = [RECORDED];

beforeEach(() => {
  history = [RECORDED];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, rawPath: unknown, body?: unknown) => {
    const p = String(rawPath ?? '');
    if (method === 'PATCH' && p === '/api/tasks/tasks/t-9') {
      if (!(body as { signature?: unknown }).signature) {
        throw new ApiRequestError('Completing this task requires an electronic signature.', 428, {
          code: 'ESIGN_REQUIRED',
          error: 'Completing this task requires an electronic signature.',
        }, 'ESIGN_REQUIRED');
      }
      const data = { taskId: 't-9', status: 'completed', approvalStatus: 'approved', ...(history ? { approvalHistory: history } : {}) };
      return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response;
    }
    const data = p === '/api/task-management/board' ? [GATED] : [];
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

async function sign() {
  mount();
  await screen.findByText('Approve the CSR synopsis');
  fireEvent.click(screen.getByRole('button', { name: 'Advance' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
  return dialog;
}

const boardReads = () => apiRequest.mock.calls.filter(c => c[0] === 'GET' && c[1] === '/api/task-management/board').length;

describe('TaskBoard — the gated completion is signed in the shared task sign-off', () => {
  it('the confirmation shows the signature the server recorded: its printed name and its time', async () => {
    const dialog = await sign();

    expect(await within(dialog).findByText('Signature applied')).toBeTruthy();
    const manifest = dialog.querySelector('.es-manifest') as HTMLElement;
    // The server's printed name, not the signed-in user the board holds.
    expect(manifest.textContent).toContain('Olivia Q. Signer');
    expect(manifest.textContent).not.toContain('Tester');
    // The server's time, not the browser's clock.
    expect(manifest.querySelector('time')?.getAttribute('datetime')).toBe(RECORDED.signedAt);
  });

  it('a success that does not carry the recorded signature is not shown as one, and closing re-reads the board', async () => {
    history = null;
    const dialog = await sign();

    await waitFor(() => expect(dialog.textContent).toContain('did not carry the signature the server recorded'));
    expect(within(dialog).queryByText('Signature applied')).toBeNull();
    const before = boardReads();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(boardReads()).toBeGreaterThan(before));
  });

  it('the board holds no ceremony of its own: one task sign-off, imported from the editor', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../surfaces/TaskBoard.tsx'), 'utf8');
    expect(src).toMatch(/import \{ TaskSignOffDialog \} from '\.\.\/editor\/TaskSignOffDialog';/);
    expect(src).not.toMatch(/function ESignTaskModal|TASK_MEANINGS|<EsignModal\b/);
  });
});
