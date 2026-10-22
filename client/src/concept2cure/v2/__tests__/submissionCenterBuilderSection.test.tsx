// @vitest-environment jsdom
/**
 * F18 (docs/design/FILING_SPINE.md §7.2): a readiness finding's act opens the
 * Builder at the section it names.
 *
 * Submission Readiness's "Fix" sent a sentence into the chat (`ask(…)`) and
 * opened nothing. The F10 door (navParams → readSubmissionNavTarget →
 * useOpenOnNavTarget) already opens the Submission Center on a submission,
 * sequence and tab; it carried no section, so the person landed on the
 * Builder and had to find the section again.
 *
 * Pins:
 *   • a "place" act opens the Builder's placement form with Section filled in
 *     and says so, with focus on that line;
 *   • a "leaf" act marks the placed leaf at that section (by the CTD code, so
 *     'm2.7.3' is 2.7.3), and says when no leaf there is placed any more;
 *   • the section is applied once: back on the Builder after another tab, the
 *     form is closed again;
 *   • a frozen sequence says no leaf can be placed, and a failed leaves read
 *     says what was not done (no form opened, no leaf marked) and how to retry;
 *   • an unknown act, an over-long code, a section without a sequence, or a
 *     section for another tab is dropped, never trusted.
 *
 * apiRequest is mocked at the module boundary, as in
 * submissionCenterOpensOnSequence.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';
import { readSubmissionNavTarget } from '../surfaces/submissionNavTarget';
import { stashNavParamsForTarget, clearNavParams } from '../navParams';

const SUBS = [
  { id: 3, title: 'AB-1 Phase 2 IND', productName: 'Abelix', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: null },
  { id: 5, title: 'ZX-9 First-in-Human', productName: 'Zexanib', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: null },
];
const seqs5 = (status = 'draft') => [
  { id: 6, sequenceNumber: '0000', type: 'original', status: 'dispatched', region: 'fda', validationStatus: null },
  { id: 7, sequenceNumber: '0001', type: 'amendment', status, region: 'fda', validationStatus: null },
];
const LEAVES_7 = [
  { id: 77, sectionCode: '2.7.3', title: 'M2.7 Clinical Summary', granularity: null, lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 501, documentType: null },
  { id: 78, sectionCode: 'm1.3.1', title: 'Cover letter', granularity: null, lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 502, documentType: null },
];
const DOCS = { documents: [{ id: 601, title: 'Form FDA 1571', moduleNumber: null, status: 'approved' }], total: 1 };

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

function mockApi(over: Record<string, () => Response> = {}) {
  const routes: Record<string, () => Response> = {
    'GET /api/submissions': () => json(SUBS),
    'GET /api/submissions/3/sequences': () => json([]),
    'GET /api/submissions/5/sequences': () => json(seqs5()),
    'GET /api/submissions/sequences/7/leaves': () => json(LEAVES_7),
    'GET /api/coauthor/documents': () => json(DOCS),
    ...over,
  };
  apiRequest.mockImplementation(async (method: string, url: string) => {
    const route = routes[`${method} ${String(url).split('?')[0]}`];
    return route ? route() : json([]);
  });
}

const sendTo = (builderAct: string, sectionCode: string, extra: Record<string, string> = {}) =>
  stashNavParamsForTarget('submission-center', { submissionId: '5', sequenceId: '7', ws: 'builder', builderAct, sectionCode, ...extra });
const tab = (name: string) => screen.getByRole('tab', { name });
const sectionInput = () => document.getElementById('sc-leaf-section') as HTMLInputElement | null;
const arrival = () => document.querySelector('[data-testid="sc-builder-arrival"]');

beforeEach(() => {
  apiRequest.mockReset();
  clearNavParams();
});
afterEach(() => {
  cleanup();
  clearNavParams();
});

describe('F18: the Builder opens at the section a readiness finding names', () => {
  it('a place act opens the placement form with Section filled in, and focus is on the line saying so', async () => {
    mockApi();
    sendTo('place', '1.2');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(tab('Builder').getAttribute('aria-selected')).toBe('true'));
    await waitFor(() => expect(sectionInput()?.value).toBe('1.2'));
    const line = arrival();
    expect(line?.textContent).toBe('Placing a leaf at 1.2, the section the readiness finding names. Choose the document and give the reason.');
    expect(document.activeElement).toBe(line);
  });

  it('a place act with no section opens the form empty and says which sequence it is for', async () => {
    mockApi();
    sendTo('place', '');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(sectionInput()).not.toBeNull());
    expect(sectionInput()?.value).toBe('');
    expect(arrival()?.textContent).toBe('Placing a leaf in sequence 0001, as the readiness finding asks. Choose the document, its section and the reason.');
  });

  it('a leaf act marks the placed leaf at that section, matched by its CTD code', async () => {
    mockApi();
    sendTo('leaf', 'm2.7.3');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await screen.findByText('M2.7 Clinical Summary');
    await waitFor(() => expect(arrival()?.textContent).toBe('The leaf at m2.7.3 that the readiness finding names is marked below.'));
    const marked = Array.from(document.querySelectorAll('[data-section-target]'));
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain('M2.7 Clinical Summary');
    expect(marked[0].textContent).toContain('Named by readiness');
    expect(sectionInput()).toBeNull();
  });

  it('a leaf placed under a non-canonical spelling (m1.3.1) is the leaf at 1.3.1', async () => {
    mockApi();
    sendTo('leaf', '1.3.1');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await screen.findByText('Cover letter');
    await waitFor(() => expect(arrival()?.getAttribute('data-arrival')).toBe('leaf'));
    const marked = Array.from(document.querySelectorAll('[data-section-target]'));
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain('Cover letter');
  });

  it('a leaf act whose leaf is no longer placed marks nothing and says so', async () => {
    mockApi();
    sendTo('leaf', '3.2.S.1');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await screen.findByText('M2.7 Clinical Summary');
    await waitFor(() =>
      expect(arrival()?.textContent).toBe('No leaf at 3.2.S.1 is in sequence 0001 now, so nothing is marked. Validation shows the current findings.'),
    );
    expect(document.querySelectorAll('[data-section-target]')).toHaveLength(0);
  });

  it('is applied once: back on the Builder after another tab, the form is closed and nothing is named', async () => {
    mockApi();
    sendTo('place', '1.2');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(sectionInput()?.value).toBe('1.2'));
    fireEvent.click(tab('Validation'));
    await waitFor(() => expect(tab('Validation').getAttribute('aria-selected')).toBe('true'));
    fireEvent.click(tab('Builder'));
    await screen.findByText('M2.7 Clinical Summary');
    expect(sectionInput()).toBeNull();
    expect(arrival()).toBeNull();
  });

  it('a frozen sequence says no leaf can be placed in it', async () => {
    mockApi({ 'GET /api/submissions/5/sequences': () => json(seqs5('frozen')) });
    sendTo('place', '1.2');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(arrival()?.textContent).toBe('Sequence 0001 is frozen, so no leaf can be placed in it.'));
    expect(sectionInput()).toBeNull();
  });

  it('a failed leaves read says the placement form was not opened, and how to retry', async () => {
    mockApi({ 'GET /api/submissions/sequences/7/leaves': () => json({ error: 'unavailable' }, 503) });
    sendTo('place', '1.2');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(arrival()?.textContent).toBe(
      'The leaves could not be read, so the placement form was not opened at 1.2. Open the finding on Submission Readiness again to retry.'));
    expect(sectionInput()).toBeNull();
  });

  it('a failed leaves read for a leaf act says no leaf was marked, not that a section was not opened', async () => {
    mockApi({ 'GET /api/submissions/sequences/7/leaves': () => json({ error: 'unavailable' }, 503) });
    sendTo('leaf', '2.7.3');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(arrival()?.textContent).toBe(
      'The leaves could not be read, so the leaf at 2.7.3 was not marked. Open the finding on Submission Readiness again to retry.'));
  });
});

describe('F18: the section a sender names is read, not trusted', () => {
  const base = { submissionId: '5', sequenceId: '7', ws: 'builder' };
  it('keeps a known act with a code-length section on a named sequence in the Builder', () => {
    expect(readSubmissionNavTarget({ ...base, builderAct: 'place', sectionCode: ' 1.2 ' })?.section).toEqual({ act: 'place', code: '1.2' });
    expect(readSubmissionNavTarget({ ...base, builderAct: 'place', sectionCode: '' })?.section).toEqual({ act: 'place', code: null });
    expect(readSubmissionNavTarget({ ...base, builderAct: 'leaf', sectionCode: '2.7.3' })?.section).toEqual({ act: 'leaf', code: '2.7.3' });
  });
  it('drops an unknown act, an over-long code, a leaf act with no code, a section with no sequence, and a section for another tab', () => {
    expect(readSubmissionNavTarget({ ...base, builderAct: 'remove', sectionCode: '1.2' })?.section).toBeNull();
    expect(readSubmissionNavTarget({ ...base, builderAct: 'place', sectionCode: '1'.repeat(65) })?.section).toBeNull();
    expect(readSubmissionNavTarget({ ...base, builderAct: 'leaf', sectionCode: '' })?.section).toBeNull();
    expect(readSubmissionNavTarget({ ...base, sequenceId: '', builderAct: 'place', sectionCode: '1.2' })?.section).toBeNull();
    expect(readSubmissionNavTarget({ ...base, ws: 'sequences', builderAct: 'place', sectionCode: '1.2' })?.section).toBeNull();
    expect(readSubmissionNavTarget(base)?.section).toBeNull();
  });
});

describe('F18 review: the arrival is used once, then retires', () => {
  const RECEIPT = { id: 79, sequenceId: 7, sectionCode: '1.2', title: 'Form FDA 1571', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 601, auditTrail: { persisted: true, chained: true } };
  const placeIt = async () => {
    fireEvent.change(await screen.findByLabelText('Source document'), { target: { value: '601' } });
    fireEvent.change(screen.getByLabelText(/Reason for/), { target: { value: 'Place the cover letter the readiness finding names' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place leaf in the sequence' }));
  };

  it('after the placement it asked for, the form stays closed and the line is gone (at head it reopened at 1.2)', async () => {
    let leaves = LEAVES_7;
    mockApi({
      'GET /api/submissions/sequences/7/leaves': () => json(leaves),
      'PUT /api/submissions/sequences/7/leaves': () => { leaves = [...LEAVES_7, { ...RECEIPT, granularity: null, documentType: null }]; return json(RECEIPT); },
    });
    sendTo('place', '1.2');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(sectionInput()?.value).toBe('1.2'));
    await placeIt();
    await screen.findByText(/placed.*server-confirmed/);
    await waitFor(() => expect(screen.getAllByText('Form FDA 1571').length).toBeGreaterThan(0));
    await waitFor(() => expect(arrival()).toBeNull());
    expect(sectionInput()).toBeNull();
  });

  it('Cancel retires the line, and a later write does not reopen the form', async () => {
    mockApi();
    sendTo('place', '1.2');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(sectionInput()?.value).toBe('1.2'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(arrival()).toBeNull());
    expect(sectionInput()).toBeNull();
  });

  it('the place line sits by the form it describes, after the leaf table', async () => {
    mockApi();
    sendTo('place', '1.2');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(sectionInput()?.value).toBe('1.2'));
    const table = document.querySelector('table.ub-inv')!;
    expect(table.compareDocumentPosition(arrival()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a read that answers after the person has moved on leaves focus where they put it', async () => {
    let answer!: (r: Response) => void;
    const pending = new Promise<Response>((res) => { answer = res; });
    mockApi({ 'GET /api/submissions/sequences/7/leaves': (() => pending) as unknown as () => Response });
    sendTo('place', '1.2');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(tab('Builder').getAttribute('aria-selected')).toBe('true'));
    tab('Validation').focus();
    answer(json(LEAVES_7));
    await waitFor(() => expect(arrival()).not.toBeNull());
    expect(document.activeElement).toBe(tab('Validation'));
  });

  it('two leaves at the section: the line says how many, and neither is called the one named', async () => {
    mockApi({ 'GET /api/submissions/sequences/7/leaves': () => json([...LEAVES_7, { ...LEAVES_7[0], id: 80, title: 'M2.7 Clinical Summary, addendum' }]) });
    sendTo('leaf', '2.7.3');
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(arrival()?.textContent).toBe('2 leaves are placed at 2.7.3 and are marked below. The finding on Submission Readiness names the one it is about.'));
    expect(document.querySelectorAll('[data-section-target]')).toHaveLength(2);
    expect(document.body.textContent).not.toContain('Named by readiness');
    expect(document.body.textContent).toContain('At the section the finding names');
  });
});
