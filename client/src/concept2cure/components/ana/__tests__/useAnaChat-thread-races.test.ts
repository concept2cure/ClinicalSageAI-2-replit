// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnaChat } from '../useAnaChat';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function history(name: string) {
  return new Response(JSON.stringify({ messages: [
    { role: 'user', content: `${name} question` },
    { role: 'assistant', content: `${name} answer` },
  ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function answer() {
  const events = [
    { type: 'text', content: 'Follow-up answer' },
    { type: 'done' },
    { type: 'post_done', cleanedResponse: 'Follow-up answer' },
  ];
  return new Response(new ReadableStream({ start(controller) {
    for (const event of events) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    }
    controller.close();
  } }), { status: 200 });
}

const fetchMock = vi.fn();
const reads: Array<{ response: ReturnType<typeof deferred<Response>>; signal?: AbortSignal }> = [];
const streamBodies = () => fetchMock.mock.calls
  .filter(([url]) => String(url) === '/api/ana-ri/stream')
  .map(([, init]) => JSON.parse(init.body));

beforeEach(() => {
  reads.length = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init: { signal?: AbortSignal | null }) => {
    if (url.includes('/api/chat/threads/')) {
      const response = deferred<Response>();
      reads.push({ response, signal: init.signal ?? undefined });
      // Deliberately allow an aborted response to arrive: cancellation alone
      // cannot own an already-resolved fetch/body or a delayed JSON read.
      return response.promise;
    }
    return Promise.resolve(answer());
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('thread history request ownership', () => {
  it('keeps the latest selected thread when an older response arrives last', async () => {
    const { result } = renderHook(() => useAnaChat({}));
    let older!: Promise<void>;
    let latest!: Promise<void>;
    act(() => { older = result.current.loadThread('alpha'); });
    act(() => { latest = result.current.loadThread('beta'); });
    await act(async () => { reads[1].response.resolve(history('Beta')); await latest; });
    await act(async () => { reads[0].response.resolve(history('Alpha')); await older; });

    expect(result.current.threadId).toBe('beta');
    expect(result.current.messages.map(m => m.text)).toEqual(['Beta question', 'Beta answer']);
    expect(reads[0].signal?.aborted).toBe(true);
    await act(async () => { await result.current.send('Follow up'); });
    expect(streamBodies()[0]).toMatchObject({ thread_id: 'beta', conversation_history: [
      { role: 'user', content: 'Beta question' },
      { role: 'assistant', content: 'Beta answer' },
    ] });
  });

  it('keeps loading and refuses send while the newer history is still pending', async () => {
    const { result } = renderHook(() => useAnaChat({}));
    let older!: Promise<void>;
    let latest!: Promise<void>;
    act(() => { older = result.current.loadThread('alpha'); });
    act(() => { latest = result.current.loadThread('beta'); });
    await act(async () => { reads[0].response.resolve(history('Alpha')); await older; });
    expect(result.current.isLoadingThread).toBe(true);
    expect(result.current.messages).toEqual([]);
    await act(async () => { await result.current.send('Do not send with the wrong history'); });
    expect(streamBodies()).toEqual([]);
    await act(async () => { reads[1].response.resolve(history('Beta')); await latest; });
  });

  it('refuses a same-tick send and ignores a superseded response still reading its body', async () => {
    const { result } = renderHook(() => useAnaChat({}));
    const body = deferred<{ messages: Array<{ role: string; content: string }> }>();
    let older!: Promise<void>;
    let latest!: Promise<void>;
    await act(async () => {
      older = result.current.loadThread('alpha');
      await result.current.send('History is not ready');
      reads[0].response.resolve({ ok: true, json: () => body.promise } as Response);
    });
    expect(streamBodies()).toEqual([]);
    act(() => { latest = result.current.loadThread('beta'); });
    await act(async () => { reads[1].response.resolve(history('Beta')); await latest; });
    await act(async () => {
      body.resolve({ messages: [{ role: 'assistant', content: 'Obsolete Alpha body' }] });
      await older;
    });
    expect(result.current.threadId).toBe('beta');
    expect(result.current.messages.map(m => m.text)).toEqual(['Beta question', 'Beta answer']);
  });

  it('ignores an obsolete load failure without surfacing an error on the newer selection', async () => {
    const { result } = renderHook(() => useAnaChat({}));
    let older!: Promise<void>;
    let latest!: Promise<void>;
    act(() => { older = result.current.loadThread('alpha'); });
    const oldFailure = older.catch(error => error);
    act(() => { latest = result.current.loadThread('beta'); });
    await act(async () => { reads[0].response.reject(new Error('Alpha failed')); await oldFailure; });
    expect(await oldFailure).toBeUndefined();
    expect(result.current.isLoadingThread).toBe(true);
    expect(result.current.threadLoadError).toBeFalsy();
    await act(async () => { reads[1].response.resolve(history('Beta')); await latest; });
  });

  it('reset cancels pending history so it cannot replace a newly asked conversation', async () => {
    const { result } = renderHook(() => useAnaChat({}));
    let loading!: Promise<void>;
    act(() => { loading = result.current.loadThread('alpha'); });
    await act(async () => { result.current.reset(); await result.current.send('A fresh question'); });
    await act(async () => { reads[0].response.resolve(history('Alpha')); await loading; });
    expect(reads[0].signal?.aborted).toBe(true);
    expect(result.current.isLoadingThread).toBe(false);
    expect(result.current.messages.map(m => m.text)).toEqual(['A fresh question', 'Follow-up answer']);
    expect(streamBodies()[0].thread_id).toBeUndefined();
    expect(streamBodies()[0].conversation_history).toEqual([]);
  });

  it('unmount cancels a history read and ignores its late result', async () => {
    const { result, unmount } = renderHook(() => useAnaChat({}));
    let loading!: Promise<void>;
    act(() => { loading = result.current.loadThread('alpha'); });
    unmount();
    expect(reads[0].signal?.aborted).toBe(true);
    reads[0].response.resolve(history('Alpha'));
    await loading;
  });
});

describe('failed history recovery', () => {
  it('clears the previous transcript on switch and blocks a failed selection until retry succeeds', async () => {
    const { result } = renderHook(() => useAnaChat({}));
    let first!: Promise<void>;
    act(() => { first = result.current.loadThread('alpha'); });
    await act(async () => { reads[0].response.resolve(history('Alpha')); await first; });
    let switching!: Promise<void>;
    act(() => { switching = result.current.loadThread('beta'); });
    const failure = switching.catch(error => error);
    expect(result.current.threadId).toBeNull();
    expect(result.current.messages).toEqual([]);
    await act(async () => { reads[1].response.resolve(new Response('', { status: 503 })); await failure; });
    expect(await failure).toBeInstanceOf(Error);
    expect(result.current.isLoadingThread).toBe(false);
    expect(result.current.threadLoadError).toMatchObject({ threadId: 'beta' });
    await act(async () => { await result.current.send('Must not go to Alpha or a new thread'); });
    expect(streamBodies()).toEqual([]);

    let retry!: Promise<void>;
    act(() => { retry = result.current.loadThread('beta'); });
    expect(result.current.threadLoadError).toBeFalsy();
    await act(async () => { reads[2].response.resolve(history('Beta')); await retry; });
    await act(async () => { await result.current.send('The retry is ready'); });
    expect(streamBodies()[0].thread_id).toBe('beta');
  });

  it('allows an explicit new conversation after a failed history read', async () => {
    const { result } = renderHook(() => useAnaChat({}));
    let loading!: Promise<void>;
    act(() => { loading = result.current.loadThread('alpha'); });
    const failure = loading.catch(error => error);
    await act(async () => { reads[0].response.reject(new Error('Offline')); await failure; });
    expect(result.current.threadLoadError).toMatchObject({ threadId: 'alpha' });
    await act(async () => { result.current.reset(); await result.current.send('Start fresh'); });
    expect(result.current.threadLoadError).toBeFalsy();
    expect(streamBodies()[0].thread_id).toBeUndefined();
    expect(streamBodies()[0].conversation_history).toEqual([]);
  });
});
