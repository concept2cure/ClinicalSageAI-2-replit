// @vitest-environment jsdom
/**
 * Comment threads — the rail is a conversation, not a guestbook.
 *
 * ── The defect these pin against ─────────────────────────────────────────────
 * The write endpoint has accepted `parent_comment_id` and the read has returned
 * nested `replies` since the duplicate-route collapse — and the rail rendered
 * neither: replies the server sent were silently dropped, and a reviewer's
 * question could only be "answered" by a new top-level comment above it.
 *
 * Pinned here: replies render under their thread; Reply posts into the THREAD
 * (parent_comment_id, the thread's own section — not whichever section the
 * author happens to have open); and a failed reply says so with nothing
 * mutated locally.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));

/* jsdom implements no layout — stub the geometry ProseMirror asks for. */
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

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}
function fail(status: number, error: string) {
  return { ok: false, status, json: async () => ({ success: false, error }) } as Response;
}

const DOCS = {
  success: true,
  documents: [{ id: 'D1', title: 'Nonclinical Overview', module: 'M3', product_code: 'ABC', status: 'draft', updated_at: '2026-07-20T10:00:00Z', section_count: 1 }],
};
const SECTIONS = {
  success: true,
  sections: [{ id: 'S1', doc_id: 'D1', code: '3.2.S.1', title: 'General Information', content: 'Substance description.', order_index: 0, comment_count: 1, revision_count: 1, citation_count: 0, updated_at: '2026-07-20T10:00:00Z' }],
};
/** The thread lives on a DIFFERENT section (CS1) from the open one (S1) — a
 *  reply must land on the thread's section, never the active one. */
const THREAD = {
  success: true,
  comments: [
    {
      id: 'C1', doc_id: 'D1', section_id: 'CS1',
      body: 'Justify the aggregation limit against batch history.',
      status: 'open', author_name: 'R. Reviewer',
      section_code: '3.2.S.4', section_title: 'Control of Drug Substance',
      created_at: '2026-08-23T10:00:00Z', anchor: null,
      replies: [
        { id: 'C1R1', doc_id: 'D1', section_id: 'CS1', body: 'Batch analyses for lots 1–6 attached.', status: 'open', author_name: 'A. Author', section_code: null, section_title: null, created_at: '2026-08-23T11:00:00Z' },
      ],
    },
  ],
};

function props() {
  return { surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' };
}

function wire(overrides?: (method: string, url: string, body?: unknown) => Response | null) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    const o = overrides?.(method, url, body);
    if (o) return o;
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    if (method === 'GET' && url.startsWith('/api/authoring/sections/S1/history')) return ok({ success: true, revisions: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments')) return ok(THREAD);
    return ok({ success: true });
  });
}

async function openCommentsRail() {
  render(<DocumentAuthoring {...props()} />);
  expect((await screen.findAllByText('Nonclinical Overview')).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: /Comments/ }));
  await screen.findByText('Justify the aggregation limit against batch history.');
}

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  wire();
});

describe('DocumentAuthoring — comment threads', () => {
  it('renders the server-nested replies under their thread', async () => {
    await openCommentsRail();
    // The reply is on screen, inside the thread's reply block, attributed.
    const reply = await screen.findByText('Batch analyses for lots 1–6 attached.');
    expect(reply.closest('.cmt-replies')).toBeTruthy();
    expect(screen.getByText('A. Author')).toBeTruthy();
    // And it is inside the SAME .cmt card as the head comment, not a sibling.
    const head = screen.getByText('Justify the aggregation limit against batch history.');
    expect(reply.closest('.cmt')).toBe(head.closest('.cmt'));
  });

  it("Reply posts into the thread — parent id and the THREAD's section, then reloads", async () => {
    const posts: Array<{ url: string; body: unknown }> = [];
    wire((method, url, body) => {
      if (method === 'POST' && url === '/api/authoring/sections/CS1/comment') {
        posts.push({ url, body });
        return ok({ success: true, comment: { id: 'C1R2' } });
      }
      return null;
    });
    await openCommentsRail();

    // The affordance's accessible name is its text ("Reply"); the title
    // disambiguates it from the submit button that replaces it once open.
    fireEvent.click(screen.getByTitle('Reply into this thread'));
    fireEvent.change(screen.getByLabelText('Reply to R. Reviewer'), {
      target: { value: 'Lot 7 data lands Friday.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toMatchObject({
      body: 'Lot 7 data lands Friday.',
      doc_id: 'D1',
      parent_comment_id: 'C1',
    });
    // Confirmed, and the thread reloads from the server rather than being
    // fabricated locally.
    await screen.findByText('Reply added to the thread.');
    const commentReads = apiRequest.mock.calls.filter(
      (c) => c[0] === 'GET' && String(c[1]).startsWith('/api/authoring/documents/D1/comments'),
    );
    expect(commentReads.length).toBeGreaterThanOrEqual(2);
  });

  it('a refused reply is reported and nothing local changes', async () => {
    wire((method, url) => {
      if (method === 'POST' && url === '/api/authoring/sections/CS1/comment') {
        return fail(500, 'store unavailable');
      }
      return null;
    });
    await openCommentsRail();

    fireEvent.click(screen.getByTitle('Reply into this thread'));
    fireEvent.change(screen.getByLabelText('Reply to R. Reviewer'), {
      target: { value: 'This will not land.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));

    await screen.findByText(/Couldn’t post the reply — store unavailable/);
    // The draft stays in the box for retry; the thread still shows exactly the
    // one server-confirmed reply.
    expect((screen.getByLabelText('Reply to R. Reviewer') as HTMLTextAreaElement).value).toBe('This will not land.');
    expect(document.querySelectorAll('.cmt-reply')).toHaveLength(1);
  });
});
