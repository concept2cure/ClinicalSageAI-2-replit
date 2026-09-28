// @vitest-environment jsdom
/**
 * Continue is offered where a capped turn can actually be continued.
 *
 * AnaActivity draws Continue only when its host passes `onContinue`, so the
 * component suite cannot see whether a host passes it, to which turn, or what
 * it sends. That is the seam pinned here, on both hosts that render the
 * transcript with a send path: the shell's rail and the conversation screen.
 *
 *   · only the LATEST settled assistant turn offers Continue — an earlier
 *     capped turn keeps its note and has no button;
 *   · nothing offers it while a turn is in flight;
 *   · Continue sends the one fixed sentence through the host's own send path,
 *     as a new turn on the same conversation (the run is over; there is
 *     nothing to resume).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

import type { AnaChatMessage, UseAnaChatReturn } from '../../components/ana/useAnaChat';

vi.mock('../dataConnect', () => ({
  connected: () => false,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock('../../../utils/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test' }),
}));
/* ConversationThread's private chat — never the one acted on here. */
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

import { AnaRail, type AnaMessage } from '../Shell';
import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { CONTINUE_PROMPT, continueTurnIndex, isContinuable } from '../anaWorkModel';

afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});

const step = { name: 'search_documents', label: 'Searching your documents', status: 'success' as const };
const capped = { toolCalls: [step], stoppedReason: 'max_rounds' as const, rounds: 12, startedAt: 1_000, completedAt: 60_000 };

const continueButtons = () => Array.from(document.querySelectorAll('.ana-activity-continue')) as HTMLButtonElement[];
const notes = () => Array.from(document.querySelectorAll('.ana-activity-stopped'));

describe('which turn, and which stops', () => {
  it('the hosts pick the latest settled assistant turn, and none while a turn is in flight', () => {
    const turns = [
      { role: 'user' },
      { role: 'assistant', streaming: false },
      { role: 'user' },
      { role: 'assistant', streaming: false },
    ];
    // The latest — never the earlier assistant turn at index 1.
    expect(continueTurnIndex(turns, false)).toBe(3);
    // Busy, streaming, or a newer question waiting: nothing to continue.
    expect(continueTurnIndex(turns, true)).toBe(-1);
    expect(continueTurnIndex([...turns.slice(0, 3), { role: 'assistant', streaming: true }], false)).toBe(-1);
    expect(continueTurnIndex([...turns, { role: 'user' }], false)).toBe(-1);
    expect(continueTurnIndex([], false)).toBe(-1);
    // The rail's own role name.
    expect(continueTurnIndex([{ role: 'user' }, { role: 'ana', streaming: false }], false)).toBe(1);
  });

  it('isContinuable follows the table, and Continue sends one fixed sentence', () => {
    expect(isContinuable('max_rounds')).toBe(true);
    expect(isContinuable('duplicate_thrash')).toBe(false);
    expect(isContinuable('cancelled')).toBe(false);
    expect(isContinuable('no_more_tools')).toBe(false);
    expect(isContinuable(undefined)).toBe(false);
    // Reserved for later slices; the table is fixed now so they do not reshape it.
    expect(isContinuable('budget_exhausted')).toBe(true);
    expect(isContinuable('approval_timeout')).toBe(true);
    expect(isContinuable('hold_expired')).toBe(true);
    expect(isContinuable('hold_unavailable')).toBe(true);
    expect(CONTINUE_PROMPT).toBe('Continue from where you stopped.');
  });
});

