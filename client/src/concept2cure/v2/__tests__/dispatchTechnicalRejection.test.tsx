// @vitest-environment jsdom
/**
 * P-92 C4 (P-108 1(a); design §10.5 C, with the coordinating session's rulings of 2026-11-09): record FDA's failed Ack3
 * from the Dispatch tab. The server's half: `POST /sequences/:id/governed-precheck {step:'technical-rejection'}` answers
 * whether it can be recorded and, for a chosen Vault document, the statement the signer makes and the Ack3 it cites;
 * `POST /sequences/:id/technical-rejection {signatureActionId}` is the act. This file pins the screen against that
 * contract (mocked at apiRequest).
 *
 *   D1  the door: only for a sequence recorded as received by FDA; closed by default; asked again on every open; the
 *       server's refusal in its words; the creator told; FDA's Ack3 chosen in this project's Vault; the statement.
 *   D2  the one signature, through the real Submission Center: Responsibility only, the server's statement word for word,
 *       asked again before signing, then the act; no record key and no signature id on screen; a 200 that is not the
 *       record is not a success.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

// The EsignModal's §11.200 re-auth primitives are mocked at the hook; the modal and the governed chain behind it are
// driven for real.
const verifyPassword = vi.hoisted(() => vi.fn(async () => ({ valid: true })));
const verifyMfa = vi.hoisted(() => vi.fn(async () => ({ valid: true })));
vi.mock('../../hooks/useEsignature', () => ({
  useEsignature: () => ({
    verifyPassword, verifyMfa, sign: vi.fn(),
    verifyingPassword: false, verifyingMfa: false, signing: false, signError: null,
  }),
}));

// The Vault picker is the existing one (VaultLibraryResults.tsx); its own search is tested where it lives. Here it
// stands in as one button that chooses FDA's document, and says which project it searched.
const DOC = { id: '0b000000-0000-4000-8000-000000000003', title: 'FDA Ack3 for sequence 0001', version: '1', current: true,
  programId: '099991d1-dac8-43c5-b88a-8baab26194ee', programName: null, contentHash: 'f'.repeat(64) };
vi.mock('../surfaces/VaultLibraryResults', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../surfaces/VaultLibraryResults')>()),
  VaultVersionPicker: ({ onChoose, label, programId }: { onChoose: (d: typeof DOC) => void; label?: string; programId?: string }) => (
    <button type="button" data-testid="vault-picker" data-program={programId} onClick={() => onChoose(DOC)}>{label}</button>
  ),
}));

import { DispatchWorkspace } from '../surfaces/SubmissionSeqWorkspaces';
import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const PROGRAM = DOC.programId;
const SUB = { id: 7, title: 'BX-256 IND', productName: 'BX-256', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: PROGRAM };
const SEQ = { id: 21, sequenceNumber: '0001', type: 'amendment', status: 'dispatched', region: 'fda', validationStatus: 'passed' };
const CLEAR = { cleared: true, blockers: [] as string[] };
const READINESS = {
  sequenceId: 21, region: 'fda', sequenceStatus: 'dispatched', validationErrors: 0, unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1, shadowReviewMissing: false, gate: CLEAR, freezeGate: CLEAR, dispatchGateOnSigning: CLEAR,
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 1, signer: { state: 'independent', sources: [] },
};
/** The server's words. Deliberately not the production text: the screen must carry what the server sent. */
const FILED_LINE = 'Sequence was already transmitted (the words of this precheck, c4a).';
const TRANSMIT = (dispatchStatus: string, region = 'fda', refusal = FILED_LINE) => ({
  sequenceStatus: 'dispatched', dispatchStatus, route: { ok: true, region, gateway: region === 'fda' ? 'esg' : 'cesp' },
  configured: { staging: true, production: true }, recordedApplicationNumber: '000512', recordedApplicant: 'BX Bio', gate: CLEAR, refusal,
});
const SENT_AT = '2026-11-03T14:05:00.000Z';
const OVERVIEW = { sequenceNumber: '0001', sentAt: SENT_AT, transmittalId: 41, attemptId: '0b000000-0000-4000-8000-0000000000a1', signerRefusal: null };
const OFFERED = { step: 'technical-rejection', cleared: true, refusal: null, rejection: OVERVIEW };
const STATEMENT = "FDA's Ack3 for the send of sequence 0001 is the document chosen (the words of this precheck, c4b). It is no longer on file.";
const EVIDENCE = { kind: 'ack3', vaultDocumentId: DOC.id, sha256: DOC.contentHash };
const STATED = { step: 'technical-rejection', cleared: true, refusal: null, rejection: { ...OVERVIEW, statement: STATEMENT, evidence: EVIDENCE } };
const CREATOR = 'You created sequence 0001, so you cannot sign the record of its technical rejection. Another person with signing authority signs it.';

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() }) as unknown as Response;
const text = () => document.body.textContent ?? '';
const RECORD_KEY = /\b[a-z-]+:\d+\b/;

