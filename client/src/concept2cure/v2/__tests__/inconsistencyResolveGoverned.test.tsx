// @vitest-environment jsdom
/**
 * Resolving a contradiction shows who the RECORD says resolved it.
 *
 * Resolving a finding clears the submission gate on this surface. The resolve
 * handler POSTed only `{ reviewState }`, never read the response, and wrote
 * `resolvedBy: 'AnA + you'` into local state — so the card announced a
 * resolver nobody had recorded, and the line beneath it admitted the audit
 * write was "not yet wired". The server now takes a reason, writes the ledger
 * row in the same transaction as the UPDATE, and returns the persisted
 * resolver; this pins the surface to that contract:
 *
 *   - the reason is captured in a governed confirmation and travels in the POST;
 *   - the resolver on screen is the one the server returned — the recorded id,
 *     since no name travels with it — never an invented one;
 *   - a refusal reads as a refusal and leaves the finding open.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { Inconsistency } from '../surfaces/Inconsistency';

const Surface = Inconsistency as unknown as React.ComponentType<Record<string, unknown>>;

const PROGRAM = {
  projectId: 9, name: 'Bexarone in advanced NSCLC', code: 'BX-204',
  stage: 'Phase 2', indication: 'NSCLC', app: null, filing: null,
};

const FINDING = {
  id: 'f-1', projectId: 9, contradictionType: 'dosage_conflict',
  severity: 'critical', title: 'Starting dose disagrees across the dossier',
  objectA: { type: 'section', id: 'a', label: 'Protocol §6.1' },
  objectB: { type: 'section', id: 'b', label: 'IB §5.3' },
  sourceClassification: 'deterministic', truthHierarchyLevel: 1, llmRole: 'none',
  confidenceScore: 0.98, confidenceLevel: 'high',
  description: 'The protocol states 400 mg BID; the Investigator Brochure states 200 mg BID.',
  deterministicRule: 'DOSE_XREF', consequenceType: 'contradiction_memo',
  reviewState: 'unresolved', detectedBy: null, factId: null,
  authorityState: 'blocks_promotion', resolvedBy: null, resolvedAt: null,
};

const BOARD_PATH = '/api/governed-intelligence-inconsistency/projects/9/inconsistency';
const REVIEW_PATH = '/api/governed-intelligence/contradictions/f-1/review';
const REASON = 'IB §5.3 corrected to 400 mg BID to match the protocol';
const RESOLVED_AT = '2026-09-23T14:02:00.000Z';

function routeReads() {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === BOARD_PATH) {
      return {
        ok: true, status: 200,
        json: async () => ({ data: { program: PROGRAM, findings: [FINDING], assumptions: [], decisions: [], checks: [] } }),
      };
    }
    throw new Error('unrouted ' + method + ' ' + path);
  });
}

function routeWrite(handler: (method: string, path: string, body: unknown) => unknown) {
  const reads = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation(async (m: string, p: string, b?: unknown) =>
    m === 'GET' ? reads(m, p, b) : handler(m, p, b),
  );
}

/** What the server returns for a committed resolution. */
function committed(resolvedBy = '7') {
  return {
    ok: true, status: 200,
    json: async () => ({
      finding: { ...FINDING, reviewState: 'approved_resolution', resolvedBy, resolvedAt: RESOLVED_AT, resolutionNotes: REASON },
      previousReviewState: 'unresolved',
      governance: { command: 'resolve', actionId: 'act_1', auditId: 'aud-1', sha256Chain: 'c0ffee' },
    }),
  };
}

const card = () => document.getElementById('gi-f-' + FINDING.id)!;
/** The surface's toast — other regions on the page also carry role="status". */
const toast = () => document.querySelector('.de-toast') as HTMLElement | null;

async function openResolve() {
  render(<Surface onAsk={() => {}} onNav={() => {}} />);
  await waitFor(() => expect(card()).toBeTruthy());
  fireEvent.click(within(card()).getByRole('button', { name: /^.?\s*Resolve/ }));
}

function submitReason(reason: string) {
  fireEvent.change(screen.getByLabelText(/Reason for resolution/), { target: { value: reason } });
  fireEvent.click(screen.getByRole('button', { name: /Record resolution/ }));
}

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 9 };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('resolving a contradiction is a governed decision with a reason', () => {
  it('asks for the reason before anything is sent', async () => {
    routeReads();
    routeWrite(() => { throw new Error('a write went out before the reason was captured'); });
    await openResolve();

    expect(await screen.findByLabelText(/Reason for resolution/)).toBeTruthy();
    expect(apiRequest.mock.calls.filter(([m]) => m === 'POST').length).toBe(0);
  });

  it('POSTs the reason with the review state', async () => {
    routeReads();
    routeWrite(() => committed());
    await openResolve();
    submitReason(REASON);

    await waitFor(() => expect(apiRequest.mock.calls.filter(([m]) => m === 'POST').length).toBe(1));
    const [, path, body] = apiRequest.mock.calls.find(([m]) => m === 'POST')!;
    expect(path).toBe(REVIEW_PATH);
    expect(body).toEqual({ reviewState: 'approved_resolution', reason: REASON });
  });

  it('refuses a reason under 8 characters without sending', async () => {
    routeReads();
    routeWrite(() => { throw new Error('a write should not have been attempted'); });
    await openResolve();
    submitReason('fixed');

    await screen.findByText(/at least 8 characters/);
    expect(apiRequest.mock.calls.filter(([m]) => m === 'POST').length).toBe(0);
  });
});

