// @vitest-environment jsdom
/**
 * The IND's registers on the IND screen (P-122, 2026-11-10).
 *
 * The registers the IND lifecycle routes keep (registers.routes.ts) were built and had no screen. The IND screen,
 * a feature of Submission Center (P-32), now shows each as a quiet section with its list and the actions its routes
 * offer. Counts and verdicts are the server's; an empty register says so in one sentence; a read that fails says so,
 * never "none recorded". The server's tests are ind-registers-launch-claim.test.ts and
 * tests/db/p122-ind-registers.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const publish = vi.hoisted(() => vi.fn());
vi.mock('../surfaceContext', () => ({ usePublishSurfaceContext: publish }));

import { SubmissionIndRegisters } from '../surfaces/SubmissionIndRegisters';
import { IndLifecycle } from '../surfaces/IndLifecycle';

const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;
const SUB = '/api/ind-lifecycle/submission/41';
const XREFS = [
  { id: 'a1b2c3d4-0000-4000-8000-000000000001', referencedFileType: 'DMF', referencedFileNumber: '12345', subjectName: 'Drug substance',
    authorizedSections: ['3.2.S'], loaOnFile: false, loaLeafSection: null },
  { id: 'a1b2c3d4-0000-4000-8000-000000000002', referencedFileType: 'NDA', referencedFileNumber: '021234', subjectName: 'Reference product',
    authorizedSections: [], loaOnFile: true, loaLeafSection: 'm1.4.1' },
];
const REGISTER = {
  ready: false, entries: [],
  findings: [{ fileLabel: 'DMF 12345', severity: 'error', code: 'MISSING_LOA', message: 'DMF 12345 (Drug substance) has no Letter of Authorization on file; FDA cannot review it in support of the IND.' }],
  counts: { total: 2, withLoa: 1, missingLoa: 1 },
};

const ANNUAL = [
  { id: 'b1', indNumber: '999101', productName: 'ZX-9', reportingPeriodStart: '2025-01-01T00:00:00.000Z', reportingPeriodEnd: '2025-12-31T00:00:00.000Z',
    dueDate: '2026-03-16T00:00:00.000Z', status: 'draft', gapCount: 3, sequenceId: null, filedAt: null },
  { id: 'b2', indNumber: '999101', productName: 'ZX-9', reportingPeriodStart: '2024-01-01T00:00:00.000Z', reportingPeriodEnd: '2024-12-31T00:00:00.000Z',
    dueDate: null, status: 'draft', gapCount: 0, sequenceId: null, filedAt: null },
  { id: 'b3', indNumber: '999101', productName: 'ZX-9', reportingPeriodStart: '2023-01-01T00:00:00.000Z', reportingPeriodEnd: '2023-12-31T00:00:00.000Z',
    dueDate: '2024-03-16T00:00:00.000Z', status: 'filed', gapCount: 1, sequenceId: 7, filedAt: '2024-03-01T00:00:00.000Z' },
];
const OVERDUE = [{ ...ANNUAL[0], overdueState: 'overdue' }, { ...ANNUAL[1], overdueState: 'deadline_unknown' }];

type Handler = (method: string, url: string, body?: unknown) => Response | undefined;
function serve(over: Handler = () => undefined) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    const answered = over(method, url, body);
    if (answered) return answered;
    if (url === `${SUB}/cross-references`) return ok(XREFS);
    if (url === `${SUB}/cross-reference-register`) return ok(REGISTER);
    if (url === `${SUB}/annual-reports`) return ok(ANNUAL);
    if (url === `${SUB}/annual-reports/overdue`) return ok(OVERDUE);
    return ok({});
  });
}
const calls = () => apiRequest.mock.calls.map((c) => `${c[0]} ${c[1]}`);

afterEach(cleanup);
beforeEach(() => serve());

describe('cross-references and letters of authorization', () => {
  it('lists every file the IND relies on, with the server\'s LOA-coverage verdict in its own counts', async () => {
    render(<SubmissionIndRegisters submissionId={41} sponsorName="Acme Bio" productName={null} />);
    const reg = await screen.findByTestId('indl-xref-register');
    await waitFor(() => expect(within(reg).getByTestId('indl-xref-verdict').textContent)
      .toBe('2 files relied on; 1 with a letter of authorization on file, 1 without.'));
    expect(reg.textContent).toContain('DMF 12345 (Drug substance) has no Letter of Authorization on file');
    const rows = within(reg).getAllByRole('row').slice(1).map((r) => r.querySelectorAll('td'));
    expect([...rows[0]].slice(0, 4).map((td) => td.textContent)).toEqual(['DMF 12345', 'Drug substance', '3.2.S', 'Not on file']);
    expect([...rows[1]].slice(0, 4).map((td) => td.textContent)).toEqual(['NDA 021234', 'Reference product', 'Not recorded', 'On file (m1.4.1)']);
  });

  it('records a cross-reference, and reads the register again', async () => {
    serve((method, url) => (method === 'POST' && url === `${SUB}/cross-references` ? ok({ id: 'new' }, 201) : undefined));
    render(<SubmissionIndRegisters submissionId={41} sponsorName="Acme Bio" productName={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Record a cross-reference' }));
    const form = screen.getByTestId('indl-xref-form');
    fireEvent.change(within(form).getByLabelText('Referenced file type'), { target: { value: 'DMF' } });
    fireEvent.change(within(form).getByLabelText('File number'), { target: { value: '777' } });
    fireEvent.change(within(form).getByLabelText('Subject (drug substance or product)'), { target: { value: 'Excipient' } });
    fireEvent.change(within(form).getByLabelText('Sections relied on, one per line'), { target: { value: '3.2.S\n\n3.2.P ' } });
    const reads = calls().filter((c) => c === `GET ${SUB}/cross-reference-register`).length;
    fireEvent.click(within(form).getByRole('button', { name: 'Record' }));
    expect(await screen.findByText('DMF 777 is recorded.')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('POST', `${SUB}/cross-references`,
      { referencedFileType: 'DMF', referencedFileNumber: '777', subjectName: 'Excipient', authorizedSections: ['3.2.S', '3.2.P'] });
    await waitFor(() => expect(calls().filter((c) => c === `GET ${SUB}/cross-reference-register`).length).toBeGreaterThan(reads));
  });

  it('files the letter as the m1.4.1 leaf of a new sequence', async () => {
    serve((method, url) => (method === 'POST' && url.endsWith('/file-loa')
      ? ok({ sequence: { sequenceNumber: '0003' }, leaves: [{ sectionCode: 'm1.4.1' }], crossReference: {} }, 201) : undefined));
    render(<SubmissionIndRegisters submissionId={41} sponsorName="Acme Bio" productName={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'File the letter' }));
    const form = screen.getByTestId('indl-xref-file-loa');
    expect((within(form).getByLabelText('Authorized party (the sponsor)') as HTMLInputElement).value).toBe('Acme Bio');
    fireEvent.change(within(form).getByLabelText('eCTD sequence number (4 digits)'), { target: { value: '0003' } });
    fireEvent.change(within(form).getByLabelText('File holder (grantor)'), { target: { value: 'Holder Inc.' } });
    fireEvent.change(within(form).getByLabelText('Signatory (for the holder)'), { target: { value: 'J. Doe' } });
    fireEvent.click(within(form).getByRole('button', { name: 'File the letter' }));
    expect(await screen.findByText('The letter for DMF 12345 is filed in sequence 0003 as the m1.4.1 leaf.')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('POST', `${SUB}/cross-references/${XREFS[0].id}/file-loa`,
      { sequenceNumber: '0003', holderName: 'Holder Inc.', authorizedPartyName: 'Acme Bio', signatoryName: 'J. Doe' });
  });

  it('marks a letter on file, and removes a row only when asked twice', async () => {
    serve((method) => (method === 'PATCH' ? ok({ loaOnFile: true }) : method === 'DELETE' ? ({ ok: true, status: 204, json: async () => null }) as Response : undefined));
    render(<SubmissionIndRegisters submissionId={41} sponsorName={null} productName={null} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Mark letter on file' }))[0]);
    expect(await screen.findByText('DMF 12345: the letter is marked on file.')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('PATCH', `/api/ind-lifecycle/cross-references/${XREFS[0].id}`, { loaOnFile: true });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    expect(calls().some((c) => c.startsWith('DELETE'))).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove NDA 021234' }));
    expect(await screen.findByText('NDA 021234 is removed from the register.')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('DELETE', `/api/ind-lifecycle/cross-references/${XREFS[1].id}`, undefined);
  });

  it('a refusal is the server\'s own sentence, and nothing is said to have changed', async () => {
    serve((method) => (method === 'PATCH'
      ? ok({ error: { code: 'PROJECT_PERMISSION_DENIED', message: 'Current project permissions do not permit this operation.' } }, 403) : undefined));
    render(<SubmissionIndRegisters submissionId={41} sponsorName={null} productName={null} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Mark letter on file' }))[0]);
    expect((await screen.findByRole('alert')).textContent).toBe('Current project permissions do not permit this operation.');
    expect(screen.queryByText(/is marked/)).toBeNull();
  });

  it('an empty register says so in one sentence, with its one action', async () => {
    serve((_m, url) => (url === `${SUB}/cross-references` ? ok([]) : url === `${SUB}/cross-reference-register`
      ? ok({ ready: true, entries: [], findings: [], counts: { total: 0, withLoa: 0, missingLoa: 0 } }) : undefined));
    render(<SubmissionIndRegisters submissionId={41} sponsorName={null} productName={null} />);
    expect(await screen.findByText('No file this IND relies on is recorded yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record a cross-reference' })).toBeTruthy();
    expect(screen.queryByTestId('indl-xref-verdict')).toBeNull();
  });

  it('a register that cannot be read says so, never "none recorded"', async () => {
    serve((_m, url) => (url === `${SUB}/cross-reference-register` ? ok({ error: 'down' }, 503) : undefined));
    render(<SubmissionIndRegisters submissionId={41} sponsorName={null} productName={null} />);
    expect((await screen.findByRole('alert')).textContent).toContain('The cross-reference register could not be read, so nothing is shown.');
    expect(screen.queryByText(/No file this IND relies on/)).toBeNull();
    expect(within(screen.getByTestId('indl-xref-register')).queryByRole('table')).toBeNull();
  });

  it('calls no IND safety-report or ICSR register (P-32)', async () => {
    render(<SubmissionIndRegisters submissionId={41} sponsorName={null} productName={null} />);
    await screen.findByTestId('indl-xref-verdict');
    expect(calls().filter((c) => /safety-report|icsr/.test(c))).toEqual([]);
  });
});

describe('the annual-report tracker', () => {
  it('lists each tracked report with its due date, open sections and state, and the server\'s overdue feed', async () => {
    render(<SubmissionIndRegisters submissionId={41} sponsorName={null} productName="ZX-9" />);
    const reg = await screen.findByTestId('indl-annual-register');
    await waitFor(() => expect(within(reg).getByTestId('indl-annual-verdict').textContent)
      .toBe('1 overdue; 1 with no due date, because no IND effective date was recorded.'));
    const rows = within(reg).getAllByRole('row').slice(1).map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent));
    expect(rows).toEqual([
      ['1 Jan 2025 to 31 Dec 2025', '999101', '16 Mar 2026', '3', 'Draft, overdue'],
      ['1 Jan 2024 to 31 Dec 2024', '999101', 'Not known', '0', 'Draft, due date not known'],
      ['1 Jan 2023 to 31 Dec 2023', '999101', '16 Mar 2024', '1', 'Filed 1 Mar 2024'],
    ]);
  });

  it('tracks a report: the server dates it and finds its open sections', async () => {
    serve((method, url) => (method === 'POST' && url === `${SUB}/annual-reports` ? ok({ id: 'new' }, 201) : undefined));
    render(<SubmissionIndRegisters submissionId={41} sponsorName={null} productName="ZX-9" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Track an annual report' }));
    const form = screen.getByTestId('indl-annual-form');
    expect((within(form).getByLabelText('Product name') as HTMLInputElement).value).toBe('ZX-9');
    fireEvent.change(within(form).getByLabelText('IND number'), { target: { value: '999101' } });
    fireEvent.change(within(form).getByLabelText('Reporting period start'), { target: { value: '2026-01-01' } });
    fireEvent.change(within(form).getByLabelText('Reporting period end'), { target: { value: '2026-12-31' } });
    fireEvent.change(within(form).getByLabelText('IND effective date (sets the due date)'), { target: { value: '2025-01-15' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Track' }));
    expect(await screen.findByText('The report for 2026-01-01 to 2026-12-31 is tracked.')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('POST', `${SUB}/annual-reports`, {
      report: { indNumber: '999101', productName: 'ZX-9', reportingPeriodStart: '2026-01-01', reportingPeriodEnd: '2026-12-31' },
      indEffectiveDate: '2025-01-15',
    });
  });

  it('nothing overdue says so; an empty tracker says so in one sentence', async () => {
    serve((_m, url) => (url === `${SUB}/annual-reports/overdue` ? ok([]) : undefined));
    render(<SubmissionIndRegisters submissionId={41} sponsorName={null} productName={null} />);
    expect((await screen.findByTestId('indl-annual-verdict')).textContent).toBe('No tracked report is overdue.');
    cleanup();
    serve((_m, url) => (url === `${SUB}/annual-reports` || url === `${SUB}/annual-reports/overdue` ? ok([]) : undefined));
    render(<SubmissionIndRegisters submissionId={41} sponsorName={null} productName={null} />);
    expect(await screen.findByText('No annual report is tracked for this IND yet.')).toBeTruthy();
    expect(screen.queryByTestId('indl-annual-verdict')).toBeNull();
  });

  it('an overdue feed that cannot be read says so, and shows no list it cannot vouch for', async () => {
    serve((_m, url) => (url === `${SUB}/annual-reports/overdue` ? ok({ error: 'down' }, 503) : undefined));
    render(<SubmissionIndRegisters submissionId={41} sponsorName={null} productName={null} />);
    const reg = await screen.findByTestId('indl-annual-register');
    await waitFor(() => expect(within(reg).getByRole('alert').textContent).toContain('The annual-report tracker could not be read'));
    expect(within(reg).queryByRole('table')).toBeNull();
  });
});

describe('they are part of the IND screen', () => {
  it('the IND screen shows its registers, for the submission it is working', async () => {
    serve((method, url) => (method === 'GET' && url === '/api/ind-checklist' ? ok({
      data: [{ submissionId: 41, programId: null, code: 'ZX-9', drugName: 'Zexanib', productName: 'ZX-9', indication: null,
        sponsorName: 'Acme Bio', submissionType: 'IND', targetReceiptDate: null, forms: [], sections: [] }],
      meta: { count: 1 },
    }) : undefined));
    render(<IndLifecycle {...({ surface: { id: 'ind-checklist' }, onAsk: vi.fn(), onNav: vi.fn() } as unknown as Parameters<typeof IndLifecycle>[0])} />);
    expect(await screen.findByTestId('indl-registers')).toBeTruthy();
    expect(await screen.findByTestId('indl-xref-verdict')).toBeTruthy();
  });
});
