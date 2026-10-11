// @vitest-environment jsdom
/**
 * The canvas's Documents list (docs/design/ONE_ANA_ONE_CANVAS.md §4.1, §4.3;
 * slice 12 and the client half of slice 11).
 *
 * The founder, 2026-10-07: "I want to see the documents being built, and I
 * want to be able to pull them down and see them and work with them". A
 * conversation reopened from history used to find its documents only in a
 * capped copy of a tool result in the step trace, which had cut the id off:
 * the reopened conversation showed no document at all
 * (docs/evidence/D2-ONE-ANA/2026-10-08/ana-1-canvas-opens/, finding 1).
 *
 * The server now lists the documents a conversation built (GET
 * /api/authoring/docs?conversationId=…, and ?programId=…&source=ana for the
 * project). Pinned here:
 *  - with nothing open, the right column lists them, read from the server, so
 *    the list survives a reload with no card in the transcript;
 *  - each row says title, status in words, sections and updated time, and
 *    offers Open (the one editor, beside the conversation) and "Download
 *    working copy";
 *  - an open document reaches the list from its bar ("← Documents (n)");
 *  - "This conversation · This project";
 *  - honest states: an error with a retry is never an empty list; empty is
 *    said in words;
 *  - at 1100px and narrower it never takes the screen by itself, and closing a
 *    document it opened ("Back to conversation", Escape, an ask from the
 *    editor) shows the conversation, not the list;
 *  - by itself it never hides the side column's drafts that are not in it
 *    (type B) or a turn still running;
 *  - the count beside "Documents" is of the list it opens;
 *  - a document it opened says its status in the editor's bar.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

/* jsdom has no layout; the editor asks ProseMirror to scroll, which asks for
   rects (the same stand-in canvasAutoOpen.test.tsx uses). */
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
const chatStreaming = { current: false };
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: chatMessages.current,
    isStreaming: chatStreaming.current,
    isLoadingThread: false,
    loadThread: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    reset: vi.fn(),
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

const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const DOC_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const DOC_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const DOC_C = 'cccccccc-0000-4000-8000-00000000000c';
const row = (id: string, title: string, status: string, sections: number, conversation: string) => ({
  id, title, module: 'M2', product_code: null, status, created_at: '2026-10-08T09:00:00Z', updated_at: '2026-10-07T10:42:00Z',
  provenance_source: 'ana', conversation_id: conversation, program_id: PID, section_count: String(sections), total_content_length: '900',
});
const A = row(DOC_A, 'Clinical Overview', 'DRAFT', 4, 'thread-1');
const B = row(DOC_B, 'Nonclinical Overview', 'IN_REVIEW', 6, 'thread-1');
const C = row(DOC_C, 'Quality Overall Summary', 'FROZEN', 3, 'thread-0');
const CONVERSATION_URL = '/api/authoring/docs?conversationId=thread-1';
const PROJECT_URL = `/api/authoring/docs?programId=${PID}&source=ana`;

const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

/* A conversation reopened from history: the question and AnA's answer, and no
   trace naming the document (the capped trace had cut the id off). */
const REOPENED: AnaChatMessage[] = [
  { id: 'm1', role: 'user', text: 'Draft the 2.5 Clinical Overview.' } as AnaChatMessage,
  { id: 'm2', role: 'assistant', text: 'I drafted the Clinical Overview.' } as AnaChatMessage,
];

let conversationRows: unknown[] | (() => unknown);
let narrow = false;
beforeEach(() => {
  narrow = false;
  window.matchMedia = ((query: string) => ({
    matches: narrow && /max-width:\s*1100px/.test(query), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'thread-1' };
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'ONC-221' };
  chatStreaming.current = false;
  chatMessages.current = REOPENED;
  try { localStorage.removeItem('c2c-v2-ana-work-dock'); } catch { /* none */ }
  conversationRows = [A, B];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === CONVERSATION_URL) {
      if (typeof conversationRows === 'function') return conversationRows();
      return ok({ success: true, documents: conversationRows, count: conversationRows.length });
    }
    if (method === 'GET' && url === PROJECT_URL) return ok({ success: true, documents: [A, B, C], count: 3 });
    for (const d of [A, B, C]) {
      if (method === 'GET' && url === `/api/authoring/docs/${d.id}`) {
        return ok({ success: true, document: { ...d, provenance: { source: 'ana', conversationId: d.conversation_id } } });
      }
      if (method === 'GET' && url === `/api/authoring/docs/${d.id}/sections`) {
        return ok({ success: true, sections: [{ id: `S-${d.id}`, doc_id: d.id, code: '2.5.1', title: 'Rationale', content: '<p>From the record.</p>', order_index: 0 }] });
      }
    }
    if (method === 'POST' && url === `/api/authoring/docs/${DOC_A}/working-copy`) {
      return { ok: true, status: 200, headers: new Headers(), blob: async () => new Blob(['%PDF']), json: async () => null } as unknown as Response;
    }
    if (method === 'GET' && url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'ONC-221', phase: 'planning' });
    return ok({ success: true });
  });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

