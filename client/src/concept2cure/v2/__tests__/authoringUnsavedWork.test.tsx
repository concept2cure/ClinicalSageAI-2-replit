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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

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
import { publishShellProject } from '../shellProject';
import { collectSuggestions } from '../editor/suggestions';
import type { Editor } from '@tiptap/core';
import { deviceDraftKey } from '@/lib/deviceDraftCache';
import { surfaceLeaveRefusal } from '../navParams';
import { clearEditorTarget } from '../editorTarget';

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

describe('the tab cannot be closed over unsaved work', () => {
  it('refuses the task drawer exit without saving or unmounting the dirty canvas', async () => {
    await renderDirty();
    expect(surfaceLeaveRefusal()).toMatch(/unsaved edits.*3\.2\.S\.1/i);
    expect(contentPatches()).toHaveLength(0);
    expect(canvasText()).toBe('Half-written sentence that');
    cleanup();
    expect(surfaceLeaveRefusal()).toBeNull();
  });

  it('holds embedded Back to Quality for the existing unsaved-work decision', async () => {
    const onBack = vi.fn();
    render(<DocumentWorkbench onNav={vi.fn()} docs={DOCS.documents} docsState="ready" status="all"
      reloadDocs={async () => {}} programId={null} pinnedDocId="D1" embedded={{ onBack, backLabel: 'Back to Quality' }} />);
    await waitFor(() => expect(canvasText()).toBe('The drug substance is a monoclonal antibody.'));
    act(() => { canvasEditor().chain().focus().selectAll().insertContent('An unfinished controlled procedure.').run(); });
    await waitFor(() => expect(canvasText()).toBe('An unfinished controlled procedure.'));
    fireEvent.click(screen.getByTestId('workbench-back'));
    expect(onBack).not.toHaveBeenCalled();
    expect(await screen.findByRole('alertdialog', { name: /Unsaved/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(onBack).not.toHaveBeenCalled();
    expect(canvasText()).toBe('An unfinished controlled procedure.');
    fireEvent.click(screen.getByTestId('workbench-back'));
    await screen.findByRole('alertdialog', { name: /Unsaved/i });
    fireEvent.click(screen.getByRole('button', { name: /Leave without saving/i }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(contentPatches()).toHaveLength(0);
  });

  it('keeps embedded Back in place until an ordinary header save finishes', async () => {
    const onBack = vi.fn();
    render(<DocumentWorkbench onNav={vi.fn()} docs={DOCS.documents} docsState="ready" status="all"
      reloadDocs={async () => {}} programId={null} pinnedDocId="D1" embedded={{ onBack, backLabel: 'Back to Quality' }} />);
    await waitFor(() => expect(canvasText()).toBe('The drug substance is a monoclonal antibody.'));
    act(() => { canvasEditor().chain().focus().insertContent('Pending revision. ').run(); });
    fireEvent.change(screen.getByTestId('change-reason'), { target: { value: 'Reviewing the controlled procedure.' } });
    const save = heldResponse();
    const baseline = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string, body?: unknown) =>
      method === 'PATCH' && url.endsWith('/S1') ? save.promise : baseline(method, url, body));
    await waitFor(() => expect(headerSave().disabled).toBe(false));
    fireEvent.click(headerSave());
    await waitFor(() => expect(headerSave().textContent).toContain('Saving'));

    fireEvent.click(screen.getByTestId('workbench-back'));

    expect(await screen.findByText(/A save is in progress/)).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const content = canvasEditor().getHTML();
    await act(async () => { save.resolve(ok({ section: { ...SECTIONS.sections[0], content } })); await save.promise; });
    await waitFor(() => expect(headerSave().textContent).toContain('Saved'));
    fireEvent.click(screen.getByTestId('workbench-back'));
    expect(onBack).toHaveBeenCalledOnce();
    expect(contentPatches()).toHaveLength(1);
  });

  it.each([
    ['controlled QMS content', 'This QMS document is under review. Open a controlled revision in Quality.'],
    ['a current read-only organization member', 'Editing needs an editing role in this organization. Your current organization access is read-only.'],
  ])('renders %s read only using its server refusal', async (_case, reason) => {
    mockApi((m, u) => m === 'GET' && u === '/api/authoring/docs/D1' ? ok({ document: DOCS.documents[0], access: { edit: { allowed: false, reason } } }) : null);
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(canvasText()).toBe('The drug substance is a monoclonal antibody.'));
    await waitFor(() => expect(canvasEl()?.getAttribute('contenteditable')).toBe('false'));
    expect(screen.getByText(reason)).toBeTruthy();
    expect(headerSave().disabled).toBe(true);
    expect(screen.getByTestId('ai-draft-open').getAttribute('disabled')).not.toBeNull();
    expect(contentPatches()).toHaveLength(0);
  });

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
    expect(localStorage.getItem(deviceDraftKey(null, 'S1'))).toMatch(/Half-written sentence that/);
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

describe('the guard names decisions already recorded, not just unsaved text', () => {
  /**
   * Accepting a suggestion strips its mark and POSTs the decision immediately
   * — independent of Save. The decision is permanent on the audit trail the
   * moment that POST lands; only the SECTION CONTENT reflecting it waits for
   * an explicit save. So a reviewer who accepts and then leaves without saving
   * leaves behind an audit trail that says "accepted" while the saved section
   * still shows the change as pending. The guard has to say so — "your edits
   * are cached on this device" is true of ordinary typing, and false of what
   * actually happened here: a permanent record already exists.
   */
  const SUGGESTION_SECTIONS = {
    success: true,
    sections: [
      ...SECTIONS.sections,
      {
        id: 'S3',
        doc_id: 'D1',
        code: '3.2.S.3',
        title: 'Elucidation of Structure',
        content:
          'The impurity is below the qualification threshold. ' +
          '<ins data-author-id="ana" data-author-name="AnA (AI draft)" data-at="2026-07-20T10:05:00.000Z">Confirmed by MS/NMR.</ins>',
        order_index: 2,
        comment_count: 0,
        revision_count: 1,
        citation_count: 0,
        updated_at: '2026-07-20T10:00:00Z',
      },
    ],
  };

  function mockApiWithSuggestion() {
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
      if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SUGGESTION_SECTIONS);
      if (method === 'GET' && url.startsWith('/api/authoring/sections/'))
        return ok({ success: true, revisions: [], sources: [], citations: [] });
      if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments'))
        return ok({ success: true, comments: [] });
      if (method === 'PATCH' && url.startsWith('/api/authoring/sections/')) {
        const id = url.split('/').pop();
        const row = SUGGESTION_SECTIONS.sections.find(s => s.id === id)!;
        return ok({
          success: true,
          revision_created: true,
          section: { ...row, content: String((body as { content?: string })?.content ?? row.content) },
        });
      }
      return ok({ success: true });
    });
  }

  /** Accept the one suggestion in the open section via the same command
   *  RichSectionEditor's review strip uses (RichSectionEditor.tsx). */
  function acceptTheSuggestion() {
    const ed = canvasEditor();
    const [target] = collectSuggestions(ed.state.doc);
    if (!target) throw new Error('no suggestion mark found in the mounted section');
    ed.commands.resolveSuggestion(target, 'accept');
  }

  function decisionPosts(): unknown[][] {
    return apiRequest.mock.calls.filter(
      c => c[0] === 'POST' && String(c[1]).includes('/tracked-change-decisions'),
    );
  }

  beforeEach(() => {
    mockApiWithSuggestion();
  });

  it('accepting, then leaving without saving, names the recorded decision', async () => {
    render(<DocumentAuthoring {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /3\.2\.S\.3/ }));
    await waitFor(() => expect(openSectionCode()).toBe('3.2.S.3'));

    acceptTheSuggestion();
    // The decision POSTs on a microtask, independent of any save.
    await waitFor(() => expect(decisionPosts()).toHaveLength(1));
    // Accepting strips the mark, which changes the serialization — the editor
    // goes dirty from the decision alone, with no further typing.
    await waitFor(() => expect(mastMeta()).toMatch(/on this device/i));

    fireEvent.click(screen.getByRole('button', { name: /3\.2\.S\.1\s*General Information/ }));
    const guard = await screen.findByRole('alertdialog', { name: /unsaved changes/i });
    expect(within(guard).getByText(/One tracked-change decision/i)).toBeTruthy();
    expect(
      within(guard).getByText(/already recorded to the audit trail/i),
    ).toBeTruthy();

    // Leaving without saving does not touch the decision already recorded —
    // it is not re-sent, not retracted, just left as the only record of what
    // happened.
    fireEvent.click(within(guard).getByRole('button', { name: /Leave without saving/i }));
    await waitFor(() => expect(openSectionCode()).toBe('3.2.S.1'));
    expect(decisionPosts()).toHaveLength(1);
  });

  it('an ordinary text edit with no decision does not claim one was recorded', async () => {
    render(<DocumentAuthoring {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /3\.2\.S\.3/ }));
    await waitFor(() => expect(openSectionCode()).toBe('3.2.S.3'));

    canvasEditor().chain().focus().insertContentAt(0, 'Prefixed. ').run();
    await waitFor(() => expect(mastMeta()).toMatch(/on this device/i));

    fireEvent.click(screen.getByRole('button', { name: /3\.2\.S\.1\s*General Information/ }));
    const guard = await screen.findByRole('alertdialog', { name: /unsaved changes/i });
    // The paragraph this fix adds is conditional on pendingDecisionCount > 0;
    // an ordinary edit must not trigger it.
    expect(within(guard).queryByText(/tracked-change decision/i)).toBeNull();
    expect(decisionPosts()).toHaveLength(0);
  });

  it('saving closes out the count — a LATER unrelated edit does not resurrect the old decision count', async () => {
    render(<DocumentAuthoring {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /3\.2\.S\.3/ }));
    await waitFor(() => expect(openSectionCode()).toBe('3.2.S.3'));

    acceptTheSuggestion();
    await waitFor(() => expect(decisionPosts()).toHaveLength(1));
    fireEvent.change(screen.getByTestId('change-reason'), {
      target: { value: 'Accepted the confirmed structure elucidation note.' },
    });
    await waitFor(() => expect(headerSave().disabled).toBe(false));
    fireEvent.click(headerSave());
    await waitFor(() => expect(screen.queryByText(/Saving…/)).toBeNull());

    // A second, unrelated edit after the save.
    canvasEditor().chain().focus().insertContentAt(0, 'One more note. ').run();
    await waitFor(() => expect(mastMeta()).toMatch(/on this device/i));

    fireEvent.click(screen.getByRole('button', { name: /3\.2\.S\.1\s*General Information/ }));
    const guard = await screen.findByRole('alertdialog', { name: /unsaved changes/i });
    // The save closed out the earlier decision; this dirty state is from the
    // unrelated edit alone.
    expect(within(guard).queryByText(/tracked-change decision/i)).toBeNull();
  });
});

