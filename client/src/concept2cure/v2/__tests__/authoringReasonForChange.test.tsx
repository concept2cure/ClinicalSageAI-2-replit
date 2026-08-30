// @vitest-environment jsdom
/**
 * The reason for change: asked once per section, and never invented.
 *
 * ── The gap ──────────────────────────────────────────────────────────────────
 * §11.10(d)/(e) wants to know WHY a governed record changed. Nothing on this
 * surface ever asked. Only the AI-draft dialog sent `changeReason`, so every
 * ordinary save arrived without one — and the filing's version ledger recorded
 * that it was not stated, which was honest but empty. The reason the ledger had
 * nothing to record is that the editor never collected anything.
 *
 * ── Why it is sticky, not per-save ───────────────────────────────────────────
 * The shape this repo already settled on for the identical problem in
 * ProtocolDev's schedule-of-assessments grid: the governed router wants a
 * reason on every write, and "prompting per tick would be unusable — so the
 * reason is stated ONCE for the editing session… what the regulation does not
 * ask for is the same sentence retyped forty times." Save and Cmd-S each fire
 * many times while working through one section, and each is a real write.
 *
 * ── Why it gates SAVE and not EDITING ────────────────────────────────────────
 * The SoA grid can sit read-only until a reason is given because it is one
 * small governed table. This is the surface a writer spends the day in, and
 * locking the canvas would make the editor hostile to the work it exists for.
 * Type freely; state why before the record moves.
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


describe('the editor asks why, once per section', () => {
  async function openDirty(text = 'Revised substance description.') {
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(canvasText()).toBe('The drug substance is a monoclonal antibody.'));
    canvasEditor().chain().focus().selectAll().insertContent(text).run();
    await waitFor(() => expect(canvasText()).toBe(text));
  }
  const saveBtn = () => screen.getByRole('button', { name: /Save/i }) as HTMLButtonElement;
  const reasonField = () => screen.getByTestId('change-reason') as HTMLInputElement;
  const patches = () => apiRequest.mock.calls.filter((c) => c[0] === 'PATCH');

  it('will not save a governed record without one', async () => {
    await openDirty();
    await waitFor(() => expect(reasonField()).toBeTruthy());
    expect(saveBtn().disabled, 'a governed record could move with no stated reason').toBe(true);
    fireEvent.click(saveBtn());
    expect(patches()).toHaveLength(0);
  });

  it('says what is missing rather than just being inert', async () => {
    /* A disabled button with no explanation is a dead end. */
    await openDirty();
    expect(saveBtn().getAttribute('title')).toMatch(/say why/i);
  });

  it('carries the stated reason on the save', async () => {
    await openDirty();
    fireEvent.change(reasonField(), { target: { value: 'Corrected the potency limit.' } });
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    fireEvent.click(saveBtn());

    await waitFor(() => expect(patches().length).toBeGreaterThan(0));
    expect((patches()[0][2] as any).changeReason).toBe('Corrected the potency limit.');
  });

  it('does not accept whitespace as a reason', async () => {
    /* "   " satisfies a non-empty check while telling a reader nothing — the
       same fabrication in a quieter form. */
    await openDirty();
    fireEvent.change(reasonField(), { target: { value: '    ' } });
    expect(saveBtn().disabled).toBe(true);
  });

  it('stays stated across repeated saves of the same section', async () => {
    /* The point of sticky: the author states it once and keeps working. */
    await openDirty('First revision.');
    fireEvent.change(reasonField(), { target: { value: 'Aligning with the approved specification.' } });
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(patches().length).toBe(1));

    canvasEditor().chain().focus().selectAll().insertContent('Second revision.').run();
    await waitFor(() => expect(canvasText()).toBe('Second revision.'));
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
    fireEvent.click(saveBtn());

    await waitFor(() => expect(patches().length).toBe(2));
    expect((patches()[1][2] as any).changeReason).toBe('Aligning with the approved specification.');
  });

  it('refuses a Cmd-S that bypasses the button, and says so', async () => {
    /* The button's disabled attribute covers one path. The keyboard shortcut
       calls the editor's save directly, so the requirement lives in the save
       funnel too — and refuses VISIBLY, because an author who pressed Cmd-S
       and saw nothing would reasonably conclude their work was saved. */
    await openDirty();
    const canvas = canvasEl()!;
    fireEvent.keyDown(canvas, { key: 's', metaKey: true });
    await waitFor(() => expect(screen.getByText(/say why this section changed/i)).toBeTruthy());
    expect(patches()).toHaveLength(0);
  });
});
