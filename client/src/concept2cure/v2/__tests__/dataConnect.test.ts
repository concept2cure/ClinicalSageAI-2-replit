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
import { matchesShape, unwrapList, useLiveList } from '../dataConnect';

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

describe('matchesShape', () => {
  it('accepts a bare array whose rows carry the fixture keys', () => {
    expect(matchesShape([{ id: 'a', name: 'b' }], FIXTURE)).toBe(true);
  });
  it('rejects rows missing a fixture key', () => {
    expect(matchesShape([{ id: 'a' }], FIXTURE)).toBe(false);
  });
  it('rejects a non-array', () => {
    expect(matchesShape({ id: 'a', name: 'b' }, FIXTURE)).toBe(false);
  });
  it('rejects an empty live list when the fixture is non-empty', () => {
    expect(matchesShape([], FIXTURE)).toBe(false);
  });
  it('accepts any non-empty array when the fixture is empty', () => {
    expect(matchesShape([{ anything: 1 }], [] as Row[])).toBe(true);
  });
  it('ignores fixture keys prefixed with _ (client-only flags)', () => {
    // live rows need id + name, not the _new optimistic flag.
    expect(matchesShape([{ id: 'a', name: 'b' }], [{ id: 'x', name: 'y', _new: true }])).toBe(true);
  });
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

describe('useLiveList (fail-closed matrix)', () => {
  async function run(response: () => Promise<Response> | never) {
    mockApi.mockImplementation(response);
    const { result } = renderHook(() => useLiveList<Row>('/api/x', FIXTURE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    return result.current;
  }

  it('adopts a matching bare-array response as live', async () => {
    const state = await run(async () => httpRes(200, [{ id: 'live', name: 'row' }]));
    expect(state.sample).toBe(false);
    expect(state.data).toEqual([{ id: 'live', name: 'row' }]);
  });

  it('adopts a matching { data } envelope as live', async () => {
    const state = await run(async () => httpRes(200, { data: [{ id: 'live', name: 'row' }], meta: {} }));
    expect(state.sample).toBe(false);
    expect(state.data[0].id).toBe('live');
  });

  it('keeps the fixture when the shape does not match', async () => {
    const state = await run(async () => httpRes(200, [{ id: 'live' }]));
    expect(state.sample).toBe(true);
    expect(state.data).toBe(FIXTURE);
  });

  it('keeps the fixture on an empty list', async () => {
    const state = await run(async () => httpRes(200, []));
    expect(state.sample).toBe(true);
    expect(state.data).toBe(FIXTURE);
  });

  it('keeps the fixture on a non-OK response', async () => {
    const state = await run(async () => httpRes(500, { error: 'boom' }));
    expect(state.sample).toBe(true);
    expect(state.data).toBe(FIXTURE);
  });

  it('keeps the fixture when the request throws', async () => {
    const state = await run(async () => {
      throw new Error('network down');
    });
    expect(state.sample).toBe(true);
    expect(state.data).toBe(FIXTURE);
  });
});
