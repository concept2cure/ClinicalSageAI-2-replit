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
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(),
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

/** A refused family target read no filing and searched no document (the pre-3d9879dfc7 path read D2's sections). */
function expectNoFilingSearch() {
  expect(apiRequest.mock.calls.filter(([, url]) => String(url).startsWith('/api/c2c'))).toEqual([]);
  expect(apiRequest.mock.calls.some(([, url]) => String(url).split('?')[0] === '/api/authoring/docs/D2/sections')).toBe(false);
}

/** GET /api/c2c/documents as server/routes/c2c/documents.ts answers it: each row's project_id, filtered by `docType` and `scope`. */
function c2cDocuments(url: string, home: Array<{ doc_type: string }>, market: Array<{ doc_type: string }> = []) {
  const query = new URLSearchParams(url.split('?')[1]);
  const scoped = query.get('scope') === 'market' ? market : query.get('scope') === 'home' ? home : [...home, ...market];
  const docType = query.get('docType');
  return { documents: scoped.filter(row => docType === null || row.doc_type === docType).map(row => ({ ...row, project_id: query.get('projectId') })) };
}

beforeEach(() => {
  clearEditorTarget();
  clearNavParams();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url.split('?')[0] === '/api/authoring/docs/D1/sections') return ok(D1_SECTIONS);
    if (method === 'GET' && url.split('?')[0] === '/api/authoring/docs/D2/sections') return ok(D2_SECTIONS);
    return ok({ success: true });
  });
});

afterEach(() => {
  cleanup();
  clearEditorTarget();
  clearNavParams();
  window.history.replaceState(null, '', '/');
});

describe('DocumentAuthoring — editor deep-link target', () => {
  it('F19: a copied exact document URL restores its section without a window handoff', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url.startsWith('/api/authoring/docs?')) return ok({documents:[DOCS.documents[0],{...DOCS.documents[1],id}]});
      if (url === `/api/authoring/docs/${id}/sections`) return ok({sections:D2_SECTIONS.sections.map(section=>({...section,doc_id:id}))});
      if (url === '/api/authoring/docs/D1/sections') return ok(D1_SECTIONS);
      return ok({success:true});
    });
    window.history.replaceState(null, '', `/concept2cure/document-authoring?documentId=${id}&sectionCode=11`);
    render(<DocumentAuthoring {...props()}/>);
    await waitFor(()=>expect(canvasText()).toBe('SE discussion body.'));
  });
  it('F19: receives another exact document/section after the Authoring screen is already mounted', async () => {
    render(<DocumentAuthoring {...props()} />);
    await waitFor(()=>expect(canvasText()).toBe('Default document content.'));
    act(()=>setEditorTarget({docType:null,docId:'D2',code:'11'}));
    await waitFor(()=>expect(canvasText()).toBe('SE discussion body.'));
    act(()=>setEditorTarget({docType:null,docId:'D1',code:'3.2.S.1'}));
    await waitFor(()=>expect(canvasText()).toBe('Default document content.'));
  });
  /* A named family (docType) resolves against the open project's exact filing
     (3d9879dfc7, filingSectionTarget.ts), never by searching the documents in
     scope. With no project open there is no filing to resolve: the target is
     consumed and refused with the reason, and the default view stays. */
  it('consumes a 510(k) section target with no project open and refuses it with the reason, reading no filing', async () => {
    setEditorTarget({
      docType: 'k510',
      code: 11,
      label: 'Substantial Equivalence Discussion',
    });

    render(<DocumentAuthoring {...props()} />);

    // The channel is one-shot: cleared on mount, hit or miss.
    await waitFor(() => expect(window.C2C_EDITOR_TARGET).toBeUndefined());

    expect(await screen.findByText('Couldn’t open “Substantial Equivalence Discussion” (section 11) — Open the target project before opening its filing.')).toBeTruthy();
    await waitFor(() => expect(canvasText()).toBe('Default document content.'));
    expectNoFilingSearch();
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

  it('refuses an unmatched 510(k) section target with no project open the same way, over the default view', async () => {
    setEditorTarget({
      docType: 'k510',
      code: 'ZZ',
      label: 'No Such Section',
    });

    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(window.C2C_EDITOR_TARGET).toBeUndefined());

    // The refusal names what was asked for and why; nothing was searched for it…
    expect(await screen.findByText('Couldn’t open “No Such Section” (section ZZ) — Open the target project before opening its filing.')).toBeTruthy();
    // …over the DEFAULT view, which still works (D1's first section).
    await waitFor(() => {
      expect(canvasText()).toBe('Default document content.');
    });
    expectNoFilingSearch();
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

describe('a family target resolves against the open project’s exact filing (3d9879dfc7)', () => {
  it('with its project open, a 510(k) section target opens that section in the filing’s working copy', async () => {
    const project = '44444444-4444-4444-8444-444444444510';
    const filing = { id: 'K510-FILING', doc_type: 'k510', agency: 'fda', title: '510(k) notification', rule_pack_version: 'v1', status: 'draft', readiness: 0 };
    // As authoring-document-read.ts states them: D1 an unbound draft, D2 the filing's editing copy.
    const copies = [{ ...DOCS.documents[0], c2c_document_id: null }, { ...DOCS.documents[1], c2c_document_id: filing.id }];
    const node = { key: '11', parent_key: null, label: 'Substantial Equivalence Discussion', mandatory: true, path_order: 1, status: 'todo', draft_source: null, has_content: true, version: 1 };
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: project };
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      const path = url.split('?')[0];
      const copy = copies.find(d => path === `/api/authoring/docs/${d.id}`);
      if (url.startsWith('/api/authoring/docs?')) return ok({ success: true, documents: copies.map(d => ({ ...d, program_id: project })) });
      if (copy) return ok({ success: true, document: { ...copy, client_program_id: project } });
      if (path === '/api/authoring/docs/D1/sections') return ok(D1_SECTIONS);
      if (path === '/api/authoring/docs/D2/sections') return ok(D2_SECTIONS);
      if (path === '/api/c2c/documents') return ok(c2cDocuments(url, [filing]));
      if (path === `/api/c2c/documents/${filing.id}/outline`) return ok({ document: filing, outline: [node] });
      return ok({ success: true });
    });
    setEditorTarget({ docType: 'k510', code: 11, label: 'Substantial Equivalence Discussion' });

    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(window.C2C_EDITOR_TARGET).toBeUndefined());

    expect(await screen.findByText('Opened 11 · Substantial Equivalence Discussion — 510(k) filing.')).toBeTruthy();
    await waitFor(() => expect(canvasText()).toBe('SE discussion body.'));
    expect(apiRequest.mock.calls.some(([, url]) => url === `/api/c2c/documents?projectId=${project}&docType=k510`)).toBe(true);
    expect(screen.queryByText(/Couldn’t/)).toBeNull();
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

describe('an exact document target keeps its returned section identity', () => {
  it('opens the returned code inside only the saved document, including a non-first section', async () => {
    const baseline = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string) => url.split('?')[0] === '/api/authoring/docs/D2/sections' ? Promise.resolve(ok({ sections: [
      { ...D2_SECTIONS.sections[0], id: 'S20', code: '10', content: 'Earlier section.' }, D2_SECTIONS.sections[0],
    ] })) : baseline(method, url));
    setEditorTarget({ docId: 'D2', docType: null, code: '11' }); render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(canvasText()).toBe('SE discussion body.'));
  });
  it('refuses a code absent from the named document even when another document holds it', async () => {
    setEditorTarget({ docId: 'D1', docType: null, code: '11' }); render(<DocumentAuthoring {...props()} />);
    await screen.findByText(/section 11 could not be resolved uniquely/);
    expect(canvasText()).toBe('Default document content.');
    expect(apiRequest.mock.calls.some(c => c[1] === '/api/authoring/docs/D2/sections')).toBe(false);
  });
});