const pane = () => screen.getByTestId('ct-canvas-pane');
const list = () => screen.getByTestId('ct-documents');
const rows = () => within(list()).getAllByTestId('cdl-row');
const gets = (url: string) => apiRequest.mock.calls.filter((c) => c[0] === 'GET' && c[1] === url);

describe('The canvas lists the documents this conversation built, from the server', () => {
  it('reopened with no card in the transcript, the right column lists them, read by conversation id', async () => {
    render(<ConversationThread {...OWNED_PROPS} />);
    await screen.findByTestId('ct-documents');
    expect(pane().hidden).toBe(false);
    expect(pane().getAttribute('data-state')).toBe('list');
    expect(pane().contains(list())).toBe(true);
    expect(gets(CONVERSATION_URL).length).toBeGreaterThan(0);
    // No document card in the transcript: the list did not come from the trace.
    expect(screen.queryByTestId('document-canvas')).toBeNull();
    const [first, second] = rows();
    expect(within(first).getByText('Clinical Overview')).toBeTruthy();
    expect(within(first).getByTestId('cdl-status').textContent).toBe('Draft');
    expect(first.textContent).toContain('4 sections');
    expect(first.textContent).toContain('Module 2');
    expect(first.textContent).toContain('Built by AnA');
    expect(first.querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-07T10:42:00Z');
    expect(within(second).getByTestId('cdl-status').textContent).toBe('In review');
    // One right-hand column: the progress column is not drawn beside the list.
    expect(document.querySelector('.ct-side')).toBeNull();
  });

  it('Open puts the document in the one editor, beside the conversation', async () => {
    render(<ConversationThread {...OWNED_PROPS} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Clinical Overview' }));
    await waitFor(() => expect(pane().getAttribute('data-state')).toBe('open'));
    expect(screen.queryByTestId('ct-documents')).toBeNull();
    const canvas = screen.getAllByTestId('document-canvas').find((c) => c.getAttribute('data-doc-id') === DOC_A)!;
    expect(canvas.getAttribute('data-expanded')).toBe('true');
    const region = await screen.findByTestId('dc-expanded');
    expect(pane().contains(region)).toBe(true);
    expect(region.hidden).toBe(false);
    expect(gets(`/api/authoring/docs/${DOC_A}`).length).toBeGreaterThan(0);
  });

  it('a document whose card is in the transcript opens through that card: no second editor', async () => {
    chatMessages.current = [
      REOPENED[0],
      {
        id: 'm2', role: 'assistant', text: 'I drafted the Clinical Overview.',
        generatedDraft: { title: 'Clinical Overview', content: '', documentType: 'clinical_overview', authoringDocId: DOC_A, programId: PID },
      } as AnaChatMessage,
    ];
    render(<ConversationThread {...OWNED_PROPS} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Clinical Overview' }));
    await waitFor(() => expect(pane().getAttribute('data-state')).toBe('open'));
    const canvases = screen.getAllByTestId('document-canvas').filter((c) => c.getAttribute('data-doc-id') === DOC_A);
    expect(canvases).toHaveLength(1);
    expect(canvases[0].getAttribute('data-expanded')).toBe('true');
    expect(screen.getAllByTestId('dc-expanded')).toHaveLength(1);
  });

  it('an open document reaches the list from its bar, "← Documents (2)", and focus lands on the list', async () => {
    render(<ConversationThread {...OWNED_PROPS} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Clinical Overview' }));
    const back = await screen.findByTestId('dc-documents');
    expect(back.textContent).toContain('Documents (2)');
    fireEvent.click(back);
    await screen.findByTestId('ct-documents');
    expect(pane().getAttribute('data-state')).toBe('list');
    await waitFor(() => expect(document.activeElement?.textContent).toContain('Documents'));
    expect(document.activeElement?.tagName).toBe('H2');
  });

  it('closing a document the list opened hands focus back to its row', async () => {
    render(<ConversationThread {...OWNED_PROPS} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Clinical Overview' }));
    fireEvent.click(await screen.findByTestId('dc-back'));
    await screen.findByTestId('ct-documents');
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Open Clinical Overview'));
  });

  it('"This project" lists what AnA built in the open project', async () => {
    render(<ConversationThread {...OWNED_PROPS} />);
    await screen.findByTestId('ct-documents');
    const projectScope = screen.getByRole('button', { name: 'This project' });
    expect(screen.getByRole('button', { name: 'This conversation' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(projectScope);
    await waitFor(() => expect(within(list()).getByText('Quality Overall Summary')).toBeTruthy());
    expect(projectScope.getAttribute('aria-pressed')).toBe('true');
    expect(gets(PROJECT_URL).length).toBeGreaterThan(0);
    expect(list().textContent).toContain('Built by AnA in ONC-221');
    expect(rows()).toHaveLength(3);
    const frozen = rows().find((r) => r.textContent?.includes('Quality Overall Summary'))!;
    expect(within(frozen).getByTestId('cdl-status').textContent).toBe('Frozen');
  });

  it('a row offers "Download working copy", with working copies only, marked as uncontrolled', async () => {
    render(<ConversationThread {...OWNED_PROPS} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download working copy of Clinical Overview' }));
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem').map((m) => m.getAttribute('aria-label'));
    expect(items).toEqual(['Working copy (Word)', 'Working copy (PDF)']);
    expect(menu.textContent).toContain('Marked DRAFT — uncontrolled copy');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Working copy (PDF)' }));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === `/api/authoring/docs/${DOC_A}/working-copy`);
      expect(call?.[2]).toEqual({ format: 'pdf' });
    });
  });
});

describe('Honest states', () => {
  it('a failed read is an error with a retry, never an empty list', async () => {
    let calls = 0;
    conversationRows = () => {
      calls += 1;
      if (calls === 1) throw new ApiRequestError('The authoring store is unavailable right now', 503);
      return ok({ success: true, documents: [A], count: 1 });
    };
    render(<ConversationThread {...OWNED_PROPS} />);
    // An unread count never opens the list by itself; the header asks for it.
    const toggle = await screen.findByTestId('ct-documents-toggle');
    await waitFor(() => expect(calls).toBe(1));
    expect(pane().hidden).toBe(true);
    fireEvent.click(toggle);
    const alert = await within(list()).findByRole('alert');
    expect(alert.textContent).toContain('Couldn’t list the documents');
    expect(alert.textContent).toContain('The authoring store is unavailable right now');
    expect(screen.queryByTestId('cdl-empty')).toBeNull();
    fireEvent.click(within(alert).getByRole('button', { name: /Try again/ }));
    await waitFor(() => expect(rows()).toHaveLength(1));
  });

  it('a document the list opened whose record does not read says so beside the conversation, with a retry', async () => {
    const base = apiRequest.getMockImplementation()!;
    let docReads = 0;
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === 'GET' && url === `/api/authoring/docs/${DOC_B}`) {
        docReads += 1;
        if (docReads === 1) return ok({ success: false, message: 'The authoring store is unavailable right now.' }, 503);
      }
      return base(method, url, body);
    });
    render(<ConversationThread {...OWNED_PROPS} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Nonclinical Overview' }));
    const region = await screen.findByTestId('dc-expanded');
    expect(pane().contains(region)).toBe(true);
    const failed = await within(region).findByTestId('dc-error');
    expect(failed.textContent).toContain('Couldn’t read this document');
    expect(failed.textContent).toContain('The authoring store is unavailable right now.');
    // The way back is on screen while the read has failed.
    expect(within(region).getByTestId('dc-documents').textContent).toContain('Documents (2)');
    fireEvent.click(within(failed).getByRole('button', { name: /Try again/ }));
    await waitFor(() => expect(within(region).queryByTestId('dc-error')).toBeNull());
    expect(docReads).toBe(2);
  });

  it('empty is said in words, and the column stays closed until asked', async () => {
    conversationRows = [];
    render(<ConversationThread {...OWNED_PROPS} />);
    const toggle = await screen.findByTestId('ct-documents-toggle');
    await waitFor(() => expect(gets(CONVERSATION_URL).length).toBeGreaterThan(0));
    expect(pane().hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect((await screen.findByTestId('cdl-empty')).textContent).toBe('No documents built in this conversation yet.');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe(pane().id);
  });

  it('at 1100px and narrower it never takes the screen by itself; the header opens it', async () => {
    narrow = true;
    render(<ConversationThread {...OWNED_PROPS} />);
    const toggle = await screen.findByTestId('ct-documents-toggle');
    await waitFor(() => expect(toggle.textContent).toContain('Documents (2)'));
    expect(pane().hidden).toBe(true);
    fireEvent.click(toggle);
    await screen.findByTestId('ct-documents');
    expect(pane().hidden).toBe(false);
  });

  it('closed by the person, it stays closed, and focus returns to the header control', async () => {
    const { rerender } = render(<ConversationThread {...OWNED_PROPS} />);
    await screen.findByTestId('ct-documents');
    fireEvent.click(screen.getByRole('button', { name: 'Close the documents list' }));
    expect(screen.queryByTestId('ct-documents')).toBeNull();
    expect(pane().hidden).toBe(true);
    expect(document.activeElement).toBe(screen.getByTestId('ct-documents-toggle'));
    rerender(<ConversationThread {...OWNED_PROPS} />);
    expect(screen.queryByTestId('ct-documents')).toBeNull();
  });

  it('is read again when an AnA turn ends', async () => {
    chatStreaming.current = true;
    const { rerender } = render(<ConversationThread {...OWNED_PROPS} />);
    await waitFor(() => expect(gets(CONVERSATION_URL).length).toBe(1));
    chatStreaming.current = false;
    rerender(<ConversationThread {...OWNED_PROPS} />);
    await waitFor(() => expect(gets(CONVERSATION_URL).length).toBe(2));
  });
});

describe('At 1100px and narrower, closing a document the list opened shows the conversation', () => {
  const openFromListNarrow = async () => {
    narrow = true;
    const utils = render(<ConversationThread {...OWNED_PROPS} />);
    const toggle = await screen.findByTestId('ct-documents-toggle');
    await waitFor(() => expect(toggle.textContent).toContain('Documents (2)'));
    fireEvent.click(toggle);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Clinical Overview' }));
    await waitFor(() => expect(pane().getAttribute('data-state')).toBe('open'));
    return utils;
  };
  const main = (container: HTMLElement) => container.querySelector('.ct-main') as HTMLElement;

  it('"Back to conversation" shows the conversation, and focus goes to the header\'s Documents', async () => {
    const { container } = await openFromListNarrow();
    const back = await screen.findByTestId('dc-back');
    expect(back.textContent).toContain('Back to conversation');
    fireEvent.click(back);
    await waitFor(() => expect(pane().getAttribute('data-state')).toBe('closed'));
    // `.ct-main[data-canvas-open] > .ct-conv { display: none }` at this width (authoring-v2.css).
    expect(main(container).getAttribute('data-canvas-open')).toBeNull();
    expect(screen.queryByTestId('ct-documents')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('ct-documents-toggle')));
    // "← Documents" remains the way to the list: the header opens it again.
    fireEvent.click(screen.getByTestId('ct-documents-toggle'));
    await screen.findByTestId('ct-documents');
  });

  it('Escape does the same', async () => {
    const { container } = await openFromListNarrow();
    await screen.findByTestId('dc-back');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(pane().getAttribute('data-state')).toBe('closed'));
    expect(main(container).getAttribute('data-canvas-open')).toBeNull();
  });

  it('an ask from the editor lands in the composer, on screen, not behind the list', async () => {
    const { container } = await openFromListNarrow();
    const region = await screen.findByTestId('dc-expanded');
    fireEvent.click(await within(region).findByRole('button', { name: /Draft with AnA/ }, { timeout: 4000 }));
    await waitFor(() => expect(pane().getAttribute('data-state')).toBe('closed'));
    expect(main(container).getAttribute('data-canvas-open')).toBeNull();
    const box = screen.getByRole('textbox', { name: 'Reply to AnA' }) as HTMLTextAreaElement;
    expect(box.value).not.toBe('');
    await waitFor(() => expect(document.activeElement).toBe(box));
  });

  it('beside the conversation (wider than 1100px), closing it still hands focus back to its row in the list', async () => {
    const { container } = render(<ConversationThread {...OWNED_PROPS} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Clinical Overview' }));
    fireEvent.click(await screen.findByTestId('dc-back'));
    await screen.findByTestId('ct-documents');
    expect(main(container).getAttribute('data-canvas-open')).toBe('true');
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Open Clinical Overview'));
  });
});

describe('By itself the list hides nothing the side column holds', () => {
  const TYPE_B: AnaChatMessage = {
    id: 'm3', role: 'assistant', text: 'Here is the statistical analysis plan.',
    generatedDraft: { title: 'Statistical Analysis Plan', content: '<p>Plan.</p>', documentType: 'statistical_analysis_plan' },
  } as unknown as AnaChatMessage;

  it('a draft that is not an authoring document keeps the side column on screen; the header still opens the list', async () => {
    chatMessages.current = [...REOPENED, TYPE_B];
    render(<ConversationThread {...OWNED_PROPS} />);
    const toggle = await screen.findByTestId('ct-documents-toggle');
    await waitFor(() => expect(toggle.textContent).toContain('Documents (2)'));
    expect(screen.queryByTestId('ct-documents')).toBeNull();
    const side = document.querySelector('.ct-side') as HTMLElement;
    expect(side).toBeTruthy();
    expect(side.textContent).toContain('Statistical Analysis Plan');
    fireEvent.click(toggle);
    await screen.findByTestId('ct-documents');
  });

  it('a turn still running keeps AnA\'s progress on screen; the list shows by itself once it ends', async () => {
    chatStreaming.current = true;
    const { rerender } = render(<ConversationThread {...OWNED_PROPS} />);
    const toggle = await screen.findByTestId('ct-documents-toggle');
    await waitFor(() => expect(toggle.textContent).toContain('Documents (2)'));
    expect(screen.queryByTestId('ct-documents')).toBeNull();
    expect(document.querySelector('.ct-side')).toBeTruthy();
    chatStreaming.current = false;
    rerender(<ConversationThread {...OWNED_PROPS} />);
    await screen.findByTestId('ct-documents');
    expect(document.querySelector('.ct-side')).toBeNull();
  });

  it('with the side column closed by the person, the list shows by itself even beside a type-B draft', async () => {
    localStorage.setItem('c2c-v2-ana-work-dock', 'hidden');
    chatMessages.current = [...REOPENED, TYPE_B];
    render(<ConversationThread {...OWNED_PROPS} />);
    await screen.findByTestId('ct-documents');
  });
});

describe('The count beside "Documents" is of the list it opens', () => {
  it('after "This project", an open document\'s "← Documents" counts the project\'s list', async () => {
    render(<ConversationThread {...OWNED_PROPS} />);
    await screen.findByTestId('ct-documents');
    fireEvent.click(screen.getByRole('button', { name: 'This project' }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.getByTestId('ct-documents-toggle').textContent).toContain('Documents (3)');
    fireEvent.click(screen.getByRole('button', { name: 'Open Quality Overall Summary' }));
    const back = await screen.findByTestId('dc-documents');
    expect(back.textContent).toContain('Documents (3)');
    fireEvent.click(back);
    await waitFor(() => expect(rows()).toHaveLength(3));
  });
});

describe('A document the list opened says its status', () => {
  it('a draft opened with no card in the transcript shows "Draft" in the editor\'s bar', async () => {
    render(<ConversationThread {...OWNED_PROPS} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Clinical Overview' }));
    const region = await screen.findByTestId('dc-expanded');
    expect(screen.queryByTestId('document-canvas')?.querySelector('.dcv-card')).toBeFalsy();
    const status = await within(region).findByTestId('dc-status');
    expect(status.textContent).toBe('Draft');
    expect(status.closest('.dcv-bar')).toBeTruthy();
  });
});

