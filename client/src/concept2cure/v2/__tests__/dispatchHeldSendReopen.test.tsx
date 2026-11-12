// @vitest-environment jsdom
/**
 * P-92 C3 (P-108 1(c); design §10.5 E (i)): re-open a settlement that FDA's verified answer contradicts, from the Dispatch
 * tab. The server's half: `POST /sequences/:id/governed-precheck {step:'held-send-reopen'}` answers whether it can be
 * re-opened and the statement the signer makes; `POST /sequences/:id/held-send/reopen {signatureActionId}` is the act.
 * The door sits where the transmissions list says FDA's contradicting answer, and only then.
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
const HOLD = "FDA's signed receipt shows it already received sequence 0001's send (the words of this precheck, c3a).";
const TRANSMIT = { step: 'transmit', cleared: false, refusal: HOLD, transmit: {
  sequenceStatus: 'dispatched', dispatchStatus: 'pending', route: { ok: true, region: 'fda', gateway: 'esg' },
  configured: { staging: true, production: true }, recordedApplicationNumber: '000512', recordedApplicant: 'BX Bio', gate: CLEAR, refusal: HOLD,
} };
const KEPT = { verified: true, contradicts: 'not-received', status: 'received', receivedAt: '2026-11-08T10:00:00.000Z', sha256: '9'.repeat(64) };
const row = (over: Record<string, unknown> = {}, settlement: Record<string, unknown> = {}) => ({
  id: 41, status: 'rejected', submitted_at: '2026-11-03T14:05:00.000Z', submitted_by_name: 'Ana Author',
  metadata: { sequence: '0001', environment: 'production', dispatchBinding: { sequenceId: 21 },
    heldSendSettlement: { outcome: 'not-received', kind: 'platform-proof', settledAt: '2026-11-04T09:00:00.000Z', ...settlement }, as2ReceiptHistory: [KEPT] },
  ...over,
});
const OVERVIEW = { sequenceNumber: '0001', outcome: 'not-received', sentAt: '2026-11-03T14:05:00.000Z', keptAt: '2026-11-08T10:00:00.000Z', signerRefusal: null };
const STATEMENT = "FDA's signed receipt for the send of sequence 0001 shows that FDA received it (the words of this precheck, c3b).";
const STATED = { step: 'held-send-reopen', cleared: true, refusal: null,
  reopen: { ...OVERVIEW, statement: STATEMENT, settlementSignatureActionId: 'act_settle', receiptSha256: '9'.repeat(64) } };
const CREATOR = 'You created sequence 0001, so you cannot sign the re-opening of its settlement. Another person with signing authority signs it.';

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() }) as unknown as Response;
const text = () => document.body.textContent ?? '';
const RECORD_KEY = /\b[a-z-]+:\d+\b/;

type Handler = (method: string, url: string, body?: unknown) => Response | undefined;
let extra: Handler = () => undefined;
let rows: unknown[] = [row()];
let answers: Array<() => Response> = [];
const calls: Array<{ method: string; url: string; body?: unknown }> = [];

function serve() {
  apiRequest.mockImplementation(async (method: string, rawUrl: unknown, body?: unknown) => {
    const url = String(rawUrl ?? '');
    calls.push({ method, url, body });
    const hit = extra(method, url, body);
    if (hit) return hit;
    if (method === 'GET' && url.endsWith('/dispatch-readiness')) return json({ data: READINESS });
    if (method === 'GET' && url.startsWith('/api/mdx/gateways/transmittals?')) return json({ data: rows, meta: { count: rows.length } });
    if (method === 'POST' && url.endsWith('/governed-precheck')) {
      const b = (body ?? {}) as Record<string, unknown>;
      if (b.step === 'transmit') return json(TRANSMIT);
      if (b.step === 'held-send-reopen') return (answers.length > 1 ? answers.shift()! : answers[0] ?? (() => json(STATED)))();
      return json({ step: b.step, cleared: false, refusal: 'Not at this step.' });
    }
    return json({ data: [] });
  });
}
const reopenPrechecks = () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/governed-precheck') && (c.body as { step?: string })?.step === 'held-send-reopen');
const door = () => screen.getByTestId('held-send-reopen') as HTMLElement & { open: boolean };
const setOpen = (open: boolean) => { const d = door(); d.open = open; fireEvent(d, new Event('toggle')); };
const button = (name: string | RegExp) => within(door()).queryByRole('button', { name });

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  verifyPassword.mockClear();
  calls.length = 0;
  extra = () => undefined;
  rows = [row()];
  answers = [];
  serve();
});

const renderDispatch = async () => {
  render(<DispatchWorkspace sub={SUB as never} seq={SEQ} onGoverned={vi.fn()} />);
  await waitFor(() => expect(text()).toContain('Transmittal #41'));
};

describe('R1 — "Re-open the settlement on FDA\'s answer…" where FDA\'s contradicting answer is told', () => {
  it('a closed, quiet door under the transmissions that asks nothing until opened', async () => {
    await renderDispatch();
    const d = door();
    expect(d.tagName).toBe('DETAILS');
    expect(d.className).toBe('pj-more sc-mt');
    expect(d.open).toBe(false);
    expect(d.querySelector('summary')?.textContent).toBe("Re-open the settlement on FDA's answer…");
    expect(screen.getByRole('region', { name: 'Transmissions and acknowledgements' }).contains(d)).toBe(true);
    expect(reopenPrechecks()).toHaveLength(0);
  });

  it.each([
    ['no answer of FDA\'s kept against it', () => [row({ metadata: { ...row().metadata, as2ReceiptHistory: [] } })]],
    ['the settlement already re-opened', () => [row({}, { reopenedBy: { at: '2026-11-09T18:00:00.000Z' } })]],
    ["another sequence's row", () => [row({ metadata: { ...row().metadata, dispatchBinding: { sequenceId: 99 } } })]],
  ])('there is no door with %s', async (_label, make) => {
    rows = make();
    await renderDispatch();
    expect(screen.queryByTestId('held-send-reopen')).toBeNull();
  });

  it("opened: the server's statement and a quiet sign button", async () => {
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(within(door()).getByTestId('held-send-reopen-would-state')).toBeTruthy());
    expect(within(door()).getByTestId('held-send-reopen-would-state').querySelector('q')?.textContent).toBe(STATEMENT);
    expect(button("Sign: re-open sequence 0001's settlement")?.className).toBe('btn ghost small');
    expect(door().textContent).not.toMatch(RECORD_KEY);
  });

  it("the server's refusal stands in its words; the creator is told; an unreadable answer is said", async () => {
    const REFUSED = 'Sequence 0001 is no longer where its release left it (the words of this precheck, c3c). Nothing was changed.';
    answers = [() => json({ step: 'held-send-reopen', cleared: false, refusal: REFUSED, reopen: OVERVIEW })];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(door().textContent).toContain(REFUSED));
    expect(button(/Sign:/)).toBeNull();
    cleanup();
    answers = [() => json({ ...STATED, reopen: { ...STATED.reopen, signerRefusal: CREATOR } })];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(door().textContent).toContain(CREATOR));
    expect(button(/Sign:/)).toBeNull();
    cleanup();
    answers = [() => json({ step: 'held-send-reopen', cleared: true })];
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(door().textContent).toContain('Whether the settlement can be re-opened could not be checked.'));
  });
});

const SIGN = { actionId: 'act_o1', auditId: 'a-9', sha256Chain: 'c0ffee', state: 'executed' };
const ACT_URL = '/api/submissions/sequences/21/held-send/reopen';
const REOPENED = { reopened: true, sequenceId: 21, sequenceNumber: '0001', outcome: 'not-received', dispatchStatus: 'sent', transmittalId: 41, signatureActionId: 'act_o1', signatureId: 7741, reopenedAt: '2026-11-09T19:00:00.000Z' };
const REASON = "FDA's signed receipt shows it received sequence 0001's send.";
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
async function openAndSign() {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
  await waitFor(() => expect(text()).toContain('BX-256 IND'));
  fireEvent.click(screen.getByRole('tab', { name: 'Dispatch' }));
  await waitFor(() => expect(screen.getByTestId('held-send-reopen')).toBeTruthy());
  setOpen(true);
  await waitFor(() => expect(button("Sign: re-open sequence 0001's settlement")).not.toBeNull());
  fireEvent.click(button("Sign: re-open sequence 0001's settlement")!);
}
async function sign(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('Reason for this action'), { target: { value: REASON } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'hunter22' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
}
const signBody = () => calls.find((c) => c.method === 'POST' && c.url === '/api/c2c/actions/sign')?.body as { target: string; payload: Record<string, unknown> } | undefined;

describe('R2 — the one signature, Responsibility only, the statement word for word', () => {
  it("signs the server's statement, asks again, then re-opens; no record key or signature id on screen", async () => {
    serveCenter(() => json(REOPENED));
    await openAndSign();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Responsibility']);
    expect(within(dialog).getByTestId('held-send-reopen-statement').querySelector('q')?.textContent).toBe(STATEMENT);
    expect(within(dialog).getByText(/re-opens the settlement/).textContent).toBe("FDA (US) · re-opens the settlement on FDA's signed answer of 8 November 2026; nothing is sent to FDA");
    expect(dialog.textContent).not.toMatch(RECORD_KEY);
    await sign(dialog);
    await waitFor(() => expect(text()).toContain('Signature applied'));
    expect(signBody()).toEqual(expect.objectContaining({ target: 'ectd-sequence:21',
      payload: { intent: 'held-send-reopen', meaning: 'responsibility', settlementSignatureActionId: 'act_settle', receiptSha256: '9'.repeat(64), statement: STATEMENT } }));
    expect(calls.find((c) => c.method === 'POST' && c.url === ACT_URL)?.body).toEqual({ signatureActionId: 'act_o1' });
    expect(reopenPrechecks()).toHaveLength(3);
    const notice = await screen.findByText(/is recorded as received by FDA, on FDA's signed receipt/);
    expect(notice.textContent).toMatch(/^Sequence 0001 is recorded as received by FDA, on FDA's signed receipt, signed by .+ \(responsibility\)\. The release stays on the record beside it\.$/);
    expect(document.body.innerHTML).not.toContain('act_o1');
    expect(document.body.innerHTML).not.toContain('7741');
  });

  it('a statement that changed after the dialog opened is not signed', async () => {
    answers = [() => json(STATED), () => json(STATED), () => json({ ...STATED, reopen: { ...STATED.reopen, statement: `${STATEMENT} (changed)` } })];
    serveCenter(() => json(REOPENED));
    await openAndSign();
    const dialog = await screen.findByRole('dialog');
    await sign(dialog);
    await waitFor(() => expect(dialog.textContent).toContain('What you would state changed since this dialog opened. Nothing was signed'));
    expect(signBody()).toBeUndefined();
  });

  it('a 200 that is not the re-opening of this sequence is not a success', async () => {
    serveCenter(() => json({ reopened: true, sequenceId: 99 }));
    await openAndSign();
    const dialog = await screen.findByRole('dialog');
    await sign(dialog);
    await waitFor(() => expect(dialog.textContent).toContain("The server did not confirm that sequence 0001's settlement was re-opened"));
  });
});
