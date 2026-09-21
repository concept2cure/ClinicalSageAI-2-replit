// @vitest-environment jsdom
/**
 * The review board may not report a clear review queue it has not read.
 *
 * ── The finding ────────────────────────────────────────────────────────────────
 * The AnswerLead — the first and largest sentence on the review surface — used
 * to say "Nothing is blocked on your signature" whenever it could not find a
 * sign-off step, which is also what it found when the board had failed to load
 * or a refresh had returned nothing. A regulatory director was told nothing
 * needed them by a screen that had just failed to read the queue.
 *
 * ── What the board now speaks from ───────────────────────────────────────────
 * Ownership is decided SERVER-SIDE per row, from the authoring review store:
 *   awaitingMyReview  — a review request (authoring_reviews) pending for me
 *   atMySignOff       — the current approval step (authoring_workflow_steps)
 *                       names me; signing happens in the authoring workspace
 * Clearance is the claim "nothing in this queue is waiting on you", and it is
 * only spoken over a board that came back with a queue array. The states these
 * cases separate:
 *   read failed under a stale queue        → UNREADABLE
 *   settled read with no board             → not "nothing is in review"
 *   queue read, nothing waiting on me      → CLEAR — still reachable
 *   queue read, something waiting on me    → the urgent branch, named
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() =>
  vi.fn(async (..._a: unknown[]): Promise<any> => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: null }),
  })),
);
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Review } from '../surfaces/Review';

const DOC = '3f2c1a10-0000-4000-8000-000000000077';
const SECTION = '3f2c1a10-0000-4000-8000-000000000102';

const ROW = {
  id: DOC, doc: 'Module 2.5 Clinical Overview', prog: 'C2C-101', programId: 'p-1', pid: DOC, module: 'M2',
  docStatus: 'IN_REVIEW', state: 'in-review',
  reviews: [{ id: 'r-1', reviewerId: '9', reviewer: 'Dana Reyes', reviewerEmail: 'dana@x.example', status: 'pending', comments: null, requestedBy: 'author@x.example', requestedAt: '2026-09-20T10:00:00Z', reviewedAt: null }],
  myReviewId: null, myReviewStatus: null, awaitingMyReview: false, requestedByMe: false, atMySignOff: false, mine: false,
  reviewer: 'Dana Reyes', role: 'Reviewer', due: '', tone: '', comments: 0, esig: 'none', conf: null, prov: null,
  passage: 'The overview summarises the dose rationale for the pivotal study.', firstSectionId: SECTION, requestedAt: '2026-09-20T10:00:00Z',
};

const WF = {
  [DOC]: {
    templateId: 'wf-1', template: 'Authoring approval workflow',
    steps: [{ id: 's-1', order: 1, name: 'QA', approverType: 'user', approver: 'dana@x.example', requiredActions: ['sign'], status: 'current', at: null }],
  },
};

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const boom = (status = 503) => ({ ok: false, status, json: async () => ({ error: 'UNAVAILABLE' }) });
const THREADS_PANE = ok({ threads: [], tasks: [], totalThreads: 0, totalTasks: 0 });

/** Route the mock by URL; board reads are consumed one at a time so a later
 *  refresh can fail while the first read succeeded. The last entry repeats. */
function serve(boards: any[]) {
  let n = 0;
  apiRequest.mockImplementation(async (..._a: unknown[]) => {
    const url = String(_a[1]);
    if (url.includes('/api/review/board')) {
      const r = boards[Math.min(n, boards.length - 1)];
      n += 1;
      return r;
    }
    if (url.includes('/reviews/my-queue')) return THREADS_PANE;
    return ok({ success: true });
  });
}

const mount = () =>
  render(<Review {...({ surface: { id: 'review' }, onAsk: vi.fn(), onNav: vi.fn() } as any)} />);

const text = () => document.body.textContent ?? '';
const CLEAR = /Nothing is waiting on you/i;

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('Review — a queue that was not read is not a clear queue', () => {
  it('does not report a clear queue when a refresh fails under a stale queue', async () => {
    serve([ok({ queue: [ROW], workflows: WF, thread: [] }), boom()]);
    mount();
    await waitFor(() => expect(CLEAR.test(text())).toBe(true));

    fireEvent.change(screen.getByPlaceholderText(/Add a comment/i), {
      target: { value: 'Please confirm the dose rationale.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Comment/i }));

    await waitFor(() => expect(/could not be re-read/i.test(text())).toBe(true));
    expect(CLEAR.test(text()), 'a failed re-read must not keep the clear claim up').toBe(false);
    expect(/one informed click/i.test(text()), 'must not reassure over an unread queue').toBe(false);
    // The rows that were read stay on screen; the claim about them is withdrawn.
    expect(screen.getAllByText(ROW.doc).length).toBeGreaterThan(0);
  });

  it('does not say nothing is in review when the response carried no board', async () => {
    serve([ok(null)]);
    mount();
    await waitFor(() => expect(/did not load/i.test(text())).toBe(true));
    expect(/Nothing is in review/i.test(text()), 'must not state an unread queue is empty').toBe(false);
  });

  /* ── OVER-CORRECTION GUARD ── a reviewer with a genuinely clear queue must be
     told so, and the urgent branch must still be reachable. */
  it('still reports a clear queue when the rows were read and none is waiting on the caller', async () => {
    serve([ok({ queue: [ROW], workflows: WF, thread: [] })]);
    mount();
    await waitFor(() => expect(screen.getAllByText(ROW.doc).length).toBeGreaterThan(0));
    expect(CLEAR.test(text()), 'clearance must stay reachable when it is earned').toBe(true);
    expect(/1 document still moving through review/i.test(text())).toBe(true);
    expect(/0 open/.test(text())).toBe(true);
    expect(/one informed click/i.test(text()), 'an earned answer may reassure').toBe(true);
  });

  it('names a document awaiting my review, and one at my sign-off step, and says nothing is in review when nothing is', async () => {
    serve([ok({ queue: [{ ...ROW, awaitingMyReview: true, mine: true }], workflows: WF, thread: [] })]);
    let view = mount();
    await waitFor(() => expect(/awaits your review/i.test(text())).toBe(true));
    expect(CLEAR.test(text())).toBe(false);
    view.unmount();

    serve([ok({ queue: [{ ...ROW, atMySignOff: true, mine: true }], workflows: WF, thread: [] })]);
    view = mount();
    await waitFor(() => expect(/at your sign-off step/i.test(text())).toBe(true));
    expect(/authoring workspace/i.test(text()), 'signing is named as happening in the authoring workspace').toBe(true);
    expect(CLEAR.test(text())).toBe(false);
    view.unmount();

    serve([ok({ queue: [], workflows: {}, thread: [] })]);
    mount();
    await waitFor(() => expect(/Nothing is in review/i.test(text())).toBe(true));
  });

  it("a review or sign-off the caller does not own is not reported as 'yours'", async () => {
    serve([ok({ queue: [{ ...ROW, mine: false }], workflows: WF, thread: [] })]);
    mount();
    await waitFor(() => expect(CLEAR.test(text())).toBe(true));
    expect(/awaits your review|at your sign-off step/i.test(text())).toBe(false);
  });
});