type Handler = (method: string, url: string, body?: unknown) => Response | undefined;
let extra: Handler = () => undefined;
let transmit: () => Response = () => json({ step: 'transmit', cleared: false, refusal: FILED_LINE, transmit: TRANSMIT('sent') });
/** The rejection answers, in order; the last one repeats. */
let answers: Array<(body: Record<string, unknown>) => Response> = [];
const calls: Array<{ method: string; url: string; body?: unknown }> = [];

function serve() {
  apiRequest.mockImplementation(async (method: string, rawUrl: unknown, body?: unknown) => {
    const url = String(rawUrl ?? '');
    calls.push({ method, url, body });
    const hit = extra(method, url, body);
    if (hit) return hit;
    if (method === 'GET' && url.endsWith('/dispatch-readiness')) return json({ data: READINESS });
    if (method === 'POST' && url.endsWith('/governed-precheck')) {
      const b = (body ?? {}) as Record<string, unknown>;
      if (b.step === 'transmit') return transmit();
      if (b.step === 'technical-rejection') {
        const next = answers.length > 1 ? answers.shift()! : answers[0] ?? (() => json(OFFERED));
        return next(b);
      }
      return json({ step: b.step, cleared: false, refusal: 'Not at this step.' });
    }
    return json({ data: [] });
  });
}
const rejectionPrechecks = () =>
  calls.filter((c) => c.method === 'POST' && c.url.endsWith('/governed-precheck') && (c.body as { step?: string })?.step === 'technical-rejection');

const door = () => screen.getByTestId('technical-rejection') as HTMLElement & { open: boolean };
const setOpen = (open: boolean) => {
  const d = door();
  d.open = open;
  fireEvent(d, new Event('toggle'));
};
const button = (name: string | RegExp) => within(door()).queryByRole('button', { name });

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  verifyPassword.mockClear();
  verifyMfa.mockClear();
  calls.length = 0;
  extra = () => undefined;
  answers = [];
  transmit = () => json({ step: 'transmit', cleared: false, refusal: FILED_LINE, transmit: TRANSMIT('sent') });
  serve();
});

const renderDispatch = async (onGoverned = vi.fn()) => {
  render(<DispatchWorkspace sub={SUB as never} seq={SEQ} onGoverned={onGoverned} />);
  await waitFor(() => expect(screen.getByTestId('technical-rejection')).toBeTruthy());
  return onGoverned;
};

