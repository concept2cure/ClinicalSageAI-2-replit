// @vitest-environment jsdom
/**
 * Decision P-34 — the signed Shadow Review waiver, client half
 * (docs/LAUNCH_DEFINITION_OF_DONE.md "### P-34").
 *
 * Shadow Review stays a dispatch gate. When the newest run failed because
 * every AI provider failed, the server may say a waiver is eligible
 * (`shadowReviewWaivable`), and a person with signing authority signs one on
 * the sequence (`ectd-sequence:<id>`, intent `shadow-waiver`). The verdict then
 * reads "cleared, not assessed by Shadow Review" — never "reviewed".
 *
 * Pinned here, against the server contract (mocked at apiRequest):
 *   • the waiver is offered ONLY when the server says eligible, to someone who
 *     may sign, on a sequence not yet dispatched; absent fields offer nothing;
 *   • the chain is precheck → Part 11 sign (intent 'shadow-waiver', meanings
 *     responsibility / approval only) → POST /shadow-review/waive with the
 *     signature and the failed run → the readiness is read again;
 *   • a refused or unconfirmed waive shows the server's words and no success;
 *   • an active waiver renders the server's notAssessed note, and nothing on
 *     the tab says "reviewed"; lapsed / revoked / undetermined each have their
 *     own sentence;
 *   • a waived run row reads as not reviewed; a failed run names its failure
 *     and, when eligible, points at the Dispatch tab.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

// The EsignModal's §11.200 re-auth primitives are mocked at the hook; the
// modal and the governed chain behind it are driven for real.
const verifyPassword = vi.hoisted(() => vi.fn(async () => ({ valid: true })));
const verifyMfa = vi.hoisted(() => vi.fn(async () => ({ valid: true })));
vi.mock('../../hooks/useEsignature', () => ({
  useEsignature: () => ({
    verifyPassword,
    verifyMfa,
    sign: vi.fn(),
    verifyingPassword: false,
    verifyingMfa: false,
    signing: false,
    signError: null,
  }),
}));

import { DispatchWorkspace, ShadowReviewWorkspace } from '../surfaces/SubmissionSeqWorkspaces';
import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const SUB = { id: 7, title: 'ZX-9 First-in-Human', productName: 'Zexanib', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original' };
const SEQ = { id: 21, sequenceNumber: '0000', type: 'original', status: 'validated', region: 'fda', validationStatus: 'passed' };

const BLOCKED = { cleared: false, blockers: ['No completed Shadow Review has run for this sequence.'] };
const CLEAR = { cleared: true, blockers: [] as string[] };

/** A sequence never reviewed, from a server that predates P-34 (no waiver fields). */
const MISSING = {
  sequenceId: 21, region: 'fda', sequenceStatus: 'validated', validationErrors: 0,
  unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 0, shadowReviewMissing: true,
  gate: BLOCKED, freezeGate: BLOCKED, dispatchGateOnSigning: BLOCKED,
  signer: { state: 'independent' },
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 3,
};
const OUTAGE_REASON = 'The newest Shadow Review run failed because every AI provider was unavailable, within the last 24 hours.';
const ELIGIBLE = {
  ...MISSING,
  shadowReviewWaiver: { state: 'none' },
  shadowReviewWaivable: { eligible: true, failedRunId: 91, failureCode: 'provider_unavailable', reason: OUTAGE_REASON },
};
const ACTIVE_NOTE =
  'Cleared, not assessed by Shadow Review: waived by Dana Reyes under signature act_w1 because run #91 failed when every AI provider was unavailable.';
const ACTIVE = {
  ...MISSING,
  gate: CLEAR, freezeGate: CLEAR, dispatchGateOnSigning: CLEAR,
  gates: [
    { key: 'structural', rule: null, cleared: true, blockers: [] },
    { key: 'shadowPresence', rule: null, cleared: true, blockers: [], notAssessed: ACTIVE_NOTE },
  ],
  shadowReviewWaiver: { state: 'active', signatureActionId: 'act_w1', signerName: 'Dana Reyes', signedAt: '2026-10-15T09:00:00.000Z', failedRunId: 91, failureCode: 'provider_unavailable' },
  shadowReviewWaivable: { eligible: false, reason: 'A waiver is already active for this sequence.' },
};
const withWaiver = (state: string) => ({
  ...MISSING,
  shadowReviewWaiver: { state, signatureActionId: 'act_w1', signerName: 'Dana Reyes', signedAt: '2026-10-15T09:00:00.000Z', failedRunId: 91 },
  shadowReviewWaivable: { eligible: false, reason: 'Not eligible.' },
});

