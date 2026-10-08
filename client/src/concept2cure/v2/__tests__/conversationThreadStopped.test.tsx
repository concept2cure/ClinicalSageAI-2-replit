// @vitest-environment jsdom
/**
 * A turn the person stopped reads as stopped in the conversation.
 *
 * ── The defect (QA 2026-10-08, j5 "Stop leaves the question with no answer
 *    and no 'stopped' marker") ───────────────────────────────────────────────
 * Stop pressed before AnA had written anything left her turn as her mark and
 * nothing else: the same picture as a turn still thinking. The work panel's
 * header said "Stopped", but the transcript, where the person reads, did not.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 *   · a turn stopped here (the client's own abort, no reason from the server)
 *     carries the stopped note under it;
 *   · a reopened turn the server saved as stopped carries the same note;
 *   · any words she had written before the stop stay, above the note.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

import type { AnaChatMessage, UseAnaChatReturn } from '../../components/ana/useAnaChat';

vi.mock('../dataConnect', () => ({
  connected: () => false,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: [],
    isStreaming: false,
    isLoadingThread: false,
    threadId: null,
    runStatus: null,
    pendingSteers: [],
    pause: vi.fn(),
    resume: vi.fn(),
    interject: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    send: vi.fn(),
    loadThread: vi.fn(),
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import { activityPropsFor } from '../AnaActivity';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};
const QUESTION = { id: 'u-1', role: 'user', text: 'Summarize the open risks for this program' } as AnaChatMessage;

function shellChat(messages: AnaChatMessage[]): UseAnaChatReturn {
  return {
    messages,
    isStreaming: false,
    send: vi.fn(async () => undefined),
    stop: vi.fn(),
    runStatus: null,
    pause: vi.fn(async () => true),
    resume: vi.fn(async () => true),
    interject: vi.fn(async () => true),
    pendingSteers: [],
    reset: vi.fn(),
    loadThread: vi.fn(async () => undefined),
    threadId: 'ana-ri_1791424631167_p36kmthg5',
    isLoadingThread: false,
  };
}

async function mount(messages: AnaChatMessage[]) {
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'current', seed: null };
  render(<ConversationThread {...PROPS} shellChat={shellChat(messages)} />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}
const anaTurnText = () =>
  Array.from(document.querySelectorAll('.ct-turn.ct-ana')).map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  window.history.replaceState({}, '', '/');
});

describe('a stopped turn says it was stopped', () => {
  it('a turn stopped here before the server said why is mapped as the same stop', () => {
    // The client aborts and marks `stopped`; the server's reason never arrives.
    const props = activityPropsFor({ id: 'a', role: 'assistant', text: '', streaming: false, stopped: true } as AnaChatMessage);
    expect(props.stoppedReason).toBe('cancelled');
    // A reason the server did send is never overwritten.
    expect(activityPropsFor({ id: 'b', role: 'assistant', text: 'x', stopped: true, stoppedReason: 'hold_expired' } as AnaChatMessage).stoppedReason).toBe('hold_expired');
  });

  it('stopped here before AnA wrote anything: the note, not an empty mark', async () => {
    await mount([
      QUESTION,
      { id: 'a-1', role: 'assistant', text: '', streaming: false, stopped: true, turnRecord: { status: 'unconfirmed' } } as AnaChatMessage,
    ]);
    const [turn] = anaTurnText();
    expect(turn).toContain('The run was stopped before AnA finished.');
  });

  it('reopened from the saved conversation: the same note', async () => {
    await mount([
      QUESTION,
      { id: 't-1', role: 'assistant', text: '', stoppedReason: 'cancelled' } as AnaChatMessage,
    ]);
    expect(anaTurnText()[0]).toContain('The run was stopped before AnA finished.');
  });

  it('what she had written before the stop stays, above the note', async () => {
    await mount([
      QUESTION,
      { id: 'a-1', role: 'assistant', text: 'Three risks stand out. First,', streaming: false, stopped: true } as AnaChatMessage,
    ]);
    const [turn] = anaTurnText();
    expect(turn).toContain('Three risks stand out. First,');
    expect(turn).toContain('The run was stopped before AnA finished.');
  });
});
