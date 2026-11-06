// @vitest-environment jsdom
/**
 * Human test J1 (2026-11-06, docs/evidence/HUMAN-TEST/J1/): a device RA manager saw the stored key "MDX" as the
 * client type of their 510(k), on Home's project row, under the project's name and in New project's review ("Workstream
 * MDX"). And Home told a device company that a project is "one regulatory filing, for example an IND".
 *
 * The client type is said in words, from the one map (WS_LABEL, ProjectPortfolioFilters.tsx), wherever it is shown, and
 * Home's example names a device filing beside the drug one.
 */
import React from 'react';
import { intakeFixtureRequest, waitForIntakeWorkspace } from './projectIntakeFixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...args: unknown[]) => intakeFixtureRequest(apiRequest, args),
}));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { firstName: 'Dana' } }) }));

const reg = vi.hoisted(() => ({ ctx: {} as Record<string, string> }));
vi.mock('../surfaces/AnaVerbs', () => ({
  RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange(reg.ctx.id)}>Pick filing</button>
  ),
}));
vi.mock('../surfaces/RegistryBridge', () => ({ getSubmissionTypeContext: () => reg.ctx }));

import { HomeProjects } from '../surfaces/HomeSections';
import { NewProjectWizard } from '../surfaces/Projects';
import { NewProjectObjectiveField } from '../surfaces/ProjectObjective';

afterEach(() => { cleanup(); apiRequest.mockReset(); });

const listState = <T,>(rows: T[]) => ({ rows, loading: false, error: null, empty: rows.length === 0, sample: false }) as never;

describe("Home names a project's client type in words", () => {
  it('a device project reads "Medical device & IVD", never the key MDX', () => {
    render(<HomeProjects onNav={vi.fn()} onNewProject={vi.fn()} onRetry={vi.fn()}
      read={listState([{ id: 'p1', title: 'CardioSense ECG patch 510(k)', code: 'CS-201', status: 'active', ws: 'MDX', stage: 'Planning' }])} />);
    const row = within(screen.getByTestId('home-projects')).getByRole('button');
    expect(row.textContent).toContain('Medical device & IVD');
    expect(row.textContent).not.toMatch(/\bMDX\b/);
  });

  it("with no project, the example names a device filing as well as a drug one", () => {
    render(<HomeProjects onNav={vi.fn()} onNewProject={vi.fn()} onRetry={vi.fn()} read={listState([])} />);
    expect(screen.getByTestId('home-first-project').textContent).toContain('for example an IND or a 510(k)');
  });
});

describe("New project's review names the client type in words", () => {
  const reviewValue = (term: string) =>
    Array.from(document.querySelectorAll('.npw-review-row'))
      .find((r) => r.querySelector('dt')?.textContent === term)
      ?.querySelector('dd')?.textContent ?? null;

  it('an NDA is reviewed under "Client type", not "Workstream"', async () => {
    reg.ctx = { id: 'us_nda', displayName: 'New Drug Application', pathwayKey: 'nda', agency: 'FDA', region: 'US', submissionFormat: 'eCTD' };
    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /pick filing/i }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await waitForIntakeWorkspace();
    fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'J1 NDA' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(reviewValue('Workstream')).toBeNull();
    expect(reviewValue('Client type')).toMatch(/^(Biotech|Pharma)$/);
  });

  it('a 510(k) is reviewed as "Medical device & IVD", never MDX', async () => {
    reg.ctx = { id: 'us_510k', displayName: '510(k) Premarket Notification', pathwayKey: '510k', agency: 'FDA', region: 'US', submissionFormat: 'eSTAR', segment: 'medical_devices' };
    render(<NewProjectWizard onClose={() => {}} onNav={() => {}} segment="medtech" />);
    fireEvent.click(screen.getByRole('button', { name: /pick filing/i }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await waitForIntakeWorkspace();
    fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'J1 510(k)' } });
    const cont = screen.getAllByRole('button', { name: /^continue$/i }).at(-1) as HTMLButtonElement;
    expect(cont.disabled, document.querySelector('.npw-foot')?.textContent ?? '').toBe(false);
    fireEvent.click(cont);
    expect(reviewValue('Client type')).toBe('Medical device & IVD');
    expect(document.body.textContent).not.toMatch(/\bMDX\b/);
  });
});


describe("New project's objective speaks to every filing type", () => {
  it('the placeholder names a device outcome beside the IND one, and no study endpoint', () => {
    render(<NewProjectObjectiveField value="" onChange={() => {}} />);
    const box = screen.getByRole('textbox', { name: /objective/i }) as HTMLTextAreaElement;
    expect(box.placeholder).toContain('510(k) clearance');
    expect(box.placeholder).not.toMatch(/study set out|primary endpoint/);
  });
});
