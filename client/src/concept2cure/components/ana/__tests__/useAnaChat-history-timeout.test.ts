// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnaChat } from '../useAnaChat';

const fetchMock = vi.fn();
const history = () => ({ messages: [{ role: 'assistant', content: 'Saved answer' }] });
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

describe('saved conversation deadlines', () => {
  it.each(['headers', 'body'])('releases a stalled %s read and ignores its late result', async stage => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise(r => { resolve = r; });
    fetchMock.mockResolvedValue({ ok: true, json: () => pending });
    if (stage === 'headers') fetchMock.mockReturnValue(pending);
    const { result } = renderHook(() => useAnaChat({}));
    let failure: unknown;
    let finished = false;
    await act(async () => {
      void result.current.loadThread('slow').catch(e => { failure = e; }).finally(() => { finished = true; });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(finished).toBe(true);
    expect(failure).toMatchObject({ name: 'AbortError' });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(result.current.isLoadingThread).toBe(false);
    expect(result.current.threadLoadError).toMatchObject({ threadId: 'slow', message: expect.stringContaining('timed out') });
    await act(async () => { await result.current.send('Keep my question'); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(stage === 'headers' ? { ok: true, json: async () => history() } : history());
    });
    expect(result.current.threadId).toBeNull();
    expect(result.current.messages).toEqual([]);
    fetchMock.mockResolvedValue({ ok: true, json: async () => history() });
    await act(async () => { await result.current.loadThread('slow'); });
    expect(result.current.threadLoadError).toBeNull();
    expect(result.current.threadId).toBe('slow');
  });

  it('clears the deadline after a successful read', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => history() });
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.loadThread('ready'); });
    const signal = fetchMock.mock.calls[0][1].signal;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(signal.aborted).toBe(false);
    expect(result.current.threadLoadError).toBeNull();
    expect(result.current.messages[0].text).toBe('Saved answer');
  });
});
