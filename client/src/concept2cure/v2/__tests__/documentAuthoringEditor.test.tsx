// @vitest-environment jsdom
/**
 * Document Authoring editable canvas — proves the surface is wired to the REAL
 * governed authoring store (/api/authoring), not a fixture:
 *   • loads documents → sections and opens the selected section's real content
 *   • Save issues PATCH /api/authoring/sections/:id with the edited content and
 *     reports that a revision was recorded (auto-versioning is server-side)
 *   • a failed save is surfaced honestly and nothing is fabricated locally
 *
 * The canvas is the canonical RichSectionEditor (TipTap) — the textarea and
 * DocCanvas it replaced are gone. Content assertions read the ProseMirror
 * content element; edits are driven through the editor instance the content
 * element carries (`dom.editor`), the same engine user keystrokes drive.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
/* The real class. The mock below spreads `importOriginal`, so this is the
   same ApiRequestError the transport actually throws — which is the point:
   the fixture has to fail the way production fails. */
import { ApiRequestError } from '@/lib/queryClient';

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

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    if (method === 'GET' && url.startsWith('/api/authoring/sections/S1/history')) return ok({ success: true, revisions: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments')) return ok({ success: true, comments: [] });
    if (method === 'PATCH' && url === '/api/authoring/sections/S1') {
      return ok({ success: true, revision_created: true, section: { ...SECTIONS.sections[0], content: 'EDITED', revision_count: 3 } });
    }
    return ok({ success: true });
  });
});

describe('DocumentAuthoring — real editable canvas', () => {
  it('loads the document, opens its section, and shows the real server content in the editor', async () => {
    render(<DocumentAuthoring {...props()} />);
    // Real document from GET /api/authoring/docs (appears in tree + breadcrumb).
    expect((await screen.findAllByText('Nonclinical Overview')).length).toBeGreaterThan(0);
    // Auto-selected section's real content lands in the editor (not a fixture).
    await waitFor(() => {
      expect(canvasText()).toBe('The drug substance is a monoclonal antibody.');
    });
    // The canvas is the canonical editor, and it reads as a textbox.
    expect(canvasEl()?.getAttribute('role')).toBe('textbox');
  });

  it('saves edited content via PATCH and reports that a revision was recorded', async () => {
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(canvasText()).toBe('The drug substance is a monoclonal antibody.'));

    canvasEditor().chain().focus().selectAll().insertContent('Revised substance description.').run();
    await waitFor(() => expect(canvasText()).toBe('Revised substance description.'));
    /* §11.10(d) reason for change — Save stays disabled without one, so these
       tests state a reason exactly as an author now must. */
    fireEvent.change(screen.getByTestId('change-reason'), {
      target: { value: 'Corrected the substance description.' },
    });
    // The header Save button enables once the dirty state propagates.
    const saveBtn = screen.getByRole('button', { name: /Save/i }) as HTMLButtonElement;
    await waitFor(() => expect(saveBtn.disabled).toBe(false));
    fireEvent.click(saveBtn);

    // The write went to the real endpoint with the edited content (the store
    // holds the editor's serialization — HTML — of exactly those words).
    await waitFor(() => {
      const patch = apiRequest.mock.calls.find((c) => c[0] === 'PATCH');
      expect(patch).toBeTruthy();
      expect(patch![1]).toBe('/api/authoring/sections/S1');
      expect((patch![2] as any).content).toContain('Revised substance description.');
    });
    // Honest confirmation, keyed to the revision counter the server returned
    // (3) — not asserted from the 2xx alone.
    expect(await screen.findByText(/revision 3 recorded/i)).toBeTruthy();
  });

  it('surfaces a failed save honestly and keeps the user’s text (no fabrication)', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
      if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
      if (method === 'PATCH' && url === '/api/authoring/sections/S1') {
        /* THROWS, because the real `apiRequest` throws.
           This used to return `{ ok: false, status: 500 }`, which
           client/src/lib/queryClient.ts never produces for a non-2xx — it
           raises ApiRequestError. So the assertion below was exercising a
           branch in DocumentAuthoring that PRODUCTION COULD NOT REACH, and the
           surface's real behaviour on a failed save (an unbound catch, a 10px
           grey line, no reason) went untested and unnoticed while this stayed
           green. A fixture that cannot happen is worse than no fixture: it
           reports coverage of the case it is hiding. */
        const err = new ApiRequestError(
          'The section was not saved: its data lineage could not be recorded.',
          500,
          { error: { code: 'LINEAGE_REQUIRED' } },
          'LINEAGE_REQUIRED',
          'req-abc123',
        );
        throw err;
      }
      return ok({ success: true });
    });

    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(canvasText().length).toBeGreaterThan(0));

    canvasEditor().chain().focus().selectAll().insertContent('My unsaved edit').run();
    await waitFor(() => expect(canvasText()).toBe('My unsaved edit'));
    /* §11.10(d) reason for change — Save stays disabled without one. */
    fireEvent.change(screen.getByTestId('change-reason'), {
      target: { value: 'Reworded the opening paragraph.' },
    });
    const saveBtn = screen.getByRole('button', { name: /Save/i }) as HTMLButtonElement;
    await waitFor(() => expect(saveBtn.disabled).toBe(false));
    fireEvent.click(saveBtn);

    /* The server's OWN sentence reaches the author, with its correlation id —
       not "HTTP 500", and not a silent grey line. A lineage failure and a
       frozen record need different actions and must read differently. */
    expect(await screen.findByText(/its data lineage could not be recorded/i)).toBeTruthy();
    expect(screen.getByText(/Nothing was persisted/i)).toBeTruthy();
    expect(screen.getByText(/req-abc123/)).toBeTruthy();
    // The edit is preserved (not discarded, not replaced by a fake success).
    expect(canvasText()).toBe('My unsaved edit');
    // And the canvas says so: not persisted, still on this device.
    expect(await screen.findByText(/Save failed — kept on this device/i)).toBeTruthy();
  });
  it('moves the open section — server-validated reorder, tree redrawn from the canonical order', async () => {
    /* order_index is what the export assembles by, and nothing could change
       it before the reorder endpoint existed. This drives the real seam: the
       swap goes up as the FULL permutation, and the tree redraws from the
       canonical GET, never from a local echo. */
    const S2 = {
      id: 'S2', doc_id: 'D1', code: '3.2.S.2', title: 'Manufacture', content: 'Made carefully.',
      order_index: 1, comment_count: 0, revision_count: 1, citation_count: 0,
      updated_at: '2026-07-20T10:00:00Z',
    };
    const reorder = vi.fn();
    let order = ['S1', 'S2'];
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === 'GET' && url.startsWith('/api/authoring/docs?')) {
        return ok({ ...DOCS, documents: [{ ...DOCS.documents[0], section_count: 2 }] });
      }
      if (method === 'GET' && url === '/api/authoring/docs/D1/sections') {
        const byId: Record<string, unknown> = { S1: SECTIONS.sections[0], S2 };
        return ok({
          success: true,
          sections: order.map((id, i) => ({ ...(byId[id] as object), order_index: i })),
        });
      }
      if (method === 'POST' && url === '/api/authoring/docs/D1/sections/reorder') {
        reorder(body);
        order = (body as { section_ids: string[] }).section_ids;
        return ok({ success: true, order });
      }
      return ok({ success: true, revisions: [], comments: [], sources: [] });
    });

    render(<DocumentAuthoring {...props()} />);
    const down = await screen.findByRole('button', { name: 'Move 3.2.S.1 down' });
    fireEvent.click(down);

    await waitFor(() => expect(reorder).toHaveBeenCalledWith({ section_ids: ['S2', 'S1'] }));
    // The tree now lists 3.2.S.2 before 3.2.S.1 — the server's order, refetched.
    await waitFor(() => {
      const codes = Array.from(document.querySelectorAll('.ed-tree-row .ed-num')).map(
        (n) => n.textContent,
      );
      const a = codes.indexOf('3.2.S.2');
      const b = codes.indexOf('3.2.S.1');
      expect(a).toBeGreaterThan(-1);
      expect(b).toBeGreaterThan(-1);
      expect(a).toBeLessThan(b);
    });
    // The moved section stays open.
    expect(document.querySelector('.ed-mast-num')?.textContent).toBe('3.2.S.1');
  });
});

