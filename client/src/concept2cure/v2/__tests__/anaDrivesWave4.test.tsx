// @vitest-environment jsdom
/**
 * AnA drives the wave-4 screens — wiring proof against the REAL DeepResearch,
 * EctdCoauthor, and DocumentAuthoring surfaces: registration under the right
 * ids (including the 'authoring' → 'document-authoring' alias), genuine DOM
 * effects through the surfaces' own state, and the honest refusals that make
 * the expansion safe — the credential-drawer hold, the unsaved-edits hold, and
 * the source-mode find refusal. The quality module's wiring is covered by the
 * companion describe at the bottom (its state lives one module over).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 7, firstName: 'Ada' } }),
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));

/* jsdom has no layout: ProseMirror asks for client rects the moment a
   selection moves. Same shim as richSectionEditorUnsaved.test.tsx. */
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

import { DeepResearch } from '../surfaces/DeepResearch';
import { EctdCoauthor } from '../surfaces/EctdCoauthor';
import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';
import { ArtifactsCenter } from '../surfaces/AdminSurfaces';
import { clearEditorTarget } from '../editorTarget';
import { clearNavParams } from '../navParams';
import {
  __resetSurfaceActionBus,
  applySurfaceAction,
  registeredSurfaceId,
  useSurfaceActionHandlers,
} from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

function directive(actionId: string, params: Record<string, unknown> = {}) {
  const res = resolveSurfaceAction(actionId, params);
  if (!res.ok) throw new Error(`fixture action ${actionId} does not resolve: ${res.error}`);
  return res.directive;
}
function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}
type Outcome = { status: string; detail?: string; reason?: string };
function apply(actionId: string, params: Record<string, unknown> = {}): Outcome {
  let outcome: Outcome = { status: '' };
  act(() => {
    outcome = applySurfaceAction(directive(actionId, params), vi.fn()) as Outcome;
  });
  return outcome;
}

afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
});

/* ── DeepResearch ────────────────────────────────────────────────────────── */

const BOARD = {
  credits: { remaining: 8, limit: 10, tier: 'professional' },
  connectors: [
    {
      id: 'ctgov', name: 'ClinicalTrials.gov', type: 'registry', cat: 'clinical',
      tier: 'standard', creds: false, icon: 'db', desc: 'Trial registry', cf: [],
      configured: true,
    },
    {
      id: 'embase', name: 'Embase', type: 'literature', cat: 'literature',
      tier: 'premium', creds: true, icon: 'db', desc: 'Biomedical literature',
      cf: [{ field: 'apiKey', label: 'API key', placeholder: 'key', secret: true }],
      configured: false,
    },
  ],
  connectorCount: 2,
  configuredCount: 1,
};

