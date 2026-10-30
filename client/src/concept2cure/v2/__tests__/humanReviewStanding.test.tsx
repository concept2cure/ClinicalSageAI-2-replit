// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest,
}));

import { reviewStanding } from '../surfaces/reviewStanding';
import { ReviewTasksPanel, standingReviewsOf } from '../editor/ReviewTasksPanel';
import { confirmedReviews, sentToast } from '../editor/SendForReviewDialog';
import { taskReviewState, reviewStateNote, reviewStandingOf } from '../editor/reviewTaskState';

const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;
const task = (docId = DOC) => ({
  taskId: `TASK-${docId}`, title: docId === DOC ? 'Old document task' : 'New document task',
  status: 'in-progress', assigneeId: 42, taskType: 'review',
  sourceEntityType: 'authoring_document', sourceEntityId: docId,
});
const review = (standing?: string) => ({
  id: 'review-1', doc_id: DOC, reviewer_id: '42', reviewer_name: 'Dana',
  review_status: 'approved', review_comments: 'The saved claims are supported.',
  requested_at: '2026-10-13T10:00:00Z', reviewed_at: '2026-10-13T11:00:00Z',
  ...(standing ? { standing } : {}),
});
const props = (docId = DOC) => ({
  docId, docTitle: 'Clinical overview', refreshKey: 0, onSendForReview: vi.fn(),
  onClose: vi.fn(), fireToast: vi.fn(), onOpenBoard: vi.fn(),
});

beforeEach(() => { apiRequest.mockReset(); });
afterEach(cleanup);

describe('Human review standing keeps saved-content history honest', () => {
  it.each(['stale', 'unbound', undefined])('a %s approval is not current peer approval', standing => {
    const item = { docStatus: 'IN_REVIEW', state: 'approved', reviews: [{ status: 'approved', standing }] };
    expect(reviewStanding(item)).toMatchObject({ group: 'in-review', words: 'Current review needed' });
  });

  it('only verified current approvals can await sign-off', () => {
    const item = { docStatus: 'IN_REVIEW', state: 'approved', reviews: [{ status: 'approved', standing: 'current' }] };
    expect(reviewStanding(item)).toMatchObject({ group: 'sign-off' });
    expect(reviewStanding({ ...item, reviews: [] })).toMatchObject({ group: 'in-review' });
  });

  it('a legacy verdict stays a recorded fact with its reason, and has no current binding', () => {
    expect(standingReviewsOf({ success: true, reviews: [review()] }, DOC)).toMatchObject([
      { status: 'approved', standing: 'unbound', comments: 'The saved claims are supported.' },
    ]);
  });

  it('unknown standing cannot make a verdict current, while a pending request stays pending', () => {
    expect(reviewStandingOf('approved', 'future-value')).toBe('unbound');
    expect(reviewStandingOf('unknown-status', 'current')).toBe('unbound');
    expect(reviewStandingOf('pending', 'stale')).toBe('pending');
  });

  it('a closed earlier-round task keeps its history while the later verdict is stale', () => {
    const rows = standingReviewsOf({ success: true, reviews: [review('stale')] }, DOC) ?? [];
    const closedTask = {
      ...task(), status: 'completed', createdAt: '2026-10-12T10:00:00Z',
      priority: null, assigneeName: 'Dana', dueDate: null, description: null,
      approvalRequired: false, approvalStatus: null, reviewRouteId: null,
    };
    const state = taskReviewState(closedTask, { state: 'ready', rows });
    expect(state.kind).toBe('earlier');
    const note = reviewStateNote(closedTask, state);
    expect(note).toContain('This task belongs to an earlier review request.');
    expect(note).toContain('Approved. The saved document has changed');
    expect(note).toContain('Recorded reason: The saved claims are supported.');
  });

  it.each(['stale', 'unbound', undefined])('the rail preserves a %s verdict without offering Complete', async standing => {
    apiRequest.mockImplementation(async (_method: string, url: string) => url.includes('/reviews')
      ? ok({ success: true, reviews: [review(standing)] }) : ok({ success: true, data: [task()] }));
    render(<ReviewTasksPanel {...props()} />);
    const note = await screen.findByTestId('rt-review-state');
    expect(note.textContent).toContain('Earlier verdict recorded on the Review board: Approved.');
    expect(note.textContent).toContain('The saved claims are supported.');
    expect(note.textContent).toContain(standing === 'stale' ? 'The saved document has changed' : 'Its saved-content binding is unavailable');
    expect(screen.queryByTestId('rt-complete')).toBeNull();
  });

  it('a request receipt does not call a legacy approval current or say it stands', () => {
    const receipts = confirmedReviews({ success: true, reviews: [review()] }, DOC, ['42']);
    expect(receipts).not.toBeNull();
    const toast = sentToast({ reviews: receipts ?? [], tasks: [] });
    expect(toast).toContain('Earlier verdict retained: Dana (Approved; saved-content binding unavailable).');
    expect(toast).not.toContain('verdict stands');
  });
});

describe('Document task reads retire the previous target', () => {
  it('a late A task response cannot replace the completed B read', async () => {
    let finishOld: (response: Response) => void = () => undefined;
    const oldRead = new Promise<Response>(resolve => { finishOld = resolve; });
    let taskReads = 0;
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url.includes('/reviews')) return ok({ success: true, reviews: [] });
      // RR5: the panel also reads the document's review route; it is not a task read.
      if (url.includes('/review-route')) return ok({ success: true, round: null });
      taskReads++;
      return taskReads === 1 ? oldRead : ok({ success: true, data: [task(OTHER_DOC)] });
    });
    const view = render(<ReviewTasksPanel {...props()} />);
    await waitFor(() => expect(taskReads).toBe(1));
    view.rerender(<ReviewTasksPanel {...props(OTHER_DOC)} />);
    await screen.findByText('New document task');
    await act(async () => { finishOld(ok({ success: true, data: [task()] })); });
    await waitFor(() => expect(screen.queryByText('Old document task')).toBeNull());
    expect(screen.getByText('New document task')).toBeTruthy();
  });
});
