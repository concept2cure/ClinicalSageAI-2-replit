// @vitest-environment jsdom
/**
 * The canonical conversation offers "Insert into <section> as tracked suggestion"
 * only for an answer every model of which may write governed content (AnA
 * reasoning round 11, GRD-missed, 2026-10-05). A refused offer is shown
 * DISABLED with its reason as visible text the control is described by
 * (GE-P-3), never hidden: the person sees why, and what to do.
 *
 * Round 13 (round 11's UI review): the reason names no control the pane does
 * not have, reads at the contrast the repo's own "why" text uses, an answer
 * that did not finish is refused, a pasted suggestion keeps the turn it came
 * from, and the toast names the section the text went into.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return {
    ...actual,
    authService: {
      // One account object, as AuthService.getUser() returns: the authoring read
      // session is owned by that reference (authoringCurrentRead.ts), so a fresh
      // object per call re-mints the session on every render and never settles.
      getUser: vi.fn().mockReturnValue({ id: 1, organizationId: 1 }),
      captureSessionReadGuard: actual.authService.captureSessionReadGuard.bind(actual.authService),
      on: actual.authService.on.bind(actual.authService),
    },
    useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
  };
});

import type { Editor } from '@tiptap/core';

import { CanonicalAuthoringFlow, setAuthoringFlowScope, clearAuthoringFlowScope, serveAuthoringStream, sendAuthoringPrefill } from './canonicalAuthoringFlow';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload } as Response);
const SHA = 'c'.repeat(64);
const ANSWER = 'The drug substance is a humanised IgG1 monoclonal antibody.';
const OPUS = { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'pending' };
const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5', qualified: false, approvedForHighRisk: false, pq: 'pending' };

function anaStream(turnRecord: unknown, done: Record<string, unknown> = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const events = [
    { type: 'text', content: ANSWER },
    { type: 'done', latencyMs: 300, ...done },
    { type: 'post_done', cleanedResponse: ANSWER, ...(turnRecord ? { turnRecord } : {}) },
  ];
  return new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
}

const doc = (status: string) => ({ id: 'dddddddd-0000-4000-8000-000000000001', title: 'Quality Overall Summary', module: 'M3', product_code: 'ABC', status, updated_at: '2026-07-20T10:00:00Z', section_count: 1 });
const docStatus = { current: 'draft' };
const DOCS = { success: true, get documents() { return [doc(docStatus.current)]; } };
const SECTIONS = {
  success: true,
  sections: [{
    id: 'aaaaaaaa-0000-4000-8000-000000000001', doc_id: 'dddddddd-0000-4000-8000-000000000001', code: '3.2.S.1', title: 'General Information', content: 'The drug substance is a monoclonal antibody.',
    order_index: 0, comment_count: 0, revision_count: 2, citation_count: 1, updated_at: '2026-07-20T10:00:00Z',
  }],
};

beforeEach(() => {
  setAuthoringFlowScope();
  docStatus.current = 'draft';
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    // The current read names its project (`?programId=`, authoringCurrentReadPath); the route is the path.
    if (method === 'GET' && url.split('?')[0] === '/api/authoring/docs/dddddddd-0000-4000-8000-000000000001') return ok({ document: DOCS.documents[0] });
    if (method === 'GET' && url.split('?')[0] === '/api/authoring/docs/dddddddd-0000-4000-8000-000000000001/sections') return ok(SECTIONS);
    if (method === 'GET' && url.startsWith('/api/authoring/sections/aaaaaaaa-0000-4000-8000-000000000001/history')) return ok({ success: true, revisions: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/dddddddd-0000-4000-8000-000000000001/comments')) return ok({ success: true, comments: [] });
    if (url.startsWith('/api/c2c/documents/')) return { ...ok({ success: false }), ok: false, status: 404 };
    return ok({ success: true });
  });
});

afterEach(() => {
  cleanup();
  clearAuthoringFlowScope();
  vi.unstubAllGlobals();
});

/** Navigate with exact saved context, explicitly send, then inspect the canonical insert offer. */
async function answeredWith(turnRecord: unknown, done?: Record<string, unknown>): Promise<{ pane: HTMLElement; insert: HTMLButtonElement }> {
  serveAuthoringStream(() => anaStream(turnRecord, done));
  render(<CanonicalAuthoringFlow />);
  await screen.findAllByText('General Information');
  fireEvent.click(screen.getByRole('button', { name: /^AnA/ }));
  const pane = await sendAuthoringPrefill('Describe the drug substance.');
  const insert = (await within(pane).findByRole('button', { name: 'Insert into 3.2.S.1 as tracked suggestion' }, { timeout: 4000 })) as HTMLButtonElement;
  return { pane, insert };
}