describe('DeepResearch — AnA switches tabs, and only tabs', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (_m: string, path: string) => {
      if (path === '/api/deep-research/board') return ok({ data: BOARD });
      return ok({ data: {} });
    });
  });

  const props = () =>
    ({ surface: { id: 'deep-research', label: 'Deep Research' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

  it('registers under "deep-research"; open-tab drives the real tab state both ways', async () => {
    render(<DeepResearch {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('deep-research'));

    let out = apply('deep-research.open-tab', { tab: 'connectors' });
    expect(out).toEqual({ status: 'applied', detail: 'Opened the connectors tab' });
    // The connectors pane is really on screen — the org's own inventory renders.
    expect(await screen.findByText('ClinicalTrials.gov')).toBeTruthy();

    out = apply('deep-research.open-tab', { tab: 'connectors' });
    expect(out).toEqual({ status: 'applied', detail: 'Already on the connectors tab' });

    out = apply('deep-research.open-tab', { tab: 'research' });
    expect(out).toEqual({ status: 'applied', detail: 'Opened the research tab' });
  });

  it('refuses to switch tabs under an open credential drawer', async () => {
    render(<DeepResearch {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('deep-research'));

    apply('deep-research.open-tab', { tab: 'connectors' });
    fireEvent.click(await screen.findByText(/Configure$/));
    expect(await screen.findByText('Configure Embase')).toBeTruthy();

    const out = apply('deep-research.open-tab', { tab: 'research' });
    expect(out.status).toBe('failed');
    expect(out.reason).toContain('credential drawer');
  });
});

/* ── EctdCoauthor ────────────────────────────────────────────────────────── */

const ECTD_DOCS = {
  documents: [
    {
      id: 7001, title: 'Clinical Overview — ZX-9',
      content: '<h2>2.5.1 Development Rationale</h2><p>ZX-9 is a first-in-class oral agent.</p>',
      status: 'review', moduleNumber: '2.5', moduleName: 'Common Technical Document Summaries',
      updatedAt: '2026-07-20T00:00:00Z',
    },
    {
      id: 7002, title: 'Drug Product — ZX-9', content: '',
      status: 'draft', moduleNumber: '3.2.P', moduleName: 'Quality',
      updatedAt: '2026-07-18T00:00:00Z',
    },
    {
      id: 7003, title: 'Integrated Summary of Safety', content: '<p>ISS narrative.</p>',
      status: 'approved', moduleNumber: '5.3', moduleName: 'Clinical Study Reports',
      updatedAt: '2026-07-10T00:00:00Z',
    },
  ],
  total: 3,
  message: 'Found 3 document(s)',
};

function ectdCanvas(): Editor {
  const el = document.querySelector('.rse-body .tiptap') as (HTMLElement & { editor?: Editor }) | null;
  if (!el?.editor) throw new Error('editor not mounted');
  return el.editor;
}

describe('EctdCoauthor — AnA opens documents without ever discarding typing', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && String(url).split('?')[0] === '/api/coauthor/documents') return ok(ECTD_DOCS);
      return ok({});
    });
  });

  const props = () =>
    ({ surface: { id: 'ectd-coauthor', label: 'eCTD' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

  it('open-document resolves title/module honestly and drives the same click a person makes', async () => {
    render(<EctdCoauthor {...props()} />);
    await screen.findByText('Drug Product — ZX-9');
    await waitFor(() => expect(registeredSurfaceId()).toBe('ectd-coauthor'));

    let out = apply('ectd-coauthor.open-document', { document: 'integrated summary' });
    expect(out).toEqual({ status: 'applied', detail: 'Opened §5.3 Integrated Summary of Safety' });
    await waitFor(() => {
      const active = document.querySelector('.ec-tree-row[data-active="true"]');
      expect(active?.textContent).toContain('Integrated Summary of Safety');
    });

    out = apply('ectd-coauthor.open-document', { document: 'ZX-9' });
    expect(out.status).toBe('failed');
    expect(out.reason).toContain('matches 2 documents');

    out = apply('ectd-coauthor.open-document', { document: 'ghost dossier' });
    expect(out.status).toBe('failed');
    expect(out.reason).toContain('No eCTD document matching');
  });

  it('REFUSES a switch while the open document holds unsaved edits', async () => {
    render(<EctdCoauthor {...props()} />);
    await screen.findAllByText('Clinical Overview — ZX-9');
    await waitFor(() => expect(registeredSurfaceId()).toBe('ectd-coauthor'));
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).not.toBeNull());

    act(() => {
      ectdCanvas().chain().focus().selectAll().insertContent('Edited but not saved.').run();
    });

    const out = apply('ectd-coauthor.open-document', { document: 'drug product' });
    expect(out.status).toBe('failed');
    expect(out.reason).toContain('unsaved edits');
    expect(out.reason).toContain('§2.5');
    // The open document did NOT change — the buffer survived.
    const active = document.querySelector('.ec-tree-row[data-active="true"]');
    expect(active?.textContent).toContain('Clinical Overview — ZX-9');
  });
});

/* ── DocumentAuthoring — authoring.find through the alias ────────────────── */

const AUTH_DOCS = {
  success: true,
  documents: [
    { id: 'D1', title: 'Nonclinical Overview', module: 'M3', product_code: 'ABC', status: 'draft', updated_at: '2026-08-01T10:00:00Z', section_count: 1 },
  ],
};
const D1_SECTIONS = {
  success: true,
  sections: [
    { id: 'S1', doc_id: 'D1', code: '3.2.S.1', title: 'General Information', content: 'Default document content.', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: '2026-08-01T10:00:00Z' },
  ],
};

