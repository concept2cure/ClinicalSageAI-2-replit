// @vitest-environment jsdom
/**
 * The Communication Center may not say the FDA is waiting on nothing before it
 * has read what the FDA is waiting on.
 *
 * ── The finding ──────────────────────────────────────────────────────────────
 * The AnswerLead headline was a five-branch ternary:
 *
 *   !projectId ? … : liveComms.error ? … : critical.length ? … : responseDue.length ? …
 *                                                              : <>No open agency
 *                                                                 communications need a
 *                                                                 response right now.</>
 *
 * There was no branch for `liveComms.loading`. `critical` and `responseDue` are
 * filtered from `comms`, and `comms` is seeded from
 *
 *   !commsPath || liveComms.loading || liveComms.error ? EMPTY_COMMS : liveComms.rows
 *
 * — a condition re-evaluated on EVERY render, feeding an effect that re-seeds
 * `comms` whenever the reference changes. So for the whole of the in-flight
 * window both arrays are empty, the ternary fell through, and the most
 * prominent sentence on the surface told a regulatory director that no agency
 * communication was awaiting a response. `tone` was
 * `critical.length || responseDue.length ? 'urgent' : 'calm'`, so the banner
 * was visually settled at the same moment.
 *
 * This is a nothing-assessed state wearing the vocabulary of assessed-clear, on
 * the one surface whose stated job is "What the FDA is waiting on from you".
 *
 * ── Why `comms.length > 0` is the right evidence ─────────────────────────────
 * `assessmentState`'s rule is that clearance needs positive evidence, never the
 * emptiness at issue. The emptiness at issue here is `responseDue.length === 0`.
 * The evidence is the register's non-zero DENOMINATOR: the read settled and the
 * project has agency correspondence on file. Those two situations are genuinely
 * different regulatory facts —
 *
 *   register answered, holds N letters, none awaiting a response  → CLEAR
 *   register answered and holds nothing                           → NOT ASSESSED
 *                                                                   (nobody has
 *                                                                    logged the
 *                                                                    correspondence)
 *
 * — and the old copy spoke the first sentence in all four non-finding states.
 *
 * ── Why these tests are behavioural ──────────────────────────────────────────
 * Every state is reachable by controlling one mock: `apiRequest`. A promise that
 * never settles is the loading window; a non-OK response is the failed read; a
 * `{ data: [] }` is the empty register; a real row is the assessed cases. No
 * assertion below inspects source text — each one reads what the user sees.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { CommunicationCenter } from '../surfaces/CommunicationCenter';

/** The exact sentence the finding named. */
const FALSE_ALL_CLEAR = /No open agency communications need a response right now/i;
/** Any reassurance of the same shape, however reworded. */
const ANY_ALL_CLEAR = /need(s)? a response right now|nothing (is )?(outstanding|awaiting)/i;

const COMMS = /\/agency-communications$/;

/** A complete agency-communication row — every field the inbox render reads. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: 'comm-1',
    sourceType: 'agency_portal',
    communicationType: 'Information Request (IR)',
    sourceChannel: 'FDA CDER portal',
    linkedSectionCodes: ['3.2.P.8'],
    receivedDate: '2026-07-01',
    dueDate: null,
    urgency: 'medium',
    responseRequired: false,
    extractedIssues: [],
    humanReviewStatus: 'actioned',
    closureStatus: 'closed',
    auditMetadata: { visibilityTier: 'shared_client_c2c' },
    ...over,
  };
}

const okJson = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data: payload }),
});

/**
 * Answer the agency-communications read with `comms`; answer every other read on
 * the surface (interactions, commitments, authority profiles) with an honest
 * empty so nothing else on screen is in flight while the assertions run.
 */
function serve(comms: () => unknown) {
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    COMMS.test(String(url)) ? comms() : okJson([]),
  );
}

function mount() {
  return render(
    <CommunicationCenter
      {...({ surface: { id: 'communication-center' }, onAsk: vi.fn(), onNav: vi.fn() } as any)}
    />,
  );
}

const text = () => document.body.textContent ?? '';

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as Record<string, unknown>).C2C_PROJECT = { id: '7', code: 'C2C-101' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).C2C_PROJECT;
});

