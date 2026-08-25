/**
 * @vitest-environment jsdom
 */
/**
 * useK510PredicateFallback — the reduced openFDA predicate fallback.
 *
 * The contract that matters: the hook stays IDLE (null url → no request)
 * until the surface hands it real query terms — which it only does once the
 * shadow-backed predicate fetch has errored — and an unavailable openFDA
 * passes through as { available:false, unavailableReason } with null rows,
 * never fabricated clearance records.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { predicateFallbackUrl, useK510PredicateFallback } from '../useK510';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('predicateFallbackUrl (query contract)', () => {
  it('is null with no terms — the hook stays idle while the primary source is healthy', () => {
    expect(predicateFallbackUrl(null, null)).toBeNull();
    expect(predicateFallbackUrl('  ', '')).toBeNull();
  });

  it('drops a sub-2-character deviceName rather than sending a query the server 400s', () => {
    expect(predicateFallbackUrl('x', null)).toBeNull();
    expect(predicateFallbackUrl('x', 'MDS')).toBe('/api/510k/device/predicates?productCode=MDS');
  });

  it('encodes both terms', () => {
    expect(predicateFallbackUrl('glucose monitor', 'MDS')).toBe(
      '/api/510k/device/predicates?deviceName=glucose+monitor&productCode=MDS',
    );
  });
});

describe('useK510PredicateFallback', () => {
  it('issues no request while both terms are null', () => {
    const { result } = renderHook(() => useK510PredicateFallback(null, null));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.rows).toBeNull();
    expect(result.current.available).toBeNull();
  });

  it('surfaces openFDA clearance rows when available', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        available: true,
        results: [
          {
            kNumber: 'K221847',
            deviceName: 'Dexcom G7 CGM System',
            applicant: 'Dexcom, Inc.',
            productCode: 'MDS',
            decisionDate: '2022-12-08',
            decisionCode: 'SESE',
            clearanceType: 'Traditional',
          },
        ],
        source: 'openfda',
        reduced: true,
      }),
    );
    const { result } = renderHook(() => useK510PredicateFallback(null, 'MDS'));
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows?.[0].kNumber).toBe('K221847');
    expect(result.current.unavailableReason).toBeNull();
  });

  it('passes available:false through honestly — null rows, reason kept', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        available: false,
        unavailableReason: 'openFDA device/510k.json timed out after 10000ms',
        results: [],
        source: 'openfda',
        reduced: true,
      }),
    );
    const { result } = renderHook(() => useK510PredicateFallback('glucose monitor', null));
    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.rows).toBeNull();
    expect(result.current.unavailableReason).toMatch(/timed out/);
  });
});
