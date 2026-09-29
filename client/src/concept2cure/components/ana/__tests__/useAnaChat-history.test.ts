// @vitest-environment jsdom
/**
 * The history a turn carries is the transcript as it stands when it is sent.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `send` is memoized, and it read the `conversation_history` it forwards from
 * its closure: the transcript of the render it was made in. A caller that
 * clears the conversation and sends in the same tick — the conversation
 * screen starting a new conversation with the question it was handed (Home's
 * composer, ⌘K, "Ask AnA to draft") — sent the conversation it had just
 * cleared as the new one's history. The server reads that history whenever
 * the thread is new, so AnA answered the first question of a fresh
 * conversation inside the last one: its last ten turns, under a thread that
 * holds none of them.
 *
 * All asserted on the request body.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

import { useAnaChat } from '../useAnaChat';

/** Encode one SSE event. */
const ev = (o: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\n`);

/** An SSE stream that answers `text` and completes, so `send` settles. */
function answered(text: string) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of [{ type: 'text', content: text }, { type: 'done' }]) c.enqueue(ev(e));
      c.close();
    },
  });
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes('/api/chat/threads/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          messages: [
            { role: 'user', content: 'Summarise the stability data.' },
            { role: 'assistant', content: 'Twelve months at 25 °C, no trend.' },
          ],
        }),
      };
    }
    return { ok: true, status: 200, body: answered('Module 3 holds the CMC dossier.') };
  });
  (globalThis.fetch as unknown) = fetchMock;
});
afterEach(() => cleanup());

/** The body of every stream request, in order. */
const streamBodies = () =>
  fetchMock.mock.calls
    .filter((c) => String(c[0]).endsWith('/api/ana-ri/stream'))
    .map((c) => JSON.parse(String((c[1] as RequestInit).body)) as {
      conversation_history?: Array<{ role: string; content: string }>;
      thread_id?: string;
    });

describe('conversation_history', () => {
  it('a follow-up in the same conversation carries the turns before it', async () => {
    const { result } = renderHook(() => useAnaChat({ projectId: 'p1' }));
    await act(async () => {
      await result.current.send('What is in Module 3?');
    });
    await act(async () => {
      await result.current.send('And what is missing from it?');
    });
    expect(streamBodies()[1].conversation_history).toEqual([
      { role: 'user', content: 'What is in Module 3?' },
      { role: 'assistant', content: 'Module 3 holds the CMC dossier.' },
    ]);
  });

  it('a new conversation started and asked in one tick carries none of the last one', async () => {
    const { result } = renderHook(() => useAnaChat({ projectId: 'p1' }));
    await act(async () => {
      await result.current.send('What is in Module 3?');
    });
    // One render's functions, held across the reset — as the conversation
    // screen's deferred seed holds them.
    await act(async () => {
      const chat = result.current;
      chat.reset();
      await chat.send('Draft the IND cover letter.');
    });
    const fresh = streamBodies()[1];
    expect(fresh.thread_id).toBeUndefined();
    expect(fresh.conversation_history).toEqual([]);
  });

  it('a conversation loaded and asked in one tick carries its own turns, not the one it replaced', async () => {
    const { result } = renderHook(() => useAnaChat({ projectId: 'p1' }));
    await act(async () => {
      await result.current.send('What is in Module 3?');
    });
    await act(async () => {
      const chat = result.current;
      await chat.loadThread('thread-7');
      await chat.send('Does that support a 24-month shelf life?');
    });
    expect(streamBodies()[1].conversation_history).toEqual([
      { role: 'user', content: 'Summarise the stability data.' },
      { role: 'assistant', content: 'Twelve months at 25 °C, no trend.' },
    ]);
  });
});
