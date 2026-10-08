// @vitest-environment jsdom
/**
 * A save says whether the text reached the filing (QA 2026-10-08, browser walk
 * j4-authoring, docs/evidence/QA-2026-10-08/authoring/).
 *
 * PATCH /api/authoring/sections/:id answers `filing: { committed: false,
 * reason }` when the document is not bound to a governed filing ("an unbound
 * save is legitimate, a silently unbound one is the drift", the route's own
 * comment). The workbench never read the field: every save said only "Section
 * saved — revision N recorded", so an author whose text never reached the
 * filing was not told. The confirmation now carries the server's answer.
 *
 * Harness: the one authoringReasonForChange.test.tsx uses (the real
 * DocumentAuthoring surface over a mocked transport).
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
// The collab presence layer (AuthoringCollab) reads the auth identity; give it
// a real-shaped user so the surface renders (it still joins no room here —
// these tests set no C2C_PROJECT, so the collab layer honestly renders null).
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));


/* jsdom implements no layout: ProseMirror's scroll-into-view (scheduled by
   insertContent and selection changes) asks Ranges, Elements and text nodes
   for client rects and crashes the worker when a node type lacks the method.
   Stub the geometry to empty — scrolling is meaningless in jsdom anyway. */
const emptyRects = function () { return [] as unknown as DOMRectList; };
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';
import type { Editor } from '@tiptap/core';

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

/** The canonical canvas's content element (ProseMirror mount point). */
function canvasEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.rse-body .tiptap');
}
function canvasText(): string {
  return (canvasEl()?.textContent ?? '').trim();
}
/** The live editor instance the content element carries — driving commands
 *  through it exercises the same transaction pipeline as typing. */
function canvasEditor(): Editor {
  const el = canvasEl() as (HTMLElement & { editor?: Editor }) | null;
  if (!el?.editor) throw new Error('editor not mounted');
  return el.editor;
}

const DOCS = {
  success: true,
  documents: [{ id: 'D1', title: 'Nonclinical Overview', module: 'M3', product_code: 'ABC', status: 'draft', updated_at: '2026-07-20T10:00:00Z', section_count: 1 }],
};
const SECTIONS = {
  success: true,
  sections: [{ id: 'S1', doc_id: 'D1', code: '3.2.S.1', title: 'General Information', content: 'The drug substance is a monoclonal antibody.', order_index: 0, comment_count: 0, revision_count: 2, citation_count: 1, updated_at: '2026-07-20T10:00:00Z' }],
};

function props() {
  return { surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' };
}

afterEach(() => cleanup());

/** What the server says about the filing on this save (PATCH /sections/:id `filing`). */
let filing: Record<string, unknown> | null = null;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    if (method === 'GET' && url.startsWith('/api/authoring/sections/S1/history')) return ok({ success: true, revisions: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments')) return ok({ success: true, comments: [] });
    if (method === 'PATCH' && url === '/api/authoring/sections/S1') {
      return ok({ success: true, revision_created: true, section: { ...SECTIONS.sections[0], content: 'EDITED', revision_count: 3 }, ...(filing ? { filing } : {}) });
    }
    return ok({ success: true });
  });
});



describe('the save confirmation carries whether the text reached the filing', () => {
  async function saveOnce() {
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(canvasText()).toBe('The drug substance is a monoclonal antibody.'));
    canvasEditor().chain().focus().selectAll().insertContent('Revised substance description.').run();
    await waitFor(() => expect(canvasText()).toBe('Revised substance description.'));
    fireEvent.change(screen.getByTestId('change-reason'), { target: { value: 'Corrected the potency limit.' } });
    const save = screen.getByRole('button', { name: /Save/i }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[0] === 'PATCH')).toBe(true));
  }

  beforeEach(() => { filing = null; });

  it('says the text did not reach the filing, with the server’s reason', async () => {
    filing = { committed: false, reason: 'This document is not bound to a filing, so there is no governed section to update.' };
    await saveOnce();
    await waitFor(() => expect(screen.getByText(/not in the filing/i)).toBeTruthy());
    expect(document.body.textContent).toContain('This document is not bound to a filing, so there is no governed section to update.');
  });

  it('says the text was committed to the filing when the server says so', async () => {
    filing = { committed: true, documentId: 'C1', sectionKey: '3.2.S.1' };
    await saveOnce();
    await waitFor(() => expect(screen.getByText(/committed to the filing/i)).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/not in the filing/i);
  });

  /* QA 2026-10-08, walk 2 (j4): a section of a document the outline files as
     one node (2.5.1 of the 2.5 Clinical Overview) reaches the filing as part of
     that node; the confirmation names the node it went to. */
  it('names the filing section a part-of save went into', async () => {
    filing = { committed: true, documentId: 'C1', sectionKey: '2.5', partOf: '2.5' };
    await saveOnce();
    await waitFor(() => expect(screen.getByText(/committed to the filing/i)).toBeTruthy());
    expect(document.body.textContent).toContain('committed to the filing as part of its section 2.5, with this document’s other sections under 2.5');
  });

  it('claims nothing about the filing when the server reported nothing', async () => {
    await saveOnce();
    await waitFor(() => expect(screen.getByText(/Section saved/i)).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/the filing/i);
  });
});
