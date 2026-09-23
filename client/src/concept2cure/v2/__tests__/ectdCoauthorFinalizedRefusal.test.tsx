// @vitest-environment jsdom
/**
 * 2026-09-23 (W5/D7, round-3 review): an approved snapshot is read-only to
 * PUT /api/coauthor/documents/:id (409 FINALIZED_DOCUMENT_READ_ONLY — the rule
 * in server/services/coauthor/coauthor-status-write.ts). The Co-Author surface
 * opens approved documents in the same editor, so an author CAN hit that
 * refusal in normal use. This pins that the author is told why, in the
 * server's own words, through the real request chain (fetch -> apiRequest ->
 * liveMutateOrNull -> saveContent) — not a success, not a silent drop, and
 * not a generic sentence that hides where to go instead.
 *
 * Unlike ectdCoauthorNoFixtures.test.tsx this does not mock apiRequest: the
 * refusal copy has to survive apiRequest's serverMessage filter, which drops
 * a message that carries an API route.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import { EctdCoauthor } from '../surfaces/EctdCoauthor';

/* jsdom has no layout; same shim as ectdCoauthorNoFixtures.test.tsx. */
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

const props = () => ({
  surface: { id: 'ectd-coauthor', label: 'eCTD' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const APPROVED_DOC = {
  id: 7003,
  title: 'Integrated Summary of Safety',
  content: '<p>ISS narrative for ZX-9.</p>',
  status: 'approved',
  moduleNumber: '5.3',
  moduleName: 'Clinical Study Reports',
  updatedAt: '2026-07-10T00:00:00Z',
};

/** The body the server sends (shape of coauthor-status-write.ts readOnly()). */
const REFUSAL = {
  error: 'FINALIZED_DOCUMENT_READ_ONLY',
  // 2026-09-23 (W5/D7, round-3 review, repair 1): the copy named a path that
  // failed ("Edit the source authoring document and place it into the filing
  // again"); it now names re-placement, which works.
  message:
    'This document is approved and read-only: it is the copy placed into a filing as approved, and ' +
    'changing it here would file text other than the text that was approved. Its text comes from its source authoring ' +
    'document and changes only when that document is placed into the filing again, which re-takes ' +
    "this copy from the source's current text and status. Nothing was saved.",
  currentStatus: 'approved',
  governedPath: 'POST /api/coauthor/documents with sourceAuthoringDocId',
};

const puts: unknown[] = [];

beforeEach(() => {
  puts.length = 0;
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: unknown }) => {
      const method = (init?.method || 'GET').toUpperCase();
      const path = String(url).split('?')[0];
      if (method === 'GET' && path === '/api/coauthor/documents') {
        return json(200, { documents: [APPROVED_DOC], total: 1 });
      }
      if (method === 'PUT' && path === '/api/coauthor/documents/7003') {
        puts.push(JSON.parse(String(init?.body)));
        return json(409, REFUSAL);
      }
      return json(404, { error: 'Not found' });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('EctdCoauthor — a save refused because the document is approved', () => {
  it("shows the server's reason and where to go, and does not report the save as done", async () => {
    render(<EctdCoauthor {...props()} />);

    await waitFor(() => expect(document.querySelector('.rse-root .tiptap')).toBeTruthy());
    const el = document.querySelector('.rse-body .tiptap') as HTMLElement & {
      editor?: { chain: () => any };
    };
    el.editor!.chain().focus().insertContent(' Edited after approval.').run();

    const save = await waitFor(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        (x.textContent || '').includes('Save ('),
      ) as HTMLButtonElement | undefined;
      if (!b || b.disabled) throw new Error('save control not enabled yet');
      return b;
    });
    fireEvent.click(save);

    await waitFor(() => expect(puts).toHaveLength(1));
    const alert = await waitFor(() => {
      const a = Array.from(document.querySelectorAll('[role="alert"]')).find((x) =>
        (x.textContent || '').includes('Not saved'),
      );
      if (!a) throw new Error('no refusal shown');
      return a;
    });
    expect(alert.textContent).toContain('read-only');
    expect(alert.textContent).toContain('placed into the filing again');
    expect(document.body.textContent).not.toContain('All changes saved');
  });
});
