// @vitest-environment jsdom
/**
 * P11-28b — the Dispatch button reads `dispatchGateOnSigning`, and nothing on
 * the tab contradicts the control under it.
 *
 * For IND / NDA / BLA / MAA, `gate` requires a release signature to exist
 * already, and on the submissions spine the signature it accepts is the one the
 * Dispatch click records (runGoverned signs, then dispatches). Gated on `gate`,
 * the only control that creates the signature never rendered: no such sequence
 * could be dispatched from the product's own screen. The server now reports
 * `dispatchGateOnSigning` — the dispatch verdict once that signature is on
 * record, decided where the resolver's spine precedence lives — and the button
 * reads it.
 *
 * The copy is tested with the controls, because the P11-28a fix (Freeze reads
 * `freezeGate`) was tested on the button alone and left two false sentences
 * beside it: "Freeze and dispatch stay locked while the gate blocks" rendered
 * over a live Freeze button, and the "move it to Validated" freeze instruction
 * was still gated on the dispatch verdict. A control fixed without its words is
 * half fixed.
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

const SUB = { id: 3, title: 'IND 2026', primaryRegion: 'fda' };
const seqAt = (status: string) => ({
  id: 7, sequenceNumber: '0000', type: 'original', status, region: 'fda', validationStatus: null,
});

const CLEAR = { cleared: true, blockers: [] as string[] };
const UNSIGNED_BLOCKER = {
  cleared: false,
  blockers: [
    'Dispatch is blocked because this submission type requires a 21 CFR Part 11 release signature and none has been applied.',
  ],
};

/** Everything clear except the release signature this sequence's own dispatch
 *  e-signature will record — the state of every never-dispatched IND. */
const assessmentAt = (status: string, over: Record<string, unknown> = {}) => ({
  sequenceId: 7, region: 'fda', sequenceStatus: status, validationErrors: 0,
  unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 1, shadowReviewMissing: false,
  gate: UNSIGNED_BLOCKER,
  freezeGate: CLEAR,
  dispatchGateOnSigning: CLEAR,
  releaseSignature: { required: true, verdict: 'unsigned', cleared: false },
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 4,
  ...over,
});

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
const button = (re: RegExp) =>
  Array.from(document.querySelectorAll('button')).find((b) => re.test(b.textContent ?? ''));
