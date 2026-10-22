// @vitest-environment jsdom
/** Exact editor targets retain the current native write and unsaved-work decision. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual,
    useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
    // The editor keys its device draft by the signed-in account (SEC-A-5).
    authService: { getUser: () => null,
      captureSessionReadGuard: actual.authService.captureSessionReadGuard.bind(actual.authService),
      on: actual.authService.on.bind(actual.authService) },
  };
});

/* jsdom implements no layout; ProseMirror's scroll-into-view asks for client
   rects and crashes the worker when a node type lacks the method. */
const emptyRects = function () {
  return [] as unknown as DOMRectList;
};
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<
  Record<string, unknown>
>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';
import { DocumentWorkbench } from '../editor/DocumentWorkbench';
import type { Editor } from '@tiptap/core';
import { clearEditorTarget, setEditorTarget } from '../editorTarget';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;

function canvasEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.rse-body .tiptap');
}
function canvasText(): string {
  return (canvasEl()?.textContent ?? '').trim();
}
function canvasEditor(): Editor {
  const el = canvasEl() as (HTMLElement & { editor?: Editor }) | null;
  if (!el?.editor) throw new Error('editor not mounted');
  return el.editor;
}
/** The header's governed Save control (its label tracks state: Save/Saved/Saving…). */
function headerSave(): HTMLButtonElement {
  // In the header's commit group (QA 2026-10-08, walk 2, j5), found by its id.
  const btn = document.querySelector<HTMLButtonElement>('[data-testid="save-section"]');
  if (!btn) throw new Error('header Save button not mounted');
  return btn;
}
/** The section code the masthead says is open. */
function openSectionCode(): string {
  return (document.querySelector('.ed-mast-num')?.textContent ?? '').trim();
}
/** Every governed section write this surface issued. */
function sectionPatches(): unknown[][] {
  return apiRequest.mock.calls.filter(
    c => c[0] === 'PATCH' && String(c[1]).startsWith('/api/authoring/sections/')
  );
}
/** Content-bearing writes only — a track-changes flip is a different act. */
function contentPatches(): unknown[][] {
  return sectionPatches().filter(c => (c[2] as { content?: unknown } | undefined)?.content !== undefined);
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
      section_count: 2,
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
    {
      id: 'S2',
      doc_id: 'D1',
      code: '3.2.S.2',
      title: 'Manufacture',
      content: 'Manufactured at the Basel site.',
      order_index: 1,
      comment_count: 0,
      revision_count: 1,
      citation_count: 0,
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

function mockApi(over?: (method: string, url: string, body?: unknown) => Response | null) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    const custom = over?.(method, url, body);
    if (custom) return custom;
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    if (method === 'GET' && url.startsWith('/api/authoring/sections/'))
      return ok({ success: true, revisions: [], sources: [], citations: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments'))
      return ok({ success: true, comments: [] });
    if (method === 'PATCH' && url.startsWith('/api/authoring/sections/')) {
      const id = url.split('/').pop();
      const row = SECTIONS.sections.find(s => s.id === id)!;
      return ok({
        success: true,
        revision_created: true,
        section: { ...row, content: String((body as { content?: string })?.content ?? row.content) },
      });
    }
    return ok({ success: true });
  });
}

/** Open the surface with §3.2.S.1 dirty. */
async function renderDirty() {
  render(<DocumentAuthoring {...props()} />);
  await waitFor(() => expect(canvasText()).toBe('The drug substance is a monoclonal antibody.'));
  canvasEditor().chain().focus().selectAll().insertContent('Half-written sentence that').run();
  await waitFor(() => expect(canvasText()).toBe('Half-written sentence that'));
  /* §11.10(d) reason for change. Save stays disabled until it is given, so the
     surface cannot move a governed record without one — stated here exactly as
     an author now must, since this helper's job is to reach a SAVEABLE dirty
     state, not to test the reason gate (which has its own suite). */
  fireEvent.change(screen.getByTestId('change-reason'), {
    target: { value: 'Continuing the drug-substance description.' },
  });
  await waitFor(() => expect(headerSave().disabled).toBe(false));
}

beforeEach(() => {
  apiRequest.mockReset();
  clearEditorTarget();
  mockApi();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({}) }))
  );
});
afterEach(() => {
  cleanup();
  clearEditorTarget();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete window.C2C_PROJECT;
});

function heldResponse() { let resolve!: (value: Response) => void; const promise = new Promise<Response>(done => { resolve = done; }); return { promise, resolve }; }

