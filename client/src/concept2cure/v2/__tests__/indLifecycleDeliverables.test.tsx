// @vitest-environment jsdom
/**
 * IndLifecycle — the five remaining deliverable cards wired end-to-end,
 * mirroring the cover-letter exemplar (see indLifecycleTargetDate.test.tsx):
 *
 *   briefing-book / loa / right-of-reference  → real POST with the loaded
 *     checklist's identity + card particulars; the SERVER's model and gap
 *     verdict render in place; failures render the server's words.
 *   safety-report / annual-report / amendment → the same, PLUS the
 *     "File into sequence" follow-up after a successful build: a real POST to
 *     the filing counterpart (server/routes/ind-lifecycle/filing.routes.ts →
 *     createSequence + upsertLeaf), which creates the FIRST ectd_sequences
 *     rows reachable from this UI. The submission anchor is the checklist's
 *     REAL submissionId; the 4-digit sequence number is user-entered — a
 *     deliberate regulatory decision, never guessed.
 *
 * Honesty pins: no fabricated success, no invented identity, the sequence
 * number is never auto-filled, and a NOT_REPORTABLE safety classification
 * removes the filing affordance with the server's reason.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { IndLifecycle } from '../surfaces/IndLifecycle';

const props = () => ({ onAsk: vi.fn(), onNav: vi.fn() }) as any;

/* A REAL org-scoped checklist row, carrying the REAL submissions.id the filing
   routes anchor to. Deliberately NOT the kit's BX-301 sample. */
const CHECKLIST = {
  submissionId: 31,
  code: 'ZX-9',
  drugName: 'Zexanib',
  productName: 'ZX-9 First-in-Human',
  indication: null,
  sponsorName: 'Acme Bio',
  submissionType: 'IND',
  targetReceiptDate: null,
  forms: [],
  sections: [],
};

type Stub = { ok: boolean; status: number; body: unknown };

function mockApi(routes: Record<string, Stub>, checklist: Record<string, unknown> = CHECKLIST) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ind-checklist') {
      return { ok: true, status: 200, json: async () => ({ data: [checklist], meta: { count: 1 } }) } as Response;
    }
    if (method === 'GET' && url === '/api/ind-forms/') {
      return { ok: true, status: 200, json: async () => ({ forms: [] }) } as Response;
    }
    const r = routes[url];
    if (method === 'POST' && r) {
      return { ok: r.ok, status: r.status, json: async () => r.body } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

async function renderAndFindCard(title: string, tab?: 'Lifecycle') {
  render(<IndLifecycle {...props()} />);
  await screen.findByText('Pre-IND Briefing Book');
  if (tab) fireEvent.click(screen.getByRole('tab', { name: tab }));
  const card = screen.getByText(title).closest('.indl-dcard')! as HTMLElement;
  return card;
}

const postBody = (url: string) => apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === url)?.[2];

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('IndLifecycle — briefing-book / LOA / right-of-reference cards', () => {
  it('briefing-book POSTs the real route with the checklist identity and renders the server model + gaps', async () => {
    mockApi({
      '/api/ind-lifecycle/briefing-book': {
        ok: true,
        status: 200,
        body: {
          reportType: 'FDA_BRIEFING_BOOK',
          sections: [{ key: 'background', heading: '2. Product Background', body: 'REAL SERVER BRIEFING BODY', complete: true, required: true }],
          gaps: [{ sectionKey: 'plan', heading: '6. Proposed Clinical Development Plan', message: 'Required section "6. Proposed Clinical Development Plan" has no content.' }],
          questionCount: 1,
        },
      },
    });
    const card = await renderAndFindCard('Pre-IND Briefing Book');

    fireEvent.change(within(card).getByLabelText('Indication'), { target: { value: 'Relapsed myeloma' } });
    fireEvent.change(within(card).getByLabelText(/Questions for FDA/), { target: { value: 'Nonclinical | Is the tox package adequate?' } });
    fireEvent.click(within(card).getByText('Assemble now'));

    expect(await screen.findByText(/REAL SERVER BRIEFING BODY/)).toBeTruthy();
    expect(document.body.textContent).toContain('Required section "6. Proposed Clinical Development Plan" has no content.');
    // Identity from the loaded checklist; particulars only as entered — the
    // question topic/text are the user's words, numbered in entry order.
    expect(postBody('/api/ind-lifecycle/briefing-book')).toMatchObject({
      productName: 'ZX-9 First-in-Human',
      indication: 'Relapsed myeloma',
      meetingType: 'pre_ind',
      questions: [{ number: 1, topic: 'Nonclinical', question: 'Is the tox package adequate?' }],
    });
  });

  it('LOA carries the checklist sponsor as the authorized party and renders the model + gap verdict', async () => {
    mockApi({
      '/api/ind-lifecycle/loa': {
        ok: true,
        status: 200,
        body: {
          model: {
            documentType: 'LETTER_OF_AUTHORIZATION',
            sections: [{ key: 'authorization', heading: 'Authorization', body: 'REAL SERVER LOA BODY' }],
            gaps: ['signatory name'],
          },
          leafIntent: { sectionCode: 'm1.4.1' },
        },
      },
    });
    const card = await renderAndFindCard('Letter of Authorization');

    fireEvent.change(within(card).getByLabelText('Referenced file number'), { target: { value: 'DMF 12345' } });
    fireEvent.change(within(card).getByLabelText(/File holder/), { target: { value: 'Substance Co' } });
    fireEvent.click(within(card).getByText('Assemble now'));

    expect(await screen.findByText(/REAL SERVER LOA BODY/)).toBeTruthy();
    expect(document.body.textContent).toContain('Missing before filing: signatory name');
    expect(postBody('/api/ind-lifecycle/loa')).toMatchObject({
      referencedFileType: 'DMF',
      referencedFileNumber: 'DMF 12345',
      holderName: 'Substance Co',
      authorizedPartyName: 'Acme Bio',
    });
  });

  it('right-of-reference carries the checklist sponsor and renders the m1.4.2 model', async () => {
    mockApi({
      '/api/ind-lifecycle/right-of-reference': {
        ok: true,
        status: 200,
        body: {
          model: {
            documentType: 'STATEMENT_OF_RIGHT_OF_REFERENCE',
            sections: [{ key: 'statement', heading: 'Statement of Right of Reference', body: 'REAL SERVER ROR BODY' }],
            gaps: [],
          },
          leafIntent: { sectionCode: 'm1.4.2' },
        },
      },
    });
    const card = await renderAndFindCard('Statement of Right of Reference');

    fireEvent.change(within(card).getByLabelText('Referenced file number'), { target: { value: 'IND 100200' } });
    fireEvent.click(within(card).getByText('Assemble now'));

    expect(await screen.findByText(/REAL SERVER ROR BODY/)).toBeTruthy();
    expect(postBody('/api/ind-lifecycle/right-of-reference')).toMatchObject({
      sponsorName: 'Acme Bio',
      referencedFileNumber: 'IND 100200',
    });
  });

  it('a failed assemble renders the server’s words — never success', async () => {
    mockApi({
      '/api/ind-lifecycle/loa': {
        ok: false,
        status: 400,
        body: { error: { code: 'VALIDATION', message: 'referencedFileType, referencedFileNumber, holderName and authorizedPartyName are required.' } },
      },
    });
    const card = await renderAndFindCard('Letter of Authorization');
    fireEvent.click(within(card).getByText('Assemble now'));

    expect(
      await screen.findByText(/Could not assemble — referencedFileType, referencedFileNumber, holderName and authorizedPartyName are required\./),
    ).toBeTruthy();
  });
});

