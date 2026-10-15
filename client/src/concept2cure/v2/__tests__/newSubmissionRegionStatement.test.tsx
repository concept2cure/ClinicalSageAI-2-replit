// @vitest-environment jsdom
/**
 * The chosen region's full statement, under the select (filing-spine design
 * review, item 7, 2026-10-15).
 *
 * Each region option is labelled "<region> · <summary>", and at 375px the
 * option clips its last clause, the part that says what the platform cannot
 * do. The field now states the chosen region's full statement (the summary and
 * the line, as the market rows say it, marketSupportText) in its live
 * description, so the choice is read in full wherever it is made.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { NewSubmissionForm } from '../surfaces/NewSubmissionForm';

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const MARKETS = [
  { applicationType: 'maa', market: 'FDA', region: 'US', agency: 'FDA', summary: 'Not offered', line: 'Not offered: an MAA is not an FDA application', buildable: false, offered: false },
  { applicationType: 'maa', market: 'EMA', region: 'EU', agency: 'EMA', summary: 'Flat Module 1, no transmit channel', line: 'Built as a flat Module 1; the EMA gateway adapter refuses', buildable: false, offered: true },
];

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    String(url).startsWith('/api/submissions/market-support') ? ok({ applicationType: 'maa', asOf: '2026-10-15', markets: MARKETS }) : ok({}));
});
afterEach(cleanup);

const form = () => (
  <NewSubmissionForm openProgramId={null} openProjectName={null} workspace={null} projectSubmissions={[]} submissionsSettled
    submissionsUnread={false} programmes={[]} creating={false} onCancel={vi.fn()} onSubmit={vi.fn()} />
);

describe('New submission: the chosen region is stated in full', () => {
  it("states the chosen region's summary and line under the select, and follows the choice", async () => {
    render(form());
    fireEvent.change(screen.getByLabelText(/Application type/), { target: { value: 'maa' } });
    const region = screen.getByLabelText(/Primary region/) as HTMLSelectElement;
    await screen.findByRole('option', { name: /EU \(EMA\) · Flat Module 1, no transmit channel/ });
    fireEvent.change(region, { target: { value: 'eu' } });
    const desc = () => document.getElementById(region.getAttribute('aria-describedby') ?? '')?.textContent ?? '';
    expect(desc()).toContain('EU (EMA): Flat Module 1, no transmit channel. Built as a flat Module 1; the EMA gateway adapter refuses.');
    fireEvent.change(region, { target: { value: 'fda' } });
    expect(desc()).toContain('FDA (US): Not offered: an MAA is not an FDA application.');
    expect(desc()).not.toContain('EU (EMA):');
  });
});

/* Review item 6 (2026-10-15): a market the server does not offer for the type
   is named in the list and cannot be chosen; the server refuses it too. */
describe('New submission: a market not offered cannot be chosen', () => {
  it('disables the option the statement does not offer, and keeps the offered ones', async () => {
    render(form());
    fireEvent.change(screen.getByLabelText(/Application type/), { target: { value: 'maa' } });
    const fda = await screen.findByRole('option', { name: /FDA \(US\) · Not offered/ }) as HTMLOptionElement;
    expect(fda.disabled).toBe(true);
    expect((screen.getByRole('option', { name: /EU \(EMA\) · Flat Module 1/ }) as HTMLOptionElement).disabled).toBe(false);
  });
});
