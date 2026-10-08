// @vitest-environment jsdom
/**
 * A review task and its review request say the same thing on the document.
 *
 * Send for review writes two records: the review request the Review board
 * reads (authoring_reviews) and each reviewer's task (unified_tasks). Nothing
 * on the server joins them: the verdict route does not close the task, and
 * completing the task records no verdict. Before 2026-10-08 the document's
 * Tasks rail offered "Complete" on a review task whose verdict was not
 * recorded, so the rail showed a finished review the board still listed as
 * pending.
 *
 * The rail now reads the document's review requests beside its tasks
 * (GET /api/authoring/documents/:id/reviews) and:
 *   · does not offer Complete on a review task while its assignee's review is
 *     pending, says why, and offers the Review board, where the verdict goes;
 *   · offers Complete once the verdict is recorded, and names the verdict;
 *   · says so when a completed review task has no verdict behind it;
 *   · does not offer Complete on a review task when the requests could not be
 *     read, and leaves a task that is not a review task as it was.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { ReviewTasksPanel } from '../editor/ReviewTasksPanel';

const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REVIEWS_URL = `/api/authoring/documents/${DOC}/reviews`;
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

const TASK = {
  id: 1, taskId: 'TASK-11', title: 'Review: Module 2.5 Clinical Overview', status: 'in-progress', priority: 'medium',
  assigneeName: 'OQ Signer', assigneeId: 42, dueDate: null, description: null, taskType: 'review',
  sourceEntityType: 'authoring_document', sourceEntityId: DOC, approvalRequired: false, approvalStatus: null, createdAt: null,
};
const review = (status: string) => ({
  id: 'rev-1', doc_id: DOC, reviewer_id: '42', reviewer_name: 'OQ Signer', reviewer_email: null,
  review_status: status, requested_at: '2026-10-07T09:00:00.000Z', reviewed_at: status === 'pending' ? null : '2026-10-08T08:00:00.000Z',
});

let ledger: Array<Record<string, unknown>> = [];
/** What the mock server answers to the document's review requests; replaced per test. */
let answerReviews: () => Response | Promise<Response>;

beforeEach(() => {
  ledger = [{ ...TASK }];
  answerReviews = () => ok({ success: true, reviews: [review('pending')] });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/tasks/tasks/by-module/Authoring') return ok({ success: true, data: ledger });
    if (method === 'GET' && url === REVIEWS_URL) return answerReviews();
    if (method === 'PATCH') return ok({ success: true, data: ledger[0] });
    return ok({ success: true });
  });
});
afterEach(() => cleanup());

function mount(onOpenBoard = vi.fn()) {
  render(
    <ReviewTasksPanel
      docId={DOC}
      docTitle="Module 2.5 Clinical Overview"
      refreshKey={0}
      onSendForReview={vi.fn()}
      onOpenBoard={onOpenBoard}
      onClose={vi.fn()}
      fireToast={vi.fn()}
    />,
  );
  return { onOpenBoard };
}

const reviewState = async () => screen.findByTestId('rt-review-state');

describe('Review tasks — a review task waits for the verdict on the Review board', () => {
  it('does not offer Complete while the assignee’s review is pending, says why, and offers the Review board', async () => {
    const { onOpenBoard } = mount();
    await screen.findByTestId('rt-row');
    expect(screen.queryByTestId('rt-complete')).toBeNull();
    const note = await reviewState();
    expect(note.getAttribute('data-review')).toBe('pending');
    expect(note.textContent).toContain('Completing this task does not record a verdict.');
    expect(note.textContent).toContain('OQ Signer’s review is pending on the Review board');
    expect(screen.queryByTestId('rt-complete')).toBeNull();
    fireEvent.click(within(note).getByRole('button', { name: 'Open the Review board' }));
    expect(onOpenBoard).toHaveBeenCalledOnce();
  });

  it('offers Complete once the verdict is recorded, and names it', async () => {
    answerReviews = () => ok({ success: true, reviews: [review('changes_requested')] });
    mount();
    const note = await reviewState();
    expect(note.textContent).toContain('Verdict recorded on the Review board: Changes requested.');
    expect(screen.getByTestId('rt-complete')).toBeTruthy();
  });

  it('a completed review task whose review is still pending says no verdict is recorded', async () => {
    ledger = [{ ...TASK, status: 'completed' }];
    mount();
    const note = await reviewState();
    expect(note.textContent).toContain('This task is completed, but no verdict is recorded');
    expect(note.textContent).toContain('still pending on the Review board');
  });
});

describe('Review tasks — review requests that could not be read', () => {
  it.each([
    ['a refused read', () => { throw new ApiRequestError('Failed to load reviews', 500); }],
    ['an answer with no rows', () => ok({ success: true })],
    ['rows of another document', () => ok({ success: true, reviews: [{ ...review('pending'), doc_id: 'other' }] })],
  ])('after %s, a review task is not offered for completion, and a task that is not a review task is', async (_label, answer) => {
    answerReviews = answer;
    ledger = [{ ...TASK }, { ...TASK, taskId: 'TASK-12', title: 'Fix the reference list', taskType: 'general' }];
    mount();
    const first = (await screen.findAllByTestId('rt-row'))[0];
    expect(within(first).queryByTestId('rt-complete')).toBeNull();
    const note = await reviewState();
    expect(note.getAttribute('data-review')).toBe('unread');
    expect(note.textContent).toContain('could not be read, so this review task is not offered for completion');
    const rows = screen.getAllByTestId('rt-row');
    expect(within(rows[0]).queryByTestId('rt-complete')).toBeNull();
    expect(within(rows[1]).getByTestId('rt-complete')).toBeTruthy();
  });

  it('Refresh reads the review requests again with the tasks', async () => {
    mount();
    await reviewState();
    const reads = () => apiRequest.mock.calls.filter(c => c[0] === 'GET' && c[1] === REVIEWS_URL).length;
    const before = reads();
    answerReviews = () => ok({ success: true, reviews: [review('approved')] });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
    await waitFor(() => expect(screen.getByTestId('rt-review-state').textContent).toContain('Verdict recorded on the Review board: Approved.'));
    expect(screen.getByTestId('rt-complete')).toBeTruthy();
  });
});
