// @vitest-environment jsdom
/**
 * A conversation that belongs to another project says so and offers the way
 * out (docs/design/ONE_ANA_ONE_CANVAS.md §4.8, slice 5, client half).
 *
 * The server refuses a turn with THREAD_PROJECT_MISMATCH when the conversation
 * is bound to another project than the one the turn names, before anything is
 * saved or any model runs (docs/evidence/D2-ONE-ANA/2026-10-08/ana-5-own-project/).
 * The refused turn records the code (useAnaChat `refusalCode`). Under it the
 * conversation offers one button, "Ask again in a new conversation in <open
 * project>", which starts a new conversation (the existing New conversation
 * path) and asks the same question again in it. The name says the question is
 * sent: the refusal just above says it was not. Any other refusal offers nothing of the kind.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AnaChatMessage } from '../../components/ana/useAnaChat';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

const chatMessages: { current: AnaChatMessage[] } = { current: [] };
const chatStreaming = { current: false };
const calls: string[] = [];
const chatSend = vi.fn(async (text: string) => { calls.push(`send:${text}`); });
const chatReset = vi.fn(() => { calls.push('reset'); });
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: chatMessages.current,
    isStreaming: chatStreaming.current,
    isLoadingThread: false,
    loadThread: vi.fn().mockResolvedValue(undefined),
    send: chatSend,
    reset: chatReset,
    threadId: 'thread-p1',
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const OWNED_PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};
const P2 = '22222222-2222-4222-8222-222222222222';
const QUESTION = 'Draft the 2.5 Clinical Overview from the CSR.';
const MISMATCH_TEXT = 'This conversation belongs to another project. Start a new conversation in the project you have open. Your request was not sent to the AI provider.';

const refused = (code: string | undefined): AnaChatMessage[] => [
  { id: 'u1', role: 'user', text: QUESTION, attachments: [{ id: 'f1', name: 'CSR-001.pdf', fileId: 'file-1' }] } as AnaChatMessage,
  { id: 'a1', role: 'assistant', text: MISMATCH_TEXT, interrupted: true, ...(code ? { refusalCode: code } : {}) } as AnaChatMessage,
];

beforeEach(() => {
  calls.length = 0;
  chatSend.mockClear();
  chatReset.mockClear();
  chatStreaming.current = false;
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'thread-p1' };
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: P2, title: 'ONC-221' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ success: true, documents: [] }) }) as Response);
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('A conversation that belongs to another project', () => {
  it('says so, and offers one way out: a new conversation in the open project', () => {
    chatMessages.current = refused('THREAD_PROJECT_MISMATCH');
    render(<ConversationThread {...OWNED_PROPS} />);
    expect(screen.getByText(MISMATCH_TEXT)).toBeTruthy();
    const offers = screen.getAllByTestId('ct-project-mismatch');
    expect(offers).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Ask again in a new conversation in ONC-221' })).toBeTruthy();
  });

  it('starts a new conversation and asks the same question again in it', () => {
    chatMessages.current = refused('THREAD_PROJECT_MISMATCH');
    render(<ConversationThread {...OWNED_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask again in a new conversation in ONC-221' }));
    // The existing New conversation path first, then the person's own question.
    expect(calls).toEqual(['reset', `send:${QUESTION}`]);
    expect(chatSend).toHaveBeenCalledWith(QUESTION, [{ id: 'f1', name: 'CSR-001.pdf', fileId: 'file-1' }]);
  });

  it('is not offered while AnA is answering', () => {
    chatStreaming.current = true;
    chatMessages.current = refused('THREAD_PROJECT_MISMATCH');
    render(<ConversationThread {...OWNED_PROPS} />);
    const btn = screen.getByRole('button', { name: 'Ask again in a new conversation in ONC-221' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(chatReset).not.toHaveBeenCalled();
    expect(chatSend).not.toHaveBeenCalled();
  });

  it.each([['another refusal', 'THREAD_FORBIDDEN'], ['no code', undefined]])('offers nothing for %s', (_label, code) => {
    chatMessages.current = refused(code);
    render(<ConversationThread {...OWNED_PROPS} />);
    expect(screen.queryByTestId('ct-project-mismatch')).toBeNull();
    expect(screen.queryByRole('button', { name: /new conversation in/i })).toBeNull();
  });
});
