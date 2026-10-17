// @vitest-environment jsdom
/**
 * Authoring asks use the canonical ConversationThread composer and saved
 * DocumentCanvas. The actual navigation carries the exact saved document and
 * section; a prefilled request stays unsent until the person presses Enter.
 * These preserve drafting, evidence, follow-up, answer visibility and focus
 * capabilities while refusing a second editor conversation.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/core';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';
import { CanonicalAuthoringFlow, setAuthoringFlowScope, clearAuthoringFlowScope, serveAuthoringStream, sendAuthoringPrefill, toolbarDraftButton, sentAuthoringTurns } from './canonicalAuthoringFlow';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload } as Response);

function anaStream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
}

const DOCS = {
  success: true,
  documents: [
    {
      id: 'dddddddd-0000-4000-8000-000000000001',
      title: 'Nonclinical Overview',
      module: 'M3',
      product_code: 'ABC',
      status: 'draft',
      updated_at: '2026-07-20T10:00:00Z',
      section_count: 1,
    },
  ],
};
const SECTIONS = {
  success: true,
  sections: [
    {
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      doc_id: 'dddddddd-0000-4000-8000-000000000001',
      code: '3.2.S.1',
      title: 'General Information',
      content: 'The drug substance is a monoclonal antibody.',
      order_index: 0,
      comment_count: 0,
      revision_count: 2,
      citation_count: 1,
      updated_at: '2026-07-20T10:00:00Z',
    },
  ],
};

const props = () => ({
  surface: { id: 'document-authoring', label: 'Authoring' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

beforeEach(() => {
  setAuthoringFlowScope();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/dddddddd-0000-4000-8000-000000000001') return ok({ document: DOCS.documents[0] });
    if (method === 'GET' && url === '/api/authoring/docs/dddddddd-0000-4000-8000-000000000001/sections') return ok(SECTIONS);
    if (method === 'GET' && url.startsWith('/api/authoring/sections/aaaaaaaa-0000-4000-8000-000000000001/history'))
      return ok({ success: true, revisions: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/dddddddd-0000-4000-8000-000000000001/comments'))
      return ok({ success: true, comments: [] });
    if (url.startsWith('/api/c2c/documents/')) return { ...ok({ success: false }), ok: false, status: 404 };
    return ok({ success: true });
  });
  // Refuse the actual provider request in tests that inspect request context.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({}) }))
  );
});

afterEach(() => {
  cleanup();
  clearAuthoringFlowScope();
  vi.unstubAllGlobals();
});

describe('DocumentAuthoring — asks arrive in the canonical conversation', () => {
  it('Draft with AnA prefills the visible composer and sends saved section context only after Enter', async () => {
    render(<CanonicalAuthoringFlow />);
    await screen.findAllByText('General Information');
    expect(screen.queryByLabelText(/AnA — document authoring/)).toBeNull();
    fireEvent.click(toolbarDraftButton());
    const composer = await screen.findByRole('textbox', { name: 'Reply to AnA' }) as HTMLTextAreaElement;
    expect(composer.value).toMatch(/Draft 3\.2\.S\.1 General Information/);
    expect(sentAuthoringTurns()).toHaveLength(0);
    await sendAuthoringPrefill();
    await waitFor(() => expect(sentAuthoringTurns()).toHaveLength(1));
    expect(sentAuthoringTurns()[0].module_context).toMatchObject({ documentId: 'dddddddd-0000-4000-8000-000000000001', sectionId: 'aaaaaaaa-0000-4000-8000-000000000001', savedRecordOnly: true });
    expect(sentAuthoringTurns()[0].authoring_context).toMatchObject({ artifactId: 'dddddddd-0000-4000-8000-000000000001', sectionId: 'aaaaaaaa-0000-4000-8000-000000000001' });
  });

  it('an empty section keeps both draft controls, and the toolbar asks for the exact section', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url.startsWith('/api/authoring/docs?')) return ok(DOCS);
      if (url === '/api/authoring/docs/dddddddd-0000-4000-8000-000000000001') return ok({ document: DOCS.documents[0] });
      if (url === '/api/authoring/docs/dddddddd-0000-4000-8000-000000000001/sections') return ok({ sections: [{ ...SECTIONS.sections[0], content: '' }] });
      if (url.startsWith('/api/c2c/documents/')) return { ...ok({}), ok: false, status: 404 };
      return ok({ success: true });
    });
    render(<CanonicalAuthoringFlow />);
    await screen.findAllByText('General Information');
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Draft with AnA/ })).toHaveLength(2));
    fireEvent.click(toolbarDraftButton());
    await sendAuthoringPrefill();
    await waitFor(() => expect(sentAuthoringTurns()[0]?.message).toMatch(/Draft 3\.2\.S\.1/));
  });

  it('the canonical composer sends the person’s edited question in the same saved document context', async () => {
    render(<CanonicalAuthoringFlow />);
    await screen.findAllByText('General Information');
    fireEvent.click(screen.getByRole('button', { name: /^AnA/ }));
    const pane = await sendAuthoringPrefill('Is this claim supported by the linked evidence?');
    await waitFor(() => expect(pane.textContent).toMatch(/Is this claim supported/));
    expect(sentAuthoringTurns()[0].message).toBe('Is this claim supported by the linked evidence?');
    expect(sentAuthoringTurns()[0].module_context).toMatchObject({ sectionCode: '3.2.S.1', savedRecordOnly: true });
  });

  it('shows real work, evidence and follow-up actions in the canonical conversation', async () => {
    serveAuthoringStream(() => anaStream([
      { type: 'orchestration', orchestration: { detectedIntent: { lens: 'audit' }, suggestedActions: ['Review the citation chain'] } },
      { type: 'tool_use', name: 'check_dossier_consistency', label: 'Checking dossier consistency', round: 1 },
      { type: 'tool_result', name: 'check_dossier_consistency', status: 'success', result: '{"verdict":"clean"}' },
      { type: 'grounding_strip', evidence: { attempted: true, validated: true, source_count: 2, grounded_claim_count: 3, weak_or_ungrounded_claim_count: 0, missing_support_count: 0 },
        check: { engine: 'answer-check/2', basis: 'sources', claims: 2, checked: 2, found: 2, notFound: [], unchecked: [], fromPerson: [], fromInput: [], sources: ['tool:check_dossier_consistency'], unreadable: [], verdicts: [] } },
      { type: 'text', content: 'The citation chain is consistent.' }, { type: 'done', latencyMs: 420 }, { type: 'post_done', cleanedResponse: 'The citation chain is consistent.' },
    ]));
    render(<CanonicalAuthoringFlow />);
    await screen.findAllByText('General Information');
    fireEvent.click(screen.getByRole('button', { name: /^AnA/ }));
    const pane = await sendAuthoringPrefill('Check the citation chain.');
    expect((await within(pane).findAllByText('Checking dossier consistency')).length).toBeGreaterThan(0);
    expect(await within(pane).findByText(/All 2 specific claims found in this turn's sources/)).toBeTruthy();
    expect(within(pane).getByText(/AnA's labels: 3 claims labelled/)).toBeTruthy();
    const followUp = await within(pane).findByRole('button', { name: /Review the citation chain/ });
    expect((followUp as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(followUp);
    await waitFor(() => expect(sentAuthoringTurns().some(t => t.message === 'Review the citation chain')).toBe(true));
  });

  it('keeps initial writing focus and a prefilled handoff starts no pretend conversation', async () => {
    render(<CanonicalAuthoringFlow />);
    await screen.findAllByText('General Information');
    expect(screen.queryByRole('textbox', { name: 'Reply to AnA' })).toBeNull();
    expect(screen.queryByLabelText(/AnA — document authoring/)).toBeNull();
    expect(sentAuthoringTurns()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /^AnA/ }));
    const composer = await screen.findByRole('textbox', { name: 'Reply to AnA' }) as HTMLTextAreaElement;
    expect(composer.value).toBe('');
    expect((screen.getByRole('button', { name: 'Send message to AnA' }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('monoclonal antibody'));
    expect(sentAuthoringTurns()).toHaveLength(0);
    expect(document.querySelector('.ct-user')).toBeNull();
    expect(document.querySelector('.ct-ana')).toBeNull();
    expect(document.querySelector('[aria-live="polite"].ct-scroll')).toBeNull();
  });

  it('holds the handoff behind unsaved-work disposition and sends only the saved record after leaving', async () => {
    render(<CanonicalAuthoringFlow />);
    await screen.findAllByText('General Information');
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('monoclonal antibody'));
    const editor = (document.querySelector('.tiptap') as unknown as { editor: Editor }).editor;
    act(() => { editor.commands.insertContent('Unsaved local note. '); });
    fireEvent.click(toolbarDraftButton());
    await screen.findByRole('alertdialog', { name: 'Unsaved changes in 3.2.S.1' });
    expect(screen.queryByTestId('canonical-conversation')).toBeNull();
    expect(sentAuthoringTurns()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.querySelector('.tiptap')?.textContent).toContain('Unsaved local note.');
    fireEvent.click(toolbarDraftButton());
    fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    await sendAuthoringPrefill();
    await waitFor(() => expect(sentAuthoringTurns()).toHaveLength(1));
    expect(JSON.stringify(sentAuthoringTurns()[0])).not.toContain('Unsaved local note.');
    expect(sentAuthoringTurns()[0].module_context).toMatchObject({ savedRecordOnly: true, sectionId: 'aaaaaaaa-0000-4000-8000-000000000001' });
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });
});

/* QA 2026-10-08, walk 2, j5 (a): a finished turn must bring the START of the
   newest answer into view instead of leaving only follow-ups visible. The
   capability follows the conversation to its canonical scroll container. */
