// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAnaChat } from '../useAnaChat';
import type { DriveTurnControls } from '../useAnaChat.types';

function stream() {
  let ended = false;
  let controller!: { enqueue(chunk: Uint8Array): void; close(): void; error(err: Error): void };
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel() { ended = true; } });
  return {
    body,
    push: (...events: unknown[]) => controller.enqueue(new TextEncoder().encode(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''))),
    close: () => { if (!ended) { ended = true; controller.close(); } },
    bind: (signal: AbortSignal) => signal.addEventListener('abort', () => {
      if (!ended) { ended = true; controller.error(Object.assign(new Error('Aborted'), { name: 'AbortError' })); }
    }),
  };
}
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup() {
  const first = stream(); const second = stream();
  const controls: DriveTurnControls[] = [];
  const signals: AbortSignal[] = [];
  const fetchMock = vi.fn().mockImplementation(async (url: string, init: { signal?: AbortSignal | null; body?: string }) => {
    if (url.endsWith('/control')) return { ok: true };
    if (url.includes('/turn-records')) return { ok: false };
    const current = signals.length === 0 ? first : second;
    signals.push(init.signal as AbortSignal); current.bind(init.signal as AbortSignal);
    return { ok: true, body: current.body };
  });
  vi.stubGlobal('fetch', fetchMock);
  const hook = renderHook(() => useAnaChat({ onDriveEvent: (_event, handed) => { if (handed) controls.push(handed); } }));
  return { first, second, controls, signals, fetchMock, result: hook.result };
}

describe('a drive Stop belongs to the turn that handed it out', () => {
  it.each(['complete', 'reset'] as const)('does not stop a newer reply after the earlier turn is %s', async ending => {
    const h = setup(); let sent!: Promise<void>;
    await act(async () => { sent = h.result.current.send('First question'); });
    h.first.push({ type: 'drive_state', enabled: true, mode: 'demo' }); await flush();
    const oldControls = h.controls[0];
    await act(async () => {
      if (ending === 'reset') h.result.current.reset();
      else h.first.push({ type: 'post_done', cleanedResponse: 'First answer' });
      await sent;
      sent = h.result.current.send('New question');
    });
    h.second.push({ type: 'run_started', runId: 'new-run' }, { type: 'drive_state', enabled: true, mode: 'demo' }); await flush();
    try {
      await act(async () => { oldControls.stop(); }); await flush();
      expect(h.fetchMock.mock.calls.filter(([url]) => url.endsWith('/control'))).toHaveLength(0);
      expect(h.signals[1].aborted).toBe(false);
      expect(h.result.current.isStreaming).toBe(true);
    } finally {
      h.second.close(); await act(async () => { await sent; });
    }
  });

  it.each([false, true])('still stops its active stream when a run ID is available: %s', async hasRun => {
    const h = setup(); let sent!: Promise<void>;
    await act(async () => { sent = h.result.current.send('Show me around'); });
    if (hasRun) h.first.push({ type: 'run_started', runId: 'active-run' });
    h.first.push({ type: 'drive_state', enabled: true, mode: 'demo' }); await flush();
    await act(async () => { h.controls[0].stop(); }); await flush();
    try {
      expect(h.signals[0].aborted).toBe(true);
      const calls = h.fetchMock.mock.calls.filter(([url]) => url.endsWith('/control'));
      expect(calls).toHaveLength(hasRun ? 1 : 0);
      if (hasRun) expect(JSON.parse(String(calls[0][1].body))).toMatchObject({ action: 'cancel' });
    } finally { h.first.close(); await act(async () => { await sent; }); }
  });
});