/* ── Document-level structure ────────────────────────────────────────────────
 *
 * Two facts no single section can show, and which the section tree looked
 * authoritative while hiding: a code filed under two sections, and a stored
 * order that disagrees with the codes. The tree renders in the stored order and
 * the export assembles from it, so an order nobody chose is an order nobody
 * sees is wrong (MDX_WORK_ORDER W1-2).
 */
describe('DocumentAuthoring — document-level section structure', () => {
  const withStructure = (structure: unknown, sections = SECTIONS.sections) => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
      if (method === 'GET' && url === '/api/authoring/docs/D1/sections') {
        return ok({ success: true, sections, structure });
      }
      if (method === 'GET' && url.startsWith('/api/authoring/sections/S1/history')) {
        return ok({ success: true, revisions: [] });
      }
      if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments')) {
        return ok({ success: true, comments: [] });
      }
      return ok({ success: true });
    });
    render(<DocumentAuthoring {...props()} />);
  };
  const text = () => document.body.textContent ?? '';

  it('names a section code that is used twice', async () => {
    withStructure({ duplicateCodes: ['3.2.S.1'], outOfOrder: false, suggestedOrder: [] });
    await waitFor(() => expect(text()).toContain('3.2.S.1 is used by more than one section'));
    expect(text()).toContain('cannot say which one a reference means');
  });

  it('says when the stored order differs from the section codes', async () => {
    withStructure({ duplicateCodes: [], outOfOrder: true, suggestedOrder: ['3.2.S.1'] });
    await waitFor(() => expect(text()).toContain('stored in an order that differs from their'));
    // And it says why that matters rather than only that it is so.
    expect(text()).toContain('assemble and export in the stored order');
  });

  it('says nothing when the document is structurally clean', async () => {
    withStructure({ duplicateCodes: [], outOfOrder: false, suggestedOrder: ['3.2.S.1'] });
    await waitFor(() => expect(screen.getAllByText('General Information').length).toBeGreaterThan(0));
    expect(text()).not.toContain('used by more than one section');
    expect(text()).not.toContain('stored in an order that differs');
  });

  it('claims nothing when the server sent no structure at all', async () => {
    // An older server. Absent evidence is not evidence of a clean document.
    withStructure(undefined);
    await waitFor(() => expect(screen.getAllByText('General Information').length).toBeGreaterThan(0));
    expect(text()).not.toContain('used by more than one section');
    expect(text()).not.toContain('stored in an order that differs');
  });
});
