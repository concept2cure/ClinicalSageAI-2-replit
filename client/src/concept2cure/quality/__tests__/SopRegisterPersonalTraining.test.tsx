// @vitest-environment jsdom
import * as React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(), refresh: vi.fn(), trainRefresh: vi.fn(), onAsk: vi.fn(),
  user: { id: '7', organizationId: '12', name: 'Current reader', role: 'viewer' },
  trainingRows: [] as Array<{ documentId: number; doc: string; current: number | null; of: number | null; lastCycle: string; eligible?: boolean; unavailableReason?: string; documentVersion?: string;
    assignment?: 'assigned' | 'not_assigned' | 'no_active_assignees'; me?: { assigned: boolean; countsNow: boolean } | null }>,
  summary: null as null | Record<string, unknown>,
}));
const documentRow = {
  id: 6, docNumber: 'SOP-015', title: 'Supplier controls', docType: 'sop', category: null,
  version: '1.0', status: 'effective', effectiveDate: '2026-09-01', nextReviewDate: null, updatedAt: null,
};
vi.mock('../hooks', () => ({
  useSopRegister: () => ({ docs: [documentRow], loading: false, error: null, refresh: H.refresh }),
  useSopTemplates: () => ({ templates: [], loading: false, error: null }),
  useReviewDue: () => ({ rows: [], loading: false, error: null, refresh: vi.fn() }),
  useTrainingCompliance: () => ({
    rows: H.trainingRows, summary: H.summary,
    loading: false, error: null, refresh: H.trainRefresh,
  }),
  useTrainingExpiring: () => ({ rows: [], failed: false, error: null, refresh: vi.fn() }),
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => H.user }));
vi.mock('@/lib/queryClient', async (original) => ({
  ...await original<typeof import('@/lib/queryClient')>(),
  apiRequest: (...args: unknown[]) => H.apiRequest(...args),
}));
import { SopRegister } from '../SopRegister';

const context = {
  documentId: 6, docNumber: 'SOP-015', title: 'Supplier controls', documentVersion: '1.0',
  status: 'effective', contentDigest: 'a'.repeat(64), eligible: true, canEditControlledText: false, unavailableReason: null,
  sections: [{ key: 'procedure', label: 'Procedure', body: 'Review the supplier record before release.' }],
  acknowledgement: null,
};
const getBody = () => ({ data: { id: 6, organization_id: 12, version: '1.0', status: 'effective' }, meta: { training: context } });
const response = (body: unknown) => ({ status: 200, ok: true, json: async () => body });
const mount = () => render(<SopRegister onAsk={H.onAsk} filter="all" onFilterChange={() => {}} />);
beforeEach(() => {
  H.apiRequest.mockReset(); H.onAsk.mockReset(); H.trainRefresh.mockReset(); H.refresh.mockReset();
  H.user = { id: '7', organizationId: '12', name: 'Current reader', role: 'viewer' };
  H.trainingRows = [{ documentId: 6, doc: 'SOP-015 Supplier controls', assignment: 'assigned', current: 0, of: 2, lastCycle: '—' }];
  H.summary = { documents: 1, assigned: 1, notAssigned: 0, noActiveAssignees: 0, unavailable: 0, averageCurrentPct: 0 };
});
afterEach(cleanup);

