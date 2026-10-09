// @vitest-environment jsdom
/**
 * ConversationThread — the document canvas beneath an AnA turn, and the
 * answer rendered as prose.
 *
 * ── The canvas ──────────────────────────────────────────────────────────────
 * A turn whose draft carries `authoringDocId` (the `draft_authoring_document`
 * tool wrote the document into the authoring store and the stream named it)
 * renders <DocumentCanvas> beneath the answer, read from the store — and is
 * NOT also a side-panel artifact card. A turn whose draft carries no id
 * keeps the side-panel card and gets no canvas. A rehydrated turn whose tool
 * trace names the document gets the canvas from the trace.
 *
 * ── Markdown ────────────────────────────────────────────────────────────────
 * The answer used to render as plain text under `.ct-ana-text`, so `##`,
 * `**` and `- ` reached the reader as symbols. It renders through AnaMarkdown
 * (marked → DOMPurify → React elements): a heading is a heading element, bold
 * is <strong>, a list is <ul>/<li>; a `<script>` in model text never reaches
 * the DOM; the person's own turn stays as typed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

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

import { ConversationThread, conversationArtifacts, authoringDocOf } from '../surfaces/ConversationThread';
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

const LEGACY_DRAFT: AnaChatMessage = {
  id: 'm3',
  role: 'assistant',
  text: 'Here is a draft.',
  generatedDraft: { title: 'A side-panel draft', content: '<p>body</p>', documentType: 'memo' },
} as AnaChatMessage;

const REHYDRATED: AnaChatMessage = {
  id: 'm4',
  role: 'assistant',
  text: 'Reopened turn.',
  toolCalls: [
    { name: 'draft_authoring_document', label: 'Drafting the document', status: 'success', result: JSON.stringify({ status: 'generated', authoringDocId: DOC, programId: PID, title: 'From the trace' }) },
  ],
} as AnaChatMessage;

beforeEach(() => {
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'thread-1' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === `/api/authoring/docs/${DOC}`) {
      return ok({ success: true, document: { id: DOC, title: 'Module 2.5 Clinical Overview — C2C-101', module: 'M2', product_code: null, status: 'DRAFT', updated_at: null, section_count: 1, provenance: { source: 'ana', model: 'claude-fable-5-1', conversationId: 'thread-1' } } });
    }
    if (method === 'GET' && url === `/api/authoring/docs/${DOC}/sections`) {
      return ok({ success: true, sections: [{ id: 'S1', doc_id: DOC, code: '2.5.1', title: 'Product Development Rationale', content: '<p>From the record.</p>', order_index: 0 }] });
    }
    if (method === 'GET' && url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'C2C-101', phase: 'planning' });
    return ok({ success: true });
  });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

describe('ConversationThread — the document canvas', () => {
  it('mounts DocumentCanvas beneath a turn whose draft carries authoringDocId, read from the store', async () => {
    chatMessages.current = [USER, DRAFTED];
    render(<ConversationThread {...OWNED_PROPS} />);
    const canvas = await screen.findByTestId('document-canvas');
    expect(canvas.getAttribute('data-doc-id')).toBe(DOC);
    // The record, not the stream: the section came from GET /sections.
    expect(await within(canvas).findByText('From the record.')).toBeTruthy();
    expect(within(canvas).getByText('Product Development Rationale')).toBeTruthy();
    expect(screen.getByTestId('dc-provenance').textContent).toBe('Drafted by AnA in this conversation · model claude-fable-5-1');
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/authoring/docs/${DOC}`);
    // The canvas's actions are reachable in the thread.
    expect(screen.getByTestId('dc-open-editor')).toBeTruthy();
    expect(screen.getByTestId('dc-file-to-vault')).toBeTruthy();
    expect(screen.getByTestId('dc-assign-review')).toBeTruthy();
  });

  it('keeps a document-backed draft OUT of the side-panel artifact list, and a legacy draft IN it', () => {
    const arts = conversationArtifacts([USER, DRAFTED, LEGACY_DRAFT]);
    expect(arts.map(a => a.title)).toEqual(['A side-panel draft']);
  });

  it('a turn without a document gets no canvas', async () => {
    chatMessages.current = [USER, LEGACY_DRAFT];
    render(<ConversationThread {...OWNED_PROPS} />);
    await screen.findByText('Here is a draft.');
    expect(screen.queryByTestId('document-canvas')).toBeNull();
  });

  it('finds the document in a rehydrated turn’s tool trace, and never in prose', () => {
    expect(authoringDocOf(REHYDRATED)).toEqual({ docId: DOC, programId: PID, title: 'From the trace' });
    expect(authoringDocOf({ id: 'x', role: 'assistant', text: `authoringDocId ${DOC}` } as AnaChatMessage)).toBeNull();
    expect(authoringDocOf({ id: 'y', role: 'assistant', text: '', toolCalls: [{ name: 'draft_authoring_document', label: 'l', status: 'success', result: 'not json' }] } as AnaChatMessage)).toBeNull();
  });

  it('hides the side column while a canvas is expanded, and Open full editor mounts the one workbench in place', async () => {
    chatMessages.current = [USER, DRAFTED];
    render(<ConversationThread {...OWNED_PROPS} />);
    await screen.findByTestId('document-canvas');
    expect(document.querySelector('.ct-side')).not.toBeNull();
    const open = await screen.findByTestId('dc-open-editor');
    await vi.waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    open.click();
    await screen.findByTestId('dc-expanded');
    await vi.waitFor(() => expect(document.querySelector('.ct-wrap')?.getAttribute('data-canvas-expanded')).toBe('true'));
    expect(document.querySelector('.ct-side')).toBeNull();
    expect(document.querySelector('.dcv-workbench .ed')).not.toBeNull();
    // The composer is still there, below.
    expect(screen.getByLabelText('Reply to AnA')).toBeTruthy();
  });
});

describe('ConversationThread — the answer as prose', () => {
  it('renders a heading, bold and a list as elements, not symbols; user text stays as typed', async () => {
    chatMessages.current = [USER, DRAFTED];
    render(<ConversationThread {...OWNED_PROPS} />);
    const answer = await vi.waitFor(() => {
      const el = document.querySelector('.ct-ana-text.ana-md');
      if (!el) throw new Error('answer not rendered');
      return el;
    });
    // `## Drafted` demotes to an h4 inside the turn (the thread's own header is the page level).
    expect(answer.querySelector('h4')?.textContent).toBe('Drafted');
    expect(answer.querySelector('strong')?.textContent).toBe('three sections');
    expect(answer.querySelectorAll('ul > li').length).toBe(3);
    expect(answer.textContent).not.toContain('##');
    expect(answer.textContent).not.toContain('**');
    // The user's own words are not rewritten.
    expect(document.querySelector('.ct-user-b')?.textContent).toBe('Draft the **Module 2.5** excerpt.');
  });

  it('a <script> in model text never reaches the DOM', async () => {
    chatMessages.current = [USER, DRAFTED];
    render(<ConversationThread {...OWNED_PROPS} />);
    await vi.waitFor(() => expect(document.querySelector('.ct-ana-text.ana-md')).not.toBeNull());
    expect(document.querySelector('script')).toBeNull();
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
    expect(document.querySelector('.ct-ana-text')?.innerHTML).not.toContain('<script');
  });
});
