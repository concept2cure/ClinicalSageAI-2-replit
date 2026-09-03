// @vitest-environment jsdom
/**
 * AnA drives the wave-5 additions — the eCTD co-author's view-only tab switch
 * (proven NOT to auto-run the server checks the human tab buttons trigger) —
 * plus the wiring-test backfill for the three wave-2 surfaces that until now
 * were covered only by their behavioral suites: cmc.open-tab, the
 * submission-center trio through the 'submissions' alias, and
 * project-home.set-stage with its honest no-project refusal.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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

/* jsdom has no layout: ProseMirror asks for client rects when a selection
   moves. Same shim as the sibling suites. */
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

import { EctdCoauthor } from '../surfaces/EctdCoauthor';
import { CmcModule } from '../surfaces/CmcModule';
import { SubmissionCenter } from '../surfaces/SubmissionCenter';
import { ProjectHome } from '../surfaces/ProjectHome';
import {
  __resetSurfaceActionBus,
  applySurfaceAction,
  registeredSurfaceId,
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
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

/* ── EctdCoauthor — the view-only tab switch ─────────────────────────────── */

const ECTD_DOCS = {
  documents: [
    {
      id: 7001, title: 'Clinical Overview — ZX-9',
      content: '<h2>2.5.1 Development Rationale</h2><p>ZX-9 is a first-in-class oral agent.</p>',
      status: 'review', moduleNumber: '2.5', moduleName: 'Common Technical Document Summaries',
      updatedAt: '2026-07-20T00:00:00Z',
    },
  ],
  total: 1,
  message: 'Found 1 document(s)',
};

function ectdCanvas(): Editor {
  const el = document.querySelector('.rse-body .tiptap') as (HTMLElement & { editor?: Editor }) | null;
  if (!el?.editor) throw new Error('editor not mounted');
  return el.editor;
}

describe('EctdCoauthor — open-tab views, never runs', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && String(url).split('?')[0] === '/api/coauthor/documents') return ok(ECTD_DOCS);
      return ok({});
    });
  });

  const props = () =>
    ({ surface: { id: 'ectd-coauthor', label: 'eCTD' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

  it('opens the validation tab WITHOUT starting the run the human button would, and says so', async () => {
    render(<EctdCoauthor {...props()} />);
    await screen.findAllByText('Clinical Overview — ZX-9');
    await waitFor(() => expect(registeredSurfaceId()).toBe('ectd-coauthor'));

    const out = apply('ectd-coauthor.open-tab', { tab: 'validation' });
    expect(out.status).toBe('applied');
    expect(out.detail).toContain('no validation report has been run yet');
    expect(out.detail).toContain('stays a human click');
    // The proof: the human tab button auto-POSTs a validation run on switch;
    // AnA's switch must not have.
    const validatePosts = apiRequest.mock.calls.filter(
      ([m, u]) => m === 'POST' && /validate/.test(String(u)),
    );
    expect(validatePosts).toHaveLength(0);

    const back = apply('ectd-coauthor.open-tab', { tab: 'document' });
    expect(back.status).toBe('applied');
  });

  it('REFUSES to leave the document tab over unsaved edits (the editor unmounts)', async () => {
    render(<EctdCoauthor {...props()} />);
    await screen.findAllByText('Clinical Overview — ZX-9');
    await waitFor(() => expect(registeredSurfaceId()).toBe('ectd-coauthor'));
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).not.toBeNull());

    act(() => {
      ectdCanvas().chain().focus().selectAll().insertContent('Edited but not saved.').run();
    });

    const out = apply('ectd-coauthor.open-tab', { tab: 'compliance' });
    expect(out.status).toBe('failed');
    expect(out.reason).toContain('unsaved edits');
    expect(out.reason).toContain('unmounts');
  });
});

/* ── CmcModule — cmc.open-tab backfill ───────────────────────────────────── */

describe('CmcModule — open-tab drives the real pane swap', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async () => ok({}));
  });

  const props = () =>
    ({ surface: { id: 'cmc-module', label: 'CMC' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

  it('registers under "cmc"; open-tab mounts the named pane', async () => {
    render(<CmcModule {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('cmc'));

    const out = apply('cmc.open-tab', { tab: 'change' });
    expect(out.status).toBe('applied');
    // The change-control pane is genuinely on screen — its simulator textarea
    // is the marker the behavioral suite uses.
    expect(await screen.findByPlaceholderText(/switch the drug-substance supplier/)).toBeTruthy();

    const specs = apply('cmc.open-tab', { tab: 'specs' });
    expect(specs.status).toBe('applied');
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/switch the drug-substance supplier/)).toBeNull(),
    );
  });
});

/* ── SubmissionCenter — the submissions trio through the alias ───────────── */

const SUBS = [
  {
    id: 7, title: 'ZX-9 First-in-Human', productName: 'Zexanib', applicationType: 'ind',
    clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original',
  },
];
const SEQS = [
  { id: 21, sequenceNumber: '0000', type: 'original', status: 'assembling', region: 'fda', validationStatus: 'pending' },
];

describe('SubmissionCenter — select/workspace/sequence via the "submissions" alias', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/submissions') return ok(SUBS);
      if (url === '/api/submissions/7/sequences') return ok(SEQS);
      return ok({});
    });
  });

  it('drives the real portfolio: select a submission, open its sequences, select one — with honest misses', async () => {
    render(<SubmissionCenter onAsk={vi.fn()} />);
    await screen.findByText('ZX-9 First-in-Human');
    await waitFor(() => expect(registeredSurfaceId()).toBe('submission-center'));

    let out = apply('submissions.select-submission', { submission: 'zx-9' });
    expect(out.status).toBe('applied');
    expect(out.detail).toContain('ZX-9 First-in-Human');

    out = apply('submissions.set-workspace', { workspace: 'sequences' });
    expect(out.status).toBe('applied');
    expect(await screen.findByText('0000')).toBeTruthy();

    out = apply('submissions.select-sequence', { sequence: '0000' });
    expect(out.status).toBe('applied');

    out = apply('submissions.select-submission', { submission: 'ghost trial' });
    expect(out.status).toBe('failed');
  });
});

/* ── ProjectHome — set-stage backfill ────────────────────────────────────── */

const PID = '11111111-1111-4111-8111-111111111111';

describe('ProjectHome — set-stage drives the lifecycle rail', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === `/api/c2c/projects/${PID}/sources`) return ok({ projectId: PID, sources: [], unscoped: [] });
      if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'BX-301', code: 'BX301' });
      return ok({});
    });
  });

  const props = () =>
    ({ surface: { id: 'project-home', label: 'Project' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

  it('with a project open, the stage rail really moves', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('project-home'));

    const out = apply('project-home.set-stage', { stage: 'evidence' });
    expect(out.status).toBe('applied');
    await waitFor(() => {
      const active = document.querySelector('.pj-lc-stage[aria-selected="true"]');
      expect(active?.textContent).toContain('Evidence');
    });
  });

  it('with no project open, the refusal is honest', async () => {
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('project-home'));

    const out = apply('project-home.set-stage', { stage: 'evidence' });
    expect(out.status).toBe('failed');
    expect(out.reason?.toLowerCase()).toContain('project');
  });
});