describe("D1 — \"Record FDA's technical rejection…\" where a send recorded as received is told", () => {
  it('a closed, quiet door that asks nothing until opened', async () => {
    await renderDispatch();
    const d = door();
    expect(d.tagName).toBe('DETAILS');
    expect(d.className).toBe('pj-more sc-mt');
    expect(d.open).toBe(false);
    expect(d.querySelector('summary')?.textContent).toBe("Record FDA's technical rejection…");
    expect(rejectionPrechecks()).toHaveLength(0);
  });

  it.each([['pending', 'fda'], ['transmitting', 'fda'], ['acknowledged', 'fda'], ['rejected', 'fda'], ['sent', 'ema']])(
    'there is no door while the dispatch status is %s (region %s)', async (status, region) => {
      transmit = () => json({ step: 'transmit', cleared: false, refusal: 'Not now.', transmit: TRANSMIT(status, region, 'Not now.') });
      render(<DispatchWorkspace sub={SUB as never} seq={SEQ} onGoverned={vi.fn()} />);
      await waitFor(() => expect(text()).toContain('Transmit is not available: Not now.'));
      expect(screen.queryByTestId('technical-rejection')).toBeNull();
    });

  it("opened: the send, what the door does, and FDA's Ack3 chosen in this project's Vault; then the server's statement and the sign button", async () => {
    answers = [() => json(OFFERED), () => json(STATED)];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(text()).toContain("If FDA's Ack3 for sequence 0001's send of 3 November 2026 at 14:05 UTC reports that the center did not accept it"));
    const picker = within(door()).getByTestId('vault-picker');
    expect(picker.getAttribute('data-program')).toBe(PROGRAM);
    expect(picker.textContent).toBe("Find FDA's Ack3 in this project's Vault");
    fireEvent.click(picker);
    await waitFor(() => expect(within(door()).getByTestId('technical-rejection-would-state')).toBeTruthy());
    expect(within(door()).getByTestId('technical-rejection-would-state').querySelector('q')?.textContent).toBe(STATEMENT);
    expect(rejectionPrechecks().map((c) => c.body)).toEqual([{ step: 'technical-rejection' }, { step: 'technical-rejection', evidenceDocumentId: DOC.id }]);
    const signIt = button('Sign: record sequence 0001 as rejected by FDA');
    expect(signIt?.className).toBe('btn ghost small');
    expect(door().textContent).not.toMatch(RECORD_KEY);
  });

  it('asks again on every open and keeps no answer across a close', async () => {
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(rejectionPrechecks()).toHaveLength(1));
    setOpen(false);
    setOpen(true);
    await waitFor(() => expect(rejectionPrechecks()).toHaveLength(2));
  });

  it("the server's refusal stands in its words, and nothing is offered", async () => {
    const REFUSED = 'Sequence 0002, numbered after 0001, is in flight or on file with FDA (the words of this precheck, c4c). Nothing was changed.';
    answers = [() => json({ step: 'technical-rejection', cleared: false, refusal: REFUSED, rejection: OVERVIEW })];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(door().textContent).toContain(REFUSED));
    expect(within(door()).queryByTestId('vault-picker')).toBeNull();
  });

  it("the sequence's creator is told why, and offered no document", async () => {
    answers = [() => json({ ...OFFERED, rejection: { ...OVERVIEW, signerRefusal: CREATOR } })];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(door().textContent).toContain(CREATOR));
    expect(within(door()).queryByTestId('vault-picker')).toBeNull();
  });

  it('a chosen document the server refuses: its sentence, and no sign button', async () => {
    const NOT_ACK3 = "This document already settled or rejected a send of sequence 0001 (the words of this precheck, c4d). Nothing was changed.";
    answers = [() => json(OFFERED), () => json({ step: 'technical-rejection', cleared: false, refusal: NOT_ACK3, rejection: OVERVIEW })];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(within(door()).getByTestId('vault-picker')).toBeTruthy());
    fireEvent.click(within(door()).getByTestId('vault-picker'));
    await waitFor(() => expect(door().textContent).toContain(NOT_ACK3));
    expect(button(/Sign:/)).toBeNull();
  });

  it('an unreadable answer is said, never taken as nothing to record', async () => {
    answers = [() => json({ step: 'technical-rejection', cleared: true })];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(door().textContent).toContain("Whether FDA's technical rejection can be recorded could not be checked."));
  });
});

const SIGN = { actionId: 'act_r1', auditId: 'a-9', sha256Chain: 'c0ffee', state: 'executed' };
const ACT_URL = '/api/submissions/sequences/21/technical-rejection';
const RECORDED = { recorded: true, sequenceId: 21, sequenceNumber: '0001', dispatchStatus: 'rejected', transmittalId: 41, signatureActionId: 'act_r1', signatureId: 6631, recordedAt: '2026-11-09T18:00:00.000Z' };
const REASON = "FDA's Ack3 reports the center did not load sequence 0001.";

