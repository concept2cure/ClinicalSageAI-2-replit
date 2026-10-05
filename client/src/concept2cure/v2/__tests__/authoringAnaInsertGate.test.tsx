// @vitest-environment jsdom
/**
 * The editor's AnA pane offers "Insert into <section> as tracked suggestion"
 * only for an answer every model of which may write governed content (AnA
 * reasoning round 11, GRD-missed, 2026-10-05). A refused offer is shown
 * DISABLED with its reason as visible text the control is described by
 * (GE-P-3), never hidden: the person sees why, and what to do.
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

import type { Editor } from '@tiptap/core';

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload } as Response);
const SHA = 'c'.repeat(64);
const ANSWER = 'The drug substance is a humanised IgG1 monoclonal antibody.';
const OPUS = { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'pending' };
const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5', qualified: false, approvedForHighRisk: false, pq: 'pending' };

function anaStream(turnRecord: unknown): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const events = [
    { type: 'text', content: ANSWER },
    { type: 'done', latencyMs: 300 },
    { type: 'post_done', cleanedResponse: ANSWER, ...(turnRecord ? { turnRecord } : {}) },
  ];
  return new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
}

const DOCS = {
  success: true,
  documents: [{ id: 'D1', title: 'Quality Overall Summary', module: 'M3', product_code: 'ABC', status: 'draft', updated_at: '2026-07-20T10:00:00Z', section_count: 1 }],
};
const SECTIONS = {
  success: true,
  sections: [{
    id: 'S1', doc_id: 'D1', code: '3.2.S.1', title: 'General Information', content: 'The drug substance is a monoclonal antibody.',
    order_index: 0, comment_count: 0, revision_count: 2, citation_count: 1, updated_at: '2026-07-20T10:00:00Z',
  }],
};

const props = () => ({
  surface: { id: 'document-authoring', label: 'Authoring' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    if (method === 'GET' && url.startsWith('/api/authoring/sections/S1/history')) return ok({ success: true, revisions: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments')) return ok({ success: true, comments: [] });
    return ok({ success: true });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Ask in the pane, with the answer filed under `turnRecord`; the pane's insert offer for it. */
async function answeredWith(turnRecord: unknown): Promise<{ pane: HTMLElement; insert: HTMLButtonElement }> {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, body: anaStream(turnRecord) })));
  render(<DocumentAuthoring {...props()} />);
  await screen.findAllByText('General Information');
  const composer = await screen.findByRole('textbox', { name: 'Ask AnA about 3.2.S.1' });
  fireEvent.change(composer, { target: { value: 'Describe the drug substance.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  const pane = await screen.findByLabelText(/AnA — document authoring/);
  const insert = (await within(pane).findByRole('button', { name: 'Insert into 3.2.S.1 as tracked suggestion' }, { timeout: 4000 })) as HTMLButtonElement;
  return { pane, insert };
}

/** The visible text a control is described by. */
const describedBy = (el: HTMLElement): string => {
  const id = el.getAttribute('aria-describedby');
  return id ? document.getElementById(id)?.textContent ?? '' : '';
};

const anaSuggestion = () => document.querySelector('ins[data-author-id="ana"]');

describe('the pane’s insert follows the governed-write rule', () => {
  it('an answer a model not approved for regulatory drafting wrote: disabled, and the reason is on screen', async () => {
    const { insert } = await answeredWith({ status: 'recorded', id: 'rec-1', sha256: SHA, servedBy: [SONNET] });
    await waitFor(() => expect(insert.disabled).toBe(true));
    expect(describedBy(insert)).toBe(
      'Written by claude-sonnet-5, which is not approved for regulatory drafting. Ask again with Thorough effort to have an approved model write it.',
    );
    fireEvent.click(insert);
    expect(anaSuggestion()).toBeNull();
  });

  it('an answer whose models the record does not give: disabled, failing closed', async () => {
    const { insert } = await answeredWith({ status: 'recorded', id: 'rec-1', sha256: SHA });
    await waitFor(() => expect(insert.disabled).toBe(true));
    expect(describedBy(insert)).toMatch(/^This answer’s record does not say which model wrote it\./);
  });

  it('an answer every model of which may write governed content is inserted, naming its turn (negative control)', async () => {
    const { insert } = await answeredWith({ status: 'recorded', id: 'rec-1', sha256: SHA, servedBy: [OPUS] });
    expect(insert.disabled).toBe(false);
    expect(insert.getAttribute('aria-describedby')).toBeNull();
    fireEvent.click(insert);
    const ins = await waitFor(() => {
      const el = anaSuggestion();
      if (!el) throw new Error('no AnA suggestion in the section');
      return el;
    });
    expect(ins.getAttribute('data-source-record')).toBe('rec-1');
  });

  it('a paste of the suggestion it admitted keeps AnA’s name; one from a turn it did not admit is the person’s', async () => {
    const { insert } = await answeredWith({ status: 'recorded', id: 'rec-1', sha256: SHA, servedBy: [OPUS] });
    fireEvent.click(insert);
    await waitFor(() => expect(anaSuggestion()).toBeTruthy());
    // The section's track changes are off (the database default), where a paste kept AnA's mark.
    const editor = (document.querySelector('.tiptap') as unknown as { editor: Editor }).editor;
    const paste = (html: string) => {
      editor.commands.focus('end');
      editor.view.pasteHTML(html, new Event('paste') as unknown as Parameters<Editor['view']['pasteHTML']>[1]);
    };
    paste('<p><ins data-author-id="ana" data-author-name="AnA (AI draft)" data-source-record="rec-1">Copied from her answer.</ins></p>');
    paste('<p><ins data-author-id="ana" data-author-name="AnA (AI draft)" data-source-record="rec-other">From another turn.</ins></p>');
    const marks = Array.from(document.querySelectorAll('.tiptap ins')).map((el) => [
      el.textContent,
      el.getAttribute('data-author-id'),
      el.getAttribute('data-source-record'),
    ]);
    expect(marks).toContainEqual(['Copied from her answer.', 'ana', 'rec-1']);
    expect(marks).toContainEqual(['From another turn.', 'author@test.co', null]);
  });
});
