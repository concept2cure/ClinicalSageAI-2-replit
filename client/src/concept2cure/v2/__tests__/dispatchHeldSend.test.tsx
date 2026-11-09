// @vitest-environment jsdom
/**
 * P-92 C2 (founder, 2026-11-02; amended by P-108 1(b); launch row D7): settle a held FDA send from the Dispatch tab.
 *
 * The server's half is C1: `POST /sequences/:id/governed-precheck {step:'held-send-settlement'}` answers which ways the
 * send can be settled and, for a chosen way, the statement the signer makes and the evidence it cites;
 * `POST /sequences/:id/held-send/settle {signatureActionId, outcome}` is the act. This file pins the screen against that
 * contract (mocked at apiRequest). Design: docs/evidence/RIM/2026-11-08-designs/p92-settle-held-fda-send.design.md §5 C2,
 * as re-cut in §10.3 D.
 *
 *   T1  the door: only while a send is held; closed by default; asked again on every open; the ways offered, the ways
 *       refused in the server's words, the creator, no signing authority, an unreadable answer; FDA's document chosen
 *       in this project's Vault, or the platform's own proof with no document; the statement before signing.
 *   T2  the one signature, through the real Submission Center: Responsibility only, the server's statement word for
 *       word (precheck, dialog, signed row and sign payload are one string), asked again before signing, then the act;
 *       no record key and no signature id on screen; a 200 that is not a settlement is not a success.
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
const DOC = { id: '0b000000-0000-4000-8000-000000000001', title: 'FDA Ack2 for sequence 0001', version: '1', current: true,
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
const HELD_LINE = 'A send of this sequence is in flight and not yet confirmed (the words of this precheck, 92a).';
const TRANSMIT = (dispatchStatus: string, refusal: string | null = HELD_LINE) => ({
  sequenceStatus: 'dispatched', dispatchStatus, route: { ok: true, region: 'fda', gateway: 'esg' },
  configured: { staging: true, production: true }, recordedApplicationNumber: '000512', recordedApplicant: 'BX Bio', gate: CLEAR, refusal,
});
const SENT_AT = '2026-11-03T14:05:00.000Z';
const OVERVIEW = {
  sequenceNumber: '0001', sentAt: SENT_AT, as2MessageId: '<msg-21@sponsor.example>', transmittalId: 41,
  attemptId: '0b000000-0000-4000-8000-0000000000a1', transport: 'as2', receiptUpload: true,
  outcomes: { received: null, 'not-received': null }, platformProof: null, signerRefusal: null,
};
const OFFERED = { step: 'held-send-settlement', cleared: true, refusal: null, heldSend: OVERVIEW };
const PROOF_OVERVIEW = {
  ...OVERVIEW, as2MessageId: null, receiptUpload: false, platformProof: 'no-as2-message',
  outcomes: { received: "The platform's record shows this send never left the platform, so an FDA acknowledgement cannot be for it. Nothing was changed.", 'not-received': null },
};
const RECEIVED_STATEMENT = 'FDA’s Ack2 for the send of sequence 0001 is the document chosen (the words of this precheck, 92b).';
const PROOF_STATEMENT = 'The platform’s own record shows the send of sequence 0001 never left (the words of this precheck, 92c). It files it twice if wrong.';
const RECEIVED_EVIDENCE = { kind: 'ack2', vaultDocumentId: DOC.id, sha256: DOC.contentHash };
const PROOF_EVIDENCE = { kind: 'platform-proof', proof: 'no-as2-message', transmittalId: 41 };
const chosen = (overview: object, statement: string, evidence: object) =>
  ({ step: 'held-send-settlement', cleared: true, refusal: null, heldSend: { ...overview, statement, evidence } });
const CREATOR = 'You created sequence 0001, so you cannot sign the settlement of its held send. Another person with signing authority signs it.';
const IN_PROGRESS = 'This send of sequence 0001 may still be in progress, so it is not settled yet. Nothing was changed. If the platform hears nothing more of it, it can be settled after 4 November 2026 at 14:05 UTC.';

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() }) as unknown as Response;
const text = () => document.body.textContent ?? '';
const RECORD_KEY = /\b[a-z-]+:\d+\b/;

type Handler = (method: string, url: string, body?: unknown) => Response | undefined;
let extra: Handler = () => undefined;
let transmit: () => Response = () => json({ step: 'transmit', cleared: false, refusal: HELD_LINE, transmit: TRANSMIT('transmitting') });
/** The held-send answers, in order; the last one repeats. Each gets the body asked with. */
let heldAnswers: Array<(body: Record<string, unknown>) => Response | Promise<Response>> = [];
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
      if (b.step === 'held-send-settlement') {
        const next = heldAnswers.length > 1 ? heldAnswers.shift()! : heldAnswers[0] ?? (() => json(OFFERED));
        return next(b);
      }
      return json({ step: b.step, cleared: false, refusal: 'Not at this step.' });
    }
    return json({ data: [] });
  });
}
const heldPrechecks = () =>
  calls.filter((c) => c.method === 'POST' && c.url.endsWith('/governed-precheck') && (c.body as { step?: string })?.step === 'held-send-settlement');