describe('DocumentAuthoring — authoring.find opens the real find bar', () => {
  beforeEach(() => {
    clearEditorTarget();
    clearNavParams();
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(AUTH_DOCS);
      if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(D1_SECTIONS);
      return ok({ success: true });
    });
  });

  const props = () =>
    ({ surface: { id: 'document-authoring', label: 'Authoring' } as never, onNav: vi.fn(), segment: 'medtech' });

  it('a directive addressed to "authoring" lands on this surface and opens Ctrl-F pre-seeded', async () => {
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => {
      expect(document.querySelector('.rse-body .tiptap')?.textContent).toContain(
        'Default document content.',
      );
    });
    await waitFor(() => expect(registeredSurfaceId()).toBe('document-authoring'));

    const out = apply('authoring.find', { query: 'content' });
    expect(out).toEqual({ status: 'applied', detail: 'Find bar open — searching for "content"' });

    // The REAL bar is up: the search role, the seeded input, and the plugin's
    // own highlight over the matching canvas text.
    const bar = await screen.findByRole('search', { name: 'Find in this section' });
    expect(bar).toBeTruthy();
    expect((screen.getByLabelText('Text to find') as HTMLInputElement).value).toBe('content');
    await waitFor(() => expect(document.querySelector('.rse-find-hit')).not.toBeNull());
  });
});

/* ── ArtifactsCenter → authoring: the Open button rides the same bus ─────── */

const ARTIFACTS = {
  data: [
    { id: 'a-1', name: 'SAP v2 draft', kind: 'document', fmt: 'docx', size: '48 KB', model: 'AnA', when: '2h ago', ver: 'v2', sig: 'unsigned', prog: 'BX-204' },
  ],
};

/** The receiving end a real navigation would mount — a probe registration
 *  under the editor's id, so the relay is proven without mounting the whole
 *  editor twice in one file. */
function AuthoringProbe({ spy }: { spy: (params: Record<string, string>) => void }) {
  useSurfaceActionHandlers('document-authoring', {
    'authoring.open-document': (params) => {
      spy(params as Record<string, string>);
      return { ok: true, detail: 'probe' };
    },
  });
  return null;
}

describe('ArtifactsCenter — Open carries the artifact to the editor', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (_m: string, path: string) => {
      if (path === '/api/artifacts-center') return ok(ARTIFACTS);
      return ok({ data: [] });
    });
  });

  it('a docx Open stashes authoring.open-document with the artifact name, navigates, and the editor registration receives it', async () => {
    const onNav = vi.fn();
    const { unmount } = render(
      <ArtifactsCenter
        surface={{ id: 'x', label: 'X' } as never}
        onAsk={vi.fn()}
        onNav={onNav}
        segment="medtech"
      />,
    );
    await screen.findByText('SAP v2 draft');

    fireEvent.click(screen.getByText('Open to edit', { exact: false }));
    expect(onNav).toHaveBeenCalledWith('authoring');

    // The navigation happens for real in the app; here the artifacts surface
    // unmounts and the editor's registration consumes the held directive.
    unmount();
    const spy = vi.fn();
    render(<AuthoringProbe spy={spy} />);
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ title: 'SAP v2 draft' }));
  });
});

/* ── Quality — the lifted state, driven from one slot across both tabs ───── */

import { QualityApp } from '../../quality/App';

/* Server-shaped change rows (snake_case; changeHooks adapts them). Two rows
   share a title on purpose — the ambiguity refusal has to have something real
   to refuse over. */
