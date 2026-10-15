// @vitest-environment jsdom
/**
 * IndLifecycle — the annual report is filed with an open 312.33 section only
 * when the filer has acknowledged that section.
 *
 * What the screen used to do (until 2026-10-15): "File into sequence" posted
 * the card's report and the server filed it with every open section — the card
 * always leaves at least four open (it has no fields for them) — and nothing
 * was acknowledged by anyone. The server now refuses an unacknowledged open
 * section (409 GAPS_NOT_ACKNOWLEDGED). The card lists each open section with
 * its own checkbox, unticked, and sends exactly the sections ticked; the
 * filing's success line says it was filed with sections open.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { IndLifecycle } from '../surfaces/IndLifecycle';

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

const GAPS = [
  { sectionKey: 'individual_study_status', heading: 'Individual Study Information', cfrRef: '312.33(a)', message: 'Section "Individual Study Information" (312.33(a)) is incomplete and must be authored before filing.' },
  { sectionKey: 'outstanding_business', heading: 'Log of Outstanding Business with FDA', cfrRef: '312.33(g)', message: 'Section "Log of Outstanding Business with FDA" (312.33(g)) is incomplete and must be authored before filing.' },
];
const ANNUAL = {
  reportType: 'IND_ANNUAL_REPORT',
  sections: [{ key: 'summary_safety_information', heading: 'Summary of Safety Information', cfrRef: '312.33(b)', body: 'No new signals.', complete: true }],
  gaps: GAPS,
};

type Reply = { ok: boolean; status: number; body: unknown };
function mockApi(fileReply: Reply) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ind-checklist') {
      return { ok: true, status: 200, json: async () => ({ data: [CHECKLIST], meta: { count: 1 } }) } as Response;
    }
    if (method === 'POST' && url === '/api/ind-lifecycle/annual-report') {
      return { ok: true, status: 200, json: async () => ANNUAL } as Response;
    }
    if (method === 'POST' && url === '/api/ind-lifecycle/annual-report/file') {
      return { ok: fileReply.ok, status: fileReply.status, json: async () => fileReply.body } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

const props = () => ({ onAsk: vi.fn(), onNav: vi.fn() }) as any;
const filings = () => apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === '/api/ind-lifecycle/annual-report/file').map((c) => c[2]);

async function assembledCard() {
  render(<IndLifecycle {...props()} />);
  await screen.findByText('Pre-IND Briefing Book');
  fireEvent.click(screen.getByRole('tab', { name: 'Lifecycle' }));
  const card = screen.getByText('IND Annual Report / DSUR').closest('.indl-dcard')! as HTMLElement;
  fireEvent.click(within(card).getByText('Assemble now'));
  await within(card).findByText(/No new signals\./);
  fireEvent.change(within(card).getByLabelText('eCTD sequence number'), { target: { value: '0003' } });
  return card;
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('annual report — each open section is acknowledged by the filer, one by one', () => {
  it('lists every open section with its own unticked box; untouched, nothing is acknowledged and the refusal is shown', async () => {
    mockApi({
      ok: false,
      status: 409,
      body: { error: { code: 'GAPS_NOT_ACKNOWLEDGED', message: '2 open 312.33 section(s) of this report are not acknowledged: Individual Study Information (312.33(a)); Log of Outstanding Business with FDA (312.33(g)). Complete them, or acknowledge each one (acknowledgedGaps, by section key) to record that it is filed open. Nothing was filed.' } },
    });
    const card = await assembledCard();
    for (const label of ['Individual Study Information (312.33(a))', 'Log of Outstanding Business with FDA (312.33(g))']) {
      expect((within(card).getByLabelText(label) as HTMLInputElement).checked, label).toBe(false);
    }
    fireEvent.click(within(card).getByText('File into sequence'));

    expect(await within(card).findByText(/^Not filed — 2 open 312\.33 section\(s\) of this report are not acknowledged/)).toBeTruthy();
    expect(filings()[0]).not.toHaveProperty('acknowledgedGaps');
  });

  it('sends exactly the sections ticked, and the success line says they were filed open', async () => {
    mockApi({
      ok: true,
      status: 201,
      body: { sequence: { id: 92, sequenceNumber: '0003', type: 'annual' }, leaves: [{ sectionCode: 'm1.13' }], filedWithOpenGaps: 2, openSectionsFiled: ['individual_study_status', 'outstanding_business'] },
    });
    const card = await assembledCard();
    fireEvent.click(within(card).getByLabelText('Individual Study Information (312.33(a))'));
    fireEvent.click(within(card).getByLabelText('Log of Outstanding Business with FDA (312.33(g))'));
    fireEvent.click(within(card).getByText('File into sequence'));

    expect(await within(card).findByText(/Filed eCTD sequence 0003 \(id 92\) — 1 leaf placed\. Filed with 2 section\(s\) open, as acknowledged\./)).toBeTruthy();
    expect(filings()[0]).toMatchObject({ submissionId: 31, sequenceNumber: '0003', acknowledgedGaps: ['individual_study_status', 'outstanding_business'] });
  });

  it('a new build starts with nothing acknowledged — a tick does not carry over to it', async () => {
    mockApi({ ok: false, status: 409, body: { error: { code: 'GAPS_NOT_ACKNOWLEDGED', message: 'Not acknowledged.' } } });
    const card = await assembledCard();
    fireEvent.click(within(card).getByLabelText('Individual Study Information (312.33(a))'));
    fireEvent.click(within(card).getByText('Assemble now'));
    await within(card).findByText(/No new signals\./);
    expect((within(card).getByLabelText('Individual Study Information (312.33(a))') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(card).getByText('File into sequence'));
    await within(card).findByText(/^Not filed — Not acknowledged/);
    expect(filings()[0]).not.toHaveProperty('acknowledgedGaps');
  });

  it('a section ticked and then unticked is not acknowledged', async () => {
    mockApi({ ok: false, status: 409, body: { error: { code: 'GAPS_NOT_ACKNOWLEDGED', message: 'Not acknowledged.' } } });
    const card = await assembledCard();
    const box = within(card).getByLabelText('Individual Study Information (312.33(a))');
    fireEvent.click(box);
    fireEvent.click(box);
    fireEvent.click(within(card).getByLabelText('Log of Outstanding Business with FDA (312.33(g))'));
    fireEvent.click(within(card).getByText('File into sequence'));
    await within(card).findByText(/^Not filed — Not acknowledged/);
    expect(filings()[0]).toMatchObject({ acknowledgedGaps: ['outstanding_business'] });
  });
});
