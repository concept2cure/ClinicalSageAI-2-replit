// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamRefusalText, useAnaChat, type UseAnaChatReturn } from '../../components/ana/useAnaChat';

vi.mock('../dataConnect', () => ({
  connected: () => false,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import { CONTINUE_PROMPT } from '../anaWorkModel';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

/* One host renders the shell's chat: the conversation screen. The right rail
   rendered it too and was deleted (ONE_ANA_ONE_CANVAS.md, slice 9); every
   case that ran on it runs here. */
type HostKind = 'conversation';
let chat!: UseAnaChatReturn;
const fetchMock = vi.fn();
const responses: Response[] = [];
/* A stream handler that needs the request (its abort signal). Keyed to the
   stream URL: the conversation screen makes reads of its own on mount, and a
   bare mockImplementationOnce would be spent on the first of those. */
const streamHandlers: Array<(init: { signal: AbortSignal }) => Promise<Response>> = [];
const PARTIAL = 'The comparison suggests that the next';
const NOTE = "AnA's response was interrupted before this turn finished. The text shown may be incomplete.";
const recorded = { status: 'recorded', id: 'record-failed', sha256: 'f'.repeat(64) };
const frame = (event: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);

function response(events: unknown[]) {
  return new Response(new ReadableStream({ start(controller) {
    for (const event of events) controller.enqueue(frame(event));
    controller.close();
  } }));
}

function Host(_props: { kind: HostKind }) {
  chat = useAnaChat({ initialThreadId: 'thread-selected' });
  return <ConversationThread surface={{ id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface']}
    segment="biotech" onNav={() => {}} shellChat={chat} />;
}

const requests = () => fetchMock.mock.calls.filter(([url]) => url === '/api/ana-ri/stream')
  .map(([, init]) => JSON.parse(init.body));
const continueButton = () => screen.queryByRole('button', { name: 'Continue' });
const showsNote = (text: string) => Array.from(document.querySelectorAll('.ana-activity-stopped'))
  .some(note => note.textContent?.includes(text));

beforeEach(() => {
  responses.length = 0;
  streamHandlers.length = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init: { signal: AbortSignal }) => {
    const handler = url === '/api/ana-ri/stream' ? streamHandlers.shift() : undefined;
    if (handler) return handler(init);
    if (url === '/api/ana-ri/stream') return responses.shift() ?? response([
      { type: 'text', content: 'The follow-up answer is complete.' },
      { type: 'post_done', cleanedResponse: 'The follow-up answer is complete.' },
    ]);
    return new Response('{}', { status: 503 });
  });
  vi.stubGlobal('fetch', fetchMock);
  (window as unknown as { C2C_CONVO: { id: string } }).C2C_CONVO = { id: 'current' };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

describe('partial response timeout versus the person stopping', () => {
  it.each(['timeout', 'stop'] as const)('offers recovery only for an interrupted partial: %s', async ending => {
    vi.useFakeTimers();
    let controller!: { error: (reason: Error) => void };
    const body = new ReadableStream<Uint8Array>({ start(c) {
      controller = c;
      c.enqueue(frame({ type: 'text', content: PARTIAL }));
    } });
    streamHandlers.push(async (init: { signal: AbortSignal }) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        controller.error(error);
      });
      return new Response(body);
    });
    render(<Host kind="conversation" />);
    let sent!: Promise<void>;
    await act(async () => { sent = chat.send('Compare the endpoints'); });
    expect(continueButton()).toBeNull();
    await act(async () => {
      if (ending === 'timeout') await vi.advanceTimersByTimeAsync(90_000);
      else await chat.stop();
      await sent;
    });
    expect(chat.messages.at(-1)?.text).toBe(PARTIAL);
    expect(showsNote(NOTE)).toBe(ending === 'timeout');
    expect(continueButton() !== null).toBe(ending === 'timeout');
    expect(requests()).toHaveLength(1);
  });

  it('does not label an unfinished tool as a network failure when the server reports an error', async () => {
    responses.push(response([
      { type: 'text', content: PARTIAL },
      { type: 'tool_use', name: 'search_documents', label: 'Searching documents' },
      { type: 'error', error: 'Generation failed', turnRecord: recorded },
    ]));
    render(<Host kind="conversation" />);
    await act(async () => { await chat.send('Compare the endpoints'); });
    expect(chat.messages.at(-1)?.toolCalls?.[0]).toMatchObject({
      status: 'error', message: 'Not finished — the turn was interrupted.',
    });
    fireEvent.click(document.querySelector('.ana-activity-toggle')!);
    const note = screen.getByText('Not finished — the turn was interrupted.');
    expect(note.closest('[hidden]')).toBeNull();
  });
});

describe.each<HostKind>(['conversation'])('%s partial response recovery', kind => {
  it('shows an incomplete note even when the failed turn was recorded, and only continues on request', async () => {
    responses.push(response([
      { type: 'text', content: PARTIAL },
      { type: 'error', error: 'Generation failed', turnRecord: recorded },
    ]));
    render(<Host kind={kind} />);
    await act(async () => { await chat.send('Compare the endpoints'); });
    expect(chat.messages.at(-1)).toMatchObject({
      text: PARTIAL, interrupted: true, interruptedWithPartialResponse: true, turnRecord: recorded,
    });
    expect(showsNote(NOTE)).toBe(true);
    expect(continueButton()).not.toBeNull();
    expect(requests()).toHaveLength(1);
    await act(async () => { fireEvent.click(continueButton()!); });
    expect(requests()).toHaveLength(2);
    expect(requests()[1]).toMatchObject({ message: CONTINUE_PROMPT, thread_id: 'thread-selected' });
    expect(requests()[1].continuation_context).toEqual({ question: 'Compare the endpoints', partialResponse: PARTIAL });
    expect(requests()[1].conversation_history).toContainEqual({ role: 'assistant', content: PARTIAL });
    // The old response remains visibly incomplete, but it is no longer the
    // latest turn and cannot offer another Continue.
    expect(showsNote(NOTE)).toBe(true);
    expect(continueButton()).toBeNull();
  });

  it('marks partial text incomplete when the stream closes without post_done', async () => {
    responses.push(response([{ type: 'text', content: PARTIAL }]));
    render(<Host kind={kind} />);
    await act(async () => { await chat.send('Compare the endpoints'); });
    expect(showsNote(NOTE)).toBe(true);
    expect(continueButton()).not.toBeNull();
    expect(chat.messages.at(-1)?.text).toBe(PARTIAL);
  });

  it('keeps the existing repeated-step explanation and offers no Continue', async () => {
    responses.push(response([
      { type: 'text', content: PARTIAL },
      { type: 'done', stoppedReason: 'duplicate_thrash' },
      { type: 'error', error: 'Finishing failed', turnRecord: recorded },
    ]));
    render(<Host kind={kind} />);
    await act(async () => { await chat.send('Compare the endpoints'); });
    expect(showsNote('AnA stopped because she was repeating the same step. Tell her what to change.')).toBe(true);
    expect(showsNote(NOTE)).toBe(false);
    expect(continueButton()).toBeNull();
  });
});

describe.each<HostKind>(['conversation'])('%s responses without partial model text', kind => {
  it.each([401, 403, 429])('preserves the existing HTTP %s refusal without a misleading Continue', async status => {
    const code = status === 429 ? 'WEEKLY_LIMIT_EXCEEDED' : 'ACCESS_DENIED';
    responses.push(new Response(JSON.stringify({ error: 'Refused', code }), { status }));
    render(<Host kind={kind} />);
    await act(async () => { await chat.send('Compare the endpoints'); });
    const turn = chat.messages.at(-1)!;
    expect(turn.text).toBe(streamRefusalText({ status, code }));
    expect(turn.interruptedWithPartialResponse).not.toBe(true);
    expect(showsNote(NOTE)).toBe(false);
    expect(continueButton()).toBeNull();
    expect(requests()).toHaveLength(1);
  });

  it('leaves a completed text response without an interruption note or Continue', async () => {
    render(<Host kind={kind} />);
    await act(async () => { await chat.send('Compare the endpoints'); });
    expect(chat.messages.at(-1)?.text).toBe('The follow-up answer is complete.');
    expect(showsNote(NOTE)).toBe(false);
    expect(continueButton()).toBeNull();
  });
});


describe.each<HostKind>(['conversation'])('%s partial response recovery guidance', kind => {
  it.each([
    [{ status: 401 }, 'Sign in again before asking AnA to continue.'],
    [{ status: 403 }, 'Ask an administrator to review your access before asking AnA to continue.'],
    [{ status: 429 }, 'Wait a moment before asking AnA to continue.'],
    [{ error: { code: 'WEEKLY_LIMIT_EXCEEDED', message: 'internal limiter details' } }, 'An administrator can review the weekly limit before you ask AnA to continue.'],
    [{ code: 'GATEWAY_UNAVAILABLE' }, 'An administrator needs to configure an AI provider before AnA can continue.'],
    [{ code: 'THREAD_FORBIDDEN' }, 'Select your own conversation or start a new one before asking again.'],
    [{}, 'Review the partial text before asking AnA to try again.'],
  ])('shows safe recovery guidance after partial text for %o', async (details, recovery) => {
    responses.push(response([
      { type: 'warning', message: 'Some project context is unavailable.' },
      { type: 'text', content: PARTIAL },
      { type: 'error', error: 'internal provider details', ...details, turnRecord: recorded },
    ]));
    render(<Host kind={kind} />);
    await act(async () => { await chat.send('Compare the endpoints'); });
    expect(chat.messages.at(-1)?.text).toBe(PARTIAL);
    expect(chat.messages.at(-1)?.warnings).toContain(recovery);
    expect(screen.getByText(recovery).closest('.ana-msg-warnings')).not.toBeNull();
    expect(screen.getByText('Some project context is unavailable.')).not.toBeNull();
    expect(screen.queryByText(/internal.*details/)).toBeNull();
    expect(chat.messages.at(-1)?.turnRecord).toEqual(recorded);
    expect(requests()).toHaveLength(1);
  });
});


describe.each<HostKind>(['conversation'])('%s final activity reconciliation', kind => {
  it.each(['search_documents', 'update_plan'])('closes an unconfirmed %s without changing received results or the finished answer', async unconfirmedTool => {
    responses.push(response([
      { type: 'tool_use', name: unconfirmedTool, label: 'Checking protocol', toolUseId: 'missing' },
      { type: 'tool_use', name: 'search_documents', label: 'Checking evidence', toolUseId: 'received' },
      { type: 'tool_result', name: 'search_documents', toolUseId: 'received', status: 'success', result: 'Evidence found' },
      { type: 'text', content: 'The review is ready.' },
      { type: 'done', stoppedReason: 'no_more_tools' },
      { type: 'post_done', cleanedResponse: 'The final review.', turnRecord: recorded },
    ]));
    render(<Host kind={kind} />);
    await act(async () => { await chat.send('Review the protocol'); });
    const turn = chat.messages.at(-1)!;
    expect(turn.toolCalls?.[0]).toMatchObject({ status: 'unconfirmed', message: 'Completion not confirmed — no result was received for this step.' });
    expect(typeof turn.toolCalls?.[0].endedAt).toBe('number');
    expect(turn.toolCalls?.[0].result).toBeUndefined();
    expect(turn.toolCalls?.[1]).toMatchObject({ status: 'success', result: 'Evidence found' });
    expect(turn).toMatchObject({ text: 'The final review.', streaming: false, turnRecord: recorded });
    expect(turn.interrupted).not.toBe(true);
    expect(chat.isStreaming).toBe(false);
    const toggle = document.querySelector('.ana-activity-toggle')!;
    expect(toggle.textContent).toContain('1 unconfirmed');
    expect(toggle.textContent).not.toContain('failed');
    fireEvent.click(toggle);
    expect(screen.getByText('Completion not confirmed — no result was received for this step.').closest('[hidden]')).toBeNull();
    expect(requests()).toHaveLength(1);
  });
});