describe('same-surface editor targets respect the current native write', () => {
  it('refuses an incoming target while a save is pending without starting another section read', async () => {
    await renderDirty();
    const save = heldResponse();
    const baseline = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string, body?: unknown) =>
      method === 'PATCH' && url.endsWith('/S1') ? save.promise : baseline(method, url, body));
    fireEvent.click(headerSave());
    await waitFor(() => expect(headerSave().textContent).toContain('Saving'));
    const reads = apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && url === '/api/authoring/docs/D1/sections').length;

    act(() => { setEditorTarget({ docType: null, docId: 'D1', code: '3.2.S.2' }); });

    expect(await screen.findByText(/A save is in progress/)).toBeTruthy();
    expect(apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && url === '/api/authoring/docs/D1/sections')).toHaveLength(reads);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(openSectionCode()).toBe('3.2.S.1');
    expect(canvasText()).toBe('Half-written sentence that');
    await act(async () => { save.resolve(ok({ section: { ...SECTIONS.sections[0], content: '<p>Half-written sentence that</p>' } })); await save.promise; });
    expect(contentPatches()).toHaveLength(1);
    expect(openSectionCode()).toBe('3.2.S.1');
  });

  it.each(['exact document', 'section search'])('rechecks the current busy state after the %s read finishes', async target => {
    await renderDirty();
    const sections = heldResponse();
    const save = heldResponse();
    const baseline = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string, body?: unknown) => {
      if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return sections.promise;
      if (method === 'PATCH' && url.endsWith('/S1')) return save.promise;
      return baseline(method, url, body);
    });
    const reads = apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && url === '/api/authoring/docs/D1/sections').length;
    act(() => { setEditorTarget({ docType: null, ...(target === 'exact document' ? { docId: 'D1' } : {}), code: '3.2.S.2' }); });
    await waitFor(() => expect(apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && url === '/api/authoring/docs/D1/sections')).toHaveLength(reads + 1));
    fireEvent.click(headerSave());
    await waitFor(() => expect(headerSave().textContent).toContain('Saving'));

    await act(async () => { sections.resolve(ok(SECTIONS)); await sections.promise; });

    expect(await screen.findByText(/A save is in progress/)).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(openSectionCode()).toBe('3.2.S.1');
    expect(canvasText()).toBe('Half-written sentence that');
    await act(async () => { save.resolve(ok({ section: { ...SECTIONS.sections[0], content: '<p>Half-written sentence that</p>' } })); await save.promise; });
    expect(contentPatches()).toHaveLength(1);
    expect(openSectionCode()).toBe('3.2.S.1');
  });

  it('keeps a document target waiting for the list from replacing an editor whose save has started', async () => {
    const docs = [...DOCS.documents, { ...DOCS.documents[0], id: 'D2', title: 'Another working document' }];
    const host = { onNav: vi.fn(), docs, status: 'all', reloadDocs: async () => {}, programId: null, consumeDeepLinks: true };
    const { rerender } = render(<DocumentWorkbench {...host} docsState="ready" />);
    await waitFor(() => expect(canvasText()).toBe('The drug substance is a monoclonal antibody.'));
    act(() => { canvasEditor().chain().focus().insertContent('Pending revision. ').run(); });
    fireEvent.change(screen.getByTestId('change-reason'), { target: { value: 'Reviewing the current working document.' } });
    rerender(<DocumentWorkbench {...host} docsState="loading" />);
    act(() => { setEditorTarget({ docType: null, docId: 'D2' }); });
    const save = heldResponse();
    const baseline = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string, body?: unknown) =>
      method === 'PATCH' && url.endsWith('/S1') ? save.promise : baseline(method, url, body));
    await waitFor(() => expect(headerSave().disabled).toBe(false));
    fireEvent.click(headerSave());
    await waitFor(() => expect(headerSave().textContent).toContain('Saving'));

    rerender(<DocumentWorkbench {...host} docsState="ready" />);

    expect(await screen.findByText(/A save is in progress/)).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(openSectionCode()).toBe('3.2.S.1');
    const content = canvasEditor().getHTML();
    await act(async () => { save.resolve(ok({ section: { ...SECTIONS.sections[0], content } })); await save.promise; });
    expect(contentPatches()).toHaveLength(1);
    expect(openSectionCode()).toBe('3.2.S.1');
  });

  it('uses the existing unsaved-work decision for a section-only target and preserves Cancel', async () => {
    await renderDirty();
    act(() => { setEditorTarget({ docType: null, code: '3.2.S.2' }); });

    const guard = await screen.findByRole('alertdialog', { name: /Unsaved/i });

    expect(openSectionCode()).toBe('3.2.S.1');
    expect(canvasText()).toBe('Half-written sentence that');
    fireEvent.click(within(guard).getByRole('button', { name: /^Cancel$/ }));
    expect(openSectionCode()).toBe('3.2.S.1');
    expect(canvasText()).toBe('Half-written sentence that');
    expect(contentPatches()).toHaveLength(0);
  });
});
