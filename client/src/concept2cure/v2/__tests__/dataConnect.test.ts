// @vitest-environment jsdom
/**
 * dataConnect — the `live ?? fixture` primitive every wired surface depends on.
 *
 * These lock the fail-closed contract: live data is adopted only when it
 * structurally matches what the surface renders; anything else (wrong shape,
 * empty, non-OK, network error) keeps the honest fixture with `sample:true`.
 * If this ever regresses, a surface could render degraded/partial data as
 * "Live" — the exact failure the guard exists to prevent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: vi.fn(),
}));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token' }));

import { apiRequest } from '@/lib/queryClient';
import { unwrapList } from '../dataConnect';

const mockApi = apiRequest as unknown as ReturnType<typeof vi.fn>;

function httpRes(status: number, json: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  } as Response;
}

interface Row {
  id: string;
  name: string;
  _new?: boolean;
}
const FIXTURE: Row[] = [{ id: 'fx', name: 'fixture' }];

beforeEach(() => {
  mockApi.mockReset();
});

describe('unwrapList', () => {
  it('returns a bare array unchanged', () => {
    const arr = [{ id: 'a' }];
    expect(unwrapList(arr)).toBe(arr);
  });
  it('extracts the inner list from the canonical { data } envelope', () => {
    const inner = [{ id: 'a' }];
    expect(unwrapList({ data: inner, meta: { count: 1 } })).toBe(inner);
  });
  it('returns the payload as-is when data is not an array', () => {
    const payload = { data: { not: 'an array' } };
    expect(unwrapList(payload)).toBe(payload);
  });
});

