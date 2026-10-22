// @vitest-environment jsdom
/**
 * A refused save must not cost the attribution (AnA reasoning round 15,
 * SEC-A-7 door 1).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Accepting an AnA suggestion strips the mark that named its author, so the
 * editor keeps the attribution in the track-changes store and the save carries
 * it to the server (`acceptedAuthors`, `acceptedMachineText`). Both were read
 * AND CLEARED before the PATCH was sent, and `apiRequest` throws on every
 * non-2xx — so any refused save EMPTIED the store. The retry then sent the
 * same words with no attribution at all, and the governed record said a human
 * wrote AnA's clauses, permanently, inside an append-only hash chain.
 *
 * This is not hypothetical and it needs no bad actor. Five refusals already
 * arrive after the clear on this very door: a frozen document, no edit
 * permission, a 409 when a colleague saved the same section first, a figure
 * that is not an uploaded one, and a lineage failure. The collision is the
 * ordinary case — two authors on one CTD section is the normal way a module is
 * written — and it silently laundered an AnA clause into a human's lineage.
 *
 * Nothing else can recover it: the device cache holds only the serialized
 * content (`cacheDraft`), and accepting removed the marks, so the client
 * cannot re-derive the attribution from the document either.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * The store is cleared by a save that LANDED. A save that was refused leaves
 * it exactly as it was, so the retry carries the same claim — and
 * `settleAcceptedContributions` still drops anything the document no longer
 * holds, so keeping it cannot make the claim stale.
 *
 * This is also the precondition for refusing a save over the governed-write
 * rule at all: a refusal that destroys the claim would manufacture the
 * laundering it exists to prevent.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
/* The real class, so the fixture fails the way production fails. */
import { ApiRequestError } from '@/lib/queryClient';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return {
    ...actual,
    authService: {
      getUser: () => ({ id: 1, organizationId: 1 }),
      captureSessionReadGuard: actual.authService.captureSessionReadGuard.bind(actual.authService),
      on: actual.authService.on.bind(actual.authService),
    },
    useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
  };
});

/* jsdom implements no layout; ProseMirror's scroll-into-view asks for client
   rects and crashes the worker when a node type lacks the method. */
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

const TURN = '6f1c2a4e-9b3d-4e21-8a7f-0c5d1e2b3a41';
const AT = '2026-09-26T10:05:00Z';
const DRAFT = 'Three registration batches were placed on study.';
const REASON = 'Accepted the stability summary AnA drafted.';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;

/** Section HTML holding one AnA insertion, as the insertion mark renders it. */
const CONTENT =
  `<p>Shelf life is supported. <ins data-author-id="ana" data-author-name="AnA (AI draft)" ` +
  `data-at="${AT}" data-source-record="${TURN}" class="rse-ins">${DRAFT}</ins></p>`;

const DOCS = {
  success: true,
  documents: [{ id: 'D1', title: 'Quality Overall Summary', module: 'M2', product_code: 'ABC', status: 'draft', updated_at: AT, section_count: 1 }],
};
const sections = () => ({
  success: true,
  sections: [{ id: 'S1', doc_id: 'D1', code: '2.3.P.8', title: 'Stability', content: CONTENT, order_index: 0, comment_count: 0, revision_count: 1, citation_count: 0, updated_at: AT }],
});