describe('a target within a module lands on the document\'s first section in it (F3, a Project home module row)', () => {
  const ctd = (id: string, code: string, order: number, content: string) => ({ ...D2_SECTIONS.sections[0], id, code, title: code, content, order_index: order });
  const serveD2 = (sections: unknown[]) => {
    const baseline = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string) => url.split('?')[0] === '/api/authoring/docs/D2/sections'
      ? Promise.resolve(ok({ sections })) : baseline(method, url));
  };
  it('opens the module\'s first section by order, not the document\'s first', async () => {
    serveD2([ctd('S10', '1.1', 0, 'Cover letter.'), ctd('S25', '2.5', 2, 'Clinical overview.'), ctd('S24', '2.4', 1, 'Nonclinical overview.')]);
    setEditorTarget({ docId: 'D2', docType: null, within: 'M2' }); render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(canvasText()).toBe('Nonclinical overview.'));
  });
  it('an exact code wins over a module when a target carries both', async () => {
    serveD2([ctd('S24', '2.4', 0, 'Nonclinical overview.'), ctd('S21', '11', 1, 'SE discussion body.')]);
    setEditorTarget({ docId: 'D2', docType: null, code: '11', within: 'M2' }); render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(canvasText()).toBe('SE discussion body.'));
  });
  it('with nothing of the module started, opens the document and says so', async () => {
    serveD2([ctd('S10', '1.1', 0, 'Cover letter.')]);
    setEditorTarget({ docId: 'D2', docType: null, within: 'M5' }); render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(canvasText()).toBe('Cover letter.'));
    expect(await screen.findByText(/No section of Module 5 has been started in this document yet/)).toBeTruthy();
  });
});

it('a saved copy with no assigned module is labelled as an unbound draft', async () => {
  const baseline = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation((method: string, url: string) => url.startsWith('/api/authoring/docs?')
    ? Promise.resolve(ok({ documents: [{ ...DOCS.documents[1], module: null, c2c_document_id: null }] })) : baseline(method, url));
  setEditorTarget({ docId: 'D2', docType: null }); render(<DocumentAuthoring {...props()} />);
  await waitFor(() => expect(canvasText()).toBe('SE discussion body.'));
  /* D4-2: the crumbs' module word is in the outline's header (D4.md §D4.B, §D4.C). */
  expect(screen.getByTestId('ed-tree-p').textContent).toContain('Unbound draft');
});
