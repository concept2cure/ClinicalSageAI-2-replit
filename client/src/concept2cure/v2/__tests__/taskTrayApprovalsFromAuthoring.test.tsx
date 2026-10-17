// @vitest-environment jsdom
/**
 * The tray's "Approvals — you sign" group reads the approval store the launch
 * workflow writes.
 *
 * It read GET /api/approval-workflows/pending, which answers from
 * document_workflows / workflow_approvals joined to unified_documents. Nothing
 * at launch writes those tables (AnA Command, their last writer, was removed
 * 2026-10-08), so the group was empty for every signer. The approval chain a
 * launch document actually runs is authoring_workflow_steps (POST
 * /api/authoring/docs/:id/submit, advanced by the §11.50 signature), which the
 * Review surface reads through GET /api/review/board. The tray now lists that
 * board's rows at the caller's sign-off (document store consolidation step 7).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { TaskTray } from '../TaskTray';

const res = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload });
const MY_WORK = { success: true, data: { items: [], total: 0, overdue: 0, dueSoon: 0, blocked: 0, approvalsPending: 0 } };

const SIGN_OFF = {
  id: 'doc-a', doc: 'Clinical Overview 2.5', prog: 'BX-301', programId: null, atMySignOff: true,
  awaitingMyReview: false, role: 'APPROVER sign-off', esig: 'pending',
};
const REVIEW_ONLY = {
  id: 'doc-b', doc: 'Nonclinical Overview 2.4', prog: 'BX-301', programId: null, atMySignOff: false,
  awaitingMyReview: true, role: 'Reviewer', esig: 'none',
};

function serve(board: { payload: unknown; status?: number }) {
  apiRequest.mockImplementation(async (_method: string, raw: string) => {
    const url = String(raw ?? '');
    if (url.startsWith('/api/review/board')) return res(board.payload, board.status ?? 200);
    if (url.startsWith('/api/mdx/notifications/unread-count')) return res({ data: { unread: 0 } });
    if (url.startsWith('/api/mdx/notifications')) return res({ data: [], meta: { count: 0 } });
    if (url === '/api/task-management/my-work') return res(MY_WORK);
    if (url === '/api/concept2cure/reviews/my-queue') {
      return res({ data: { threads: [], tasks: [], totalThreads: 0, totalTasks: 0, unreadNotifications: 0, overdueTasks: 0 } });
    }
    if (url === '/api/approval-workflows/pending') {
      return res({ data: { approvals: [{ workflowId: 'w1', documentTitle: 'UNIFIED STORE ROW' }] } });
    }
    return res({ data: null });
  });
}

async function openTray(onNav = vi.fn()) {
  render(<TaskTray onNav={onNav} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Your work/ }));
  });
  await waitFor(() => expect(screen.getByRole('dialog', { name: 'Your work' })).toBeTruthy());
  return onNav;
}

const approvalsGroup = () => (screen.queryByText('Approvals — you sign')?.closest('.tt-group') ?? null) as HTMLElement | null;

afterEach(() => cleanup());
beforeEach(() => apiRequest.mockReset());

describe('TaskTray — approvals come from the authoring approval chain', () => {
  it('lists the documents at my sign-off from the review board, and nothing from the unified store', async () => {
    serve({ payload: { success: true, data: { queue: [SIGN_OFF, REVIEW_ONLY], workflows: {}, thread: [], meta: {} } } });
    const onNav = await openTray();
    await waitFor(() => expect(approvalsGroup()?.textContent ?? '').toContain('Clinical Overview 2.5'));
    const text = approvalsGroup()!.textContent ?? '';
    expect(text).toContain('APPROVER sign-off');
    expect(text).not.toContain('Nonclinical Overview 2.4');
    expect(document.body.textContent).not.toContain('UNIFIED STORE ROW');
    const urls = apiRequest.mock.calls.map((c) => String(c[1]));
    expect(urls.some((u) => u.startsWith('/api/review/board?scope=mine'))).toBe(true);
    expect(urls).not.toContain('/api/approval-workflows/pending');
    fireEvent.click(screen.getByText('Clinical Overview 2.5'));
    expect(onNav).toHaveBeenCalledWith('review');
  });

  it('a failed board read says the approvals could not be loaded', async () => {
    serve({ payload: { success: false, error: 'boom' }, status: 500 });
    await openTray();
    await waitFor(() => expect(approvalsGroup()?.querySelector('[role="alert"]')).toBeTruthy());
    expect(approvalsGroup()!.textContent).toMatch(/Couldn't load your approvals/);
  });

  it('no sign-off waiting renders no approvals group', async () => {
    serve({ payload: { success: true, data: { queue: [REVIEW_ONLY], workflows: {}, thread: [], meta: {} } } });
    await openTray();
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => String(c[1]).startsWith('/api/review/board'))).toBe(true));
    await waitFor(() => expect(screen.getByText(/No unread messages or alerts/)).toBeTruthy());
    expect(approvalsGroup()).toBeNull();
  });
});