const FAILED_RUN = {
  id: 91, sequenceId: 21, region: 'fda', lens: 'fda_filing', status: 'failed',
  rtfRiskScore: null, crlRiskScore: null, summary: null, createdAt: '2026-10-15T08:12:00.000Z',
  failureCode: 'provider_unavailable',
};
const WAIVED_RUN = {
  id: 92, sequenceId: 21, region: 'fda', lens: 'fda_filing', status: 'waived',
  rtfRiskScore: 0, crlRiskScore: 0, summary: null, createdAt: '2026-10-15T09:00:00.000Z',
};

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;
const text = () => document.body.textContent ?? '';
const WAIVE_BUTTON = /Waive Shadow Review — AI provider unavailable/;

type Handler = (method: string, url: string, body?: unknown) => Response | undefined;
function serve(extra: Handler) {
  apiRequest.mockImplementation(async (method: string, rawUrl: unknown, body?: unknown) => {
    const url = String(rawUrl ?? '');
    const hit = extra(method, url, body);
    if (hit) return hit;
    if (method === 'GET' && url === '/api/submissions') return ok([SUB]);
    if (method === 'GET' && url === '/api/submissions/7/sequences') return ok([SEQ]);
    if (method === 'GET' && url === '/api/510k/estar/submissions') return ok({ submissions: [] });
    if (method === 'POST' && url === '/api/510k/estar/assemble') return ok({ artifactKind: 'none', blockers: [] });
    if (method === 'POST' && url.endsWith('/governed-precheck')) {
      return ok({ step: (body as { step?: string })?.step, cleared: true, refusal: null });
    }
    return ok([]);
  });
}
const readinessIs = (payload: unknown, runs: unknown[] = [FAILED_RUN]) =>
  serve((method, url) => {
    if (method === 'GET' && url.endsWith('/dispatch-readiness')) return ok(payload);
    if (method === 'GET' && url === '/api/submissions/sequences/21/shadow-review') return ok(runs);
    return undefined;
  });

const renderDispatch = (seq = SEQ, onGoverned = vi.fn()) => {
  render(<DispatchWorkspace sub={SUB} seq={seq} onGoverned={onGoverned} />);
  return onGoverned;
};

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  verifyPassword.mockClear();
  verifyMfa.mockClear();
});

describe('Dispatch tab — the waiver is offered only when the server says so', () => {
  it('eligible: offers the signed waiver with one line naming the failed run and its time', async () => {
    readinessIs(ELIGIBLE);
    const onGoverned = renderDispatch();
    const button = await screen.findByRole('button', { name: WAIVE_BUTTON });
    expect(button.textContent).toMatch(/Part 11/);
    await waitFor(() => expect(text()).toContain(new Date(FAILED_RUN.createdAt).toLocaleString()));
    expect(text()).toMatch(/run #91 failed on .* because every AI provider was unavailable, so a signed waiver is offered/);
    fireEvent.click(button);
    expect(onGoverned).toHaveBeenCalledWith(SEQ, 'shadow-waiver', undefined, { failedRunId: 91 });
  });

  it('absent fields (an older server): nothing is offered and nothing is claimed', async () => {
    readinessIs(MISSING);
    renderDispatch();
    await waitFor(() => expect(text()).toMatch(/one of the reasons the gate blocks/));
    expect(screen.queryByRole('button', { name: WAIVE_BUTTON })).toBeNull();
    expect(text()).not.toMatch(/waive/i);
  });

  it('not eligible: no button, and the server says why', async () => {
    readinessIs({
      ...MISSING,
      shadowReviewWaiver: { state: 'none' },
      shadowReviewWaivable: { eligible: false, failedRunId: 91, failureCode: 'rate_limited', reason: 'A rate limit is not a provider outage, so this run cannot be waived.' },
    });
    renderDispatch();
    await waitFor(() => expect(text()).toContain('A rate limit is not a provider outage, so this run cannot be waived.'));
    expect(screen.queryByRole('button', { name: WAIVE_BUTTON })).toBeNull();
  });

  it('eligible but the user created the sequence: not offered', async () => {
    readinessIs({ ...ELIGIBLE, signer: { state: 'author' } });
    renderDispatch();
    await waitFor(() => expect(text()).toMatch(/You created this sequence/));
    expect(screen.queryByRole('button', { name: WAIVE_BUTTON })).toBeNull();
  });

  it('eligible but already dispatched: not offered', async () => {
    readinessIs({ ...ELIGIBLE, sequenceStatus: 'dispatched' });
    renderDispatch({ ...SEQ, status: 'dispatched' });
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked/));
    expect(screen.queryByRole('button', { name: WAIVE_BUTTON })).toBeNull();
  });
});