const door = () => screen.getByTestId('held-send') as HTMLElement & { open: boolean };
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
  heldAnswers = [];
  transmit = () => json({ step: 'transmit', cleared: false, refusal: HELD_LINE, transmit: TRANSMIT('transmitting') });
  serve();
});

const renderDispatch = async (onGoverned = vi.fn()) => {
  render(<DispatchWorkspace sub={SUB as never} seq={SEQ} onGoverned={onGoverned} />);
  await waitFor(() => expect(screen.getByTestId('held-send')).toBeTruthy());
  return onGoverned;
};

/* ── T1: the door ─────────────────────────────────────────────────────────── */

describe('T1 — "Settle the held send…" where the send is told', () => {
  it('S0: the held line, then a closed, quiet door that asks nothing until opened', async () => {
    await renderDispatch();
    expect(text()).toContain(`Transmit is not available: ${HELD_LINE.replace(/\.$/, '')}.`);
    const d = door();
    expect(d.tagName).toBe('DETAILS');
    expect(d.className).toBe('pj-more sc-mt');
    expect(d.open).toBe(false);
    expect(d.querySelector('summary')?.textContent).toBe('Settle the held send…');
    expect(heldPrechecks()).toHaveLength(0);
  });

  it.each(['pending', 'sent', 'acknowledged', 'rejected'])('there is no door while the dispatch status is %s', async (status) => {
    transmit = () => json({ step: 'transmit', cleared: false, refusal: 'Not now.', transmit: TRANSMIT(status, 'Not now.') });
    render(<DispatchWorkspace sub={SUB as never} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(text()).toContain('Transmit is not available: Not now.'));
    expect(screen.queryByTestId('held-send')).toBeNull();
  });

  it('S1 → S2: reading, then the send, the MDN on Gateway transmittals, and the two ways, each said', async () => {
    let release: () => void = () => undefined;
    const waiting = new Promise<void>((r) => { release = r; });
    heldAnswers = [() => waiting.then(() => json(OFFERED))];
    await renderDispatch();
    setOpen(true);
    const reading = await within(door()).findByRole('status');
    expect(reading.textContent).toBe('Checking how this send can be settled…');
    expect(heldPrechecks().map((c) => c.body)).toEqual([{ step: 'held-send-settlement' }]);
    release();
    await waitFor(() => expect(button('Record as received')).not.toBeNull());
    const body = door().textContent ?? '';
    expect(body).toContain("Sequence 0001's send of 3 November 2026 at 14:05 UTC is held: the platform holds no verified answer from FDA to it.");
    expect(body).toContain("If FDA's signed receipt (its MDN) for this send arrives, record it on Gateway transmittals with 'Record agency MDN', which checks FDA's signature on it.");
    expect(body).toContain("On FDA's Ack2 or Ack3 for this send. Sequence 0001 is then on file with FDA and is not sent again.");
    expect(body).toContain("On FDA's written confirmation that this send did not arrive. Sequence 0001 can then be sent again, under a new signature.");
    for (const name of ['Record as received', 'Release as not received']) expect(button(name)!.className).toBe('btn ghost small');
    // No upload here (A3 is not reached), no unsigned way, no tinted box, no record key.
    expect(button(/Record agency MDN/)).toBeNull();
    expect(body).not.toMatch(/without a signature/i);
    expect(door().querySelector('.sc-verdict, .rd-chip')).toBeNull();
    expect(body).not.toMatch(RECORD_KEY);
  });

  it('asks again on every open and keeps no answer across a close', async () => {
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(button('Record as received')).not.toBeNull());
    setOpen(false);
    expect(button('Record as received')).toBeNull();
    setOpen(true);
    await waitFor(() => expect(button('Record as received')).not.toBeNull());
    expect(heldPrechecks()).toHaveLength(2);
  });

  it.each([
    ['S11, a send that may still be in progress', IN_PROGRESS],
    ['S3, a send FDA already answered', "FDA's signed answer to this send is already kept on the platform, so it is not settled by a signature here. Nothing was changed."],
  ])("%s: the server's sentence as a note, no opening line and no button", async (_label, refusal) => {
    heldAnswers = [() => json({ step: 'held-send-settlement', cleared: false, refusal, heldSend: { ...OVERVIEW, outcomes: { received: refusal, 'not-received': refusal } } })];
    await renderDispatch();
    setOpen(true);
    const note = await within(door()).findByRole('note');
    expect(note.textContent).toBe(refusal);
    expect(within(door()).queryAllByRole('button')).toEqual([]);
    expect(door().textContent).not.toMatch(/is held: the platform holds no verified answer/);
  });

  it('one way refused: its sentence stands where its button would, and the other way is offered', async () => {
    const refused = "FDA's AS2 endpoint refused this send when it was made, so FDA did not unpack it and an acknowledgement cannot be for it. Nothing was changed.";
    heldAnswers = [() => json({ ...OFFERED, heldSend: { ...OVERVIEW, outcomes: { received: refused, 'not-received': null } } })];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(button('Release as not received')).not.toBeNull());
    expect(button('Record as received')).toBeNull();
    expect(door().textContent).toContain(refused);
  });

  it("S4: the sequence's creator is told why, and offered no way; the MDN sentence stays", async () => {
    heldAnswers = [() => json({ ...OFFERED, heldSend: { ...OVERVIEW, signerRefusal: CREATOR } })];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(door().textContent).toContain(CREATOR));
    expect(within(door()).queryAllByRole('button')).toEqual([]);
    expect(door().textContent).toContain("record it on Gateway transmittals with 'Record agency MDN'");
  });

  it.each([
    ['a failed read', () => json({ error: { code: 'INTERNAL', message: 'Internal error' } }, 500)],
    ['an answer of another shape', () => json({ ok: true })],
    ['an overview without its outcomes', () => json({ ...OFFERED, heldSend: { ...OVERVIEW, outcomes: undefined } })],
  ])('S5: %s is "could not be checked", never "nothing to settle"', async (_label, answer) => {
    heldAnswers = [answer];
    await renderDispatch();
    setOpen(true);
    const said = await within(door()).findByRole('status');
    await waitFor(() => expect(said.textContent).toBe('How this send can be settled could not be checked. Close this and open it again to retry.'));
    expect(within(door()).queryAllByRole('button')).toEqual([]);
  });
});

