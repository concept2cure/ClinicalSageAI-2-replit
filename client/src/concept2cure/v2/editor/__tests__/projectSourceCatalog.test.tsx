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

  /* A save that lands inside a long catalogue read makes the server's closing check refuse the read: 503
     SOURCE_READ_ACCESS_CHANGED. Nothing was wrong with the request, so the reader reads once more before it
     says anything (the Quality lane's walk, 2026-11-12: the editor opened a new document on an error). */
  const accessChanged = () => ({ ok: false, status: 503, json: async () => ({ success: false, error: { code: 'SOURCE_READ_ACCESS_CHANGED', message: 'Current source access changed during the read.' } }) });

  it('reads once more, without a word, when source access changed during the read', async () => {
    let asked = 0;
    apiRequest.mockImplementation(async () => (asked++ === 0 ? accessChanged() : ok(page(0, [1, 2], 2))));
    const states: string[] = [];
    const { result } = renderHook(() => { const read = useProjectSourceCatalog(programId); states.push(read.state); return read; });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.sources).toHaveLength(2);
    expect(states, 'the first refusal was shown').not.toContain('error');
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('says so, with a retry, when access changed during the second read too', async () => {
    apiRequest.mockImplementation(async () => accessChanged());
    const { result } = renderHook(() => useProjectSourceCatalog(programId));
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(result.current.retryable).toBe(true);
    expect(result.current.sources).toEqual([]);
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

/* The founder, 2026-11-05: not licensed, not relevant, missing evidence and unavailable to this user are
   never one generic failure. The editor's citation catalogue showed the gate's raw "Module access denied"
   with Try again for a plan without the feature. A refusal is now worded through the one read classifier
   and says no retry can help; only a failure to answer stays retryable. */
const refused = (status: number, code?: string) =>
  Object.assign(new Error('Module access denied'), { name: 'ApiRequestError', status, ...(code ? { code } : {}) });

describe('a refused catalogue read is said as the refusal it is', () => {
  it.each([
    { name: 'a plan without the feature', err: refused(403, 'MODULE_NOT_LICENSED'), words: /not enabled for your organization/ },
    { name: 'a part not in this release', err: refused(403, 'LAUNCH_SCOPE'), words: /not in this release/ },
    { name: 'a role that cannot read it', err: refused(403, 'FORBIDDEN'), words: /Your role cannot do this/ },
    { name: 'a project not in this organization', err: refused(404, 'PROJECT_NOT_FOUND'), words: /not found in your organization/ },
  ])('$name: its own words, and no retry offered', async ({ err, words }) => {
    apiRequest.mockRejectedValue(err);
    const { result } = renderHook(() => useProjectSourceCatalog(programId));
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.error).toMatch(words);
    expect(result.current.error).not.toMatch(/Module access denied|could not be read/);
    expect(result.current.retryable).toBe(false);
  });

  it.each([
    { name: 'a server failure', err: refused(500) },
    { name: 'no response at all', err: new Error('Failed to fetch') },
  ])('$name stays a failed read that a retry can fix', async ({ err }) => {
    apiRequest.mockRejectedValue(err);
    const { result } = renderHook(() => useProjectSourceCatalog(programId));
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.retryable).toBe(true);
  });
});