describe('the resolver shown is the one the server recorded', () => {
  it("never renders 'AnA + you' — it renders the server's resolver", async () => {
    routeReads();
    routeWrite(() => committed());
    await openResolve();
    // Does not depend on the confirmation existing, so it also runs — and
    // fails on the literal — against the handler that POSTed on click.
    if (screen.queryByLabelText(/Reason for resolution/)) submitReason(REASON);

    await waitFor(() => expect(card().textContent).toMatch(/resolved by/i));
    expect(card().textContent).not.toMatch(/AnA \+ you/);
    expect(card().textContent).toMatch(/Resolved by user 7/);
    expect(document.body.textContent).not.toMatch(/AnA \+ you/);
    // The audit write is wired now; the line must not say otherwise.
    expect(card().textContent).not.toMatch(/audit-trail write .*not yet wired/);
    expect(card().textContent).toMatch(/audit trail/);
  });

  it('shows exactly the resolver value the server returned — never an invented one', async () => {
    // A non-numeric stored value (a pre-existing row's email, say) is shown as
    // stored, not reshaped into "user …" and not replaced.
    routeReads();
    routeWrite(() => committed('qa.lead@sponsor.example'));
    await openResolve();
    submitReason(REASON);

    await waitFor(() => expect(card().textContent).toMatch(/Resolved by qa\.lead@sponsor\.example/));
    const line = card().textContent ?? '';
    expect(line).not.toMatch(/AnA \+ you/);
    expect(line).not.toMatch(/resolved by AnA/i);
    expect(line).not.toMatch(/user 7/);
  });

  it('says the record names no resolver when the server returned none', async () => {
    routeReads();
    routeWrite(() => committed(''));
    await openResolve();
    submitReason(REASON);

    await waitFor(() => expect(card().textContent).toMatch(/the record names no resolver/));
    expect(card().textContent).not.toMatch(/Resolved by/);
  });

  it('confirms success in a status toast', async () => {
    routeReads();
    routeWrite(() => committed());
    await openResolve();
    submitReason(REASON);

    await waitFor(() => expect(toast()).not.toBeNull());
    expect(toast()!.getAttribute('role')).toBe('status');
    expect(toast()!.getAttribute('data-tone')).toBeNull();
    expect(toast()!.textContent).toMatch(/audit trail/);
  });
});

describe('when the board may be stale, the confirmation closes and the board is re-read', () => {
  // A form left open over a board that is being re-read can be submitted again
  // against a finding that is now resolved — the repeated decision the server
  // refuses with 409, and before that refusal, re-stamped the resolver.
  const boardReads = () => apiRequest.mock.calls.filter(([m, p]) => m === 'GET' && p === BOARD_PATH).length;

  it('a network failure closes the confirmation so the same decision cannot be re-submitted', async () => {
    routeReads();
    routeWrite(() => { throw new TypeError('Failed to fetch'); });
    await openResolve();
    const readsBefore = boardReads();
    submitReason(REASON);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/cannot confirm/);
    expect(alert.textContent, 'an unknown outcome was worded as a refusal').not.toMatch(/Nothing was changed/);
    await waitFor(() => expect(screen.queryByLabelText(/Reason for resolution/)).toBeNull());
    await waitFor(() => expect(boardReads()).toBeGreaterThan(readsBefore));
  });

  it('a 409 (the finding is already in that state) says so, closes the confirmation, and re-reads', async () => {
    routeReads();
    routeWrite(() => {
      throw new ApiRequestError(
        'This finding is already approved_resolution — a repeated decision is not recorded again.',
        409,
        { error: 'REVIEW_STATE_UNCHANGED' },
        'REVIEW_STATE_UNCHANGED',
      );
    });
    await openResolve();
    const readsBefore = boardReads();
    submitReason(REASON);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/already approved_resolution/);
    expect(alert.textContent).toMatch(/Re-reading the board/);
    expect(alert.textContent, 'a refusal was worded as a success').not.toMatch(/recorded on the audit trail with your reason/);
    await waitFor(() => expect(screen.queryByLabelText(/Reason for resolution/)).toBeNull());
    await waitFor(() => expect(boardReads()).toBeGreaterThan(readsBefore));
  });
});

