// @vitest-environment jsdom
/**
 * Decision P-35 — a critical Shadow Review finding is closed by a named
 * person's signature, never by silence. Client half
 * (docs/LAUNCH_DEFINITION_OF_DONE.md "### P-35").
 *
 * The server says, per finding, what may be signed on it now
 * (`dispositionsOffered`, by the act's own rule) and, once closed, who closed
 * it, how, when, why and under which signature (`disposition`). Pinned here,
 * against that contract (mocked at apiRequest):
 *   • "Accept risk" only on an OPEN CRITICAL the server offers it on, to someone
 *     who may sign; "Mark fixed" only when the server offers it (a completed
 *     review ran after the finding's run); nothing on a non-critical, a closed
 *     finding, or from an older server that sends no offer;
 *   • the chain is precheck → Part 11 sign (intent 'shadow-finding-disposition',
 *     meanings approval / responsibility only, the finding and the disposition
 *     in the payload) → POST …/findings/:findingId/disposition with the
 *     signature and the disposition → the findings are read again;
 *   • a closed critical reads who closed it, how, when and why — never as
 *     something the AI resolved; a revoked signature is said;
 *   • a refused or unconfirmed act shows the server's words and no success.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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

import { ShadowReviewWorkspace } from '../surfaces/SubmissionSeqWorkspaces';
import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const SUB = { id: 7, title: 'ZX-9 First-in-Human', productName: 'Zexanib', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original' };
const SEQ = { id: 21, sequenceNumber: '0000', type: 'original', status: 'validated', region: 'fda', validationStatus: 'passed' };

const RUN_NEW = { id: 95, sequenceId: 21, region: 'fda', lens: 'fda_filing', status: 'complete', rtfRiskScore: 0.4, crlRiskScore: 0.2, summary: null, createdAt: '2026-10-15T11:00:00.000Z' };
const RUN_OLD = { id: 91, sequenceId: 21, region: 'fda', lens: 'fda_filing', status: 'complete', rtfRiskScore: 0.7, crlRiskScore: 0.3, summary: null, createdAt: '2026-10-14T09:00:00.000Z' };

const base = { dimension: 'rtf', detail: null, basis: null, recommendation: null, leafRef: null };
/** Run 95 is the newest: no completed review after it, so only risk acceptance is offered. */
const F_NEW = { ...base, id: 501, runId: 95, severity: 'critical', title: 'Form 1571 not signed', status: 'open', disposition: null, dispositionsOffered: ['accepted'], laterCompletedRunId: null };
const F_MINOR = { ...base, id: 502, runId: 95, severity: 'minor', title: 'Cover letter date format', status: 'open', disposition: null, dispositionsOffered: [], laterCompletedRunId: null };
/** Run 91 had run 95 complete after it, so "fixed" is offered too. */
const F_OLD = { ...base, id: 401, runId: 91, severity: 'critical', title: 'Stability data missing from m3.2.s.7', status: 'open', disposition: null, dispositionsOffered: ['accepted', 'fixed'], laterCompletedRunId: 95 };
const ACCEPTED_AT = '2026-10-15T10:00:00.000Z';
const FIXED_AT = '2026-10-15T10:30:00.000Z';
const ACCEPTED_REASON = 'The investigator brochure update follows in the 30-day amendment.';
const FIXED_REASON = 'The 12-month stability report is now filed as leaf m3.2.s.7.';
const F_CLOSED = {
  ...base, id: 402, runId: 91, severity: 'critical', title: 'IB version not current', status: 'accepted', dispositionsOffered: [], laterCompletedRunId: null,
  disposition: { disposition: 'accepted', disposedBy: 3, disposedByName: 'Dana Reyes', disposedAt: ACCEPTED_AT, reason: ACCEPTED_REASON, signatureActionId: 'act_d1', signatureId: 31, meaning: 'approval', signatureState: 'in-force' },
};
const F_FIXED = {
  ...base, id: 403, runId: 91, severity: 'critical', title: 'Pharmacology summary missing', status: 'fixed', dispositionsOffered: [], laterCompletedRunId: null,
  disposition: { disposition: 'fixed', disposedBy: 4, disposedByName: 'Lee Park', disposedAt: FIXED_AT, reason: FIXED_REASON, signatureActionId: 'act_d2', signatureId: 32, meaning: 'responsibility', signatureState: 'revoked' },
};

const READINESS = { sequenceId: 21, shadowReviewMissing: false, signer: { state: 'independent' } };

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;
const text = () => document.body.textContent ?? '';
const ACCEPT = /^Accept risk/;
const FIX = /^Mark fixed/;

