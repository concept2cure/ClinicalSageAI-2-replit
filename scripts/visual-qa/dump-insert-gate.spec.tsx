// @vitest-environment jsdom
/**
 * Capture the refused "Insert as tracked suggestion" offers, so the visual-QA
 * gates can measure them.
 *
 * ── Why this state needs its own capture ─────────────────────────────────────
 * `dump-v2-surfaces.spec.tsx` mounts each surface through its registry entry
 * with no conversation in it, so the conversation's AnA turns — and the offer
 * under each one — are never in the captured markup. The refused offer is
 * therefore a state no visual gate has ever seen, and in production it is not
 * an edge case: until a model passes performance qualification, RULE 2 refuses
 * every answer, so the dimmed control and its reason are what a person sees
 * under EVERY turn (client/src/concept2cure/v2/editor/anaInsertGate.ts).
 *
 * ── Why a string test was not enough ─────────────────────────────────────────
 * Round 13 raised the reason from 11.5px/--text-400 to 12px/--text-300 to clear
 * 4.5:1, and pinned it with `expect(reason.style.color).toBe('var(--text-300)')`.
 * That assertion restates the implementation: it passes for any token, including
 * one that fails contrast, and it cannot see the generated text ramp
 * (styles/surface-text-ramp.css), which re-bases these very tokens per surface.
 * Only a real cascade in a real browser can fail on a real regression, which is
 * what `check-contrast.mjs` does with what this file writes.
 *
 * The markup is serialized from jsdom, which has no layout engine — that is the
 * division of labour the other capture specs use: jsdom produces the DOM, the
 * browser the checks launch supplies the cascade and the layout.
 *
 * The pane's half of the same control is captured by `dump-insert-gate-pane`,
 * which cannot share a file with this one: this spec mocks `useAnaChat`, and
 * the pane's capture needs the real hook driving a streamed turn.
 */
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const emptyRects = function () { return [] as unknown as DOMRectList; };
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import type { AnaChatMessage } from '@/concept2cure/components/ana/useAnaChat';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
vi.mock('@/concept2cure/v2/surfaces/AuthoringPlaceIntoFiling', () => ({
  AuthoringPlaceIntoFiling: () => <button type="button">Place into filing</button>,
}));
const chatMessages: { current: AnaChatMessage[] } = { current: [] };
vi.mock('@/concept2cure/components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: chatMessages.current,
    isStreaming: false,
    isLoadingThread: false,
    loadThread: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    threadId: 'thread-1',
  }),
}));

import { ConversationThread } from '@/concept2cure/v2/surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '@/concept2cure/v2/surfaceViews';

const OUT = path.resolve(__dirname, '../../.visual-qa/markup');

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};
const DOC = 'aaaaaaaa-0000-4000-8000-000000000013';
const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;
const SHA = 'a'.repeat(64);
/* Outside production RULE 2 admits a PQ-pending approved model, so one offer is
   enabled: a capture of refusals alone could not show the two side by side. */
const OPUS = { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'pending' };
const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5', qualified: false, approvedForHighRisk: false, pq: 'pending' };

const USER = { id: 'u1', role: 'user', text: 'Draft the overview.' } as AnaChatMessage;
const DRAFTED = {
  id: 'd1',
  role: 'assistant',
  text: 'I drafted the overview into the project.',
  generatedDraft: { title: 'Module 2.5 Clinical Overview', content: '', documentType: 'clinical_overview', authoringDocId: DOC },
} as AnaChatMessage;
const answer = (id: string, text: string, over: Partial<AnaChatMessage>) => ({ id, role: 'assistant', text, ...over }) as AnaChatMessage;

/** Every refusal the gate can print, beside one answer it admits. */
const TURNS = [
  answer('ok1', 'Exposure was dose-proportional from 10 to 300 mg.', {
    turnRecord: { status: 'recorded', id: 'rec-1', sha256: SHA, servedBy: [OPUS] } as AnaChatMessage['turnRecord'],
  }),
  answer('h1', 'From a reopened conversation, so this view was never told which model wrote it.', {}),
  answer('h2', 'This turn’s record is not confirmed yet.', { turnRecord: { status: 'unconfirmed' } }),
  answer('h3', 'This turn was never recorded.', { turnRecord: { status: 'not_recorded', reason: 'The record store was unavailable.' } }),
  answer('h4', 'Written by a model the governed-write rule does not admit.', {
    turnRecord: { status: 'recorded', id: 'rec-4', sha256: SHA, servedBy: [SONNET] } as AnaChatMessage['turnRecord'],
  }),
  answer('h5', 'This answer did not finish: the stream failed part way through.', {
    interrupted: true,
    turnRecord: { status: 'recorded', id: 'rec-5', sha256: SHA, servedBy: [OPUS] } as AnaChatMessage['turnRecord'],
  }),
];

describe('capture: the conversation’s insert offers', () => {
  it('writes one admitted offer and every refusal the gate can print', async () => {
    (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'thread-1' };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === `/api/authoring/docs/${DOC}`) {
        return ok({ success: true, document: { id: DOC, title: 'Module 2.5 Clinical Overview', module: 'M2', product_code: null, status: 'DRAFT', updated_at: null, section_count: 1 } });
      }
      if (method === 'GET' && url === `/api/authoring/docs/${DOC}/sections`) {
        return ok({ success: true, sections: [{ id: 'S1', doc_id: DOC, code: '2.5.1', title: 'Product Development Rationale', content: '<p>From the record.</p>', order_index: 0 }] });
      }
      return ok({ success: true });
    });
    chatMessages.current = [USER, DRAFTED, ...TURNS];
    const { container } = render(<ConversationThread {...PROPS} />);

    /* The offer is drawn only with a document open beside the conversation, so
       the capture opens the editor and closes it again: closed is the state in
       which every turn's offer is on screen at once. */
    const open = await screen.findByTestId('dc-open-editor');
    await vi.waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    open.click();
    await screen.findByTestId('dc-expanded');
    await screen.findAllByRole('button', { name: 'Insert into 2.5.1 as tracked suggestion' }, { timeout: 8000 });
    (await screen.findByTestId('dc-open-editor')).click();
    const offers = await screen.findAllByRole('button', { name: 'Open 2.5.1 and insert as tracked suggestion' }, { timeout: 8000 });

    /* A capture of a state that did not actually arise would be measured, pass,
       and mean nothing: assert the shape before writing it. */
    expect(offers).toHaveLength(TURNS.length);
    expect(offers.filter((b) => (b as HTMLButtonElement).disabled)).toHaveLength(TURNS.length - 1);
    expect(container.querySelectorAll('[id^="ct-insert-refusal"]')).toHaveLength(TURNS.length - 1);

    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'gate__conversation-insert-refusals.html'), container.innerHTML, 'utf8');
    delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  }, 120000);
});
