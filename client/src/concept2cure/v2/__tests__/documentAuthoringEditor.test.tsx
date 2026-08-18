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
    // Honest confirmation that a revision was recorded server-side.
    expect(await screen.findByText(/revision was recorded/i)).toBeTruthy();
  });

  it('surfaces a failed save honestly and keeps the user’s text (no fabrication)', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
      if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
      if (method === 'PATCH' && url === '/api/authoring/sections/S1') {
        return { ok: false, status: 500, json: async () => ({ error: 'db unavailable' }) } as Response;
      }
      return ok({ success: true });
    });

    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(canvasText().length).toBeGreaterThan(0));

    canvasEditor().chain().focus().selectAll().insertContent('My unsaved edit').run();
    await waitFor(() => expect(canvasText()).toBe('My unsaved edit'));
    const saveBtn = screen.getByRole('button', { name: /Save/i }) as HTMLButtonElement;
    await waitFor(() => expect(saveBtn.disabled).toBe(false));
    fireEvent.click(saveBtn);

    expect(await screen.findByText(/Couldn’t save the section/i)).toBeTruthy();
    // The edit is preserved (not discarded, not replaced by a fake success).
    expect(canvasText()).toBe('My unsaved edit');
    // And the canvas says so: not persisted, still on this device.
    expect(await screen.findByText(/Save failed — kept on this device/i)).toBeTruthy();
  });
});