describe('Communication Center — an unread register is not an empty inbox', () => {
  it('says nothing about outstanding responses while the register read is in flight', () => {
    // The in-flight window, held open: this promise never settles, so the
    // component stays in exactly the state the finding describes.
    serve(() => new Promise(() => {}));
    mount();

    const body = text();
    expect(FALSE_ALL_CLEAR.test(body), 'the sentence the finding named').toBe(false);
    expect(ANY_ALL_CLEAR.test(body), 'nor any reworded all-clear').toBe(false);
    // And it must say what IS true rather than going silent.
    expect(/Reading this project’s agency communications/i.test(body)).toBe(true);
    expect(/until the register answers/i.test(body)).toBe(true);
    // The tab count came off the same empty array and read "Agency inbox · 0".
    expect(/Agency inbox · 0/.test(body), 'a count is an answer too').toBe(false);
  });

  it('reports a failed read as a failed read, not as an empty inbox', async () => {
    serve(() => ({ ok: false, status: 503, json: async () => ({}) }));
    mount();

    await waitFor(() =>
      expect(/Couldn’t load this project’s agency communications/i.test(text())).toBe(true),
    );

    const body = text();
    expect(FALSE_ALL_CLEAR.test(body), 'a failed read must not read clear').toBe(false);
    expect(ANY_ALL_CLEAR.test(body)).toBe(false);
    expect(/failed read, not an empty inbox/i.test(body)).toBe(true);
    // No internals: the status code and path must not reach the UI.
    expect(/503|\/api\//.test(body), 'no route or status text in client UI').toBe(false);
  });

  it('an empty register reads as nothing logged, not as nothing outstanding', async () => {
    serve(() => okJson([]));
    mount();

    await waitFor(() =>
      expect(/No agency communications have been logged for this project/i.test(text())).toBe(true),
    );

    const body = text();
    expect(FALSE_ALL_CLEAR.test(body), 'zero rows is not a finding of "none"').toBe(false);
    expect(/An empty register is not a finding that nothing is outstanding/i.test(body)).toBe(true);
  });

  it('with no project open it claims nothing at all about outstanding responses', async () => {
    delete (window as unknown as Record<string, unknown>).C2C_PROJECT;
    serve(() => okJson([]));
    mount();

    await waitFor(() =>
      expect(/Open a project to load its agency communications/i.test(text())).toBe(true),
    );
    expect(FALSE_ALL_CLEAR.test(text())).toBe(false);
  });

  it('still leads with the deadline when the agency IS waiting on something', async () => {
    serve(() =>
      okJson([
        row({
          id: 'comm-crit',
          communicationType: 'Complete Response Letter',
          urgency: 'critical',
          responseRequired: true,
          closureStatus: 'open',
          humanReviewStatus: 'pending_review',
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        }),
      ]),
    );
    mount();

    await waitFor(() => expect(/The FDA issued a/i.test(text())).toBe(true));
    const body = text();
    expect(/Complete Response Letter/.test(body)).toBe(true);
    expect(/days<?\/?b?> to respond|days to respond/i.test(body)).toBe(true);
    expect(FALSE_ALL_CLEAR.test(body)).toBe(false);
  });

  /**
   * ── The over-correction guard ──────────────────────────────────────────────
   * Everything above would also pass if the fix simply deleted the reassuring
   * branch — which would be the same defect wearing a different face: a surface
   * that can never report an all-clear is useless to the director who needs to
   * know the correspondence is worked off.
   *
   * So: a register that ANSWERED and holds two real communications, neither
   * awaiting a response. That is the one state with positive evidence behind it
   * — the read settled, the denominator is non-zero, and the numerator is zero —
   * and the surface must say so plainly, in the 'good' tone.
   */
  it('still reports an all-clear when the register answered and holds worked-off mail', async () => {
    serve(() =>
      okJson([
        row({ id: 'a', closureStatus: 'closed', responseRequired: false }),
        row({ id: 'b', closureStatus: 'closed', responseRequired: false }),
      ]),
    );
    const { container } = mount();

    await waitFor(() => expect(/is awaiting a response/i.test(text())).toBe(true));

    const body = text();
    expect(/None of the/i.test(body)).toBe(true);
    expect(/2/.test(body), 'the denominator the claim rests on is shown').toBe(true);
    // It must not be hedged into uselessness.
    expect(/have been logged for this project/i.test(body), 'not the not-assessed copy').toBe(false);
    expect(/Reading this project/i.test(body), 'not still loading').toBe(false);
    // And the lead carries the settled tone, which nothing else may reach.
    expect(container.querySelector('.al-lead.al-good'), 'the earned tone').toBeTruthy();
  });

  it('never renders the settled tone before the read has answered', () => {
    serve(() => new Promise(() => {}));
    const { container } = mount();
    expect(container.querySelector('.al-lead.al-good')).toBeNull();
    expect(container.querySelector('.al-lead.al-calm')).toBeTruthy();
  });
});
