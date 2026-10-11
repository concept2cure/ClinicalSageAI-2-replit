// @vitest-environment jsdom
/**
 * Opening the conversation screen never wipes the conversation in progress.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The screen renders the SHELL's chat — the one conversation, the rail's too,
 * and the one AnA drives from. On mount with nothing to ask (no C2C_CONVO at
 * all, or `{ id: 'new' }` with no seed) it called `shellChat.reset()`. AnA's
 * own navigation to this screen arrives exactly that way, so the move wiped
 * the turn that made it: the answer vanished mid-sentence and the drive died.
 * "Open full thread" with an empty box did the same to whatever was running.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 *   · arriving with nothing to ask shows the conversation in progress, and
 *     resets nothing — streaming or not;
 *   · a question sent here while AnA is still answering neither aborts her nor
 *     vanishes: it waits in the composer, and the person is told;
 *   · another conversation asked for mid-turn is not loaded over the running
 *     one, and a loaded one becomes the conversation in progress, so the next
 *     arrival (AnA's navigation among them) does not load it again;
 *   · starting over is a person's decision — the New conversation control —
 *     and it is not offered mid-turn.
 *
 * Every assertion is on what the shell's chat was asked to do (reset, send,
 * loadThread) and on what the person sees.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { AnaChatMessage, UseAnaChatReturn } from '../../components/ana/useAnaChat';

/* Live reads held offline: what is under test is the mount's handling of the
   shell's chat, nothing the side column fetches. */
