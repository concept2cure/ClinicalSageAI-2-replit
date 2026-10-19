// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { useProjectSourceCatalog } from '../useProjectSourceCatalog';
import { parseProjectSourcePage } from '../projectSourceCatalog';
const programId = '11111111-1111-4111-8111-111111111111';
const source = (id: number) => ({ id, title: `Source ${id}`, extractionStatus: 'extracted', textAvailable: true, isCurrent: true, dataEligible: true, originalFileAvailable: true });
const page = (offset: number, ids: number[], total: number) => ({ projectId: programId, sources: ids.map(source), total,
  currentTotal: total, page: { limit: 200, offset }, window: { shown: ids.length, truncated: offset + ids.length < total } });
const first = () => page(0, Array.from({ length: 200 }, (_, index) => index + 1), 201);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
beforeEach(() => { apiRequest.mockReset(); });
afterEach(cleanup);

describe('complete citation catalogue reads', () => {
  it('holds numbering metadata until every page has been confirmed', async () => {
    let finish!: (response: ReturnType<typeof ok>) => void;
    apiRequest.mockImplementation(async (_method: string, url: string) => url.includes('offset=0') ? ok(first()) : new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useProjectSourceCatalog(programId));
    await waitFor(() => expect(result.current.loaded).toBe(200));
    expect(result.current.state).toBe('loading');
    expect(result.current.sources).toEqual([]);
    await act(async () => { finish(ok(page(200, [201], 201))); });
    expect(result.current.state).toBe('ready');
    expect(result.current.sources).toHaveLength(201);
  });

  it.each([page(200, [200], 201), page(200, [201], 202)])('refuses overlapping or changed page contents', async second => {
    apiRequest.mockImplementation(async (_method: string, url: string) => ok(url.includes('offset=0') ? first() : second));
    const { result } = renderHook(() => useProjectSourceCatalog(programId));
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.sources).toEqual([]);
    expect(result.current.error).toContain('changed');
  });

  it('retries the full read after a later-page failure without retaining incomplete authority', async () => {
    let failed = false;
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url.includes('offset=0')) return ok(first());
      if (!failed) { failed = true; return { ok: false, status: 503, json: async () => ({ message: 'Read unavailable' }) }; }
      return ok(page(200, [201], 201));
    });
    const { result } = renderHook(() => useProjectSourceCatalog(programId));
    await waitFor(() => expect(result.current.state).toBe('error'));
    act(() => result.current.retry());
    expect(result.current.sources).toEqual([]);
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.sources).toHaveLength(201);
    expect(apiRequest.mock.calls.map(([, url]) => new URL(url, 'https://example.test').searchParams.get('offset'))).toEqual(['0', '200', '0', '200']);
  });

  it('refuses a nonprogressing empty page instead of looping or claiming completion', () => {
    expect(parseProjectSourcePage(page(0, [], 201), { programId, offset: 0, limit: 200 }).ok).toBe(false);
  });

  it.each([
    { textAvailable: 'true' },
    { processing: { state: 'completed', retryable: false, reasonCode: null, leaseExpiresAt: 'not-a-date', nextRetryAt: null } },
    { processing: { state: 'future_state', retryable: false, reasonCode: null, leaseExpiresAt: null, nextRetryAt: null } },
  ])('refuses malformed supplied processing/availability fields without citation authority (%j)', over => {
    const body = page(0, [1], 1);
    Object.assign(body.sources[0], over);
    expect(parseProjectSourcePage(body, { programId, offset: 0, limit: 200 }).ok).toBe(false);
  });
});