describe('Dispatch tab — what a waiver state says', () => {
  it('active: the server notAssessed note, "not assessed by Shadow Review", and never "reviewed"', async () => {
    readinessIs(ACTIVE);
    renderDispatch();
    await waitFor(() => expect(text()).toContain(ACTIVE_NOTE));
    const gate = document.querySelector('.sc-gate');
    expect(gate?.textContent).toMatch(/Dispatch gate clear/);
    expect(gate?.textContent).toMatch(/not assessed by Shadow Review/);
    expect(text()).not.toMatch(/\breviewed\b/i);
    expect(text()).not.toMatch(/one of the reasons the gate blocks/);
    expect(screen.queryByRole('button', { name: WAIVE_BUTTON })).toBeNull();
  });

  it('lapsed: its own sentence — the leaves changed after it was signed', async () => {
    readinessIs(withWaiver('lapsed'));
    renderDispatch();
    await waitFor(() => expect(text()).toMatch(/waiver signed by Dana Reyes .* has lapsed/));
    expect(text()).toMatch(/leaves changed after it was signed/);
    expect(text()).not.toMatch(/one of the reasons the gate blocks/);
  });

  it('revoked: its own sentence', async () => {
    readinessIs(withWaiver('revoked'));
    renderDispatch();
    await waitFor(() => expect(text()).toMatch(/waiver signed by Dana Reyes .* was revoked, so it clears nothing/));
  });

  it('undetermined: its own sentence', async () => {
    readinessIs(withWaiver('undetermined'));
    renderDispatch();
    await waitFor(() => expect(text()).toMatch(/Whether a Shadow Review waiver covers this sequence could not be determined/));
  });
});