vi.mock('../dataConnect', () => ({
  connected: () => false,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

/* The screen's private chat — used only by a host with no shell chat. Every
   case here passes the shell's, so this one must never be the one acted on. */
const privateChat = vi.hoisted(() => ({
  reset: vi.fn(),
  send: vi.fn(),
  loadThread: vi.fn(),
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
    ...privateChat,
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};

/** The conversation in progress: a question, and AnA's answer to it. */
const IN_PROGRESS: AnaChatMessage[] = [
  { id: 'u-1', role: 'user', text: 'Walk me through the vault for BX-301.' } as AnaChatMessage,
  { id: 'a-1', role: 'assistant', text: 'Opening the vault now. It holds', streaming: true } as AnaChatMessage,
];

function shellChat(over: Partial<UseAnaChatReturn> = {}): UseAnaChatReturn {
  return {
    messages: IN_PROGRESS,
    isStreaming: true,
    send: vi.fn(async () => undefined),
    stop: vi.fn(),
    runStatus: 'running',
    pause: vi.fn(async () => true),
    resume: vi.fn(async () => true),
    interject: vi.fn(async () => true),
    pendingSteers: [],
    reset: vi.fn(),
    loadThread: vi.fn(async () => undefined),
    threadId: 'thread-1',
    isLoadingThread: false,
    ...over,
  };
}

type ConvoWindow = { C2C_CONVO?: { id: string; seed?: string | null } };
const convo = () => (window as unknown as ConvoWindow).C2C_CONVO;
const setConvo = (v: ConvoWindow['C2C_CONVO']) => {
  if (v === undefined) delete (window as unknown as ConvoWindow).C2C_CONVO;
  else (window as unknown as ConvoWindow).C2C_CONVO = v;
};

/** The person's turns drawn in the conversation column. */
const shownTurns = () => Array.from(document.querySelectorAll('.ct-user-b')).map((el) => el.textContent);

/** Mount, then let the deferred seed (a zero-delay timeout) and any load settle. */
async function mount(chat: UseAnaChatReturn) {
  render(<ConversationThread {...PROPS} shellChat={chat} />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

beforeEach(() => {
  privateChat.reset.mockReset();
  privateChat.send.mockReset();
  privateChat.loadThread.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setConvo(undefined);
});

describe('arriving with nothing to ask shows the conversation in progress', () => {
  const NOTHING_TO_ASK: Array<[string, ConvoWindow['C2C_CONVO']]> = [
    ['no C2C_CONVO at all (a first visit, or AnA’s own navigation here)', undefined],
    ['{ id: "new" } with no seed', { id: 'new' }],
    ['"Open full thread" with an empty box', { id: 'new', seed: '' }],
    ['an unseeded ask to draft', { id: 'new', seed: null }],
  ];

  for (const [how, value] of NOTHING_TO_ASK) {
    it(`${how}: AnA's running turn is kept, and on screen`, async () => {
      setConvo(value);
      const chat = shellChat({ isStreaming: true });
      await mount(chat);
      expect(chat.reset).not.toHaveBeenCalled();
      expect(chat.loadThread).not.toHaveBeenCalled();
      expect(chat.send).not.toHaveBeenCalled();
      expect(shownTurns()).toEqual(['Walk me through the vault for BX-301.']);
      // Recorded, so every later arrival reads the same.
      expect(convo()).toEqual({ id: 'current', seed: null });
    });
  }

  it('an idle conversation is kept too — arriving is not a request to start over', async () => {
    setConvo(undefined);
    const chat = shellChat({ isStreaming: false, runStatus: null });
    await mount(chat);
    expect(chat.reset).not.toHaveBeenCalled();
    expect(shownTurns()).toEqual(['Walk me through the vault for BX-301.']);
  });

  it('an empty conversation in progress is titled as the new conversation it is', async () => {
    setConvo(undefined);
    await mount(shellChat({ messages: [], isStreaming: false, runStatus: null, threadId: null }));
    expect(document.querySelector('.ct-head-t')?.textContent).toBe('New conversation');
    expect(screen.getByText('Talk to AnA')).toBeTruthy();
  });
});

describe('a question sent here while AnA is still answering', () => {
  it('neither aborts her nor vanishes: it waits in the composer, and the person is told', async () => {
    setConvo({ id: 'new', seed: 'What blocks the Module 3 freeze?' });
    const chat = shellChat({ isStreaming: true });
    await mount(chat);
    expect(chat.reset).not.toHaveBeenCalled();
    // A send now would be refused by the hook's re-entrancy guard — the
    // question would be dropped without a word. It is held instead.
    expect(chat.send).not.toHaveBeenCalled();
    /* While her run is in flight the composer steers it (ONE_ANA_ONE_CANVAS.md,
       slice 4), so it is labelled for that; the question still waits in it. */
    const composer = screen.getByLabelText('Steer this run') as HTMLTextAreaElement;
    expect(composer.value).toBe('What blocks the Module 3 freeze?');
    expect(screen.getByText(/your question has not been sent/)).toBeTruthy();
    expect(shownTurns()).toEqual(['Walk me through the vault for BX-301.']);
    expect(convo()).toEqual({ id: 'current', seed: null });
  });

  it('when she is idle, the question starts its new conversation and is sent', async () => {
    setConvo({ id: 'new', seed: 'What blocks the Module 3 freeze?' });
    const order: string[] = [];
    const chat = shellChat({
      isStreaming: false,
      runStatus: null,
      reset: vi.fn(() => order.push('reset')),
      send: vi.fn(async () => {
        order.push('send');
      }),
    });
    await mount(chat);
    expect(order).toEqual(['reset', 'send']);
    // The question as asked; the second argument is its attachments (none).
    expect(vi.mocked(chat.send).mock.calls.at(-1)?.[0]).toBe('What blocks the Module 3 freeze?');
  });
});

describe('another conversation, asked for by id', () => {
  it('is not loaded over a turn that is still running — the person is told to open it again', async () => {
    setConvo({ id: 'thread-9' });
    const chat = shellChat({ isStreaming: true, threadId: 'thread-1' });
    await mount(chat);
    expect(chat.loadThread).not.toHaveBeenCalled();
    expect(chat.reset).not.toHaveBeenCalled();
    expect(screen.getByText(/still answering in the current conversation/)).toBeTruthy();
    expect(convo()).toEqual({ id: 'current', seed: null });
  });

  it('once loaded, is the conversation in progress — the next arrival does not load it again', async () => {
    setConvo({ id: 'thread-9' });
    const chat = shellChat({ isStreaming: false, runStatus: null, threadId: 'thread-1' });
    await mount(chat);
    expect(chat.loadThread).toHaveBeenCalledWith('thread-9');
    expect(convo()).toEqual({ id: 'current', seed: null });

    // The rail then starts a new thread and AnA, driving it, navigates here:
    // nothing is loaded over her turn.
    cleanup();
    const later = shellChat({ isStreaming: true, threadId: 'thread-2' });
    await mount(later);
    expect(later.loadThread).not.toHaveBeenCalled();
    expect(later.reset).not.toHaveBeenCalled();
  });
});

describe('starting over is a person’s decision', () => {
  it('New conversation resets the shell’s chat', async () => {
    setConvo(undefined);
    const chat = shellChat({ isStreaming: false, runStatus: null });
    await mount(chat);
    fireEvent.click(screen.getByRole('button', { name: /New conversation/ }));
    expect(chat.reset).toHaveBeenCalledTimes(1);
    expect(convo()).toEqual({ id: 'current', seed: null });
  });

  it('can replace a pending history read with a new conversation and keeps the draft', async () => {
    setConvo(undefined);
    const chat = shellChat({ messages: [], isStreaming: false, runStatus: null, isLoadingThread: true });
    await mount(chat);
    const composer = screen.getByRole('textbox', { name: 'Reply to AnA' }) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'Keep this new question' } });
    const button = screen.getByRole('button', { name: /New conversation/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(chat.reset).toHaveBeenCalledOnce();
    expect(composer.value).toBe('Keep this new question');
  });

  it('is not offered mid-turn — a reset would abort AnA where she stands', async () => {
    setConvo(undefined);
    const chat = shellChat({ isStreaming: true });
    await mount(chat);
    const button = screen.getByRole('button', { name: /New conversation/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(chat.reset).not.toHaveBeenCalled();
  });
});

describe('history loading and recovery', () => {
  it.each(['loading', 'failed'] as const)('keeps the reply draft while history is %s', async state => {
    setConvo({ id: 'current' });
    const chat = shellChat({
      messages: [], isStreaming: false, runStatus: null, threadId: null,
      isLoadingThread: state === 'loading',
      threadLoadError: state === 'failed' ? { threadId: 'beta', message: 'Could not read Beta.' } : null,
    });
    await mount(chat);
    const composer = screen.getByRole('textbox', { name: 'Reply to AnA' }) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'Keep this question for Beta' } });
    const send = screen.getByRole('button', { name: 'Send message to AnA' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(chat.send).not.toHaveBeenCalled();
    expect(composer.value).toBe('Keep this question for Beta');
  });

  it('shows the failed history with retry for that same thread and an explicit new conversation control', async () => {
    setConvo({ id: 'current' });
    const chat = shellChat({
      messages: [], isStreaming: false, runStatus: null, threadId: null,
      threadLoadError: { threadId: 'beta', message: 'Could not read Beta.' },
    });
    await mount(chat);
    expect(screen.queryByText("Couldn't load this conversation")).not.toBeNull();
    expect(screen.queryByText('Talk to AnA')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading conversation' }));
    expect(chat.loadThread).toHaveBeenCalledWith('beta');
    fireEvent.click(screen.getByRole('button', { name: /New conversation/ }));
    expect(chat.reset).toHaveBeenCalledOnce();
    await act(async () => {});
  });
});
