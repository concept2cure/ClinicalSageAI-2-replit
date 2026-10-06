// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAnaChat } from '../useAnaChat';

function openStream() {
  let controller!: { enqueue(chunk: Uint8Array): void; close(): void };
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  return { body, push: (...events: unknown[]) => controller.enqueue(new TextEncoder().encode(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''))), close: () => controller.close() };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const flush = async () => { await act(async () => { await Promise.resolve(); }); };

async function heldTurn() {
  const old = openStream();
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/control')) return { ok: true };
    if (url.includes('/messages')) return { ok: true, json: async () => ({ messages: [] }) };
    if (url.includes('/turn-records')) return { ok: false };
    return { ok: true, body: old.body };
  });
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => useAnaChat({ runPolicy: 'manual' }));
  let sent!: Promise<void>;
  await act(async () => { sent = result.current.send('Old question'); });
  old.push({ type: 'run_started', runId: 'old-run' }, { type: 'paused', reason: 'manual', next: ['Searching documents'] });
  await flush();
  await act(async () => { await result.current.interject('Use the current protocol'); });
  expect(result.current.pendingSteers).toEqual(['Use the current protocol']);
  return { result, old, fetchMock, sent };
}

describe.each(['reset', 'switch'] as const)('abandoned turn controls after %s', action => {
  it('clears pause, hold, policy and steering state before the old stream settles', async () => {
    const { result, old, sent } = await heldTurn();
    try {
      await act(async () => {
        if (action === 'reset') result.current.reset();
        else await result.current.loadThread('selected');
      });
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.runStatus).toBeNull();
      expect(result.current.runHold).toBeNull();
      expect(result.current.turnRunPolicy).toBeNull();
      expect(result.current.pendingSteers).toEqual([]);
    } finally { old.close(); await act(async () => { await sent; }); }
  });

  it('does not address the abandoned run through current-conversation controls', async () => {
    const { result, old, fetchMock, sent } = await heldTurn();
    try {
      await act(async () => {
        if (action === 'reset') result.current.reset();
        else await result.current.loadThread('selected');
      });
      const before = fetchMock.mock.calls.filter(([url]) => url.includes('/control')).length;
      await act(async () => {
        expect(await result.current.pause()).toBe(false);
        expect(await result.current.resume()).toBe(false);
        expect(await result.current.interject('New conversation instruction')).toBe(false);
      });
      expect(fetchMock.mock.calls.filter(([url]) => url.includes('/control'))).toHaveLength(before);
    } finally { old.close(); await act(async () => { await sent; }); }
  });

  it('ignores an old control acknowledgment after the conversation changes', async () => {
    const { result, old, fetchMock, sent } = await heldTurn();
    let release!: (response: { ok: boolean }) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    let resumed!: Promise<boolean>;
    await act(async () => { resumed = result.current.resume(); });
    try {
      await act(async () => {
        if (action === 'reset') result.current.reset();
        else await result.current.loadThread('selected');
        release({ ok: true });
        expect(await resumed).toBe(true);
      });
      expect(result.current.runStatus).toBeNull();
      expect(result.current.runHold).toBeNull();
      expect(result.current.pendingSteers).toEqual([]);
    } finally { old.close(); await act(async () => { await sent; }); }
  });

});