describe('a refusal reads as a refusal', () => {
  it('shows the server’s reason as an alert and leaves the finding open', async () => {
    routeReads();
    routeWrite(() => {
      throw new ApiRequestError(
        'The review decision was not recorded: the audit-trail write did not complete, so the finding was left unchanged.',
        500,
        { error: 'REVIEW_NOT_RECORDED' },
        'REVIEW_NOT_RECORDED',
      );
    });
    await openResolve();
    submitReason(REASON);

    const alert = await screen.findByRole('alert');
    expect(alert).toBe(toast());
    expect(alert.getAttribute('data-tone')).toBe('error');
    expect(alert.textContent).toMatch(/left unchanged/);
    expect(alert.textContent).toMatch(/Nothing was changed/);
    expect(alert.textContent, 'a refusal was worded as a network failure').not.toMatch(/Couldn’t reach/);
    expect(alert.textContent, 'a refusal was worded as a success').not.toMatch(/recorded on the audit trail/);
    // Still open: the card offers Resolve, not Re-open, and names no resolver.
    expect(within(card()).queryByRole('button', { name: /Re-open/ })).toBeNull();
    expect(card().textContent).not.toMatch(/Resolved by/i);
    // The reason the user typed is still there to retry with.
    expect((screen.getByLabelText(/Reason for resolution/) as HTMLTextAreaElement).value).toBe(REASON);
  });
});

describe('re-opening, and outcomes this screen cannot confirm', () => {
  function routeResolvedBoard() {
    apiRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'GET' && path === BOARD_PATH) {
        return {
          ok: true, status: 200,
          json: async () => ({ data: {
            program: PROGRAM,
            findings: [{ ...FINDING, reviewState: 'approved_resolution', resolvedBy: '7', resolvedAt: RESOLVED_AT }],
            assumptions: [], decisions: [], checks: [],
          } }),
        };
      }
      throw new Error('unrouted ' + method + ' ' + path);
    });
  }
  const boardReads = () => apiRequest.mock.calls.filter(([m, p]) => m === 'GET' && p === BOARD_PATH).length;

  it('re-open asks for its own reason, POSTs unresolved with it, and the resolver line goes', async () => {
    routeResolvedBoard();
    routeWrite(() => ({
      ok: true, status: 200,
      json: async () => ({
        finding: { ...FINDING, reviewState: 'unresolved', resolvedBy: null, resolvedAt: null },
        previousReviewState: 'approved_resolution',
        governance: { command: 'reopen', actionId: 'act_2', auditId: 'aud-2', sha256Chain: 'beef' },
      }),
    }));
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(card()?.textContent).toMatch(/Resolved by user 7/));
    fireEvent.click(within(card()).getByRole('button', { name: /Re-open/ }));
    expect(apiRequest.mock.calls.filter(([m]) => m === 'POST').length).toBe(0);
    fireEvent.change(await screen.findByLabelText(/Reason for re-opening/), { target: { value: 'The IB amendment was withdrawn' } });
    fireEvent.click(screen.getByRole('button', { name: /Record re-opening/ }));
    await waitFor(() => expect(apiRequest.mock.calls.filter(([m]) => m === 'POST').length).toBe(1));
    const [, path, body] = apiRequest.mock.calls.find(([m]) => m === 'POST')!;
    expect(path).toBe(REVIEW_PATH);
    expect(body).toEqual({ reviewState: 'unresolved', reason: 'The IB amendment was withdrawn' });
    await waitFor(() => expect(card().textContent).not.toMatch(/Resolved by/));
  });

  it('a 2xx whose reply cannot be read claims nothing about the audit trail, and re-reads', async () => {
    routeReads();
    routeWrite(() => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } }));
    await openResolve();
    const before = boardReads();
    submitReason(REASON);
    await waitFor(() => expect(toast()?.textContent).toMatch(/cannot confirm/));
    expect(toast()?.textContent).not.toMatch(/recorded on the audit trail/);
    await waitFor(() => expect(boardReads()).toBeGreaterThan(before));
  });

  it('a gateway error is an unknown outcome, not "Nothing was changed"', async () => {
    routeReads();
    routeWrite(() => { throw new ApiRequestError('Bad gateway', 502); });
    await openResolve();
    const before = boardReads();
    submitReason(REASON);
    await waitFor(() => expect(toast()?.textContent).toMatch(/cannot confirm/));
    expect(toast()?.textContent).not.toMatch(/Nothing was changed/);
    await waitFor(() => expect(boardReads()).toBeGreaterThan(before));
    // The form closes, so the same decision cannot be sent again over a board
    // that may now show it recorded.
    expect(screen.queryByLabelText(/Reason for resolution/)).toBeNull();
  });

  it('no answer at all: the form closes and the board is re-read', async () => {
    routeReads();
    routeWrite(() => { throw new TypeError('Failed to fetch'); });
    await openResolve();
    const before = boardReads();
    submitReason(REASON);
    await waitFor(() => expect(toast()?.textContent).toMatch(/Couldn’t reach the contradiction service/));
    await waitFor(() => expect(boardReads()).toBeGreaterThan(before));
    expect(screen.queryByLabelText(/Reason for resolution/)).toBeNull();
  });
});