describe('Shadow review tab — waived and failed runs', () => {
  it('a waived run row reads as not reviewed: no score, no findings read, no clear', async () => {
    readinessIs(ACTIVE, [WAIVED_RUN]);
    render(<ShadowReviewWorkspace seq={SEQ} />);
    await waitFor(() => expect(text()).toContain('#92'));
    expect(text()).toMatch(/Waived — not reviewed/);
    expect(text()).toMatch(/Run #92 records a waiver, not a review/);
    expect(text()).not.toContain('0.00');
    expect(text()).not.toMatch(/recorded no findings/);
    expect(text()).not.toMatch(/Complete/);
    expect(apiRequest).not.toHaveBeenCalledWith('GET', '/api/submissions/shadow-review/92/findings');
  });

  it('a failed run names its failure and, when eligible, points at the waiver on the Dispatch tab', async () => {
    readinessIs(ELIGIBLE, [FAILED_RUN]);
    render(<ShadowReviewWorkspace seq={SEQ} />);
    await waitFor(() => expect(text()).toMatch(/Run #91 failed because every AI provider was unavailable/));
    await waitFor(() => expect(text()).toMatch(/the Dispatch tab offers a signed waiver/));
    // The pointer is words, not a second waive control.
    expect(screen.queryByRole('button', { name: WAIVE_BUTTON })).toBeNull();
  });

  it('a failed run the server does not call waivable gets no pointer', async () => {
    readinessIs({ ...MISSING, shadowReviewWaivable: { eligible: false, failedRunId: 91, reason: 'Not an outage.' } }, [
      { ...FAILED_RUN, failureCode: 'invalid_ai_response' },
    ]);
    render(<ShadowReviewWorkspace seq={SEQ} />);
    await waitFor(() => expect(text()).toMatch(/Run #91 failed because the model's reply was not an assessment/));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', '/api/submissions/sequences/21/dispatch-readiness'));
    expect(text()).not.toMatch(/offers a signed waiver/);
  });
});

/* ── The governed chain, through the real Submission Center ─────────────── */

const SIGN = { actionId: 'act_w1', auditId: 'a-9', sha256Chain: 'c0ffee', state: 'executed' };
const WAIVE_URL = '/api/submissions/sequences/21/shadow-review/waive';

function serveChain(waive: () => Response, precheck?: (step: string) => Response | undefined) {
  const calls: Array<{ url: string; body?: unknown }> = [];
  let readinessReads = 0;
  let waived = false;
  serve((method, url, body) => {
    if (method === 'GET' && url === '/api/submissions/sequences/21/dispatch-readiness') {
      readinessReads += 1;
      return ok(waived ? ACTIVE : ELIGIBLE);
    }
    if (method === 'GET' && url === '/api/submissions/sequences/21/shadow-review') return ok([FAILED_RUN]);
    if (method !== 'POST') return undefined;
    if (url.endsWith('/governed-precheck') || url === '/api/c2c/actions/sign' || url === WAIVE_URL) calls.push({ url, body });
    if (url.endsWith('/governed-precheck')) return precheck?.((body as { step: string }).step);
    if (url === '/api/c2c/actions/sign') return ok(SIGN);
    if (url === WAIVE_URL) {
      // A throw here rejects apiRequest, as a dropped connection does.
      const r = waive();
      waived = r.ok;
      return r;
    }
    return undefined;
  });
  return { calls, reads: () => readinessReads };
}

async function openWaiver() {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
  await waitFor(() => expect(text()).toContain('ZX-9 First-in-Human'));
  fireEvent.click(screen.getByRole('tab', { name: 'Dispatch' }));
  fireEvent.click(await screen.findByRole('button', { name: WAIVE_BUTTON }));
}

async function signWaiver(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('Reason for this action'), {
    target: { value: 'Every AI provider is down and the IND is due today.' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'hunter22' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
}

describe('the waiver chain — precheck, sign, waive, read again', () => {
  it('runs precheck before the signature, signs intent shadow-waiver on the sequence, then waives that run', async () => {
    // The route's 200 (server/routes/__tests__/submissions-shadow-review-waive.test.ts).
    const chain = serveChain(() => ok({ sequenceId: 21, failedRunId: 91, failureCode: 'provider_unavailable', signatureActionId: 'act_w1', signatureId: 9, waiver: { state: 'active' } }));
    await openWaiver();
    const dialog = await screen.findByRole('dialog');
    // The gates were asked before the dialog opened; nothing was signed.
    expect(chain.calls.map((c) => c.url)).toEqual(['/api/submissions/sequences/21/governed-precheck']);
    expect(chain.calls[0].body).toEqual({ step: 'shadow-waiver' });
    // Responsibility or approval, nothing else (§11.50; P-34).
    expect(within(dialog).getAllByRole('radio').map((r) => r.textContent).sort()).toEqual(['Approval', 'Responsibility']);
    expect(dialog.textContent).toMatch(/goes forward without an AI adversarial review/);
    expect(dialog.textContent).toContain('ectd-sequence:21');

    const readsBefore = chain.reads();
    await signWaiver(dialog);
    await waitFor(() => expect(text()).toContain('Signature applied'));

    expect(chain.calls.map((c) => c.url)).toEqual([
      '/api/submissions/sequences/21/governed-precheck',
      '/api/submissions/sequences/21/governed-precheck',
      '/api/c2c/actions/sign',
      WAIVE_URL,
    ]);
    expect(chain.calls[1].body).toEqual({ step: 'shadow-waiver' });
    expect(chain.calls[2].body).toMatchObject({
      target: 'ectd-sequence:21',
      reason: 'Every AI provider is down and the IND is due today.',
      payload: { intent: 'shadow-waiver', meaning: 'responsibility' },
      reauth: { password: 'hunter22' },
    });
    expect(chain.calls[3].body).toEqual({ signatureActionId: 'act_w1', failedRunId: 91 });
    // The readiness is read again, and now says what the waiver is.
    await waitFor(() => expect(chain.reads()).toBeGreaterThan(readsBefore));
    await waitFor(() => expect(text()).toContain(ACTIVE_NOTE));
    expect(text()).toMatch(/server-confirmed under signature act_w1/);
  });

  it('a refused precheck opens no signature and says the server\'s words', async () => {
    const chain = serveChain(
      () => ok({}),
      (step) => (step === 'shadow-waiver' ? ok({ step, cleared: false, refusal: 'A completed Shadow Review exists for this sequence, so there is nothing to waive.' }) : undefined),
    );
    await openWaiver();
    await waitFor(() => expect(text()).toContain('A completed Shadow Review exists for this sequence, so there is nothing to waive. Nothing was signed.'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chain.calls.map((c) => c.url)).toEqual(['/api/submissions/sequences/21/governed-precheck']);
  });

  it.each([
    [409, 'SHADOW_WAIVER_NOT_ELIGIBLE', 'The newest Shadow Review run failed for a reason that is not an AI provider outage, so it cannot be waived.'],
    [403, 'GOVERNED_REQUIRED', "A valid e-signature is required. Refused: the sign action declares intent 'freeze', not 'shadow-waiver'."],
  ])('a %i %s waive shows the server\'s words and no success', async (status, code, message) => {
    serveChain(() => ({ ok: false, status, json: async () => ({ error: { code, message } }) }) as Response);
    await openWaiver();
    const dialog = await screen.findByRole('dialog');
    await signWaiver(dialog);
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain(message));
    expect(text()).not.toContain('Signature applied');
    expect(text()).not.toMatch(/Shadow Review waived for/);
    expect(text()).not.toContain('server-confirmed');
  });

  it('an unconfirmed waive says so and claims nothing', async () => {
    serveChain(() => {
      throw new TypeError('Failed to fetch');
    });
    await openWaiver();
    const dialog = await screen.findByRole('dialog');
    await signWaiver(dialog);
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toMatch(/could not be confirmed/));
    expect(text()).not.toContain('Signature applied');
    expect(text()).not.toMatch(/Shadow Review waived for/);
  });
});
