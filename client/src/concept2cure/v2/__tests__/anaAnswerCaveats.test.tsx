// @vitest-environment jsdom
/**
 * A truncated answer must not read as a finished one.
 *
 * WHAT WENT WRONG
 * `useAnaChat` handles two things that qualify an answer rather than describe
 * the work behind it: a `warning` event from the server (degraded mode), and a
 * client-side timeout. The timeout path is the sharp one — when tokens have
 * already streamed it KEEPS them:
 *
 *     text: m.text.length > 0 ? m.text : 'AnA stopped responding before …',
 *     warnings: [...(m.warnings || []), 'Response timed out'],
 *
 * so the only record that the turn was cut off is `warnings`. The v2 rail
 * carried `executedActions`, `pendingSignoffs` and the whole activity record
 * across — and not `warnings`. A turn that died mid-sentence rendered its
 * partial text with nothing marking it partial: an incomplete result presented
 * as a complete one, on a surface people draft submission content with.
 *
 * WHY IT IS NOT PART OF THE WORK RECORD
 * The activity record answers "how did she get here" and collapses behind a
 * disclosure. A caveat answers "how much should I trust this", which is not
 * something a reader should have to expand a twisty to discover.
 *
 * WHERE IT IS PINNED NOW
 * These cases ran on the right rail. The rail is gone
 * (docs/design/ONE_ANA_ONE_CANVAS.md, slice 9) and AnA answers in one place,
 * the conversation, so every case runs there, on the shell's chat, the way
 * V2App mounts it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import type { AnaChatMessage, UseAnaChatReturn } from '../../components/ana/useAnaChat';

vi.mock('../dataConnect', () => ({
  connected: () => false,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock('../../../utils/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test' }),
}));
/* The conversation screen's private chat — never the one rendered here. */
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

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

/** The shell's chat holding one question and AnA's settled answer to it. */
function shellChat(answer: string, warnings?: string[]): UseAnaChatReturn {
  return {
    messages: [
      { id: 'u-1', role: 'user', text: 'What margin should we use?' } as AnaChatMessage,
      { id: 'a-1', role: 'assistant', text: answer, warnings, sentAt: 1_000, completedAt: 5_000 } as AnaChatMessage,
    ],
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
  };
}

async function renderTurn(answer: string, warnings?: string[]) {
  const utils = render(<ConversationThread {...PROPS} shellChat={shellChat(answer, warnings)} />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return utils;
}

describe('an answer carries its own caveats', () => {
  it('says a turn timed out, instead of showing the partial text as final', async () => {
    await renderTurn('The non-inferiority margin should be', ['Response timed out']);

    // The partial answer is still shown — it is real, and discarding it would
    // lose work. What must NOT happen is showing it unmarked.
    expect(screen.getByText(/The non-inferiority margin should be/)).toBeTruthy();
    expect(screen.getByText('Response timed out')).toBeTruthy();
  });

  it('surfaces a degraded-mode warning from the server', async () => {
    await renderTurn('Here is the summary.', ['Running in degraded mode']);

    expect(screen.getByText('Running in degraded mode')).toBeTruthy();
  });

  it('shows every caveat, not just the first', async () => {
    await renderTurn('Partial.', ['Running in degraded mode', 'Response timed out']);

    expect(screen.getByText('Running in degraded mode')).toBeTruthy();
    expect(screen.getByText('Response timed out')).toBeTruthy();
  });

  it('does not need the disclosure opened — a caveat you must hunt for is hidden', async () => {
    const { container } = await renderTurn('Partial.', ['Response timed out']);

    // Nothing was expanded; the caveat is in the DOM and outside the record.
    expect(container.querySelector('.ana-activity-body')).toBeNull();
    expect(container.querySelector('.ana-msg-warning')).toBeTruthy();
  });

  it('never states a caveat in colour alone', async () => {
    // --warning carries meaning here, so the glyph and the sentence must both
    // say it too (WCAG 1.4.1).
    const { container } = await renderTurn('Partial.', ['Response timed out']);

    const row = container.querySelector('.ana-msg-warning');
    expect(row?.querySelector('.ana-msg-warning-ic svg')).toBeTruthy();
    expect(row?.textContent).toContain('Response timed out');
  });

  it('a clean turn gets no caveat furniture at all', async () => {
    const { container } = await renderTurn('Here is the answer.');

    expect(container.querySelector('.ana-msg-warnings')).toBeNull();
  });

  it('an empty warnings array is not a caveat', async () => {
    const { container } = await renderTurn('Here is the answer.', []);

    expect(container.querySelector('.ana-msg-warnings')).toBeNull();
  });
});