function serveCenter(act: () => Response) {
  extra = (method, url) => {
    if (method === 'GET' && url === '/api/submissions') return json([SUB]);
    if (method === 'GET' && url === '/api/submissions/7/sequences') return json([SEQ]);
    if (method === 'GET' && url === '/api/510k/estar/submissions') return json({ submissions: [] });
    if (method === 'POST' && url === '/api/510k/estar/assemble') return json({ artifactKind: 'none', blockers: [] });
    if (method === 'POST' && url === '/api/c2c/actions/sign') return json(SIGN);
    if (method === 'POST' && url === ACT_URL) return act();
    return undefined;
  };
}
async function openAndChoose() {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
  await waitFor(() => expect(text()).toContain('BX-256 IND'));
  fireEvent.click(screen.getByRole('tab', { name: 'Dispatch' }));
  await waitFor(() => expect(screen.getByTestId('technical-rejection')).toBeTruthy());
  setOpen(true);
  await waitFor(() => expect(within(door()).getByTestId('vault-picker')).toBeTruthy());
  fireEvent.click(within(door()).getByTestId('vault-picker'));
  await waitFor(() => expect(button('Sign: record sequence 0001 as rejected by FDA')).not.toBeNull());
  fireEvent.click(button('Sign: record sequence 0001 as rejected by FDA')!);
}
async function sign(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('Reason for this action'), { target: { value: REASON } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'hunter22' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
}
const signBody = () => calls.find((c) => c.method === 'POST' && c.url === '/api/c2c/actions/sign')?.body as
  { target: string; payload: Record<string, unknown> } | undefined;

describe('D2 — the one signature, Responsibility only, the statement word for word', () => {
  beforeEach(() => { answers = [() => json(OFFERED), () => json(STATED)]; });

  it("signs the server's statement, asks again, then records; no record key and no signature id on screen", async () => {
    serveCenter(() => json(RECORDED));
    await openAndChoose();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Responsibility']);
    const stated = within(dialog).getByTestId('technical-rejection-statement');
    expect(stated.querySelector('q')?.textContent).toBe(STATEMENT);
    const meta = within(dialog).getByText(/records FDA's technical rejection/);
    expect(meta.textContent).toBe("FDA (US) · records FDA's technical rejection of the send of 3 November 2026; nothing is sent to FDA");
    expect(dialog.textContent).not.toMatch(RECORD_KEY);
    await sign(dialog);
    await waitFor(() => expect(text()).toContain('Signature applied'));
    // The signed manifest names the act in words, and FDA's Ack3 it rests on (shown once signed, as C2's settlement).
    expect(dialog.textContent).toContain('Record sequence 0001 as rejected by FDA');
    expect(within(dialog).getByText("FDA's Ack3")).toBeTruthy();
    expect(signBody()).toEqual(expect.objectContaining({
      target: 'ectd-sequence:21',
      payload: { intent: 'technical-rejection', meaning: 'responsibility', transmittalId: 41, transmitAttemptId: OVERVIEW.attemptId, evidence: EVIDENCE, statement: STATEMENT },
    }));
    expect(calls.find((c) => c.method === 'POST' && c.url === ACT_URL)?.body).toEqual({ signatureActionId: 'act_r1' });
    // Asked: on open, for the document, before the dialog, and again before signing.
    expect(rejectionPrechecks()).toHaveLength(4);
    const notice = await screen.findByText(/is recorded as rejected by FDA/);
    expect(notice.textContent).toMatch(/^Sequence 0001 is recorded as rejected by FDA, on its Ack3 kept in the Vault, signed by .+ \(responsibility\)\. It is no longer on file with FDA\.$/);
    expect(notice.textContent).not.toMatch(RECORD_KEY);
    expect(document.body.innerHTML).not.toContain('act_r1');
    expect(document.body.innerHTML).not.toContain('6631');
  });

  it('a statement that changed after the dialog opened is not signed', async () => {
    answers = [() => json(OFFERED), () => json(STATED), () => json(STATED), () => json({ ...STATED, rejection: { ...STATED.rejection, statement: `${STATEMENT} (changed)` } })];
    serveCenter(() => json(RECORDED));
    await openAndChoose();
    const dialog = await screen.findByRole('dialog');
    await sign(dialog);
    await waitFor(() => expect(dialog.textContent).toContain('What you would state changed since this dialog opened. Nothing was signed'));
    expect(signBody()).toBeUndefined();
  });

  it('a 200 that is not the record of this sequence is not a success', async () => {
    serveCenter(() => json({ recorded: true, sequenceId: 99 }));
    await openAndChoose();
    const dialog = await screen.findByRole('dialog');
    await sign(dialog);
    await waitFor(() => expect(dialog.textContent).toContain("The server did not confirm that sequence 0001's technical rejection was recorded"));
    expect(text()).not.toMatch(/is recorded as rejected by FDA, on its Ack3/);
  });

  it("the act's refusal is shown in the server's words; nothing is said recorded", async () => {
    const REFUSED = 'Sequence 0001 is already recorded as rejected by FDA (the words of the act, c4e). Nothing was changed.';
    serveCenter(() => json({ error: { code: 'TECHNICAL_REJECTION_NOT_RECORDABLE', message: REFUSED } }, 409));
    await openAndChoose();
    const dialog = await screen.findByRole('dialog');
    await sign(dialog);
    await waitFor(() => expect(dialog.textContent).toContain(REFUSED));
    expect(text()).not.toMatch(/is recorded as rejected by FDA, on its Ack3/);
  });
});
