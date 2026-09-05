// @vitest-environment jsdom
/**
 * Submission Center — a read that never answered is not an answer of "none".
 *
 * ── The two findings ─────────────────────────────────────────────────────────
 * 1. The per-sequence gate (Builder / Validation / Shadow review / Cross-region
 *    / Dispatch) rendered
 *
 *      PER_SEQ_WS.has(ws) && !sub && !subs.loading
 *        → "No submission selected"
 *
 *    `sub` is `list.find(...) ?? list[0]` over `subs.rows`, and `useLiveRows`
 *    hands back the same frozen empty array whether GET /api/submissions
 *    returned zero rows or failed outright. The guard never read `subs.error`,
 *    so once a failed fetch settled, a regulatory director was told that no
 *    submission was SELECTED — which implies the list was read and they simply
 *    had not picked from it — over a list that had not been read at all.
 *
 * 2. The AnswerLead's action was
 *
 *      label:   seqs.rows.length ? 'Open the sequences' : 'Plan the submission'
 *      onClick: setWs(seqs.rows.length ? 'sequences' : 'planner')
 *
 *    branching on `rows.length` alone, which is 0 in flight, 0 on failure and 0
 *    on a genuinely unplanned submission. The body prop two lines above it got
 *    this right, so the surface could say "Loading this submission's
 *    sequences…" or "couldn't be loaded" in the paragraph while the button
 *    beneath it offered to plan a submission from zero and routed to the
 *    Planner — treating an unknown count as a known zero.
 *
 * ── Why these assertions are behavioural ─────────────────────────────────────
 * Every state below is driven through the real hooks by controlling what
 * `apiRequest` returns: a failing response, a pending promise that never
 * settles, and a genuine empty 200. Nothing asserts on the source text, and no
 * fixture is richer than the columns the surface actually renders — the reads
 * ARE the subject of both findings, so faking them is the point of the test.
 *
 * The last test in each pair is the over-correction guard. A fix that simply
 * never said "No submission selected", or never offered the Planner, would pass
 * the first test of each pair and destroy the surface: the honest empty state
 * and the plan-from-zero route both have to stay reachable when they are true.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

/** The columns GET /api/submissions actually returns, all of them rendered. */
const SUBMISSION = {
  id: 7,
  title: 'C2C-101 original NDA',
  productName: 'Concitinib',
  applicationType: 'nda',
  clientType: 'biotech',
  primaryRegion: 'fda',
  status: 'active',
  lifecycleStage: 'original',
};

type Res = { ok: boolean; status: number; json: () => Promise<unknown> };

const ok = (payload: unknown): Res => ({ ok: true, status: 200, json: async () => payload });
const rows = (r: unknown[]): Res => ok({ success: true, data: r });
/** A failed read. `useLiveRows` reports `error`, and `rows` stays empty. */
const failed = (): Res => ({ ok: false, status: 500, json: async () => ({}) });
/** A read that has not settled — the in-flight state, held open for the test. */
const pending = (): Promise<Res> => new Promise<Res>(() => {});

/**
 * Route the two reads under test; answer the device-tracker calls with their
 * own honest empty so nothing else on the Portfolio view throws.
 */
function serve(opts: {
  submissions: () => Res | Promise<Res>;
  sequences?: () => Res | Promise<Res>;
}) {
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    const u = String(url);
    if (u === '/api/submissions') return opts.submissions();
    if (/^\/api\/submissions\/\d+\/sequences$/.test(u)) return (opts.sequences ?? (() => rows([])))();
    if (u === '/api/510k/estar/submissions') return ok({ success: true, data: { submissions: [] } });
    if (u === '/api/510k/estar/assemble')
      return ok({ success: true, data: { artifactKind: 'none', blockers: [] } });
    return failed();
  });
}

function mount() {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
}

