// @vitest-environment jsdom
/**
 * A co-author document that carries a verdict opens read-only (2026-10-01,
 * D5; editor-family review P11-B-3).
 *
 * The server refuses every change to an approved, finalized, signed or locked
 * row's text (409 FINALIZED_DOCUMENT_READ_ONLY, coauthor-status-write.ts rule
 * 3), yet the surface opened such a row in an editable canvas with an enabled
 * Save: the author could type, ask for a reason, and only then be refused.
 * The server now marks each row `readOnly` by its own rule
 * (withCoauthorReadOnly), and the surface opens that row read-only, says why,
 * and asks for no reason.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
        return json(200, { documents: [{ ...APPROVED_DOC, readOnly: true }], total: 1 });
      }
      if (method === 'PUT') puts.push(JSON.parse(String(init?.body)));
      return json(404, { error: 'Not found' });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('EctdCoauthor — a verdict row', () => {
  it('opens read-only: no editable canvas, no Save, no reason asked for, and the reason why', async () => {
    render(<EctdCoauthor {...props()} />);

    await waitFor(() => expect(document.querySelector('.rse-root .tiptap')).toBeTruthy());
    const canvas = document.querySelector('.rse-body .tiptap') as HTMLElement;
    expect(canvas.getAttribute('contenteditable')).toBe('false');
    expect(
      Array.from(document.querySelectorAll('button')).some((b) => (b.textContent || '').includes('Save (')),
      'a Save the server can only refuse is offered',
    ).toBe(false);
    expect(screen.queryByLabelText(/^Reason for change/)).toBeNull();
    expect(screen.getByRole('note').textContent).toMatch(/approved and read-only here/);
    expect(puts).toEqual([]);
  });
});