describe("T1b — a way chosen: FDA's document, or the platform's own proof, then the statement", () => {
  it("S2a, received: FDA's document from this project's Vault and which acknowledgement it is, then the statement and the sign button", async () => {
    heldAnswers = [() => json(OFFERED), () => json(chosen(OVERVIEW, RECEIVED_STATEMENT, RECEIVED_EVIDENCE))];
    const onGoverned = await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(button('Record as received')).not.toBeNull());
    fireEvent.click(button('Record as received')!);
    const picker = within(door()).getByTestId('vault-picker');
    expect(picker.textContent).toBe("Find FDA's document in this project's Vault");
    expect(picker.getAttribute('data-program')).toBe(PROGRAM);
    const radios = within(door()).getAllByRole('radio').map((r) => r.closest('label')?.textContent);
    expect(radios).toEqual(['Ack2: FDA unpacked it and delivered it to the center', "Ack3: the center's validation result"]);
    fireEvent.click(picker);
    fireEvent.click(within(door()).getByLabelText('Ack2: FDA unpacked it and delivered it to the center'));
    await waitFor(() => expect(button('Sign: record sequence 0001 as received')).not.toBeNull());
    expect(heldPrechecks().at(-1)?.body).toEqual({ step: 'held-send-settlement', outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: DOC.id });
    const stated = within(door()).getByTestId('held-send-would-state');
    expect(stated.textContent).toBe(`By signing, you would state:${RECEIVED_STATEMENT}`);
    expect(stated.querySelector('q')?.textContent).toBe(RECEIVED_STATEMENT);
    expect(button('Sign: record sequence 0001 as received')!.className).toBe('btn ghost small');
    fireEvent.click(button('Sign: record sequence 0001 as received')!);
    expect(onGoverned).toHaveBeenCalledWith(SEQ, 'held-send-settlement', undefined, undefined,
      { outcome: 'received', evidenceKind: 'ack2', evidenceDocumentId: DOC.id, documentLabel: 'FDA Ack2 for sequence 0001, version 1' });
  });

  it("S2a, a chosen document the server refuses: its sentence, and no sign button", async () => {
    const refusal = "This document was in the Vault before this send was made, or it already settled another send of sequence 0001, so it cannot be FDA's answer to this one. Nothing was changed.";
    heldAnswers = [() => json(OFFERED), () => json({ step: 'held-send-settlement', cleared: false, refusal, heldSend: OVERVIEW })];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(button('Release as not received')).not.toBeNull());
    fireEvent.click(button('Release as not received')!);
    fireEvent.click(within(door()).getByTestId('vault-picker'));
    await waitFor(() => expect(door().textContent).toContain(refusal));
    expect(button(/^Sign:/)).toBeNull();
    expect(heldPrechecks().at(-1)?.body).toEqual({ step: 'held-send-settlement', outcome: 'not-received', evidenceKind: 'fda-non-receipt-confirmation', evidenceDocumentId: DOC.id });
  });

  it("the platform's own proof: no Vault document, the server's sentence, and the release offered on it", async () => {
    heldAnswers = [() => json({ ...OFFERED, heldSend: PROOF_OVERVIEW }), () => json(chosen(PROOF_OVERVIEW, PROOF_STATEMENT, PROOF_EVIDENCE))];
    const onGoverned = await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(button('Release as not received')).not.toBeNull());
    const body = door().textContent ?? '';
    expect(body).toContain("On the platform's own record that this send never left. Sequence 0001 can then be sent again, under a new signature.");
    expect(body).toContain(PROOF_OVERVIEW.outcomes.received);
    // No MDN can come for a message never formed, so Gateway transmittals is not offered.
    expect(body).not.toMatch(/Record agency MDN/);
    fireEvent.click(button('Release as not received')!);
    expect(within(door()).queryByTestId('vault-picker')).toBeNull();
    await waitFor(() => expect(button("Sign: release sequence 0001's send")).not.toBeNull());
    expect(heldPrechecks().at(-1)?.body).toEqual({ step: 'held-send-settlement', outcome: 'not-received', evidenceKind: 'platform-proof' });
    expect(within(door()).getByTestId('held-send-would-state').querySelector('q')?.textContent).toBe(PROOF_STATEMENT);
    fireEvent.click(button("Sign: release sequence 0001's send")!);
    expect(onGoverned).toHaveBeenCalledWith(SEQ, 'held-send-settlement', undefined, undefined,
      { outcome: 'not-received', evidenceKind: 'platform-proof' });
  });

  /* Found by the walk (2026-11-09): after a release, the panel's refusal is the dispatch gate's, which can name a record
     key. The line says it in words, as every blocker on the page does (blockerForDisplay, D7-A2 step 10). */
  it('the transmit refusal line never shows a record key', async () => {
    const gate = 'Dispatch gate blocks transmit: no dispatch-intent signature is recorded on ectd-sequence:21.';
    transmit = () => json({ step: 'transmit', cleared: false, refusal: gate, transmit: TRANSMIT('pending', gate) });
    render(<DispatchWorkspace sub={SUB as never} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(text()).toContain('Transmit is not available: Dispatch gate blocks transmit: no dispatch-intent signature is recorded on this sequence.'));
    expect(document.body.innerHTML).not.toContain('ectd-sequence:21');
  });

  it('S10: a resend FDA has contradicted shows the server sentence through the readiness line, with no door', async () => {
    const held = "FDA's signed receipt shows it already received sequence 0001's send of 3 November 2026 at 14:05 UTC, which was released as not received. Sequence 0001 is not sent again. Nothing was signed or sent.";
    transmit = () => json({ step: 'transmit', cleared: false, refusal: held, transmit: TRANSMIT('pending', held) });
    render(<DispatchWorkspace sub={SUB as never} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(text()).toContain(`Transmit is not available: ${held.replace(/\.$/, '')}.`));
    expect(screen.queryByTestId('held-send')).toBeNull();
    expect(screen.getByRole('button', { name: /File sequence 0001 with the agency|Send sequence 0001/ }).hasAttribute('disabled')).toBe(true);
  });
});

