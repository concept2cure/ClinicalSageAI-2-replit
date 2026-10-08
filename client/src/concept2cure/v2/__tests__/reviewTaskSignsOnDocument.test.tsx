// @vitest-environment jsdom
/**
 * A review task that needs a signature is signed on the document
 * (docs/design/ONE_ANA_ONE_CANVAS.md §4.7, slice 19).
 *
 * Completing an approval-gated task answers 428 ESIGN_REQUIRED. The document's
 * Tasks rail used to tell the signer the ceremony "runs on the Task board" and
 * offer to go there, away from the document. It now opens the product's one
 * signing dialog in place (TaskSignOffDialog over the shared EsignModal) and
 * sends the same transition again with the signature, which the server
 * re-verifies (task-signoff.ts → part11/reverify-signer.ts).
 *
 * The confirmation shows the manifestation the server recorded (the last
 * approval-history entry of the returned task): its printed name and its time,
 * never the browser's clock or the client's idea of who signed. A success that
 * does not carry one is not shown as a signature.
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

import { ApiRequestError } from '@/lib/queryClient';
import { ReviewTasksPanel } from '../editor/ReviewTasksPanel';

const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REASON = 'Reviewed against the acceptance criteria.';
const GATED = {
  id: 1, taskId: 'TASK-9', title: 'Review: Module 2.5 Clinical Overview', status: 'in-progress', priority: 'high',
  assigneeName: 'OQ Signer', assigneeId: 42, dueDate: null, description: null,
  sourceEntityType: 'authoring_document', sourceEntityId: DOC, approvalRequired: true, approvalStatus: null, createdAt: null,
};
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

const RECORDED = { signedById: 42, signedByName: 'Olivia Q. Signer', meaning: 'APPROVED', reason: REASON, signedAt: '2026-10-08T09:15:00.000Z', method: 'password' };

let patches: Array<Record<string, unknown>> = [];
let ledger: Array<Record<string, unknown>> = [];
/** The approval history the signed PATCH answers with; replaced per test. */
let history: unknown;

beforeEach(() => {
  patches = [];
  ledger = [{ ...GATED }];
  history = [RECORDED];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'GET' && url === '/api/tasks/tasks/by-module/Authoring') return ok({ success: true, data: ledger });
    if (method === 'PATCH' && url === '/api/tasks/tasks/TASK-9') {
      patches.push(body ?? {});
      if (!body?.signature) {
        throw new ApiRequestError('Completing this task requires an electronic signature.', 428, { code: 'ESIGN_REQUIRED' }, 'ESIGN_REQUIRED');
      }
      ledger = [{ ...GATED, status: 'completed', approvalStatus: 'approved', approvalHistory: history }];
      return ok({ success: true, data: ledger[0] });
    }
    if (method === 'GET' && url === `/api/authoring/documents/${DOC}/reviews`) return ok({ success: true, reviews: [] });
    return ok({ success: true });
  });
  // The dialog re-authenticates through /api/esignature/verify-password.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(onNav = vi.fn(), fireToast = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  /* onNav is passed as the panel's earlier contract took it, so a panel that
     still sends the signer to the Task board is caught doing so. */
  const panelProps = {
    docId: DOC, docTitle: 'Module 2.5 Clinical Overview', refreshKey: 0,
    onSendForReview: vi.fn(), onAssign: vi.fn(), onNav, onClose: vi.fn(), fireToast,
    signer: { name: 'OQ Signer', email: 'oq@test.co' },
  } as unknown as React.ComponentProps<typeof ReviewTasksPanel>;
  render(
    <QueryClientProvider client={client}>
      <ReviewTasksPanel {...panelProps} />
    </QueryClientProvider>,
  );
  return { onNav, fireToast };
}

describe('Review tasks — an approval-gated completion is signed on the document', () => {
  it('opens the shared signing dialog in place and sends the signed transition, never sending the signer to the Task board', async () => {
    const { onNav, fireToast } = mount();
    fireEvent.click(await screen.findByTestId('rt-complete'));

    const dialog = await screen.findByRole('dialog');
    expect(patches).toEqual([{ status: 'completed', progress: 100 }]);
    expect(dialog.textContent).toContain('Electronic signature');
    expect(dialog.textContent).toContain('Review: Module 2.5 Clinical Overview');
    expect(screen.queryByRole('button', { name: 'Open Task board' })).toBeNull();

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
    expect(onNav).not.toHaveBeenCalledWith('task-board');

    // Closing the confirmed dialog re-reads the ledger and says what happened.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fireToast).toHaveBeenCalledWith('Review task completed with your electronic signature, recorded on the task ledger.');
    expect(await screen.findByText('Completed')).toBeTruthy();
  });

  it('the confirmation shows the signature the server recorded: its printed name and its time', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('rt-complete'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));

    expect(await within(dialog).findByText('Signature applied')).toBeTruthy();
    const manifest = dialog.querySelector('.es-manifest') as HTMLElement;
    // The server's printed name, not the signed-in user the dialog was handed.
    expect(manifest.textContent).toContain('Olivia Q. Signer');
    expect(manifest.textContent).not.toContain('oq@test.co');
    // The server's time, not the browser's clock.
    expect(manifest.querySelector('time')?.getAttribute('datetime')).toBe(RECORDED.signedAt);
  });

  it('a success that does not carry the recorded signature is not shown as one, and closing re-reads the task', async () => {
    history = null;
    const { fireToast } = mount();
    fireEvent.click(await screen.findByTestId('rt-complete'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));

    await waitFor(() => expect(dialog.textContent).toContain('did not carry the signature the server recorded'));
    expect(within(dialog).queryByText('Signature applied')).toBeNull();
    const reads = () => apiRequest.mock.calls.filter(c => c[0] === 'GET' && c[1] === '/api/tasks/tasks/by-module/Authoring').length;
    const before = reads();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fireToast).toHaveBeenCalledWith('Whether the signature was recorded is unknown. Re-reading the task list.', 'error');
    expect(fireToast).not.toHaveBeenCalledWith('Review task completed with your electronic signature, recorded on the task ledger.');
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });

  it('closing the dialog without signing changes nothing and claims nothing', async () => {
    const { fireToast } = mount();
    fireEvent.click(await screen.findByTestId('rt-complete'));
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(patches).toHaveLength(1);
    expect(fireToast).not.toHaveBeenCalled();
    expect(screen.getByText('In progress')).toBeTruthy();
  });
});
