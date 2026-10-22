/**
 * @vitest-environment jsdom
 *
 * A reopened conversation brings back the skills its person picked
 * (docs/design/ANA_SKILLS_2026-10-22.md §10): the thread read returns them, and
 * the hook names them with the conversation they belong to. A read that says
 * nothing about them is null, never an empty choice; and a send carries the
 * host's list as `skills`, an empty one included.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

import { useAnaChat } from '../useAnaChat';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis.fetch as any) = fetchMock;
});
afterEach(cleanup);

function serveHistory(body: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/chat/threads/th-1/messages')) return { ok: true, status: 200, json: async () => body };
    if (url.startsWith('/api/ana-ri/turn-records')) return { ok: true, status: 200, json: async () => ({ data: { records: [] } }) };
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

describe('a conversation’s picked skills', () => {
  it('come back with the thread, named with it', async () => {
    serveHistory({ messages: [{ id: 1, role: 'user', content: 'Check the label' }], skills: ['labeling', 7] });
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      await result.current.loadThread('th-1');
    });
    await waitFor(() => expect(result.current.threadSkills).toEqual({ threadId: 'th-1', keys: ['labeling'] }));
  });

  it('are null when the read says nothing about them', async () => {
    serveHistory({ messages: [{ id: 1, role: 'user', content: 'Check the label' }] });
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      await result.current.loadThread('th-1');
    });
    expect(result.current.threadSkills).toBeNull();
  });

  it('ride on a send as `skills`, an empty list included', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    fetchMock.mockImplementation(async (url: string, init?: { body?: string }) => {
      if (url.includes('/api/ana-ri/stream')) {
        bodies.push(JSON.parse(init?.body ?? '{}'));
        return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => {
      await result.current.send('first', undefined, { skills: ['labeling'] });
    });
    await act(async () => {
      await result.current.send('second', undefined, { skills: [] });
    });
    await act(async () => {
      await result.current.send('third');
    });
    expect(bodies.map(b => b.skills)).toEqual([['labeling'], [], undefined]);
  });
});
