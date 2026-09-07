// @vitest-environment jsdom
/**
 * "Draft with AnA" now has somewhere to land.
 *
 * The editor is registered `ownsConversation: true` (was `hideAna: true`)
 * because it cannot give the rail's column back — `.ed` is
 * `220px minmax(420px,1fr)` and gains a third 300px track whenever a rail mode
 * is open, a 940px floor that the shell's 380px rail pushes past 1376px. But it
 * kept calling the shell's `onAsk`, so "Draft with AnA", DocCanvas's drafting
 * and "Ask what changed" all pushed a question into a rail this screen never
 * renders — and `ask()` persisted `anaOpen`, so the question surfaced later on
 * some other surface entirely.
 *
 * These press the buttons and assert the answer arrives HERE.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

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
      id: 'D1',
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
      id: 'S1',
      doc_id: 'D1',
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

/** Every AnA turn the page actually sent, with the conversation that sent it. */
function streamTurns(): Array<{ message?: string; screen?: string }> {
  const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls
    .filter(c => String(c[0]).includes('/api/ana-ri/stream'))
    .map(c => {
      try {
        const p = JSON.parse((c[1] as { body?: string })?.body ?? '{}') as {
          message?: string;
          context?: { screen?: string };
        };
        return { message: p.message, screen: p.context?.screen };
      } catch {
        return {};
      }
    });
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    if (method === 'GET' && url.startsWith('/api/authoring/sections/S1/history'))
      return ok({ success: true, revisions: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments'))
      return ok({ success: true, comments: [] });
    return ok({ success: true });
  });
  // The pane streams over `fetch`; refusing the request keeps this offline. The
  // user's turn is appended before the request goes out, which is the visible
  // fact under test.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({}) }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DocumentAuthoring — the editor answers its own asks', () => {
  it('"Draft with AnA" opens the pane and shows the request in it', async () => {
    const p = props();
    render(<DocumentAuthoring {...p} />);
    await screen.findAllByText('General Information');

    // The pane ships OPEN. `ownsConversation: true` suppresses the shell's
    // 32px AnA seam on this surface, so a closed local rail left the one
    // screen where AnA and the author co-write as the only screen in the
    // product with no AnA on it at all. ectd-coauthor renders its composer
    // unconditionally and was never reported; this is parity with that.
    expect(screen.getByLabelText(/AnA — document authoring/)).toBeTruthy();

    // Two controls carry this name once a section is genuinely empty: this
    // surface's toolbar button (the one under test — it prompts with the
    // section number) and RichSectionEditor's empty-state CTA (which prompts
    // from linked evidence). Name the one this test means instead of taking
    // whichever the query reaches first; an unqualified getByRole threw
    // "Found multiple elements" in CI the moment the second one appeared.
    const toolbarDraft = screen
      .getAllByRole('button', { name: /Draft with AnA/ })
      .find(b => !b.closest('.rse-empty-cta'));
    expect(toolbarDraft, 'the toolbar "Draft with AnA" button').toBeTruthy();
    fireEvent.click(toolbarDraft!);

    const pane = await screen.findByLabelText(/AnA — document authoring/);
    await waitFor(() => expect(pane.textContent).toMatch(/Draft 3\.2\.S\.1 General Information/));
    // Sent by THIS surface's conversation, not the shell's.
    await waitFor(() =>
      expect(
        streamTurns().some(
          t => t.screen === 'document-authoring' && /Draft 3\.2\.S\.1/.test(t.message ?? '')
        )
      ).toBe(true)
    );
    expect(p.onAsk).not.toHaveBeenCalled();
  });

  it('an empty section shows BOTH draft controls, and the toolbar one still asks for the section', async () => {
    // The ambiguity above is not hypothetical: once a section is genuinely
    // empty, RichSectionEditor offers its own "Draft with AnA" beneath the
    // toolbar's. Both are real controls with different prompts, so this pins
    // which one the toolbar is — otherwise the disambiguation above is a line
    // nothing would notice losing.
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
      if (method === 'GET' && url === '/api/authoring/docs/D1/sections') {
        return ok({ ...SECTIONS, sections: [{ ...SECTIONS.sections[0], content: '' }] });
      }
      if (method === 'GET' && url.startsWith('/api/authoring/sections/S1/history'))
        return ok({ success: true, revisions: [] });
      if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments'))
        return ok({ success: true, comments: [] });
      return ok({ success: true });
    });

    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('General Information');

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Draft with AnA/ })).toHaveLength(2)
    );

    const toolbarDraft = screen
      .getAllByRole('button', { name: /Draft with AnA/ })
      .find(b => !b.closest('.rse-empty-cta'))!;
    fireEvent.click(toolbarDraft);

    await waitFor(() =>
      expect(streamTurns().some(t => /Draft 3\.2\.S\.1/.test(t.message ?? ''))).toBe(true)
    );
  });

  it('the pane composer sends into the same conversation', async () => {
    const p = props();
    render(<DocumentAuthoring {...p} />);
    await screen.findAllByText('General Information');

    const box = await screen.findByPlaceholderText(/Ask about 3\.2\.S\.1/);
    fireEvent.change(box, { target: { value: 'Is this claim supported by the linked evidence?' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));

    const pane = await screen.findByLabelText(/AnA — document authoring/);
    await waitFor(() => expect(pane.textContent).toMatch(/Is this claim supported/));
    expect(p.onAsk).not.toHaveBeenCalled();
  });

  it('shows real work, evidence, and follow-up actions from AnA', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        body: anaStream([
          { type: 'orchestration', orchestration: { detectedIntent: { lens: 'audit' }, suggestedActions: ['Review the citation chain'] } },
          { type: 'tool_use', name: 'check_dossier_consistency', label: 'Checking dossier consistency', round: 1 },
          { type: 'tool_result', name: 'check_dossier_consistency', status: 'success', result: '{"verdict":"clean"}' },
          { type: 'grounding_strip', evidence: { validated: true, source_count: 2, grounded_claim_count: 3, weak_or_ungrounded_claim_count: 0, missing_support_count: 0 } },
          { type: 'text', content: 'The citation chain is consistent.' },
          { type: 'done', latencyMs: 420 },
          { type: 'post_done', cleanedResponse: 'The citation chain is consistent.' },
        ]),
      }))
    );

    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('General Information');
    const composer = await screen.findByRole('textbox', { name: 'Ask AnA about 3.2.S.1' });
    fireEvent.change(composer, { target: { value: 'Check the citation chain.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const pane = await screen.findByLabelText(/AnA — document authoring/);
    // Scoped to the conversation log: the pane also mounts the live work dock
    // above it, which names the same step, so a pane-wide query finds two.
    const log = within(pane).getByRole('log', { name: 'AnA conversation' });
    expect(await within(log).findByText('Checking dossier consistency')).toBeTruthy();
    expect(await within(pane).findByText('Evidence grounded')).toBeTruthy();
    const followUp = await within(pane).findByRole('button', { name: /Review the citation chain/ });
    expect((followUp as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(followUp);
    await waitFor(() => expect(streamTurns().some(t => t.message === 'Review the citation chain')).toBe(true));
  });

  it('shows an honest empty pane rather than pretending a conversation exists', async () => {
    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('General Information');
    const pane = await screen.findByLabelText(/AnA — document authoring/);
    expect(pane.textContent).toMatch(/Ask AnA about this section/);
    expect(within(pane).getByRole('log', { name: 'AnA conversation' })).toBeTruthy();
    const composer = within(pane).getByRole('textbox', { name: 'Ask AnA about 3.2.S.1' });

    // Shipping the pane open must NOT take the caret out of the document on
    // first paint — the author came here to write, not to chat.
    expect(document.activeElement).not.toBe(composer);

    // A deliberate open still runs the whole focus contract: composer on open,
    // trigger restored on Escape.
    fireEvent.click(screen.getByRole('button', { name: /Close AnA panel/ }));
    await waitFor(() => expect(screen.queryByLabelText(/AnA — document authoring/)).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /^AnA/ }));
    const reopened = await screen.findByLabelText(/AnA — document authoring/);
    const composer2 = within(reopened).getByRole('textbox', { name: 'Ask AnA about 3.2.S.1' });
    await waitFor(() => expect(document.activeElement).toBe(composer2));
    fireEvent.keyDown(reopened, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByLabelText(/AnA — document authoring/)).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /^AnA/ }));
    });
    // Nothing is sent just by opening the pane.
    expect(streamTurns()).toHaveLength(0);
  });
});
