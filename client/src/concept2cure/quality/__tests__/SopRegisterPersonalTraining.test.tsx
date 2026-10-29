// @vitest-environment jsdom
import * as React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(), refresh: vi.fn(), trainRefresh: vi.fn(), onAsk: vi.fn(),
  user: { id: '7', organizationId: '12', name: 'Current reader', role: 'viewer' },
  trainingRows: [] as Array<{ documentId: number; doc: string; current: number; of: number; lastCycle: string; eligible?: boolean; unavailableReason?: string; documentVersion?: string }>,
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
    rows: H.trainingRows,
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
  H.trainingRows = [{ documentId: 6, doc: 'SOP-015 Supplier controls', current: 0, of: 2, lastCycle: '—' }];
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
    const { container } = mount();
    const coverage = screen.getByText('Acknowledgement coverage').closest('.qms-kpi');
    expect(coverage?.querySelector('.val')?.textContent).toBe('—');
    expect(coverage?.querySelector('.sub')?.textContent).toBe('Verified released text is unavailable');
    expect(screen.getByText('Verified approved text is unavailable.')).toBeTruthy();
    expect(container.querySelector('.qms-train-pct')).toBeNull();
  });

  it('distinguishes documents without an active roster from an empty controlled-document list', () => {
    H.trainingRows = [{ ...H.trainingRows[0], of: 0, eligible: true }];
    mount();
    const coverage = screen.getByText('Acknowledgement coverage').closest('.qms-kpi');
    expect(coverage?.querySelector('.val')?.textContent).toBe('—');
    expect(coverage?.querySelector('.sub')?.textContent).toBe('No active roster members to assess');
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
