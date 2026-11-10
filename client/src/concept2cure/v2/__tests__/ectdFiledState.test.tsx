// @vitest-environment jsdom
/**
 * EctdCompile shows what the agency holds now (gap 6.1;
 * docs/design/ECTD_FILED_STATE_VIEW_2026-10-22.md).
 *
 * The filed-state fold ran on every compile and transmit, and nothing showed
 * it. The card reads GET /api/ectd-compile/:ident/filed-state and:
 *   - groups the documents on file by module, each with its section, the
 *     sequence that holds it and the act that put it there;
 *   - names the sequences it folds and those it does not, with the reason;
 *   - tells a failed read from an empty dossier, and "no submission" from
 *     "nothing filed".
 *
 * Where each sequence's record comes from (2026-11-01, F1, rows D7 and D2).
 * The server now reads a filed sequence from what its transmit recorded it
 * sent, and a sequence sent before that record was kept from its compiles
 * (`basis`). The card says which, in words: the lead for a dossier read from
 * what each sequence sent; a note naming the sequences read from their
 * compiles, which may list a document their send did not carry; and a sent
 * sequence with neither record, "nothing on record says what it carried".
 * Every dispatch status is said in the words the agency's hold is said in
 * elsewhere (dispatchWords, CommitmentRow.tsx), never as its stored value.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { EctdFiledState } from '../surfaces/EctdFiledState';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const FILED = {
  projectIdent: 'prog-1', submissionId: 41, throughSequence: '0001',
  sequences: [
    { sequenceNumber: '0000', dispatchStatus: 'acknowledged', filed: true, basis: 'transmit' },
    { sequenceNumber: '0001', dispatchStatus: 'sent', filed: true, basis: 'transmit' },
    { sequenceNumber: '0002', dispatchStatus: null, filed: false, basis: null },
    { sequenceNumber: '0003', dispatchStatus: 'sent', filed: false, basis: null },
  ],
  leaves: [
    { ctdSection: '3.2.S.1', fileName: 'general-v2.pdf', title: 'General information', href: 'm3/32-body-data/general-v2.pdf', sequenceNumber: '0001', operation: 'replace', md5: 'c'.repeat(32),
      history: [{ sequenceNumber: '0000', operation: 'new', fileName: 'general.pdf' }, { sequenceNumber: '0001', operation: 'replace', fileName: 'general-v2.pdf' }] },
    { ctdSection: '5.3.5.1', fileName: 'csr.pdf', title: null, href: 'm5/csr.pdf', sequenceNumber: '0000', operation: 'new', md5: 'b'.repeat(32),
      history: [{ sequenceNumber: '0000', operation: 'new', fileName: 'csr.pdf' }] },
  ],
};
/** FILED with every sent sequence on record: 0003, sent with no record, left out. */
const RECORDED = { ...FILED, sequences: FILED.sequences.filter((s) => s.sequenceNumber !== '0003') };
const card = () => render(<EctdFiledState identPath="prog-1" seqQuery="?sequenceId=9" isScopeCurrent={() => true} />);
const cardText = () => screen.getByTestId('ectd-filed-state').textContent ?? '';
/** RECORDED with the first sequences' basis set in order; `undefined` drops the field, as a server that predates it sends. */
const withBasis = (...bases: Array<string | null | undefined>) => ({
  ...RECORDED,
  sequences: RECORDED.sequences.map((s, i) => {
    if (i >= bases.length) return s;
    const copy: Record<string, unknown> = { ...s };
    if (bases[i] === undefined) delete copy.basis;
    else copy.basis = bases[i];
    return copy;
  }),
});

beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

