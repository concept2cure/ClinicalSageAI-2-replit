// @vitest-environment jsdom
/**
 * The audit rail — §11.10(e) made readable.
 *
 * GET /docs/:docId/audit has served the document's Part 11 audit trail since
 * the authoring store shipped — actor, role, operation, reason, before/after
 * content hashes — and no surface ever called it: the record the regulation
 * requires was being written and could not be reviewed. These tests pin the
 * rail that closes that, and its honesty seams: a failed read renders as a
 * failure to READ (never as "no governed acts occurred"), and an unknown
 * operation type is humanized, never hidden.
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

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload } as Response);
const fail = (status: number) =>
  ({ ok: false, status, json: async () => ({ error: 'nope' }) } as Response);

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
const AUDIT = {
  success: true,
  events: [
    {
      id: 'a1', section_id: 'S1', event_type: 'EDIT', actor: 'ra@example.test', actor_role: 'RA_CMC',
      change_reason: 'Tightened the impurity discussion.',
      content_hash_before: 'aaaa1111bbbb2222', content_hash_after: 'cccc3333dddd4444',
      created_at: '2026-08-24T10:00:00Z',
    },
    {
      id: 'a2', section_id: null, event_type: 'SOME_NEW_OP', actor: 'qa@example.test', actor_role: null,
      change_reason: null, content_hash_before: null, content_hash_after: null,
      created_at: '2026-08-24T09:00:00Z',
    },
  ],
};

function props() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' };
}

function wire(auditRes: Response) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    if (method === 'GET' && url.startsWith('/api/authoring/docs/D1/audit')) return auditRes;
    return ok({ success: true, revisions: [], comments: [], sources: [] });
  });
}

async function openAuditRail() {
  render(<DocumentAuthoring {...props()} />);
  const btn = await screen.findByRole('button', { name: /audit/i });
  fireEvent.click(btn);
}

beforeEach(() => {
  apiRequest.mockReset();
  try { localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => cleanup());

describe('the audit rail reads the real record', () => {
  it('renders the server’s events — actor, role, operation, reason, hashes, section link', async () => {
    wire(ok(AUDIT));
    await openAuditRail();

    expect(await screen.findByText('ra@example.test')).toBeTruthy();
    expect(screen.getByText('RA_CMC')).toBeTruthy();
    expect(screen.getByText(/content saved/)).toBeTruthy();
    expect(screen.getByText('Tightened the impurity discussion.')).toBeTruthy();
    // Hash chips: truncated on screen, full values in the tooltip.
    expect(screen.getByText(/aaaa1111\s*→\s*cccc3333/)).toBeTruthy();
    // The event's section resolves to a jump affordance.
    expect(screen.getByRole('button', { name: /§3\.2\.S\.1/ })).toBeTruthy();
    // The unknown operation is humanized, never dropped.
    expect(screen.getByText(/some new op/)).toBeTruthy();
  });

  it('a failed read is a failure to READ — never "no governed acts occurred"', async () => {
    wire(fail(500));
    await openAuditRail();

    expect(await screen.findByText(/Couldn’t load the audit trail/)).toBeTruthy();
    expect(screen.getByText(/does not mean no governed acts occurred/)).toBeTruthy();
    expect(screen.queryByText(/No audit events yet/)).toBeNull();
  });

  it('an empty trail says so honestly, as an empty — not an error', async () => {
    wire(ok({ success: true, events: [] }));
    await openAuditRail();

    expect(await screen.findByText(/No audit events yet/)).toBeTruthy();
    expect(screen.queryByText(/Couldn’t load the audit trail/)).toBeNull();
  });
});
