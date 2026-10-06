// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAnaChat } from '../useAnaChat';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('structured streaming refusals', () => {
  it.each([
    [{ code: 'THREAD_FORBIDDEN' }, 'another user'],
    [{ code: 'GATEWAY_UNAVAILABLE' }, 'No AI provider is configured'],
    [{ code: 'WEEKLY_LIMIT_EXCEEDED' }, 'weekly limit'],
    [{ status: 401 }, 'Sign in again'],
    [{ status: 429 }, 'Too many AnA requests'],
  ])('retains recovery details for %o', async (details, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', error: 'Refused', ...details })}\n\n`));
      controller.close();
    } })));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.send('Read my conversation'); });
    expect(result.current.messages.at(-1)?.text).toContain(expected);
    expect(result.current.messages.at(-1)?.interruptedWithPartialResponse).toBe(false);
    expect(result.current.isStreaming).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
