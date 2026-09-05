// @vitest-environment jsdom
/**
 * The review board may not report a clear approval queue it has not read.
 *
 * ── The finding ────────────────────────────────────────────────────────────────
 * The AnswerLead — the first and largest sentence on the review surface — was a
 * two-branch conditional on `signSteps.length`, and the zero branch said:
 *
 *   "Nothing is blocked on your signature — N documents still moving through
 *    review."
 *
 * `signSteps` is filtered out of `workflows`, which is `board?.workflows ?? {}`.
 * That object is `{}` in states that are not "nothing is waiting on you":
 *
 *   · a refresh after a write is IN FLIGHT (the loading guard on this surface
 *     only fires while the queue is empty, so a seeded queue keeps rendering);
 *   · a refresh FAILED — `useLiveData` sets `data: null`, the stale queue stays
 *     on screen, and the approval chain silently disappears with it;
 *   · the board returned rows but no approval steps, so nothing was evaluated.
 *
 * In each of them a regulatory director was told that no document needed their
 * signature by a screen that had just failed to read the approval chain.
 *
 * The same emptiness carried two smaller claims: the empty-queue panel said
 * "Nothing is in review" over a response that carried no board at all, and the
 * Comments heading said "0 open" over a thread that had never been read.
 *
 * ── The evidence clearance is now gated on ───────────────────────────────────
 * Not `signSteps.length === 0` — that is the defect. The board returns each
 * queue row's approval steps, so the number of rows that came back WITH steps
 * is positive evidence that the sign-off question was evaluated at all. Zero
 * such rows means unread, which is `not-assessed`, and the copy says so.
 *
 * The states these cases separate:
 *   workflows: {}                       → NOT ASSESSED  (chain never read)
 *   read failed / in flight             → UNREADABLE / LOADING
 *   steps read, none require a signature → CLEAR — still reachable, case 4
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/* Loosely typed on purpose: individual cases swap in refusals with different
   body shapes, and a narrow inferred signature makes each of those a type error
   rather than a test. */
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

/* ── Fixtures: complete rows, because the surface renders them ── */

const ROW = {
  id: 'wf-1',
  doc: 'Module 2.5 Clinical Overview',
  prog: 'C2C-101',
  pid: '77',
  secKey: '2.5',
  reviewer: 'Dana Reyes',
  role: 'Medical writer',
  due: 'Fri',
  tone: 'idle',
  state: 'in-review',
  comments: 0,
  esig: 'not-required',
  conf: null,
  prov: null,
  passage: 'The overview summarises the dose rationale for the pivotal study.',
};

const step = (requiredActions: string[]) => ({
  templateId: 'TPL-2',
  template: 'Two-step medical review',
  steps: [
    {
      id: 1,
      order: 1,
      name: 'Medical review',
      approverType: 'user',
      approver: 'Dana Reyes',
      requiredActions,
      status: 'current',
      at: null,
    },
  ],
});

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const boom = (status = 503) => ({ ok: false, status, json: async () => ({ error: 'UNAVAILABLE' }) });

const THREADS_PANE = ok({ threads: [], tasks: [], totalThreads: 0, totalTasks: 0 });

/**
 * Route the mock by URL. `boards` is consumed one board read at a time so a
 * case can make the FIRST read succeed and a later refresh fail — the state
 * that put reassuring copy over a stale queue. The last entry repeats.
 */
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
    return ok(null);
  });
}

const mount = () =>
  render(<Review {...({ surface: { id: 'review' }, onAsk: vi.fn(), onNav: vi.fn() } as any)} />);

