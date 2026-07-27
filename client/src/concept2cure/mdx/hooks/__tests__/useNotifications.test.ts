/**
 * @vitest-environment jsdom
 */
/**
 * useNotifications — the dead bell, made real.
 *
 * The TopBar bell rendered a glyph and did nothing while
 * /api/mdx/notifications served a full feed. These tests hold the
 * properties that make it real without lying: the badge comes from the
 * server, the list is fetched only when the panel opens, and a failed
 * mark-read leaves the row unread — an unread compliance signal
 * silently marked read is the wrong direction to fail.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotifications } from '../useNotifications';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function route(url: string): string {
  return String(url).split('?')[0];
}

/** Wire fetch by endpoint; unread count and list are independent. */
function server(opts: {
  unread?: number;
  list?: unknown[];
  readOk?: boolean;
}) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const path = route(url);
    if (path === '/api/mdx/notifications/unread-count') {
      return { ok: true, status: 200, json: async () => ({ data: { unread: opts.unread ?? 0 } }) };
    }
    if (path === '/api/mdx/notifications' && (!init || init.method === undefined)) {
      return { ok: true, status: 200, json: async () => ({ data: opts.list ?? [] }), text: async () => '' };
    }
    if (path.endsWith('/read') || path.endsWith('/read-all')) {
      return { ok: opts.readOk ?? true, status: opts.readOk === false ? 500 : 200, json: async () => ({}) };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  });
}

describe('useNotifications', () => {
  it('polls the unread count from the server on mount', async () => {
    server({ unread: 3 });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.unread).toBe(3));
  });

  it('does not fetch the list until the panel is opened', async () => {
    server({ unread: 0, list: [{ id: 1, title: 'x', severity: 'info', category: 'c' }] });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const listCallsBefore = fetchMock.mock.calls.filter(
      (c) => route(c[0]) === '/api/mdx/notifications',
    ).length;
    expect(listCallsBefore).toBe(0); // only the unread poll has run

    act(() => result.current.setOpen(true));
    await waitFor(() => expect(result.current.items.status).toBe('ready'));
  });

  it('adapts the list and reports severity honestly', async () => {
    server({
      unread: 1,
      list: [
        { id: 9, title: 'MDR clock', body: '5-day due', severity: 'critical', category: 'vigilance', read_at: null, created_at: '2026-07-26T00:00:00Z' },
      ],
    });
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.setOpen(true));
    await waitFor(() => expect(result.current.items.status).toBe('ready'));

    const row = result.current.items.status === 'ready' ? result.current.items.data[0] : null;
    expect(row).toMatchObject({ id: 9, title: 'MDR clock', severity: 'critical', readAt: null });
  });

  it('shows an empty feed as empty, never a fabricated one', async () => {
    server({ unread: 0, list: [] });
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.setOpen(true));
    await waitFor(() => expect(result.current.items.status).toBe('empty'));
  });

  it('re-polls the unread count after a successful mark-read', async () => {
    server({ unread: 2, list: [], readOk: true });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.unread).toBe(2));

    // server now reports one fewer unread
    server({ unread: 1, list: [], readOk: true });
    await act(async () => { await result.current.markRead(9); });
    await waitFor(() => expect(result.current.unread).toBe(1));
  });

  it('leaves the count untouched when a mark-read fails', async () => {
    /* The safe direction: a failed write must not make anything look
       read that is not. */
    server({ unread: 2, list: [], readOk: false });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.unread).toBe(2));

    await act(async () => { await result.current.markRead(9); });
    // still 2 — the server rejected the write, so nothing was reconciled down
    expect(result.current.unread).toBe(2);
  });

  it('does not throw when the unread poll fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useNotifications());
    // a failed badge poll is swallowed; unread stays at its default
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.unread).toBe(0);
  });
});