type Handler = (method: string, url: string, body?: unknown) => Response | undefined;
type ServeOpts = { signer?: string; newFindings?: unknown[]; oldFindings?: unknown[] };
/** The reads every case serves, by "METHOD url". */
const reads = (opts: ServeOpts): Record<string, () => unknown> => ({
  'GET /api/submissions': () => [SUB],
  'GET /api/submissions/7/sequences': () => [SEQ],
  'GET /api/510k/estar/submissions': () => ({ submissions: [] }),
  'POST /api/510k/estar/assemble': () => ({ artifactKind: 'none', blockers: [] }),
  'GET /api/submissions/sequences/21/shadow-review': () => [RUN_NEW, RUN_OLD],
  'GET /api/submissions/shadow-review/95/findings': () => opts.newFindings ?? [F_NEW, F_MINOR],
  'GET /api/submissions/shadow-review/91/findings': () => opts.oldFindings ?? [F_OLD, F_CLOSED, F_FIXED],
  'GET /api/submissions/sequences/21/dispatch-readiness': () => ({ ...READINESS, signer: { state: opts.signer ?? 'independent' } }),
});
function serve(extra: Handler = () => undefined, opts: ServeOpts = {}) {
  const table = reads(opts);
  apiRequest.mockImplementation(async (method: string, rawUrl: unknown, body?: unknown) => {
    const url = String(rawUrl ?? '');
    const hit = extra(method, url, body);
    if (hit) return hit;
    const read = table[`${method} ${url}`];
    if (read) return ok(read());
    if (method === 'POST' && url.endsWith('/governed-precheck')) {
      return ok({ step: (body as { step?: string })?.step, cleared: true, refusal: null });
    }
    return ok([]);
  });
}

/** The row of a finding, by its title. */
const rowOf = (title: string) => {
  const t = screen.getByText(title);
  const row = t.closest('.sp-row');
  if (!row) throw new Error(`no row for ${title}`);
  return row as HTMLElement;
};

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  verifyPassword.mockClear();
  verifyMfa.mockClear();
});

describe('Shadow review tab — what is offered on which finding', () => {
  it('an open critical with no later review: "Accept risk" only, and the screen says when "Mark fixed" comes', async () => {
    serve();
    const onDisposition = vi.fn();
    render(<ShadowReviewWorkspace seq={SEQ} onDisposition={onDisposition} />);
    await screen.findByText(F_NEW.title);
    const row = rowOf(F_NEW.title);
    const accept = await within(row).findByRole('button', { name: ACCEPT });
    expect(accept.textContent).toMatch(/Part 11/);
    expect(within(row).queryByRole('button', { name: FIX })).toBeNull();
    expect(row.textContent).toMatch(/Mark fixed is offered once a Shadow Review completes on this sequence after run #95/);
    // A non-critical finding is not gated and not part of this act.
    expect(within(rowOf(F_MINOR.title)).queryAllByRole('button')).toHaveLength(0);

    fireEvent.click(accept);
    expect(onDisposition).toHaveBeenCalledWith(SEQ, {
      findingId: 501, disposition: 'accepted', title: F_NEW.title, runId: 95, laterCompletedRunId: null,
    });
  });

  it('an open critical with a later completed review: both, and "Mark fixed" names that review', async () => {
    serve();
    const onDisposition = vi.fn();
    render(<ShadowReviewWorkspace seq={SEQ} onDisposition={onDisposition} />);
    fireEvent.click(await screen.findByRole('button', { name: '#91' }));
    await screen.findByText(F_OLD.title);
    const row = rowOf(F_OLD.title);
    // The controls wait for the signer read; then both are there.
    expect(await within(row).findByRole('button', { name: ACCEPT })).toBeTruthy();
    const fix = await within(row).findByRole('button', { name: FIX });
    fireEvent.click(fix);
    expect(onDisposition).toHaveBeenCalledWith(SEQ, {
      findingId: 401, disposition: 'fixed', title: F_OLD.title, runId: 91, laterCompletedRunId: 95,
    });
  });

  it('a closed critical reads who closed it, how, when and why — and offers nothing', async () => {
    serve();
    render(<ShadowReviewWorkspace seq={SEQ} onDisposition={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '#91' }));
    await screen.findByText(F_CLOSED.title);
    // The open critical's controls are up, so the signer read has settled:
    // what the closed rows lack, they lack for good.
    await within(rowOf(F_OLD.title)).findByRole('button', { name: ACCEPT });
    const closed = rowOf(F_CLOSED.title);
    expect(closed.textContent).toContain(
      `Risk accepted by Dana Reyes on ${new Date(ACCEPTED_AT).toLocaleString()} under signature act_d1 (approval). Reason: ${ACCEPTED_REASON}`,
    );
    expect(within(closed).queryAllByRole('button')).toHaveLength(0);
    const fixed = rowOf(F_FIXED.title);
    expect(fixed.textContent).toContain(
      `Marked fixed by Lee Park on ${new Date(FIXED_AT).toLocaleString()} under signature act_d2 (responsibility). Reason: ${FIXED_REASON}`,
    );
    expect(fixed.textContent).toMatch(/The signature it was closed under has since been revoked/);
    expect(within(fixed).queryAllByRole('button')).toHaveLength(0);
    // Never as something the AI did.
    expect(text()).not.toMatch(/resolved by (the )?AI|AI[- ]resolved|auto(matically)?[- ]resolved|cleared by (a later )?review/i);
  });

  it('nothing is offered to the sequence author, and the screen says why', async () => {
    serve(undefined, { signer: 'author' });
    render(<ShadowReviewWorkspace seq={SEQ} onDisposition={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/You created this sequence, so you cannot close its critical findings/));
    expect(screen.queryByRole('button', { name: ACCEPT })).toBeNull();
  });

  it('an older server that sends no offer: nothing is offered and nothing is claimed', async () => {
    const P35_FIELDS = ['dispositionsOffered', 'laterCompletedRunId', 'disposition'];
    const older = Object.fromEntries(Object.entries(F_NEW).filter(([k]) => !P35_FIELDS.includes(k)));
    serve(undefined, { newFindings: [older] });
    render(<ShadowReviewWorkspace seq={SEQ} onDisposition={vi.fn()} />);
    await screen.findByText(F_NEW.title);
    // Let any effect the rows start settle before asserting absence.
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.queryByRole('button', { name: ACCEPT })).toBeNull();
    expect(text()).not.toMatch(/Mark fixed/);
    // Nothing offered, so the signer was not even asked.
    expect(apiRequest).not.toHaveBeenCalledWith('GET', '/api/submissions/sequences/21/dispatch-readiness');
  });
});

