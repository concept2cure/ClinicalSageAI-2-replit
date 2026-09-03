// @vitest-environment jsdom
/**
 * DocumentAuthoring — reads that have not settled are not rendered as facts.
 *
 * The editor host conflated "not read yet" / "read failed" with "empty" in
 * four places a reviewer relies on:
 *   • the assembled Document view said "This document has no sections yet"
 *     for the whole of every sections read (every open, every reorder);
 *   • the document masthead printed "0 sections" over a failed read, directly
 *     above a body that said the read failed;
 *   • the tree header printed "0 documents · all" directly above
 *     "Couldn't load documents";
 *   • the History rail said "No prior revisions" for the whole of its GET, and
 *     a rename on a 401 wrote the client's code/title into the tree and toasted
 *     "Section renamed" over a rename the server refused.
 * Revert-proven: each case fails with its guard removed.
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
  useAuth: () => ({ user: { id: '7', email: 'ra@example.test', displayName: 'R. Author' } }),
}));

/* jsdom has no layout; ProseMirror asks for client rects on mount. */
const emptyRects = function () {
  return [] as unknown as DOMRectList;
};
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload } as Response);
const fail = (status: number) => ({ ok: false, status, json: async () => ({ error: 'nope' }) } as Response);
const never = () => new Promise<Response>(() => {});

const DOCS = {
  success: true,
  documents: [
    { id: 'D1', title: 'Nonclinical Overview', module: 'M3', product_code: 'ABC', status: 'draft', updated_at: null, section_count: 1 },
  ],
};
const SECTIONS = {
  success: true,
  sections: [
    { id: 'S1', doc_id: 'D1', code: '3.2.S.1', title: 'General Information', content: '<p>Text.</p>', order_index: 0, comment_count: 0, revision_count: 1, citation_count: 0, updated_at: null },
  ],
};

function props() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' };
}

type Route = (method: string, url: string) => Response | Promise<Response> | undefined;
function wire(route: Route) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    const r = route(method, String(url ?? ''));
    if (r) return r;
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    return ok({ success: true, revisions: [], comments: [], sources: [] });
  });
}

const text = () => document.body.textContent ?? '';

beforeEach(() => {
  apiRequest.mockReset();
  try { localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => cleanup());

describe('DocumentAuthoring — unsettled reads are not rendered as facts', () => {
  it('the Document view says the sections are being read, never "no sections yet", while the read is in flight', async () => {
    wire((m, u) => (m === 'GET' && u === '/api/authoring/docs/D1/sections' ? never() : undefined));
    render(<DocumentAuthoring {...props()} />);
    fireEvent.click(await screen.findByTitle('Read the whole document'));
    await waitFor(() => expect(text()).toMatch(/Reading this document’s sections/));
    expect(text()).not.toMatch(/This document has no sections yet/);
    expect(text()).not.toMatch(/0 sections/);
  });

  it('the masthead never prints "0 sections" over a failed sections read', async () => {
    wire((m, u) => (m === 'GET' && u === '/api/authoring/docs/D1/sections' ? fail(500) : undefined));
    render(<DocumentAuthoring {...props()} />);
    fireEvent.click(await screen.findByTitle('Read the whole document'));
    await waitFor(() => expect(text()).toMatch(/Couldn’t read this document’s sections/));
    expect(text()).toMatch(/sections not read/);
    expect(text()).not.toMatch(/0 sections/);
  });

  it('the tree header never prints "0 documents" over a failed documents read', async () => {
    wire((m, u) => (m === 'GET' && u.startsWith('/api/authoring/docs?') ? fail(500) : undefined));
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(text()).toMatch(/documents not read/));
    expect(text()).not.toMatch(/0 documents/);
  });

  it('the History rail says it is reading, never "No prior revisions", while its read is in flight', async () => {
    wire((m, u) => (m === 'GET' && /\/api\/authoring\/sections\/S1\/history/.test(u) ? never() : undefined));
    render(<DocumentAuthoring {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /History/ }));
    await waitFor(() => expect(text()).toMatch(/Reading revision history/));
    expect(text()).not.toMatch(/No prior revisions/);
  });
  it('a rename refused with a 401 changes nothing and never says "Section renamed"', async () => {
    // apiRequest RETURNS a 401 rather than throwing it; the handler leaned on
    // the throw alone and adopted the client's code/title on that path.
    wire((m, u) => (m === 'PATCH' && u === '/api/authoring/sections/S1' ? fail(401) : undefined));
    render(<DocumentAuthoring {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /^.*Rename$/ }));
    const code = await screen.findByLabelText('Section code');
    fireEvent.change(code, { target: { value: '3.2.S.9' } });
    fireEvent.click(screen.getByRole('button', { name: /^Rename$/ }));
    await waitFor(() => expect(text()).toMatch(/Not renamed/));
    expect(text()).not.toMatch(/Section renamed/);
    expect(text()).not.toMatch(/3\.2\.S\.9/);
  });
});
