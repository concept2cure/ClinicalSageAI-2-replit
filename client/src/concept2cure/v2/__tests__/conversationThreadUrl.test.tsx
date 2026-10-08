// @vitest-environment jsdom
/**
 * A reload of the conversation page reopens the conversation it showed.
 *
 * ── The defect (QA 2026-10-08, j5 "Reloading the conversation page shows an
 *    empty 'New conversation' and hides the finished turn") ──────────────────
 * The screen learned which conversation to show only from `window.C2C_CONVO`,
 * a window global set by whatever opened it, and the URL was the bare
 * `/concept2cure/conversation-thread`. A reload clears the global, so the page
 * came back as "New conversation" with the starters, and a turn that had been
 * answered and saved was nowhere on screen.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 *   · the URL names the conversation on screen, once it has an id;
 *   · a fresh page load on that URL loads that conversation;
 *   · the URL is never rewritten from a screen AnA has already moved away to;
 *   · starting a new conversation drops the id from the URL.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

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
import { conversationIdFromLocation, locationForConversation, locationForSurface } from '../routing';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};

const ANSWERED: AnaChatMessage[] = [
  { id: 'u-1', role: 'user', text: 'Summarize the open risks for this program' } as AnaChatMessage,
  { id: 'a-1', role: 'assistant', text: 'Understood.', streaming: false } as AnaChatMessage,
];

function shellChat(over: Partial<UseAnaChatReturn> = {}): UseAnaChatReturn {
  return {
    messages: [],
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
    threadId: null,
    isLoadingThread: false,
    ...over,
  };
}

type ConvoWindow = { C2C_CONVO?: { id: string; seed?: string | null } };
const setConvo = (v: ConvoWindow['C2C_CONVO']) => {
  if (v === undefined) delete (window as unknown as ConvoWindow).C2C_CONVO;
  else (window as unknown as ConvoWindow).C2C_CONVO = v;
};

async function mount(chat: UseAnaChatReturn) {
  const view = render(<ConversationThread {...PROPS} shellChat={chat} />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return view;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setConvo(undefined);
  window.history.replaceState({}, '', '/');
});

describe('the conversation URL', () => {
  it('names a conversation by id under the conversation screen, and nothing else', () => {
    expect(locationForConversation('ana-ri_1791424008792_fikqams6o')).toBe(
      '/concept2cure/conversation-thread/ana-ri_1791424008792_fikqams6o',
    );
    expect(locationForConversation(null)).toBe('/concept2cure/conversation-thread');
    expect(conversationIdFromLocation('/concept2cure/conversation-thread/ana-ri_1791424008792_fikqams6o')).toBe(
      'ana-ri_1791424008792_fikqams6o',
    );
    expect(conversationIdFromLocation('/concept2cure/conversation-thread')).toBeNull();
    expect(conversationIdFromLocation('/concept2cure/vault/ana-ri_1')).toBeNull();
    // Not an id: a path that would escape the segment, or markup.
    expect(conversationIdFromLocation('/concept2cure/conversation-thread/%3Cscript%3E')).toBeNull();
    expect(locationForConversation('../vault')).toBe('/concept2cure/conversation-thread');
  });
});

describe('a reload reopens the conversation on screen', () => {
  it('a fresh page load on the conversation URL loads that conversation', async () => {
    window.history.replaceState({}, '', '/concept2cure/conversation-thread/ana-ri_1791424392094_9yswyv3gq');
    setConvo(undefined); // a reload clears every window global
    const chat = shellChat();
    await mount(chat);
    expect(chat.loadThread).toHaveBeenCalledWith('ana-ri_1791424392094_9yswyv3gq');
    expect(chat.reset).not.toHaveBeenCalled();
    // Loaded, it is the conversation in progress, as one opened by hand-off is.
    expect((window as unknown as ConvoWindow).C2C_CONVO).toEqual({ id: 'current', seed: null });
  });

  it('the URL names the conversation the screen shows, once it has an id', async () => {
    window.history.replaceState({}, '', locationForSurface('conversation-thread'));
    setConvo({ id: 'current', seed: null });
    await mount(shellChat({ messages: ANSWERED, threadId: 'ana-ri_1791424392094_9yswyv3gq' }));
    expect(window.location.pathname).toBe('/concept2cure/conversation-thread/ana-ri_1791424392094_9yswyv3gq');
  });

  it("keeps the shell's query (the open program) when it writes the conversation id", async () => {
    const program = '50c41bb6-5796-4dc6-a848-72e4d1246ebd';
    window.history.replaceState({}, '', `${locationForSurface('conversation-thread')}?program=${program}`);
    setConvo({ id: 'current', seed: null });
    await mount(shellChat({ messages: ANSWERED, threadId: 'ana-ri_45' }));
    expect(window.location.pathname).toBe('/concept2cure/conversation-thread/ana-ri_45');
    expect(window.location.search).toBe(`?program=${program}`);
  });

  it('a thread id that arrives mid-turn is written to the URL as it arrives', async () => {
    window.history.replaceState({}, '', locationForSurface('conversation-thread'));
    setConvo({ id: 'current', seed: null });
    const { rerender } = await mount(shellChat({ messages: ANSWERED.slice(0, 1), isStreaming: true }));
    expect(window.location.pathname).toBe('/concept2cure/conversation-thread');
    rerender(
      <ConversationThread
        {...PROPS}
        shellChat={shellChat({ messages: ANSWERED, isStreaming: true, threadId: 'ana-ri_42' })}
      />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(window.location.pathname).toBe('/concept2cure/conversation-thread/ana-ri_42');
  });

  it('never rewrites the URL of a screen AnA has already moved the person to', async () => {
    window.history.replaceState({}, '', locationForSurface('conversation-thread'));
    setConvo({ id: 'current', seed: null });
    const { rerender } = await mount(shellChat({ messages: ANSWERED.slice(0, 1), isStreaming: true }));
    // AnA's navigation has pushed the Vault; the thread id lands in the same tick.
    window.history.pushState({}, '', locationForSurface('vault'));
    rerender(
      <ConversationThread
        {...PROPS}
        shellChat={shellChat({ messages: ANSWERED, isStreaming: true, threadId: 'ana-ri_43' })}
      />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(window.location.pathname).toBe('/concept2cure/vault');
  });

  it('starting a new conversation drops the id from the URL', async () => {
    window.history.replaceState({}, '', '/concept2cure/conversation-thread/ana-ri_44');
    setConvo({ id: 'current', seed: null });
    const chat = shellChat({ messages: ANSWERED, threadId: 'ana-ri_44' });
    await mount(chat);
    fireEvent.click(screen.getByRole('button', { name: /New conversation/ }));
    expect(chat.reset).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/concept2cure/conversation-thread');
  });
});