const props = () => ({
  surface: { id: 'document-authoring', label: 'Authoring' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

/** How the next PATCH answers: null for 200, or the refusal to throw. */
let patchRefusal: ApiRequestError | null = null;
const patches = () =>
  apiRequest.mock.calls.filter((c) => c[0] === 'PATCH' && c[1] === '/api/authoring/sections/S1') as Array<
    [string, string, Record<string, unknown>]
  >;

beforeEach(() => {
  patchRefusal = null;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(sections());
    if (method === 'GET' && url.startsWith('/api/authoring/sections/')) return ok({ success: true, revisions: [], sources: [], citations: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments')) return ok({ success: true, comments: [] });
    if (method === 'PATCH' && url === '/api/authoring/sections/S1') {
      if (patchRefusal) throw patchRefusal;
      return ok({ success: true, revision_created: true, section: { ...sections().sections[0], revision_count: 2 } });
    }
    return ok({ success: true });
  });
  try { localStorage.clear(); } catch { /* ignore */ }
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Open the review strip from the ribbon chip. */
async function openReviewStrip(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: '1 suggested edit' }));
  return screen.findByRole('region', { name: 'Suggested edits' });
}

/** Accept AnA's one suggestion through the review strip, as a reviewer does. */
async function acceptAnaDraft(): Promise<void> {
  const strip = await openReviewStrip();
  const row = Array.from(strip.querySelectorAll<HTMLElement>('.rse-review-row')).find(
    (r) => r.querySelector('.rse-review-txt')?.textContent === DRAFT,
  );
  if (!row) throw new Error('no review row for the AnA draft');
  fireEvent.click(within(row).getByRole('button', { name: 'Accept' }));
  await waitFor(() =>
    expect(
      apiRequest.mock.calls.some((c) => String(c[1]).includes('/tracked-change-decisions')),
      'the accept was never recorded',
    ).toBe(true),
  );
}

/** State a reason and press Save. */
async function save(): Promise<void> {
  const field = await waitFor(() => screen.getByTestId('change-reason') as HTMLInputElement);
  fireEvent.change(field, { target: { value: REASON } });
  const button = () => screen.getByRole('button', { name: /^Save/i }) as HTMLButtonElement;
  await waitFor(() => expect(button().disabled).toBe(false));
  fireEvent.click(button());
}

/** The live canvas editor, so a second save has something to save. */
function canvasEditor(): Editor {
  const el = document.querySelector<HTMLElement & { editor?: Editor }>('.rse-body .tiptap');
  if (!el?.editor) throw new Error('editor not mounted');
  return el.editor;
}

/** The machine-text claim a PATCH body carries. */
function claimOf(body: Record<string, unknown>) {
  return {
    authors: (body.acceptedAuthors ?? null) as Array<{ id: string }> | null,
    text: (body.acceptedMachineText ?? null) as Array<{ authorId: string; turnRecordId: string | null }> | null,
  };
}

describe('the attribution survives a refused save', () => {
  it('a 409 collision does not cost it: the retry still names AnA and the turn', async () => {
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: '1 suggested edit' })).toBeTruthy());
    await acceptAnaDraft();

    /* A colleague saved the same section first — the ordinary case, and the
       one that laundered the clause with no refusal of this door's own. */
    patchRefusal = new ApiRequestError('This section was changed by someone else', 409, {}, 'SECTION_CHANGED');
    await save();
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(claimOf(patches()[0][2]).text, 'the first save carried no claim at all').toEqual([
      { authorId: 'ana', text: DRAFT, turnRecordId: TURN },
    ]);

    patchRefusal = null;
    await save();
    await waitFor(() => expect(patches()).toHaveLength(2));
    const retry = claimOf(patches()[1][2]);
    expect(retry.text, 'the retry lost the words AnA wrote').toEqual([
      { authorId: 'ana', text: DRAFT, turnRecordId: TURN },
    ]);
    expect(retry.authors?.map((a) => a.id), 'the retry lost the contributor').toEqual(['ana']);
  });

  it('the governed-write refusal does not cost it either, and its sentence is shown', async () => {
    /* The sixth refusal, and the one round 15 adds: the server verified the
       claim and RULE 2 does not admit the model that served the turn. The save
       is refused whole — so this branch MUST keep the claim, or the refusal
       would manufacture the laundering it exists to prevent. */
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: '1 suggested edit' })).toBeTruthy());
    await acceptAnaDraft();

    const sentence =
      'This section was not saved, and nothing was changed. one passage in it was drafted by ' +
      'anthropic/claude-sonnet-5, which is not approved for regulatory drafting';
    patchRefusal = new ApiRequestError(
      sentence,
      403,
      { success: false, error: { code: 'MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE', message: sentence } },
      'MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE',
    );
    await save();
    await waitFor(() => expect(patches()).toHaveLength(1));
    /* The author reads the server's own sentence, naming the model. */
    await waitFor(() => expect(screen.getByText(new RegExp('not approved for regulatory drafting'))).toBeTruthy());

    patchRefusal = null;
    await save();
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(claimOf(patches()[1][2]).text).toEqual([{ authorId: 'ana', text: DRAFT, turnRecordId: TURN }]);
  });

  it('a save that landed does clear it: the next save claims nothing', async () => {
    /* The other half of the rule, and the one that keeps the record honest in
       the opposite direction: an accepted insertion is carried in by ONE save,
       not re-credited by every later save of the section. */
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: '1 suggested edit' })).toBeTruthy());
    await acceptAnaDraft();

    await save();
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(claimOf(patches()[0][2]).text).toHaveLength(1);

    /* Something else to save, or there is no second save to make. */
    canvasEditor().chain().focus().insertContent(' Batch 3 is ongoing.').run();
    await save();
    await waitFor(() => expect(patches()).toHaveLength(2));
    const second = claimOf(patches()[1][2]);
    expect(second.text, 'the same acceptance was claimed twice').toBeNull();
    expect(second.authors).toBeNull();
  });
});

describe('a claim the record could not vouch for is reported to the saver', () => {
  it('says which passages became the saver’s own words, and why', async () => {
    /* The server saved the text and recorded the clause as this person's
       assertion, because no turn record held the words. An ordinary "Section
       saved" would leave them believing AnA is still credited. */
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: '1 suggested edit' })).toBeTruthy());
    await acceptAnaDraft();

    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
      if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(sections());
      if (method === 'GET' && url.startsWith('/api/authoring/sections/')) return ok({ success: true, revisions: [], sources: [], citations: [] });
      if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments')) return ok({ success: true, comments: [] });
      if (method === 'PATCH' && url === '/api/authoring/sections/S1') {
        return ok({
          success: true,
          revision_created: true,
          section: { ...sections().sections[0], revision_count: 2 },
          machineText: { credited: 0, refused: [{ why: 'the turn record does not hold this text', chars: DRAFT.length }] },
        });
      }
      return ok({ success: true });
    });

    await save();
    await waitFor(() => expect(patches()).toHaveLength(1));
    await waitFor(() =>
      expect(
        screen.getByText(/One passage you accepted from AnA was recorded as your own words, because the turn record does not hold this text/),
      ).toBeTruthy(),
    );
  });
});