describe('the rail', () => {
  const railTurns = (latestStreaming = false): AnaMessage[] => [
    { role: 'user', body: 'Compare every endpoint' },
    { role: 'ana', body: 'Partial comparison.', activity: { ...capped } },
    { role: 'user', body: 'Go on' },
    { role: 'ana', body: 'Still partial.', activity: { ...capped, streaming: latestStreaming } },
  ];

  function renderRail(messages: AnaMessage[], streaming: boolean, onSend = vi.fn()) {
    render(
      <AnaRail
        open
        setOpen={() => {}}
        surface={{ id: 'cmc', label: 'CMC' }}
        segment="biotech"
        mode="standard"
        setMode={() => {}}
        messages={messages}
        onSend={onSend}
        onAct={vi.fn()}
        projectId={42}
        streaming={streaming}
      />,
    );
    return onSend;
  }

  it('offers Continue on the latest settled turn only, and sends the fixed sentence', () => {
    const onSend = renderRail(railTurns(), false);
    // Both capped turns say so; only the latest can be continued.
    expect(notes()).toHaveLength(2);
    const buttons = continueButtons();
    expect(buttons).toHaveLength(1);
    expect(notes()[1].contains(buttons[0])).toBe(true);
    fireEvent.click(buttons[0]);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(CONTINUE_PROMPT);
  });

  it('offers nothing while a turn is in flight', () => {
    renderRail(railTurns(true), true);
    expect(continueButtons()).toHaveLength(0);
  });

  it('keeps keyboard focus in the transcript when the send withdraws Continue', () => {
    // The send makes a new turn the latest, so Continue unmounts in the render
    // that follows the click. Focus must not fall to <body> (WCAG 2.4.3).
    const rail = (messages: AnaMessage[], streaming: boolean) => (
      <AnaRail
        open
        setOpen={() => {}}
        surface={{ id: 'cmc', label: 'CMC' }}
        segment="biotech"
        mode="standard"
        setMode={() => {}}
        messages={messages}
        onSend={vi.fn()}
        onAct={vi.fn()}
        projectId={42}
        streaming={streaming}
      />
    );
    const { rerender } = render(rail(railTurns(), false));
    const [button] = continueButtons();
    button.focus();
    fireEvent.click(button);
    rerender(
      rail(
        [
          ...railTurns(),
          { role: 'user', body: CONTINUE_PROMPT },
          { role: 'ana', body: '', activity: { streaming: true, phase: 'Planning response…' } },
        ],
        true,
      ),
    );
    expect(continueButtons()).toHaveLength(0);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(notes()[1]);
  });
});

describe('the conversation screen', () => {
  const PROPS: OwnedSurfaceViewProps = {
    surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
    segment: 'biotech',
    onNav: () => {},
  };
  const assistant = (id: string, over: Partial<AnaChatMessage> = {}) =>
    ({ id, role: 'assistant', text: 'Partial comparison.', ...capped, sentAt: 1_000, ...over }) as AnaChatMessage;
  const messages: AnaChatMessage[] = [
    { id: 'u-1', role: 'user', text: 'Compare every endpoint' } as AnaChatMessage,
    assistant('a-1'),
    { id: 'u-2', role: 'user', text: 'Go on' } as AnaChatMessage,
    assistant('a-2'),
  ];

  function chat(over: Partial<UseAnaChatReturn> = {}): UseAnaChatReturn {
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
      threadId: 'thread-1',
      isLoadingThread: false,
      ...over,
    };
  }

  async function mount(c: UseAnaChatReturn) {
    delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
    render(<ConversationThread {...PROPS} shellChat={c} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }

  it('offers Continue on the latest settled turn only, and sends it on the same conversation', async () => {
    const c = chat();
    await mount(c);
    expect(notes()).toHaveLength(2);
    const buttons = continueButtons();
    expect(buttons).toHaveLength(1);
    expect(notes()[1].contains(buttons[0])).toBe(true);
    fireEvent.click(buttons[0]);
    expect(c.send).toHaveBeenCalledTimes(1);
    expect(c.send).toHaveBeenCalledWith(CONTINUE_PROMPT);
    expect(c.reset).not.toHaveBeenCalled();
  });

  it('offers nothing while a turn is in flight', async () => {
    await mount(chat({ isStreaming: true, messages: [...messages.slice(0, 3), assistant('a-2', { streaming: true })] }));
    expect(continueButtons()).toHaveLength(0);
  });

  it('keeps keyboard focus in the transcript when the send withdraws Continue', async () => {
    delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
    const c = chat();
    const { rerender } = render(<ConversationThread {...PROPS} shellChat={c} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const [button] = continueButtons();
    button.focus();
    fireEvent.click(button);
    // The send: the question lands and a new turn is in flight.
    const sent = chat({
      isStreaming: true,
      messages: [
        ...messages,
        { id: 'u-3', role: 'user', text: CONTINUE_PROMPT } as AnaChatMessage,
        { id: 'a-3', role: 'assistant', text: '', streaming: true, sentAt: 2_000 } as AnaChatMessage,
      ],
    });
    await act(async () => {
      rerender(<ConversationThread {...PROPS} shellChat={sent} />);
    });
    expect(continueButtons()).toHaveLength(0);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(notes()[1]);
  });
});