/* ── T2: the one signature, through the real Submission Center ─────────── */

const SIGN = { actionId: 'act_h1', auditId: 'a-9', sha256Chain: 'c0ffee', state: 'executed' };
const SETTLE_URL = '/api/submissions/sequences/21/held-send/settle';
const RELEASED = {
  settled: true, sequenceId: 21, sequenceNumber: '0001', outcome: 'not-received', evidenceKind: 'platform-proof', dispatchStatus: 'pending',
  transmittalId: 41, transmitAttemptId: OVERVIEW.attemptId, signatureActionId: 'act_h1', signatureId: 5521, settledAt: '2026-11-04T09:00:00.000Z',
};
const REASON = 'FDA holds no record of this send; platform proof reviewed.';

function serveCenter(act: () => Response) {
  extra = (method, url) => {
    if (method === 'GET' && url === '/api/submissions') return json([SUB]);
    if (method === 'GET' && url === '/api/submissions/7/sequences') return json([SEQ]);
    if (method === 'GET' && url === '/api/510k/estar/submissions') return json({ submissions: [] });
    if (method === 'POST' && url === '/api/510k/estar/assemble') return json({ artifactKind: 'none', blockers: [] });
    if (method === 'POST' && url === '/api/c2c/actions/sign') return json(SIGN);
    if (method === 'POST' && url === SETTLE_URL) return act();
    return undefined;
  };
}

