// @vitest-environment jsdom
/**
 * P-99 C2/C4a (F1, rows D7 and D2): put a sent sequence's send on record from the Dispatch tab, read back from the
 * package the platform kept. The server's half: `POST /sequences/:id/governed-precheck {step:'sent-record'}` answers how
 * the send can be put on record and what would be recorded; `POST /sequences/:id/sent-record/rederive {reason,
 * manifestSha256}` is the act. Unsigned: no dialog. The door sits under "Transmit is not available" for a filed sequence
 * whose record is read from its compiles or from nothing, and only then. The statement path comes with C3.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DispatchWorkspace } from '../surfaces/SubmissionSeqWorkspaces';

const PROGRAM = '099991d1-dac8-43c5-b88a-8baab26194ee';
const SUB = { id: 7, title: 'BX-256 IND', productName: 'BX-256', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: PROGRAM };
const SEQ = { id: 21, sequenceNumber: '0001', type: 'amendment', status: 'dispatched', region: 'fda', validationStatus: 'passed' };
const CLEAR = { cleared: true, blockers: [] as string[] };
const READINESS = {
  sequenceId: 21, region: 'fda', sequenceStatus: 'dispatched', validationErrors: 0, unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1, shadowReviewMissing: false, gate: CLEAR, freezeGate: CLEAR, dispatchGateOnSigning: CLEAR,
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 1, signer: { state: 'independent', sources: [] },
};
const ON_FILE = 'Sequence 0001 was already transmitted; it is not sent again. A correction is a new sequence.';
const transmitAnswer = (basis: 'none' | 'compiles' | 'transmit' | null, dispatchStatus = 'sent') => ({ step: 'transmit', cleared: false, refusal: ON_FILE, transmit: {
  sequenceStatus: 'dispatched', dispatchStatus, route: { ok: true, region: 'fda', gateway: 'esg' }, configured: { staging: true, production: true },
  recordedApplicationNumber: '000512', recordedApplicant: 'BX Bio', gate: CLEAR, refusal: ON_FILE, sentRecord: basis === null ? null : { basis },
} });
const SHA = 'a'.repeat(64);
const OFFERED = { step: 'sent-record', cleared: true, refusal: null, sentRecord: {
  sequenceNumber: '0001', sentAt: '2026-11-03T14:05:00.000Z', agency: 'fda', basis: 'none', path: 'read-back',
  readBack: { leafCount: 2, manifestSha256: SHA, notRecoverable: ['sourceMd5', 'originalPdfProof'], leaves: [
    { ctdSection: '3.2.S.4.2', fileName: 'analytical-procedures.pdf', operation: 'new', title: 'Analytical procedures' },
    { ctdSection: 'm1.2', fileName: 'cover.pdf', operation: 'replace', title: 'Cover letter' },
  ] } } };
const REFUSED = { step: 'sent-record', cleared: false, refusal: 'Sequence 0000, before it, is not on record either. Put sequence 0000 on record first. Nothing was changed.',
  sentRecord: { sequenceNumber: '0001', sentAt: null, agency: 'fda', basis: 'none', path: null } };

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() }) as unknown as Response;
const text = () => document.body.textContent ?? '';
const RECORD_KEY = /\b[a-z-]+:\d+\b/;

let basis: 'none' | 'compiles' | 'transmit' | null = 'none';
let dispatchStatus = 'sent';
let precheck: () => Response = () => json(OFFERED);
let act: () => Response = () => json({ recorded: true, sequenceId: 21, sequenceNumber: '0001', transmittalId: 41, leafCount: 2, manifestSha256: SHA, recordedAt: '2026-11-09T21:00:00.000Z' });
const calls: Array<{ method: string; url: string; body?: unknown }> = [];

function serve() {
  apiRequest.mockImplementation(async (method: string, rawUrl: unknown, body?: unknown) => {
    const url = String(rawUrl ?? '');
    calls.push({ method, url, body });
    if (method === 'GET' && url.endsWith('/dispatch-readiness')) return json({ data: READINESS });
    if (method === 'GET' && url.startsWith('/api/mdx/gateways/transmittals?')) return json({ data: [], meta: { count: 0 } });
    if (method === 'POST' && url.endsWith('/sent-record/rederive')) return act();
    if (method === 'POST' && url.endsWith('/governed-precheck')) {
      const b = (body ?? {}) as Record<string, unknown>;
      if (b.step === 'transmit') return json(transmitAnswer(basis, dispatchStatus));
      if (b.step === 'sent-record') return precheck();
      return json({ step: b.step, cleared: false, refusal: 'Not at this step.' });
    }
    return json({ data: [] });
  });
}
const prechecksOf = (step: string) => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/governed-precheck') && (c.body as { step?: string })?.step === step);
const door = () => screen.getByTestId('sent-record') as HTMLElement & { open: boolean };
const setOpen = (open: boolean) => { const d = door(); d.open = open; fireEvent(d, new Event('toggle')); };

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  calls.length = 0;
  basis = 'none';
  dispatchStatus = 'sent';
  precheck = () => json(OFFERED);
  act = () => json({ recorded: true, sequenceId: 21, sequenceNumber: '0001', transmittalId: 41, leafCount: 2, manifestSha256: SHA, recordedAt: '2026-11-09T21:00:00.000Z' });
  serve();
});
const renderDispatch = async () => {
  render(<DispatchWorkspace sub={SUB as never} seq={SEQ} onGoverned={vi.fn()} />);
  await waitFor(() => expect(text()).toContain('Transmit is not available'));
};

describe('C4a — "Put sequence NNNN\'s send on record…" under a filed sequence with nothing, or only compiles, on record', () => {
  it('nothing on record: the line says so, and a closed, quiet door asks nothing until opened', async () => {
    await renderDispatch();
    expect(text()).toContain('Nothing on record says what sequence 0001 carried, so the next sequence of this submission cannot be built against it.');
    expect(door().className).toBe('pj-more sc-mt');
    expect(door().open).toBe(false);
    expect(within(door()).getByText("Put sequence 0001's send on record…")).toBeTruthy();
    expect(prechecksOf('sent-record')).toHaveLength(0);
  });

  it('read from its compiles: the line says they may differ from what it sent', async () => {
    basis = 'compiles';
    await renderDispatch();
    expect(text()).toContain('Sequence 0001 is read from its compiles, which may differ from what it sent.');
    expect(screen.getByTestId('sent-record')).toBeTruthy();
  });

  it.each([['already read from what it sent', 'transmit', 'sent'], ['not on file', null, 'pending']] as const)('there is no door %s', async (_l, b, d) => {
    basis = b as typeof basis;
    dispatchStatus = d;
    await renderDispatch();
    expect(screen.queryByTestId('sent-record')).toBeNull();
  });

});

describe('C4a — the read-back, recorded as the person read it', () => {
  it('opened: the read-back offered in words, every document listed, and nothing an ID, checksum or path', async () => {
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(within(door()).getByText(/The platform kept the exact package sequence 0001 sent to FDA on 3 November 2026 at 14:05 UTC\./)).toBeTruthy());
    const words = door().textContent ?? '';
    expect(words).toContain('Its record can be read back from that package: 2 documents, listed below. Nothing is sent to the agency.');
    expect(words).toContain('3.2.S.4.2 · analytical-procedures.pdf · new');
    expect(words).toContain('m1.2 · cover.pdf · replace');
    expect(words).toContain("Two things a package does not hold are not recorded: a file's checksum before it was converted to PDF/A, and the proof kept for a signed original.");
    expect(words).not.toMatch(RECORD_KEY);
    expect(words).not.toContain(SHA);
    expect(within(door()).getByRole('button', { name: 'Record what sequence 0001 sent' }).className).toBe('btn ghost small');
  });

  it('records what the person read, with their reason, then says so and re-reads the panel', async () => {
    await renderDispatch();
    setOpen(true);
    const record = await waitFor(() => within(door()).getByRole('button', { name: 'Record what sequence 0001 sent' }));
    expect((record as HTMLButtonElement).disabled, 'no reason given yet').toBe(true);
    fireEvent.change(within(door()).getByLabelText('Why you are recording this'), { target: { value: 'The platform kept the package; recording it.' } });
    const transmitReads = prechecksOf('transmit').length;
    fireEvent.click(record);
    await waitFor(() => expect(text()).toContain("Sequence 0001's record was read back from the package it sent, on 9 November 2026. The next sequence can now be built against it."));
    expect(calls.find((c) => c.url.endsWith('/sent-record/rederive'))?.body).toEqual({ reason: 'The platform kept the package; recording it.', manifestSha256: SHA });
    await waitFor(() => expect(prechecksOf('transmit').length).toBeGreaterThan(transmitReads));
  });

  it("a 200 that is not this sequence's record is not a success, and a refusal is said in the server's words", async () => {
    act = () => json({ recorded: true, sequenceId: 99 });
    await renderDispatch();
    setOpen(true);
    fireEvent.change(await waitFor(() => within(door()).getByLabelText('Why you are recording this')), { target: { value: 'Recording it.' } });
    fireEvent.click(within(door()).getByRole('button', { name: 'Record what sequence 0001 sent' }));
    await waitFor(() => expect(door().textContent).toContain("The server did not confirm that sequence 0001's send was put on record."));
    act = () => json({ error: { code: 'SENT_RECORD_NOT_RESTORABLE', message: 'What would be recorded changed since you read it. Nothing was recorded; open it again.' } }, 409);
    fireEvent.click(within(door()).getByRole('button', { name: 'Record what sequence 0001 sent' }));
    await waitFor(() => expect(door().textContent).toContain('What would be recorded changed since you read it. Nothing was recorded; open it again.'));
  });

  it('not offered: the server’s refusal stands in its words; an unreadable answer is said, never "nothing to restore"', async () => {
    precheck = () => json(REFUSED);
    await renderDispatch();
    setOpen(true);
    await waitFor(() => expect(door().textContent).toContain('Sequence 0000, before it, is not on record either. Put sequence 0000 on record first.'));
    expect(within(door()).queryByRole('button')).toBeNull();
    setOpen(false);
    precheck = () => json({ step: 'sent-record' });
    setOpen(true);
    await waitFor(() => expect(door().textContent).toContain('How this send can be put on record could not be checked. Close this and open it again to retry.'));
  });
});
