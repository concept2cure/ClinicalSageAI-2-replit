// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

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

import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

/**
 * AnA's warnings reach the person on every screen she answers on
 * (row 74, ADR-0015 §9).
 *
 * The rail drew a message's warnings — a save that failed, a timeout, a model
 * the request pinned that was refused — under the answer. The conversation
 * screen did not draw them at all, so Home's questions (which land there)
 * showed none of them: an error rendered as a clean answer. One component,
 * AnaMessageWarnings, draws them. The rail is gone (ONE_ANA_ONE_CANVAS.md,
 * slice 9); the conversation is where AnA answers.
 */
afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});

const WARNING = 'The document was drafted but could not be saved. Nothing was filed.';
const warningsShown = () => Array.from(document.querySelectorAll('.ana-msg-warning')).map((n) => n.textContent ?? '');

describe('the conversation screen', () => {
  const PROPS: OwnedSurfaceViewProps = {
    surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
    segment: 'biotech',
    onNav: () => {},
  };
  const messages = (warnings?: string[]): AnaChatMessage[] => [
    { id: 'u-1', role: 'user', text: 'Draft the synopsis' } as AnaChatMessage,
    { id: 'a-1', role: 'assistant', text: 'Here is the synopsis.', warnings, sentAt: 1_000, completedAt: 5_000 } as AnaChatMessage,
  ];
  const chat = (m: AnaChatMessage[]): UseAnaChatReturn => ({
    messages: m,
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
  });
  async function mount(c: UseAnaChatReturn) {
    delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
    render(<ConversationThread {...PROPS} shellChat={c} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }

  it("shows a turn's warnings, as a note, under the answer", async () => {
    await mount(chat(messages([WARNING])));
    expect(warningsShown()).toEqual([WARNING]);
    expect(document.querySelector('.ana-msg-warnings')?.getAttribute('role')).toBe('note');
  });

  it('shows nothing when the turn has no warning', async () => {
    await mount(chat(messages(undefined)));
    expect(warningsShown()).toEqual([]);
    expect(document.querySelector('.ana-msg-warnings')).toBeNull();
  });
});
