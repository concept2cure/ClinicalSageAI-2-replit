// @vitest-environment jsdom
/**
 * The document opens on the right while AnA builds it.
 *
 * docs/design/ONE_ANA_ONE_CANVAS.md, slice 1. The founder, 2026-10-07: "when I
 * want to use AnA, just like I use Claude, I want to have a canvas on the
 * right-hand side, and I want to see the documents being built". Until now a
 * document AnA drafted appeared as a card in the thread, and the editor opened
 * beside the conversation only after "Open full editor" was clicked.
 *
 * The rules pinned here:
 *  - a turn being streamed that names an authoring document opens it beside the
 *    conversation, with no click;
 *  - a conversation reopened from history opens nothing by itself;
 *  - at 1100px or narrower (where the editor would hide the conversation) it is
 *    offered, not opened;
 *  - it never takes the pane from a document the person has open: offered;
 *  - closed by the person, it stays closed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/* jsdom has no layout; the canvas's editor asks ProseMirror to scroll, which
   asks for rects (the same stand-in documentCanvasLive.test.tsx uses). */
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
const chatSend = vi.hoisted(() => vi.fn());
const chatStreaming = { current: false };
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: chatMessages.current,
    isStreaming: chatStreaming.current,
    isLoadingThread: false,
    loadThread: vi.fn().mockResolvedValue(undefined),
    send: chatSend,
    threadId: 'thread-1',
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const OWNED_PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};

const DOC = 'aaaaaaaa-0000-4000-8000-000000000002';
const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

const USER: AnaChatMessage = { id: 'm1', role: 'user', text: 'Draft the **Module 2.5** excerpt.' } as AnaChatMessage;

const DRAFTED: AnaChatMessage = {
  id: 'm2',
  role: 'assistant',
  text: '## Drafted\n\nI drafted **three sections** into the project:\n\n- 2.5.1 Rationale\n- 2.5.2 Biopharmaceutics\n- 2.5.3 Clinical pharmacology\n\n<script>window.pwned = 1</script>',
  generatedDraft: { title: 'Module 2.5 Clinical Overview — C2C-101', content: '', documentType: 'clinical_overview', authoringDocId: DOC, programId: PID },
} as AnaChatMessage;




const DOC_B = 'bbbbbbbb-0000-4000-8000-000000000003';
const DRAFTED_B: AnaChatMessage = {
  id: 'm5', role: 'assistant', text: 'A second document.',
  generatedDraft: { title: 'Module 2.7 Summary', content: '', documentType: 'clinical_summary', authoringDocId: DOC_B, programId: PID },
} as AnaChatMessage;

let narrow = false;
beforeEach(() => {
  narrow = false;
  window.matchMedia = ((query: string) => ({
    matches: narrow && /max-width:\s*1100px/.test(query), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'thread-1' };
  chatStreaming.current = false;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    for (const [id, title] of [[DOC, 'Module 2.5 Clinical Overview — C2C-101'], [DOC_B, 'Module 2.7 Summary']] as const) {
      if (method === 'GET' && url === `/api/authoring/docs/${id}`) {
        return ok({ success: true, document: { id, title, module: 'M2', product_code: null, status: 'DRAFT', updated_at: null, section_count: 1, provenance: { source: 'ana', model: 'claude-fable-5-1', conversationId: 'thread-1' } } });
      }
      if (method === 'GET' && url === `/api/authoring/docs/${id}/sections`) {
        return ok({ success: true, sections: [{ id: `S-${id}`, doc_id: id, code: '2.5.1', title: 'Rationale', content: '<p>From the record.</p>', order_index: 0 }] });
      }
    }
    if (method === 'GET' && url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'C2C-101', phase: 'planning' });
    return ok({ success: true });
  });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

const pane = () => screen.getByTestId('ct-canvas-pane');
const expandedIds = () =>
  screen.queryAllByTestId('document-canvas').filter((c) => c.getAttribute('data-expanded') === 'true').map((c) => c.getAttribute('data-doc-id'));

describe('The canvas opens while AnA builds', () => {
  it('a document named by the turn being written opens beside the conversation, with no click', async () => {
    chatStreaming.current = true;
    chatMessages.current = [USER, DRAFTED];
    render(<ConversationThread {...OWNED_PROPS} />);
    await waitFor(() => expect(pane().hidden).toBe(false));
    expect(expandedIds()).toEqual([DOC]);
  });

  it('a conversation reopened from history opens nothing by itself', async () => {
    chatStreaming.current = false;
    chatMessages.current = [USER, DRAFTED];
    render(<ConversationThread {...OWNED_PROPS} />);
    await screen.findByTestId('document-canvas');
    expect(pane().hidden).toBe(true);
    expect(screen.queryByTestId('ct-ready-doc-open')).toBeNull();
  });

  it('at 1100px or narrower it is offered, not opened over the conversation', async () => {
    narrow = true;
    chatStreaming.current = true;
    chatMessages.current = [USER, DRAFTED];
    render(<ConversationThread {...OWNED_PROPS} />);
    const open = await screen.findByTestId('ct-ready-doc-open');
    expect(pane().hidden).toBe(true);
    fireEvent.click(open);
    await waitFor(() => expect(pane().hidden).toBe(false));
  });

  it('never takes the pane from a document the person has open', async () => {
    chatStreaming.current = false;
    chatMessages.current = [USER, DRAFTED];
    const { rerender } = render(<ConversationThread {...OWNED_PROPS} />);
    fireEvent.click(await screen.findByTestId('dc-open-editor'));
    await waitFor(() => expect(expandedIds()).toEqual([DOC]));
    chatStreaming.current = true;
    chatMessages.current = [USER, DRAFTED, { id: 'u2', role: 'user', text: 'And 2.7.' } as AnaChatMessage, DRAFTED_B];
    rerender(<ConversationThread {...OWNED_PROPS} />);
    expect(await screen.findByTestId('ct-ready-doc-open')).toBeTruthy();
    expect(expandedIds()).toEqual([DOC]);
  });

  it('closed by the person, it stays closed', async () => {
    chatStreaming.current = true;
    chatMessages.current = [USER, DRAFTED];
    const { rerender } = render(<ConversationThread {...OWNED_PROPS} />);
    await waitFor(() => expect(pane().hidden).toBe(false));
    fireEvent.click(await screen.findByTestId('dc-open-editor'));
    await waitFor(() => expect(pane().hidden).toBe(true));
    rerender(<ConversationThread {...OWNED_PROPS} />);
    expect(pane().hidden).toBe(true);
  });
});