describe('IndLifecycle — lifecycle deliverables file into a REAL eCTD sequence', () => {
  const SAFETY_OK = {
    classification: {
      obligation: 'FIFTEEN_DAY',
      reportingWindowDays: 15,
      deadline: '2026-08-28T00:00:00.000Z',
      determinations: { serious: true, suspected: true, unexpected: true, fatalOrLifeThreatening: false },
      regulatoryBasis: '21 CFR 312.32(c)(1)(i)',
      rationale: 'Serious, unexpected, suspected — 15-day report.',
    },
    document: {
      reportType: 'IND_SAFETY_REPORT',
      sections: [{ key: 'identification', heading: 'Identification', body: 'REAL SERVER SAFETY BODY' }],
    },
    amendmentIntent: { sequenceType: 'amendment', region: 'fda', leaves: [{ sectionCode: 'm1.12.4' }] },
  };

  it('safety-report: assemble renders the classification, then File into sequence creates the ectd_sequences row', async () => {
    mockApi({
      '/api/ind-lifecycle/safety-report': { ok: true, status: 200, body: SAFETY_OK },
      '/api/ind-lifecycle/safety-report/file': {
        ok: true,
        status: 201,
        // The filing route's real shape: the created ectd_sequences row + its
        // submission_leaves (createSequence + upsertLeaf in
        // ind-lifecycle-persistence.ts). This is the first-sequence-created
        // proof at the UI seam.
        body: { sequence: { id: 91, submissionId: 31, sequenceNumber: '0002', type: 'amendment', status: 'draft' }, leaves: [{ sectionCode: 'm1.12.4' }] },
      },
    });
    const card = await renderAndFindCard('IND Safety Report', 'Lifecycle');

    fireEvent.change(within(card).getByLabelText('De-identified patient id'), { target: { value: 'PT-001' } });
    fireEvent.change(within(card).getByLabelText('Event description'), { target: { value: 'Grade 4 hepatotoxicity' } });
    fireEvent.change(within(card).getByLabelText(/Causality/), { target: { value: 'probable' } });
    fireEvent.change(within(card).getByLabelText(/Expectedness/), { target: { value: 'unexpected' } });
    fireEvent.click(within(card).getByText('Assemble now'));

    expect(await screen.findByText(/REAL SERVER SAFETY BODY/)).toBeTruthy();
    expect(document.body.textContent).toContain('Serious, unexpected, suspected — 15-day report.');
    // Only what was entered went up — nothing invented.
    expect(postBody('/api/ind-lifecycle/safety-report')).toMatchObject({
      event: {
        eventType: 'SAE',
        seriousnessCriteria: 'death',
        causality: 'probable',
        outcome: 'recovered',
        expectedness: 'unexpected',
        patientId: 'PT-001',
        eventDescription: 'Grade 4 hepatotoxicity',
      },
    });

    // The filing follow-up appears only after the successful build.
    const fileBtn = await within(card).findByText('File into sequence');
    fireEvent.change(within(card).getByLabelText('eCTD sequence number'), { target: { value: '0002' } });
    fireEvent.click(fileBtn);

    expect(await screen.findByText(/Filed eCTD sequence 0002 \(id 91\) — 1 leaf placed\./)).toBeTruthy();
    // The POST carried the checklist's REAL submission anchor + the user's
    // sequence number + the same event — never an invented identity.
    expect(postBody('/api/ind-lifecycle/safety-report/file')).toMatchObject({
      submissionId: 31,
      sequenceNumber: '0002',
      event: { patientId: 'PT-001' },
    });
  });

  it('safety-report: the 4-digit sequence number is required, never guessed', async () => {
    mockApi({ '/api/ind-lifecycle/safety-report': { ok: true, status: 200, body: SAFETY_OK } });
    const card = await renderAndFindCard('IND Safety Report', 'Lifecycle');
    fireEvent.click(within(card).getByText('Assemble now'));

    fireEvent.click(await within(card).findByText('File into sequence'));

    expect(await screen.findByText(/Enter the 4-digit eCTD sequence number/)).toBeTruthy();
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/ind-lifecycle/safety-report/file')).toBe(false);
  });

  it('safety-report: a NOT_REPORTABLE classification removes the filing affordance with the server’s reason', async () => {
    mockApi({
      '/api/ind-lifecycle/safety-report': {
        ok: true,
        status: 200,
        body: { ...SAFETY_OK, classification: { ...SAFETY_OK.classification, obligation: 'NOT_REPORTABLE', reportingWindowDays: null, deadline: null }, amendmentIntent: null },
      },
    });
    const card = await renderAndFindCard('IND Safety Report', 'Lifecycle');
    fireEvent.click(within(card).getByText('Assemble now'));

    await screen.findByText(/REAL SERVER SAFETY BODY/);
    expect(within(card).queryByText('File into sequence')).toBeNull();
    expect(document.body.textContent).toContain('not reportable as an individual expedited IND safety report — there is nothing to file');
  });

  it('a failed filing reports the server’s words — never a fabricated sequence', async () => {
    mockApi({
      '/api/ind-lifecycle/safety-report': { ok: true, status: 200, body: SAFETY_OK },
      '/api/ind-lifecycle/safety-report/file': {
        ok: false,
        status: 409,
        body: { error: { code: 'INVALID_STATE', message: 'Sequence 0002 already exists for this submission.' } },
      },
    });
    const card = await renderAndFindCard('IND Safety Report', 'Lifecycle');
    fireEvent.click(within(card).getByText('Assemble now'));
    const fileBtn = await within(card).findByText('File into sequence');
    fireEvent.change(within(card).getByLabelText('eCTD sequence number'), { target: { value: '0002' } });
    fireEvent.click(fileBtn);

    expect(await screen.findByText('Not filed — Sequence 0002 already exists for this submission.')).toBeTruthy();
    expect(screen.queryByText(/Filed eCTD sequence/)).toBeNull();
  });

  it('annual-report: assemble renders the 312.33 model + gaps, then files as an annual sequence', async () => {
    mockApi({
      '/api/ind-lifecycle/annual-report': {
        ok: true,
        status: 200,
        body: {
          reportType: 'IND_ANNUAL_REPORT',
          sections: [{ key: 'summary_safety_information', heading: 'Summary of Safety Information', cfrRef: '312.33(b)', body: 'REAL SERVER ANNUAL BODY', complete: true }],
          gaps: [{ sectionKey: 'individual_study_status', heading: 'Individual Study Information', cfrRef: '312.33(a)', message: 'Section "Individual Study Information" (312.33(a)) is incomplete and must be authored before filing.' }],
        },
      },
      '/api/ind-lifecycle/annual-report/file': {
        ok: true,
        status: 201,
        body: { sequence: { id: 92, submissionId: 31, sequenceNumber: '0003', type: 'annual', status: 'draft' }, leaves: [{ sectionCode: 'm1.13' }] },
      },
    });
    const card = await renderAndFindCard('IND Annual Report / DSUR', 'Lifecycle');

    fireEvent.change(within(card).getByLabelText('IND number'), { target: { value: '123456' } });
    fireEvent.change(within(card).getByLabelText('Reporting period start'), { target: { value: '2025-08-01' } });
    fireEvent.change(within(card).getByLabelText('Reporting period end'), { target: { value: '2026-08-01' } });
    fireEvent.change(within(card).getByLabelText(/Summary of safety information/), { target: { value: 'No new signals.' } });
    fireEvent.click(within(card).getByText('Assemble now'));

    expect(await screen.findByText(/REAL SERVER ANNUAL BODY/)).toBeTruthy();
    expect(document.body.textContent).toContain('Section "Individual Study Information" (312.33(a)) is incomplete');
    expect(postBody('/api/ind-lifecycle/annual-report')).toMatchObject({
      productName: 'ZX-9 First-in-Human',
      indNumber: '123456',
      reportingPeriodStart: '2025-08-01',
      reportingPeriodEnd: '2026-08-01',
      studyStatuses: [],
      safetySummary: 'No new signals.',
    });

    const fileBtn = await within(card).findByText('File into sequence');
    fireEvent.change(within(card).getByLabelText('eCTD sequence number'), { target: { value: '0003' } });
    fireEvent.click(fileBtn);

    expect(await screen.findByText(/Filed eCTD sequence 0003 \(id 92\) — 1 leaf placed\./)).toBeTruthy();
    expect(postBody('/api/ind-lifecycle/annual-report/file')).toMatchObject({
      submissionId: 31,
      sequenceNumber: '0003',
      indNumber: '123456',
    });
  });

  it('amendment: the plan renders the server leaves + warnings, then files as an amendment sequence', async () => {
    mockApi({
      '/api/ind-lifecycle/amendment-plan': {
        ok: true,
        status: 200,
        body: {
          sequenceType: 'amendment',
          amendmentClasses: ['protocol'],
          leaves: [{ documentId: 'doc-7', sectionCode: 'm5.3.5.1', title: 'Protocol v2', lifecycleOp: 'new', cfrRef: '312.30' }],
          warnings: ['Confirm placement.'],
        },
      },
      '/api/ind-lifecycle/amendment/file': {
        ok: true,
        status: 201,
        body: { sequence: { id: 93, submissionId: 31, sequenceNumber: '0004', type: 'amendment', status: 'draft' }, leaves: [{ sectionCode: 'm5.3.5.1' }] },
      },
    });
    const card = await renderAndFindCard('Protocol / Information Amendment', 'Lifecycle');

    fireEvent.change(within(card).getByLabelText(/Changed document id/), { target: { value: 'doc-7' } });
    fireEvent.change(within(card).getByLabelText('Changed document title'), { target: { value: 'Protocol v2' } });
    fireEvent.click(within(card).getByText('Assemble now'));

    expect(await screen.findByText(/m5\.3\.5\.1 · new — Protocol v2 \(312\.30\)/)).toBeTruthy();
    expect(document.body.textContent).toContain('Confirm placement.');
    expect(postBody('/api/ind-lifecycle/amendment-plan')).toMatchObject({
      changedDocuments: [{ documentId: 'doc-7', title: 'Protocol v2', category: 'protocol', changeKind: 'added' }],
    });

    const fileBtn = await within(card).findByText('File into sequence');
    fireEvent.change(within(card).getByLabelText('eCTD sequence number'), { target: { value: '0004' } });
    fireEvent.click(fileBtn);

    expect(await screen.findByText(/Filed eCTD sequence 0004 \(id 93\) — 1 leaf placed\./)).toBeTruthy();
    expect(postBody('/api/ind-lifecycle/amendment/file')).toMatchObject({
      submissionId: 31,
      sequenceNumber: '0004',
    });
  });

  it('with no submissionId on the checklist, filing is honestly unavailable — nothing is guessed', async () => {
    mockApi(
      { '/api/ind-lifecycle/safety-report': { ok: true, status: 200, body: SAFETY_OK } },
      { ...CHECKLIST, submissionId: null },
    );
    const card = await renderAndFindCard('IND Safety Report', 'Lifecycle');
    fireEvent.click(within(card).getByText('Assemble now'));

    const fileBtn = await within(card).findByText('File into sequence');
    fireEvent.change(within(card).getByLabelText('eCTD sequence number'), { target: { value: '0002' } });
    fireEvent.click(fileBtn);

    expect(await screen.findByText(/no submission id, so there is no eCTD application to file into/)).toBeTruthy();
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/ind-lifecycle/safety-report/file')).toBe(false);
  });
});
