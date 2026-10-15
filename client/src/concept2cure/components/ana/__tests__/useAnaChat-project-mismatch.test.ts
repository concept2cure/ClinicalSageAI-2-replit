// @vitest-environment jsdom
/**
 * The refusal a conversation bound to another project gets (slice 5, client
 * half; docs/design/ONE_ANA_ONE_CANVAS.md §4.8). The stream answers with the
 * code THREAD_PROJECT_MISMATCH before anything is saved or any model runs
 * (server/routes/ana-ri/stream.ts). The turn says so in plain words, says the
 * request did not reach the AI provider, and records the code on the message
 * so the conversation can offer "New conversation in <project>".
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAnaChat, streamRefusalText } from '../useAnaChat';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const MISMATCH = 'This conversation belongs to another project. Start a new conversation in the project you have open. Your request was not sent to the AI provider.';

function streamOf(event: Record<string, unknown>) {
  return vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    controller.close();
  } })));
}

describe('THREAD_PROJECT_MISMATCH', () => {
  it('says the conversation belongs to another project and that nothing was sent', () => {
    expect(streamRefusalText({ code: 'THREAD_PROJECT_MISMATCH' })).toBe(MISMATCH);
  });

  it('the stream’s refusal becomes that text, with the code recorded on the message', async () => {
    // The exact event the stream writes (stream.ts, the getOrCreateThread refusal).
    vi.stubGlobal('fetch', streamOf({
      type: 'error',
      code: 'THREAD_PROJECT_MISMATCH',
      error: 'This conversation belongs to another project. Start a new conversation in the project you have open.',
      threadProgramId: '11111111-1111-4111-8111-111111111111',
    }));
    const { result } = renderHook(() => useAnaChat({ projectId: '22222222-2222-4222-8222-222222222222' }));
    await act(async () => { await result.current.send('Draft the 2.5 Clinical Overview.'); });
    const last = result.current.messages.at(-1)!;
    expect(last.role).toBe('assistant');
    expect(last.text).toBe(MISMATCH);
    expect(last.refusalCode).toBe('THREAD_PROJECT_MISMATCH');
    expect(last.interrupted).toBe(true);
    expect(result.current.isStreaming).toBe(false);
  });

  it('a refusal with no code records none', async () => {
    vi.stubGlobal('fetch', streamOf({ type: 'error', error: 'Something failed' }));
    const { result } = renderHook(() => useAnaChat({}));
    await act(async () => { await result.current.send('Hello'); });
    expect(result.current.messages.at(-1)?.refusalCode).toBeUndefined();
  });
});
