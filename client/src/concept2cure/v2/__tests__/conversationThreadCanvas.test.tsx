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
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

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

  it('puts what was checked directly under the answer, above the canvas whose drafted figures it does not check', async () => {
    // Refute-review HS-8 (2026-10-04): the strip sat after the canvas, so a
    // reassurance about the answer read as one about the draft beneath it.
    chatMessages.current = [
      USER,
      {
        ...DRAFTED,
        evidence: {
          attempted: false, validated: false, sourceCount: 0, groundedClaims: 0, weakClaims: 0, missingSupport: 0,
          check: {
            engine: 'answer-check/2', basis: 'sources', claims: 1, checked: 1, found: 1, notFound: [], unchecked: [],
            fromPerson: [], fromInput: [], sources: ['tool:draft_authoring_document'], unreadable: [], verdicts: [],
          },
        },
      } as AnaChatMessage,
    ];
    const { container } = render(<ConversationThread {...OWNED_PROPS} />);
    const canvas = await screen.findByTestId('document-canvas');
    const strip = container.querySelector('.ana-grounding');
    expect(strip).toBeTruthy();
    expect(strip!.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

describe('ConversationThread — the editor opens beside the conversation (2026-10-01)', () => {
  /* The founder's ask: AnA builds the document and keeps talking with the
     client while it builds, as Claude does. Inline, the expanded editor filled
     the thread's width at viewport height, so AnA's replies scrolled away above
     it and the person edited with the conversation out of sight. Beside it,
     the conversation keeps its column, its answers and its composer. */
  it('mounts the workbench in a pane beside the conversation, and the conversation stays', async () => {
    chatMessages.current = [USER, DRAFTED];
    render(<ConversationThread {...OWNED_PROPS} />);
    const open = await screen.findByTestId('dc-open-editor');
    await vi.waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    open.click();
    const expandedRegion = await screen.findByTestId('dc-expanded');

    const pane = document.querySelector('.ct-canvas-pane') as HTMLElement | null;
    expect(pane, 'a pane beside the conversation holds the editor').not.toBeNull();
    expect(pane!.contains(expandedRegion)).toBe(true);
    expect(pane!.hidden).toBe(false);
    expect(document.querySelector('.ct-main')?.getAttribute('data-canvas-open')).toBe('true');

    const conv = document.querySelector('.ct-conv') as HTMLElement;
    expect(conv.contains(expandedRegion)).toBe(false);
    // The answer, the card that opened the editor, and the composer all stay.
    expect(conv.querySelector('.ct-ana-text')).not.toBeNull();
    const card = conv.querySelector('.dcv-card') as HTMLElement;
    expect(card.hidden).toBe(false);
    expect(within(card).getByTestId('dc-open-editor').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Reply to AnA')).toBeTruthy();
    /* The card collapses to its head while the document is open beside it:
       the outline and the section preview are in the editor next to it, and
       repeating them pushed AnA's later answers down the column. */
    expect((card.querySelector('.dcv-body') as HTMLElement).hidden).toBe(true);
    expect(card.querySelector('.dcv-title')?.textContent).toBe('Module 2.5 Clinical Overview — C2C-101');

    // Back closes the pane; the workbench stays mounted in it, hidden.
    screen.getByTestId('dc-back').click();
    await vi.waitFor(() => expect(document.querySelector('.ct-main')?.getAttribute('data-canvas-open')).toBeNull());
    expect(pane!.hidden).toBe(true);
    expect(pane!.querySelector('.dcv-workbench .ed')).not.toBeNull();
    // Closed, the card is whole again.
    expect((card.querySelector('.dcv-body') as HTMLElement).hidden).toBe(false);
  });
});

describe('ConversationThread — the canvas keeps up with AnA (2026-10-01)', () => {
  it('re-reads the document when AnA\u2019s turn ends', async () => {
    chatMessages.current = [USER, DRAFTED];
    chatStreaming.current = true;
    const { rerender } = render(<ConversationThread {...OWNED_PROPS} />);
    await screen.findByTestId('document-canvas');
    const reads = () => apiRequest.mock.calls.filter(c => c[1] === `/api/authoring/docs/${DOC}/sections`).length;
    await vi.waitFor(() => expect(reads()).toBeGreaterThanOrEqual(1));
    /* Since slice 1 of ONE_ANA_ONE_CANVAS.md the document also opens beside
       the conversation while the turn is written, and that editor reads the
       sections too; so count from just before the turn settles. */
    await new Promise((r) => setTimeout(r, 50));
    const before = reads();

    chatStreaming.current = false; // the turn settles
    rerender(<ConversationThread {...OWNED_PROPS} />);
    await vi.waitFor(() => expect(reads()).toBeGreaterThan(before));
    chatStreaming.current = false;
  });
});

describe('ConversationThread — AnA\u2019s answers go into the open document (2026-10-01)', () => {
  /* The editor's "Insert into <section> as tracked suggestion" lived only in
     its own AnA rail, and the rail is hidden when the editor is embedded in the
     conversation canvas. So while building a document beside the conversation,
     nothing AnA answered could reach it. Each settled answer now offers that
     insert into the open section, through the editor's one suggestion door. */
  /* Written by a model that may write governed content (round 11): the insert
     follows the governed-write rule, so an answer it does not admit is refused. */
  const OPUS = { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'pending' };
  const FOLLOWUP: AnaChatMessage = {
    id: 'm5',
    role: 'assistant',
    text: 'Exposure was dose-proportional from 10 to 300 mg.',
    turnRecord: { status: 'recorded', id: 'rec-7', sha256: 'a'.repeat(64), servedBy: [OPUS] },
  } as unknown as AnaChatMessage;

  it('offers no insert while no document is open', async () => {
    chatMessages.current = [USER, DRAFTED, FOLLOWUP];
    render(<ConversationThread {...OWNED_PROPS} />);
    await screen.findByText('Exposure was dose-proportional from 10 to 300 mg.');
    expect(screen.queryByRole('button', { name: /as tracked suggestion/ })).toBeNull();
  });

  it('inserts a settled answer into the open section as an AnA suggestion, naming its turn record', async () => {
    chatMessages.current = [USER, DRAFTED, FOLLOWUP];
    render(<ConversationThread {...OWNED_PROPS} />);
    const open = await screen.findByTestId('dc-open-editor');
    await vi.waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    open.click();
    await screen.findByTestId('dc-expanded');

    const insert = await screen.findByRole('button', { name: 'Insert into 2.5.1 as tracked suggestion' }, { timeout: 4000 });
    insert.click();

    const ins = await vi.waitFor(() => {
      const el = document.querySelector('.ct-canvas-pane ins[data-author-id="ana"]');
      if (!el) throw new Error('no AnA suggestion in the open section');
      return el as HTMLElement;
    });
    expect(ins.textContent).toContain('Exposure was dose-proportional');
    expect(ins.getAttribute('data-source-record')).toBe('rec-7');
  });

  /* Amended 2026-10-01 (step 9). Step 3 withdrew the offer when the editor
     closed, because a hidden editor is not somewhere the person can see a
     suggestion land. Below 1100px the conversation is hidden while the editor
     is open, so the offer was never on screen at the same time as its target,
     and the loop could not be used at all. A closed editor is now offered as
     "Open <section> and insert": the click reopens it, so the suggestion
     still lands where the person sees it. */
  it('when the editor closes, the offer reopens it: the suggestion still lands where the person sees it', async () => {
    chatMessages.current = [USER, DRAFTED, FOLLOWUP];
    render(<ConversationThread {...OWNED_PROPS} />);
    const open = await screen.findByTestId('dc-open-editor');
    await vi.waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    open.click();
    await screen.findByRole('button', { name: 'Insert into 2.5.1 as tracked suggestion' }, { timeout: 4000 });

    (await screen.findByTestId('dc-open-editor')).click();
    await vi.waitFor(() => expect(document.querySelector('.ct-main')?.getAttribute('data-canvas-open')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Insert into 2.5.1 as tracked suggestion' })).toBeNull();

    (await screen.findByRole('button', { name: 'Open 2.5.1 and insert as tracked suggestion' })).click();
    await vi.waitFor(() => expect(document.querySelector('.ct-main')?.getAttribute('data-canvas-open')).toBe('true'));
    const ins = await vi.waitFor(() => {
      const el = document.querySelector('.ct-canvas-pane ins[data-author-id="ana"]');
      if (!el) throw new Error('no AnA suggestion in the reopened section');
      return el as HTMLElement;
    });
    expect(ins.getAttribute('data-source-record')).toBe('rec-7');
  });

  /* AnA reasoning round 11 (GRD-missed): the insert follows the governed-write
     rule every other door that stores model-authored text already applies. A
     refused offer is disabled, not hidden, and says why (GE-P-3). */
  it('an answer a model not approved for regulatory drafting wrote: the offer is disabled, says why, and inserts nothing', async () => {
    const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5', qualified: false, approvedForHighRisk: false, pq: 'pending' };
    const UNQUALIFIED = { ...FOLLOWUP, turnRecord: { status: 'recorded', id: 'rec-8', sha256: 'a'.repeat(64), servedBy: [SONNET] } } as unknown as AnaChatMessage;
    chatMessages.current = [USER, DRAFTED, UNQUALIFIED];
    render(<ConversationThread {...OWNED_PROPS} />);
    const open = await screen.findByTestId('dc-open-editor');
    await vi.waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    open.click();
    await screen.findByTestId('dc-expanded');

    const insert = (await screen.findByRole('button', { name: 'Insert into 2.5.1 as tracked suggestion' }, { timeout: 4000 })) as HTMLButtonElement;
    expect(insert.disabled).toBe(true);
    const reason = document.getElementById(insert.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe(
      'Written by claude-sonnet-5, which is not approved for regulatory drafting. Ask again with Thorough effort to have an approved model write it.',
    );
    insert.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('.ct-canvas-pane ins[data-author-id="ana"]')).toBeNull();
  });

  it('an answer whose record does not name its models: the offer is disabled, failing closed', async () => {
    const UNNAMED = { ...FOLLOWUP, turnRecord: { status: 'recorded', id: 'rec-9', sha256: 'a'.repeat(64) } } as unknown as AnaChatMessage;
    chatMessages.current = [USER, DRAFTED, UNNAMED];
    render(<ConversationThread {...OWNED_PROPS} />);
    const open = await screen.findByTestId('dc-open-editor');
    await vi.waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    open.click();
    const insert = (await screen.findByRole('button', { name: 'Insert into 2.5.1 as tracked suggestion' }, { timeout: 4000 })) as HTMLButtonElement;
    expect(insert.disabled).toBe(true);
    expect(document.getElementById(insert.getAttribute('aria-describedby') ?? '')?.textContent).toMatch(
      /^This answer’s record does not say which model wrote it\./,
    );
  });
});

describe('ConversationThread — AnA knows the document open beside the conversation (2026-10-01)', () => {
  /* The thread runs on the shell's chat, created with no authoring context, so
     a turn sent while a document was open beside the conversation reached AnA
     naming no document and no section. Each turn now carries the editor's own
     authoring context while the editor is open, and none once it closes. */
  const sendFromComposer = async (text: string) => {
    const box = screen.getByRole('textbox', { name: 'Reply to AnA' });
    fireEvent.change(box, { target: { value: text } });
    fireEvent.keyDown(box, { key: 'Enter' });
  };

  it('sends the open document and section with the turn, and nothing once the editor closes', async () => {
    chatSend.mockReset();
    chatMessages.current = [USER, DRAFTED];
    render(<ConversationThread {...OWNED_PROPS} />);
    const open = await screen.findByTestId('dc-open-editor');
    await vi.waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    open.click();
    await screen.findByTestId('dc-expanded');
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Close the editor/ })).toBeTruthy());

    await vi.waitFor(async () => {
      chatSend.mockClear();
      await sendFromComposer('Draft this section');
      expect(chatSend).toHaveBeenCalled();
      expect(chatSend.mock.calls[0][2]?.authoringContext).toMatchObject({
        projectId: PID,
        workflowStage: 'section-workspace',
        artifactId: DOC,
        sectionCode: '2.5.1',
        sectionTitle: 'Product Development Rationale',
      });
    });

    (await screen.findByTestId('dc-open-editor')).click();
    await vi.waitFor(async () => {
      chatSend.mockClear();
      await sendFromComposer('And now?');
      expect(chatSend).toHaveBeenCalled();
      expect(chatSend.mock.calls[0][2]).toBeUndefined();
    });
  });
});

describe('ConversationThread — a sealed document is known to AnA, and takes no insert (2026-10-01)', () => {
  it('names the frozen document on the turn but offers no insert into it', async () => {
    chatSend.mockReset();
    const FOLLOWUP: AnaChatMessage = {
      id: 'm5', role: 'assistant', text: 'Exposure was dose-proportional from 10 to 300 mg.',
      turnRecord: { status: 'recorded', id: 'rec-7', sha256: 'a'.repeat(64) },
    } as unknown as AnaChatMessage;
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === 'GET' && url === `/api/authoring/docs/${DOC}`) {
        return ok({ success: true, document: { id: DOC, title: 'Module 2.5 Clinical Overview — C2C-101', module: 'M2', product_code: null, status: 'FROZEN', updated_at: null, section_count: 1, provenance: { source: 'ana', conversationId: 'thread-1' } } });
      }
      return base(method, url, body);
    });
    chatMessages.current = [USER, DRAFTED, FOLLOWUP];
    render(<ConversationThread {...OWNED_PROPS} />);
    const open = await screen.findByTestId('dc-open-editor');
    await vi.waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    open.click();
    await screen.findByTestId('dc-expanded');

    await vi.waitFor(async () => {
      chatSend.mockClear();
      const box = screen.getByRole('textbox', { name: 'Reply to AnA' });
      fireEvent.change(box, { target: { value: 'What does this section say?' } });
      fireEvent.keyDown(box, { key: 'Enter' });
      expect(chatSend.mock.calls[0]?.[2]?.authoringContext).toMatchObject({ artifactId: DOC, sectionCode: '2.5.1' });
    });
    expect(screen.queryByRole('button', { name: /as tracked suggestion/ })).toBeNull();
  });
});

