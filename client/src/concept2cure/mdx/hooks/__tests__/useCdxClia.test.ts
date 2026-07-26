/**
 * @vitest-environment jsdom
 */
/**
 * useCdxPairings / useCliaCategorizations — the two IVD differentiators
 * that were built and invisible.
 *
 * Companion diagnostics (/api/mdx/cdx) and CLIA categorisation
 * (/api/mdx/clia) had no client consumer — reachable through AnA, never
 * by clicking. These hooks put them on the IVD workbench. The tests hold
 * two lines: panels follow the selected programme, and the CLIA waiver
 * lifecycle is reported honestly (a revoked waiver is never "granted").
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCdxPairings, useCliaCategorizations } from '../useCdxClia';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function respond(rows: unknown[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: rows }),
    text: async () => '',
  });
}

const PROGRAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('useCdxPairings', () => {
  it('requests the whole portfolio by default', async () => {
    respond([]);
    renderHook(() => useCdxPairings());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/mdx/cdx/pairings');
  });

  it('scopes to the device programme when given', async () => {
    respond([]);
    renderHook(() => useCdxPairings(PROGRAM));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `/api/mdx/cdx/pairings?device_program_id=${PROGRAM}`,
    );
  });

  it('adapts snake_case server rows into the display shape', async () => {
    respond([
      {
        id: 3,
        drug_name: 'Pembrolizumab',
        drug_sponsor: 'Merck',
        indication: 'NSCLC',
        biomarker: 'PD-L1',
        approval_status: 'approved',
        fda_approval_date: '2025-03-01T00:00:00Z',
        ema_approval_date: null,
      },
    ]);
    const { result } = renderHook(() => useCdxPairings(PROGRAM));
    await waitFor(() => expect(result.current.rows.status).toBe('ready'));

    const row = result.current.rows.status === 'ready' ? result.current.rows.data[0] : null;
    expect(row).toMatchObject({
      id: '3',
      drugName: 'Pembrolizumab',
      sponsor: 'Merck',
      biomarker: 'PD-L1',
      approvalStatus: 'approved',
      fdaApprovalDate: '2025-03-01',
    });
  });

  it('surfaces an empty programme as empty, not a fixture', async () => {
    respond([]);
    const { result } = renderHook(() => useCdxPairings(PROGRAM));
    await waitFor(() => expect(result.current.rows.status).toBe('empty'));
  });

  it('surfaces a failed fetch as an error, not zero pairings', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}), text: async () => 'boom' });
    const { result } = renderHook(() => useCdxPairings(PROGRAM));
    await waitFor(() => expect(result.current.rows.status).toBe('error'));
  });
});

describe('useCliaCategorizations', () => {
  it('scopes to the programme when given', async () => {
    respond([]);
    renderHook(() => useCliaCategorizations(PROGRAM));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/api/mdx/clia?program_id=${PROGRAM}`);
  });

  it('reports a granted waiver as granted', async () => {
    respond([
      { id: 1, test_name: 'Rapid strep', analyte: 'GAS', clia_complexity: 'waived', waiver_granted: true, cms_letter_ref: 'CMS-123' },
    ]);
    const { result } = renderHook(() => useCliaCategorizations(PROGRAM));
    await waitFor(() => expect(result.current.rows.status).toBe('ready'));
    const row = result.current.rows.status === 'ready' ? result.current.rows.data[0] : null;
    expect(row?.waiver).toBe('granted');
  });

  it('reports a revoked waiver as revoked even when granted is still true', async () => {
    /* The load-bearing case: a revoked waiver rendered as granted is a
       lab operating outside its certificate. Revocation outranks grant. */
    respond([
      {
        id: 2, test_name: 'Glucose', analyte: 'glucose', clia_complexity: 'waived',
        waiver_granted: true, waiver_revocation_date: '2026-05-01', cms_letter_ref: 'CMS-9',
      },
    ]);
    const { result } = renderHook(() => useCliaCategorizations(PROGRAM));
    await waitFor(() => expect(result.current.rows.status).toBe('ready'));
    const row = result.current.rows.status === 'ready' ? result.current.rows.data[0] : null;
    expect(row?.waiver).toBe('revoked');
  });

  it('reports an applied-but-undecided waiver as applied', async () => {
    respond([
      { id: 3, test_name: 'HbA1c', analyte: 'hba1c', clia_complexity: 'moderate', waiver_applied: true },
    ]);
    const { result } = renderHook(() => useCliaCategorizations(PROGRAM));
    await waitFor(() => expect(result.current.rows.status).toBe('ready'));
    const row = result.current.rows.status === 'ready' ? result.current.rows.data[0] : null;
    expect(row?.waiver).toBe('applied');
  });

  it('reports no waiver activity as none', async () => {
    respond([{ id: 4, test_name: 'NGS panel', analyte: 'panel', clia_complexity: 'high' }]);
    const { result } = renderHook(() => useCliaCategorizations(PROGRAM));
    await waitFor(() => expect(result.current.rows.status).toBe('ready'));
    const row = result.current.rows.status === 'ready' ? result.current.rows.data[0] : null;
    expect(row?.waiver).toBe('none');
  });
});