const PROGRAM_A = '11111111-1111-4111-8111-111111111111';
const PROGRAM_B = '22222222-2222-4222-8222-222222222222';
const PROGRAM_C = '33333333-3333-4333-8333-333333333333';
function heldResponse() { let resolve!: (value: Response) => void; const promise = new Promise<Response>(done => { resolve = done; }); return { promise, resolve }; }
function scopeReads(id: string) { return apiRequest.mock.calls.filter(c => c[0] === 'GET' && String(c[1]).includes(`programId=${id}`)); }

describe('program switches preserve the current authoring decision', () => {
  it('retains dirty content when a program switch is cancelled, without reading the new scope', async () => {
    publishShellProject({ id: PROGRAM_A, title: 'Program A' }); await renderDirty();
    await act(async () => { publishShellProject({ id: PROGRAM_B, title: 'Program B' }); });
    const guard = await screen.findByRole('alertdialog'); expect(guard.textContent).toContain('Program B');
    expect(canvasText()).toBe('Half-written sentence that'); expect(scopeReads(PROGRAM_B)).toHaveLength(0);
    fireEvent.click(within(guard).getByRole('button', { name: /^Cancel$/ }));
    expect(canvasText()).toBe('Half-written sentence that'); expect(contentPatches()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Switch to selected project' })).toBeTruthy();
  });

  it('ignores a prior program list that finishes after the new scoped list', async () => {
    const pending = heldResponse(); const baseline = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string, body?: unknown) => {
      if (url.includes(`programId=${PROGRAM_A}`)) return pending.promise;
      if (url.includes(`programId=${PROGRAM_B}`)) return Promise.resolve(ok({ documents: [{ ...DOCS.documents[0], id: 'B1', title: 'Program B draft' }] }));
      if (url === '/api/authoring/docs/B1/sections') return Promise.resolve(ok({ sections: [{ ...SECTIONS.sections[0], id: 'BS1', doc_id: 'B1', content: 'Program B stored text.' }] }));
      return baseline(method, url, body);
    });
    publishShellProject({ id: PROGRAM_A }); render(<DocumentAuthoring {...props()} />);
    await act(async () => { publishShellProject({ id: PROGRAM_B }); });
    await waitFor(() => expect(canvasText()).toBe('Program B stored text.'));
    await act(async () => { pending.resolve(ok(DOCS)); await pending.promise; });
    expect(canvasText()).toBe('Program B stored text.'); expect(screen.queryByText('Nonclinical Overview')).toBeNull();
  });

  it('a save for an older switch cannot clear a newer pending program decision', async () => {
    const pending = heldResponse(); const baseline = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string, body?: unknown) => method === 'PATCH' && url.endsWith('/S1') ? pending.promise : baseline(method, url, body));
    publishShellProject({ id: PROGRAM_A, title: 'Program A' }); await renderDirty();
    await act(async () => { publishShellProject({ id: PROGRAM_B, title: 'Program B' }); });
    const guard = await screen.findByRole('alertdialog'); fireEvent.click(within(guard).getByRole('button', { name: /Save and continue/ }));
    await waitFor(() => expect(contentPatches()).toHaveLength(1));
    await act(async () => { publishShellProject({ id: PROGRAM_C, title: 'Program C' }); });
    await act(async () => { pending.resolve(ok({ section: { ...SECTIONS.sections[0], content: '<p>Half-written sentence that</p>' } })); await pending.promise; });
    const latest = await screen.findByRole('alertdialog'); expect(latest.textContent).toContain('Program C'); expect(scopeReads(PROGRAM_B)).toHaveLength(0);
    fireEvent.click(within(latest).getByRole('button', { name: /Leave without saving/ }));
    await waitFor(() => expect(scopeReads(PROGRAM_C).length).toBeGreaterThan(0));
  });
});
