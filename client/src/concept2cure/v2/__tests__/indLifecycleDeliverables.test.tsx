// @vitest-environment jsdom
/**
 * IndLifecycle — the deliverable cards wired end-to-end, mirroring the
 * cover-letter exemplar (see indLifecycleTargetDate.test.tsx):
 *
 *   briefing-book → an editor document (slice G14, 2026-10-29): the card starts
 *     or opens the project's meeting package from the built-in template
 *     (IndBriefingBookStart) and assembles nothing itself.
 *   loa / right-of-reference  → real POST with the loaded
 *     checklist's identity + card particulars; the SERVER's model and gap
 *     verdict render in place; failures render the server's words.
 *   annual-report / amendment → the same, PLUS the "File into sequence"
 *     follow-up after a successful build: a real POST to the filing
 *     counterpart (server/routes/ind-lifecycle/filing.routes.ts →
 *     createSequence + upsertLeaf), which creates the FIRST ectd_sequences
 *     rows reachable from this UI. The submission anchor is the checklist's
 *     REAL submissionId; the 4-digit sequence number is user-entered — a
 *     deliberate regulatory decision, never guessed.
 *
 * Honesty pins: no fabricated success, no invented identity, the sequence
 * number is never auto-filled.
 *
 * The IND safety-report card is NOT OFFERED (decision P-32, 2026-10-15): 21
 * CFR 312.32 reporting and ICSR transmission are not in this release, and
 * production refuses their routes. The cases that drove the card through the
 * screen were re-pointed, not dropped: what the card proved about the generic
 * runner (a refusal read as one sentence, the sequence number never guessed, a
 * failed filing in the server's words, no submission id → nothing filed) is
 * now proved on the annual report, which files the same way; what it proved
 * about the safety intake (P-20, P-21, QA j7) is proved on the withheld card
 * itself (tests/fixtures/withheld/indSafetyReportCard.ts), so it returns as it was; and the
 * screen is shown offering no safety report and calling no safety route.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

vi.mock('../surfaces/IndBriefingBookStart', () => ({
  IndBriefingBookStart: (p: { programId: string }) => <div data-testid="briefing-book-start" data-program={p.programId} />,
}));

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IndLifecycle, NOT_STATED } from '../surfaces/IndLifecycle';
import { safetyEventPayload, safetyReportDeliverable, safetyReportView } from '../../../../../tests/fixtures/withheld/indSafetyReportCard';

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
  it('briefing-book starts the project\'s meeting package in the editor and assembles nothing here', async () => {
    const PROGRAM = '40000000-0000-4000-8000-000000000031';
    mockApi({}, { ...CHECKLIST, programId: PROGRAM });
    const card = await renderAndFindCard('Pre-IND Briefing Book');
    expect(within(card).getByTestId('briefing-book-start').getAttribute('data-program')).toBe(PROGRAM);
    expect(within(card).queryByText('Assemble now')).toBeNull();
    expect(apiRequest.mock.calls.some((c) => String(c[1]).startsWith('/api/ind-lifecycle/briefing-book'))).toBe(false);
  });

  it('briefing-book on an IND linked to no project says so, and starts nothing', async () => {
    mockApi({});
    const card = await renderAndFindCard('Pre-IND Briefing Book');
    expect(within(card).getByText(/not linked to a project/)).toBeTruthy();
    expect(within(card).queryByTestId('briefing-book-start')).toBeNull();
    expect(within(card).queryByText('Assemble now')).toBeNull();
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

    fireEvent.change(within(card).getByLabelText('Referenced file type'), { target: { value: 'DMF' } });
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

describe('IndLifecycle — regulated choices on the File cards start unstated (P-21)', () => {
  /* P-21 (product decision 2026-10-08): regulated choices start unstated. The
     meeting type and the referenced file type showed (and sent) their first
     options — "Pre-IND" and "DMF" — for selects nobody touched. */
  it('the referenced file types start on "Not stated — choose" and send nothing until chosen', async () => {
    mockApi({
      '/api/ind-lifecycle/loa': { ok: false, status: 400, body: { error: { code: 'VALIDATION', message: 'referencedFileType, referencedFileNumber, holderName and authorizedPartyName are required.' } } },
      '/api/ind-lifecycle/right-of-reference': { ok: false, status: 400, body: { error: { code: 'VALIDATION', message: 'sponsorName, referencedFileType and referencedFileNumber are required.' } } },
    });
    render(<IndLifecycle {...props()} />);
    await screen.findByText('Pre-IND Briefing Book');
    const cards = [
      ['Letter of Authorization', 'Referenced file type', '/api/ind-lifecycle/loa', 'referencedFileType'],
      ['Statement of Right of Reference', 'Referenced file type', '/api/ind-lifecycle/right-of-reference', 'referencedFileType'],
    ] as const;
    for (const [title, label, url, key] of cards) {
      const card = screen.getByText(title).closest('.indl-dcard')! as HTMLElement;
      const sel = within(card).getByLabelText(label) as HTMLSelectElement;
      expect(sel.value, title).toBe('');
      expect(sel.options[sel.selectedIndex].text, title).toBe('Not stated — choose');
      fireEvent.click(within(card).getByText('Assemble now'));
      await within(card).findByText(/Could not assemble — /);
      expect(postBody(url), title).not.toHaveProperty(key);
    }
  });
});

