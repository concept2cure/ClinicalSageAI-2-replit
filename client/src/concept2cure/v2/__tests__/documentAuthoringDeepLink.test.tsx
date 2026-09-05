// @vitest-environment jsdom
/**
 * Document Authoring honours the editor deep-link target
 * (window.C2C_EDITOR_TARGET, set by the device workbenches' "Open in editor"
 * affordances via v2/editorTarget.ts):
 *   • consume-and-clear — the channel is one-shot: whatever the mount finds on
 *     the window is gone afterwards, hit or miss
 *   • a resolvable target opens the named document AND section, even when it is
 *     not the document the editor would have defaulted to
 *   • an unresolvable target lands on the DEFAULT view with an honest notice —
 *     never a silent wrong-document open
 *   • a target scoped to a different program is refused (fail closed), not
 *     resolved into whatever program happens to be in scope
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
import { clearEditorTarget, setEditorTarget } from '../editorTarget';
import { clearNavParams, stashNavParamsForTarget } from '../navParams';

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

/** Text of the canonical canvas (RichSectionEditor's ProseMirror mount). */
function canvasText(): string {
  return (document.querySelector('.rse-body .tiptap')?.textContent ?? '').trim();
}

/* Two draft documents in scope. D1 is the editor's default (first row); the
   deep-linked section lives in D2 — the resolution has to LOOK, not assume. */
const DOCS = {
  success: true,
  documents: [
    { id: 'D1', title: 'Nonclinical Overview', module: 'M3', product_code: 'ABC', status: 'draft', updated_at: '2026-08-01T10:00:00Z', section_count: 1 },
    { id: 'D2', title: '510(k) Submission', module: 'M1', product_code: 'ABC', status: 'draft', updated_at: '2026-07-20T10:00:00Z', section_count: 1 },
  ],
};
const D1_SECTIONS = {
  success: true,
  sections: [{ id: 'S1', doc_id: 'D1', code: '3.2.S.1', title: 'General Information', content: 'Default document content.', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: '2026-08-01T10:00:00Z' }],
};
const D2_SECTIONS = {
  success: true,
  sections: [{ id: 'S21', doc_id: 'D2', code: '11', title: 'Substantial Equivalence Discussion', content: 'SE discussion body.', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: '2026-07-20T10:00:00Z' }],
};

function props() {
  return { surface: { id: 'document-authoring', label: 'Authoring' } as any, onNav: vi.fn(), segment: 'medtech' };
}

beforeEach(() => {
  clearEditorTarget();
  clearNavParams();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(D1_SECTIONS);
    if (method === 'GET' && url === '/api/authoring/docs/D2/sections') return ok(D2_SECTIONS);
    return ok({ success: true });
  });
});

afterEach(() => {
  cleanup();
  clearEditorTarget();
  clearNavParams();
});

