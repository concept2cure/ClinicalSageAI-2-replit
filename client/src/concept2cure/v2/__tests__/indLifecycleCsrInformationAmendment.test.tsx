// @vitest-environment jsdom
/**
 * IND forms can file a CSR as an information amendment, and say what it filed
 * (D5, 2026-10-30, the CSR path sweep).
 *
 * b9dbaeff4 taught the planner that a clinical study report files at 5.3.5.1
 * as an information amendment, and the letter that such an amendment reads
 * "Information Amendment: Clinical" (21 CFR 312.31(b)). Only the service
 * changed. The card offered no CSR category, so a CSR could be planned only at
 * m2.5 (Clinical Overview) or m1.2 (the cover letter's heading). The plan view
 * never showed the identification. A filing whose leaves all await their
 * documents read "3 leaves placed". The cover-letter card could not name the
 * amendment, so its letter always carried a submission-type gap.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../surfaces/IndBriefingBookStart', () => ({ IndBriefingBookStart: () => <div /> }));

import { IndLifecycle } from '../surfaces/IndLifecycle';

const CHECKLIST = {
  submissionId: 31, code: 'LMN-201', drugName: 'LMN-201', productName: 'RePreve', indication: null,
  sponsorName: 'Lumen Bioscience', submissionType: 'IND', targetReceiptDate: null, forms: [], sections: [],
};
type Stub = { ok: boolean; status: number; body: unknown };

function mockApi(routes: Record<string, Stub>) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ind-checklist') {
      return { ok: true, status: 200, json: async () => ({ data: [CHECKLIST], meta: { count: 1 } }) } as Response;
    }
    if (method === 'GET' && url === '/api/ind-forms/') return { ok: true, status: 200, json: async () => ({ forms: [] }) } as Response;
    const r = routes[url];
    if (method === 'POST' && r) return { ok: r.ok, status: r.status, json: async () => r.body } as Response;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

async function card(title: string, tab?: 'Lifecycle') {
  render(<IndLifecycle onAsk={vi.fn()} onNav={vi.fn()} {...({} as any)} />);
  await screen.findByText('Pre-IND Briefing Book');
  if (tab) fireEvent.click(screen.getByRole('tab', { name: tab }));
  return screen.getByText(title).closest('.indl-dcard')! as HTMLElement;
}
const postBody = (url: string) => apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === url)?.[2];

/** The planner's real answer for one added CSR (ind-amendment-service planIndAmendment). */
const CSR_PLAN = {
  sequenceType: 'amendment', amendmentClasses: ['information'], warnings: [],
  leaves: [
    { documentId: 'cover:123456', sectionCode: 'm1.2', title: 'Cover Letter — IND 123456 amendment', lifecycleOp: 'new', cfrRef: '312.30/312.31' },
    { documentId: 'csr-cdi02', sectionCode: 'm5.3.5.1', title: 'LMN-201 CDI02 Clinical Study Report', lifecycleOp: 'new', cfrRef: '312.31(a)(1)' },
  ],
  protocolAmendmentTitles: [],
  informationAmendmentTitles: ['Information Amendment: Clinical'],
};

async function planTheCsr(fileBody?: unknown) {
  mockApi({
    '/api/ind-lifecycle/amendment-plan': { ok: true, status: 200, body: CSR_PLAN },
    ...(fileBody ? { '/api/ind-lifecycle/amendment/file': { ok: true, status: 201, body: fileBody } } : {}),
  });
  const c = await card('Protocol / Information Amendment', 'Lifecycle');
  fireEvent.change(within(c).getByLabelText(/Changed document id/), { target: { value: 'csr-cdi02' } });
  fireEvent.change(within(c).getByLabelText('Changed document title'), { target: { value: 'LMN-201 CDI02 Clinical Study Report' } });
  fireEvent.change(within(c).getByLabelText('Content category'), { target: { value: 'clinical_study_report' } });
  fireEvent.change(within(c).getByLabelText('Change kind'), { target: { value: 'added' } });
  fireEvent.click(within(c).getByText('Assemble now'));
  await screen.findByText(/m5\.3\.5\.1 · new — LMN-201 CDI02 Clinical Study Report/);
  return c;
}