const body = () => document.body.textContent ?? '';

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('SubmissionCenter — the per-sequence gate over an unread submission list', () => {
  it('does not say "No submission selected" when the submission list failed to load', async () => {
    serve({ submissions: failed });
    mount();

    // Wait on the PORTFOLIO table's own failure copy first. It is not the branch
    // under test — it is the branch the per-sequence gate should have copied —
    // and it settles the read in both the fixed and the unfixed build, so the
    // negative assertion below cannot pass merely because nothing has rendered.
    await screen.findByText(/Couldn't load the submissions/i);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));

    // The sentence the finding named, asserted first so a regression names it.
    // Nothing established that a list exists to select from, so nothing may say
    // the reader has not selected from it.
    expect(/No submission selected/i.test(body()), 'a failed read is not an unselected one').toBe(
      false,
    );
    // And the failure is stated AS a failure (role=alert), not as an empty set.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn't load the submissions/i);
    // And no internals leak into the copy (work-order constraint).
    expect(/\/api\//.test(body()), 'no API routes in the UI').toBe(false);
    expect(/HTTP 500/.test(body()), 'no exception text in the UI').toBe(false);
  });

  /** Over-correction guard: the honest empty state must still be reachable. */
  it('still says "No submission selected" when the list genuinely came back empty', async () => {
    serve({ submissions: () => rows([]) });
    mount();

    // Same settle point, the Portfolio table's honest-empty copy this time.
    await screen.findByText(/No submissions yet/i);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));

    expect(screen.getByText(/No submission selected/i)).toBeTruthy();
    expect(/Couldn't load the submissions/i.test(body()), 'an empty read is not a failure').toBe(
      false,
    );
  });
});

describe('SubmissionCenter — the lead action over an unread sequence list', () => {
  it('does not offer "Plan the submission" while the sequences are still loading', async () => {
    serve({ submissions: () => rows([SUBMISSION]), sequences: pending });
    mount();

    // The lead renders as soon as the submission is known; its sequence read is
    // deliberately never allowed to settle.
    await screen.findByText(/Loading this submission/i);

    expect(
      screen.queryByRole('button', { name: 'Plan the submission' }),
      'an unknown count is not a known zero',
    ).toBeNull();
    // It still offers a way forward — the workspace that reports the read
    // itself, named without claiming what is in it.
    expect(screen.getByRole('button', { name: 'Open the Sequences workspace' })).toBeTruthy();
  });

  it('does not offer "Plan the submission" — or route to the Planner — when the sequence read failed', async () => {
    serve({ submissions: () => rows([SUBMISSION]), sequences: failed });
    mount();

    await screen.findByText(/couldn't be loaded right now/i);
    expect(
      screen.queryByRole('button', { name: 'Plan the submission' }),
      'a failed read is not a zero-sequence submission',
    ).toBeNull();

    // The destination matters as much as the label: the old onClick sent the
    // reader to the Planner on this exact state.
    fireEvent.click(screen.getByRole('button', { name: 'Open the Sequences workspace' }));
    expect(await screen.findByText(/Couldn't load the sequences/i)).toBeTruthy();
    expect(
      /AnA builds the sequence plan from the region profile/i.test(body()),
      'a failed read must not open the Planner',
    ).toBe(false);
  });

  /**
   * Over-correction guard: planning from zero is the whole point of the control
   * when zero is the TRUE, settled count. Both the label and the route have to
   * survive the fix.
   */
  it('still offers "Plan the submission" and opens the Planner on a settled zero-sequence read', async () => {
    serve({ submissions: () => rows([SUBMISSION]), sequences: () => rows([]) });
    mount();

    const plan = await screen.findByRole('button', { name: 'Plan the submission' });
    // The body is allowed to state the count here, because it is known.
    expect(/0 eCTD sequences tracked yet/i.test(body())).toBe(true);

    fireEvent.click(plan);
    // The Planner view rendered. Assert on its stable card subtitle, not the
    // intro blurb: that prose was (correctly) reworded upstream from "AnA builds
    // the sequence plan…" — an over-claim, since the button only opens the chat
    // rail — to "AnA can draft… as a proposal in conversation." Reaching the
    // Planner is the behaviour under test; the wording of its blurb is not, and
    // this suite's own contract is to not assert on source prose.
    expect(await screen.findByText(/planning · region profiles/i)).toBeTruthy();
  });

  it('offers the sequences when this submission has them', async () => {
    serve({
      submissions: () => rows([SUBMISSION]),
      sequences: () =>
        rows([
          {
            id: 31,
            submissionId: 7,
            sequenceNumber: '0000',
            type: 'original',
            region: 'fda',
            status: 'draft',
            validationStatus: null,
          },
        ]),
    });
    mount();

    expect(await screen.findByRole('button', { name: 'Open the sequences' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Plan the submission' })).toBeNull();
  });
});
