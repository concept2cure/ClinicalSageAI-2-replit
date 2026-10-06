// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnaChat } from '../useAnaChat';

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock.mockReset()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function failedLoad(status: number, body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const { result } = renderHook(() => useAnaChat({ initialThreadId: 'previous' }));
  let failure: unknown;
  await act(async () => { try { await result.current.loadThread('selected'); } catch (err) { failure = err; } });
  return { result, failure };
}

describe('saved conversation response integrity', () => {
  it.each([{}, { messages: null }, { messages: 'unavailable' }, { error: { message: 'internal failure details' } }])('does not present an incomplete response as empty history: %o', async body => {
    const { result, failure } = await failedLoad(200, body);
    expect(failure).toBeInstanceOf(Error);
    expect(result.current.threadLoadError).toMatchObject({ threadId: 'selected', message: expect.stringContaining("couldn't load") });
    expect(result.current.threadId).toBeNull();
    expect(result.current.isLoadingThread).toBe(false);
    await act(async () => { await result.current.send('Follow up on this conversation'); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.messages).toEqual([]);
  });

  it('accepts an explicitly empty list and clears a prior failed read on retry', async () => {
    const { result } = await failedLoad(200, {});
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ messages: [] })));
    await act(async () => { await result.current.loadThread('selected'); });
    expect(result.current.threadId).toBe('selected');
    expect(result.current.threadLoadError).toBeNull();
    expect(result.current.messages).toEqual([]);
  });
});

describe('saved conversation recovery instructions', () => {
  it.each([
    [401, 'Sign in again, then retry loading this conversation.'],
    [403, 'You do not have access to this conversation. Select another conversation or ask an administrator to review your access.'],
    [404, 'This conversation is no longer available. Select another conversation or start a new one.'],
    [429, 'Too many conversation requests. Wait a moment, then retry loading this conversation.'],
  ])('explains recovery for HTTP %s without exposing server details', async (status, recovery) => {
    const { result } = await failedLoad(Number(status), { error: 'internal failure details' });
    expect(result.current.threadLoadError?.message).toContain(recovery);
    expect(result.current.threadLoadError?.message).toContain('Your question has not been sent.');
    expect(result.current.threadLoadError?.message).not.toContain('internal failure details');
    await act(async () => { await result.current.send('Follow up'); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
