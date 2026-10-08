// @vitest-environment jsdom
/* global ReadableStreamDefaultController: readonly */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAnaChat } from '../useAnaChat';

const encode = (event: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
function openStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  return { body, pushBytes: (bytes: Uint8Array) => controller.enqueue(bytes), push: (event: unknown) => controller.enqueue(encode(event)), close: () => controller.close() };
}
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('aborted stream isolation', () => {
  it('ignores headers that arrive after a reset', async () => {
    const old = openStream();
    let resolve!: (response: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(r => { resolve = r; })));
    const { result } = renderHook(() => useAnaChat({}));
    let turn!: Promise<void>;
    await act(async () => { turn = result.current.send('Old question'); });
    act(() => result.current.reset());
    await act(async () => {
      old.push({ type: 'thread_id', thread_id: 'old-thread' }); old.close();
      resolve({ ok: true, body: old.body }); await turn;
    });
    expect(result.current.threadId).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
  });

  it('ignores remaining events in a chunk when a drive callback resets the conversation', async () => {
    const stream = openStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream.body }));
    const onDriveEvent = vi.fn(() => result.current.reset());
    const { result } = renderHook(() => useAnaChat({ onDriveEvent }));
    let turn!: Promise<void>;
    await act(async () => { turn = result.current.send('Show me'); });
    await act(async () => {
      // A single queued chunk can contain more events after a synchronous reset.
      const payload = [
        { type: 'drive_navigation', screen: 'vault' },
        { type: 'thread_id', thread_id: 'old-thread' },
      ].map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
      stream.pushBytes(new TextEncoder().encode(payload));
      stream.close(); await turn;
    });
    expect(result.current.threadId).toBeNull();
    expect(result.current.messages).toEqual([]);
  });

  it.each(['reset', 'switch'] as const)('ignores queued events after a conversation %s', async action => {
    const old = openStream();
    const fresh = openStream();
    const onDriveEvent = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, body: old.body })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
      // The reloaded conversation's one call for its turn records (S4).
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { records: [] } }) })
      // …and its runs to rejoin (AnA detach DT2): none.
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) })
      .mockResolvedValueOnce({ ok: true, body: fresh.body });
    if (action === 'reset') fetchMock.mockReset().mockResolvedValueOnce({ ok: true, body: old.body }).mockResolvedValueOnce({ ok: true, body: fresh.body });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAnaChat({ onDriveEvent }));
    let oldTurn!: Promise<void>;
    await act(async () => { oldTurn = result.current.send('Old question'); });
    await act(async () => {
      if (action === 'reset') result.current.reset();
      else await result.current.loadThread('selected');
    });
    let newTurn!: Promise<void>;
    await act(async () => { newTurn = result.current.send('New question'); });
    fresh.push({ type: 'run_started', runId: 'new-run' });
    await flush();
    await act(async () => {
      old.push({ type: 'thread_id', thread_id: 'old-thread' });
      old.push({ type: 'run_started', runId: 'old-run' });
      old.push({ type: 'drive_navigation', screen: 'vault' });
      old.close();
      await oldTurn;
    });
    expect(result.current.threadId).toBe(action === 'reset' ? null : 'selected');
    expect(result.current.isStreaming).toBe(true);
    expect(onDriveEvent).not.toHaveBeenCalled();
    // The abandoned turn never asks for its record by run id.
    expect(fetchMock.mock.calls.some(([url]) => /turn-records\?run_id=|\/runs\/old-run\/events/.test(String(url)))).toBe(false);
    await act(async () => { fresh.push({ type: 'text', content: 'Fresh answer' }); fresh.push({ type: 'post_done' }); fresh.close(); await newTurn; });
    expect(result.current.messages.at(-1)?.text).toBe('Fresh answer');
    expect(result.current.messages.at(-1)?.stopped).not.toBe(true);
  });

});

describe('turn identities', () => {
  it('gives two turns in the same millisecond distinct message identities', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      const stream = openStream();
      stream.push({ type: 'text', content: 'Answer' }); stream.push({ type: 'post_done' }); stream.close();
      return { ok: true, body: stream.body };
    }));
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.send('First'); });
    await act(async () => { await result.current.send('Second'); });
    expect(new Set(result.current.messages.map(m => m.id)).size).toBe(4);
  });

  it('looks up the interrupted turn record using its own run, even after a new run starts', async () => {
    vi.useFakeTimers();
    const old = openStream();
    const fresh = openStream();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, body: old.body })
      .mockResolvedValueOnce({ ok: true, body: fresh.body })
      .mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAnaChat({}));
    let oldTurn!: Promise<void>;
    await act(async () => { oldTurn = result.current.send('Old question'); });
    old.push({ type: 'run_started', runId: 'old-run' }); await flush();
    act(() => result.current.reset());
    let newTurn!: Promise<void>;
    await act(async () => { newTurn = result.current.send('New question'); });
    fresh.push({ type: 'run_started', runId: 'new-run' }); await flush();
    // Since AnA detach DT2 the ask is the run's own read (GET /runs/:id/events).
    await act(async () => { old.close(); await oldTurn; await vi.advanceTimersByTimeAsync(2_000); });
    const lookups = fetchMock.mock.calls.filter(([url]) => /\/runs\/[^/]+\/events/.test(String(url)));
    expect(lookups).toHaveLength(1);
    expect(lookups[0][0]).toContain('/runs/old-run/events');
    expect(result.current.isStreaming).toBe(true);
    await act(async () => { fresh.push({ type: 'post_done' }); fresh.close(); await newTurn; });
  });
});
