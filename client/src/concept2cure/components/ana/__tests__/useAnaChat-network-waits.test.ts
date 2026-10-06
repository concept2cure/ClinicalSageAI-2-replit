// @vitest-environment jsdom
/** Network stalls must release the composer, and an old Stop must not kill a new demo. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useAnaChat } from '../useAnaChat';

const frame = (event: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
const fetchMock = vi.fn();

function pendingFetch(signal?: AbortSignal | null) {
  return new Promise<never>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
}

function stream(runId: string) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      c.enqueue(frame({ type: 'run_started', runId }));
      c.enqueue(frame({ type: 'drive_state', enabled: true, mode: 'demo' }));
    },
  });
  return {
    body,
    attach(signal?: AbortSignal | null) {
      signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
    },
    finish() {
      controller.enqueue(frame({ type: 'done' }));
      controller.enqueue(frame({ type: 'post_done', cleanedResponse: 'Finished.' }));
      controller.close();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AnA network wait limits', () => {
  it('times out a request that never receives response headers and releases the composer', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => pendingFetch(init?.signal));
    const { result } = renderHook(() => useAnaChat({}));
    let sent!: Promise<void>;
    await act(async () => { sent = result.current.send('Start the sales demonstration'); });
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    await act(async () => { await vi.advanceTimersByTimeAsync(89_999); });
    expect(signal.aborted).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(signal.aborted).toBe(true);
    await act(async () => { await sent; });
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages.at(-1)).toMatchObject({
      interrupted: true,
      warnings: ['Response timed out'],
      turnRecord: { status: 'unconfirmed' },
    });
  });

  it('bounds a stalled server cancellation so Stop and a replacement demo can finish', async () => {
    const turn = stream('run-stalled');
    const onDriveEvent = vi.fn();
    let requestSignal!: AbortSignal;
    let cancelSignal: AbortSignal | null | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/control')) {
        cancelSignal = init?.signal;
        return pendingFetch(init?.signal);
      }
      requestSignal = init?.signal as AbortSignal;
      turn.attach(requestSignal);
      return Promise.resolve({ ok: true, status: 200, body: turn.body });
    });
    const { result } = renderHook(() => useAnaChat({ liveDrive: true, onDriveEvent }));
    let sent!: Promise<void>;
    await act(async () => { sent = result.current.send('Show me around'); });
    let stopped!: Promise<void>;
    await act(async () => { stopped = result.current.stop(); });
    expect(onDriveEvent.mock.calls.map(([event]) => event.type)).toContain('drive_stopped');
    // Give the server a chance to record the person's cancel before disconnecting.
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
    expect(requestSignal.aborted).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(requestSignal.aborted).toBe(true);
    expect(cancelSignal?.aborted).toBe(true);
    await act(async () => { await stopped; await sent; });
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages.at(-1)?.turnRecord).toEqual({ status: 'unconfirmed' });
  });

  it('a delayed cancellation for an ended turn never aborts a replacement demo', async () => {
    const first = stream('run-first');
    const second = stream('run-second');
    let resolveCancel!: (value: { ok: boolean }) => void;
    let secondSignal!: AbortSignal;
    let streamCount = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/control')) return new Promise(resolve => { resolveCancel = resolve; });
      const turn = streamCount++ === 0 ? first : second;
      if (turn === second) secondSignal = init?.signal as AbortSignal;
      turn.attach(init?.signal);
      return Promise.resolve({ ok: true, status: 200, body: turn.body });
    });
    const { result } = renderHook(() => useAnaChat({ liveDrive: true, onDriveEvent: vi.fn() }));
    let firstSent!: Promise<void>;
    await act(async () => { firstSent = result.current.send('Show me around'); });
    let stopped!: Promise<void>;
    await act(async () => { stopped = result.current.stop(); });
    // The run completes while its control response is still crossing the network.
    await act(async () => { first.finish(); await firstSent; });
    let secondSent!: Promise<void>;
    await act(async () => { secondSent = result.current.send('Start the sales demonstration'); });
    expect(result.current.isStreaming).toBe(true);
    await act(async () => { resolveCancel({ ok: true }); await stopped; });
    expect(secondSignal.aborted).toBe(false);
    expect(result.current.runStatus).toBe('running');
    await act(async () => { second.finish(); await secondSent; });
  });
});
