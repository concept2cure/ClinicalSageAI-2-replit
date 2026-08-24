// @vitest-environment jsdom
/**
 * Document-wide source re-read — and the number that must not be swallowed.
 *
 * POST /docs/:docId/refresh-all re-resolves every unfrozen citation in a
 * document against its stored source, and answers with three separate facts:
 * how many it refreshed, how many of those had CHANGED, and which it could not
 * refresh and why. It had no caller.
 *
 * The tempting summary is "re-read N citations". It is also the dishonest one:
 * a citation whose source no longer exists is precisely what the person about
 * to export or sign this document needs to see, and folding it into the success
 * count hides it. `skipped` therefore gets its own persistent surface on the
 * rail rather than a toast that fades in four seconds.
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

const ok = (payload: unknown) =>
  ({ ok: true, status: 200, json: async () => payload }) as Response;

const DOCS = {
  success: true,
  documents: [
    { id: 'D1', title: 'Quality Overall Summary', module: 'M3', product_code: 'ABC', status: 'draft', updated_at: null, section_count: 1 },
  ],
};
const SECTIONS = {
  success: true,
  sections: [
    { id: 'S1', doc_id: 'D1', code: '3.2.S.1', title: 'General Information', content: '<p>Text.</p>', order_index: 0, comment_count: 0, revision_count: 1, citation_count: 2, updated_at: null },
  ],
};

function props() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' };
}

/** Wire the surface, with refresh-all answering `refreshResult`. */
function wire(refreshResult: unknown) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    if (method === 'POST' && url.includes('/refresh-all')) return ok(refreshResult);
    return ok({ success: true, revisions: [], comments: [], sources: [], events: [], citations: [] });
  });
}

async function openSourcesAndRefresh() {
  render(<DocumentAuthoring {...props()} />);
  fireEvent.click(await screen.findByTestId('sources-rail-open'));
  const btn = (await screen.findByTestId('refresh-all-sources')) as HTMLButtonElement;
  await waitFor(() => expect(btn.disabled).toBe(false));
  fireEvent.click(btn);
  return btn;
}

beforeEach(() => {
  apiRequest.mockReset();
  try { localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => cleanup());

describe('document-wide source re-read', () => {
  it('surfaces citations it could NOT re-read, with the server’s reason', async () => {
    wire({
      ok: true,
      refreshed: 5,
      changed: 1,
      skipped: [
        { cite_id: 'c9', reason: 'source no longer exists' },
        { cite_id: 'c10', reason: 'source is frozen' },
      ],
    });
    await openSourcesAndRefresh();

    const panel = await screen.findByTestId('refresh-skipped');
    expect(panel.textContent).toMatch(/2 citations could not be re-read/i);
    // The reason is the finding — not a count.
    expect(panel.textContent).toMatch(/source no longer exists/);
    expect(panel.textContent).toMatch(/source is frozen/);
  });

  it('shows nothing alarming when every citation re-read cleanly', async () => {
    wire({ ok: true, refreshed: 4, changed: 0, skipped: [] });
    await openSourcesAndRefresh();

    await waitFor(() => expect(apiRequest.mock.calls.some(c => String(c[1]).includes('/refresh-all'))).toBe(true));
    expect(screen.queryByTestId('refresh-skipped')).toBeNull();
  });

  it('posts to the document, not the section — the question is document-wide', async () => {
    wire({ ok: true, refreshed: 0, changed: 0, skipped: [] });
    await openSourcesAndRefresh();

    await waitFor(() => {
      const call = apiRequest.mock.calls.find(c => String(c[1]).includes('/refresh-all'));
      expect(call).toBeTruthy();
      expect(String(call![1])).toBe('/api/authoring/docs/D1/refresh-all');
    });
  });

  it('a refusal changes nothing and says so', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
      if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
      if (method === 'POST' && url.includes('/refresh-all')) {
        return { ok: false, status: 500, json: async () => ({ error: 'Refresh-all failed' }) } as Response;
      }
      return ok({ success: true, revisions: [], comments: [], sources: [], events: [], citations: [] });
    });
    await openSourcesAndRefresh();

    // No findings panel is shown for a call that never produced findings.
    await waitFor(() =>
      expect(apiRequest.mock.calls.some(c => String(c[1]).includes('/refresh-all'))).toBe(true),
    );
    expect(screen.queryByTestId('refresh-skipped')).toBeNull();
  });
});