/** The door opened, the release on the platform's own proof chosen, its sign button pressed. */
async function openRelease() {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
  await waitFor(() => expect(text()).toContain('BX-256 IND'));
  fireEvent.click(screen.getByRole('tab', { name: 'Dispatch' }));
  await waitFor(() => expect(screen.getByTestId('held-send')).toBeTruthy());
  setOpen(true);
  await waitFor(() => expect(button('Release as not received')).not.toBeNull());
  fireEvent.click(button('Release as not received')!);
  await waitFor(() => expect(button("Sign: release sequence 0001's send")).not.toBeNull());
  fireEvent.click(button("Sign: release sequence 0001's send")!);
}

async function sign(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('Reason for this action'), { target: { value: REASON } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'hunter22' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
}
const signBody = () => calls.find((c) => c.method === 'POST' && c.url === '/api/c2c/actions/sign')?.body as
  { target: string; payload: Record<string, unknown> } | undefined;

describe('T2 — the one signature, Responsibility only, the statement word for word', () => {
  beforeEach(() => {
    heldAnswers = [() => json({ ...OFFERED, heldSend: PROOF_OVERVIEW }), () => json(chosen(PROOF_OVERVIEW, PROOF_STATEMENT, PROOF_EVIDENCE))];
  });

  it("signs the server's statement, asks again, then settles; no record key and no signature id on screen", async () => {
    serveCenter(() => json(RELEASED));
    await openRelease();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Responsibility']);
    const stated = within(dialog).getByTestId('held-send-statement');
    expect(stated.textContent).toBe(`By signing, you state:${PROOF_STATEMENT}`);
    expect(stated.querySelector('q')?.textContent).toBe(PROOF_STATEMENT);
    const meta = within(dialog).getByText(/settles the held send of/);
    expect(meta.textContent).toBe('FDA (US) · settles the held send of 3 November 2026; nothing is sent to FDA');
    expect(dialog.textContent).not.toMatch(RECORD_KEY);

    await sign(dialog);
    await waitFor(() => expect(text()).toContain('Signature applied'));
    expect(signBody()).toEqual(expect.objectContaining({
      target: 'ectd-sequence:21',
      payload: {
        intent: 'held-send-settlement', meaning: 'responsibility', outcome: 'not-received', transmittalId: 41,
        transmitAttemptId: OVERVIEW.attemptId, evidence: PROOF_EVIDENCE, statement: PROOF_STATEMENT,
      },
    }));
    expect(calls.find((c) => c.method === 'POST' && c.url === SETTLE_URL)?.body).toEqual({ signatureActionId: 'act_h1', outcome: 'not-received' });
    // Asked: on open, for the choice, before the dialog, and again before signing.
    expect(heldPrechecks()).toHaveLength(4);
    expect(within(dialog).getByText('Stated')).toBeTruthy();
    // The signed manifest names the act in words.
    expect(dialog.textContent).toContain("Release sequence 0001's held send");

    const notice = await screen.findByText(/held send is released as not received/);
    expect(notice.textContent).toMatch(
      /^Sequence 0001's held send is released as not received, on the platform's own record that it never left, signed by .+ \(responsibility\)\. It can be sent again, under a new signature\.$/,
    );
    for (const shown of [notice.textContent ?? '', meta.textContent ?? '']) {
      expect(shown).not.toMatch(RECORD_KEY);
      expect(shown).not.toContain('act_h1');
      expect(shown).not.toContain('5521');
    }
    expect(document.body.innerHTML).not.toContain('act_h1');
  });

  it('a received settlement names the FDA document it rests on in the signed rows and the notice', async () => {
    heldAnswers = [() => json(OFFERED), () => json(chosen(OVERVIEW, RECEIVED_STATEMENT, RECEIVED_EVIDENCE))];
    serveCenter(() => json({ ...RELEASED, outcome: 'received', evidenceKind: 'ack2', dispatchStatus: 'sent' }));
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(text()).toContain('BX-256 IND'));
    fireEvent.click(screen.getByRole('tab', { name: 'Dispatch' }));
    await waitFor(() => expect(screen.getByTestId('held-send')).toBeTruthy());
    setOpen(true);
    await waitFor(() => expect(button('Record as received')).not.toBeNull());
    fireEvent.click(button('Record as received')!);
    fireEvent.click(within(door()).getByTestId('vault-picker'));
    fireEvent.click(within(door()).getByLabelText('Ack2: FDA unpacked it and delivered it to the center'));
    await waitFor(() => expect(button('Sign: record sequence 0001 as received')).not.toBeNull());
    fireEvent.click(button('Sign: record sequence 0001 as received')!);
    const dialog = await screen.findByRole('dialog');
    await sign(dialog);
    await waitFor(() => expect(text()).toContain('Signature applied'));
    expect(dialog.textContent).toContain('Record sequence 0001 as received');
    expect(within(dialog).getByText('FDA document')).toBeTruthy();
    expect(dialog.textContent).toContain('FDA Ack2 for sequence 0001, version 1');
    expect(signBody()?.payload).toMatchObject({ outcome: 'received', evidence: RECEIVED_EVIDENCE, statement: RECEIVED_STATEMENT });
    const notice = await screen.findByText(/is recorded as received by FDA/);
    expect(notice.textContent).toMatch(/^Sequence 0001 is recorded as received by FDA, on its Ack2 kept in the Vault, signed by .+ \(responsibility\)\.$/);
  });

});