const text = () => document.body.textContent ?? '';
const CLEAR = /Nothing is blocked on your signature/i;

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('Review — a queue whose approval chain was not read is not a clear queue', () => {
  it('does not report a clear signature queue when no approval steps came back', async () => {
    // The board loads, with rows, and with no workflows at all — nothing has
    // evaluated whether any of these documents is at a sign-off step.
    serve([ok({ queue: [ROW], workflows: {}, thread: [] })]);
    mount();

    await waitFor(() => expect(screen.getAllByText(ROW.doc).length).toBeGreaterThan(0));

    expect(CLEAR.test(text()), 'must not claim nothing is blocked on the signature').toBe(false);
    expect(/cannot say whether one is waiting on your sign-off/i.test(text())).toBe(true);
    // Reassurance is the one thing an unanswered read may never carry.
    expect(/one informed click/i.test(text()), 'must not reassure over an unread chain').toBe(false);
  });

  it('does not report a clear signature queue when a refresh fails under a stale queue', async () => {
    // Read 1 succeeds and is genuinely clear; the re-read after the comment
    // write fails, which drops `workflows` to {} while the queue stays on
    // screen — the exact state that used to keep the reassurance up.
    serve([ok({ queue: [ROW], workflows: { 'wf-1': step(['review']) }, thread: [] }), boom()]);
    mount();

    await waitFor(() => expect(CLEAR.test(text())).toBe(true));

    fireEvent.change(screen.getByPlaceholderText(/Add a comment/i), {
      target: { value: 'Please confirm the dose rationale.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Comment/i }));

    await waitFor(() => expect(/could not be read/i.test(text())).toBe(true));
    expect(CLEAR.test(text()), 'a failed re-read must not keep the clear claim up').toBe(false);
    // The queue itself is still there — the fix reports the unread chain, it
    // does not throw away rows that were read.
    expect(screen.getAllByText(ROW.doc).length).toBeGreaterThan(0);
  });

  it('does not say nothing is in review when the response carried no board', async () => {
    // A settled read with a null payload: `queue` is empty because nothing was
    // read, not because the organization has nothing awaiting review.
    serve([ok(null)]);
    mount();

    await waitFor(() => expect(/did not load/i.test(text())).toBe(true));
    expect(/Nothing is in review/i.test(text()), 'must not state an unread queue is empty').toBe(false);
  });

  /* ── OVER-CORRECTION GUARD ─────────────────────────────────────────────────────
     Every case above would also pass if the surface had simply stopped
     reassuring, which would make the review board useless: a reviewer with a
     genuinely clear queue must be told so. These two prove the earned states
     are still reachable, and the urgent branch with them. */
  it('still reports a clear signature queue when the steps were read and none require one', async () => {
    serve([ok({ queue: [ROW], workflows: { 'wf-1': step(['review']) }, thread: [] })]);
    mount();

    await waitFor(() => expect(screen.getAllByText(ROW.doc).length).toBeGreaterThan(0));

    expect(CLEAR.test(text()), 'clearance must stay reachable when it is earned').toBe(true);
    expect(/1 document still moving through review/i.test(text())).toBe(true);
    // A thread that was read and is empty may still say so.
    expect(/0 open/.test(text())).toBe(true);
    expect(/one informed click/i.test(text()), 'an earned answer may reassure').toBe(true);
  });

  it('still names the documents at a sign-off step, and still says nothing is in review when nothing is', async () => {
    // `mine` is the server's finding that the caller owns the current step.
    // Without it, "at YOUR sign-off step" was asserted over every org-wide
    // sign-off step because the board is read with scope=all.
    serve([ok({ queue: [{ ...ROW, mine: true }], workflows: { 'wf-1': step(['review', 'sign']) }, thread: [] })]);
    const view = mount();
    await waitFor(() => expect(/at your sign-off step/i.test(text())).toBe(true));
    expect(CLEAR.test(text())).toBe(false);
    view.unmount();

    serve([ok({ queue: [], workflows: {}, thread: [] })]);
    mount();
    await waitFor(() => expect(/Nothing is in review/i.test(text())).toBe(true));
  });

  it("a sign-off step the caller does not own is not reported as 'your' sign-off", async () => {
    serve([ok({ queue: [{ ...ROW, mine: false }], workflows: { 'wf-1': step(['review', 'sign']) }, thread: [] })]);
    mount();
    await waitFor(() => expect(/Nothing is blocked on your signature/i.test(text())).toBe(true));
    expect(/at your sign-off step/i.test(text())).toBe(false);
  });
});
