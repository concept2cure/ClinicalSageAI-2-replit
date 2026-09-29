// @vitest-environment jsdom
/**
 * The decision POST names the AnA turn that proposed the words.
 *
 * suggestionSourceRecord.test.ts pins the editor half: the insertion mark
 * carries `data-source-record`, the review strip keeps two turns apart, and
 * `decisionOf` copies the id. This file pins the host half — that
 * DocumentWorkbench's decision flush actually puts the id on the wire, for a
 * single decision and for "Accept all" / "Reject all" — driven through the
 * real surface: stored section HTML → the canvas → the review strip's own
 * buttons → the POST body. No editor command is called directly.
 *
 * The server (authoring.router.ts, describeTrackedChange) verifies the id
 * against ana_turn_records for the tenant; the client only has to send it,
 * and to send nothing for a human's change rather than a guess.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
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

const TURN_A = '6f1c2a4e-9b3d-4e21-8a7f-0c5d1e2b3a41';
const TURN_B = 'b2e7d9f0-1a3c-4b5d-9e8f-7a6b5c4d3e21';
const AT = '2026-09-26T10:05:00Z';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;

/** An `<ins>` as the insertion mark renders one. */
function ana(text: string, sourceRecord: string): string {
  return (
    `<ins data-author-id="ana" data-author-name="AnA (AI draft)" data-at="${AT}" ` +
    `data-source-record="${sourceRecord}" class="rse-ins">${text}</ins>`
  );
}
function human(text: string): string {
  return (
    `<ins data-author-id="author@test.co" data-author-name="Test Author" data-at="${AT}" ` +
    `class="rse-ins">${text}</ins>`
  );
}

let sectionContent = '';

function mockApi() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) {
      return ok({
        success: true,
        documents: [
          {
            id: 'D1',
            title: 'Quality Overall Summary',
            module: 'M2',
            product_code: 'ABC',
            status: 'draft',
            updated_at: AT,
            section_count: 1,
          },
        ],
      });
    }
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') {
      return ok({
        success: true,
        sections: [
          {
            id: 'S1',
            doc_id: 'D1',
            code: '2.3.P.8',
            title: 'Stability',
            content: sectionContent,
            order_index: 0,
            comment_count: 0,
            revision_count: 1,
            citation_count: 0,
            updated_at: AT,
          },
        ],
      });
    }
    if (method === 'GET' && url.startsWith('/api/authoring/sections/'))
      return ok({ success: true, revisions: [], sources: [], citations: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments'))
      return ok({ success: true, comments: [] });
    return ok({ success: true });
  });
}

const props = () => ({
  surface: { id: 'document-authoring', label: 'Authoring' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

function decisionPosts(): Array<[string, string, Record<string, unknown>]> {
  return apiRequest.mock.calls.filter(
    (c) => c[0] === 'POST' && String(c[1]).includes('/tracked-change-decisions'),
  ) as Array<[string, string, Record<string, unknown>]>;
}

/** Open the review strip from the ribbon chip and return it. */
async function openReviewStrip(count: number): Promise<HTMLElement> {
  const chip = await screen.findByRole('button', {
    name: `${count} suggested edit${count === 1 ? '' : 's'}`,
  });
  fireEvent.click(chip);
  return screen.findByRole('region', { name: 'Suggested edits' });
}

/** The review-strip row whose text reads `text`. */
function rowFor(strip: HTMLElement, text: string): HTMLElement {
  const row = Array.from(strip.querySelectorAll<HTMLElement>('.rse-review-row')).find(
    (r) => r.querySelector('.rse-review-txt')?.textContent === text,
  );
  if (!row) throw new Error(`no review row reading ${JSON.stringify(text)}`);
  return row;
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
    vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({}) })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the tracked-change decision POST carries the AnA turn record', () => {
  it('a single accept sends the turn record of the suggestion that was accepted', async () => {
    sectionContent = `<p>Shelf life is supported. ${ana('Three registration batches were placed on study.', TURN_A)}</p>`;
    render(<DocumentAuthoring {...props()} />);
    const strip = await openReviewStrip(1);
    fireEvent.click(
      within(rowFor(strip, 'Three registration batches were placed on study.')).getByRole('button', {
        name: 'Accept',
      }),
    );

    await waitFor(() => expect(decisionPosts()).toHaveLength(1));
    const [, url, body] = decisionPosts()[0];
    expect(url).toBe('/api/authoring/documents/D1/tracked-change-decisions');
    expect(body).toMatchObject({
      decision: 'accept',
      sectionId: 'S1',
      changeType: 'insertion',
      text: 'Three registration batches were placed on study.',
      authorId: 'ana',
      authorName: 'AnA (AI draft)',
      at: AT,
      sourceRecord: TURN_A,
    });
    expect(String(body.changeId)).toMatch(/^insertion:/);
  });

  it('two adjacent drafts from two turns are two rows, and each decision names its own turn', async () => {
    sectionContent = `<p>${ana('Long-term data cover 24 months.', TURN_A)}${ana(' Accelerated data cover 6 months.', TURN_B)}</p>`;
    render(<DocumentAuthoring {...props()} />);
    const strip = await openReviewStrip(2);
    fireEvent.click(
      within(rowFor(strip, ' Accelerated data cover 6 months.')).getByRole('button', { name: 'Reject' }),
    );

    await waitFor(() => expect(decisionPosts()).toHaveLength(1));
    const [, , body] = decisionPosts()[0];
    expect(body).toMatchObject({
      decision: 'reject',
      text: ' Accelerated data cover 6 months.',
      sourceRecord: TURN_B,
    });
  });

  it('"Accept all" sends one bulk act whose every change names its own turn', async () => {
    sectionContent = `<p>${ana('Long-term data cover 24 months.', TURN_A)}${ana(' Accelerated data cover 6 months.', TURN_B)}</p>`;
    render(<DocumentAuthoring {...props()} />);
    const strip = await openReviewStrip(2);
    fireEvent.click(within(strip).getByRole('button', { name: 'Accept all' }));

    await waitFor(() => expect(decisionPosts()).toHaveLength(1));
    const [, url, body] = decisionPosts()[0];
    expect(url).toBe('/api/authoring/documents/D1/tracked-change-decisions/bulk');
    expect(body.decision).toBe('accept');
    expect(body.sectionId).toBe('S1');
    const changes = body.changes as Array<Record<string, unknown>>;
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => [c.text, c.sourceRecord]).sort()).toEqual(
      [
        ['Long-term data cover 24 months.', TURN_A],
        [' Accelerated data cover 6 months.', TURN_B],
      ].sort(),
    );
    // The ids the server upserts on are the ids the change details describe.
    expect([...(body.changeIds as string[])].sort()).toEqual(changes.map((c) => c.changeId).sort());
  });

  it('a human\'s change is sent with no turn record at all — never a guessed one', async () => {
    sectionContent = `<p>Shelf life is supported. ${human('Added by the author.')}</p>`;
    render(<DocumentAuthoring {...props()} />);
    const strip = await openReviewStrip(1);
    fireEvent.click(within(rowFor(strip, 'Added by the author.')).getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(decisionPosts()).toHaveLength(1));
    const [, , body] = decisionPosts()[0];
    expect(body).toMatchObject({ decision: 'reject', authorId: 'author@test.co', text: 'Added by the author.' });
    expect(body.sourceRecord).toBeUndefined();
    // Absent on the wire, not null and not an empty string.
    expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty('sourceRecord');
  });
});
