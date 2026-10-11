// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnaChat } from '../useAnaChat';

const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;
const fetchMock = vi.fn();
function openStream(cancel = vi.fn()) {
  let controller!: { enqueue(chunk: Uint8Array): void; close(): void };
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel });
  return { body, cancel, push: (...events: unknown[]) => controller.enqueue(new TextEncoder().encode(events.map(frame).join(''))), close: () => controller.close() };
}
beforeEach(() => { vi.stubGlobal('fetch', fetchMock.mockReset()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function drain() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }

describe('AnA final completion releases the composer', () => {
  it('finishes without waiting for EOF and accepts the next question', async () => {
    const first = openStream();
    const next = openStream();
    fetchMock.mockResolvedValueOnce({ ok: true, body: first.body }).mockResolvedValueOnce({ ok: true, body: next.body });
    const onDriveEvent = vi.fn();
    const { result } = renderHook(() => useAnaChat({ onDriveEvent }));
    let sent!: Promise<void>;
    await act(async () => { sent = result.current.send('First question'); });
    first.push({ type: 'drive_state', enabled: true, mode: 'demo' }, { type: 'text', content: 'Draft answer' }, { type: 'done', latencyMs: 123 });
    await drain();
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.messages.at(-1)?.progress?.at(-1)?.phase).toBe('finalizing');
    first.push({ type: 'warning', message: 'A source could not be loaded.' }, { type: 'post_done', cleanedResponse: 'Final answer', turnRecord: { status: 'recorded', id: 'record-1', sha256: 'f'.repeat(64) } });
    try {
      await vi.waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 150 });
      await sent;
      expect(first.cancel).toHaveBeenCalledTimes(1);
      expect(result.current.messages.at(-1)?.warnings).toContain('A source could not be loaded.');
      expect(onDriveEvent.mock.calls.filter(([event]) => event.type === 'drive_turn_end')).toHaveLength(1);
      expect(result.current.messages.at(-1)).toMatchObject({ text: 'Final answer', latencyMs: 123, turnRecord: { status: 'recorded', id: 'record-1' } });
      await act(async () => { sent = result.current.send('Next question'); });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      if (!first.cancel.mock.calls.length) first.close();
      next.push({ type: 'post_done', cleanedResponse: 'Next answer' }); next.close();
      await act(async () => { await sent; });
    }
  });

  it('ignores late frames after completion in the same network chunk', async () => {
    const stream = openStream();
    fetchMock.mockResolvedValue({ ok: true, body: stream.body });
    const onDriveEvent = vi.fn();
    const { result } = renderHook(() => useAnaChat({ onDriveEvent }));
    let sent!: Promise<void>;
    await act(async () => { sent = result.current.send('Question'); });
    stream.push({ type: 'text', content: 'Answer' }, { type: 'post_done', cleanedResponse: 'Final answer' }, { type: 'text', content: 'late text' }, { type: 'drive_navigation', screen: 'vault' }, { type: 'error', error: 'late transport failure' });
    stream.close();
    await act(async () => { await sent; });
    expect(result.current.messages.at(-1)).toMatchObject({ text: 'Final answer', streaming: false });
    expect(result.current.messages.at(-1)?.interrupted).not.toBe(true);
    expect(onDriveEvent).not.toHaveBeenCalled();
  });

  it('does not let a stalled transport cancellation hold the completed turn open', async () => {
    const stream = openStream(vi.fn(() => new Promise<void>(() => {})));
    fetchMock.mockResolvedValue({ ok: true, body: stream.body });
    const { result } = renderHook(() => useAnaChat({}));
    let sent!: Promise<void>;
    await act(async () => { sent = result.current.send('Question'); });
    stream.push({ type: 'post_done', cleanedResponse: 'Final answer' });
    try {
      await vi.waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 150 });
      await sent;
      expect(stream.cancel).toHaveBeenCalledTimes(1);
      expect(result.current.messages.at(-1)?.interrupted).not.toBe(true);
    } finally {
      if (!stream.cancel.mock.calls.length) stream.close();
      await act(async () => { await sent; });
    }
  });
});


describe('completed reply transport cleanup', () => {
  it('keeps a completed reply complete when cancelling the transport rejects', async () => {
    const stream = openStream(vi.fn().mockRejectedValue(new Error('transport cleanup failed')));
    fetchMock.mockResolvedValue({ ok: true, body: stream.body });
    const { result } = renderHook(() => useAnaChat({}));
    let sent!: Promise<void>;
    await act(async () => { sent = result.current.send('Question'); });
    stream.push({ type: 'post_done', cleanedResponse: 'Final answer' });
    try {
      await vi.waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 150 });
      await sent;
      expect(stream.cancel).toHaveBeenCalledTimes(1);
      expect(result.current.messages.at(-1)?.interrupted).not.toBe(true);
    } finally {
      if (!stream.cancel.mock.calls.length) stream.close();
      await act(async () => { await sent; });
    }
  });
});