/* ── The governed chain, through the real Submission Center ─────────────── */

const SIGN = { actionId: 'act_d9', auditId: 'a-9', sha256Chain: 'c0ffee', state: 'executed' };
const DISPOSE_URL = '/api/submissions/sequences/21/shadow-review/findings/501/disposition';
const SIGN_REASON = 'Accepted: the 1571 is countersigned in the 30-day amendment.';

function serveChain(dispose: () => Response, precheck?: (body: Record<string, unknown>) => Response | undefined) {
  const calls: Array<{ url: string; body?: unknown }> = [];
  let findingReads = 0;
  let closed = false;
  serve((method, url, body) => {
    if (method === 'GET' && url === '/api/submissions/shadow-review/95/findings') {
      findingReads += 1;
      return ok(closed
        ? [{ ...F_NEW, status: 'accepted', dispositionsOffered: [], disposition: { disposition: 'accepted', disposedBy: 3, disposedByName: 'Dana Reyes', disposedAt: ACCEPTED_AT, reason: SIGN_REASON, signatureActionId: 'act_d9', signatureId: 41, meaning: 'responsibility', signatureState: 'in-force' } }, F_MINOR]
        : [F_NEW, F_MINOR]);
    }
    if (method !== 'POST') return undefined;
    if (url.endsWith('/governed-precheck') || url === '/api/c2c/actions/sign' || url === DISPOSE_URL) calls.push({ url, body });
    if (url.endsWith('/governed-precheck')) return precheck?.(body as Record<string, unknown>);
    if (url === '/api/c2c/actions/sign') return ok(SIGN);
    if (url === DISPOSE_URL) {
      // A throw here rejects apiRequest, as a dropped connection does.
      const r = dispose();
      closed = r.ok;
      return r;
    }
    return undefined;
  });
  return { calls, reads: () => findingReads };
}

async function openAccept() {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
  await waitFor(() => expect(text()).toContain('ZX-9 First-in-Human'));
  fireEvent.click(screen.getByRole('tab', { name: 'Shadow review' }));
  await screen.findByText(F_NEW.title);
  fireEvent.click(await within(rowOf(F_NEW.title)).findByRole('button', { name: ACCEPT }));
}

