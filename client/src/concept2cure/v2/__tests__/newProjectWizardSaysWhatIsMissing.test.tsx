// @vitest-environment jsdom
/**
 * The New Project wizard says what it is waiting for, and its review reads as
 * a person would say it (2026-10-31 client demo).
 *
 * ── The defects ──────────────────────────────────────────────────────────────
 *   • Continue was disabled with no word of why, and the disabled primary
 *     looked enabled.
 *   • Configure opened with the market's transmit caveats ("Transmit not
 *     proven: FDA onboarding … have not been verified") before a project
 *     existed.
 *   • The review read "Recorded as 510K · ivd" and "Target date 2027-03-31".
 *   • A name already in the portfolio was taken without a word.
 *
 * ── What must be true now ────────────────────────────────────────────────────
 *   • beside a disabled Continue, the first missing field is named, and the
 *     button is described by it;
 *   • Configure states, in one sentence, the outline the project is built
 *     against, and no transmit caveat;
 *   • the review names the filing and the product type by their labels and
 *     prints the date as "Mar 31, 2027";
 *   • a name on the loaded portfolio is said, and not refused.
 */
import React from 'react';
import { intakeFixtureRequest, waitForIntakeWorkspace } from './projectIntakeFixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...args: unknown[]) => intakeFixtureRequest(apiRequest, args),
}));
vi.mock('../surfaces/AnaVerbs', () => ({
  RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange('us_ind')}>Pick IND</button>
  ),
}));
vi.mock('../surfaces/RegistryBridge', () => ({
  getSubmissionTypeContext: () => ({
    id: 'us_ind', displayName: 'Investigational New Drug Application', pathwayKey: 'ind',
    agency: 'FDA', region: 'US', submissionFormat: 'eCTD',
  }),
}));

import { NewProjectWizard, filingLabel, reviewDate, wizardMissing, wizardSetupText } from '../surfaces/Projects';

const MARKET = {
  applicationType: 'ind', market: 'FDA', region: 'us', agency: 'FDA', offered: true, buildable: true,
  summary: "Module 1 to the agency's headings",
  line: 'Transmit not proven: FDA onboarding, submission requirements and an accepted test submission have not been verified',
  outline: { state: 'outline', pack: { version: 'ich-m4-v2.2', label: 'IND × FDA · eCTD M1 + ICH M4 M2–M5' }, detail: 'governed outline' },
};
function api() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && String(url).startsWith('/api/submissions/market-support')) {
      return { ok: true, status: 200, json: async () => ({ applicationType: 'ind', asOf: '2026-10-31', markets: [MARKET] }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });
}
const continueBtn = () => screen.getByRole('button', { name: /^continue$/i }) as HTMLButtonElement;
const missing = () => screen.getByTestId('npw-missing').textContent;
const reviewValue = (term: string) => Array.from(document.querySelectorAll('.npw-review-row'))
  .find((r) => r.querySelector('dt')?.textContent === term)?.querySelector('dd')?.textContent ?? null;

afterEach(() => { cleanup(); apiRequest.mockReset(); });

describe('New Project wizard — a disabled Continue says why', () => {
  it('names the first missing field beside Continue, step by step, and Continue is described by it', async () => {
    api();
    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    expect(continueBtn().disabled).toBe(true);
    expect(missing()).toBe('Choose a filing type to continue.');
    expect(continueBtn().getAttribute('aria-describedby')).toBe('npw-missing');

    fireEvent.click(screen.getByRole('button', { name: /pick ind/i }));
    expect(continueBtn().disabled).toBe(false);
    expect(missing()).toBe('');
    fireEvent.click(continueBtn());
    await waitForIntakeWorkspace();

    expect(missing()).toBe('Enter a project name to continue.');
    fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'ZX-9 — IND' } });
    expect(missing()).toBe('Choose a product type to continue.');
    fireEvent.change(screen.getByRole('combobox', { name: /product type/i }), { target: { value: 'drug' } });
    expect(missing()).toBe('');
    expect(continueBtn().disabled).toBe(false);
    expect(continueBtn().getAttribute('aria-describedby')).toBeNull();
  });

  it('states the order the fields are asked in, for the create step too', () => {
    const all = { filingChosen: true, workspaceRead: true, workspaceChosen: true, nameGiven: true, classStated: true };
    expect(wizardMissing(1, { ...all, workspaceRead: false, workspaceChosen: false })).toBe('Checking client workspaces…');
    expect(wizardMissing(1, { ...all, workspaceChosen: false })).toBe('Choose a client workspace to continue.');
    expect(wizardMissing(2, { ...all, nameGiven: false })).toBe('Enter a project name to create the project.');
    expect(wizardMissing(2, all)).toBeNull();
  });
});

describe('New Project wizard — what the project gets, and the review', () => {
  it('opens Configure with the outline the project is built against, without transmit caveats', async () => {
    api();
    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /pick ind/i }));
    fireEvent.click(continueBtn());
    await waitFor(() => expect(screen.getByTestId('npw-market-support').textContent)
      .toBe('The project is built against the IND × FDA · eCTD M1 + ICH M4 M2–M5 outline, section by section.'));
    expect(document.body.textContent).not.toMatch(/Transmit not proven|ich-m4-v2\.2/);
  });

  it('keeps a filing the platform does not offer in the server’s words', () => {
    expect(wizardSetupText({ ...MARKET, offered: false, summary: 'Not offered', line: 'Not offered: no outline for this market' } as never))
      .toBe('Not offered: no outline for this market.');
  });

  it('names the filing and the product type by their labels, and prints the date as a date', async () => {
    api();
    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /pick ind/i }));
    fireEvent.click(continueBtn());
    await waitForIntakeWorkspace();
    fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'ZX-9 — IND' } });
    fireEvent.change(screen.getByRole('combobox', { name: /product type/i }), { target: { value: 'drug' } });
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2027-03-31' } });
    fireEvent.click(continueBtn());
    expect(reviewValue('Target date')).toBe('Mar 31, 2027');
    expect(reviewValue('Recorded as')).toBe('IND · Drug');
    expect(reviewValue('Pathway')).toBe('IND — eCTD');
  });

  it('labels a filing as people name it, never by its key', () => {
    expect(filingLabel('510k')).toBe('510(k)');
    expect(filingLabel('de_novo')).toBe('De Novo');
    expect(filingLabel('mdr')).toBe('MDR');
    expect(filingLabel('ivd')).toBe('IVD');
    expect(reviewDate('')).toBe('Not set');
  });

  it('says when the name is already a project in the portfolio, and does not refuse it', async () => {
    api();
    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} existingNames={['ZX-9 — IND', 'Other']} />);
    fireEvent.click(screen.getByRole('button', { name: /pick ind/i }));
    fireEvent.click(continueBtn());
    await waitForIntakeWorkspace();
    fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: '  zx-9 — ind ' } });
    expect(screen.getByTestId('npw-name-help').textContent).toContain('A project named “ZX-9 — IND” is already in your portfolio.');
    fireEvent.change(screen.getByRole('combobox', { name: /product type/i }), { target: { value: 'drug' } });
    expect(continueBtn().disabled).toBe(false);
  });
});