describe('ConversationThread — a section not yet drafted is one ask away (2026-10-01)', () => {
  /* The outline said "Not drafted" and stopped there. From a section's empty
     state the person now asks AnA to draft it: the editor opens beside the
     conversation AT that section, the ask is in the composer, and the turn
     and the insert both name that section. */
  it('opens the editor at the section, puts the ask in the composer, and the turn and the insert name that section', async () => {
    chatSend.mockReset();
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === 'GET' && url === `/api/authoring/docs/${DOC}/sections`) {
        return ok({ success: true, sections: [
          { id: 'S1', doc_id: DOC, code: '2.5.1', title: 'Product Development Rationale', content: '<p>From the record.</p>', order_index: 0 },
          { id: 'S2', doc_id: DOC, code: '2.5.2', title: 'Overview of Biopharmaceutics', content: '', order_index: 1 },
        ] });
      }
      return base(method, url, body);
    });
    const FOLLOWUP: AnaChatMessage = {
      id: 'm5', role: 'assistant', text: 'Exposure was dose-proportional from 10 to 300 mg.',
      turnRecord: { status: 'recorded', id: 'rec-7', sha256: 'a'.repeat(64) },
    } as unknown as AnaChatMessage;
    chatMessages.current = [USER, DRAFTED, FOLLOWUP];
    render(<ConversationThread {...OWNED_PROPS} />);

    (await screen.findByRole('button', { name: /2\.5\.2\s*Overview of Biopharmaceutics/ })).click();
    (await screen.findByRole('button', { name: 'Ask AnA to draft 2.5.2' })).click();

    const box = screen.getByRole('textbox', { name: 'Reply to AnA' }) as HTMLTextAreaElement;
    await vi.waitFor(() =>
      expect(box.value).toMatch(/^Draft the text for section 2\.5\.2 Overview of Biopharmaceutics of “Module 2\.5 Clinical Overview — C2C-101”/),
    );
    await vi.waitFor(() => expect(document.querySelector('.ct-canvas-pane [data-testid="dc-expanded"]')).toBeTruthy());
    await screen.findByRole('button', { name: 'Insert into 2.5.2 as tracked suggestion' }, { timeout: 4000 });

    fireEvent.keyDown(box, { key: 'Enter' });
    expect(chatSend.mock.calls[0]?.[2]?.authoringContext).toMatchObject({ artifactId: DOC, sectionCode: '2.5.2' });
  });
});