async function fileAs(c: HTMLElement, seq: string) {
  const fileBtn = await within(c).findByText('File into sequence');
  fireEvent.change(within(c).getByLabelText('eCTD sequence number'), { target: { value: seq } });
  fireEvent.click(fileBtn);
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('IND forms: a CSR as an information amendment', () => {
  it('offers the clinical study report category, sends it, and shows the 312.31(b) identification the plan gives', async () => {
    const c = await planTheCsr();
    expect(postBody('/api/ind-lifecycle/amendment-plan')).toMatchObject({
      changedDocuments: [{ documentId: 'csr-cdi02', category: 'clinical_study_report', changeKind: 'added' }],
    });
    expect(within(c).getByText(/Identified as: Information Amendment: Clinical \(21 CFR 312\.31\(b\)\)/)).toBeTruthy();
  });

  it('a filing whose leaves await their documents says so, and does not call them placed', async () => {
    const c = await planTheCsr({
      sequence: { id: 94, submissionId: 31, sequenceNumber: '0007', type: 'amendment', status: 'draft' },
      leaves: [
        { sectionCode: 'm1.1', lifecycleOp: 'new', documentId: null },
        { sectionCode: 'm1.2', lifecycleOp: 'new', documentId: null },
        { sectionCode: 'm5.3.5.1', lifecycleOp: 'new', documentId: null },
      ],
      leavesAwaitingDocument: ['m1.1', 'm1.2', 'm5.3.5.1'],
    });
    await fileAs(c, '0007');
    const filed = await within(c).findByText(/Filed eCTD sequence 0007 \(id 94\) with 3 leaves\./);
    expect(filed.textContent).toContain('3 await a document (m1.1, m1.2, m5.3.5.1)');
    expect(filed.textContent).toContain('Submission Center');
    expect(filed.textContent).not.toMatch(/placed/);
  });

  it('a revision filed with no leaf to revise says it is not attached to one', async () => {
    const c = await planTheCsr({
      sequence: { id: 95, submissionId: 31, sequenceNumber: '0008', type: 'amendment', status: 'draft' },
      leaves: [{ sectionCode: 'm5.3.5.1', lifecycleOp: 'replace', parentLeafId: null, documentId: 12 }],
      leavesAwaitingDocument: [],
    });
    await fileAs(c, '0008');
    const filed = await within(c).findByText(/Filed eCTD sequence 0008/);
    expect(filed.textContent).toMatch(/1 revises, appends to or withdraws a leaf filed earlier and is not attached to it/);
  });
});

describe('IND forms: the cover letter names the sequence it accompanies', () => {
  it('sends the sequence number entered, so the server reads what that sequence contains', async () => {
    mockApi({ '/api/ind-lifecycle/cover-letter': { ok: true, status: 200, body: { body: 'Information Amendment: Clinical', gaps: [] } } });
    const c = await card('IND Cover Letter');
    fireEvent.change(within(c).getByLabelText(/eCTD sequence this letter accompanies/), { target: { value: '0007' } });
    fireEvent.click(within(c).getByText('Assemble now'));
    await within(c).findByText(/Information Amendment: Clinical/);
    expect(postBody('/api/ind-lifecycle/cover-letter')).toMatchObject({ submissionId: 31, sequenceNumber: '0007' });
  });

  it('sends no sequence when none is entered (control)', async () => {
    mockApi({ '/api/ind-lifecycle/cover-letter': { ok: true, status: 200, body: { body: 'Letter', gaps: ['submissionType'] } } });
    const c = await card('IND Cover Letter');
    fireEvent.click(within(c).getByText('Assemble now'));
    await within(c).findByText(/Letter/);
    expect(postBody('/api/ind-lifecycle/cover-letter')).not.toHaveProperty('sequenceNumber');
  });
});
