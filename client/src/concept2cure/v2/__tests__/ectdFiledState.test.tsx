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
    { sequenceNumber: '0000', dispatchStatus: 'acknowledged', filed: true },
    { sequenceNumber: '0001', dispatchStatus: 'sent', filed: true },
    { sequenceNumber: '0002', dispatchStatus: null, filed: false },
    { sequenceNumber: '0003', dispatchStatus: 'sent', filed: false },
  ],
  leaves: [
    { ctdSection: '3.2.S.1', fileName: 'general-v2.pdf', title: 'General information', href: 'm3/32-body-data/general-v2.pdf', sequenceNumber: '0001', operation: 'replace', md5: 'c'.repeat(32) },
    { ctdSection: '5.3.5.1', fileName: 'csr.pdf', title: null, href: 'm5/csr.pdf', sequenceNumber: '0000', operation: 'new', md5: 'b'.repeat(32) },
  ],
};
const card = () => render(<EctdFiledState identPath="prog-1" seqQuery="?sequenceId=9" isScopeCurrent={() => true} />);

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

  it('names the sequences it folds and the ones it does not, with the reason', async () => {
    apiRequest.mockResolvedValue(ok(FILED));
    card();
    await screen.findByRole('table', { name: /Module 3/ });
    const text = screen.getByTestId('ectd-filed-state').textContent;
    expect(text).toContain('Folds 0000 (acknowledged), 0001 (sent).');
    expect(text).toContain('Not included: 0002 (not sent), 0003 (sent, but no filed compile with a leaf manifest is on record).');
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
      sequences: [{ sequenceNumber: '0000', dispatchStatus: 'pending', filed: false }], leaves: [] }));
    card();
    expect(await screen.findByText(/Nothing is on file: no sequence of this submission has been sent or acknowledged/)).toBeTruthy();
    expect(screen.getByTestId('ectd-filed-state').textContent).toContain('Not included: 0000 (pending, not filed).');
  });
});