describe('ConversationThread — every AnA draft opens as a document (2026-10-01)', () => {
  /* Only draft_authoring_document wrote the editor's store. A draft from any
     other tool (a plan, a briefing book, a statistical document) was a
     side-panel card whose Edit went to the authoring workspace with no
     document, so most document types never reached the canvas or the editor.
     The card now opens the draft as an authoring document, through the one
     from-draft door, and once per turn. */
  const NEW_DOC = 'bbbbbbbb-0000-4000-8000-000000000003';
  const SAP_TITLE = 'Statistical Analysis Plan — C2C-101';
  const SAP: AnaChatMessage = {
    id: 'm6',
    role: 'assistant',
    text: 'Here is the statistical analysis plan.',
    turnRecord: { status: 'recorded', id: 'rec-9', sha256: 'b'.repeat(64) },
    generatedDraft: {
      title: SAP_TITLE,
      content: `# ${SAP_TITLE}\n\nScope of this plan.\n\n## 1. Objectives\n\nPrimary objective.\n\n## 2. Endpoints\n\nPrimary endpoint.`,
      documentType: 'sap',
      artifactId: 'art-1',
      version: 1,
    },
  } as unknown as AnaChatMessage;

  let posted: unknown[] = [];
  let listed: unknown[] = [];
  let listStatus = 200;
  beforeEach(() => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'C2C-101' };
    posted = [];
    listed = [];
    listStatus = 200;
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === 'GET' && url === `/api/authoring/docs?programId=${PID}`) return ok({ success: listStatus < 400, documents: listed }, listStatus);
      if (method === 'POST' && url === '/api/authoring/docs/from-draft') {
        posted.push(body);
        return ok({ success: true, data: { doc: { id: NEW_DOC } } }, 201);
      }
      if (method === 'GET' && url === `/api/authoring/docs/${NEW_DOC}`) {
        return ok({ success: true, document: { id: NEW_DOC, title: SAP_TITLE, module: 'M2', product_code: 'sap', status: 'DRAFT', updated_at: null, provenance: { source: 'ana', conversationId: 'thread-1', turnId: 'rec-9' } } });
      }
      if (method === 'GET' && url === `/api/authoring/docs/${NEW_DOC}/sections`) {
        return ok({ success: true, sections: [
          { id: 'N0', doc_id: NEW_DOC, code: '0', title: SAP_TITLE, content: '<p>Scope of this plan.</p>', order_index: 0 },
          { id: 'N1', doc_id: NEW_DOC, code: '1', title: 'Objectives', content: '<p>Primary objective.</p>', order_index: 1 },
          { id: 'N2', doc_id: NEW_DOC, code: '2', title: 'Endpoints', content: '<p>Primary endpoint.</p>', order_index: 2 },
        ] });
      }
      return base(method, url, body);
    });
  });
  afterEach(() => {
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  });

  async function openFromCard() {
    render(<ConversationThread {...OWNED_PROPS} />);
    const head = (await screen.findByText(SAP_TITLE)).closest('button')!;
    head.click();
    (await screen.findByRole('button', { name: `Open ${SAP_TITLE} as a document in the editor` })).click();
  }

  it('creates the document from the draft, split at its headings, and opens it beside the conversation', async () => {
    chatMessages.current = [USER, SAP];
    await openFromCard();

    const canvas = await vi.waitFor(() => {
      const el = document.querySelector(`[data-testid="document-canvas"][data-doc-id="${NEW_DOC}"]`);
      if (!el) throw new Error('no canvas for the new document');
      return el;
    });
    expect(canvas).toBeTruthy();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      programId: PID,
      title: SAP_TITLE,
      documentType: 'sap',
      sections: [
        { code: '0', title: SAP_TITLE },
        { code: '1', title: 'Objectives' },
        { code: '2', title: 'Endpoints' },
      ],
      provenance: { source: 'ana', conversationId: 'thread-1', turnId: 'rec-9' },
    });
    expect((posted[0] as { sections: { content: string }[] }).sections[1].content).toContain('Primary objective.');
    // Open, beside the conversation, and no longer a side-panel card.
    await vi.waitFor(() => expect(document.querySelector('.ct-canvas-pane [data-testid="dc-expanded"]')).toBeTruthy());
    expect(document.querySelector('.ct-art')).toBeNull();
  });

  it('opens the document already made from that turn instead of creating a second copy', async () => {
    chatMessages.current = [USER, SAP];
    listed = [{ id: 'cccccccc-0000-4000-8000-000000000004', title: SAP_TITLE }, { id: NEW_DOC, title: SAP_TITLE }];
    await openFromCard();

    await vi.waitFor(() => {
      if (!document.querySelector(`[data-testid="document-canvas"][data-doc-id="${NEW_DOC}"]`)) throw new Error('not opened');
    });
    expect(posted).toHaveLength(0);
  });

  it('creates nothing when it cannot check for an earlier copy, and says so', async () => {
    chatMessages.current = [USER, SAP];
    listStatus = 500;
    await openFromCard();

    await screen.findByText(/Couldn’t check whether this draft is already a document/);
    expect(posted).toHaveLength(0);
    expect(document.querySelector('[data-testid="document-canvas"]')).toBeNull();
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