/** The visible text a control is described by. */
const describedBy = (el: HTMLElement): string => {
  const id = el.getAttribute('aria-describedby');
  return id ? document.getElementById(id)?.textContent ?? '' : '';
};

const anaSuggestion = () => document.querySelector('ins[data-author-id="ana"]');

describe('the canonical insert follows the governed-write rule', () => {
  it('an answer a model not approved for regulatory drafting wrote: disabled, and the reason is on screen', async () => {
    const { insert } = await answeredWith({ status: 'recorded', id: 'rec-1', sha256: SHA, servedBy: [SONNET] });
    await waitFor(() => expect(insert.disabled).toBe(true));
    expect(describedBy(insert)).toBe(
      'This answer was written by claude-sonnet-5, which is not approved for regulatory drafting, so the answer can’t be inserted.',
    );
    // The repo's own colour for the only text that says why (text-300), at 12px.
    const reason = document.getElementById(insert.getAttribute('aria-describedby') ?? '') as HTMLElement;
    expect([reason.style.color, reason.style.fontSize]).toEqual(['var(--text-300)', '12px']);
    fireEvent.click(insert);
    expect(anaSuggestion()).toBeNull();
  });

  it('a frozen document takes no insert, and the offer says so rather than failing on the click', async () => {
    docStatus.current = 'FROZEN';
    const { insert } = await answeredWith({ status: 'recorded', id: 'rec-1', sha256: SHA, servedBy: [OPUS] });
    await waitFor(() => expect(insert.disabled).toBe(true));
    // The product's own word for this state, as the sibling "Draft from sources" control uses it.
    expect(describedBy(insert)).toBe('This document is frozen — its content cannot be edited, so nothing can be inserted into it.');
    fireEvent.click(insert);
    expect(anaSuggestion()).toBeNull();
  });

  it('document view edits no section, so the offer says so instead of failing on the click', async () => {
    const { pane, insert } = await answeredWith({ status: 'recorded', id: 'rec-1', sha256: SHA, servedBy: [OPUS] });
    expect(insert.disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Document$/ }));
    const offer = (await within(pane).findByRole('button', { name: 'Insert into 3.2.S.1 as tracked suggestion' })) as HTMLButtonElement;
    await waitFor(() => expect(offer.disabled).toBe(true));
    expect(describedBy(offer)).toBe('Document view assembles sections for reading. Switch to Section view to insert into 3.2.S.1.');
  });

  it('an answer cut off before it finished: disabled, whoever wrote it', async () => {
    const { insert } = await answeredWith({ status: 'recorded', id: 'rec-1', sha256: SHA, servedBy: [OPUS] }, { stoppedReason: 'answer_cut_off' });
    await waitFor(() => expect(insert.disabled).toBe(true));
    expect(describedBy(insert)).toBe('This answer did not finish, so it can’t be inserted. Ask again to get a complete answer.');
  });

  it('an answer whose models the record does not give: disabled, failing closed', async () => {
    const { insert } = await answeredWith({ status: 'recorded', id: 'rec-1', sha256: SHA });
    await waitFor(() => expect(insert.disabled).toBe(true));
    expect(describedBy(insert)).toBe('This page has no record of which model wrote this answer, so the answer can’t be inserted. Ask again to get an answer with its own record.');
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
    // The toast names the section the text went into: the pane offers every past answer to the section open now.
    expect(await screen.findByText('Inserted into 3.2.S.1 as tracked suggestions — review each edit in the editor, then save.')).toBeTruthy();
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
    expect(marks).toContainEqual(['From another turn.', 'author@test.co', 'rec-other']);
  });
});