describe('On file at the agency', () => {
  it('groups what is on file by module, naming each document’s section, holding sequence and act', async () => {
    apiRequest.mockResolvedValue(ok(FILED));
    card();
    const m3 = await screen.findByRole('table', { name: 'Module 3: 1 document on file' });
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/ectd-compile/prog-1/filed-state?sequenceId=9');
    const row = within(m3).getAllByRole('row')[1];
    expect(row.textContent).toContain('3.2.S.1');
    expect(row.textContent).toContain('General information');
    expect(row.textContent).toContain('m3/32-body-data/general-v2.pdf');
    expect(row.textContent).toContain('0001');
    expect(row.textContent).toContain('replaced');
    const m5 = screen.getByRole('table', { name: 'Module 5: 1 document on file' });
    expect(within(m5).getAllByRole('row')[1].textContent).toContain('csr.pdf');
    expect(screen.getByTestId('ectd-filed-state').textContent).toContain('through sequence 0001');
  });

  it('says how a replaced document came to be on file, and adds nothing for one filed once (gap 6.2)', async () => {
    apiRequest.mockResolvedValue(ok(FILED));
    card();
    const m3 = await screen.findByRole('table', { name: /Module 3/ });
    expect(within(m3).getByTestId('ectd-filed-history').textContent).toBe('Filed 0000 new (general.pdf), 0001 replaced (general-v2.pdf)');
    expect(within(screen.getByRole('table', { name: /Module 5/ })).queryByTestId('ectd-filed-history')).toBeNull();
  });

  it('names the sequences it includes and the ones it does not, with the reason in words, never a stored status', async () => {
    apiRequest.mockResolvedValue(ok(FILED));
    card();
    await screen.findByRole('table', { name: /Module 3/ });
    const text = cardText();
    // A sent sequence with neither a record of its send nor a compile (F1).
    expect(text).toContain('Not included: 0002 (not on file at the agency), 0003 (sent to the agency, but nothing on record says what it carried).');
    expect(text).toContain('Includes 0000 (acknowledged by the agency), 0001 (sent to the agency).');
    expect(text).not.toMatch(/\((?:sent|acknowledged|pending|rejected|transmitting|failed)[,)]/);
    expect(text).not.toContain('Folds');
  });

  it('says a failed read, never an empty dossier, and retries', async () => {
    apiRequest.mockRejectedValueOnce(Object.assign(new Error('What is on file at the agency could not be read.'), { status: 503 }));
    card();
    expect(await screen.findByText('What is on file didn’t respond.')).toBeTruthy();
    expect(screen.queryByText(/Nothing is on file/)).toBeNull();
    apiRequest.mockResolvedValue(ok(FILED));
    fireEvent.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(await screen.findByRole('table', { name: /Module 3/ })).toBeTruthy();
  });

  it('tells "no submission" from "nothing filed"', async () => {
    apiRequest.mockResolvedValue(ok({ projectIdent: 'prog-1', submissionId: null, throughSequence: null, sequences: [], leaves: [] }));
    card();
    expect(await screen.findByText('No submission yet')).toBeTruthy();
    cleanup();
    apiRequest.mockResolvedValue(ok({ projectIdent: 'prog-1', submissionId: 41, throughSequence: null,
      sequences: [{ sequenceNumber: '0000', dispatchStatus: 'pending', filed: false, basis: null }], leaves: [] }));
    card();
    expect(await screen.findByText(/Nothing is on file: no sequence of this submission has been sent or acknowledged with a record of what it carried\./)).toBeTruthy();
    expect(cardText()).toContain('Not included: 0000 (not on file at the agency).');
    cleanup();

    // Filed sequences that withdrew everything they filed: nothing is on file, and they were sent.
    apiRequest.mockResolvedValue(ok({ projectIdent: 'prog-1', submissionId: 41, throughSequence: '0001',
      sequences: [
        { sequenceNumber: '0000', dispatchStatus: 'acknowledged', filed: true, basis: 'transmit' },
        { sequenceNumber: '0001', dispatchStatus: 'sent', filed: true, basis: 'transmit' },
      ], leaves: [] }));
    card();
    expect(await screen.findByText(/Nothing is on file: every document the included sequences filed has been withdrawn\./)).toBeTruthy();
    expect(cardText()).not.toContain('no sequence of this submission has been sent');
    expect(cardText()).toContain('Includes 0000 (acknowledged by the agency), 0001 (sent to the agency).');
  });
});