/** The governed Dispatch control — NOT "Run dispatch QC", which /dispatch/i also matches. */
const dispatchButton = () => button(/Dispatch sequence \(Part 11|Sign the release and dispatch/);
const mount = async (status: string, assessment: unknown) => {
  serve(assessment);
  render(<DispatchWorkspace {...({ sub: SUB, seq: seqAt(status), onGoverned: vi.fn() } as any)} />);
  await waitFor(() => expect(text()).toMatch(/Dispatch gate|Dispatch blocked/));
};

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('DispatchWorkspace — Dispatch reads dispatchGateOnSigning (P11-28b)', () => {
  it('RENDERS Dispatch on a frozen IND whose only blocker is the signature the click records', async () => {
    await mount('frozen', assessmentAt('frozen'));
    const b = dispatchButton();
    expect(b, 'the only control that creates the release signature is hidden until it exists').toBeTruthy();
    // §11.50: the signer is applying the release, not only moving a status.
    expect(b!.textContent).toMatch(/Sign the release and dispatch/);
  });

  it('says what the gate is waiting for — not "Dispatch blocked", and not "clear"', async () => {
    await mount('frozen', assessmentAt('frozen'));
    expect(text()).toMatch(/clear except for the release signature/);
    expect(text()).toMatch(/dispatch e-signature is\s+recorded as that release signature/);
    expect(text()).not.toMatch(/Dispatch blocked/);
    expect(text()).not.toMatch(/Dispatch gate clear(?! except)/);
    expect(text(), 'a lock note under a live Dispatch button').not.toMatch(/stays locked/);
  });

  it('keeps the plain label once a release signature is already on record', async () => {
    await mount('frozen', assessmentAt('frozen', {
      gate: CLEAR,
      releaseSignature: { required: true, verdict: 'signed', cleared: true },
    }));
    expect(button(/Dispatch sequence \(Part 11/)).toBeTruthy();
    expect(button(/Sign the release/)).toBeFalsy();
    expect(text()).toMatch(/Dispatch gate clear/);
  });

  it('HIDES Dispatch when signing cannot clear the gate — an orchestrator run awaiting its signer', async () => {
    const awaiting = {
      cleared: false,
      blockers: ['Dispatch is blocked because the release signature is still awaiting a signer (run-a).'],
    };
    await mount('frozen', assessmentAt('frozen', {
      gate: awaiting,
      dispatchGateOnSigning: awaiting,
      releaseSignature: { required: true, verdict: 'awaiting', cleared: false },
    }));
    expect(dispatchButton(), 'a button that records a signature the resolver will never read').toBeFalsy();
    expect(text()).toMatch(/Dispatch blocked — 1 blocker/);
    expect(text()).toMatch(/Dispatch stays locked while the gate blocks/);
  });

  it('HIDES Dispatch on a payload with no dispatchGateOnSigning — fail closed, and not by crashing', async () => {
    // As with freezeGate: absence must hide the button because the guard
    // refused it, not because the render died on the way to it — which also
    // leaves no button, and which vitest reports only as an unhandled error.
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    try {
      const { dispatchGateOnSigning: _omitted, ...without } = assessmentAt('frozen');
      await mount('frozen', without);
      expect(dispatchButton()).toBeFalsy();
      expect(errors.join('\n')).not.toMatch(/Cannot read propert|TypeError/);
      // And it never falls back to `gate`, which is the defect.
      expect(text()).toMatch(/Dispatch blocked/);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('DispatchWorkspace — no sentence contradicts the control under it', () => {
  it('a validated IND with Freeze open is not told "Freeze and dispatch stay locked"', async () => {
    // The P11-28a fix rendered Freeze here and left this sentence above it.
    await mount('validated', assessmentAt('validated'));
    expect(button(/Freeze sequence/)).toBeTruthy();
    expect(text()).not.toMatch(/stay locked|stays locked/);
  });

  it('a validated sequence whose freeze really is blocked says so — about freeze', async () => {
    const shadow = { cleared: false, blockers: ['No completed Shadow Review has run for this sequence'] };
    await mount('validated', assessmentAt('validated', {
      gate: shadow, freezeGate: shadow, dispatchGateOnSigning: shadow,
      shadowReviewRunCount: 0, shadowReviewMissing: true,
    }));
    expect(button(/Freeze sequence/)).toBeFalsy();
    expect(text()).toMatch(/Freeze stays locked while the gate blocks/);
  });

  it('a draft IND whose freeze gate is open is told to move it to Validated — the instruction reads the FREEZE verdict', async () => {
    // Gated on `gate`, this instruction was hidden for every IND/NDA/BLA/MAA
    // sequence: the step-verdict defect's third instance.
    await mount('draft', assessmentAt('draft'));
    expect(text()).toMatch(/governed freeze needs the sequence at Validated/);
    expect(text()).not.toMatch(/stay locked/);
  });
});

/**
 * Separation of duties, told in advance. The sign step refuses the sequence's
 * creator; before this the creator found out only after typing a password and
 * code. The tab now says so as soon as the sequence exists, and does not offer
 * a button the server will refuse.
 */
describe('DispatchWorkspace — the sequence creator is told before signing', () => {
  it('the creator sees why they cannot sign, and is not offered Freeze', async () => {
    await mount('validated', assessmentAt('validated', { signer: { state: 'author', sources: ['sequence creator'] } }));
    expect(text()).toMatch(/You created this sequence, so you cannot sign its freeze or dispatch/);
    expect(button(/Freeze sequence/), 'a button the server will refuse after a password').toBeFalsy();
  });

  it('the creator is warned while the sequence is still a draft — early enough to arrange a signer', async () => {
    await mount('draft', assessmentAt('draft', { signer: { state: 'author', sources: ['sequence creator'] } }));
    expect(text()).toMatch(/arrange\s+who that is/);
  });

  it('the creator is not offered Dispatch on a frozen sequence', async () => {
    await mount('frozen', assessmentAt('frozen', { signer: { state: 'author', sources: ['sequence creator'] } }));
    expect(dispatchButton()).toBeFalsy();
  });

  it('an independent colleague sees no warning and keeps both controls', async () => {
    await mount('frozen', assessmentAt('frozen', { signer: { state: 'independent', sources: ['sequence creator'] } }));
    expect(text()).not.toMatch(/You created this sequence/);
    expect(dispatchButton()).toBeTruthy();
  });

  it('no recorded creator: nobody can sign, and it says so', async () => {
    await mount('validated', assessmentAt('validated', { signer: { state: 'unresolved', sources: [] } }));
    expect(text()).toMatch(/No creator is recorded/);
    expect(button(/Freeze sequence/)).toBeFalsy();
  });

  it('a failed check hides nothing — unknown is not "you cannot"', async () => {
    await mount('validated', assessmentAt('validated', { signer: { state: 'unverified', sources: [] } }));
    expect(text()).toMatch(/could not be checked just now/);
    expect(button(/Freeze sequence/)).toBeTruthy();
  });

  it('a payload without `signer` behaves as before', async () => {
    await mount('validated', assessmentAt('validated'));
    expect(button(/Freeze sequence/)).toBeTruthy();
    expect(text()).not.toMatch(/You created this sequence|No creator is recorded|could not be checked/);
  });
});