describe('IndLifecycle — lifecycle deliverables file into a REAL eCTD sequence', () => {
  /* The annual report's real assemble shape (ind-annual-report-service), and its
     filing route's: the created ectd_sequences row + its submission_leaves. */
  const ANNUAL_OK = {
    reportType: 'IND_ANNUAL_REPORT',
    sections: [{ key: 'summary_safety_information', heading: 'Summary of Safety Information', cfrRef: '312.33(b)', body: 'REAL SERVER ANNUAL BODY', complete: true }],
    gaps: [],
  };

  /* P-32 (2026-10-15). Was: "safety-report: assemble renders the
     classification, then File into sequence creates the ectd_sequences row".
     The card is withheld, so what is pinned is that the screen offers no
     safety report, says so in words, and never calls a safety route — the
     routes production refuses 403 LAUNCH_SCOPE. The filing path the old case
     proved is proved on the annual report below. */
  it('safety-report: not offered — no card, a plain sentence in its place, and no request to a safety route', async () => {
    mockApi({});
    render(<IndLifecycle {...props()} />);
    await screen.findByText('Pre-IND Briefing Book');
    fireEvent.click(screen.getByRole('tab', { name: 'Lifecycle' }));

    // The lifecycle cards that ARE offered render; the safety report does not.
    expect(await screen.findByText('IND Annual Report / DSUR')).toBeTruthy();
    expect(screen.getByText('Protocol / Information Amendment')).toBeTruthy();
    expect(screen.queryByText('IND Safety Report')).toBeNull();
    expect(screen.queryByLabelText('De-identified patient id')).toBeNull();
    expect(screen.queryByLabelText(/Seriousness criterion/)).toBeNull();

    const note = screen.getByTestId('indl-not-offered');
    expect(note.textContent).toBe(
      'IND safety reports under 21 CFR 312.32 (the 7- and 15-day expedited reports) and ICSR transmission are not in this release.',
    );
    // Calm and factual: a statement, no exclamation, no apology.
    expect(note.textContent).not.toMatch(/!|sorry|unfortunately/i);
    expect(note.closest('.indl-dcard')).toBeNull();

    // The File tab names nothing it does not offer.
    fireEvent.click(screen.getByRole('tab', { name: 'For filing' }));
    expect(screen.queryByTestId('indl-not-offered')).toBeNull();

    expect(apiRequest.mock.calls.filter((c) => /\/(safety-reports?|icsr)/.test(String(c[1])))).toEqual([]);
  });

  it('the screen does not import the withheld card, and names no safety route (ci:launch-scope-api walks it)', () => {
    const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
    const src = fs.readFileSync(path.join(REPO, 'client/src/concept2cure/v2/surfaces/IndLifecycle.tsx'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/from\s+['"]\.\/indSafetyReportCard['"]/);
    expect(code).not.toMatch(/import[^;]*tests\/fixtures\/withheld/);
    expect(code).not.toMatch(/['"`]\/api\/ind-lifecycle\/(safety-reports?|icsr-transmissions)/);
  });

  /* Re-pointed from the safety-report card (P-32): the generic runner's
     failure sentence, now on the annual report. */
  it('a refusal thrown by the request layer reads as one sentence, ending once', async () => {
    mockApi({});
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/ind-checklist') {
        return { ok: true, status: 200, json: async () => ({ data: [CHECKLIST], meta: { count: 1 } }) } as Response;
      }
      if (method === 'POST' && url === '/api/ind-lifecycle/annual-report') {
        const err = new Error('The IND annual report cannot be assembled until these are stated: reporting period end. Nothing is assumed for a field left blank.');
        err.name = 'ApiRequestError';
        throw err;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    const card = await renderAndFindCard('IND Annual Report / DSUR', 'Lifecycle');
    fireEvent.click(within(card).getByText('Assemble now'));
    const msg = await screen.findByText(/^Could not assemble — The IND annual report cannot be assembled/);
    expect(msg.textContent).toMatch(/left blank\.$/);
    expect(msg.textContent).not.toMatch(/\.\.$/);
  });

  /* Re-pointed from the safety-report card (P-32). */
  it('the 4-digit sequence number is required, never guessed', async () => {
    mockApi({ '/api/ind-lifecycle/annual-report': { ok: true, status: 200, body: ANNUAL_OK } });
    const card = await renderAndFindCard('IND Annual Report / DSUR', 'Lifecycle');
    fireEvent.click(within(card).getByText('Assemble now'));

    fireEvent.click(await within(card).findByText('File into sequence'));

    expect(await screen.findByText(/Enter the 4-digit eCTD sequence number/)).toBeTruthy();
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/ind-lifecycle/annual-report/file')).toBe(false);
  });

  /* Re-pointed from the safety-report card (P-32). */
  it('a failed filing reports the server’s words — never a fabricated sequence', async () => {
    mockApi({
      '/api/ind-lifecycle/annual-report': { ok: true, status: 200, body: ANNUAL_OK },
      '/api/ind-lifecycle/annual-report/file': {
        ok: false,
        status: 409,
        body: { error: { code: 'INVALID_STATE', message: 'Sequence 0002 already exists for this submission.' } },
      },
    });
    const card = await renderAndFindCard('IND Annual Report / DSUR', 'Lifecycle');
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
    fireEvent.change(within(card).getByLabelText('Content category'), { target: { value: 'protocol' } });
    fireEvent.change(within(card).getByLabelText('Change kind'), { target: { value: 'added' } });
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

  /* P-21: the amendment's content category and change kind went up as
     "protocol" / "added" for selects nobody touched. They start unstated, an
     untouched one is never sent, and the planner's named refusal is shown. */
  it('amendment: category and change kind start unstated, are never sent untouched, and the planner\'s refusal is shown', async () => {
    mockApi({
      '/api/ind-lifecycle/amendment-plan': {
        ok: false,
        status: 400,
        body: { error: { code: 'IND_AMENDMENT_UNSTATED', message: 'IND_AMENDMENT_UNSTATED: state these before the amendment is planned — "Protocol v2": content category, change kind. Nothing is assumed for a choice left blank.' } },
      },
    });
    const card = await renderAndFindCard('Protocol / Information Amendment', 'Lifecycle');
    for (const label of ['Content category', 'Change kind']) {
      const sel = within(card).getByLabelText(label) as HTMLSelectElement;
      expect(sel.value, label).toBe('');
      expect(sel.options[sel.selectedIndex].text, label).toBe('Not stated — choose');
    }
    fireEvent.change(within(card).getByLabelText('Changed document title'), { target: { value: 'Protocol v2' } });
    fireEvent.click(within(card).getByText('Assemble now'));

    expect(await within(card).findByText(/content category, change kind/)).toBeTruthy();
    const sent = (postBody('/api/ind-lifecycle/amendment-plan') as { changedDocuments: Array<Record<string, unknown>> }).changedDocuments[0];
    expect(sent).toEqual({ documentId: '', title: 'Protocol v2' });
  });

  /* Re-pointed from the safety-report card (P-32). */
  it('with no submissionId on the checklist, filing is honestly unavailable — nothing is guessed', async () => {
    mockApi(
      { '/api/ind-lifecycle/annual-report': { ok: true, status: 200, body: ANNUAL_OK } },
      { ...CHECKLIST, submissionId: null },
    );
    const card = await renderAndFindCard('IND Annual Report / DSUR', 'Lifecycle');
    fireEvent.click(within(card).getByText('Assemble now'));

    const fileBtn = await within(card).findByText('File into sequence');
    fireEvent.change(within(card).getByLabelText('eCTD sequence number'), { target: { value: '0002' } });
    fireEvent.click(fileBtn);

    expect(await screen.findByText(/no submission id, so there is no eCTD application to file into/)).toBeTruthy();
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/ind-lifecycle/annual-report/file')).toBe(false);
  });
});

/* The withheld card keeps its honesty rules, so it returns as it was (P-32,
   "hidden, not deleted"). Each case below was a rendered-card case before
   2026-10-15; the card is no longer rendered, so what it pinned is asserted
   on the card's own intake and view, which are unchanged. */
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
const fvOf = (vals: Record<string, string>) => (k: string) => (vals[k] ?? '').trim();
const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '--');

describe('the withheld safety-report card (tests/fixtures/withheld/indSafetyReportCard.ts): its intake', () => {
  it('only what was entered goes up — nothing invented', () => {
    const body = safetyEventPayload(
      fvOf({
        'sr.patientId': 'PT-001',
        'sr.description': 'Grade 4 hepatotoxicity',
        'sr.eventType': 'SAE',
        'sr.seriousness': 'hospitalization',
        'sr.causality': 'probable',
        'sr.outcome': 'recovering',
        'sr.expectedness': 'unexpected',
      }),
    );
    expect(body).toEqual({
      event: {
        eventType: 'SAE',
        seriousnessCriteria: 'hospitalization',
        causality: 'probable',
        outcome: 'recovering',
        expectedness: 'unexpected',
        patientId: 'PT-001',
        eventDescription: 'Grade 4 hepatotoxicity',
      },
    });
  });

  /* QA 2026-10-08 (j7, finding 1): the selects displayed SAE / death /
     definite / recovered with no placeholder, and an untouched card POSTed
     exactly those. Every regulated select starts unstated and an untouched one
     goes up absent. */
  it('no regulated select is pre-selected, and an untouched one is never sent', () => {
    const card = safetyReportDeliverable({ fv: fvOf({}), fmt });
    for (const key of ['sr.eventType', 'sr.seriousness', 'sr.causality', 'sr.outcome']) {
      const f = card.fields.find((x) => x.key === key)!;
      expect(f.kind, key).toBe('select');
      expect(f.placeholder, key).toBe(NOT_STATED);
      expect(f.options?.some((o) => o.v === ''), key).toBe(false);
    }
    const exp = card.fields.find((x) => x.key === 'sr.expectedness')!;
    /* P-20 follow-up: an unassessed expectedness leaves the verdict undecided
       only for a serious, suspected event, so the option says exactly that. */
    expect(exp.options?.[0]).toEqual({ v: '', label: 'Not assessed — decides the verdict only for a serious, suspected event' });
    const ev = (safetyEventPayload(fvOf({ 'sr.onset': '2026-09-20', 'sr.aware': '2026-09-25' })) as { event: Record<string, unknown> }).event;
    expect(ev).toEqual({ onsetDate: '2026-09-20', reportDate: '2026-09-25' });
  });

  /* P-20 (product decision 2026-10-08): the onset date is a date or stated
     explicitly as unknown. */
  it('an onset stated as unknown goes up as "unknown", never as a blank', () => {
    expect(safetyEventPayload(fvOf({ 'sr.onsetUnknown': 'yes', 'sr.aware': '2026-09-25' }))).toEqual({
      event: { onsetDate: 'unknown', reportDate: '2026-09-25' },
    });
    // Both at once go up as both; the server refuses rather than choosing.
    expect(safetyEventPayload(fvOf({ 'sr.onsetUnknown': 'yes', 'sr.onset': '2026-09-20' }))).toEqual({
      event: { onsetDate: '2026-09-20', onsetDateUnknown: true },
    });
  });

});

describe('the withheld safety-report card (tests/fixtures/withheld/indSafetyReportCard.ts): its view of the server verdict', () => {
  it('renders the server classification, and a reportable event can be filed', () => {
    const view = safetyReportView(SAFETY_OK, fmt)!;
    expect(view.text).toContain('Expedited verdict: 15-calendar-day IND safety report');
    expect(view.text).toContain('Deadline: 2026-08-28');
    expect(view.text).toContain('Serious, unexpected, suspected — 15-day report.');
    expect(view.text).toContain('REAL SERVER SAFETY BODY');
    expect(view.canFile).toBe(true);
    // The card files through its own routes — the ones P-32 keeps shut.
    const card = safetyReportDeliverable({ fv: fvOf({}), fmt });
    expect([card.assemblePath, card.pdf?.path, card.file?.path]).toEqual([
      '/api/ind-lifecycle/safety-report',
      '/api/ind-lifecycle/safety-report/pdf',
      '/api/ind-lifecycle/safety-report/file',
    ]);
  });

  it('a NOT_REPORTABLE classification removes the filing affordance with the server’s reason', () => {
    const view = safetyReportView(
      { ...SAFETY_OK, classification: { ...SAFETY_OK.classification, obligation: 'NOT_REPORTABLE', reportingWindowDays: null, deadline: null }, amendmentIntent: null },
      fmt,
    )!;
    expect(view.canFile).toBe(false);
    expect(view.fileNote).toContain('not reportable as an individual expedited IND safety report — there is nothing to file');
  });

  it('a NOT_DETERMINED verdict reads "not determined: expectedness not assessed" and offers nothing to file', () => {
    const view = safetyReportView(
      {
        ...SAFETY_OK,
        classification: {
          ...SAFETY_OK.classification,
          obligation: 'NOT_DETERMINED',
          reportingWindowDays: null,
          deadline: null,
          rationale: 'Not determined: expectedness not assessed. Record expectedness to obtain a verdict.',
        },
        amendmentIntent: null,
      },
      fmt,
    )!;
    expect(view.text).toContain('Expedited verdict: not determined: expectedness not assessed');
    expect(view.text).not.toMatch(/NOT_DETERMINED|not reportable/i);
    expect(view.canFile).toBe(false);
    expect(view.fileNote).toBe(
      'No expedited-reporting verdict: expectedness has not been assessed against the IB / Reference Safety Information. Record it to obtain one — there is nothing to file until then.',
    );
  });
});
