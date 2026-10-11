// @vitest-environment jsdom
/**
 * An organisation admin following a colleague's turn (AnA detach DT2, §4.2,
 * §5.1; DT2 test 9 and DT1's handover (c)).
 *
 * The admin may watch (D-1(b)) and, by design, Stop. Pause, resume, steer and
 * approvals are the asker's alone (§2.5). The server accepts an admin's cancel
 * only from slice DT3, so until then Stop is not offered: a button refused on
 * press is worse than none. The composer says why it does not steer.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import type { AnaChatMessage, UseAnaChatReturn } from '../../components/ana/useAnaChat';

vi.mock('../dataConnect', () => ({
  connected: () => false,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: [], isStreaming: false, isLoadingThread: false, threadId: null, runStatus: null, pendingSteers: [],
    pause: vi.fn(), resume: vi.fn(), interject: vi.fn(), stop: vi.fn(), reset: vi.fn(), send: vi.fn(), loadThread: vi.fn(),
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};

const followed = (scope: 'all' | 'cancel'): AnaChatMessage[] => [
  { id: 'm-501', serverId: 501, role: 'user', text: 'Find every stability report' } as AnaChatMessage,
  {
    id: 'f-run_live',
    role: 'assistant',
    text: '',
    streaming: true,
    follow: { runId: 'run_live', scope, status: 'running', startedAt: Date.now() - 60_000, skewMs: 0, lastBeatAt: Date.now(), highWater: 0 },
  } as AnaChatMessage,
];

function chat(scope: 'all' | 'cancel'): UseAnaChatReturn {
  return {
    messages: followed(scope),
    isStreaming: true,
    send: vi.fn(async () => undefined),
    stop: vi.fn(),
    runStatus: 'running',
    pause: vi.fn(async () => true),
    resume: vi.fn(async () => true),
    interject: vi.fn(async () => true),
    pendingSteers: [],
    followScope: scope,
    reset: vi.fn(),
    loadThread: vi.fn(async () => undefined),
    threadId: 'th1',
    isLoadingThread: false,
  };
}

async function mount(c: UseAnaChatReturn) {
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'current', seed: null };
  render(<ConversationThread {...PROPS} shellChat={c} />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('9. an admin following a colleague’s turn', () => {
  it('has no Stop (until DT3 accepts it), no Pause, and a composer that says only the asker can steer', async () => {
    await mount(chat('cancel'));
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    const box = screen.getByRole('textbox', { name: 'Reply to AnA' }) as HTMLTextAreaElement;
    expect(box.disabled).toBe(true);
    expect(box.placeholder).toBe('Only the person who asked can steer AnA.');
    expect(screen.getByRole('note').textContent).toBe('Only the person who asked can steer AnA.');
  });

  it('the asker following their own turn keeps every control, and the composer steers', async () => {
    await mount(chat('all'));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    const box = screen.getByRole('textbox', { name: 'Steer this run' }) as HTMLTextAreaElement;
    expect(box.disabled).toBe(false);
  });
});
