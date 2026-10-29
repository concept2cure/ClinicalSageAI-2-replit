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
});