describe('On file at the agency: where each sequence’s record of what it put on file comes from (F1)', () => {
  it('says the documents on file are read from what each sequence sent', async () => {
    apiRequest.mockResolvedValue(ok(RECORDED));
    card();
    await screen.findByRole('table', { name: /Module 3/ });
    expect(cardText()).toContain('2 documents are on file, read from what each sequence sent.');
    expect(cardText()).not.toContain('compiles');
    expect(cardText()).not.toContain('leaf manifest');
  });

  it('names a sequence read from its compiles, sent before the platform kept what each send carried', async () => {
    apiRequest.mockResolvedValue(ok(withBasis('compiles', 'transmit')));
    card();
    await screen.findByRole('table', { name: /Module 3/ });
    // Both bases named; no sentence claims one for all, and none patches another (F1 review).
    expect(cardText()).toContain('2 documents are on file. '
      + 'Sequence 0001 is read from what it sent; sequence 0000 is read from its compiles, recorded before the platform kept '
      + 'what each send carried, so what is listed for it may differ from what it sent: a document may be listed that it '
      + 'did not carry, or be missing that it did.');
    expect(cardText()).not.toContain('read from what each sequence sent');
    expect(cardText()).not.toContain('instead');
    cleanup();

    // Every filed sequence from its compiles: nothing is said to be read from what was sent.
    apiRequest.mockResolvedValue(ok(withBasis('compiles', 'compiles')));
    card();
    await screen.findByRole('table', { name: /Module 3/ });
    expect(cardText()).toContain('2 documents are on file. '
      + 'Sequences 0000 and 0001 are read from their compiles, recorded before the platform kept what each send carried, '
      + 'so what is listed for them may differ from what they sent: a document may be listed that they did not carry, '
      + 'or be missing that they did.');
    expect(cardText()).not.toContain('read from what each sequence sent');
    cleanup();

    // A server that predates `basis` read compiles only, and is not taken to have read what was sent.
    apiRequest.mockResolvedValue(ok(withBasis(undefined, undefined, undefined, undefined)));
    card();
    await screen.findByRole('table', { name: /Module 3/ });
    expect(cardText()).toContain('2 documents are on file. Sequences 0000 and 0001 are read from their compiles,');
    expect(cardText()).not.toContain('read from what each sequence sent');
  });

  it('says a sent sequence with no record of what it carried is not included, and why', async () => {
    apiRequest.mockResolvedValue(ok({ ...FILED, sequences: [
      { sequenceNumber: '0000', dispatchStatus: 'acknowledged', filed: true, basis: 'transmit' },
      { sequenceNumber: '0001', dispatchStatus: 'acknowledged', filed: false, basis: null },
    ] }));
    card();
    await screen.findByRole('table', { name: /Module 3/ });
    expect(cardText()).toContain('Not included: 0001 (acknowledged by the agency, but nothing on record says what it carried).');
    // Not a complete count, and not a read of "each" sequence: 0001 was not read (F1 review).
    expect(cardText()).toContain('2 documents are shown as on file, read from what each included sequence sent, but that is '
      + 'not known in full: nothing on record says what sequence 0001 carried, so the agency may hold documents, or versions '
      + 'of them, that are not shown.');
    expect(cardText()).not.toMatch(/documents are on file|read from what each sequence sent/);
  });
});

describe('On file at the agency: what the record cannot say is never shown as empty or complete (F1 review)', () => {
  const ONLY_UNRECORDED = { projectIdent: 'prog-1', submissionId: 41, throughSequence: null, leaves: [],
    sequences: [{ sequenceNumber: '0000', dispatchStatus: 'acknowledged', filed: false, basis: null }] };

  it('a sequence the agency acknowledged with no record of what it carried: not "nothing on file"', async () => {
    apiRequest.mockResolvedValue(ok(ONLY_UNRECORDED));
    card();
    expect(await screen.findByText('not fully known')).toBeTruthy();
    expect(cardText()).toContain('No document is shown as on file, but that is not known in full: nothing on record says '
      + 'what sequence 0000 carried, so the agency may hold documents, or versions of them, that are not shown.');
    expect(cardText()).not.toMatch(/nothing on file|Nothing is on file/i);
  });

  it('a send that never settled is not said to be off file: its delivery is not known', async () => {
    apiRequest.mockResolvedValue(ok({ ...RECORDED, sequences: [
      { sequenceNumber: '0000', dispatchStatus: 'acknowledged', filed: true, basis: 'transmit' },
      { sequenceNumber: '0001', dispatchStatus: 'transmitting', filed: false, basis: null },
    ] }));
    card();
    await screen.findByRole('table', { name: /Module 3/ });
    expect(cardText()).toContain('Not included: 0001 (a send of it is unresolved, so whether the agency holds it is not '
      + 'known; confirm at the agency).');
    expect(cardText()).toContain('but that is not known in full: whether the agency received sequence 0001 is not yet known');
    expect(cardText()).not.toContain('0001 (not on file at the agency)');
    cleanup();

    // With nothing else on file, neither the header nor the lead says nothing is.
    apiRequest.mockResolvedValue(ok({ projectIdent: 'prog-1', submissionId: 41, throughSequence: null, leaves: [],
      sequences: [{ sequenceNumber: '0000', dispatchStatus: 'transmitting', filed: false, basis: null }] }));
    card();
    expect(await screen.findByText('not fully known')).toBeTruthy();
    expect(cardText()).not.toMatch(/nothing on file|Nothing is on file|not on file at the agency/i);
  });
});

/* 3b slice 3 (c), under founder decision P-97: a project that is not an
   application and never filed is refused the filed state with the reason. That
   is said as the reason, never as "didn't respond", and offers no retry. */
describe('a project that is not an application and never filed', () => {
  it('shows why nothing is on file, not a failed read', async () => {
    const why = "This project is a clinical study report, authored here and not compiled as an eCTD sequence.";
    apiRequest.mockRejectedValueOnce(Object.assign(new Error(why), { status: 422, payload: { error: { code: 'ECTD_NOT_APPLICABLE', message: why } } }));
    card();
    expect(await screen.findByText(why)).toBeTruthy();
    expect(cardText()).not.toMatch(/didn’t respond|not loaded/);
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });
});