describe('DocumentAuthoring — the answer is on screen after a turn', () => {
  it('shows the start of the newest canonical answer without moving the whole page', async () => {
    // jsdom lays nothing out: place the conversation at y=100 and every AnA
    // answer at y=500, and record where the conversation is scrolled to.
    const scrolledTo: Array<{ label: string | null; top: unknown }> = [];
    const proto = Element.prototype as unknown as Record<string, unknown>;
    const originalRect = Element.prototype.getBoundingClientRect;
    const originalScrollTo = proto.scrollTo;
    const originalIntoView = Element.prototype.scrollIntoView;
    const intoView = vi.fn();
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const top = this.classList.contains('ct-ana') ? 500 : this.classList.contains('ct-scroll') ? 100 : 0;
      return { top, bottom: top + 40, left: 0, right: 0, width: 0, height: 40, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    };
    proto.scrollTo = function (this: Element, opts: { top?: number }) {
      scrolledTo.push({ label: this.classList.contains('ct-scroll') ? 'Canonical conversation' : this.getAttribute('aria-label'), top: opts?.top });
    };
    Element.prototype.scrollIntoView = intoView;
    try {
      serveAuthoringStream(() => anaStream([
            { type: 'orchestration', orchestration: { suggestedActions: ['Rewrite Section', 'Create Strategy Note'] } },
            { type: 'text', content: 'Tightened: the rationale now leads with the unmet need.' },
            { type: 'done', latencyMs: 420 },
            { type: 'post_done', cleanedResponse: 'Tightened: the rationale now leads with the unmet need.' },
          ]));
      render(<CanonicalAuthoringFlow />);
      await screen.findAllByText('General Information');
      fireEvent.click(toolbarDraftButton());
      await screen.findByRole('textbox', { name: 'Reply to AnA' });
      (document.querySelector('.ct-scroll') as HTMLElement).style.setProperty('--space-2', '8px');
      const pane = await sendAuthoringPrefill('Tighten this section for an FDA reviewer');
      await within(pane).findByText(/Tightened: the rationale/);
      // The conversation is scrolled so the answer's first line sits at its top
      // (500 - 100 - 8), and nothing else on the page is moved.
      await waitFor(() => expect(scrolledTo).toContainEqual({ label: 'Canonical conversation', top: 392 }));
      expect(intoView).not.toHaveBeenCalled();
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
      proto.scrollTo = originalScrollTo;
      Element.prototype.scrollIntoView = originalIntoView;
    }
  });
});

/* QA 2026-10-08, walk 2, j5 (c): Save, the reason field, E-sign and Place
   into filing were inside the header's horizontal scroller (.ed-doc-actions,
   overflow-x:auto), past its right edge at 1440px and at 390px. The governed
   acts are their own group, which wraps and is never clipped. */
describe('DocumentAuthoring — the governed acts are never scrolled out of the header', () => {
  it('Save is in the commit group, outside the panel scroller', async () => {
    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('General Information');
    const save = await screen.findByTestId('save-section');
    expect(save.closest('.ed-doc-commit')).not.toBeNull();
    expect(save.closest('.ed-doc-actions')).toBeNull();
  });
});