const SERVER_CHANGES = [
  { id: 501, change_number: 'CC-2026-101', title: 'Widen sterilization window', description: null, change_type: 'process', classification: 'major', risk_level: 'medium', status: 'approved', reason: null, target_implementation_date: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-02T00:00:00Z', links: [] },
  { id: 502, change_number: 'CC-2026-102', title: 'New label supplier', description: null, change_type: 'process', classification: 'minor', risk_level: null, status: 'proposed', reason: null, target_implementation_date: null, created_at: '2026-08-03T00:00:00Z', updated_at: '2026-08-03T00:00:00Z', links: [] },
  { id: 503, change_number: 'CC-2026-103', title: 'New label supplier', description: null, change_type: 'process', classification: 'minor', risk_level: null, status: 'closed', reason: null, target_implementation_date: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-10T00:00:00Z', links: [] },
];

function fetchOk(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

describe('Quality — AnA drives both tabs from the single lifted slot', () => {
  let resolveChanges: ((r: Response) => void) | null = null;

  beforeEach(() => {
    resolveChanges = null;
    apiRequest.mockReset();
    apiRequest.mockImplementation(async () => fetchOk({ data: [] }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/mdx/qms/changes/summary')) return fetchOk({ data: {} });
        if (url.includes('/api/mdx/qms/changes')) {
          if (resolveChanges !== null) {
            return new Promise<Response>((res) => {
              resolveChanges = (r) => res(r);
            });
          }
          return fetchOk({ data: SERVER_CHANGES });
        }
        // The SOP pane's own reads — honest empties are all these tests need.
        return fetchOk({ data: [] });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers under "quality"; filters switch to their tab and narrow the real panes', async () => {
    render(<QualityApp onAskAna={vi.fn()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('quality'));

    let out = apply('quality.filter-changes', { stage: 'approved' });
    expect(out).toEqual({ status: 'applied', detail: 'Opened change control; filtered to Approved' });
    expect(await screen.findByText('CC-2026-101')).toBeTruthy();
    expect(screen.queryByText('CC-2026-102')).toBeNull();

    out = apply('quality.filter-register', { status: 'effective' });
    expect(out).toEqual({ status: 'applied', detail: 'Opened SOP register; filtered to effective' });
    await waitFor(() => {
      const chip = screen.getByRole('button', { name: 'Effective' });
      expect(chip.getAttribute('aria-pressed')).toBe('true');
    });

    out = apply('quality.open-tab', { tab: 'sop' });
    expect(out).toEqual({ status: 'applied', detail: 'Already on SOP register' });
  });

  it('open-change resolves honestly, switches tab, and clears a filter that would hide the row', async () => {
    render(<QualityApp onAskAna={vi.fn()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('quality'));

    apply('quality.filter-changes', { stage: 'approved' });

    // CC-2026-102 is 'proposed' — hidden by the approved filter AnA just set.
    let out = apply('quality.open-change', { change: 'cc-2026-102' });
    expect(out.status).toBe('applied');
    expect(out.detail).toContain('Expanded CC-2026-102 — New label supplier');
    expect(out.detail).toContain('cleared the stage filter so it shows');
    await waitFor(() => {
      const row = document.querySelector('[aria-expanded="true"]');
      expect(row?.textContent).toContain('CC-2026-102');
    });

    out = apply('quality.open-change', { change: 'new label supplier' });
    expect(out.status).toBe('failed');
    expect(out.reason).toContain('matches 2 changes');

    out = apply('quality.open-change', { change: 'CC-9999' });
    expect(out.status).toBe('failed');
    expect(out.reason).toContain('No change matching');
  });

  it('open-change is HELD through the register load and applies when it lands', async () => {
    resolveChanges = () => {};
    render(<QualityApp onAskAna={vi.fn()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('quality'));

    const deferred = vi.fn();
    let immediate: unknown;
    act(() => {
      immediate = applySurfaceAction(
        directive('quality.open-change', { change: 'cc-2026-101' }),
        vi.fn(),
        deferred,
      );
    });
    // Mounted but the register has not landed: held, not failed.
    expect(immediate).toEqual({ status: 'stashed' });
    expect(deferred).not.toHaveBeenCalled();

    act(() => {
      resolveChanges?.(fetchOk({ data: SERVER_CHANGES }));
      resolveChanges = null;
    });
    await waitFor(() =>
      expect(deferred).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'applied', detail: expect.stringContaining('Expanded CC-2026-101') }),
      ),
    );
    await waitFor(() => {
      const row = document.querySelector('[aria-expanded="true"]');
      expect(row?.textContent).toContain('CC-2026-101');
    });
  });
});
