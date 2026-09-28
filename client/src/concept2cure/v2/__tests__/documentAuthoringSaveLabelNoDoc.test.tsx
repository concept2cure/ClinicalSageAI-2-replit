// @vitest-environment jsdom
/**
 * DocumentAuthoring — the header's Save control only says "Saved" about a
 * section that is open.
 *
 * ── The finding (launch sweep, empty org) ────────────────────────────────────
 * With no document at all the crumb read "eCTD › No document" and the page
 * "Nothing to edit yet", and the toolbar still read "Saved". The label was
 * `saving ? … : docSealed ? … : dirty ? 'Save' : 'Saved'`, and `dirty` is false
 * whenever no section is open — so it fell through to a claim about a save
 * state nothing had. On a Part 11 editor "Saved" is a statement about the
 * record. The control now reads "Save" (disabled, with the reason) until a
 * section is open, and "Saved" once one is open and matches the server.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'ra@example.test', displayName: 'R. Author' } }),
}));

/* jsdom has no layout; ProseMirror asks for client rects on mount (same shim
   as documentAuthoringHonestReads.test.tsx). */
const emptyRects = function () {
  return [] as unknown as DOMRectList;
};
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload } as Response);

const DOCS = {
  success: true,
  documents: [
    { id: 'D1', title: 'Nonclinical Overview', module: 'M3', product_code: 'ABC', status: 'draft', updated_at: null, section_count: 1 },
  ],
};
const SECTIONS = {
  success: true,
  sections: [
    { id: 'S1', doc_id: 'D1', code: '3.2.S.1', title: 'General Information', content: '<p>Text.</p>', order_index: 0, comment_count: 0, revision_count: 1, citation_count: 0, updated_at: null },
  ],
};

function props() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' };
}

function wire(docs: unknown) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    const u = String(url ?? '');
    if (method === 'GET' && u.startsWith('/api/authoring/docs?')) return ok(docs);
    if (method === 'GET' && u === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    return ok({ success: true, revisions: [], comments: [], sources: [], templates: [] });
  });
}

const saveButton = () => screen.getByTestId('save-section') as HTMLButtonElement;

beforeEach(() => {
  apiRequest.mockReset();
  try { localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => cleanup());

describe('DocumentAuthoring — the Save control with nothing open', () => {
  it('does not say "Saved" when the organization has no document', async () => {
    wire({ success: true, documents: [] });
    render(<DocumentAuthoring {...props()} />);
    await screen.findByText('Nothing to edit yet');

    const btn = saveButton();
    expect(btn.textContent ?? '', 'no section is open, so nothing has a save state').not.toMatch(/Saved/);
    expect((btn.textContent ?? '').trim()).toBe('Save');
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toBe('Open a section to edit and save it.');
  });

  it('still says "Saved" once a section is open and unchanged (over-correction guard)', async () => {
    wire(DOCS);
    render(<DocumentAuthoring {...props()} />);
    // Wait on the section being OPEN (the masthead names it), not on the label:
    // the unfixed label said "Saved" before anything had loaded.
    await waitFor(() =>
      expect(document.querySelector('.ed-mast-num')?.textContent ?? '').toContain('3.2.S.1'),
    );
    expect((saveButton().textContent ?? '').trim()).toBe('Saved');
    expect(saveButton().getAttribute('title')).toBeNull();
  });
});
