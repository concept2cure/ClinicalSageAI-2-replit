// @vitest-environment jsdom
/**
 * The quality records (decision P-48): each register reads its QMS route, says
 * so when that read fails, and writes through the route that records the audit
 * row. A nonconformance's disposition is refused without its rationale.
 */
import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  reads: {} as Record<string, { data: unknown; loading: boolean; error: string | null }>,
}));

vi.mock('../../mdx/hooks/useFetchJson', () => ({
  useFetchJson: (url: string) => ({ ...(H.reads[url] ?? { data: null, loading: true, error: null }), refresh: H.refresh }),
}));
vi.mock('../../v2/shellProject', () => ({ shellProgramId: () => null }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
  serverMessage: (p: { error?: string } | null) => p?.error ?? null,
  redactInternals: (m: string) => m,
}));

import { QmsRecords } from '../QmsRecords';

const NC = {
  id: 4, nc_number: 'NC-2026-004', device_name: 'Drug substance', lot_or_serial: 'B-1021', source: 'final_inspection',
  description: 'Assay out of specification at release', disposition: null, disposition_rationale: null,
  disposition_at: null, detected_at: '2026-10-20T09:00:00Z', capa_linked: false,
};

const CAPA = {
  id: 'c0ffee00-0000-4000-8000-000000000001', programId: 'p', capaCode: 'CAPA-007', title: 'Assay OOS recurrence',
  type: 'corrective', source: 'nonconformance', riskLevel: 'high', state: 'effectiveness_check',
  targetCloseDate: '2026-11-30T00:00:00Z', problemStatement: null, closedAt: null,
};

afterEach(() => { cleanup(); H.apiRequest.mockReset(); H.reads = {}; });

describe('Quality records', () => {
  it('lists nonconformances and records a disposition only with its rationale', async () => {
    H.reads['/api/mdx/qms/nonconforming'] = { data: { data: [NC] }, loading: false, error: null };
    H.apiRequest.mockResolvedValue({ status: 200, json: async () => ({ data: { ...NC, disposition: 'rework' } }) });
    render(<QmsRecords tab="nonconforming" onAsk={vi.fn()} />);

    expect(screen.getByText('NC-2026-004')).toBeTruthy();
    expect(screen.getByText('Awaiting disposition', { selector: '.qms-pill' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Disposition/ }));
    const drawer = screen.getByRole('dialog');
    fireEvent.change(within(drawer).getByLabelText(/^Disposition/), { target: { value: 'rework' } });
    fireEvent.change(within(drawer).getByLabelText(/Rationale/), { target: { value: 'short' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Record disposition' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText(/Not recorded — a rationale/)).toBeTruthy());
    expect(H.apiRequest).not.toHaveBeenCalled();

    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/Rationale/), {
      target: { value: 'Re-test after column replacement confirmed the assay result is a lab error.' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record disposition' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledTimes(1));
    expect(H.apiRequest).toHaveBeenCalledWith('PATCH', '/api/mdx/qms/nonconforming/4/disposition', {
      disposition: 'rework',
      dispositionRationale: 'Re-test after column replacement confirmed the assay result is a lab error.',
    });
    await waitFor(() => expect(screen.getByText('NC-2026-004: Rework was recorded.')).toBeTruthy());
  });

  it('shows a failed supplier read as a failure, not an empty register', () => {
    H.reads['/api/mdx/qms/suppliers'] = { data: null, loading: false, error: 'HTTP 500' };
    render(<QmsRecords tab="suppliers" onAsk={vi.fn()} />);
    expect(screen.getByText('The suppliers register could not be read')).toBeTruthy();
    expect(screen.queryByText(/No suppliers recorded yet/)).toBeNull();
  });

  it('moves a CAPA only along the server lifecycle, and closes it only with its effectiveness result', async () => {
    H.reads['/api/capa-mdr/capa'] = { data: { rows: [CAPA], count: 1 }, loading: false, error: null };
    H.apiRequest.mockResolvedValue({ status: 200, json: async () => ({ ...CAPA, state: 'closed_effective', meta: {} }) });
    render(<QmsRecords tab="capa" onAsk={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Advance/ }));
    const moveTo = within(screen.getByRole('dialog')).getByLabelText(/^Move to/) as HTMLSelectElement;
    expect([...moveTo.options].map((o) => o.value).filter(Boolean)).toEqual(['closed_effective', 'closed_not_effective', 'escalated']);

    fireEvent.change(moveTo, { target: { value: 'closed_effective' } });
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/Reason for this move/), {
      target: { value: 'Three consecutive lots released within specification after the fix.' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record the move' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText(/needs the effectiveness check result/)).toBeTruthy());
    expect(H.apiRequest).not.toHaveBeenCalled();

    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/Effectiveness check result/), {
      target: { value: 'No recurrence in 3 lots.' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record the move' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledWith('POST', `/api/capa-mdr/capa/${CAPA.id}/transition`, {
      to: 'closed_effective',
      reason: 'Three consecutive lots released within specification after the fix.',
      effectivenessCheckResult: { summary: 'No recurrence in 3 lots.' },
    }));
    await waitFor(() => expect(screen.getByText('CAPA-007 moved to Closed, effective.')).toBeTruthy());
  });

  it('refuses to raise a CAPA with no project open', async () => {
    H.reads['/api/capa-mdr/capa'] = { data: { rows: [], count: 0 }, loading: false, error: null };
    render(<QmsRecords tab="capa" onAsk={vi.fn()} />);
    expect(screen.getByText('No CAPAs recorded yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Raise CAPA/ }));
    const d = screen.getByRole('dialog');
    fireEvent.change(within(d).getByLabelText(/^Title/), { target: { value: 'Supplier CoA gaps' } });
    fireEvent.click(within(d).getByRole('radio', { name: 'Corrective' }));
    fireEvent.change(within(d).getByLabelText(/Raised from/), { target: { value: 'supplier' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Raise CAPA' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText(/open a project first/)).toBeTruthy());
    expect(H.apiRequest).not.toHaveBeenCalled();
  });
});
