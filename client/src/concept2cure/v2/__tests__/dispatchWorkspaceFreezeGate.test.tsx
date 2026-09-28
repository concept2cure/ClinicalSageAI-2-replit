// @vitest-environment jsdom
/**
 * The Freeze button reads the FREEZE verdict, not the dispatch one.
 *
 * `assess-dispatch-readiness.ts` returns two composed verdicts for one
 * assessment: `gate` (the dispatch step — every gate, including the §11.70
 * requirement that a release signature already EXISTS) and `freezeGate` (the
 * same gates with that requirement dropped, because a release signature comes
 * from a signed package and requiring one to freeze inverts the order the
 * product works in — composeDispatchGatesForStep's own comment).
 *
 * The client typed and read only `gate`. For IND / NDA / BLA / MAA — the four
 * types that require a release signature, i.e. every submission the control
 * exists for — a `validated` sequence with no release signature yet had
 * `gate.cleared === false`, so the Freeze button never rendered and the
 * sequence could not leave `validated` through this screen at all. The server
 * side of this was fixed when composeDispatchGatesForStep landed; the client
 * was not, and nothing failed, because no test asserted the button EVER
 * renders — the existing fixture (dispatchWorkspaceHonesty) only carries the
 * always-blocked case, which is green either way.
 *
 * That is the hole these tests close: the positive case, and the exact
 * divergence between the two verdicts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DispatchWorkspace } from '../surfaces/SubmissionSeqWorkspaces';

const SEQ = {
  id: 7, sequenceNumber: '0001', type: 'original',
  status: 'validated', region: 'fda', validationStatus: null,
};
const SUB = { id: 3, title: 'NDA 2026', primaryRegion: 'fda' };

/**
 * The state every IND/NDA/BLA/MAA sequence is in before its release is signed:
 * nothing is wrong with it, and the only thing the dispatch gate objects to is
 * the absence of a signature that freezing is a prerequisite for.
 */
const AWAITING_RELEASE_SIGNATURE = {
  sequenceId: 7, region: 'fda', sequenceStatus: 'validated', validationErrors: 0,
  unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 1, shadowReviewMissing: false,
  gate: { cleared: false, blockers: ['The release signature is unsigned.'] },
  freezeGate: { cleared: true, blockers: [] },
  releaseSignature: { required: true, verdict: 'unsigned', cleared: false },
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 4,
};

const ok = (payload: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data: payload }) }) as Response;

function serve(assessment: unknown) {
  apiRequest.mockImplementation(async (method: string, rawUrl: unknown) => {
    const url = String(rawUrl ?? '');
    if (url.endsWith('/dispatch-readiness')) return ok(assessment);
    if (url.endsWith('/leaves')) return ok([]);
    if (method === 'POST' && url.endsWith('/dispatch-qc')) {
      return { ok: true, status: 200, json: async () => ({ clearedToDispatch: false, blockers: [], warnings: [], checklist: [] }) } as Response;
    }
    return ok([]);
  });
}

const text = () => document.body.textContent ?? '';
const freezeButton = () =>
  Array.from(document.querySelectorAll('button')).find(b => /Freeze sequence/.test(b.textContent ?? ''));

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('DispatchWorkspace — the Freeze button is gated on freezeGate', () => {
  it('RENDERS Freeze when freezeGate clears and the dispatch gate does not', async () => {
    // The whole defect in one assertion: these two verdicts disagree, and
    // freeze must follow the freeze one.
    serve(AWAITING_RELEASE_SIGNATURE);
    render(<DispatchWorkspace {...({ sub: SUB, seq: SEQ, onGoverned: vi.fn() } as any)} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch/));
    await waitFor(() => expect(freezeButton()).toBeTruthy());
  });

  it('HIDES Freeze when the freeze verdict itself blocks', async () => {
    // The control still works: freezeGate keeps every other gate, so a real
    // blocker (no shadow review, an open error finding, a TAMPERED signature)
    // still hides the button. Dropping the requirement is not dropping the gate.
    serve({
      ...AWAITING_RELEASE_SIGNATURE,
      freezeGate: { cleared: false, blockers: ['No completed Shadow Review has run for this sequence'] },
    });
    render(<DispatchWorkspace {...({ sub: SUB, seq: SEQ, onGoverned: vi.fn() } as any)} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch/));
    expect(freezeButton()).toBeFalsy();
  });

  it('HIDES Freeze when an invalid signature blocks the freeze verdict', async () => {
    // evaluateReleaseSignatureGate blocks `invalid` UNCONDITIONALLY, including
    // when a signature is not required — requiredness governs whether one must
    // be PRESENT, never whether a broken one may be ignored. So a tampered
    // signature must still stop a freeze, and the server expresses that by
    // clearing neither verdict.
    serve({
      ...AWAITING_RELEASE_SIGNATURE,
      gate: { cleared: false, blockers: ['The release signature no longer binds its content.'] },
      freezeGate: { cleared: false, blockers: ['The release signature no longer binds its content.'] },
      releaseSignature: { required: true, verdict: 'invalid', cleared: false },
    });
    render(<DispatchWorkspace {...({ sub: SUB, seq: SEQ, onGoverned: vi.fn() } as any)} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch/));
    expect(freezeButton()).toBeFalsy();
  });

  it('HIDES Freeze on a payload with no freezeGate at all — fail closed, no crash', async () => {
    // This is network data. A response missing the field must hide the button
    // and leave the workspace rendered, never throw and white-screen it, and
    // never silently fall back to `gate` (which is the defect being fixed).
    //
    // The absent-button assertion ALONE does not test this. Without the `?.`
    // the component throws a TypeError mid-render, React discards its output,
    // and "no Freeze button" is then true for the worst possible reason —
    // vitest reports the throw as an unhandled error and still passes the
    // test, warning "this might cause false positive tests". Proven: reverting
    // the guard left this test green until the error assertion below existed.
    // So the crash itself has to be what fails.
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    try {
      const { freezeGate: _omitted, ...withoutFreezeGate } = AWAITING_RELEASE_SIGNATURE;
      serve(withoutFreezeGate);
      render(<DispatchWorkspace {...({ sub: SUB, seq: SEQ, onGoverned: vi.fn() } as any)} />);
      await waitFor(() => expect(text()).toMatch(/Dispatch/));

      expect(freezeButton()).toBeFalsy();
      // The button is absent because the guard refused it, not because the
      // render died on the way to it.
      expect(errors.join('\n')).not.toMatch(/Cannot read propert|TypeError/);
    } finally {
      spy.mockRestore();
    }
  });
});