async function signIt(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('Reason for this action'), { target: { value: SIGN_REASON } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'hunter22' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
}

const RECORD = {
  sequenceId: 21, findingId: 501, runId: 95, disposition: 'accepted', signatureActionId: 'act_d9', signatureId: 41,
  dispositionRecord: { disposition: 'accepted', disposedBy: 3, disposedByName: 'Dana Reyes', signatureState: 'in-force' },
};

describe('the disposition chain — precheck, sign, close, read again', () => {
  it('asks the precheck before the signature, signs the finding and the disposition, then closes that finding', async () => {
    const chain = serveChain(() => ok(RECORD));
    await openAccept();
    const dialog = await screen.findByRole('dialog');
    // The rule was asked before the dialog opened; nothing was signed.
    expect(chain.calls.map((c) => c.url)).toEqual(['/api/submissions/sequences/21/governed-precheck']);
    expect(chain.calls[0].body).toEqual({ step: 'shadow-finding-disposition', findingId: 501, disposition: 'accepted' });
    // Approval or responsibility, nothing else (§11.50; P-35).
    expect(within(dialog).getAllByRole('radio').map((r) => r.textContent).sort()).toEqual(['Approval', 'Responsibility']);
    expect(dialog.textContent).toContain('ectd-sequence:21');
    expect(dialog.textContent).toMatch(/closes critical finding #501 "Form 1571 not signed" as risk accepted/);

    const readsBefore = chain.reads();
    await signIt(dialog);
    await waitFor(() => expect(text()).toContain('Signature applied'));

    expect(chain.calls.map((c) => c.url)).toEqual([
      '/api/submissions/sequences/21/governed-precheck',
      '/api/submissions/sequences/21/governed-precheck',
      '/api/c2c/actions/sign',
      DISPOSE_URL,
    ]);
    expect(chain.calls[2].body).toMatchObject({
      target: 'ectd-sequence:21',
      reason: SIGN_REASON,
      payload: { intent: 'shadow-finding-disposition', meaning: 'responsibility', findingId: 501, disposition: 'accepted' },
      reauth: { password: 'hunter22' },
    });
    expect(chain.calls[3].body).toEqual({ signatureActionId: 'act_d9', disposition: 'accepted' });
    // The findings are read again, and the row now says who closed it and why.
    await waitFor(() => expect(chain.reads()).toBeGreaterThan(readsBefore));
    await waitFor(() => expect(text()).toContain(`Reason: ${SIGN_REASON}`));
    expect(text()).toMatch(/Critical finding #501 closed as risk accepted/);
    expect(text()).toMatch(/server-confirmed under signature act_d9/);
  });

  it("a refused precheck opens no signature and says the server's words", async () => {
    const chain = serveChain(
      () => ok({}),
      (body) => (body.step === 'shadow-finding-disposition'
        ? ok({ step: body.step, cleared: false, refusal: 'Finding #501 is already accepted, so there is nothing left to close.' })
        : undefined),
    );
    await openAccept();
    await waitFor(() => expect(text()).toContain('Finding #501 is already accepted, so there is nothing left to close. Nothing was signed.'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chain.calls.map((c) => c.url)).toEqual(['/api/submissions/sequences/21/governed-precheck']);
  });

  it.each([
    [409, 'SHADOW_FINDING_NOT_DISPOSABLE', 'Finding #501 is no longer an open critical finding of this sequence, so nothing was closed.'],
    [403, 'GOVERNED_REQUIRED', 'A valid e-signature is required. Refused: the signature was given for finding #500, not finding #501.'],
  ])("a %i %s shows the server's words and no success", async (status, code, message) => {
    serveChain(() => ({ ok: false, status, json: async () => ({ error: { code, message } }) }) as Response);
    await openAccept();
    const dialog = await screen.findByRole('dialog');
    await signIt(dialog);
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain(message));
    expect(within(dialog).getByRole('alert').textContent).toMatch(/Finding #501 was not closed/);
    expect(text()).not.toContain('Signature applied');
    expect(text()).not.toMatch(/closed as risk accepted/);
    expect(text()).not.toContain('server-confirmed');
  });

  it('an unconfirmed act says so and claims nothing', async () => {
    serveChain(() => {
      throw new TypeError('Failed to fetch');
    });
    await openAccept();
    const dialog = await screen.findByRole('dialog');
    await signIt(dialog);
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toMatch(/could not be confirmed/));
    expect(text()).not.toContain('Signature applied');
    expect(text()).not.toMatch(/closed as risk accepted/);
  });
});
