/**
 * @vitest-environment jsdom
 */
/**
 * useMdxSearch — live cross-record search for the ⌘K palette.
 *
 * /api/mdx/search fanned out over programs, artifacts, Q-Subs, audit,
 * threads and labeling, and had no consumer; the palette could only
 * match a static nav list. This hook connects the two. The tests hold
 * the properties that keep a per-keystroke search well-behaved: a
 * minimum query length, debounce, last-write-wins over the network, and
 * failure-as-empty rather than an error over the palette.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMdxSearch } from '../useMdxSearch';

/* Fake timers are needed to drive the debounce, but they deadlock
   @testing-library's waitFor (which polls on setInterval). Instead we
   advance timers inside act() — advanceTimersByTimeAsync flushes the
   fetch/json microtasks too — and assert synchronously after. */
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function grouped(hits: Array<{ type: string; id: string | number; title: string }>) {
  const data: Record<string, unknown[]> = {};
  for (const h of hits) (data[h.type] ||= []).push({ ...h, snippet: null, url: `/x/${h.id}` });
  return { ok: true, status: 200, json: async () => ({ data }) };
}

describe('useMdxSearch', () => {
  it('does not fetch for a query below the minimum length', async () => {
    const { result } = renderHook(() => useMdxSearch('a'));
    await tick(300);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.hits).toEqual([]);
    expect(result.current.ran).toBe(false);
  });

  it('debounces — one fetch for a burst of keystrokes', async () => {
    fetchMock.mockResolvedValue(grouped([]));
    const { rerender } = renderHook(({ q }) => useMdxSearch(q), {
      initialProps: { q: 'ri' },
    });
    rerender({ q: 'ris' });
    rerender({ q: 'risk' });
    await tick(250);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('q=risk');
  });

  it('flattens grouped results across every type', async () => {
    fetchMock.mockResolvedValue(
      grouped([
        { type: 'program', id: 'p1', title: 'BX-204' },
        { type: 'artifact', id: 9, title: 'BX-204 risk file' },
        { type: 'labeling', id: 3, title: 'BX-204 IFU' },
      ]),
    );
    const { result } = renderHook(() => useMdxSearch('BX-204'));
    await tick(250);
    expect(result.current.hits).toHaveLength(3);
    expect(result.current.hits.map((h) => h.type)).toEqual(['program', 'artifact', 'labeling']);
  });

  it('encodes the query so a name with spaces or symbols is safe', async () => {
    fetchMock.mockResolvedValue(grouped([]));
    renderHook(() => useMdxSearch('K-25 & risk'));
    await tick(250);
    expect(String(fetchMock.mock.calls[0][0])).toContain('q=K-25%20%26%20risk');
  });

  it('ignores a stale response that resolves after a newer query', async () => {
    /* Last-write-wins: the slow first response must not clobber the fast
       second one. */
    let resolveFirst!: (v: unknown) => void;
    const first = new Promise((r) => { resolveFirst = r; });
    fetchMock
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(grouped([{ type: 'program', id: 'p2', title: 'second' }]));

    const { result, rerender } = renderHook(({ q }) => useMdxSearch(q), {
      initialProps: { q: 'aaa' },
    });
    await tick(250); // fires first fetch (stays pending)
    rerender({ q: 'bbb' });
    await tick(250); // fires second fetch, resolves with "second"
    expect(result.current.hits[0]?.title).toBe('second');

    // now the stale first finally resolves — it must be ignored
    await act(async () => {
      resolveFirst(grouped([{ type: 'program', id: 'p1', title: 'first' }]));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.hits[0]?.title).toBe('second');
  });

  it('reports a failed search as empty, not an error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useMdxSearch('risk'));
    await tick(250);
    expect(result.current.ran).toBe(true);
    expect(result.current.hits).toEqual([]);
  });

  it('swallows a network throw', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useMdxSearch('risk'));
    await tick(250);
    expect(result.current.ran).toBe(true);
    expect(result.current.hits).toEqual([]);
  });

  it('clears results when the query drops back below the floor', async () => {
    fetchMock.mockResolvedValue(grouped([{ type: 'program', id: 'p1', title: 'BX-204' }]));
    const { result, rerender } = renderHook(({ q }) => useMdxSearch(q), {
      initialProps: { q: 'risk' },
    });
    await tick(250);
    expect(result.current.hits).toHaveLength(1);

    rerender({ q: '' });
    await tick(10);
    expect(result.current.hits).toEqual([]);
  });
});
