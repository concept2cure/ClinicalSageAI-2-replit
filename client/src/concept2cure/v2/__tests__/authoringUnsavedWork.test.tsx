// @vitest-environment jsdom
/**
 * Unsaved work in the flagship authoring canvas.
 *
 * RichSectionEditor supports a debounced autosave (`autosaveMs`), and the MDX
 * dossier drawer uses it. DocumentAuthoring deliberately does NOT: its save
 * path is `PATCH /api/authoring/sections/:id`, which in ONE transaction mints a
 * `doc_revisions` row (an append-only hash chain), writes a Part 11 audit row
 * with before/after SHA-256, and commits the working copy into `c2c_documents`
 * — the filing itself. A 600ms debounce against that endpoint would mint a
 * revision per pause and commit half-written text into the record.
 *
 * So the protection here is NOT "save more often". It is:
 *   1. no server write ever happens without a deliberate, attributable act;
 *   2. the browser refuses to discard the tab while work is unsaved;
 *   3. navigating away from a dirty section is held, named, and decided by the
 *      author — never a silent unmount;
 *   4. work that is not in the record is described as not being in the record.
 *
 * Each test below fails against the behaviour that shipped before this file.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));

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
import type { Editor } from '@tiptap/core';

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
  const btn = document.querySelector<HTMLButtonElement>('.ed-doc-actions .btn.primary');
  if (!btn) throw new Error('header Save button not mounted');
  return btn;
}
/** The section code the masthead says is open. */
function openSectionCode(): string {
  return (document.querySelector('.ed-mast-num')?.textContent ?? '').trim();
}
function mastMeta(): string {
  return (document.querySelector('.ed-mast-meta')?.textContent ?? '').trim();
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the tab cannot be closed over unsaved work', () => {
  it('cancels beforeunload while the canvas is dirty', async () => {
    await renderDirty();
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('does not interfere once the work is saved', async () => {
    await renderDirty();
    fireEvent.click(headerSave());
    await waitFor(() => expect(contentPatches()).toHaveLength(1));
    await waitFor(() => {
      const ev = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    });
  });

  it('does not interfere on a clean canvas', async () => {
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(canvasText()).toBe('The drug substance is a monoclonal antibody.'));
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('switching sections over unsaved work is held, not silent', () => {
  it('holds the switch and names what is at stake', async () => {
    await renderDirty();
    fireEvent.click(screen.getByRole('button', { name: /3\.2\.S\.2\s*Manufacture/ }));

    const guard = await screen.findByRole('alertdialog', { name: /unsaved changes/i });
    // It names the section being left, and says where the work currently is.
    expect(guard.textContent).toMatch(/3\.2\.S\.1/);
    expect(guard.textContent).toMatch(/this device/i);
    // The canvas has NOT moved on, and nothing was written to the record.
    expect(openSectionCode()).toBe('3.2.S.1');
    expect(canvasText()).toBe('Half-written sentence that');
    expect(contentPatches()).toHaveLength(0);
  });

  it('"Cancel" leaves the author exactly where they were', async () => {
    await renderDirty();
    fireEvent.click(screen.getByRole('button', { name: /3\.2\.S\.2\s*Manufacture/ }));
    const guard = await screen.findByRole('alertdialog', { name: /unsaved changes/i });
    fireEvent.click(within(guard).getByRole('button', { name: /^Cancel$/ }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(openSectionCode()).toBe('3.2.S.1');
    expect(canvasText()).toBe('Half-written sentence that');
    expect(contentPatches()).toHaveLength(0);
  });

  it('"Save and continue" records the revision first, then moves', async () => {
    await renderDirty();
    fireEvent.click(screen.getByRole('button', { name: /3\.2\.S\.2\s*Manufacture/ }));
    const guard = await screen.findByRole('alertdialog', { name: /unsaved changes/i });
    fireEvent.click(within(guard).getByRole('button', { name: /Save and continue/i }));

    await waitFor(() => {
      const patches = contentPatches();
      expect(patches).toHaveLength(1);
      expect(patches[0][1]).toBe('/api/authoring/sections/S1');
      expect((patches[0][2] as { content: string }).content).toContain('Half-written sentence that');
    });
    await waitFor(() => expect(openSectionCode()).toBe('3.2.S.2'));
    expect(canvasText()).toBe('Manufactured at the Basel site.');
  });

  it('a refused save keeps the author on the section rather than losing the edit', async () => {
    await renderDirty();
    /* THROWS, because the real `apiRequest` throws on a non-2xx. Returning
       `{ ok: false }` — as this did — is a response shape the transport never
       produces, so the assertion below was covering a branch production could
       not reach while the surface's actual failure path went untested. */
    mockApi((method, url) => {
      if (method === 'PATCH' && url === '/api/authoring/sections/S1') {
        throw new ApiRequestError(
          'This document is frozen. Its content is sealed under a content hash.',
          403,
          { error: { code: 'DOCUMENT_FROZEN' } },
          'DOCUMENT_FROZEN',
        );
      }
      return null;
    });
    fireEvent.click(screen.getByRole('button', { name: /3\.2\.S\.2\s*Manufacture/ }));
    const guard = await screen.findByRole('alertdialog', { name: /unsaved changes/i });
    fireEvent.click(within(guard).getByRole('button', { name: /Save and continue/i }));

    /* The server's own reason — a frozen record tells the author to create a
       new version; "HTTP 403" tells them to file a bug. */
    expect(await screen.findByText(/frozen/i)).toBeTruthy();
    expect(openSectionCode()).toBe('3.2.S.1');
    expect(canvasText()).toBe('Half-written sentence that');
  });

  it('"Leave without saving" writes nothing, and the work comes back on return', async () => {
    await renderDirty();
    fireEvent.click(screen.getByRole('button', { name: /3\.2\.S\.2\s*Manufacture/ }));
    const guard = await screen.findByRole('alertdialog', { name: /unsaved changes/i });
    fireEvent.click(within(guard).getByRole('button', { name: /Leave without saving/i }));

    await waitFor(() => expect(openSectionCode()).toBe('3.2.S.2'));
    // Nothing reached the governed store.
    expect(contentPatches()).toHaveLength(0);
    // The device cache still holds it, and returning offers it back.
    expect(localStorage.getItem('dc::S1')).toMatch(/Half-written sentence that/);
    fireEvent.click(screen.getByRole('button', { name: /3\.2\.S\.1\s*General Information/ }));
    await waitFor(() => expect(openSectionCode()).toBe('3.2.S.1'));
    expect(await screen.findByRole('button', { name: /Restore the device draft/i })).toBeTruthy();
  });

  it('a clean section switches straight through — no guard on work that is safe', async () => {
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(canvasText()).toBe('The drug substance is a monoclonal antibody.'));
    fireEvent.click(screen.getByRole('button', { name: /3\.2\.S\.2\s*Manufacture/ }));
    await waitFor(() => expect(openSectionCode()).toBe('3.2.S.2'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('the record is only ever written by a deliberate act', () => {
  it('typing and waiting never mints a revision on its own', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderDirty();
    // Well past any plausible autosave debounce.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(contentPatches()).toHaveLength(0);
    // And no save toast fired for work nobody saved.
    expect(screen.queryByText(/revision was recorded/i)).toBeNull();
    vi.useRealTimers();
  });

  it('says the work is on this device only, not merely "unsaved"', async () => {
    await renderDirty();
    // "unsaved changes" alone reads as "the app will get to it". It will not:
    // nothing leaves this device until the author saves.
    await waitFor(() => expect(mastMeta()).toMatch(/on this device/i));
  });
});
