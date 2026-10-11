// @vitest-environment jsdom
/**
 * The conversation's refused inserts, each with its own reason (AnA reasoning
 * round 13, answering round 11's UI review, 2026-10-05).
 *
 * Round 11 disabled "Insert into <section> as tracked suggestion" for an
 * answer the governed-write rule does not admit, with its reason as visible
 * text the button is described by (GE-P-3). The review found three defects:
 *   - every turn without a recorded id shared one element id, so a reopened
 *     conversation's buttons were all described by the FIRST turn's reason;
 *   - an answer that did not finish (a stop, a failed stream) was offered as
 *     one that did;
 *   - the refused button kept the live look and hover of an enabled one, and
 *     its reason sat at the bare minimum contrast.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const emptyRects = function () { return [] as unknown as DOMRectList; };
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import type { AnaChatMessage } from '../../components/ana/useAnaChat';
import { anaInsertRefusal } from '../editor/anaInsertGate';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
vi.mock('../surfaces/AuthoringPlaceIntoFiling', () => ({
  AuthoringPlaceIntoFiling: () => <button type="button">Place into filing</button>,
}));
const chatMessages: { current: AnaChatMessage[] } = { current: [] };
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: chatMessages.current,
    isStreaming: false,
    isLoadingThread: false,
    loadThread: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    threadId: 'thread-1',
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};
const DOC = 'aaaaaaaa-0000-4000-8000-000000000013';
const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;
const OPUS = { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'pending' };
const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5', qualified: false, approvedForHighRisk: false, pq: 'pending' };
const SHA = 'a'.repeat(64);

const USER = { id: 'u1', role: 'user', text: 'Draft the overview.' } as AnaChatMessage;
const DRAFTED = {
  id: 'd1',
  role: 'assistant',
  text: 'I drafted the overview into the project.',
  generatedDraft: { title: 'Module 2.5 Clinical Overview', content: '', documentType: 'clinical_overview', authoringDocId: DOC },
} as AnaChatMessage;
const answer = (id: string, text: string, over: Partial<AnaChatMessage>) => ({ id, role: 'assistant', text, ...over }) as AnaChatMessage;

beforeEach(() => {
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'thread-1' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === `/api/authoring/docs/${DOC}`) {
      return ok({ success: true, document: { id: DOC, title: 'Module 2.5 Clinical Overview', module: 'M2', product_code: null, status: 'DRAFT', updated_at: null, section_count: 1 } });
    }
    if (method === 'GET' && url === `/api/authoring/docs/${DOC}/sections`) {
      return ok({ success: true, sections: [{ id: 'S1', doc_id: DOC, code: '2.5.1', title: 'Product Development Rationale', content: '<p>From the record.</p>', order_index: 0 }] });
    }
    return ok({ success: true });
  });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

/** Render the conversation with the drafted document open beside it; its insert offers, in turn order. */
async function offers(): Promise<HTMLButtonElement[]> {
  render(<ConversationThread {...PROPS} />);
  const open = await screen.findByTestId('dc-open-editor');
  await vi.waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
  open.click();
  await screen.findByTestId('dc-expanded');
  await screen.findAllByRole('button', { name: 'Insert into 2.5.1 as tracked suggestion' }, { timeout: 4000 });
  return screen.getAllByRole('button', { name: 'Insert into 2.5.1 as tracked suggestion' }) as HTMLButtonElement[];
}
const reasonOf = (el: HTMLElement) => document.getElementById(el.getAttribute('aria-describedby') ?? '');

describe('the conversation’s refused inserts', () => {
  it('each refused offer is described by its own reason: one element id per offer', async () => {
    const turns = [
      answer('h1', 'From a reopened conversation.', {}),
      answer('h2', 'Not confirmed.', { turnRecord: { status: 'unconfirmed' } }),
      answer('h3', 'Not recorded.', { turnRecord: { status: 'not_recorded', reason: 'The store was unavailable.' } }),
      answer('h4', 'Written by Sonnet.', { turnRecord: { status: 'recorded', id: 'rec-4', sha256: SHA, servedBy: [SONNET] } as AnaChatMessage['turnRecord'] }),
    ];
    chatMessages.current = [USER, DRAFTED, ...turns];
    const buttons = await offers();
    expect(buttons).toHaveLength(4);
    const ids = buttons.map((b) => b.getAttribute('aria-describedby'));
    expect(new Set(ids).size).toBe(4);
    expect(document.querySelectorAll('[id^="ct-insert-refusal"]')).toHaveLength(4);
    buttons.forEach((b, i) => {
      expect(b.disabled).toBe(true);
      expect(reasonOf(b)?.textContent).toBe(anaInsertRefusal(turns[i].turnRecord));
    });
  });

  it('an answer that did not finish is refused, whoever wrote it', async () => {
    chatMessages.current = [
      USER,
      DRAFTED,
      answer('i1', 'AnA is unreachable — the network or the AI gateway did not respond.', {
        interrupted: true,
        turnRecord: { status: 'recorded', id: 'rec-5', sha256: SHA, servedBy: [OPUS] } as AnaChatMessage['turnRecord'],
      }),
    ];
    const [insert] = await offers();
    expect(insert.disabled).toBe(true);
    expect(reasonOf(insert)?.textContent).toBe('This answer did not finish, so it can’t be inserted. Ask again to get a new answer.');
  });

  it('the reason reads at the repo’s own contrast for why a control is off, and the button looks off', async () => {
    chatMessages.current = [USER, DRAFTED, answer('s1', 'Written by Sonnet.', { turnRecord: { status: 'recorded', id: 'rec-6', sha256: SHA, servedBy: [SONNET] } as AnaChatMessage['turnRecord'] })];
    const [insert] = await offers();
    const reason = reasonOf(insert) as HTMLElement;
    expect([reason.style.color, reason.style.fontSize]).toEqual(['var(--text-300)', '12px']);
    const css = fs.readFileSync(path.resolve(__dirname, '../styles/app-v2.css'), 'utf8');
    expect(css).toMatch(/\.c2c-v2 \.ct-ref:disabled\{[^}]*cursor:not-allowed/);
    expect(css).toMatch(/\.c2c-v2 \.ct-ref:disabled:hover\{background:var\(--bg-050\);border-color:var\(--border\);color:var\(--text-200\);\}/);
  });
});