describe('T2b — what is not signed, and what is not a success', () => {
  beforeEach(() => {
    heldAnswers = [() => json({ ...OFFERED, heldSend: PROOF_OVERVIEW }), () => json(chosen(PROOF_OVERVIEW, PROOF_STATEMENT, PROOF_EVIDENCE))];
  });

  it('a statement that changed after the dialog opened is not signed', async () => {
    heldAnswers = [
      () => json({ ...OFFERED, heldSend: PROOF_OVERVIEW }), () => json(chosen(PROOF_OVERVIEW, PROOF_STATEMENT, PROOF_EVIDENCE)),
      () => json(chosen(PROOF_OVERVIEW, PROOF_STATEMENT, PROOF_EVIDENCE)),
      () => json(chosen(PROOF_OVERVIEW, `${PROOF_STATEMENT} Changed.`, PROOF_EVIDENCE)),
    ];
    serveCenter(() => json(RELEASED));
    await openRelease();
    const dialog = await screen.findByRole('dialog');
    await sign(dialog);
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain(
      'What you would state changed since this dialog opened. Nothing was signed; close it and open it again.'));
    expect(signBody()).toBeUndefined();
    expect(calls.some((c) => c.url === SETTLE_URL)).toBe(false);
  });

  it("S7: the act's refusal is shown inline, with the server's words; nothing is said settled", async () => {
    const refusal = "Sequence 0001's held send changed while its settlement was being recorded, so it was not settled. " +
      'The signature given for this settlement of the held send is now void; sign again for a new attempt.';
    serveCenter(() => json({ error: { code: 'INVALID_STATE', message: refusal } }, 409));
    await openRelease();
    const dialog = await screen.findByRole('dialog');
    await sign(dialog);
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain(refusal));
    expect(text()).not.toContain('Signature applied');
    expect(text()).not.toMatch(/is released as not received/);
  });

  it.each([
    ['without settled: true', { ...RELEASED, settled: undefined }],
    ['for another sequence', { ...RELEASED, sequenceId: 22 }],
    ['the other way', { ...RELEASED, outcome: 'received' }],
    ['an empty body', {}],
  ])('a 200 %s is not a success', async (_label, answer) => {
    serveCenter(() => json(answer));
    await openRelease();
    const dialog = await screen.findByRole('dialog');
    await sign(dialog);
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain("The server did not confirm that sequence 0001's held send was settled"));
    expect(text()).not.toContain('Signature applied');
    expect(text()).not.toMatch(/is released as not received/);
  });

  it('a cleared answer without the statement opens no signature', async () => {
    heldAnswers = [
      () => json({ ...OFFERED, heldSend: PROOF_OVERVIEW }), () => json(chosen(PROOF_OVERVIEW, PROOF_STATEMENT, PROOF_EVIDENCE)),
      () => json(chosen(PROOF_OVERVIEW, '', PROOF_EVIDENCE)),
    ];
    serveCenter(() => json(RELEASED));
    await openRelease();
    await waitFor(() => expect(text()).toMatch(/Settling a held send of sequence 0001 not started — Whether the server would accept this could not be checked/));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
