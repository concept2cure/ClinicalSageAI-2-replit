// @vitest-environment jsdom
/**
 * IndLifecycle — the particulars a document asserts are entered by the person.
 *
 * What the screen used to do (until 2026-10-15):
 *   - the cover letter card had no FDA center: the server addressed every letter
 *     to CDER, so a CBER IND's letter went to the wrong center;
 *   - the annual-report card posted `safetyReportsInPeriod: []` and
 *     `ibChanges: []`, and the server printed "No IND Safety Reports were
 *     submitted" / "No revisions to the IB" over them as complete sections. The
 *     server now prints "none" only on the sponsor's statement, so the card
 *     offers that statement and stops sending lists it never filled;
 *   - the LOA and right-of-reference cards had no authorized scope: the server
 *     granted "the file in its entirety" for them.
 * An untouched control sends nothing (P-21): the server then reports the gap.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { IndLifecycle, NOT_STATED } from '../surfaces/IndLifecycle';

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

function mockApi() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ind-checklist') {
      return { ok: true, status: 200, json: async () => ({ data: [CHECKLIST], meta: { count: 1 } }) } as Response;
    }
    if (method === 'POST' && url === '/api/ind-lifecycle/cover-letter') {
      return { ok: true, status: 200, json: async () => ({ body: 'LETTER', gaps: [] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

const props = () => ({ onAsk: vi.fn(), onNav: vi.fn() }) as any;
const bodies = (url: string) => apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === url).map((c) => c[2]);

async function card(title: string, tab?: 'Lifecycle') {
  render(<IndLifecycle {...props()} />);
  await screen.findByText('Pre-IND Briefing Book');
  if (tab) fireEvent.click(screen.getByRole('tab', { name: tab }));
  return screen.getByText(title).closest('.indl-dcard')! as HTMLElement;
}

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  mockApi();
});

describe('cover letter — the FDA center is chosen, never assumed', () => {
  it('starts on "Not stated — choose", sends no center untouched, and sends the one chosen', async () => {
    const c = await card('IND Cover Letter');
    const sel = within(c).getByLabelText('FDA center') as HTMLSelectElement;
    expect(sel.value).toBe('');
    expect(sel.options[sel.selectedIndex].text).toBe(NOT_STATED);
    expect([...sel.options].map((o) => o.value)).toEqual(['', 'CDER', 'CBER']);

    fireEvent.click(within(c).getByText('Assemble now'));
    await within(c).findByText('LETTER');
    expect(bodies('/api/ind-lifecycle/cover-letter')[0]).not.toHaveProperty('fdaCenter');

    fireEvent.change(sel, { target: { value: 'CBER' } });
    fireEvent.click(within(c).getByText('Assemble now'));
    await within(c).findByText('LETTER');
    expect(bodies('/api/ind-lifecycle/cover-letter')[1]).toMatchObject({ fdaCenter: 'CBER' });
  });
});

describe('annual report — "none" is the sponsor\'s statement, not an empty list', () => {
  it('untouched, no register list and no "none" goes up; ticked, the statements do', async () => {
    const c = await card('IND Annual Report / DSUR', 'Lifecycle');
    fireEvent.click(within(c).getByText('Assemble now'));
    await within(c).findByText(/Could not assemble/);
    const first = bodies('/api/ind-lifecycle/annual-report')[0];
    expect(first).not.toHaveProperty('safetyReportsInPeriod');
    expect(first).not.toHaveProperty('ibChanges');
    expect(first).not.toHaveProperty('noSafetyReportsInPeriod');
    expect(first).not.toHaveProperty('noIbChangesInPeriod');

    fireEvent.click(within(c).getByLabelText(/No IND Safety Reports were submitted during the period/));
    fireEvent.click(within(c).getByLabelText(/No revisions to the Investigator's Brochure during the period/));
    fireEvent.click(within(c).getByText('Assemble now'));
    await within(c).findByText(/Could not assemble/);
    expect(bodies('/api/ind-lifecycle/annual-report')[1]).toMatchObject({ noSafetyReportsInPeriod: true, noIbChangesInPeriod: true });
  });
});

describe('LOA and right of reference — the authorized scope is entered', () => {
  it('LOA: nothing goes up untouched; entered lines go up as the authorized sections', async () => {
    const c = await card('Letter of Authorization');
    fireEvent.click(within(c).getByText('Assemble now'));
    await within(c).findByText(/Could not assemble/);
    expect(bodies('/api/ind-lifecycle/loa')[0]).not.toHaveProperty('authorizedSections');

    fireEvent.change(within(c).getByLabelText(/Authorized scope/), { target: { value: '3.2.S Drug Substance\n\n 3.2.P.5 ' } });
    fireEvent.click(within(c).getByText('Assemble now'));
    await within(c).findByText(/Could not assemble/);
    expect(bodies('/api/ind-lifecycle/loa')[1]).toMatchObject({ authorizedSections: ['3.2.S Drug Substance', '3.2.P.5'] });
  });

  it('right of reference: the same', async () => {
    const c = await card('Statement of Right of Reference');
    fireEvent.change(within(c).getByLabelText(/Authorized scope/), { target: { value: '3.2.S' } });
    fireEvent.click(within(c).getByText('Assemble now'));
    await within(c).findByText(/Could not assemble/);
    expect(bodies('/api/ind-lifecycle/right-of-reference')[0]).toMatchObject({ authorizedSections: ['3.2.S'] });
  });
});