describe('DocumentAuthoring — editor deep-link target', () => {
  it('consumes the target, clears the channel, and opens the named document + section', async () => {
    setEditorTarget({
      docType: 'k510',
      code: 11,
      label: 'Substantial Equivalence Discussion',
    });

    render(<DocumentAuthoring {...props()} />);

    // The channel is one-shot: cleared on mount, hit or miss.
    await waitFor(() => expect(window.C2C_EDITOR_TARGET).toBeUndefined());

    // The named section — in D2, NOT the default document — is open in the
    // canvas with its real content.
    await waitFor(() => {
      expect(canvasText()).toBe('SE discussion body.');
    });
    // …and the masthead shows the section identity the click named.
    expect(screen.getByRole('heading', { name: 'Substantial Equivalence Discussion' })).toBeTruthy();
    // The hand-off is stated, naming the workspace family it came from.
    expect(await screen.findByText(/from the 510\(k\) workspace/i)).toBeTruthy();
    // No honest-miss notice — the target resolved.
    expect(screen.queryByText(/Couldn’t find/)).toBeNull();
  });

  it('a docId target opens the EXACT document — no search, not the default', async () => {
    // The strongest claim a sender can make: the correspondence card holds the
    // linked response draft's id. D2 is NOT the default (D1 is first).
    setEditorTarget({ docType: null, docId: 'D2' });

    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(window.C2C_EDITOR_TARGET).toBeUndefined());

    // D2's section is on the canvas — the id resolved directly.
    await waitFor(() => {
      expect(canvasText()).toBe('SE discussion body.');
    });
    expect(await screen.findByText(/Opened “510\(k\) Submission” — the linked document/)).toBeTruthy();
    expect(screen.queryByText(/Couldn’t open/)).toBeNull();
  });

  it('a docId not in scope lands on the default view with an honest miss — never a near-miss open', async () => {
    setEditorTarget({ docType: null, docId: 'D-GONE' });

    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(window.C2C_EDITOR_TARGET).toBeUndefined());

    const notice = await screen.findByText(/Couldn’t open the linked document/);
    expect(notice.textContent).toMatch(/default view/i);
    await waitFor(() => {
      expect(canvasText()).toBe('Default document content.');
    });
  });

  it('shows the honest miss notice and falls back to the default view when nothing matches', async () => {
    setEditorTarget({
      docType: 'k510',
      code: 'ZZ',
      label: 'No Such Section',
    });

    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(window.C2C_EDITOR_TARGET).toBeUndefined());

    // The miss is said out loud, naming what could not be found…
    const notice = await screen.findByText(/Couldn’t find “No Such Section” \(section ZZ\)/);
    expect(notice.textContent).toMatch(/default view/i);
    // …over the DEFAULT view, which still works (D1's first section).
    await waitFor(() => {
      expect(canvasText()).toBe('Default document content.');
    });
  });

  it('refuses a target scoped to a different program — fail closed, with the reason', async () => {
    setEditorTarget({
      docType: 'k510',
      code: 11,
      label: 'Substantial Equivalence Discussion',
      programId: 'prog-elsewhere',
      programTitle: 'OR-801 Orthopedic Screw System',
    });

    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(window.C2C_EDITOR_TARGET).toBeUndefined());

    // Refused with the program named — NOT resolved into this scope's D2,
    // even though a section matching the code exists there.
    const notice = await screen.findByText(/OR-801 Orthopedic Screw System/);
    expect(notice.textContent).toMatch(/Couldn’t open/);
    await waitFor(() => {
      expect(canvasText()).toBe('Default document content.');
    });
  });

  it('a mount with no pending target behaves exactly as before — default view, no notice', async () => {
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => {
      expect(canvasText()).toBe('Default document content.');
    });
    expect(screen.queryByText(/Couldn’t (find|open)/)).toBeNull();
  });
});

describe('DocumentAuthoring — navigation-directive hand-off (window.C2C_NAV_PARAMS)', () => {
  it('a sectionCode from navigate_to opens the named section via the same bounded search', async () => {
    // 'section-workspace' is the registry target; its alias resolves to this
    // surface, which is exactly the id the channel keys on.
    stashNavParamsForTarget('section-workspace', { sectionCode: '11' });

    render(<DocumentAuthoring {...props()} />);

    // One-shot: consumed on mount, hit or miss.
    await waitFor(() => expect(window.C2C_NAV_PARAMS).toBeUndefined());
    // The named section — in D2, NOT the default document — is open.
    await waitFor(() => {
      expect(canvasText()).toBe('SE discussion body.');
    });
    // The hand-off is stated without inventing a workspace family (the
    // directive claimed none).
    expect(await screen.findByText(/as requested in chat/i)).toBeTruthy();
    expect(screen.queryByText(/Couldn’t find/)).toBeNull();
  });

  it('an authoringDocType from navigate_to opens the matching document by title', async () => {
    stashNavParamsForTarget('authoring', { authoringDocType: 'Submission' });

    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(window.C2C_NAV_PARAMS).toBeUndefined());

    // D2 ('510(k) Submission') matches; its first section becomes the canvas.
    await waitFor(() => {
      expect(canvasText()).toBe('SE discussion body.');
    });
    expect(await screen.findByText(/Opened “510\(k\) Submission”/)).toBeTruthy();
    expect(screen.queryByText(/Couldn’t find/)).toBeNull();
  });

  it('an unmatchable authoringDocType lands on the default view with an honest notice', async () => {
    stashNavParamsForTarget('authoring', { authoringDocType: 'Investigator Brochure' });

    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(window.C2C_NAV_PARAMS).toBeUndefined());

    const notice = await screen.findByText(/Couldn’t find a document matching “Investigator Brochure”/);
    expect(notice.textContent).toMatch(/default view/i);
    await waitFor(() => {
      expect(canvasText()).toBe('Default document content.');
    });
  });
});
