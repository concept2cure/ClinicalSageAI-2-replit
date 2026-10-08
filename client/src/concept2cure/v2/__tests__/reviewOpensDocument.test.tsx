// @vitest-environment jsdom
/**
 * The Review board opens THE document under review, not the editor's list
 * (docs/design/ONE_ANA_ONE_CANVAS.md §4.7, slice 19).
 *
 * "Open in editor" and the sign-off button used to call
 * onNav('document-authoring') with nothing else, so the reviewer landed on the
 * document list and had to find the document again. They now write the editor
 * deep-link target (editorTarget.ts) with the document's id, the way Vault's
 * "Open in editor" does, and open the document's program first when the shell
 * holds another one (the editor's list is scoped to the open program).
 *
 * An AI comment's button said "Apply in editor" and applied nothing; it is
 * named for what it does ("Open the document").
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Reviewer', email: 'rev@test.co' } }),
}));
vi.mock('../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

const emptyRects = function () { return [] as unknown as DOMRectList; };
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { Review } from '../surfaces/Review';
import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';

const DOC = '3f2c1a10-0000-4000-8000-000000000055';
const OTHER_DOC = '3f2c1a10-0000-4000-8000-000000000077';
const SECTION = '3f2c1a10-0000-4000-8000-000000000101';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const ANOTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC, doc: 'Clinical Overview §2.5', prog: 'NDA 200100', programId: PROGRAM, pid: DOC, module: 'M2',
    docStatus: 'IN_REVIEW', state: 'in-review', reviews: [],
    myReviewId: null, myReviewStatus: null, awaitingMyReview: false, requestedByMe: false, atMySignOff: true, mine: true,
    reviewer: 'rev@test.co', role: 'QA sign-off', due: '', tone: '', comments: 0, esig: 'pending', conf: null, prov: null,
    passage: 'The pivotal study met its primary endpoint.', firstSectionId: SECTION, requestedAt: null,
    ...overrides,
  };
}
const board = (row = item()) => ({
  queue: [row],
  workflows: {},
  thread: [] as Array<Record<string, unknown>>,
  meta: { scope: 'all', programId: null, total: 1, threadItemId: DOC, threadDocumentId: DOC, generatedAt: '2026-10-08T00:00:00Z' },
});
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

let BOARD = board();
function mockApi() {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.startsWith('/api/review/board')) return ok({ success: true, data: BOARD });
    if (url.startsWith('/api/authoring/docs?')) {
      // The document under review is NOT the editor's default (first) row.
      return ok({ documents: [
        { id: OTHER_DOC, title: 'Nonclinical Overview', module: 'M2', product_code: null, status: 'draft', updated_at: null, section_count: 1 },
        { id: DOC, title: 'Clinical Overview §2.5', module: 'M2', product_code: null, status: 'IN_REVIEW', updated_at: null, section_count: 1 },
      ] });
    }
    if (url === `/api/authoring/docs/${OTHER_DOC}/sections`) {
      return ok({ sections: [{ id: 'S-OTHER', doc_id: OTHER_DOC, code: '2.4', title: 'Nonclinical', content: '<p>Default document.</p>', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: null }] });
    }
    if (url === `/api/authoring/docs/${DOC}/sections`) {
      return ok({ sections: [{ id: SECTION, doc_id: DOC, code: '2.5.1', title: 'Rationale', content: '<p>The pivotal study met its primary endpoint.</p>', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: null }] });
    }
    return ok({ success: true, data: [], sources: [], revisions: [], comments: [] });
  });
}

/* Found by the names a reviewer reads, so the same test runs against the board
   before this change (which had both buttons) and fails on what they did. */
const openInEditor = () => screen.findByRole('button', { name: /Open in editor/ });
const signButton = () => screen.findByRole('button', { name: /Open the document to sign|Sign in the authoring workspace/ });

const reviewProps = () => ({ surface: { id: 'review', label: 'Review & approval' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

beforeEach(() => {
  BOARD = board();
  clearEditorTarget();
  try { sessionStorage.clear(); } catch { /* no storage */ }
  (window as any).C2C_PROJECT = { id: PROGRAM, title: 'NDA 200100', code: 'C2C-101' };
  mockApi();
});
afterEach(() => {
  cleanup();
  clearEditorTarget();
  delete (window as any).C2C_PROJECT;
});

describe('Review board — opening the document under review', () => {
  it('"Open in editor" sets the editor target to the document id, then opens the editor', async () => {
    const p = reviewProps();
    render(<Review {...p} />);
    fireEvent.click(await openInEditor());
    expect(peekEditorTarget()?.docId).toBe(DOC);
    expect(p.onNav).toHaveBeenCalledWith('document-authoring');
    // The program was already open: it is left as it was, details and all.
    expect((window as any).C2C_PROJECT).toEqual({ id: PROGRAM, title: 'NDA 200100', code: 'C2C-101' });
  });

  it('the sign-off button opens the document to sign, not the editor’s list', async () => {
    const p = reviewProps();
    render(<Review {...p} />);
    const sign = await signButton();
    fireEvent.click(sign);
    expect(peekEditorTarget()).toMatchObject({ docId: DOC, programId: PROGRAM, programTitle: 'NDA 200100' });
    expect(p.onNav).toHaveBeenCalledWith('document-authoring');
    // It says what it does: it opens the document, where the signature is applied.
    expect(sign.textContent).toContain('Open the document to sign');
  });

  it('a document in another program opens that program first, so the editor can see it', async () => {
    (window as any).C2C_PROJECT = { id: ANOTHER_PROGRAM, title: 'IND 140001', code: 'OTHER' };
    const p = reviewProps();
    render(<Review {...p} />);
    fireEvent.click(await openInEditor());
    expect((window as any).C2C_PROJECT).toEqual({ id: PROGRAM, title: 'NDA 200100' });
    expect(peekEditorTarget()?.docId).toBe(DOC);
  });

  it('the editor then opens on that document, not on its default first row', async () => {
    const p = reviewProps();
    render(<Review {...p} />);
    fireEvent.click(await openInEditor());
    cleanup();
    const authoringProps = { surface: { id: 'document-authoring', label: 'Authoring' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' } as any;
    render(<DocumentAuthoring {...authoringProps} />);
    expect(await screen.findByText(/Opened “Clinical Overview §2\.5” — the linked document/)).toBeTruthy();
    await waitFor(() => expect(apiRequest.mock.calls.some(c => c[1] === `/api/authoring/docs/${DOC}/sections`)).toBe(true));
    expect(screen.queryByText(/Couldn’t open/)).toBeNull();
  });

  it('an AI comment’s button is named for what it does: it opens the document, it applies nothing', async () => {
    BOARD = { ...board(), thread: [{ id: 'c-ai', author: 'AnA', role: 'AI reviewer', when: 'today', state: 'open', body: 'Cite the CSR table for the endpoint.', ai: true, sectionId: SECTION, parentId: null }] };
    const p = reviewProps();
    render(<Review {...p} />);
    await screen.findByText('Cite the CSR table for the endpoint.');
    expect(screen.queryByRole('button', { name: 'Apply in editor' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open the document' }));
    expect(peekEditorTarget()?.docId).toBe(DOC);
    expect(p.onNav).toHaveBeenCalledWith('document-authoring');
  });
});