describe('the existing Quality register personal training handoff', () => {
  it('lets an active viewer read the actual release instead of delegating a team acknowledgement to AnA', async () => {
    H.apiRequest.mockResolvedValue(response(getBody()));
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Read and acknowledge' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Read and acknowledge' })).toBeTruthy());
    expect(await screen.findByText(context.sections[0].body)).toBeTruthy();
    expect(H.apiRequest).toHaveBeenCalledWith('GET', '/api/mdx/qms/documents/6');
    expect(H.onAsk).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Record training' })).toBeNull();
  });

  it('opens the same personal reader from a real training row', async () => {
    H.apiRequest.mockResolvedValue(response(getBody()));
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'My acknowledgement for SOP-015 Supplier controls' }));
    expect(await screen.findByText(context.sections[0].body)).toBeTruthy();
    expect(H.apiRequest).toHaveBeenCalledWith('GET', '/api/mdx/qms/documents/6');
  });

  it('qualifies unavailable releases instead of presenting them as assessed roster coverage', () => {
    H.trainingRows = [{ ...H.trainingRows[0], eligible: false, documentVersion: '1.0', unavailableReason: 'Verified approved text is unavailable.' }];
    H.summary = { documents: 1, assigned: 1, notAssigned: 0, noActiveAssignees: 0, unavailable: 1, averageCurrentPct: null };
    const { container } = mount();
    const coverage = screen.getByText('Acknowledgement coverage').closest('.qms-kpi');
    expect(coverage?.querySelector('.val')?.textContent).toBe('—');
    expect(coverage?.querySelector('.sub')?.textContent).toBe('Verified released text is unavailable');
    expect(screen.getByText('Verified approved text is unavailable.')).toBeTruthy();
    expect(container.querySelector('.qms-train-pct')).toBeNull();
  });

  // Contract change (MR-12 Stage 4 slice 3a, P-49): coverage counts the people assigned, and the KPI is the server's summary.
  it('distinguishes a document whose assigned people are none active from an empty controlled-document list', () => {
    H.trainingRows = [{ ...H.trainingRows[0], assignment: 'no_active_assignees', current: null, of: null }];
    H.summary = { documents: 1, assigned: 0, notAssigned: 0, noActiveAssignees: 1, unavailable: 0, averageCurrentPct: null };
    const { container } = mount();
    const coverage = screen.getByText('Acknowledgement coverage').closest('.qms-kpi');
    expect(coverage?.querySelector('.val')?.textContent).toBe('—');
    expect(coverage?.querySelector('.sub')?.textContent).toBe('No one assigned is an active member');
    expect(screen.getByText('No active assignees')).toBeTruthy();
    expect(container.querySelector('.qms-train-pct'), 'no figure, not 0/0').toBeNull();
  });

  it('a document assigned to nobody says so, with no bar and no fraction; the KPI says nothing is assigned', () => {
    H.trainingRows = [{ ...H.trainingRows[0], assignment: 'not_assigned', current: null, of: null }];
    H.summary = { documents: 1, assigned: 0, notAssigned: 1, noActiveAssignees: 0, unavailable: 0, averageCurrentPct: null };
    const { container } = mount();
    expect(screen.getByText('Not assigned')).toBeTruthy();
    expect(screen.getByText('Nobody is assigned to train on this document.')).toBeTruthy();
    expect(container.querySelector('.qms-train-pct')).toBeNull();
    expect(container.querySelector('.qms-train-bar')).toBeNull();
    expect(container.textContent).not.toMatch(/\b0\//);
    const coverage = screen.getByText('Acknowledgement coverage').closest('.qms-kpi');
    expect(coverage?.querySelector('.val')?.textContent).toBe('—');
    expect(coverage?.querySelector('.sub')?.textContent).toBe('No document is assigned yet');
  });

  it('an assigned document shows how many of the people assigned are current, and the reader\'s own line; the KPI is the server\'s average', () => {
    H.trainingRows = [{ ...H.trainingRows[0], current: 2, of: 3, me: { assigned: true, countsNow: false } }];
    H.summary = { documents: 1, assigned: 1, notAssigned: 0, noActiveAssignees: 0, unavailable: 0, averageCurrentPct: 67 };
    const { container } = mount();
    const pct = container.querySelector('.qms-train-pct');
    expect(pct?.textContent).toBe('2/3');
    expect(pct?.getAttribute('title')).toBe('2 of 3 assigned have acknowledged the version in force');
    expect(screen.getByTestId('qms-train-me').textContent).toBe('You are assigned and have not acknowledged the version in force.');
    const coverage = screen.getByText('Acknowledgement coverage').closest('.qms-kpi');
    expect(coverage?.querySelector('.val')?.textContent).toBe('67%');
    expect(coverage?.querySelector('.sub')?.textContent).toBe('Average of assigned people, version in force');
  });

  it('a reader who is not assigned has no line of their own; one who is current is told so', () => {
    H.trainingRows = [{ ...H.trainingRows[0], me: { assigned: false, countsNow: true } }];
    const { unmount } = mount();
    expect(screen.queryByTestId('qms-train-me')).toBeNull();
    unmount();
    H.trainingRows = [{ ...H.trainingRows[0], current: 1, me: { assigned: true, countsNow: true } }];
    mount();
    expect(screen.getByTestId('qms-train-me').textContent).toBe('You are current on the version in force.');
  });

  it('rows without a summary from the server show no figure, and say so', () => {
    H.summary = null;
    mount();
    const coverage = screen.getByText('Acknowledgement coverage').closest('.qms-kpi');
    expect(coverage?.querySelector('.val')?.textContent).toBe('—');
    expect(coverage?.querySelector('.sub')?.textContent).toBe('The coverage summary could not be read');
  });

  it('closes the selected reader immediately when the authenticated organization changes', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    H.apiRequest.mockReturnValue(new Promise<ReturnType<typeof response>>(done => { resolve = done; }));
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Read and acknowledge' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    H.user = { ...H.user, organizationId: '13' };
    view.rerender(<SopRegister onAsk={H.onAsk} filter="all" onFilterChange={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    resolve(response(getBody()));
    await waitFor(() => expect(screen.queryByText(context.sections[0].body)).toBeNull());
    expect(H.apiRequest).toHaveBeenCalledTimes(1);
  });
});
