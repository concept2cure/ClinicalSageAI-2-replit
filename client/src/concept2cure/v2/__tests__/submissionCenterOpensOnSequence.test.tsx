// @vitest-environment jsdom
/**
 * F10 (docs/design/FILING_SPINE.md §7.2): the Submission Center opens on the
 * submission and sequence it was sent to.
 *
 * After a document is placed into a sequence, "Open in Submission Center" used
 * to call onNav('submission-center') with nothing (AuthoringPlaceIntoFiling
 * :387), and the Submission Center read no nav params. The person landed on the
 * portfolio, on whichever submission happened to be first, and had to find the
 * sequence again.
 *
 * Pins:
 *   • placing into sequence 7 of submission 5 (neither of them first in its
 *     list), then pressing "Open in Submission Center", lands on submission 5,
 *     sequence 7, in the Builder, reading sequence 7's leaves;
 *   • a sequence that is not in the submission is not guessed at: the
 *     submission's sequence list is shown, with a line saying the sequence
 *     was not found;
 *   • a submission that is not in the list is not guessed at either: the
 *     submission list is shown, with a line saying so;
 *   • the line about the link describes the screen it was written on: it is
 *     cleared once the person picks another tab or submission;
 *   • with nothing carried, the Submission Center opens as it always did.
 *
 * apiRequest is mocked at the module boundary, as in
 * documentAuthoringPlaceIntoFiling and submissionCenterGovernedWorkspaces.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AuthoringPlaceIntoFiling } from '../surfaces/AuthoringPlaceIntoFiling';
import { SubmissionCenter } from '../surfaces/SubmissionCenter';
import { stashNavParamsForTarget, clearNavParams } from '../navParams';

const SUBS = [
  { id: 3, title: 'AB-1 Phase 2 IND', productName: 'Abelix', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: null },
  { id: 5, title: 'ZX-9 First-in-Human', productName: 'Zexanib', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: null },
];
const SEQS_3 = [{ id: 2, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'fda', validationStatus: null }];
const SEQS_5 = [
  { id: 6, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'fda', validationStatus: null },
  { id: 7, sequenceNumber: '0001', type: 'amendment', status: 'draft', region: 'fda', validationStatus: null },
];
const LEAVES_7 = [
  { id: 77, sectionCode: '2.7.3', title: 'M2.7 Clinical Summary', granularity: null, lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 501, documentType: null },
];

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

const ROUTES: Record<string, () => Response> = {
  'GET /api/submissions': () => json(SUBS),
  'GET /api/submissions/3/sequences': () => json(SEQS_3),
  'GET /api/submissions/5/sequences': () => json(SEQS_5),
  'GET /api/submissions/sequences/7/leaves': () => json(LEAVES_7),
  'GET /api/authoring/docs/D1/sections': () =>
    json({ success: true, sections: [{ code: '2.7.3', title: 'Summary of Clinical Efficacy', content: 'ORR 38.6% in the pivotal cohort.' }] }),
  'POST /api/coauthor/documents': () =>
    json({ success: true, document: { id: 501, metadata: { source: 'authoring-document', docId: 'D1' } } }, 201),
  'PUT /api/submissions/sequences/7/leaves': () =>
    json({ id: 77, sequenceId: 7, documentTable: 'coauthor_documents', documentId: 501, auditTrail: { persisted: true, chained: true }, sectionCode: '2.7.3', title: 'M2.7 Clinical Summary', lifecycleOp: 'new' }),
  'GET /api/510k/estar/submissions': () => json({ submissions: [] }),
  'POST /api/510k/estar/assemble': () => json({ artifactKind: 'none', blockers: [] }),
};

function mockApi() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    const route = ROUTES[`${method} ${String(url).split('?')[0]}`];
    return route ? route() : json([]);
  });
}

const text = () => document.body.textContent ?? '';
const tab = (name: string) => screen.getByRole('tab', { name });

beforeEach(() => {
  apiRequest.mockReset();
  clearNavParams();
});
afterEach(() => {
  cleanup();
  clearNavParams();
});

describe('F10: Open in Submission Center lands on the sequence placed into', () => {
  it('after placing into sequence 7, the Submission Center opens on sequence 7 in the Builder', async () => {
    mockApi();
    const onNav = vi.fn();
    render(
      <AuthoringPlaceIntoFiling docId="D1" docTitle="M2.7 Clinical Summary" activeSectionCode="2.7.3" dirty={false} onNav={onNav} fireToast={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Place into filing/ }));
    await waitFor(() => expect(text()).toContain('ZX-9 First-in-Human'));
    fireEvent.change(screen.getByLabelText('Target submission'), { target: { value: '5' } });
    await waitFor(() => expect(text()).toContain('0001 · amendment'));
    fireEvent.change(screen.getByLabelText(/^Sequence$/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/^Reason for this placement/), { target: { value: 'Clinical summary for amendment 0001' } });
    fireEvent.click(screen.getByRole('button', { name: /Place leaf/ }));
    await waitFor(() => expect(text()).toContain('server-confirmed (leaf #77'));

    fireEvent.click(screen.getByRole('button', { name: /Open in Submission Center/ }));
    expect(onNav).toHaveBeenCalledWith('submission-center');

    // The shell now mounts the destination.
    cleanup();
    apiRequest.mockClear();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);

    await waitFor(() => expect(tab('Builder').getAttribute('aria-selected')).toBe('true'));
    expect((screen.getByLabelText('Submission to work on') as HTMLSelectElement).value).toBe('5');
    expect((screen.getByLabelText('Working sequence') as HTMLSelectElement).value).toBe('7');
    expect(await screen.findByText('M2.7 Clinical Summary')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/submissions/sequences/7/leaves');
    // Never the first row's leaves: the default was not used.
    expect(apiRequest).not.toHaveBeenCalledWith('GET', '/api/submissions/sequences/6/leaves');
    expect(text()).not.toMatch(/was not found/);
  });

  it('a sequence not in the submission is not guessed at: the sequence list, with a line saying so', async () => {
    mockApi();
    stashNavParamsForTarget('submission-center', { submissionId: '5', sequenceId: '999', ws: 'builder' });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/The sequence this link named was not found in ZX-9 First-in-Human/));
    expect(tab('Sequences').getAttribute('aria-selected')).toBe('true');
    expect((screen.getByLabelText('Submission to work on') as HTMLSelectElement).value).toBe('5');
    // The list is there, not a blank screen.
    expect(text()).toContain('Sequences · ZX-9 First-in-Human');
    expect(tab('Builder').getAttribute('aria-selected')).toBe('false');
  });

  it('on the first submission too: an unknown sequence is said, never replaced by sequence 0000', async () => {
    mockApi();
    stashNavParamsForTarget('submission-center', { submissionId: '3', sequenceId: '999', ws: 'dispatch' });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/The sequence this link named was not found in AB-1 Phase 2 IND/));
    expect(tab('Sequences').getAttribute('aria-selected')).toBe('true');
    expect(tab('Dispatch').getAttribute('aria-selected')).toBe('false');
  });

  it('a failed sequence read is said as a failed read, not as "not found"', async () => {
    mockApi();
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string) =>
      method === 'GET' && url === '/api/submissions/5/sequences'
        ? json({ error: { code: 'INTERNAL', message: 'The submission service is unavailable.' } }, 503)
        : base(method, url));
    stashNavParamsForTarget('submission-center', { submissionId: '5', sequenceId: '7', ws: 'builder' });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/The sequences of ZX-9 First-in-Human could not be read/));
    expect(text()).not.toMatch(/was not found/);
  });

  it('a submission not in the list is not guessed at: the submission list, with a line saying so', async () => {
    mockApi();
    stashNavParamsForTarget('submission-center', { submissionId: '404', sequenceId: '7', ws: 'builder' });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/The submission this link named is not in this list/));
    expect(tab('Submissions').getAttribute('aria-selected')).toBe('true');
    expect(text()).toContain('AB-1 Phase 2 IND');
    expect(apiRequest).not.toHaveBeenCalledWith('GET', '/api/submissions/sequences/7/leaves');
  });

  it('the line about the link is cleared once the person moves to another tab', async () => {
    mockApi();
    stashNavParamsForTarget('submission-center', { submissionId: '5', sequenceId: '999', ws: 'builder' });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/The sequence this link named was not found/));
    fireEvent.click(tab('Builder'));
    await waitFor(() => expect(text()).not.toMatch(/The sequence this link named was not found/));
    // It does not come back on returning to the tab it was written on.
    fireEvent.click(tab('Sequences'));
    expect(text()).not.toMatch(/The sequence this link named was not found/);
  });

  it('the line about the link is cleared once the person picks another submission', async () => {
    mockApi();
    stashNavParamsForTarget('submission-center', { submissionId: '404', sequenceId: '7', ws: 'builder' });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/The submission this link named is not in this list/));
    fireEvent.change(screen.getByLabelText('Submission to work on'), { target: { value: '5' } });
    await waitFor(() => expect(text()).not.toMatch(/The submission this link named is not in this list/));
  });

  it('with nothing carried, the Submission Center opens on its portfolio as before', async () => {
    mockApi();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(text()).toContain('AB-1 Phase 2 IND'));
    expect(tab('Submissions').getAttribute('aria-selected')).toBe('true');
    expect((screen.getByLabelText('Submission to work on') as HTMLSelectElement).value).toBe('3');
    expect(text()).not.toMatch(/was not found|not in this list/);
  });
});
